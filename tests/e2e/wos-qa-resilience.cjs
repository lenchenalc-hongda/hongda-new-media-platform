// Protected non-production ONLY. Browser/HTTP test with real QA identities.
// Fresh login cycles, refresh-token exchange, browser process restart after
// a committed upload response is lost. Never log credentials/cookies/tokens.
const assert = require('node:assert/strict');
const {chromium} = require('/tmp/hongda-qa-browser/node_modules/playwright');
const origin = 'http://localhost:3000';
const projectRef = 'xulmpqaknlwqqculbsek';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZ0AAAAASUVORK5CYII=','base64');
const qaFile = () => ({name:'qa-resilience-proof.png',mimeType:'image/png',buffer:png});
function allowed() {
  return process.env.WOS_QA_BROWSER_ACK_TEST_WRITES === 'true'
    && process.env.AUTH_MODE === 'supabase'
    && process.env.VERCEL_ENV === 'preview'
    && process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://' + projectRef + '.supabase.co'
    && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    && process.env.WOS_P5C_NONPROD_API_ENABLED === 'true'
    && process.env.WOS_P7_NONPROD_SUBMIT_ENABLED === 'true'
    && process.env.NEXT_PUBLIC_WOS_QA_LOCAL_TEST === 'true'
    && !!process.env.REVIEW_DEV_ADMIN_EMAIL && !!process.env.REVIEW_DEV_ADMIN_PASSWORD;
}
let stage = 'PRECHECK';
async function login(browser) {
  const ctx = await browser.newContext({acceptDownloads:false});
  const page = await ctx.newPage();
  stage = 'FRESH_LOGIN';
  await page.goto(origin + '/login?redirect=%2Fworkshop-orders%2Fproduction%2Fnew', {waitUntil:'domcontentloaded'});
  await page.locator('input[type=email]').fill(process.env.REVIEW_DEV_ADMIN_EMAIL);
  await page.locator('input[type=password]').fill(process.env.REVIEW_DEV_ADMIN_PASSWORD);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.waitForURL(url=>!url.pathname.startsWith('/login'), {timeout:60000});
  await page.goto(origin + '/workshop-orders/production/new',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'QA Preview · 真实 HTTP 提交验收'}).waitFor({timeout:30000});
  return {ctx,page};
}
async function checkInbox(page) {
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/workshop-orders/inbox',{credentials:'same-origin',cache:'no-store'});
    const body = await response.json().catch(()=>null);
    return {status:response.status, code:body?.code};
  });
  assert.equal(result.status,200,'auth-scoped API request must remain successful');
  assert.equal(result.code,'OK');
}
async function main() {
  assert(allowed(),'QA_PROTECTED_ENVIRONMENT_REQUIRED');
  let browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  let fresh;
  try {
    for (let i=1; i<=5; i++) {
      stage = 'FRESH_LOGIN_CYCLE_' + i;
      fresh = await login(browser);
      stage = 'FORCED_REFRESH_CYCLE_' + i;
      await fresh.page.getByRole('button',{name:'QA 强制刷新登录会话'}).click();
      await fresh.page.getByText('QA_AUTH_REFRESH_VERIFIED',{exact:true}).waitFor({timeout:50000});
      await checkInbox(fresh.page);
      console.log('WOS_QA_FRESH_LOGIN_AND_REFRESH_CYCLE_' + i + '=PASS');
      await fresh.ctx.close();
      fresh = null;
      await new Promise(resolve=>setTimeout(resolve,2500));
    }
    console.log('WOS_QA_FRESH_LOGIN_AND_REFRESH_SUCCESS_COUNT=5');
    stage = 'UPLOAD_CRASH_SETUP';
    fresh = await login(browser);
    const page = fresh.page;
    await page.getByRole('button',{name:'自动填入全套合成 QA 测试资料'}).click();
    const orderNumber = await page.locator('input#orderNumber').inputValue();
    assert(/^QA-NONPROD-[0-9a-f-]{36}$/i.test(orderNumber));
    await page.locator('input[type=file]').setInputFiles(qaFile());
    await page.getByRole('button',{name:'检查资料完整性'}).click();
    await page.getByText('本地字段完整性检查通过',{exact:false}).waitFor({timeout:15000});
    let uploaded = false;
    let signalSuccess;
    let signalFailure;
    const commitSignal = new Promise((resolve,reject)=>{signalSuccess=resolve;signalFailure=reject;});
    await page.route('**/storage/v1/object/wos-private/**', async route => {
      if (uploaded || route.request().method() !== 'POST') { await route.continue(); return; }
      try {
        const response = await route.fetch({timeout:70000});
        if (response.status() !== 200 && response.status() !== 201) {
          await route.fulfill({response});
          signalFailure(new Error('STORAGE_POST_NOT_COMMITTED'));
          return;
        }
        uploaded = true;
        // Server has stored actual bytes. Pretend network dropped its reply.
        await route.abort('failed');
        signalSuccess();
      } catch (e) { signalFailure(e); }
    });
    stage = 'UPLOAD_RESPONSE_LOST';
    await page.getByRole('button',{name:'上传图片并提交 QA 订单'}).click();
    await Promise.race([
      commitSignal,
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('UPLOAD_TIMEOUT')),80000))
    ]);
    assert(uploaded,'actual upload must commit before browser shutdown');
    const persisted = await fresh.ctx.storageState();
    const keys = persisted.origins.flatMap(x=>x.localStorage.map(y=>y.name));
    assert(keys.some(x=>x.startsWith('hongda:wos-qa:synthetic-recovery:v2:')),
      'actor-scoped recovery key saved before close');
    // storageState is strictly in-memory and never logged or uploaded.
    await fresh.ctx.close();
    fresh=null;
    await browser.close();
    console.log('WOS_QA_INTERRUPTED_UPLOAD_SERVER_COMMITTED_BROWSER_CLOSED=PASS');
    stage = 'NEW_BROWSER_PROCESS_RESUME';
    browser = await chromium.launch({headless:true,args:['--no-sandbox']});
    const resumed = await browser.newContext({acceptDownloads:false,storageState:persisted});
    fresh = {ctx:resumed,page:await resumed.newPage()};
    await fresh.page.goto(origin+'/workshop-orders/production/new',{waitUntil:'domcontentloaded'});
    await fresh.page.getByText('检测到同一用户上次中断的合成订单',{exact:false})
      .waitFor({timeout:30000});
    assert.equal(await fresh.page.locator('input#orderNumber').inputValue(),orderNumber);
    const file = fresh.page.locator('input[type=file]');
    if (await file.isEnabled()) await file.setInputFiles(qaFile());
    await fresh.page.getByRole('button',{name:'检查资料完整性'}).click();
    await fresh.page.getByText('本地字段完整性检查通过',{exact:false}).waitFor({timeout:15000});
    stage = 'RECONCILE_ORIGINAL_IMAGE_AND_ORDER';
    await fresh.page.getByRole('button',{name:'使用同一订单和幂等键继续验证'}).click();
    await fresh.page.getByText('已由真实 HTTP API 提交',{exact:false}).waitFor({timeout:110000});
    stage = 'RESTORED_INBOX_AND_PRIVATE_IMAGE';
    await fresh.page.goto(origin+'/workshop-orders/inbox',{waitUntil:'domcontentloaded'});
    await fresh.page.getByRole('button',{name:'刷新真实车间任务'}).waitFor({timeout:30000});
    const inboxResponseWait = fresh.page.waitForResponse(r =>
      r.url() === origin+'/api/workshop-orders/inbox' && r.request().method()==='GET',
      {timeout:50000});
    await fresh.page.getByRole('button',{name:'刷新真实车间任务'}).click();
    const inboxResponse = await inboxResponseWait;
    const inboxData = await inboxResponse.json();
    const matching = inboxData?.data?.items?.filter(i =>
      i.entityType === 'PRODUCTION_ORDER' && i.orderNumber === orderNumber);
    assert.equal(inboxResponse.status(),200);
    assert.equal(inboxData?.code,'OK');
    assert.equal(matching?.length,1,'restored order must exist exactly once in workshop Inbox');
    assert.equal(matching[0].workflowStatus,'SUBMITTED');
    const card = fresh.page.locator('article').filter({hasText:orderNumber});
    await card.getByRole('button',{name:'用当前车间身份读取私有图片'}).click();
    await card.getByRole('link',{name:'打开已验证的私有图片'}).waitFor({timeout:50000});
    console.log('WOS_QA_REOPEN_SINGLE_INBOX_ITEM_AND_PRIVATE_BINARY=PASS');
    console.log('WOS_QA_NEW_BROWSER_RESTORES_ORIGINAL_ORDER_AND_IMAGE=PASS');
    console.log('WOS_QA_RESILIENCE_E2E=PASS');
  } finally {
    if (fresh) await fresh.ctx.close().catch(()=>{});
    await browser.close().catch(()=>{});
  }
}
main().catch(error=>{
  const kind=error?.name==='AssertionError'?'ASSERTION':error?.name==='TimeoutError'?'TIMEOUT':'ERROR';
  // No raw error text can reach logs, since failed requests can embed tokens.
  console.error('WOS_QA_RESILIENCE_FAILURE_STAGE='+stage);
  console.error('WOS_QA_RESILIENCE_FAILURE_CLASS='+kind);
  console.error('WOS_QA_RESILIENCE_E2E=FAIL');
  process.exitCode=1;
});
