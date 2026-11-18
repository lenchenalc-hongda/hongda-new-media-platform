// Protected QA-only, live *read-only* proof of an independently executed
// Owner CAS. It cannot open Gates or modify WOS records.
// Requires separate QA-only SQL install approval; fails closed if missing.
'use strict';
const assert=require('node:assert/strict');
const QA_URL='https://xulmpqaknlwqqculbsek.supabase.co';
const REPO='lenchenalc-hongda/hongda-new-media-platform';
const P2_SHA='89bb408d13e45458c608db29c47e2803d49b3170';
const EXISTING_ORDER_ID='953d2204-3e65-4b75-b10e-c6e97f1bbb56';
const EXISTING_ORDER_NUMBER='QA-NONPROD-d2f91453-fe42-42e9-98d4-a6a902645ded';
const EXISTING_VERSION=2;
const ATTEST_RPC=QA_URL+'/rest/v1/rpc/wos_qa_p2_owner_cas_attest';
const MAX_POLL_MS=600000; // deadline, NOT a fixed wait before writes
const INTERVAL_MS=5000;

function reject(code){
 const err=new Error(code);
 err.name='QaOwnerCasAttestationDenied';
 throw err;
}
function config(env) {
 assert.equal(env.GITHUB_REPOSITORY,REPO,'QA_REPOSITORY_PIN');
 assert.equal(env.GITHUB_REF,'refs/heads/master','QA_PROTECTED_MASTER_ONLY');
 assert.equal(env.GITHUB_RUN_ATTEMPT,'1','QA_NO_RERUN_OF_SAME_GITHUB_RUN');
 assert(/^[0-9]{5,20}$/.test(env.GITHUB_RUN_ID||''),'QA_RUN_ID_REQUIRED');
 assert(/^[0-9a-f]{40}$/.test(env.GITHUB_SHA||''),'QA_MASTER_SHA_REQUIRED');
 assert.equal(env.WOS_P2_TRUSTED_MASTER_SHA,env.GITHUB_SHA,'QA_MASTER_SHA_MUST_MATCH');
 assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,QA_URL,'QA_PROJECT_PIN');
 assert.equal(env.WOS_P2_REVIEWED_SHA,P2_SHA,'QA_BUSINESS_HEAD_PIN');
 assert.equal(env.WOS_P2_OWNER_CAS_READONLY_ACK,'true','OWNER_CAS_PROOF_EXPLICIT_ACK');
 assert.equal(env.WOS_P2_REUSE_EXISTING_ORDER_ONLY,'true','QA_NO_NEW_ORDER');
 const key=env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const email=env.REVIEW_DEV_ADMIN_EMAIL;
 const password=env.REVIEW_DEV_ADMIN_PASSWORD;
 if(typeof key!=='string'||key.length<20||!email||!password)
   reject('QA_PROTECTED_ADMIN_CREDENTIALS_REQUIRED');
 return {key,email,password,runId:env.GITHUB_RUN_ID};
}
async function api(fetchImpl,url,opts) {
 // The pinned QA server is the only allowed network destination.
 if(url!==ATTEST_RPC && url!==QA_URL+'/auth/v1/token?grant_type=password')
   reject('QA_NETWORK_ORIGIN_NOT_APPROVED');
 const response=await fetchImpl(url,{...opts,redirect:'error',
   signal:AbortSignal.timeout(15000)});
 if(response.status!==200) reject('QA_ATTEST_NETWORK_OR_PERMISSION_DENIED');
 const data=await response.json().catch(()=>null);
 if(!data||typeof data!=='object'||Array.isArray(data))
   reject('QA_ATTEST_INVALID_JSON');
 return data;
}
async function adminToken(fetchImpl,c) {
 const data=await api(fetchImpl,QA_URL+'/auth/v1/token?grant_type=password',{
  method:'POST',headers:{apikey:c.key,'Content-Type':'application/json'},
  body:JSON.stringify({email:c.email,password:c.password})
 });
 if(typeof data.access_token!=='string'||data.access_token.length<30)
   reject('QA_ADMIN_AUTH_FAILED');
 return data.access_token;
}
function verifyReady(payload,c,nowMs) {
 if(payload.status!=='READY') reject('QA_OWNER_CAS_NOT_READY');
 if(payload.githubRunId!==c.runId
    ||payload.reviewedSha!==P2_SHA
    ||payload.orderId!==EXISTING_ORDER_ID
    ||payload.expectedVersion!==EXISTING_VERSION
    ||payload.operatorEnabled!==true
    ||payload.officeEnabled!==true)
   reject('QA_OWNER_CAS_PROOF_IDENTITY_OR_SCOPE_MISMATCH');
 const expiry=Date.parse(payload.expiresAt);
 if(!Number.isFinite(expiry)
    ||expiry<=nowMs+120000
    ||expiry>nowMs+900000+10000)
   reject('QA_OWNER_CAS_EXPIRY_INVALID');
 return true;
}
async function checkOnce({env=process.env,fetchImpl=fetch,now=Date.now}={}) {
 const c=config(env);
 const token=await adminToken(fetchImpl,c);
 const payload=await api(fetchImpl,ATTEST_RPC,{
   method:'POST',
   headers:{
     apikey:c.key,
     Authorization:'Bearer '+token,
     'Content-Type':'application/json',
     Accept:'application/json',
   },
   body:JSON.stringify({
     p_github_run_id:c.runId,
     p_order_id:EXISTING_ORDER_ID,
     p_reviewed_sha:P2_SHA,
     p_expected_version:EXISTING_VERSION,
   }),
 });
 if(payload.status==='WAITING')return {status:'WAITING'};
 verifyReady(payload,c,now());
 return {status:'READY'};
}
async function waitForReady({
 env=process.env,fetchImpl=fetch,now=Date.now,
 sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
 maxMs=MAX_POLL_MS,intervalMs=INTERVAL_MS,emit=console.log,
}={}){
 // Strict maximum; unit tests inject a shorter deadline without any real DB.
 config(env);
 if(!Number.isFinite(maxMs)||maxMs<0||maxMs>MAX_POLL_MS ||
    !Number.isFinite(intervalMs)||intervalMs<1||intervalMs>INTERVAL_MS)
   reject('QA_ATTEST_POLL_LIMIT_INVALID');
 const started=now();
 let attempts=0;
 for(;;){
   const observed=await checkOnce({env,fetchImpl,now});
   attempts++;
   if(observed.status==='READY'){
     emit('WOS_P2_OWNER_CAS_LIVE_DB_RUN_BOUND_PROOF=PASS');
     emit('WOS_P2_EXISTING_ORDER_REUSE_READY=PASS');
     return observed;
   }
   const remaining=maxMs-(now()-started);
   if(remaining<=0)reject('QA_OWNER_CAS_NOT_ATTESTED_BEFORE_DEADLINE');
   if(attempts%6===1)emit('WOS_P2_OWNER_CAS_WAITING_FOR_INDEPENDENT_OWNER=YES');
   await sleep(Math.min(intervalMs,remaining));
 }
}
if(require.main===module){
 waitForReady().catch(error=>{
  // Do not print JWT, email/password, SQL errors, order content, or responses.
  const code=error?.name==='AssertionError'
    ? 'TRUST_SCOPE_REJECTED'
    :error?.name==='QaOwnerCasAttestationDenied'
      ? 'NOT_READY_OR_PROOF_REJECTED'
      : 'NETWORK_OR_TIMEOUT';
  console.error('WOS_P2_OWNER_CAS_LIVE_PROOF='+code);
  process.exitCode=1;
 });
}
module.exports={
 checkOnce,waitForReady,config,verifyReady,
 QA_URL,P2_SHA,EXISTING_ORDER_ID,EXISTING_ORDER_NUMBER,EXISTING_VERSION
};
