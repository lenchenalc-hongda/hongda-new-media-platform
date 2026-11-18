// NO QA credentials, no network, no database writes. GitHub-hosted static + pure negative suite.
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {verifyFreshInboxPayload,refreshOperatorToV6,ID,ORDER,ORG,VERSION,LABEL,STATUS,ORIGIN}=
  require('../e2e/wos-p2-qa-resume-v6-refresh.cjs');
const attestor=require('../e2e/wos-p2-qa-resume-v6-owner-cas-attest.cjs');
const root=path.resolve(__dirname,'../..');
const sql=fs.readFileSync(path.join(root,'docs/workshop-order-system/nonproduction-only/wos_p2_resume_v6_readonly_owner_attest_QA_ONLY_NOT_INSTALLED.sql'),'utf8');
const cas=fs.readFileSync(path.join(root,'docs/workshop-order-system/nonproduction-only/wos_p2_resume_v6_owner_cas_ACTIVATION_TEMPLATE_NOT_AUTHORIZED.sql'),'utf8');
const browser=fs.readFileSync(path.join(root,'tests/e2e/wos-p2-qa-resume-v6-browser.cjs'),'utf8');
function fresh(){return {ok:true,code:'OK',data:{source:'SUPABASE_RLS',count:1,items:[{
  id:ID,orderNumber:ORDER,organizationId:ORG,entityType:'PRODUCTION_ORDER',
  version:VERSION,versionLabel:LABEL,workflowStatus:STATUS
}]}};}
test('v6 fresh inbox: exact QA order version and RLS read required',()=>{
  assert.equal(verifyFreshInboxPayload(fresh()),true);
  for(const [field,bad] of [
    ['id','00000000-0000-0000-0000-000000000000'],
    ['organizationId','00000000-0000-0000-0000-000000000000'],
    ['version',5],['version',7],['versionLabel','QA-R5'],
    ['workflowStatus','NEEDS_INFORMATION'],['workflowStatus','WAITING_MATERIAL']
  ]){
    const p=fresh();p.data.items[0][field]=bad;
    assert.throws(()=>verifyFreshInboxPayload(p));
  }
  const fake=fresh();fake.data.source='MOCK';assert.throws(()=>verifyFreshInboxPayload(fake));
});
test('refresh waits for response and React exact-version projection before details',async()=>{
  const sequence=[],payload=fresh();
  const resp={url:()=>ORIGIN+'/api/workshop-orders/inbox',request:()=>({method:()=> 'GET'}),
    status:()=>200,json:async()=>payload};
  const page={
    getByRole:()=>({waitFor:async()=>sequence.push('visible'),click:async()=>sequence.push('click')}),
    waitForResponse:async(pred)=>{sequence.push('registered_get');assert(pred(resp));return resp;},
    waitForFunction:async (fn,pins,opts)=>{sequence.push('rendered_v6');assert.equal(pins.versionLabel,'QA-R6');assert.equal(pins.status,'WORKSHOP_REVIEW');assert.equal(opts.timeout,30000);},
    locator:()=>({filter:()=>({first:()=>({waitFor:async()=>sequence.push('card_visible')})})}),
  };
  await refreshOperatorToV6(page);
  assert.deepEqual(sequence,['visible','registered_get','click','rendered_v6','card_visible']);
});
test('stale HTTP inbox v5 aborts before any DOM interaction or review POST',async()=>{
  let DOM=false;const old=fresh();old.data.items[0].version=5;
  const page={
    getByRole:()=>({waitFor:async()=>{},click:async()=>{}}),
    waitForResponse:async()=>({status:()=>200,json:async()=>old}),
    waitForFunction:async()=>{DOM=true},
  };
  await assert.rejects(()=>refreshOperatorToV6(page),/QA_V6_INBOX_MUST_BE_EXACT_VERSION_6/);
  assert.equal(DOM,false);
});
test('read-only attestor refuses wrong run id, version, expiry, or Gate shape',()=>{
  const now=Date.now(),c={runId:'49999999999'};
  const ready={status:'READY',githubRunId:c.runId,
    reviewedSha:'89bb408d13e45458c608db29c47e2803d49b3170',
    orderId:ID,expectedVersion:6,operatorEnabled:true,officeEnabled:true,
    expiresAt:new Date(now+8*60000).toISOString()};
  assert.equal(attestor.verifyReady(ready,c,now),true);
  for(const [key,bad] of [['githubRunId','44299301427'],['expectedVersion',2],
    ['expectedVersion',7],['operatorEnabled',false],['officeEnabled',false],
    ['orderId','00000000-0000-0000-0000-000000000000'],
    ['expiresAt',new Date(now+119000).toISOString()],
    ['expiresAt',new Date(now+1000000).toISOString()]]){
      assert.throws(()=>attestor.verifyReady({...ready,[key]:bad},c,now));
  }
});
test('CAS SQL requires the failed prior run to be closed and forbids replay',()=>{
  assert.match(cas,/REPLACE_WITH_FRESH_SEPARATELY_OWNER_APPROVED_RESUME_V6_RUN_ID/);
  assert.match(cas,/v_run_id='44299301427'/);
  assert.match(cas,/wos_qa_safety\.p2_gate_close_receipts/);
  assert.match(cas,/o\.workflow_status='WORKSHOP_REVIEW' AND o\.version=6/);
  assert.match(cas,/o\.version_label='QA-R6'/);
  assert.match(cas,/wos_qa_p2_resume_v6_owner_attest/);
  assert.match(cas,/OWNER_RUN_/);
  assert.match(cas,/_PR241_89bb408d_V6/);
  assert.match(cas,/wos_qa_safety\.p2_single_order_write_guard/);
  assert.doesNotMatch(cas,/UPDATE\s+public\.wos_production_orders/i);
  assert.match(cas,/BEGIN;/);assert.match(cas,/COMMIT;/);
});
test('v6 attestor is additive, JWT-scoped, explicitly GRANTed, and never opens Gates',()=>{
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.wos_qa_p2_resume_v6_owner_attest/);
  assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.wos_qa_p2_owner_cas_attest\(/);
  assert.match(sql,/p_expected_version IS DISTINCT FROM 6/);
  assert.match(sql,/v_order\.workflow_status IS DISTINCT FROM 'WORKSHOP_REVIEW'/);
  assert.match(sql,/v_order\.version_label IS DISTINCT FROM 'QA-R6'/);
  assert.match(sql,/c\.github_run_id='44299301427'/);
  assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated/);
  assert.match(sql,/auth\.uid\(\) IS NULL/);
  assert.doesNotMatch(sql,/UPDATE\s+public\.wos_qa_p2_(?:office_)?execution_gate/i);
});
test('resume browser uses only REVIEW_CORRECTION and denies old sample/foreign roles',()=>{
  assert.match(browser,/refreshOperatorToV6\(page\)/);
  assert.match(browser,/selectOption\('REVIEW_CORRECTION'\)/);
  assert.doesNotMatch(browser,/selectOption\('ACCEPT'\)/);
  assert.doesNotMatch(browser,/RETURN_FOR_INFORMATION'[\s\S]{0,100}operatorReview/);
  assert.match(browser,/SIGNED_SAMPLE/);
  assert.match(browser,/oldSign\.status,409/);
  assert.match(browser,/for\(const role of \['VIEWER','FOREIGN'\]\)/);
  assert.match(browser,/attack\.status,403/);
  assert.match(browser,/WAITING_MATERIAL/);
});
