import { NextRequest,NextResponse } from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {resolveVerifiedSupabaseIdentity} from '@/lib/auth/supabase-identity';
import {
 canWosOfficeRevise,isWosP2QaOfficeRevisionEnabled,
 isWosP2OfficeRpcResult,parseWosP2OfficeRevision,wosP2OfficeRpcArgs,
} from '@/lib/workshop-orders/p2-office-revision-contract';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const headers={'Cache-Control':'no-store, private'} as const;
function answer(status:number,code:string,data:unknown=null){
 return NextResponse.json({ok:status===200,code,data},{status,headers});
}
export async function POST(req:NextRequest){
 // A second, INDEPENDENT gate. Installing P2 operator SQL does not authorize
 // office amendment/resubmission; this branch flag defaults disabled.
 if(!isWosP2QaOfficeRevisionEnabled({
   vercelEnv:process.env.VERCEL_ENV,
   flag:process.env.WOS_P2_QA_OFFICE_REVISION_ENABLED,
   supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,
 }))return answer(503,'QA_OFFICE_REVISION_NOT_AUTHORIZED');
 const origin=req.headers.get('origin');
 if(!origin||origin!==new URL(req.url).origin
   ||req.headers.get('x-wos-p2-office-revision')!=='1'
   ||!req.headers.get('content-type')?.startsWith('application/json')){
   return answer(403,'ORIGIN_OR_HEADER_DENIED');
 }
 const contentLength=Number(req.headers.get('content-length')??'0');
 if(!Number.isFinite(contentLength)||contentLength<0||contentLength>8192)
   return answer(400,'INVALID_INPUT');
 let parsed:ReturnType<typeof parseWosP2OfficeRevision>;
 try{
   const raw=await req.text();
   if(raw.length>8192)return answer(400,'INVALID_INPUT');
   parsed=parseWosP2OfficeRevision(JSON.parse(raw));
 }catch{return answer(400,'INVALID_INPUT');}
 if(!parsed)return answer(400,'INVALID_INPUT');
 const db=await createClient();
 if(!db)return answer(503,'QA_DATABASE_UNAVAILABLE');
 const identity=await resolveVerifiedSupabaseIdentity(db);
 if(!identity)return answer(401,'UNAUTHENTICATED');
 const profile=await db.from('profiles')
   .select('id,user_id,org_id,role,is_active')
   .eq('user_id',identity.id).eq('is_active',true).maybeSingle();
 const actor=profile.data;
 if(profile.error||!actor||actor.user_id!==identity.id
  ||actor.is_active!==true||!canWosOfficeRevise(actor.role))
   return answer(403,'FORBIDDEN');
 const order=await db.from('wos_production_orders')
   .select('id,organization_id,created_by_profile_id,order_number')
   .eq('organization_id',actor.org_id).eq('id',parsed.orderId).maybeSingle();
 if(order.error)return answer(503,'QA_ORDER_READ_UNAVAILABLE');
 if(!order.data||order.data.organization_id!==actor.org_id
   ||!order.data.order_number.startsWith('QA-')
   ||(actor.role==='sales'&&order.data.created_by_profile_id!==actor.id))
   return answer(403,'FORBIDDEN');
 // Do not pre-reject status/version: a committed response lost over HTTP must
 // reach the SQL idempotency ledger and return the original REPLAYED response.
 // The reviewed RPC must independently lock current order, verify actor,
 // prior P1 proof, expected version, original blockers, and legal transition.
 const rpc=await db.rpc('wos_qa_p2_office_revision',wosP2OfficeRpcArgs(parsed));
 if(rpc.error){
   const code=rpc.error.code??'';
   if(code==='42501')return answer(403,'FORBIDDEN');
   if(code==='PT409'||code==='23505')return answer(409,'VERSION_OR_IDEMPOTENCY_CONFLICT');
   if(code==='22023')return answer(400,'INVALID_INPUT');
   return answer(503,'QA_OFFICE_REVISION_RPC_NOT_AVAILABLE');
 }
 if(!isWosP2OfficeRpcResult(rpc.data,parsed))return answer(503,'QA_REVISION_RESULT_UNVERIFIED');
 return answer(200,rpc.data.status==='REPLAYED'?'QA_OFFICE_REVISION_REPLAYED':
   parsed.action==='SAVE_CORRECTION'?'QA_OFFICE_CORRECTION_SAVED':'QA_OFFICE_RESUBMITTED',
   rpc.data);
}
