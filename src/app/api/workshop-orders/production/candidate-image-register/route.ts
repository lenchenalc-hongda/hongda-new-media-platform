import 'server-only';
import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {resolveVerifiedSupabaseIdentity} from '@/lib/auth/supabase-identity';
import {isWosCpcReadCandidateEnabled,resolveWosCpcActor} from '@/lib/workshop-orders/prod-cpc-eligibility';
import {parseImageRegistrationCandidate} from '@/lib/workshop-orders/prod-office-document-candidate';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0',Vary:'Cookie'};
function response(status:number,code:string,data:unknown=null){
 return NextResponse.json({ok:status===200,code,data},{status,headers});
}
function enabled(){
 return process.env.WOS_PROD_P1_IMAGE_CANDIDATE_ENABLED==='true'
 && isWosCpcReadCandidateEnabled({
   vercelEnv:process.env.VERCEL_ENV,nodeEnv:process.env.NODE_ENV,
   enabled:process.env.WOS_PROD_CPC_READ_CANDIDATE_ENABLED,
   supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,
 });
}
export async function POST(req:NextRequest){
 if(!enabled())return response(503,'PRIVATE_IMAGE_CANDIDATE_DISABLED');
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')
 ||Number(req.headers.get('content-length')||'0')>2048)return response(400,'INVALID_INPUT');
 let parsed:ReturnType<typeof parseImageRegistrationCandidate>;
 try{
  const raw=await req.text();if(raw.length>2048)return response(400,'INVALID_INPUT');
  parsed=parseImageRegistrationCandidate(JSON.parse(raw));
 }catch{return response(400,'INVALID_INPUT');}
 if(!parsed)return response(400,'INVALID_INPUT');
 const client=await createClient();
 if(!client)return response(503,'DATABASE_UNAVAILABLE');
 const identity=await resolveVerifiedSupabaseIdentity(client);
 if(!identity)return response(401,'UNAUTHENTICATED');
 const prof=await client.from('profiles').select('id,user_id,org_id,role,is_active')
  .eq('user_id',identity.id).eq('is_active',true).maybeSingle();
 if(prof.error||!prof.data||!resolveWosCpcActor(identity.id,prof.data).ok)
  return response(403,'FORBIDDEN');
 const result=await client.rpc('wos_mvp_register_image_candidate',{
   p_order_id:parsed.orderId,p_image_id:parsed.imageId,
   p_expected_version:parsed.expectedVersion,p_storage_path:parsed.storagePath,
 });
 if(result.error){
  if(result.error.code==='PT409')return response(409,'IMAGE_OBJECT_OR_VERSION_CHANGED');
  if(result.error.code==='42501')return response(403,'FORBIDDEN');
  if(result.error.code==='23514')return response(409,'TRUSTED_EDGE_IMAGE_PROOF_REQUIRED');
  return response(503,'IMAGE_REGISTER_RPC_NOT_INSTALLED_OR_UNAVAILABLE');
 }
 const row=result.data as Record<string,unknown>|null;
 if(!row||(row.result!=='REGISTERED'&&row.result!=='REPLAYED')
 ||row.orderId!==parsed.orderId||row.imageId!==parsed.imageId
 ||row.version!==parsed.expectedVersion)return response(503,'IMAGE_REGISTER_UNVERIFIED');
 return response(200,'PRIVATE_IMAGE_REGISTERED_VERIFIED',row);
}
