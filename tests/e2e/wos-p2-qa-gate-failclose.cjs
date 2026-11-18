// Protected GitHub-hosted QA-only cleanup. Runs only from pinned master
// in protected hongda-review-dev; uses a QA Admin credential, never service
// role or database passwords. Only two QA gates can be disabled.
'use strict';
const {randomUUID} = require('node:crypto');
const assert = require('node:assert/strict');

const QA_URL='https://xulmpqaknlwqqculbsek.supabase.co';
const reasons=['PASS','FAIL','CANCEL','TIMEOUT','PREFLIGHT','VERIFY'];
let stage='ENV_CHECK';
const requestId=randomUUID();

function headers(key,token) {
  return {
    apikey:key, Authorization:'Bearer '+token,
    'Content-Type':'application/json',Accept:'application/json',
  };
}
async function jsonRequest(url,init,timeoutMs=14000) {
  const res=await fetch(url,{...init,signal:AbortSignal.timeout(timeoutMs)});
  const payload=await res.json().catch(()=>null);
  return {res,payload};
}
async function close() {
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email=process.env.REVIEW_DEV_ADMIN_EMAIL;
  const password=process.env.REVIEW_DEV_ADMIN_PASSWORD;
  const reason=process.env.WOS_P2_GATE_CLOSE_REASON||'FAIL';
  const runId=process.env.GITHUB_RUN_ID;
  assert.equal(process.env.GITHUB_REPOSITORY,'lenchenalc-hongda/hongda-new-media-platform');
  assert.equal(process.env.GITHUB_REF,'refs/heads/master');
  assert.equal(process.env.WOS_P2_QA_CLOSURE_ENABLED,'true');
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,QA_URL);
  assert(reasons.includes(reason),'invalid QA close reason');
  assert(/^[0-9]{5,20}$/.test(runId||''),'invalid run id');
  assert(key&&email&&password,'protected QA Admin secrets missing');

  stage='AUTH';
  const login=await jsonRequest(QA_URL+'/auth/v1/token?grant_type=password',{
    method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
    body:JSON.stringify({email,password}),
  });
  if(login.res.status!==200 || !login.payload?.access_token)
    throw Error('QA_CLOSE_ADMIN_AUTH_UNAVAILABLE');
  const token=login.payload.access_token;

  stage='GATE_CLOSE';
  const body=JSON.stringify({p_github_run_id:runId,
    p_request_id:requestId,p_reason:reason});
  let response;
  for(let i=0;i<3;i++) {
    try {
      response=await jsonRequest(QA_URL+'/rest/v1/rpc/wos_qa_p2_failclose',{
        method:'POST',headers:headers(key,token),body,
      });
      if(response.res.ok) break;
      if(response.res.status>=400&&response.res.status<500)
        throw Error('QA_CLOSE_PERMISSION_OR_INPUT_REJECTED');
    } catch {
      if(i===2) throw Error('QA_CLOSE_NETWORK_OR_REQUEST_FAILED');
    }
  }
  if(!response?.res.ok ||
     !['CLOSED','REPLAYED'].includes(response.payload?.status) ||
     response.payload.requestId!==requestId ||
     response.payload.githubRunId!==runId ||
     response.payload.operatorEnabled!==false ||
     response.payload.officeEnabled!==false) {
    throw Error('QA_CLOSE_RESPONSE_NOT_VERIFIED');
  }
  console.log('WOS_P2_QA_GATE_CLOSE_ONLY_RPC=PASS');
  console.log('WOS_P2_QA_OPERATOR_GATE_OFF=PASS');
  console.log('WOS_P2_QA_OFFICE_GATE_OFF=PASS');
  console.log('WOS_P2_QA_FAILCLOSE_TRANSACTION_RECEIPT_VERIFIED=PASS');
}
close().catch(error=>{
  // Never log error objects, HTTP bodies, cookies or JWTs.
  console.error('WOS_P2_QA_FAILCLOSE_STAGE='+stage);
  console.error('WOS_P2_QA_FAILCLOSE_CLASS='+
    (error?.name==='AssertionError'?'GUARD':'RUNTIME_OR_NETWORK'));
  console.error('WOS_P2_QA_GATE_CLOSE_ONLY_RPC=UNVERIFIED');
  process.exitCode=1;
});
