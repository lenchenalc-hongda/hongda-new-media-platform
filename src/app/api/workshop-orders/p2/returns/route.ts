import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveVerifiedSupabaseIdentity } from '@/lib/auth/supabase-identity';
import { isWosQaInboxReadonlyEnabled } from '@/lib/workshop-orders/api-contract';
import { isWosP2QaOfficeRevisionEnabled } from '@/lib/workshop-orders/p2-office-revision-contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store, private' } as const;
function answer(status:number, code:string, data:unknown=null) {
  return NextResponse.json({ ok:status===200, code, data }, { status, headers });
}

/** Office returned-order lookup; read-only even while P2 QA writes are off. */
export async function GET() {
  if (!isWosQaInboxReadonlyEnabled({
    vercelEnv:process.env.VERCEL_ENV,
    authMode:process.env.AUTH_MODE,
    enabled:process.env.WOS_QA_INBOX_READONLY_ENABLED,
    supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,
  })) {
    return answer(503,'NONPRODUCTION_READ_ONLY_DISABLED');
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
  const capabilities={
    revisionWriteEnabled:isWosP2QaOfficeRevisionEnabled({
      vercelEnv:process.env.VERCEL_ENV,
      nodeEnv:process.env.NODE_ENV,
      flag:process.env.WOS_P2_QA_OFFICE_REVISION_ENABLED,
      supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,
      allowLocal:process.env.WOS_ALLOW_LOCAL_SUPABASE,
      publicAllowLocal:process.env.NEXT_PUBLIC_WOS_ALLOW_LOCAL_SUPABASE,
    }),
  };
  try {
    let query=db.from('wos_production_orders')
      .select('id,organization_id,created_by_profile_id,project_owner_profile_id,order_number,customer_name_snapshot,project_name_snapshot,product_name,product_material,requested_quantity,current_batch_quantity,customer_acceptance_standard,position_reference,version,version_label,workflow_status,updated_at')
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
    if (!list.length) return answer(200,'QA_RETURNED_ORDERS_READ_ONLY',{
      items:[],count:0,capabilities,
    });
    const ids=list.map(row=>row.id);
    const responsibleIds=Array.from(new Set(list.flatMap(row=>{
      const id=row.project_owner_profile_id??row.created_by_profile_id;
      return id?[id]:[];
    })));
    if (list.some(row=>!row.project_owner_profile_id&&!row.created_by_profile_id))
      return answer(409,'RETURN_RESPONSIBLE_PROFILE_MISSING');
    const responsibleProfiles=await db.from('profiles')
      .select('id,org_id,user_id,full_name,role,is_active')
      .eq('org_id',actor.org_id).in('id',responsibleIds).limit(201);
    const visibleResponsibleProfiles=!responsibleProfiles.error
      &&Array.isArray(responsibleProfiles.data)
      &&responsibleProfiles.data.length<201
      ? responsibleProfiles.data.filter(profile=>
        profile.org_id===actor.org_id&&responsibleIds.includes(profile.id))
      : [];
    const responsibleById=new Map(
      visibleResponsibleProfiles.map(profile=>[profile.id,profile]),
    );
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
      productName:row.product_name,productMaterial:row.product_material,
      requestedQuantity:row.requested_quantity,currentBatchQuantity:row.current_batch_quantity,
      customerAcceptanceStandard:row.customer_acceptance_standard,
      positionReference:row.position_reference,
      version:row.version,versionLabel:row.version_label,
      workflowStatus:row.workflow_status,
      updatedAt:row.updated_at,
      responsibleProfileId:row.project_owner_profile_id??row.created_by_profile_id,
      responsibleName:responsibleById.get(
        row.project_owner_profile_id??row.created_by_profile_id,
      )?.full_name??null,
      responsibleRole:responsibleById.get(
        row.project_owner_profile_id??row.created_by_profile_id,
      )?.role??null,
      responsibleActive:responsibleById.get(
        row.project_owner_profile_id??row.created_by_profile_id,
      )?.is_active??null,
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
    return answer(200,'QA_RETURNED_ORDERS_READ_ONLY',{
      items,count:items.length,capabilities,
    });
  } catch {
    return answer(503,'QA_RETURNED_ORDERS_UNAVAILABLE');
  }
}
