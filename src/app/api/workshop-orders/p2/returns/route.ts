import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveVerifiedSupabaseIdentity } from '@/lib/auth/supabase-identity';
import {
  isApprovedWosSandboxUrl,
  isWosNonproductionApiEnabled,
} from '@/lib/workshop-orders/api-contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store, private' } as const;
function answer(status:number, code:string, data:unknown=null) {
  return NextResponse.json({ ok:status===200, code, data }, { status, headers });
}

/** Office returned-order lookup; read-only even while P2 QA writes are off. */
export async function GET() {
  if (!isWosNonproductionApiEnabled({
    vercelEnv:process.env.VERCEL_ENV,
    nodeEnv:process.env.NODE_ENV,
    enabled:process.env.WOS_P5C_NONPROD_API_ENABLED,
  }) || !isApprovedWosSandboxUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
      || process.env.VERCEL_ENV!=='preview') {
    return answer(503,'NONPRODUCTION_ONLY_DISABLED');
  }
  const db=await createClient();
  if (!db) return answer(503,'QA_DATABASE_UNAVAILABLE');
  const identity=await resolveVerifiedSupabaseIdentity(db);
  if (!identity) return answer(401,'UNAUTHENTICATED');
  const p=await db.from('profiles').select('id,org_id,user_id,is_active,role')
    .eq('user_id',identity.id).eq('is_active',true).maybeSingle();
  if (p.error || !p.data || p.data.user_id!==identity.id
      || !['admin','manager','sales'].includes(p.data.role)) {
    return answer(403,'FORBIDDEN');
  }
  const actor=p.data;
  try {
    let query=db.from('wos_production_orders')
      .select('id,organization_id,created_by_profile_id,order_number,customer_name_snapshot,project_name_snapshot,product_name,version,version_label,workflow_status,updated_at')
      .eq('organization_id',actor.org_id).eq('workflow_status','NEEDS_INFORMATION')
      .order('updated_at',{ascending:false}).limit(101);
    if (actor.role==='sales') query=query.eq('created_by_profile_id',actor.id);
    const orders=await query;
    if (orders.error) return answer(503,'RETURNED_ORDERS_READ_FAILED');
    if (!Array.isArray(orders.data) || orders.data.length>100)
      return answer(409,'RETURNED_ORDER_LIMIT_EXCEEDED');
    const list=orders.data;
    if (list.some(row=>row.organization_id!==actor.org_id
         ||row.workflow_status!=='NEEDS_INFORMATION'
         ||(actor.role==='sales'&&row.created_by_profile_id!==actor.id))) {
      return answer(409,'RETURNED_ORDER_SCOPE_MISMATCH');
    }
    if (!list.length) return answer(200,'QA_RETURNED_ORDERS_READ_ONLY',{ items:[],count:0 });
    const ids=list.map(row=>row.id);
    const blockers=await db.from('wos_blockers')
      .select('id,organization_id,entity_type,entity_id,description,blocker_code,status,opened_at,opened_by_profile_id')
      .eq('organization_id',actor.org_id).eq('entity_type','PRODUCTION_ORDER')
      .in('entity_id',ids).eq('status','OPEN')
      .order('opened_at',{ascending:false}).limit(201);
    if (blockers.error) return answer(503,'RETURN_BLOCKERS_READ_FAILED');
    if (!Array.isArray(blockers.data) || blockers.data.length>200)
      return answer(409,'RETURN_BLOCKER_LIMIT_EXCEEDED');
    if (blockers.data.some(b=>b.organization_id!==actor.org_id
      ||b.entity_type!=='PRODUCTION_ORDER'||!ids.includes(b.entity_id))) {
      return answer(409,'RETURN_BLOCKER_SCOPE_MISMATCH');
    }
    const items=list.map(row=>({
      orderId:row.id, orderNumber:row.order_number,
      customerName:row.customer_name_snapshot,projectName:row.project_name_snapshot,
      productName:row.product_name,version:row.version,versionLabel:row.version_label,
      updatedAt:row.updated_at,
      reasons:blockers.data.filter(b=>b.entity_id===row.id).map(b=>({
        reason:b.description,code:b.blocker_code,openedAt:b.opened_at,
        operatorProfileId:b.opened_by_profile_id,
      })),
    }));
    if (items.some(row=>row.reasons.length===0)) {
      // A returned order without a durable blocker reason is not safe to
      // present as a valid workflow state.
      return answer(409,'RETURN_REASON_MISSING');
    }
    return answer(200,'QA_RETURNED_ORDERS_READ_ONLY',{items,count:items.length});
  } catch {
    return answer(503,'QA_RETURNED_ORDERS_UNAVAILABLE');
  }
}
