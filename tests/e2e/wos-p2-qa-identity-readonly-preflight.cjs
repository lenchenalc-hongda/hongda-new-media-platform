// Protected WOS P2 QA identity-only preflight. Never used in pull-request
// workflows or given production credentials. NO WOS order/storage/RPC writes.
// Supabase Auth sign-in creates disposable QA authentication sessions, but this
// script never submits business mutations or enables database execution gates.
'use strict';
const assert = require('node:assert/strict');

const QA_ORIGIN='https://xulmpqaknlwqqculbsek.supabase.co';
const EXACT_P2='89bb408d13e45458c608db29c47e2803d49b3170';
const REPO='lenchenalc-hongda/hongda-new-media-platform';
const ROLES=[
  {name:'ADMIN',expected:'admin'},
  {name:'OPERATOR',expected:'operator'},
  {name:'VIEWER',expected:'viewer'},
  // QA foreign fixture currently belongs to a separate organization as Sales;
  // this is NOT an independent foreign-organization Operator test.
  {name:'FOREIGN',expected:'sales'},
];
function fail(code) {
  const error=new Error(code);
  error.name='QaIdentityPreflightRejected';
  throw error;
}
function uuid(value) {
  return typeof value==='string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function checkEnv(env) {
  assert.equal(env.GITHUB_REPOSITORY,REPO,'REPO_GUARD');
  assert.equal(env.GITHUB_REF,'refs/heads/master','PROTECTED_MASTER_ONLY');
  assert.equal(env.WOS_P2_QA_READONLY_PREFLIGHT_ACK,'true','READONLY_ACK_REQUIRED');
  assert.equal(env.WOS_P2_REVIEWED_SHA,EXACT_P2,'EXACT_P2_SHA_REQUIRED');
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,QA_ORIGIN,'QA_PROJECT_PIN');
  assert.equal(env.WOS_P2_QA_MUTATIONS_ENABLED,'true','REVIEWED_LOCAL_PREVIEW_FLAG');
  const key=env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(typeof key!=='string'||key.length<20) fail('PUBLISHABLE_KEY_REQUIRED');
  for(const {name} of ROLES) {
    if(!env['REVIEW_DEV_'+name+'_EMAIL']||!env['REVIEW_DEV_'+name+'_PASSWORD'])
      fail('PROTECTED_QA_ACCOUNT_SECRET_MISSING');
  }
  return key;
}
async function fetchJson(fetchImpl,url,init,expectedStatus,stage) {
  const response=await fetchImpl(url,{...init,redirect:'error',
    signal:AbortSignal.timeout(16000)});
  if(response.status!==expectedStatus) fail(stage+'_HTTP_STATUS');
  const body=await response.json().catch(()=>null);
  if(body===null) fail(stage+'_INVALID_JSON');
  return body;
}
async function verifyOne(fetchImpl,env,key,{name,expected}) {
  const email=env['REVIEW_DEV_'+name+'_EMAIL'];
  const password=env['REVIEW_DEV_'+name+'_PASSWORD'];
  const auth=await fetchJson(fetchImpl,QA_ORIGIN+'/auth/v1/token?grant_type=password',{
    method:'POST',headers:{'Content-Type':'application/json',apikey:key},
    body:JSON.stringify({email,password}),
  },200,'QA_AUTH');
  const token=auth.access_token;
  if(typeof token!=='string'||token.length<30||!uuid(auth.user?.id))
    fail('QA_AUTH_TOKEN_OR_SUBJECT_INVALID');
  const query=new URLSearchParams({
    select:'id,org_id,user_id,role,is_active',
    user_id:'eq.'+auth.user.id,
    is_active:'eq.true',
    limit:'2'
  });
  const profiles=await fetchJson(fetchImpl,
    QA_ORIGIN+'/rest/v1/profiles?'+query.toString(),{
      method:'GET',headers:{apikey:key,Authorization:'Bearer '+token,
        Accept:'application/json'},
    },200,'QA_PROFILE');
  if(!Array.isArray(profiles)||profiles.length!==1)
    fail('QA_PROFILE_CARDINALITY_OR_RLS');
  const profile=profiles[0];
  if(!uuid(profile.id)||!uuid(profile.org_id)
      ||profile.user_id!==auth.user.id
      ||profile.is_active!==true||profile.role!==expected)
    fail('QA_PROFILE_ROLE_OR_SCOPE_MISMATCH');
  return {name,orgId:profile.org_id,userId:auth.user.id};
}
async function run({env=process.env,fetchImpl=fetch,emit=console.log}={}) {
  const key=checkEnv(env);
  const checked=[];
  for(const fixture of ROLES) {
    checked.push(await verifyOne(fetchImpl,env,key,fixture));
    emit('WOS_P2_QA_'+fixture.name+'_AUTH_PROFILE_ROLE=PASS');
  }
  const [admin,operator,viewer,foreign]=checked;
  if(admin.orgId!==operator.orgId||admin.orgId!==viewer.orgId)
    fail('QA_SAME_ORG_FIXTURES_NOT_ALIGNED');
  if(foreign.orgId===admin.orgId)
    fail('QA_FOREIGN_ORGANIZATION_NOT_INDEPENDENT');
  if(new Set(checked.map(x=>x.userId)).size!==4)
    fail('QA_ACCOUNTS_ARE_NOT_FOUR_DISTINCT_IDENTITIES');
  emit('WOS_P2_QA_ORG_SEPARATION_CONFIRMED=PASS');
  emit('WOS_P2_QA_FOREIGN_SALES_NOT_OPERATOR=ACKNOWLEDGED');
  emit('WOS_P2_QA_AUTHENTICATION_PREFLIGHT_NO_BUSINESS_WRITES=PASS');
  return {ok:true};
}
if(require.main===module) {
  run().catch(error=>{
    // Never log email, passwords, JWT, profile UUIDs or raw HTTP responses.
    const code=error?.name==='QaIdentityPreflightRejected'
      ? 'QA_PROFILE_OR_AUTH_REJECTED'
      : error?.name==='AssertionError'?'EXECUTION_SCOPE_GUARD':'NETWORK_OR_RUNTIME';
    console.error('WOS_P2_QA_READONLY_PREFLIGHT='+code);
    process.exitCode=1;
  });
}
module.exports={run,checkEnv};
