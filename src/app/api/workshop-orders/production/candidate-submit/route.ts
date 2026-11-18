import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveVerifiedSupabaseIdentity } from '@/lib/auth/supabase-identity';
import { resolveWosCpcActor, isWosCpcReadCandidateEnabled } from '@/lib/workshop-orders/prod-cpc-eligibility';
import { parseWosP1FirstSubmitCandidate } from '@/lib/workshop-orders/prod-p1-candidate-contract';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={ 'Cache-Control':'private, no-store, max-age=0', Vary:'Cookie' };
function json(status:number,code:string,data:unknown=null) {
  return NextResponse.json({ok:status===200,code,data},{status,headers});
}
function enabled(){
  return process.env.WOS_PROD_P1_SUBMIT_CANDIDATE_ENABLED==='true'
   && isWosCpcReadCandidateEnabled({
     vercelEnv:process.env.VERCEL_ENV,nodeEnv:process.env.NODE_ENV,
     enabled:process.env.WOS_PROD_CPC_READ_CANDIDATE_ENABLED,
     supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,
   });
}
export async function POST(req:NextRequest){
  if(!enabled()) return json(503,'WOS_P1_SUBMIT_CANDIDATE_DISABLED');
  if(!req.headers.get('content-type')?.startsWith('application/json')
    || Number(req.headers.get('content-length')||'0')>2048) return json(400,'INVALID_INPUT');
  let input:ReturnType<typeof parseWosP1FirstSubmitCandidate>;
  try{
    const raw=await req.text();
    if(raw.length>2048) return json(400,'INVALID_INPUT');
    input=parseWosP1FirstSubmitCandidate(JSON.parse(raw));
  }catch{return json(400,'INVALID_INPUT');}
  if(!input) return json(400,'INVALID_INPUT');
  const client=await createClient();
  if(!client) return json(503,'QA_DATABASE_UNAVAILABLE');
  const user=await resolveVerifiedSupabaseIdentity(client);
  if(!user) return json(401,'UNAUTHENTICATED');
  const profile=await client.from('profiles').select('id,user_id,org_id,role,is_active')
    .eq('user_id',user.id).eq('is_active',true).maybeSingle();
  if(profile.error||!profile.data)return json(403,'FORBIDDEN');
  const actor=resolveWosCpcActor(user.id,profile.data);
  if(!actor.ok)return json(403,'FORBIDDEN');
  // No user-controlled status/owner/org fields; DB has to recheck all.
  // Synthetic binary-proof table is NEVER valid for actual Storage uploads.
  const result=await client.rpc('wos_mvp_submit_first_order_full_candidate',{
    p_order_id:input.orderId,p_expected_version:input.expectedVersion,
    p_idempotency_key:input.idempotencyKey,p_note:input.readinessNote,
  });
  if(result.error){
    if(result.error.code==='PT409'||result.error.code==='23505')return json(409,'VERSION_OR_IDEMPOTENCY_CONFLICT');
    if(result.error.code==='42501')return json(403,'FORBIDDEN');
    if(result.error.code==='23514')return json(409,'PRIVATE_IMAGE_PROOF_OR_READINESS_MISSING');
    return json(503,'WOS_SUBMIT_RPC_NOT_INSTALLED_OR_UNAVAILABLE');
  }
  return json(200,'WOS_FIRST_SUBMIT_CANDIDATE_RPC_VERIFIED',result.data);
}
