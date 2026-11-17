// Real browser clicks against locally served Next.js Preview-mode runtime,
// pinned to isolated hongda-review-dev, with protected QA GitHub Environment.
// No passwords/tokens are logged, and no screenshots/traces containing cookies
// are uploaded. This is NOT proof that Vercel SSO-protected deployment UI works.
const assert = require('node:assert/strict');
const { chromium } = require('/tmp/hongda-qa-browser/node_modules/playwright');

const origin = 'http://localhost:3000';
const projectRef = 'xulmpqaknlwqqculbsek';
const qaEnvKeys = [
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
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
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64'
);
let stage = 'PRECHECK';
async function main() {
  assert(allowed(), 'QA_PINS_OR_PROTECTED_SECRETS_MISSING');
  stage = 'CHROMIUM_LAUNCH';
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  stage = 'ADMIN_AUTH';
  const contexts = [];
  const rounds = Number(process.env.WOS_QA_SOAK_ROUNDS || '1');
  assert([1,10].includes(rounds), 'QA_ROUND_COUNT_NOT_ALLOWED');
  let office = null, workshop = null, viewer = null, foreign = null;
  try {
    for (let iteration = 1; iteration <= rounds; iteration++) {
      stage = 'ADMIN_AUTH';
      if (!office) {
        office = await login(browser, 'ADMIN', '/workshop-orders/production/new');
        contexts.push(office.ctx);
      } else {
        await office.page.goto(origin + '/workshop-orders/production/new', { waitUntil: 'domcontentloaded' });
      }
      stage = 'OFFICE_QA_FORM';
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
    const trustedEdgeWait = office.page.waitForResponse(response =>
      response.url() === origin + '/api/workshop-orders/qa-image-verify'
      && response.request().method() === 'POST',
      {timeout: 90000});
    const postWait = office.page.waitForResponse(response => {
      return response.url() === origin + '/api/workshop-orders/production'
        && response.request().method() === 'POST';
    }, { timeout: 110000 });
    stage = 'OFFICE_HTTP_SUBMIT';
    await office.page.getByRole('button', { name: '上传图片并提交 QA 订单' }).click();
    const trustedEdgeResponse=await trustedEdgeWait;
    const trustedEdgeBody=await trustedEdgeResponse.json().catch(()=>null);
    const attestationPassed=trustedEdgeResponse.status()===200
      &&trustedEdgeBody?.code==='QA_IMAGE_VERIFIED';
    trace('TRUSTED_EDGE_PROOF_REQUIRED_ON_HTTP_PATH',attestationPassed);
    assert(attestationPassed,'TRUSTED_EDGE_PROOF_NOT_VERIFIED');
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

    // This is a second business path: real CPC customer/project association
    // written to an isolated QA DRAFT via an authenticated same-origin API.
    // The fixture is same-organization and intentionally marked NONPRODUCTION.
    stage = 'OFFICE_CPC_QA_DRAFT';
    await office.page.getByRole('combobox', { name: '选择 CPC 客户' })
      .selectOption({ label: 'QA NONPRODUCTION ONLY - WOS CPC TEST CUSTOMER' });
    await office.page.getByRole('combobox', { name: '关联 CPC 项目' })
      .selectOption({ label: 'QA NONPRODUCTION ONLY - WOS P1 TEST PROJECT' });
    const draftPostWait = office.page.waitForResponse(response =>
      response.url() === origin + '/api/workshop-orders/production/cpc-drafts'
      && response.request().method() === 'POST', { timeout: 50000 });
    await office.page.getByRole('button', { name: '保存 CPC 关联 QA 草稿' }).click();
    const draftPost = await draftPostWait;
    const draftBody = await draftPost.json();
    const cpcSaved = draftPost.status() === 200
      && draftBody?.ok === true && draftBody?.code === 'QA_CPC_DRAFT_SAVED'
      && draftBody.data?.persisted === true && draftBody.data?.submitted === false
      && draftBody.data?.version === 1
      && /^QA-CPC-NONPROD-[0-9a-f-]{36}$/i.test(draftBody.data?.orderNumber || '');
    trace('OFFICE_CPC_SAME_ORG_DB_DRAFT', cpcSaved);
    assert(cpcSaved, 'OFFICE_CPC_DRAFT_NOT_PERSISTED');
    const replay = await office.page.evaluate(async requestJson => {
      const response = await fetch('/api/workshop-orders/production/cpc-drafts',{
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {'Content-Type':'application/json'},body:requestJson,
      });
      const body = await response.json().catch(()=>null);
      return { status:response.status, code:body?.code, id:body?.data?.orderId };
    }, draftPost.request().postData());
    const replayOk = replay.status === 200
      && replay.code === 'QA_CPC_DRAFT_REPLAY_VERIFIED'
      && replay.id === draftBody.data.orderId;
    trace('OFFICE_CPC_DRAFT_IDEMPOTENT_REPLAY', replayOk);
    assert(replayOk, 'OFFICE_CPC_DRAFT_REPLAY_FAILED');

    // Browser reload must not generate a second CPC order after an uncertain
    // HTTP result. Local durable idempotency identifier is scoped by QA actor.
    stage = 'OFFICE_CPC_DRAFT_REPLAY_AFTER_RELOAD';
    await office.page.reload({ waitUntil: 'domcontentloaded' });
    await office.page.getByRole('heading', { name: 'QA Preview · 真实 HTTP 提交验收' }).waitFor();
    await office.page.getByRole('button', { name: '自动填入全套合成 QA 测试资料' }).click();
    await office.page.getByRole('combobox', { name: '选择 CPC 客户' })
      .selectOption({ label: 'QA NONPRODUCTION ONLY - WOS CPC TEST CUSTOMER' });
    await office.page.getByRole('combobox', { name: '关联 CPC 项目' })
      .selectOption({ label: 'QA NONPRODUCTION ONLY - WOS P1 TEST PROJECT' });
    await office.page.getByText('QA_CPC_DRAFT_RETRY_SAME_NUMBER_AFTER_RELOAD', { exact: false })
      .waitFor({ timeout: 20000 });
    const afterReloadWait = office.page.waitForResponse(response =>
      response.url() === origin + '/api/workshop-orders/production/cpc-drafts'
      && response.request().method() === 'POST', { timeout: 50000 });
    await office.page.getByRole('button', { name: '保存 CPC 关联 QA 草稿' }).click();
    const afterReload = await afterReloadWait;
    const reloadedBody = await afterReload.json();
    const durable = afterReload.status() === 200
      && reloadedBody?.code === 'QA_CPC_DRAFT_REPLAY_VERIFIED'
      && reloadedBody.data?.orderId === draftBody.data.orderId
      && reloadedBody.data?.orderNumber === draftBody.data.orderNumber;
    trace('OFFICE_CPC_RELOAD_REPLAY_SAME_ORDER_NO_DUPLICATE', durable);
    assert(durable, 'OFFICE_CPC_RELOAD_CREATED_DUPLICATE_OR_CHANGED_PAYLOAD');

    // Simulate the hardest crash: the server commits the submission but the
    // browser never sees the HTTP response. Reload in the *same tab* and
    // prove the original order and idempotency key are recovered, not remade.
    stage = 'RESPONSE_LOSS_PREPARE';
    await office.page.reload({ waitUntil: 'domcontentloaded' });
    await office.page.getByRole('heading', { name: 'QA Preview · 真实 HTTP 提交验收' }).waitFor();
    await office.page.getByRole('button', { name: '自动填入全套合成 QA 测试资料' }).click();
    const interruptedNumber = await office.page.locator('input#orderNumber').inputValue();
    assert(interruptedNumber.startsWith('QA-NONPROD-') && interruptedNumber !== orderNumber);
    await office.page.locator('input[type=file]').setInputFiles({
      name: 'qa-browser-proof.png', mimeType: 'image/png', buffer: png,
    });
    await office.page.getByRole('button', { name: '检查资料完整性' }).click();
    await office.page.getByText('本地字段完整性检查通过', { exact: false }).waitFor();
    let responseDropped = false;
    await office.page.route('**/api/workshop-orders/production', async route => {
      if (responseDropped) { await route.continue(); return; }
      const actual = await route.fetch();
      if (actual.status() !== 200) { await route.fulfill({ response: actual }); return; }
      responseDropped = true;
      await route.abort('failed');
    });
    stage = 'RESPONSE_LOSS_SIMULATION';
    await office.page.getByRole('button', { name: '上传图片并提交 QA 订单' }).click();
    await office.page.getByText('QA_UNVERIFIED_UNEXPECTED_ERROR', { exact: false })
      .waitFor({ timeout: 95000 });
    assert(responseDropped, 'HTTP_RESPONSE_NOT_DROPPED');
    await office.page.unroute('**/api/workshop-orders/production');
    stage = 'RECOVER_AFTER_RELOAD';
    await office.page.reload({ waitUntil: 'domcontentloaded' });
    await office.page.getByText('检测到同一用户上次中断的合成订单', { exact: false })
      .waitFor({ timeout: 30000 });
    assert.equal(await office.page.locator('input#orderNumber').inputValue(), interruptedNumber,
      'recovered original order number');
    await office.page.getByRole('button', { name: '检查资料完整性' }).click();
    await office.page.getByRole('button', { name: '使用同一订单和幂等键继续验证' }).click();
    await office.page.getByText('已由真实 HTTP API 提交', { exact: false })
      .waitFor({ timeout: 40000 });
    trace('LOST_HTTP_RESPONSE_RECOVERED_SAME_ORDER', true);

    stage = 'OPERATOR_AUTH';
    if (!workshop) {
      workshop = await login(browser,'OPERATOR','/workshop-orders/inbox');
      contexts.push(workshop.ctx);
    } else {
      await workshop.page.goto(origin + '/workshop-orders/inbox', { waitUntil: 'domcontentloaded' });
    }
    stage = 'OPERATOR_INBOX';
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
    // Only safe status, allowlisted code, and matching booleans are logged.
    const inboxCode = typeof inbox?.code === 'string' && /^[A-Z_]{2,40}$/.test(inbox.code)
      ? inbox.code : 'UNAVAILABLE';
    console.log('WOS_BROWSER_QA_OPERATOR_HTTP_STATUS=' + inboxResponse.status());
    console.log('WOS_BROWSER_QA_OPERATOR_HTTP_CODE=' + inboxCode);
    console.log('WOS_BROWSER_QA_OPERATOR_RESPONSE_COUNT=' +
      (Number.isSafeInteger(inbox?.data?.count) ? inbox.data.count : 'UNAVAILABLE'));
    console.log('WOS_BROWSER_QA_OPERATOR_TARGET_MATCH_COUNT=' + (matches?.length ?? 'UNAVAILABLE'));
    console.log('WOS_BROWSER_QA_OPERATOR_TARGET_STATUS=' +
      (matches?.[0]?.workflowStatus === 'SUBMITTED' ? 'SUBMITTED' : 'NOT_MATCHED'));
    trace('OPERATOR_REFRESH_HTTP_INBOX',matched);
    assert(matched,'OPERATOR_INBOX_NOT_VISIBLE');
    stage = 'OPERATOR_IMAGE';
    const card = workshop.page.locator('article').filter({ hasText: orderNumber });
    await card.getByRole('button', { name: '用当前车间身份读取私有图片' }).click();
    await card.getByRole('link', { name: '打开已验证的私有图片' })
      .waitFor({ timeout: 50000 });
    // Validate the actual private Storage download bytes, not just that the
    // component displayed a blob: link after catching an exception.
    const verifiedBinary = await card.getByRole('link', {
      name: '打开已验证的私有图片',
    }).evaluate(async link => {
      const url = link.getAttribute('href');
      if (!url || !url.startsWith('blob:')) return { size: 0, png: false };
      const response = await fetch(url);
      if (!response.ok) return { size: 0, png: false };
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        size: bytes.length,
        png: bytes.length >= 8
          && [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n),
      };
    });
    const binaryOk = verifiedBinary.png && verifiedBinary.size >= 12;
    trace('OPERATOR_PRIVATE_IMAGE_BINARY_READ', binaryOk);
    assert(binaryOk, 'OPERATOR_PRIVATE_IMAGE_BYTES_UNVERIFIED');

    stage = 'OPERATOR_ORDER_DETAILS';
    await card.getByRole('button', {
      name: '查看真实生产要求与图片版本',
    }).click();
    const detail = card.getByRole('region', { name: '订单生产详情' });
    await detail.waitFor({ timeout: 20000 });
    const requirementsVisible = (await detail.getByText('客户验收标准').count()) === 1
      && (await detail.getByText('产品材质').count()) === 0
      && (await detail.getByText('材质', { exact: true }).count()) === 1
      && (await detail.getByText('生产资料版本').count()) === 1
      && (await detail.getByText('参考图片与历史版本', { exact: false }).count()) >= 1;
    trace('OPERATOR_ORDER_DETAILS_AND_VERSION', requirementsVisible);
    assert(requirementsVisible, 'OPERATOR_ORDER_DETAILS_UNVERIFIED');

    stage = 'OPERATOR_FORBIDDEN';
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

    stage = 'VIEWER_AUTH';
    if (!viewer) {
      viewer = await login(browser,'VIEWER','/workspace-home');
      contexts.push(viewer.ctx);
    }
    stage = 'VIEWER_API';
    const viewerApi = await viewer.page.evaluate(async () => {
      const r = await fetch('/api/workshop-orders/inbox', { credentials:'same-origin',cache:'no-store' });
      return {status:r.status,body:await r.json().catch(()=>null)};
    });
    const viewerDenied = viewerApi.status === 403 && viewerApi.body?.code === 'FORBIDDEN';
    trace('VIEWER_INBOX_DENIED',viewerDenied);
    assert(viewerDenied,'VIEWER_UNEXPECTED_READ');
    await viewer.page.goto(origin + '/workshop-orders/production/new', { waitUntil: 'domcontentloaded' });
    await viewer.page.getByText('当前测试账号没有办公室下单权限', { exact: false }).waitFor({ timeout: 30000 });
    const viewerOfficeActionHidden =
      (await viewer.page.getByRole('button', {name: '上传图片并提交 QA 订单'}).count()) === 0;
    trace('VIEWER_OFFICE_SUBMIT_BUTTON_HIDDEN',viewerOfficeActionHidden);
    assert(viewerOfficeActionHidden,'VIEWER_OFFICE_ACTION_VISIBLE');

    stage = 'FOREIGN_AUTH';
    if (!foreign) {
      foreign = await login(browser,'FOREIGN','/workspace-home');
      contexts.push(foreign.ctx);
    }
    stage = 'FOREIGN_API';
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
    console.log('WOS_BROWSER_QA_SOAK_ROUND_' + iteration + '=PASS');
      if (iteration < rounds) await new Promise(resolve => setTimeout(resolve, 1500));
    }
    console.log('WOS_BROWSER_QA_SOAK_SUCCESS_COUNT=' + rounds);
    console.log('WOS_BROWSER_QA_LOCAL_PREVIEW_HTTP_E2E=PASS');
  } finally {
    await Promise.allSettled(contexts.map(ctx => ctx.close()));
    await browser.close();
  }
}
main().catch((error) => {
  // Explicitly allowlist failure *stage* and JavaScript error type, never raw
  // browser/HTTP error messages that might embed URLs or sensitive values.
  const kind = error && error.name === 'AssertionError' ? 'ASSERTION'
    : error && error.name === 'TimeoutError' ? 'TIMEOUT'
    : error && error.name === 'Error' ? 'ERROR' : 'OTHER';
  console.error('WOS_BROWSER_QA_FAILURE_STAGE=' + stage);
  console.error('WOS_BROWSER_QA_FAILURE_CLASS=' + kind);
  console.error('WOS_BROWSER_QA_LOCAL_PREVIEW_HTTP_E2E=FAIL');
  process.exitCode = 1;
});
