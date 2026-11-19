import 'server-only';
import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {resolveVerifiedSupabaseIdentity} from '@/lib/auth/supabase-identity';
import {isWosCpcReadCandidateEnabled,resolveWosCpcActor} from '@/lib/workshop-orders/prod-cpc-eligibility';
import {parseOfficeDocumentSaveCandidate} from '@/lib/workshop-orders/prod-office-document-candidate';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0',Vary:'Cookie'};
function response(status:number,code:string,data:unknown=null){
  return NextResponse.json({ok:status===200,code,data},{status,headers});
}
function enabled(){
 return process.env.WOS_PROD_P1_OFFICE_CANDIDATE_ENABLED==='true'
 && isWosCpcReadCandidateEnabled({
   vercelEnv:process.env.VERCEL_ENV,nodeEnv:process.env.NODE_ENV,
   enabled:process.env.WOS_PROD_CPC_READ_CANDIDATE_ENABLED,
   supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,
 });
}
export async function POST(req:NextRequest){
 if(!enabled())return response(503,'OFFICE_DOCUMENT_CANDIDATE_DISABLED');
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')
 ||Number(req.headers.get('content-length')||'0')>24576)return response(400,'INVALID_INPUT');
 let payload:ReturnType<typeof parseOfficeDocumentSaveCandidate>;
 try{
   const raw=await req.text();
   if(raw.length>24576)return response(400,'INVALID_INPUT');
   payload=parseOfficeDocumentSaveCandidate(JSON.parse(raw));
 }catch{return response(400,'INVALID_INPUT');}
 if(!payload)return response(400,'INVALID_OR_INCOMPLETE_OFFICE_FORM');
 const client=await createClient();
 if(!client)return response(503,'DATABASE_UNAVAILABLE');
 const identity=await resolveVerifiedSupabaseIdentity(client);
 if(!identity)return response(401,'UNAUTHENTICATED');
 const prof=await client.from('profiles').select('id,user_id,org_id,role,is_active')
   .eq('user_id',identity.id).eq('is_active',true).maybeSingle();
 if(prof.error||!prof.data||!resolveWosCpcActor(identity.id,prof.data).ok)
   return response(403,'FORBIDDEN');
 const result=await client.rpc('wos_mvp_save_complete_office_candidate',{
   p_order_id:payload.orderId,p_expected_version:payload.expectedVersion,
   p_request_id:payload.requestId,p_document:payload.normalized,
 });
 if(result.error){
   if(result.error.code==='PT409'||result.error.code==='23505')
     return response(409,'OFFICE_VERSION_OR_REPLAY_CONFLICT');
   if(result.error.code==='42501')return response(403,'FORBIDDEN');
   if(result.error.code==='23514')return response(400,'OFFICE_FIELDS_OR_CPC_CHANGED');
   return response(503,'OFFICE_DOCUMENT_RPC_NOT_INSTALLED_OR_UNAVAILABLE');
 }
 const proof=result.data as Record<string,unknown>|null;
 if(!proof||(proof.result!=='SAVED'&&proof.result!=='REPLAYED')
 ||proof.orderId!==payload.orderId||proof.allOfficeFieldsSaved!==true
 ||proof.version!==payload.expectedVersion+1)
   return response(503,'OFFICE_SAVE_UNVERIFIED');
 return response(200,'OFFICE_FORM_PERSISTED_VERIFIED',proof);
}
