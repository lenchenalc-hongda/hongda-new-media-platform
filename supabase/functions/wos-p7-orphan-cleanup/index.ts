// WOS P7: isolated QA-only orphan cleanup. DRY_RUN by default.
// Real deletion requires explicit QA-only Edge environment opt-in, a real
// active QA admin JWT, a synthetic orphan, lease claim and exact predelete
// revalidation. Storage API remove is the only binary deletion mechanism.
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
const QA_URL='https://xulmpqaknlwqqculbsek.supabase.co';
const HEADERS={'Content-Type':'application/json','Cache-Control':'private, no-store'};
type Args={mode?:'dry_run'|'execute';minAgeHours?:number;ack?:string};
const answer=(status:number,code:string,extra:Record<string,unknown>={})=>
  new Response(JSON.stringify({ok:status===200,code,...extra}),{status,headers:HEADERS});
function publicKey():string{
  try { const keys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}');
    if(typeof keys.default==='string'&&keys.default)return keys.default;
  }catch{ /* legacy isolated QA */ }
  return Deno.env.get('SUPABASE_ANON_KEY')||'';
}
function secretKey():string{
  try { const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
    if(typeof keys.default==='string'&&keys.default)return keys.default;
  }catch{ /* legacy isolated QA */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
}
Deno.serve(async (req:Request)=>{
 if(req.method!=='POST')return answer(405,'METHOD_NOT_ALLOWED');
 if(Deno.env.get('SUPABASE_URL')!==QA_URL)return answer(503,'QA_PROJECT_PIN_FAILED');
 const authorization=req.headers.get('authorization')||'';
 if(!/^Bearer [^\s]+$/.test(authorization))return answer(401,'UNAUTHENTICATED');
 if(!req.headers.get('content-type')?.startsWith('application/json'))
   return answer(400,'INVALID_INPUT');
 let body:Args;
 try {
   const raw=await req.text();if(raw.length>1024)return answer(400,'INVALID_INPUT');
   const value=JSON.parse(raw);
   if(!value||typeof value!=='object'||Array.isArray(value))return answer(400,'INVALID_INPUT');
   if(Object.keys(value).some(k=>!['mode','minAgeHours','ack'].includes(k)))
     return answer(400,'INVALID_INPUT');
   body=value;
 }catch{return answer(400,'INVALID_INPUT');}
 const mode=body.mode??'dry_run',age=body.minAgeHours??48;
 if(!['dry_run','execute'].includes(mode) || !Number.isInteger(age)||age<24||age>720)
   return answer(400,'INVALID_INPUT');
 const key=publicKey(),adminKey=secretKey();
 if(!key||!adminKey)return answer(503,'QA_CONFIG_UNAVAILABLE');
 try{
   const userDb=createClient(QA_URL,key,{global:{headers:{Authorization:authorization}},
     auth:{autoRefreshToken:false,persistSession:false}});
   const {data:{user},error:authError}=await userDb.auth.getUser(authorization.substring(7));
   if(authError||!user)return answer(401,'UNAUTHENTICATED');
   const {data:profile,error:profileError}=await userDb.from('profiles')
     .select('id,org_id,role,is_active').eq('user_id',user.id)
     .eq('is_active',true).maybeSingle();
   if(profileError||!profile||profile.role!=='admin')return answer(403,'FORBIDDEN');
   const admin=createClient(QA_URL,adminKey,{auth:{autoRefreshToken:false,persistSession:false}});
   if(mode==='dry_run'){
     const {data,error}=await admin.rpc('wos_qa_list_stale_orphans_for_org',
       {p_organization_id:profile.org_id,p_min_age_hours:age,p_limit:100});
     if(error||!Array.isArray(data))return answer(503,'INVENTORY_UNAVAILABLE');
     // Return counts only, not organization IDs or private Storage paths.
     const mine=data.filter(x=>x.organization_id===profile.org_id);
     return answer(200,'QA_ORPHAN_DRY_RUN',{candidates:mine.length,
       limitedTo:100,minimumAgeHours:age,deleted:0});
   }
   if(Deno.env.get('WOS_P7_QA_ORPHAN_DELETE_ENABLED')!=='true')
     return answer(423,'QA_ORPHAN_DELETE_DISABLED');
   if(body.ack!=='WOS_QA_SYNTHETIC_ORPHAN_DELETE_ONLY')
     return answer(400,'EXPLICIT_QA_DELETE_ACK_REQUIRED');
   // Recover claims left uncertain by a timed-out Storage API response.
   // The SQL RPC updates only cleanup lease records, never storage.objects.
   const {data:recovery,error:recoveryError}=await admin.rpc(
     'wos_qa_reconcile_expired_cleanup_claims',
     {p_organization_id:profile.org_id,p_limit:100});
   if(recoveryError||recovery?.status!=='RECONCILED')
     return answer(503,'QA_CLEANUP_RECOVERY_UNAVAILABLE');
   const {data:claim,error:claimError}=await admin.rpc('wos_qa_claim_stale_orphan_for_org',
     {p_organization_id:profile.org_id,p_min_age_hours:age});
   if(claimError||!claim)return answer(503,'CLEANUP_CLAIM_FAILED');
   if(claim.status==='NO_ELIGIBLE_ORPHAN')return answer(200,'NO_ELIGIBLE_ORPHAN',{deleted:0});
   if(claim.status!=='CLAIMED'||!claim.claimToken||!claim.objectId||!claim.path)
     return answer(409,'CLEANUP_CLAIM_UNAVAILABLE');
   const keys={p_claim_token:claim.claimToken,p_object_id:claim.objectId};
   const release=async(reason:string)=>admin.rpc('wos_qa_finish_orphan_claim',
     {...keys,p_removed:false,p_result:reason});
   if(claim.organizationId!==profile.org_id){
     await release('OUTSIDE_AUTHORIZED_ORG');
     return answer(200,'NO_ELIGIBLE_ORPHAN',{deleted:0});
   }
   const {data:pre,error:preErr}=await admin.rpc('wos_qa_predelete_orphan',
     {...keys,p_min_age_hours:age});
   if(preErr||pre?.ok!==true||pre.path!==claim.path||pre.objectId!==claim.objectId){
     await release('PREDELETE_RECHECK_FAILED');
     return answer(409,'PREDELETE_RECHECK_FAILED');
   }
   // Permanent destructive action. All SQL preflight and role/lease checks
   // above MUST pass. Never SQL DELETE storage.objects.
   const {error:deleteErr}=await admin.storage.from('wos-private').remove([claim.path]);
   if(deleteErr){
     await release('STORAGE_API_DELETE_ERROR');
     return answer(503,'STORAGE_API_DELETE_ERROR');
   }
   const {data:finish,error:finishErr}=await admin.rpc('wos_qa_finish_orphan_claim',
     {...keys,p_removed:true,p_result:'STORAGE_API_DELETE_CONFIRMED'});
   if(finishErr||finish?.status!=='REMOVED')
     return answer(503,'DELETE_CONFIRMATION_PENDING');
   return answer(200,'QA_SYNTHETIC_ORPHAN_REMOVED',{deleted:1});
 }catch{return answer(503,'QA_CLEANUP_UNAVAILABLE');}
});
