// Trusted QA-only resumed Playwright test. NEVER run from unreviewed PR with credentials.
// Preserves the v2->v6 real QA history; performs only REVIEW_CORRECTION at exact v6.
// No screenshots, video, traces, tokens, emails, session state or order contents in logs.
'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {chromium}=require('/tmp/hongda-qa-browser/node_modules/playwright');
const {checkOnce}=require('./wos-p2-qa-resume-v6-owner-cas-attest.cjs');
const {refreshOperatorToV6,ID,ORDER,VERSION,LABEL,ORIGIN}=require('./wos-p2-qa-resume-v6-refresh.cjs');
const QA='https://xulmpqaknlwqqculbsek.supabase.co';
const HEAD='89bb408d13e45458c608db29c47e2803d49b3170';
const roles=['ADMIN','OPERATOR','VIEWER','FOREIGN'];
const secrets=roles.flatMap(r=>['REVIEW_DEV_'+r+'_EMAIL','REVIEW_DEV_'+r+'_PASSWORD']);
function authorized(env=process.env){
  return env.GITHUB_REPOSITORY==='lenchenalc-hongda/hongda-new-media-platform'
    &&env.GITHUB_REF==='refs/heads/master'
    &&env.GITHUB_RUN_ATTEMPT==='1'
    &&/^[0-9]{5,20}$/.test(env.GITHUB_RUN_ID||'')
    &&/^[0-9a-f]{40}$/.test(env.GITHUB_SHA||'')
    &&env.WOS_P2_TRUSTED_MASTER_SHA===env.GITHUB_SHA
    &&env.WOS_P2_REVIEWED_SHA===HEAD
    &&env.WOS_P2_OWNER_CAS_READONLY_ACK==='true'
    &&env.WOS_P2_REUSE_EXISTING_ORDER_ONLY==='true'
    &&env.WOS_P2_RESUME_V6_ONLY==='true'
    &&env.WOS_P2_PROTECTED_BROWSER_E2E_ACK==='true'
    &&env.WOS_QA_BROWSER_ACK_TEST_WRITES==='true'
    &&env.AUTH_MODE==='supabase'
    &&env.VERCEL_ENV==='preview'
    &&env.NEXT_PUBLIC_SUPABASE_URL===QA
    &&env.WOS_P5C_NONPROD_API_ENABLED==='true'
    &&env.WOS_P7_NONPROD_SUBMIT_ENABLED==='true'
    &&env.WOS_P2_QA_MUTATIONS_ENABLED==='true'
    &&env.WOS_P2_QA_OFFICE_REVISION_ENABLED==='true'
    &&env.NEXT_PUBLIC_WOS_P2_QA_MUTATIONS_ENABLED==='true'
    &&env.NEXT_PUBLIC_WOS_P2_QA_OFFICE_REVISION_ENABLED==='true'
    &&env.NEXT_PUBLIC_WOS_QA_LOCAL_TEST==='true'
    &&Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    &&secrets.every(k=>Boolean(env[k]));
}
function evidence(code){console.log('WOS_P2_QA_RESUME_V6_'+code+'=PASS');}
let stage='NOT_STARTED';
async function login(browser,role,target){
  const context=await browser.newContext({acceptDownloads:false});
  const page=await context.newPage();
  await page.goto(ORIGIN+'/login?redirect='+encodeURIComponent(target),{waitUntil:'domcontentloaded'});
  await page.locator('input[type=email]').fill(process.env['REVIEW_DEV_'+role+'_EMAIL']);
  await page.locator('input[type=password]').fill(process.env['REVIEW_DEV_'+role+'_PASSWORD']);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.waitForURL(url=>!url.pathname.startsWith('/login'),{timeout:60000});
  await page.goto(ORIGIN+target,{waitUntil:'domcontentloaded'});
  return {context,page};
}
async function jsonPost(page,url,body,header){
  return page.evaluate(async ({url,body,header})=>{
    const r=await fetch(url,{method:'POST',cache:'no-store',credentials:'same-origin',
      headers:{'Content-Type':'application/json',[header]:'1'},body:JSON.stringify(body)});
    const value=await r.json().catch(()=>null);
    return {status:r.status,code:value?.code};
  },{url,body,header});
}
async function operatorReview(page){
  // Only the authoritative GET + React-rendered QA-R6/WORKSHOP_REVIEW is accepted.
  const card=await refreshOperatorToV6(page);
  evidence('OPERATOR_FRESH_V6_API_AND_RENDERED_INBOX');
  await card.getByRole('button',{name:'查看真实生产要求与图片版本'}).click();
  const section=card.locator('section[aria-label="车间受控操作"]');
  try{await section.waitFor({state:'visible',timeout:20000});}
  catch{
    const alert=await card.locator('[role="alert"]').count();
    throw new Error(alert>0?'QA_V6_DETAIL_VERSION_REVALIDATION_REJECTED':'QA_V6_REVIEW_SECTION_NOT_RENDERED');
  }
  await section.locator('select').first().selectOption('REVIEW_CORRECTION');
  await section.locator('textarea').fill(
    'Operator verified the persisted QA-R6 correction; resolve only the document blocker');
  const responseWait=page.waitForResponse(resp=>
    resp.url()===ORIGIN+'/api/workshop-orders/p2/actions'
    &&resp.request().method()==='POST',{timeout:50000});
  await section.getByRole('button',{name:'提交到 QA 原子事务'}).click();
  const r=await responseWait,body=await r.json().catch(()=>null);
  assert.equal(r.status(),200,'QA_V6_OPERATOR_REVIEW_HTTP_NOT_200');
  assert.equal(body?.ok,true,'QA_V6_REVIEW_RESPONSE_NOT_OK');
  assert.equal(body?.code,'QA_P2_ACTION_APPLIED','QA_V6_REVIEW_NOT_PERSISTED');
  assert.equal(body?.data?.orderId,ID,'QA_V6_ORDER_SCOPE_CHANGED');
  assert.equal(body?.data?.version,VERSION+1,'QA_V6_EXPECTED_VERSION_7');
  assert.equal(body?.data?.versionLabel,LABEL,'QA_V6_LABEL_PRESERVED');
  assert.equal(body?.data?.workflowStatus,'WAITING_MATERIAL','QA_V6_NOT_WAITING_MATERIAL');
  assert(Number.isInteger(body?.data?.resolvedBlockers)&&body.data.resolvedBlockers>=1,
    'QA_V6_DOCUMENT_BLOCKER_NOT_RESOLVED');
  return body.data;
}
async function main(){
  assert(authorized(),'QA_V6_PROTECTED_EXACT_SCOPE_DENIED');
  stage='LIVE_OWNER_CAS_REATTESTATION';
  assert.equal((await checkOnce()).status,'READY','QA_V6_RUN_BOUND_OWNER_CAS_NOT_READY');
  evidence('OWNER_CAS_LIVE_DB_REVERIFIED_BEFORE_BROWSER');
  const browser=await chromium.launch({headless:true,args:[
    '--no-sandbox','--host-resolver-rules=MAP localhost 127.0.0.1'
  ]});
  const sessions=[];
  try{
    stage='OPERATOR_LOGIN_FOR_V6_ONLY';
    const operator=await login(browser,'OPERATOR','/workshop-orders/inbox');
    sessions.push(operator.context);
    stage='OPERATOR_REVIEW_QA_R6';
    const reviewed=await operatorReview(operator.page);
    evidence('OPERATOR_REVIEW_CORRECTION_V6_TO_V7');
    stage='OLD_SIGNED_SAMPLE_DENIED';
    const oldSign=await jsonPost(operator.page,'/api/workshop-orders/p2/actions',{
      orderId:ID,expectedVersion:reviewed.version,requestId:crypto.randomUUID(),
      action:'CONFIRM_MATERIAL',resourceType:'SIGNED_SAMPLE',resourceStatus:'VERIFIED',
      quantityExpected:null,quantityArrived:null,
      note:'QA existing old signed sample cannot be used after the current v6 correction'
    },'x-wos-p2-action');
    assert.equal(oldSign.status,409,'QA_V6_OLD_SIGNED_SAMPLE_NOT_BLOCKED');
    evidence('OLD_SIGNED_SAMPLE_409_REJECTED');
    stage='VIEWER_FOREIGN_MUTATION_AND_READ_DENIAL';
    for(const role of ['VIEWER','FOREIGN']){
      const session=await login(browser,role,'/workshop-orders/inbox');
      sessions.push(session.context);
      const attack=await jsonPost(session.page,'/api/workshop-orders/p2/actions',{
        orderId:ID,expectedVersion:reviewed.version,requestId:crypto.randomUUID(),
        action:'RETURN_FOR_INFORMATION',
        note:'Unprivileged synthetic QA identity tries to alter a different order'
      },'x-wos-p2-action');
      assert.equal(attack.status,403,'QA_V6_FORBIDDEN_ROLE_COULD_MUTATE');
      const get=await session.page.evaluate(async()=>{
        const r=await fetch('/api/workshop-orders/inbox',{cache:'no-store',credentials:'same-origin'});
        return {status:r.status,body:await r.json().catch(()=>null)};
      });
      assert([200,403].includes(get.status),'QA_V6_FORBIDDEN_INBOX_NOT_A_DECISION');
      if(get.status===200){
        assert(Array.isArray(get.body?.data?.items),'QA_V6_FORBIDDEN_COLLECTION_UNVERIFIED');
        assert(!get.body.data.items.some(x=>x.id===ID),'QA_V6_FORBIDDEN_ACCOUNT_READ_ORDER');
      }else assert.equal(get.body?.ok,false);
      evidence(role+'_WRITE_AND_READ_DENIED');
    }
    stage='OPERATOR_FINAL_READBACK';
    const inbox=await operator.page.evaluate(async()=>{
      const r=await fetch('/api/workshop-orders/inbox',{cache:'no-store',credentials:'same-origin'});
      return {status:r.status,body:await r.json().catch(()=>null)};
    });
    assert.equal(inbox.status,200,'QA_V6_FINAL_OPERATOR_INBOX_NOT_OK');
    assert.equal(inbox.body?.data?.source,'SUPABASE_RLS','QA_V6_FINAL_INBOX_NOT_REAL');
    const rows=inbox.body?.data?.items?.filter(x=>x.id===ID)??[];
    assert.equal(rows.length,1,'QA_V6_DUPLICATED_OR_MISSING_ORIGINAL_INBOX');
    assert.equal(rows[0].workflowStatus,'WAITING_MATERIAL');
    assert.equal(rows[0].version,VERSION+1);
    assert.equal(rows[0].versionLabel,LABEL);
    evidence('SINGLE_INBOX_WAITING_MATERIAL_V7');
    console.log('WOS_P2_QA_RESUME_V6_REAL_E2E=PASS');
  }finally{
    for(const c of sessions)await c.close().catch(()=>{});
    await browser.close().catch(()=>{});
  }
}
if(require.main===module){
 main().catch(error=>{
   const kind=error?.name==='AssertionError'?'ASSERTION':
     error?.name==='TimeoutError'?'TIMEOUT':'ERROR';
   // No raw exception, response payload, email, JWT or trace is ever logged.
   console.error('WOS_P2_QA_RESUME_V6_FAILURE_STAGE='+stage);
   console.error('WOS_P2_QA_RESUME_V6_FAILURE_CLASS='+kind);
   console.error('WOS_P2_QA_RESUME_V6_REAL_E2E=FAIL');
   process.exitCode=1;
 });
}
module.exports={authorized};
