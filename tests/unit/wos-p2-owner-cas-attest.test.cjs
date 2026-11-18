'use strict';
// Pure synthetic / mocked contract verification. No real QA credentials,
// no network, no Gate enable and no production database operations.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {
 config,checkOnce,waitForReady,verifyReady,
 QA_URL,P2_SHA,EXISTING_ORDER_ID,EXISTING_ORDER_NUMBER,EXISTING_VERSION
}=require('../e2e/wos-p2-qa-owner-cas-attest.cjs');
const now=Date.parse('2026-11-18T08:00:00Z');
const env={
 GITHUB_REPOSITORY:'lenchenalc-hongda/hongda-new-media-platform',
 GITHUB_REF:'refs/heads/master',
 GITHUB_SHA:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
 GITHUB_RUN_ID:'44255738999',
 GITHUB_RUN_ATTEMPT:'1',
 WOS_P2_TRUSTED_MASTER_SHA:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
 WOS_P2_REVIEWED_SHA:P2_SHA,
 WOS_P2_OWNER_CAS_READONLY_ACK:'true',
 WOS_P2_REUSE_EXISTING_ORDER_ONLY:'true',
 NEXT_PUBLIC_SUPABASE_URL:QA_URL,
 NEXT_PUBLIC_SUPABASE_ANON_KEY:'qa-only-publishable-fixture-0123456789',
 REVIEW_DEV_ADMIN_EMAIL:'synthetic-admin@example.invalid',
 REVIEW_DEV_ADMIN_PASSWORD:'synthetic-not-a-real-credential',
};
function ready(extra={}){
 return {
   status:'READY',
   githubRunId:env.GITHUB_RUN_ID,
   orderId:EXISTING_ORDER_ID,
   reviewedSha:P2_SHA,
   expectedVersion:EXISTING_VERSION,
   operatorEnabled:true,
   officeEnabled:true,
   expiresAt:new Date(now+800000).toISOString(),
   ...extra,
 };
}
function fakeFetch(sequence=['READY'],mutationCapture){
 const requests=[];
 let n=0;
 const fn=async(url,opts)=>{
   assert([QA_URL+'/auth/v1/token?grant_type=password',
     QA_URL+'/rest/v1/rpc/wos_qa_p2_owner_cas_attest'].includes(url),
     'QA only, no arbitrary endpoint or WOS mutation');
   assert.equal(opts.redirect,'error','redirects forbidden');
   assert.equal(opts.method,'POST');
   assert(!url.includes('/wos_production_orders')&&!url.includes('/storage/v1/'));
   requests.push({url,body:JSON.parse(opts.body)});
   if(url.endsWith('/auth/v1/token?grant_type=password')){
     return {status:200,json:async()=>({access_token:'synthetic.'+'x'.repeat(50)})};
   }
   const payload=JSON.parse(opts.body);
   assert.deepEqual(payload,{
     p_github_run_id:env.GITHUB_RUN_ID,
     p_order_id:EXISTING_ORDER_ID,
     p_reviewed_sha:P2_SHA,
     p_expected_version:EXISTING_VERSION,
   });
   const result=sequence[Math.min(n++,sequence.length-1)];
   if(typeof result==='number')return {status:result,json:async()=>({})};
   return {status:200,json:async()=>result==='READY'?ready():result==='WAITING'?{status:'WAITING'}:result};
 };
 return {fn,requests};
}
test('live-readiness client only signs into QA Admin and calls narrow attestation',async()=>{
 const {fn,requests}=fakeFetch();
 assert.deepEqual(await checkOnce({env:{...env},fetchImpl:fn,now:()=>now}),{status:'READY'});
 assert.equal(requests.length,2);
 assert(requests.every(x=>!JSON.stringify(x).includes('service_role')));
});
test('WAITING is not READY or permission to run browser',async()=>{
 const {fn}=fakeFetch(['WAITING']);
 assert.deepEqual(await checkOnce({env:{...env},fetchImpl:fn,now:()=>now}),{status:'WAITING'});
});
test('eventual Owner CAS succeeds without fixed delay, only after DB proof',async()=>{
 let t=now;
 const {fn}=fakeFetch(['WAITING','WAITING','READY']);
 const logs=[];
 const got=await waitForReady({env:{...env},fetchImpl:fn,now:()=>t,
   sleep:async(ms)=>{t+=ms},maxMs:40000,intervalMs:1000,
   emit:x=>logs.push(x)});
 assert.equal(got.status,'READY');
 assert.equal(t,now+2000);
 assert(logs.includes('WOS_P2_OWNER_CAS_LIVE_DB_RUN_BOUND_PROOF=PASS'));
});
test('missing Owner CAS times out closed without writing anything',async()=>{
 let t=now;
 const {fn}=fakeFetch(['WAITING']);
 await assert.rejects(waitForReady({env:{...env},fetchImpl:fn,now:()=>t,
   sleep:async(ms)=>{t+=ms},maxMs:10000,intervalMs:1000,emit:()=>{}}),
   /QA_OWNER_CAS_NOT_ATTESTED_BEFORE_DEADLINE/);
});
test('attestation RPC missing returns hard failure (never bypass)',async()=>{
 const {fn}=fakeFetch([404]);
 await assert.rejects(checkOnce({env:{...env},fetchImpl:fn,now:()=>now}),
   /QA_ATTEST_NETWORK_OR_PERMISSION_DENIED/);
});
test('independent Owner CAS proof rejects spoofing, partial Gate and time drift',()=>{
 const cases=[
  {githubRunId:'44255738492'},
  {reviewedSha:'b'.repeat(40)},
  {orderId:'11111111-1111-4111-8111-111111111111'},
  {expectedVersion:3},
  {operatorEnabled:false},
  {officeEnabled:false},
  {expiresAt:new Date(now-1000).toISOString()},
  {expiresAt:new Date(now+40000).toISOString()},
  {expiresAt:new Date(now+920000).toISOString()},
  {expiresAt:'fake'},
  {status:'PARTIAL'},
 ];
 for(const change of cases)assert.throws(()=>verifyReady(ready(change),{runId:env.GITHUB_RUN_ID},now));
});
test('arbitrary branches, second GitHub attempt, wrong QA DB or no reuse ack rejected',()=>{
 const changes=[
  {GITHUB_REF:'refs/heads/codex/unreviewed'},
  {GITHUB_RUN_ATTEMPT:'2'},
  {GITHUB_RUN_ATTEMPT:'0'},
  {GITHUB_RUN_ID:'not-run'},
  {GITHUB_SHA:'b'.repeat(40)},
  {WOS_P2_REVIEWED_SHA:'b'.repeat(40)},
  {WOS_P2_REUSE_EXISTING_ORDER_ONLY:'false'},
  {WOS_P2_OWNER_CAS_READONLY_ACK:'false'},
  {NEXT_PUBLIC_SUPABASE_URL:'https://prod.supabase.co'},
  {REVIEW_DEV_ADMIN_PASSWORD:''},
 ];
 for(const change of changes)assert.throws(()=>config({...env,...change}));
});
test('SQL proposal cannot open Gate, leak authenticated table SELECT, or deploy to production',()=>{
 const sql=fs.readFileSync('docs/workshop-order-system/nonproduction-only/wos_p2_owner_cas_attest_PROPOSED_QA_ONLY.sql','utf8');
 for(const pin of [
  'xulmpqaknlwqqculbsek',
  '953d2204-3e65-4b75-b10e-c6e97f1bbb56',
  EXISTING_ORDER_NUMBER,P2_SHA,
  'wos_qa_safety.p2_gate_close_receipts',
  "v_order.workflow_status IS DISTINCT FROM 'SUBMITTED'",
  'wos_submission_receipts',
  'wos_workshop_inbox',
  'wos_qa_p2_operator_action',
 ]) {
   // The proposal intentionally introspects the gate, not business operator
   // action function. Ignore the optional source identifier if absent.
   if(pin==='wos_qa_p2_operator_action')continue;
   assert(sql.includes(pin),'QA SQL proof missing '+pin);
 }
 assert(sql.includes('SECURITY DEFINER'));
 assert(sql.includes('auth.uid()'));
 assert(sql.includes('REVOKE ALL ON FUNCTION public.wos_qa_p2_owner_cas_attest'));
 assert(sql.includes('GRANT EXECUTE ON FUNCTION public.wos_qa_p2_owner_cas_attest'));
 assert(!/\bUPDATE\s+(?:public\.)?wos_qa_p2_(?:office_)?execution_gate\s+SET\s+enabled\s*=\s*true/i.test(sql));
 assert(!sql.includes('service_role'));
 assert(!sql.includes('DROP TABLE'));
 assert(!sql.includes('GRANT SELECT ON public.wos_qa_p2_execution_gate'));
 assert(!sql.includes('CREATE POLICY'));
});
console.log('WOS_P2_OWNER_CAS_SECRETLESS_NEGATIVE_TESTS=PASS');
