// Protected QA-only Playwright proposal. This file MUST NOT execute from an
// untrusted PR event or with creds until merged to independently reviewed
// protected master and explicitly dispatched for PR241 exact HEAD.
// No screenshots, videos, traces, cookies, user names or secrets in logs.
'use strict';
const assert = require('node:assert/strict');
const {chromium} = require('/tmp/hongda-qa-browser/node_modules/playwright');
const origin='http://127.0.0.1:3000';
const qaUrl='https://xulmpqaknlwqqculbsek.supabase.co';
const exactHead='89bb408d13e45458c608db29c47e2803d49b3170';
const png=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
 'base64');
const creds=['ADMIN','OPERATOR','VIEWER','FOREIGN'].flatMap(x=>
 ['REVIEW_DEV_'+x+'_EMAIL','REVIEW_DEV_'+x+'_PASSWORD']);
function allowed() {
 return process.env.WOS_P2_PROTECTED_BROWSER_E2E_ACK==='true'
  && process.env.WOS_QA_BROWSER_ACK_TEST_WRITES==='true'
  && process.env.WOS_P2_REVIEWED_SHA===exactHead
  && process.env.AUTH_MODE==='supabase'
  && process.env.VERCEL_ENV==='preview'
  && process.env.NEXT_PUBLIC_SUPABASE_URL===qaUrl
  && process.env.WOS_P5C_NONPROD_API_ENABLED==='true'
  && process.env.WOS_P7_NONPROD_SUBMIT_ENABLED==='true'
  && process.env.WOS_P2_QA_MUTATIONS_ENABLED==='true'
  && process.env.WOS_P2_QA_OFFICE_REVISION_ENABLED==='true'
  && process.env.NEXT_PUBLIC_WOS_P2_QA_MUTATIONS_ENABLED==='true'
  && process.env.NEXT_PUBLIC_WOS_P2_QA_OFFICE_REVISION_ENABLED==='true'
  && process.env.NEXT_PUBLIC_WOS_QA_LOCAL_TEST==='true'
  && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  && creds.every(k=>Boolean(process.env[k]));
}
function evidence(code) {console.log('WOS_P2_PROTECTED_BROWSER_'+code+'=PASS');}
let stage='BEFORE_BROWSER';
async function login(browser,role,target) {
 const context=await browser.newContext({acceptDownloads:false});
 const page=await context.newPage();
 await page.goto(origin+'/login?redirect='+encodeURIComponent(target),{waitUntil:'domcontentloaded'});
 await page.locator('input[type=email]').fill(process.env['REVIEW_DEV_'+role+'_EMAIL']);
 await page.locator('input[type=password]').fill(process.env['REVIEW_DEV_'+role+'_PASSWORD']);
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.waitForURL(url=>!url.pathname.startsWith('/login'),{timeout:60000});
 await page.goto(origin+target,{waitUntil:'domcontentloaded'});
 return {context,page};
}
async function waitOrderCard(page,orderNumber) {
 await page.getByRole('button',{name:'刷新真实车间任务'}).waitFor({timeout:25000});
 await page.getByRole('button',{name:'刷新真实车间任务'}).click();
 const card=page.locator('article').filter({hasText:orderNumber}).first();
 await card.waitFor({timeout:50000});
 return card;
}
async function workshopAction(page,orderNumber,action,description) {
 const card=await waitOrderCard(page,orderNumber);
 await card.getByRole('button',{name:'查看真实生产要求与图片版本'}).click();
 const section=card.locator('section[aria-label="车间受控操作"]');
 await section.locator('select').first().selectOption(action);
 await section.locator('textarea').fill(description);
 const responseWait=page.waitForResponse(response=>
   response.url()===origin+'/api/workshop-orders/p2/actions'
   &&response.request().method()==='POST',{timeout:50000});
 await section.getByRole('button',{name:'提交到 QA 原子事务'}).click();
 const response=await responseWait;
 const body=await response.json().catch(()=>null);
 assert.equal(response.status(),200,'workshop action HTTP not persisted');
 assert.equal(body?.code,'QA_P2_ACTION_APPLIED');
 assert.equal(body?.ok,true);
 assert.equal(body?.data?.orderId,globalThis.currentOrderId);
 return body.data;
}
async function jsonPost(page,url,body,header) {
 return await page.evaluate(async ({url,body,header})=>{
  const resp=await fetch(url,{method:'POST',cache:'no-store',
    credentials:'same-origin',headers:{'Content-Type':'application/json',[header]:'1'},
    body:JSON.stringify(body)});
  const result=await resp.json().catch(()=>null);
  return {status:resp.status,code:result?.code,
   version:result?.data?.version,orderId:result?.data?.orderId};
 },{url,body,header});
}
async function main() {
 assert(allowed(),'P2_QA_ENVIRONMENT_OR_EXACT_PIN_NOT_AUTHORIZED');
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const sessions=[];
 try {
  stage='OFFICE_LOGIN';
  const office=await login(browser,'ADMIN','/workshop-orders/production/new');
  sessions.push(office.context);
  stage='CREATE_SYNTHETIC_ORDER';
  await office.page.getByRole('heading',{name:'QA Preview · 真实 HTTP 提交验收'}).waitFor();
  await office.page.getByRole('button',{name:'自动填入全套合成 QA 测试资料'}).click();
  const orderNumber=await office.page.locator('input#orderNumber').inputValue();
  assert(/^QA-NONPROD-[a-f0-9-]{36}$/i.test(orderNumber),'not synthetic order');
  await office.page.locator('input[type=file]').setInputFiles({
    name:'wos-p2-e2e-qa-only.png',mimeType:'image/png',buffer:png});
  await office.page.getByRole('button',{name:'检查资料完整性'}).click();
  await office.page.getByText('本地字段完整性检查通过',{exact:false}).waitFor();
  const submitWait=office.page.waitForResponse(response=>
    response.url()===origin+'/api/workshop-orders/production'
    &&response.request().method()==='POST',{timeout:110000});
  await office.page.getByRole('button',{name:'上传图片并提交 QA 订单'}).click();
  const submission=await submitWait;
  const submissionBody=await submission.json();
  assert.equal(submission.status(),200);
  assert.equal(submissionBody.code,'SUBMISSION_VERIFIED');
  assert.equal(submissionBody.data.productionStarted,false);
  const orderId=submissionBody.data.orderId;
  assert(typeof orderId==='string' && orderId.length===36);
  globalThis.currentOrderId=orderId;
  evidence('OFFICE_UI_SYNTHETIC_SUBMISSION_HTTP_AND_RECEIPT');

  stage='OPERATOR_LOGIN_ACCEPT';
  const operator=await login(browser,'OPERATOR','/workshop-orders/inbox');
  sessions.push(operator.context);
  let accepted=await workshopAction(operator.page,orderNumber,'ACCEPT',
    'QA operator has received the synthetic order for review');
  assert.equal(accepted.workflowStatus,'WORKSHOP_REVIEW');
  evidence('OPERATOR_AUTHENTICATED_ACCEPTED');

  stage='OPERATOR_RETURN';
  const returned=await workshopAction(operator.page,orderNumber,'RETURN_FOR_INFORMATION',
    'QA missing customer acceptance standard and print position reference');
  assert.equal(returned.workflowStatus,'NEEDS_INFORMATION');
  const originalReturnVersion=returned.version;
  evidence('OPERATOR_RETURN_BLOCKER_TRANSACTION');

  stage='OFFICE_READ_RETURNED';
  await office.page.goto(origin+'/workshop-orders/production/new',{waitUntil:'domcontentloaded'});
  const reload=office.page.getByRole('button',{name:'刷新退回任务'});
  await reload.waitFor();
  await reload.click();
  let officeCard=office.page.locator('article').filter({hasText:orderNumber}).first();
  await officeCard.waitFor({timeout:40000});
  await officeCard.getByText('QA missing customer acceptance standard',{exact:false}).waitFor();
  const fields={};
  for(const label of ['产品名称','产品材质','订单总数量','本批生产数量','客户验收标准','印刷定位 / 位置说明']){
    fields[label]=await officeCard.getByLabel(label).inputValue();
  }
  const requested=Number(fields['订单总数量']);
  const batch=Number(fields['本批生产数量']);
  assert(Number.isSafeInteger(requested)&&Number.isSafeInteger(batch)&&requested>=batch);
  const correctedName=(fields['产品名称']+' P2QA').slice(0,195);
  const correctedQuantity=requested+50;
  const correctedBatch=batch+1;
  assert(Number.isSafeInteger(correctedQuantity)&&correctedQuantity>0);
  assert(Number.isSafeInteger(correctedBatch)&&correctedBatch<=correctedQuantity);
  const sixFieldEdits={
    '产品名称':correctedName,
    '产品材质':'QA verified plastic composition '+orderNumber,
    '订单总数量':String(correctedQuantity),
    '本批生产数量':String(correctedBatch),
    '客户验收标准':'QA corrected visual quality standard '+orderNumber,
    '印刷定位 / 位置说明':'QA corrected 15 mm left alignment '+orderNumber,
  };
  for (const [label,newValue] of Object.entries(sixFieldEdits)) {
    assert.notEqual(newValue,fields[label],
      'six-field test must actually modify every original field');
    await officeCard.getByLabel(label).fill(newValue);
  }
  await officeCard.locator('textarea').fill('Office corrected all six allowed fields after workshop return.');

  stage='OFFICE_SAVE_REVISION';
  const requestWait=office.page.waitForRequest(req=>
    req.url()===origin+'/api/workshop-orders/p2/office-revisions'
    &&req.method()==='POST',{timeout:30000});
  const saveWait=office.page.waitForResponse(resp=>
    resp.url()===origin+'/api/workshop-orders/p2/office-revisions'
    &&resp.request().method()==='POST',{timeout:50000});
  await officeCard.getByRole('button',{name:'保存修订（生成新版本）'}).click();
  const saveRequest=await requestWait;
  const saved=await saveWait;const savedJson=await saved.json();
  assert.equal(saved.status(),200);
  assert.equal(savedJson.code,'QA_OFFICE_CORRECTION_SAVED');
  assert.equal(savedJson.data.version,originalReturnVersion+1);
  assert(/^QA-R\d+$/.test(savedJson.data.versionLabel));
  evidence('OFFICE_SIX_FIELD_VERSIONED_SAVE_AND_SNAPSHOT');
  // Retries must use the original durable fingerprint; SQL checks the request.
  const savedIntent=JSON.parse(saveRequest.postData());
  // The real browser must send all six allowlisted fields, not merely touch
  // six inputs while submitting an unchanged value.
  const sixExpectedKeys=[
    'productName','productMaterial','requestedQuantity',
    'currentBatchQuantity','customerAcceptanceStandard','positionReference',
  ];
  assert.deepEqual(Object.keys(savedIntent.patch).sort(),sixExpectedKeys.sort(),
    'save request did not contain six changed fields');
  assert.equal(savedIntent.patch.productName,sixFieldEdits['产品名称']);
  assert.equal(savedIntent.patch.productMaterial,sixFieldEdits['产品材质']);
  assert.equal(savedIntent.patch.requestedQuantity,correctedQuantity);
  assert.equal(savedIntent.patch.currentBatchQuantity,correctedBatch);
  assert.equal(savedIntent.patch.customerAcceptanceStandard,sixFieldEdits['客户验收标准']);
  assert.equal(savedIntent.patch.positionReference,sixFieldEdits['印刷定位 / 位置说明']);
  evidence('OFFICE_ALL_SIX_FIELDS_PRESENT_IN_AUTHENTICATED_HTTP_PATCH');
  const replay=await jsonPost(office.page,'/api/workshop-orders/p2/office-revisions',
    savedIntent,'x-wos-p2-office-revision');
  assert.equal(replay.status,200);
  assert.equal(replay.code,'QA_OFFICE_REVISION_REPLAYED');
  evidence('OFFICE_IDEMPOTENT_HTTP_REPLAY');
  const stale=await jsonPost(office.page,'/api/workshop-orders/p2/office-revisions',{
    orderId,expectedVersion:originalReturnVersion,requestId:crypto.randomUUID(),
    action:'SAVE_CORRECTION',reason:'A stale QA correction must be rejected.',
    patch:{productName:'Unauthorized stale revision'}
  },'x-wos-p2-office-revision');
  assert.equal(stale.status,409);
  evidence('OFFICE_STALE_VERSION_REJECTED');

  stage='OFFICE_RESUBMIT_SAVED';
  await office.page.getByRole('button',{name:'刷新退回任务'}).click();
  officeCard=office.page.locator('article').filter({hasText:orderNumber}).first();
  await officeCard.waitFor({timeout:30000});
  for (const [label,expectedValue] of Object.entries(sixFieldEdits)) {
    const observed=await officeCard.getByLabel(label).inputValue();
    assert.equal(observed,expectedValue,
      'Office re-read did not confirm persisted revision field: '+label);
  }
  evidence('OFFICE_SIX_FIELDS_RELOADED_FROM_QA_API');
  await officeCard.locator('textarea').fill('Resubmitting previously saved QA correction to the workshop.');
  const resubmitWait=office.page.waitForResponse(resp=>
    resp.url()===origin+'/api/workshop-orders/p2/office-revisions'
    &&resp.request().method()==='POST',{timeout:50000});
  await officeCard.getByRole('button',{name:'重新提交车间复核'}).click();
  const resubmit=await resubmitWait;
  const resubmitJson=await resubmit.json();
  assert.equal(resubmit.status(),200);
  assert.equal(resubmitJson.code,'QA_OFFICE_RESUBMITTED');
  assert.equal(resubmitJson.data.workflowStatus,'WORKSHOP_REVIEW');
  assert.equal(resubmitJson.data.version,savedJson.data.version+1);
  evidence('OFFICE_RESUBMIT_SAVED_REVISION_WITHOUT_DUPLICATING_P1_INBOX');

  stage='OPERATOR_REVIEW_REVISION';
  const reviewed=await workshopAction(operator.page,orderNumber,'REVIEW_CORRECTION',
    'Operator checked the latest corrected QA customer specifications and returned documents');
  assert.equal(reviewed.workflowStatus,'WAITING_MATERIAL');
  assert(Number.isInteger(reviewed.resolvedBlockers)&&reviewed.resolvedBlockers>=1);
  evidence('OPERATOR_REVIEW_CORRECTION_ONLY_RESOLVED_DOCUMENT_BLOCKER');

  stage='OLD_SIGNED_SAMPLE_DENIED';
  const signAttempt=await jsonPost(operator.page,'/api/workshop-orders/p2/actions',{
    orderId,expectedVersion:reviewed.version,requestId:crypto.randomUUID(),
    action:'CONFIRM_MATERIAL',resourceType:'SIGNED_SAMPLE',resourceStatus:'VERIFIED',
    quantityExpected:null,quantityArrived:null,
    note:'Old QA signed sample cannot be treated as verified after correction'
  },'x-wos-p2-action');
  assert.equal(signAttempt.status,409);
  evidence('OLD_SIGNED_SAMPLE_BLOCKED_FOR_CURRENT_REVISION');

  stage='VIEWER_AND_FOREIGN_DENY';
  for(const role of ['VIEWER','FOREIGN']) {
    const loginUser=await login(browser,role,'/workshop-orders/inbox');
    sessions.push(loginUser.context);
    const attack=await jsonPost(loginUser.page,'/api/workshop-orders/p2/actions',{
      orderId,expectedVersion:reviewed.version,requestId:crypto.randomUUID(),
      action:'RETURN_FOR_INFORMATION',
      note:'Forbidden synthetic QA user attempts to alter another order.'
    },'x-wos-p2-action');
    assert.equal(attack.status,403,'Viewer or foreign role was allowed to mutate');
    const inbox=await loginUser.page.evaluate(async()=>{
      const r=await fetch('/api/workshop-orders/inbox',{cache:'no-store',credentials:'same-origin'});
      return {status:r.status,body:await r.json().catch(()=>null)};
    });
    assert([200,403].includes(inbox.status),
      'negative read test returned unavailable endpoint instead of an access decision');
    if (inbox.status===200) {
      assert(Array.isArray(inbox.body?.data?.items),
        'negative read API response is not an authoritative item collection');
      const ids=inbox.body.data.items.map(x=>x.id);
      assert(!ids.includes(orderId),'forbidden account read target order');
    } else {
      assert.equal(inbox.body?.ok,false,
        'negative read denial was not verified');
    }
  }
  evidence('VIEWER_AND_FOREIGN_DENIED_WITHOUT_SIDE_EFFECTS');
  stage='FINAL_READBACK';
  const operatorInbox=await operator.page.evaluate(async()=>{
    const r=await fetch('/api/workshop-orders/inbox',{cache:'no-store',credentials:'same-origin'});
    return {status:r.status,data:await r.json().catch(()=>null)};
  });
  assert.equal(operatorInbox.status,200);
  const row=operatorInbox.data?.data?.items?.filter(x=>x.id===orderId)??[];
  assert.equal(row.length,1,'re-review cannot duplicate the original workshop item');
  assert.equal(row[0].workflowStatus,'WAITING_MATERIAL');
  assert(row[0].version>originalReturnVersion);
  assert.equal(row[0].versionLabel,resubmitJson.data.versionLabel);
  evidence('ONE_IMMUTABLE_P1_INBOX_AND_CURRENT_QA_REVISION');
  console.log('WOS_P2_PROTECTED_BROWSER_REAL_TWO_ROLE_E2E=PASS');
 } finally {
  for(const session of sessions)await session.close().catch(()=>{});
  await browser.close().catch(()=>{});
 }
}
main().catch(error=>{
 const kind=error?.name==='AssertionError'?'ASSERTION':error?.name==='TimeoutError'?'TIMEOUT':'ERROR';
 // Never log raw errors or serialized HTTP payloads: may contain session data.
 console.error('WOS_P2_PROTECTED_BROWSER_FAILURE_STAGE='+stage);
 console.error('WOS_P2_PROTECTED_BROWSER_FAILURE_CLASS='+kind);
 console.error('WOS_P2_PROTECTED_BROWSER_REAL_TWO_ROLE_E2E=FAIL');
 process.exitCode=1;
});
