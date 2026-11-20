import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveVerifiedSupabaseIdentity } from '@/lib/auth/supabase-identity';
import {
  parseWosP2M2Action, canActOnWosP2M2, isWosP2M2QaEnabled,
  wosP2M2RpcArgs, isWosP2M2RpcResult,
} from '@/lib/workshop-orders/p2-m2-action-contract';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store, private'} as const;
function answer(status:number,code:string,data:unknown=null) {
 return NextResponse.json({ok:status===200,code,data},{status,headers});
}

/**
 * Separate QA-only endpoint. Has NO service-role client or fallback to legacy
 * P2 / P7 writes. Needs newly installed reviewed RPC and database CAS gate.
 * On every error return generic codes: foreign order existence is secret.
 */
export async function POST(req:NextRequest) {
 if(!isWosP2M2QaEnabled({
   vercelEnv:process.env.VERCEL_ENV,flag:process.env.WOS_P2_M2_QA_MUTATIONS_ENABLED,
   supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,
 }))return answer(503,'QA_M2_WRITE_DISABLED');
 const origin=req.headers.get('origin');
 if(!origin||origin!==new URL(req.url).origin||
   req.headers.get('x-wos-p2-m2')!=='1'||
   !req.headers.get('content-type')?.startsWith('application/json'))return answer(403,'ORIGIN_OR_HEADER_DENIED');
 const length=Number(req.headers.get('content-length')??'0');
 if(!Number.isFinite(length)||length<0||length>8192)return answer(400,'INVALID_INPUT');
 let parsed:ReturnType<typeof parseWosP2M2Action>;
 try{
  const body=await req.text();
  if(body.length>8192)return answer(400,'INVALID_INPUT');
  parsed=parseWosP2M2Action(JSON.parse(body));
 }catch{return answer(400,'INVALID_INPUT');}
 if(!parsed)return answer(400,'INVALID_INPUT');
 const client=await createClient();
 if(!client)return answer(503,'QA_DATABASE_UNAVAILABLE');
 const identity=await resolveVerifiedSupabaseIdentity(client);
 if(!identity)return answer(401,'UNAUTHENTICATED');
 const profile=await client.from('profiles').select('id,user_id,org_id,role,is_active')
  .eq('user_id',identity.id).eq('is_active',true).limit(2);
 if(profile.error||profile.data?.length!==1)return answer(403,'FORBIDDEN');
 const actor=profile.data[0];
 if(actor.user_id!==identity.id||!canActOnWosP2M2(actor.role,parsed.action))return answer(403,'FORBIDDEN');
 const order=await client.from('wos_production_orders')
   .select('id,organization_id,order_number,version_label')
   .eq('id',parsed.orderId).eq('organization_id',actor.org_id).maybeSingle();
 if(order.error)return answer(503,'QA_ORDER_READ_UNAVAILABLE');
 if(!order.data||order.data.organization_id!==actor.org_id||
    !order.data.order_number.startsWith('QA-'))return answer(403,'FORBIDDEN');
 // Do NOT pre-reject stale expectedVersion; the SQL receipt ledger must first
 // decide if this is a valid same-payload response-loss replay.
 const call=await client.rpc('wos_qa_p2_m2_action',wosP2M2RpcArgs(parsed));
 if(call.error){
  const code=call.error.code??'';
  if(code==='42501')return answer(403,'FORBIDDEN');
  if(code==='PT409'||code==='23505')return answer(409,'VERSION_OR_IDEMPOTENCY_CONFLICT');
  if(code==='22023')return answer(400,'INVALID_INPUT');
  if(code==='PGRST202'||code==='42883')return answer(503,'QA_M2_RPC_NOT_INSTALLED');
  return answer(503,'QA_M2_TRANSACTION_UNAVAILABLE');
 }
 if(!isWosP2M2RpcResult(call.data,parsed))return answer(503,'QA_M2_UNVERIFIED_RESPONSE');
 return answer(200,call.data.status==='REPLAYED'?'QA_M2_REPLAY_VERIFIED':'QA_M2_ACTION_APPLIED',call.data);
}
