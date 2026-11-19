import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveVerifiedSupabaseIdentity } from '@/lib/auth/supabase-identity';
import { resolveWosCpcActor, isWosCpcReadCandidateEnabled } from '@/lib/workshop-orders/prod-cpc-eligibility';
import { parseWosP1DraftCandidate } from '@/lib/workshop-orders/prod-p1-candidate-contract';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={ 'Cache-Control':'private, no-store, max-age=0', Vary:'Cookie' };
function json(status:number,code:string,data:unknown=null) {
  return NextResponse.json({ ok:status===200, code,data },{status,headers});
}
function enabled() {
  return process.env.WOS_PROD_P1_DRAFT_CANDIDATE_ENABLED==='true'
    && isWosCpcReadCandidateEnabled({
      vercelEnv:process.env.VERCEL_ENV,nodeEnv:process.env.NODE_ENV,
      enabled:process.env.WOS_PROD_CPC_READ_CANDIDATE_ENABLED,
      supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,
    });
}
export async function POST(req:NextRequest) {
  if(!enabled()) return json(503,'WOS_P1_DRAFT_CANDIDATE_DISABLED');
  if(!req.headers.get('content-type')?.startsWith('application/json')
    || Number(req.headers.get('content-length')||'0')>2048) return json(400,'INVALID_INPUT');
  let input:ReturnType<typeof parseWosP1DraftCandidate>;
  try {
    const raw=await req.text();
    if(raw.length>2048) return json(400,'INVALID_INPUT');
    input=parseWosP1DraftCandidate(JSON.parse(raw));
  } catch { return json(400,'INVALID_INPUT'); }
  if(!input) return json(400,'INVALID_INPUT');
  const client=await createClient();
  if(!client) return json(503,'QA_DATABASE_UNAVAILABLE');
  const user=await resolveVerifiedSupabaseIdentity(client);
  if(!user) return json(401,'UNAUTHENTICATED');
  const profile=await client.from('profiles').select('id,user_id,org_id,role,is_active')
    .eq('user_id',user.id).eq('is_active',true).maybeSingle();
  if(profile.error||!profile.data) return json(403,'FORBIDDEN');
  const actor=resolveWosCpcActor(user.id,profile.data);
  if(!actor.ok) return json(403,'FORBIDDEN');
  // Only this audited private DB adapter can create drafts. It is NOT installed
  // on QA/Production and is runtime-locked to disposable PG17 until reviewed.
  const result=await client.rpc('wos_mvp_create_cpc_draft_candidate',{
    p_request_id:input.requestId,p_customer_id:input.customerId,
    p_project_id:input.projectId,p_product_name:input.productName,
    p_material:input.productMaterial,p_quantity:input.requestedQuantity,
    p_priority:input.priority,
  });
  if(result.error) {
    if(result.error.code==='23505') return json(409,'IDEMPOTENCY_CONFLICT');
    if(result.error.code==='42501') return json(403,'FORBIDDEN');
    if(result.error.code==='23514') return json(409,'CPC_ELIGIBILITY_CHANGED');
    return json(503,'WOS_DRAFT_RPC_NOT_INSTALLED_OR_UNAVAILABLE');
  }
  return json(200,'WOS_DRAFT_CANDIDATE_RPC_VERIFIED',result.data);
}
