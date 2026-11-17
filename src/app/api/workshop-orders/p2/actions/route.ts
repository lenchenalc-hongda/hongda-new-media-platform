import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveVerifiedSupabaseIdentity } from '@/lib/auth/supabase-identity';
import {
  canActOnWosP2,
  isWosP2QaMutationEnabled,
  isWosP2RpcResult,
  parseWosP2Action,
  wosP2RpcArgs,
} from '@/lib/workshop-orders/p2-action-contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = { 'Cache-Control': 'no-store, private' } as const;
function answer(status:number, code:string, data:unknown=null) {
  return NextResponse.json({ ok: status===200, code, data }, {status,headers});
}

export async function POST(req:NextRequest) {
  // Never call an RPC until separately authorized QA DB installation.
  // Production, inherited production URLs, and build-only previews fail closed.
  if (!isWosP2QaMutationEnabled({
    vercelEnv:process.env.VERCEL_ENV,
    nodeEnv:process.env.NODE_ENV,
    flag:process.env.WOS_P2_QA_MUTATIONS_ENABLED,
    supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,
  })) return answer(503,'QA_P2_RPC_NOT_AUTHORIZED');

  // Browser same-origin + non-simple header to reject cross-site form posts.
  // A valid login cookie alone is not enough to allow a mutation.
  const origin=req.headers.get('origin');
  if (!origin || origin!==new URL(req.url).origin
      || req.headers.get('x-wos-p2-action')!=='1'
      || !req.headers.get('content-type')?.startsWith('application/json')) {
    return answer(403,'ORIGIN_OR_HEADER_DENIED');
  }
  const declared=Number(req.headers.get('content-length')??'0');
  if (!Number.isFinite(declared)||declared<0||declared>4096) return answer(400,'INVALID_INPUT');

  let request:ReturnType<typeof parseWosP2Action>;
  try {
    const text=await req.text();
    if (text.length>4096) return answer(400,'INVALID_INPUT');
    request=parseWosP2Action(JSON.parse(text));
  } catch { return answer(400,'INVALID_INPUT'); }
  if (!request) return answer(400,'INVALID_INPUT');

  const client=await createClient();
  if (!client) return answer(503,'QA_DATABASE_UNAVAILABLE');
  const identity=await resolveVerifiedSupabaseIdentity(client);
  if (!identity) return answer(401,'UNAUTHENTICATED');

  // Real verified auth.uid + authoritative profile. Never use user_metadata,
  // client-controlled org/owner/role or service_role in this route.
  const profile=await client.from('profiles')
    .select('id,user_id,org_id,role,is_active')
    .eq('user_id',identity.id).eq('is_active',true).maybeSingle();
  const actor=profile.data;
  if (profile.error||!actor||actor.user_id!==identity.id
      ||actor.is_active!==true||!canActOnWosP2(actor.role)) {
    return answer(403,'FORBIDDEN');
  }

  // Early bounded lookup. The SQL function independently re-verifies identity,
  // organization and version, and locks order before an atomic transaction.
  const order=await client.from('wos_production_orders')
    .select('id,organization_id,workflow_status,version')
    .eq('id',request.orderId).eq('organization_id',actor.org_id)
    .maybeSingle();
  if (order.error) return answer(503,'QA_ORDER_READ_UNAVAILABLE');
  if (!order.data||order.data.organization_id!==actor.org_id) return answer(403,'FORBIDDEN');
  if (order.data.version!==request.expectedVersion) return answer(409,'VERSION_CONFLICT');

  const legal= (request.action==='ACCEPT'&&order.data.workflow_status==='SUBMITTED')
    ||(request.action==='RETURN_FOR_INFORMATION'&&['SUBMITTED','WORKSHOP_REVIEW'].includes(order.data.workflow_status))
    ||(request.action==='CONFIRM_MATERIAL'&&['WORKSHOP_REVIEW','WAITING_MATERIAL','READINESS_CHECK'].includes(order.data.workflow_status));
  if (!legal) return answer(409,'ILLEGAL_STATUS_TRANSITION');

  const result=await client.rpc('wos_qa_p2_operator_action',wosP2RpcArgs(request));
  if (result.error) {
    // The RPC produces only generic error messages/codes on purpose.
    const code=result.error.code||'';
    if (code==='42501') return answer(403,'FORBIDDEN');
    if (code==='PT409'||code==='23505') return answer(409,'VERSION_OR_IDEMPOTENCY_CONFLICT');
    if (code==='22023') return answer(400,'INVALID_INPUT');
    if (code==='PGRST202'||code==='42883'||code==='42501') return answer(503,'QA_P2_RPC_NOT_INSTALLED');
    return answer(503,'QA_P2_TRANSACTION_UNAVAILABLE');
  }
  if (!isWosP2RpcResult(result.data,request)) return answer(503,'QA_P2_UNVERIFIED_RESPONSE');
  return answer(200,result.data.status==='REPLAYED'?'QA_P2_REPLAY_VERIFIED':'QA_P2_ACTION_APPLIED',result.data);
}
