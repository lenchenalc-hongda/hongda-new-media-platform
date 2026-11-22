#!/usr/bin/env node
// Guarded WOS V1 Release Candidate Preview E2E.
// Never prints passwords, JWTs, cookies or response bodies containing secrets.
// Requires explicit Owner/PM runtime opt-in and the fixed QA project.
const assert = require('node:assert/strict');

function loadPlaywright() {
  try { return require('playwright'); }
  catch { return require('/tmp/hongda-qa-browser/node_modules/playwright'); }
}

const origin = process.env.WOS_RC_PREVIEW_ORIGIN || '';
const qaUrl = 'https://xulmpqaknlwqqculbsek.supabase.co';
const accountKeys = ['OFFICE', 'OPERATOR', 'VIEWER', 'FOREIGN'];
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

function allowed() {
  return process.env.WOS_RC_PREVIEW_E2E_ENABLED === 'true'
    && process.env.VERCEL_ENV === 'preview'
    && process.env.AUTH_MODE === 'supabase'
    && origin.startsWith('https://')
    && process.env.NEXT_PUBLIC_SUPABASE_URL === qaUrl
    && process.env.WOS_P5C_NONPROD_API_ENABLED === 'true'
    && process.env.WOS_P7_NONPROD_SUBMIT_ENABLED === 'true'
    && process.env.WOS_P2_QA_MUTATIONS_ENABLED === 'true'
    && process.env.NEXT_PUBLIC_WOS_P2_QA_MUTATIONS_ENABLED === 'true'
    && process.env.WOS_P2_QA_OFFICE_REVISION_ENABLED === 'true'
    && process.env.NEXT_PUBLIC_WOS_P2_QA_OFFICE_REVISION_ENABLED === 'true'
    && process.env.WOS_P2_QA_M2_ENABLED === 'true'
    && process.env.NEXT_PUBLIC_WOS_P2_QA_M2_ENABLED === 'true'
    && accountKeys.every(key =>
      process.env['WOS_RC_' + key + '_EMAIL']
      && process.env['WOS_RC_' + key + '_PASSWORD']);
}

function account(key) {
  return {
    email: process.env['WOS_RC_' + key + '_EMAIL'],
    password: process.env['WOS_RC_' + key + '_PASSWORD'],
  };
}

async function login(browser, key, destination) {
  const context = await browser.newContext({ acceptDownloads: false });
  const page = await context.newPage();
  await page.goto(origin + '/login?redirect=' + encodeURIComponent(destination),
    { waitUntil: 'domcontentloaded' });
  const identity = account(key);
  await page.locator('input[type=email]').fill(identity.email);
  await page.locator('input[type=password]').fill(identity.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 60000 });
  await page.goto(origin + destination, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

async function openOperatorCard(page, orderNumber) {
  await page.getByRole('button', { name: '刷新真实车间任务' }).click();
  const card = page.locator('article').filter({ hasText: orderNumber });
  await card.waitFor({ timeout: 30000 });
  const details = card.getByRole('button', { name: '查看真实生产要求与图片版本' });
  if (await details.isVisible()) await details.click();
  await card.getByRole('region', { name: '订单生产详情' }).waitFor({ timeout: 30000 });
  return card;
}

async function waitForJsonResponse(page, predicate) {
  const response = await page.waitForResponse(predicate, { timeout: 90000 });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function operatorAction(card, action, note) {
  await card.getByRole('combobox', { name: '操作类型' }).selectOption(action);
  await card.getByRole('textbox', { name: /操作依据/ }).fill(note);
}

async function confirmMaterial(page, orderNumber, input) {
  const card = await openOperatorCard(page, orderNumber);
  await card.getByRole('combobox', { name: '操作类型' })
    .selectOption('CONFIRM_MATERIAL');
  await card.getByRole('combobox', { name: '物料类别' })
    .selectOption(input.resourceType);
  await card.getByRole('combobox', { name: '实测状态' })
    .selectOption(input.resourceStatus);
  if (input.resourceType === 'INCOMING_MATERIAL') {
    await card.getByRole('spinbutton', { name: '应到数量' }).fill('100');
    await card.getByRole('spinbutton', { name: '实到数量' }).fill('100');
  }
  await card.getByRole('textbox', { name: /操作依据/ }).fill(input.note);
  const pending = waitForJsonResponse(page, response =>
    response.url() === origin + '/api/workshop-orders/p2/actions'
      && response.request().method() === 'POST');
  await card.getByRole('button', { name: '提交到 QA 原子事务' }).click();
  const result = await pending;
  assert.equal(result.response.status(), 200);
  assert.equal(result.body?.ok, true);
  assert(['QA_P2_ACTION_APPLIED', 'QA_P2_REPLAY_VERIFIED'].includes(result.body?.code));
  await page.waitForTimeout(500);
}

async function main() {
  assert(allowed(), 'WOS_RC_PREVIEW_PINS_OR_ACCOUNTS_MISSING');
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const contexts = [];
  try {
    const office = await login(browser, 'OFFICE', '/workshop-orders/production/new');
    contexts.push(office.context);
    await office.page.getByRole('heading', { name: 'QA Preview · 真实 HTTP 提交验收' })
      .waitFor({ timeout: 30000 });
    await office.page.getByRole('button', { name: '自动填入全套合成 QA 测试资料' }).click();
    const orderNumber = await office.page.locator('input#orderNumber').inputValue();
    assert(/^QA-NONPROD-[a-f0-9-]{36}$/i.test(orderNumber));

    for (const category of [
      'PRODUCT', 'FILM_PATTERN', 'CUSTOMER_APPROVED_SAMPLE', 'SIGNED_SAMPLE',
    ]) {
      await office.page.getByLabel('QA 私有图片 · ' + category).setInputFiles({
        name: category.toLowerCase() + '.png',
        mimeType: 'image/png',
        buffer: png,
      });
    }
    await office.page.getByRole('button', { name: '检查资料完整性' }).click();
    await office.page.getByText('本地字段完整性检查通过', { exact: false }).waitFor();

    const submission = waitForJsonResponse(office.page, response =>
      response.url() === origin + '/api/workshop-orders/production'
        && response.request().method() === 'POST');
    await office.page.getByRole('button', { name: '上传图片并提交 QA 订单' }).click();
    const submitted = await submission;
    assert.equal(submitted.response.status(), 200);
    assert.equal(submitted.body?.data?.productionStarted, false);
    const orderId = submitted.body?.data?.orderId;
    assert(/^[a-f0-9-]{36}$/i.test(orderId || ''));

    const operator = await login(browser, 'OPERATOR', '/workshop-orders/inbox');
    contexts.push(operator.context);
    let card = await openOperatorCard(operator.page, orderNumber);
    await operatorAction(card, 'ACCEPT', 'Real QA operator accepts the submitted synthetic order.');
    let pending = waitForJsonResponse(operator.page, response =>
      response.url() === origin + '/api/workshop-orders/p2/actions'
        && response.request().method() === 'POST');
    await card.getByRole('button', { name: '提交到 QA 原子事务' }).click();
    assert.equal((await pending).response.status(), 200);

    card = await openOperatorCard(operator.page, orderNumber);
    await operatorAction(card, 'RETURN_FOR_INFORMATION',
      'Customer approved sample notes must be completed before workshop review.');
    pending = waitForJsonResponse(operator.page, response =>
      response.url() === origin + '/api/workshop-orders/p2/actions'
        && response.request().method() === 'POST');
    await card.getByRole('button', { name: '提交到 QA 原子事务' }).click();
    assert.equal((await pending).response.status(), 200);

    await office.page.goto(origin + '/workshop-orders/production/new',
      { waitUntil: 'domcontentloaded' });
    const returned = office.page.locator('article').filter({ hasText: orderNumber });
    await returned.waitFor({ timeout: 30000 });
    await returned.getByRole('textbox', { name: '客户验收标准', exact: true })
      .fill('QA RC updated acceptance standard for the current synthetic version.');
    await returned.getByRole('textbox', { name: /补资料说明/ })
      .fill('Office completed the requested acceptance information for workshop review.');
    pending = waitForJsonResponse(office.page, response =>
      response.url() === origin + '/api/workshop-orders/p2/office-revisions'
        && response.request().method() === 'POST');
    await returned.getByRole('button', { name: '保存修订（生成新版本）' }).click();
    assert.equal((await pending).response.status(), 200);

    await office.page.getByRole('button', { name: '刷新退回任务' }).click();
    const saved = office.page.locator('article').filter({ hasText: orderNumber });
    await saved.getByRole('textbox', { name: /补资料说明/ })
      .fill('Office resubmits the saved correction for exact workshop review.');
    pending = waitForJsonResponse(office.page, response =>
      response.url() === origin + '/api/workshop-orders/p2/office-revisions'
        && response.request().method() === 'POST');
    await saved.getByRole('button', { name: '重新提交车间复核' }).click();
    assert.equal((await pending).response.status(), 200);

    await operator.page.goto(origin + '/workshop-orders/inbox', { waitUntil: 'domcontentloaded' });
    card = await openOperatorCard(operator.page, orderNumber);
    await operatorAction(card, 'REVIEW_CORRECTION',
      'Workshop reviewed the latest immutable Office revision and resolved documents.');
    pending = waitForJsonResponse(operator.page, response =>
      response.url() === origin + '/api/workshop-orders/p2/actions'
        && response.request().method() === 'POST');
    await card.getByRole('button', { name: '提交到 QA 原子事务' }).click();
    assert.equal((await pending).response.status(), 200);

    await office.page.goto(origin + '/workshop-orders/production/new',
      { waitUntil: 'domcontentloaded' });
    const m2Select = office.page.getByRole('combobox', { name: '当前可核对订单' });
    await m2Select.waitFor({ timeout: 30000 });
    const m2OrderOption = m2Select.locator('option').filter({ hasText: orderNumber });
    const m2OrderValue = await m2OrderOption.getAttribute('value');
    assert(m2OrderValue, 'WOS_RC_PREVIEW_M2_ORDER_NOT_FOUND');
    await m2Select.selectOption(m2OrderValue);
    pending = waitForJsonResponse(office.page, response =>
      response.url() === origin + '/api/workshop-orders/p2/m2'
        && response.request().method() === 'POST');
    await office.page.getByRole('button', { name: '锁定四类图片为当前基准' }).click();
    assert.equal((await pending).response.status(), 200);

    pending = waitForJsonResponse(office.page, response =>
      response.url() === origin + '/api/workshop-orders/p2/m2'
        && response.request().method() === 'POST');
    await office.page.getByRole('button', { name: '办公室签认当前 proof-set' }).click();
    assert.equal((await pending).response.status(), 200);

    await operator.page.goto(origin + '/workshop-orders/inbox', { waitUntil: 'domcontentloaded' });
    card = await openOperatorCard(operator.page, orderNumber);
    const workshopSign = card.getByRole('region', { name: '车间四类图片独立签认' });
    pending = waitForJsonResponse(operator.page, response =>
      response.url() === origin + '/api/workshop-orders/p2/m2'
        && response.request().method() === 'POST');
    await workshopSign.getByRole('button', { name: '车间签认同一 proof-set' }).click();
    assert.equal((await pending).response.status(), 200);

    await confirmMaterial(operator.page, orderNumber, {
      resourceType: 'FILM', resourceStatus: 'VERSION_VERIFIED',
      note: 'Workshop physically verified FILM against the double-signed baseline.',
    });
    await confirmMaterial(operator.page, orderNumber, {
      resourceType: 'FIXTURE', resourceStatus: 'FIT_VERIFIED',
      note: 'Workshop completed FIXTURE fit verification against current production data.',
    });
    await confirmMaterial(operator.page, orderNumber, {
      resourceType: 'INCOMING_MATERIAL', resourceStatus: 'QUANTITY_VERIFIED',
      note: 'Incoming material quantity is fully verified for the current batch.',
    });
    await confirmMaterial(operator.page, orderNumber, {
      resourceType: 'SIGNED_SAMPLE', resourceStatus: 'VERIFIED',
      note: 'Customer approved sample and physical signed sample match the proof set.',
    });

    await operator.page.reload({ waitUntil: 'domcontentloaded' });
    card = await openOperatorCard(operator.page, orderNumber);
    await card.getByText('READINESS_CHECK', { exact: true }).waitFor({ timeout: 30000 });
    assert.equal(await card.getByText('花膜 · 已核实', { exact: true }).count(), 1);
    assert.equal(await card.getByText('夹具 · 已核实', { exact: true }).count(), 1);
    assert.equal(await card.getByText('来料及产品 · 已核实', { exact: true }).count(), 1);
    assert.equal(await card.getByText('客户确认样 / 大货签样 · 已核实', { exact: true }).count(), 1);
    assert.equal(await card.getByText('Office：已签认 · Workshop：已签认', { exact: false }).count(), 1);
    assert.equal(await card.getByRole('button', { name: /开始生产|放行生产/ }).count(), 0);
    assert((await card.textContent()).includes('canStart=false')
      || (await card.textContent()).includes('禁止排期放行或开工'));

    const viewer = await login(browser, 'VIEWER', '/workspace-home');
    contexts.push(viewer.context);
    const viewerDenied = await viewer.page.evaluate(async () => {
      const response = await fetch('/api/workshop-orders/inbox',
        { credentials: 'same-origin', cache: 'no-store' });
      return { status: response.status, body: await response.json().catch(() => null) };
    });
    assert.equal(viewerDenied.status, 403);
    assert.equal(viewerDenied.body?.code, 'FORBIDDEN');

    const foreign = await login(browser, 'FOREIGN', '/workspace-home');
    contexts.push(foreign.context);
    const foreignRead = await foreign.page.evaluate(async () => {
      const response = await fetch('/api/workshop-orders/inbox',
        { credentials: 'same-origin', cache: 'no-store' });
      return { status: response.status, body: await response.json().catch(() => null) };
    });
    assert.equal(foreignRead.status, 200);
    assert.equal(foreignRead.body?.code, 'OK');
    assert.equal(foreignRead.body?.data?.items?.some(item => item.id === orderId), false);

    console.log('WOS_RC_PREVIEW_FOUR_ACCOUNT_E2E=PASS');
    console.log('WOS_RC_PREVIEW_ORDER_STATUS=READINESS_CHECK');
    console.log('WOS_RC_PREVIEW_CAN_START=false');
  } finally {
    await Promise.allSettled(contexts.map(context => context.close()));
    await browser.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('WOS_RC_PREVIEW_E2E=FAIL');
    console.error('WOS_RC_PREVIEW_FAILURE=' +
      (error && error.name === 'AssertionError' ? 'ASSERTION'
        : error && error.name === 'TimeoutError' ? 'TIMEOUT'
        : 'ERROR'));
    process.exitCode = 1;
  });
}
