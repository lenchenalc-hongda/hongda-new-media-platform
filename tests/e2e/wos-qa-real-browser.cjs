// Real browser clicks against locally served Next.js Preview-mode runtime,
// pinned to isolated hongda-review-dev, with protected QA GitHub Environment.
// No passwords/tokens are logged, and no screenshots/traces containing cookies
// are uploaded. This is NOT proof that Vercel SSO-protected deployment UI works.
const assert = require('node:assert/strict');
const { chromium } = require('/tmp/hongda-qa-browser/node_modules/playwright');

const origin = 'http://localhost:3000';
const projectRef = 'xulmpqaknlwqqculbsek';
const qaEnvKeys = [
  'REVIEW_DEV_SUPABASE_ANON_KEY',
  'REVIEW_DEV_ADMIN_EMAIL','REVIEW_DEV_ADMIN_PASSWORD',
  'REVIEW_DEV_OPERATOR_EMAIL','REVIEW_DEV_OPERATOR_PASSWORD',
  'REVIEW_DEV_VIEWER_EMAIL','REVIEW_DEV_VIEWER_PASSWORD',
  'REVIEW_DEV_FOREIGN_EMAIL','REVIEW_DEV_FOREIGN_PASSWORD',
];
function allowed() {
  return process.env.WOS_QA_BROWSER_ACK_TEST_WRITES === 'true'
    && process.env.VERCEL_ENV === 'preview'
    && process.env.AUTH_MODE === 'supabase'
    && process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://' + projectRef + '.supabase.co'
    && process.env.WOS_P5C_NONPROD_API_ENABLED === 'true'
    && process.env.WOS_P7_NONPROD_SUBMIT_ENABLED === 'true'
    && process.env.NEXT_PUBLIC_WOS_QA_LOCAL_TEST === 'true'
    && qaEnvKeys.every(k => !!process.env[k]);
}
function trace(name, ok) {
  console.log('WOS_BROWSER_QA_' + name + '=' + (ok ? 'PASS' : 'FAIL'));
}
async function login(browser, key, destination) {
  const ctx = await browser.newContext({ acceptDownloads: false });
  const page = await ctx.newPage();
  await page.goto(origin + '/login?redirect=' + encodeURIComponent(destination), { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').fill(process.env['REVIEW_DEV_' + key + '_EMAIL']);
  await page.locator('input[type=password]').fill(process.env['REVIEW_DEV_' + key + '_PASSWORD']);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 60000 });
  await page.goto(origin + destination, { waitUntil: 'domcontentloaded' });
  return {ctx, page};
}
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZ0AAAAASUVORK5CYII=',
  'base64'
);
async function main() {
  assert(allowed(), 'QA_PINS_OR_PROTECTED_SECRETS_MISSING');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const contexts = [];
  try {
    const office = await login(browser, 'ADMIN', '/workshop-orders/production/new');
    contexts.push(office.ctx);
    await office.page.getByRole('heading', { name: 'QA Preview · 真实 HTTP 提交验收' }).waitFor({ timeout: 20000 });
    await office.page.getByRole('button', { name: '自动填入全套合成 QA 测试资料' }).click();
    const orderNumber = await office.page.locator('input#orderNumber').inputValue();
    assert(/^QA-NONPROD-[a-f0-9-]{36}$/i.test(orderNumber));
    await office.page.locator('input[type=file]').setInputFiles({
      name: 'qa-browser-proof.png', mimeType: 'image/png', buffer: png,
    });
    await office.page.getByRole('button', { name: '检查资料完整性' }).click();
    await office.page.getByText('本地字段完整性检查通过', { exact: false }).waitFor();
    let postResponse = null;
    const postWait = office.page.waitForResponse(response => {
      return response.url() === origin + '/api/workshop-orders/production'
        && response.request().method() === 'POST';
    }, { timeout: 110000 });
    await office.page.getByRole('button', { name: '上传图片并提交 QA 订单' }).click();
    postResponse = await postWait;
    const postBody = await postResponse.json();
    const correct = postResponse.status() === 200
      && postBody?.ok === true
      && ['SUBMISSION_VERIFIED','SUBMISSION_REPLAY_VERIFIED'].includes(postBody.code)
      && postBody.data?.persisted === true
      && postBody.data?.productionStarted === false
      && typeof postBody.data?.orderId === 'string';
    trace('OFFICE_CLICK_PRIVATE_IMAGE_AND_HTTP_SUBMIT',correct);
    assert(correct,'OFFICE_HTTP_SUBMISSION_NOT_VERIFIED');
    await office.page.getByText('已由真实 HTTP API 提交', { exact: false }).waitFor();
    const orderId = postBody.data.orderId;

    const workshop = await login(browser,'OPERATOR','/workshop-orders/inbox');
    contexts.push(workshop.ctx);
    await workshop.page.getByRole('button', { name: '刷新真实车间任务' }).waitFor();
    const inboxResponsePromise = workshop.page.waitForResponse(
      r => r.url() === origin + '/api/workshop-orders/inbox'
        && r.request().method() === 'GET', { timeout: 50000 }
    );
    await workshop.page.getByRole('button', { name: '刷新真实车间任务' }).click();
    const inboxResponse = await inboxResponsePromise;
    const inbox = await inboxResponse.json();
    const matches = inbox?.data?.items?.filter(i => i.id === orderId && i.orderNumber === orderNumber);
    const matched = inboxResponse.status() === 200 && inbox?.code === 'OK'
      && matches?.length === 1 && matches[0]?.workflowStatus === 'SUBMITTED';
    trace('OPERATOR_REFRESH_HTTP_INBOX',matched);
    assert(matched,'OPERATOR_INBOX_NOT_VISIBLE');
    const card = workshop.page.locator('article').filter({ hasText: orderNumber });
    await card.getByRole('button', { name: '用当前车间身份读取私有图片' }).click();
    await card.getByRole('link', { name: '打开已验证的私有图片' })
      .waitFor({ timeout: 50000 });
    trace('OPERATOR_PRIVATE_IMAGE_BINARY_READ',true);

    const operatorForbidden = await workshop.page.evaluate(async () => {
      const res = await fetch('/api/workshop-orders/production', {
        method:'POST', credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({idempotencyKey:'00000000-0000-4000-8000-000000000001',
          expectedVersion:1,payload:{orderId:'00000000-0000-4000-8000-000000000001',versionLabel:'V1'}})
      });
      return res.status;
    });
    assert.equal(operatorForbidden,403);
    trace('OPERATOR_FORBIDDEN_TO_SUBMIT',true);

    const viewer = await login(browser,'VIEWER','/workspace-home');
    contexts.push(viewer.ctx);
    const viewerApi = await viewer.page.evaluate(async () => {
      const r = await fetch('/api/workshop-orders/inbox', { credentials:'same-origin',cache:'no-store' });
      return {status:r.status,body:await r.json().catch(()=>null)};
    });
    const viewerDenied = viewerApi.status === 403 && viewerApi.body?.code === 'FORBIDDEN';
    trace('VIEWER_INBOX_DENIED',viewerDenied);
    assert(viewerDenied,'VIEWER_UNEXPECTED_READ');

    const foreign = await login(browser,'FOREIGN','/workspace-home');
    contexts.push(foreign.ctx);
    const foreignApi = await foreign.page.evaluate(async () => {
      const r = await fetch('/api/workshop-orders/inbox',{credentials:'same-origin',cache:'no-store'});
      return {status:r.status,body:await r.json().catch(()=>null)};
    });
    const foreignDenied = foreignApi.status === 200
      && foreignApi.body?.code === 'OK'
      && Array.isArray(foreignApi.body?.data?.items)
      && foreignApi.body.data.items.every(i => i.id !== orderId)
      && foreignApi.body.data.items.length === 0;
    trace('FOREIGN_ORG_INBOX_DENIED',foreignDenied);
    assert(foreignDenied,'FOREIGN_ORG_UNEXPECTED_READ');
    console.log('WOS_BROWSER_QA_LOCAL_PREVIEW_HTTP_E2E=PASS');
  } finally {
    await Promise.allSettled(contexts.map(ctx => ctx.close()));
    await browser.close();
  }
}
main().catch(() => {
  // No credentials, response bodies, browser screenshots, JWT or HTTP traces.
  console.error('WOS_BROWSER_QA_LOCAL_PREVIEW_HTTP_E2E=FAIL');
  process.exitCode = 1;
});
