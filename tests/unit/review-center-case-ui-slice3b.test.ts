import fs from 'node:fs';
import {
  CaseApiError,
  hideCase,
  publishCase,
  reopenCase,
  runExclusiveOnce,
  updateCase,
} from '../../src/lib/review-center/case-api-client';
import {
  canHideCaseStatus,
  canPublishCaseStatus,
  canReopenCaseStatus,
  canSaveCaseStatus,
  normalizeHideReason,
  parseMissingDimensions,
  parseMissingFields,
} from '../../src/lib/review-center/case-manage';
import {
  curationMissingFieldLabel,
  metadataMissingDimensionLabel,
} from '../../src/lib/review-center/case-presentation';
import type { CaseMutationResult } from '../../src/lib/review-center/case-schemas';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + msg);
  }
}

const UUID_1 = '00000000-0000-0000-0000-000000000001';
const CASE_NO = 'CASE-2026-000001';

const publishResult: CaseMutationResult = {
  id: UUID_1,
  caseNo: CASE_NO,
  status: 'PUBLISHED',
  version: 8,
  sourceReviewVersion: 7,
};

const hideResult: CaseMutationResult = {
  id: UUID_1,
  caseNo: CASE_NO,
  status: 'HIDDEN',
  version: 8,
  sourceReviewVersion: 7,
};

const reopenResult: CaseMutationResult = {
  id: UUID_1,
  caseNo: CASE_NO,
  status: 'DRAFT',
  version: 9,
  sourceReviewVersion: 7,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  (globalThis as any).fetch = handler;
}

console.log('\n=== Case UI Slice 3B ===');

// Publish client: dual version authority + exact body
let capturedCall: any = null;
stubFetch(async (url, init) => {
  capturedCall = { url, init };
  return jsonResponse(200, publishResult);
});
const published = await publishCase(CASE_NO, { expectedVersion: 7, expectedSourceReviewVersion: 11 });
assert(capturedCall?.url === '/api/review-center/cases/CASE-2026-000001/publish', 'publish POST url');
assert(capturedCall?.init?.method === 'POST', 'publish POST method');
assert(capturedCall?.init?.headers instanceof Headers && capturedCall.init.headers.get('Content-Type') === 'application/json', 'publish Content-Type json');
assert(
  capturedCall?.init?.body === JSON.stringify({ expectedVersion: 7, expectedSourceReviewVersion: 11 }),
  'publish body exact 7/11',
);
assert(!capturedCall?.init?.body.includes('5'), 'publish snapshot version 5 not sent');
assert(published.status === 'PUBLISHED' && published.version === 8, 'publish direct result parsed');

// Hide client: exact body with trimmed reason
stubFetch(async (url, init) => {
  capturedCall = { url, init };
  return jsonResponse(200, hideResult);
});
const hidden = await hideCase(CASE_NO, { expectedVersion: 7, reason: 'because' });
assert(capturedCall?.url === '/api/review-center/cases/CASE-2026-000001/hide', 'hide POST url');
assert(
  capturedCall?.init?.body === JSON.stringify({ expectedVersion: 7, reason: 'because' }),
  'hide body exact',
);
assert(hidden.status === 'HIDDEN' && hidden.version === 8, 'hide direct result parsed');

// Reopen client
stubFetch(async (url, init) => {
  capturedCall = { url, init };
  return jsonResponse(200, reopenResult);
});
const reopened = await reopenCase(CASE_NO, { expectedVersion: 8 });
assert(capturedCall?.url === '/api/review-center/cases/CASE-2026-000001/reopen', 'reopen POST url');
assert(
  capturedCall?.init?.body === JSON.stringify({ expectedVersion: 8 }),
  'reopen body exact',
);
assert(reopened.status === 'DRAFT' && reopened.version === 9, 'reopen direct result parsed');

// Wrong read envelope rejected
stubFetch(async () => jsonResponse(200, { ok: true, data: publishResult }));
try {
  await publishCase(CASE_NO, { expectedVersion: 7, expectedSourceReviewVersion: 11 });
  assert(false, 'publish wrong envelope should throw');
} catch (error) {
  assert(error instanceof CaseApiError && error.code === 'INVALID_RESPONSE', 'publish wrong envelope rejected');
}

// Client errors: exactly once + raw privacy
for (const [status, code] of [
  [409, 'VERSION_CONFLICT'],
  [409, 'SOURCE_VERSION_CONFLICT'],
  [422, 'CASE_CURATION_INCOMPLETE'],
  [422, 'CASE_METADATA_INCOMPLETE'],
  [500, 'INTERNAL_ERROR'],
] as Array<[number, string]>) {
  let fetchCount = 0;
  stubFetch(async () => {
    fetchCount++;
    return jsonResponse(status, { ok: false, code, message: 'RAW_3B_SECRET', data: null });
  });
  try {
    await publishCase(CASE_NO, { expectedVersion: 7, expectedSourceReviewVersion: 11 });
    assert(false, 'publish error should throw: ' + code);
  } catch (error) {
    assert(error instanceof CaseApiError && error.status === status && error.code === code, 'publish error status/code ' + code);
    assert(error instanceof CaseApiError && !error.message.includes('RAW_3B_SECRET'), 'publish raw message hidden ' + code);
  }
  assert(fetchCount === 1, 'publish no retry ' + code);
}

// SafeData guards
assert(JSON.stringify(parseMissingFields(['TITLE', 'UNKNOWN', 'SUMMARY', 'TITLE'])) === '["TITLE","SUMMARY"]', 'missing fields whitelist dedupe');
assert(JSON.stringify(parseMissingFields('bad')) === '[]' && JSON.stringify(parseMissingFields(null)) === '[]', 'malformed missing fields safe');
assert(JSON.stringify(parseMissingDimensions(['PROBLEM_DOMAIN', 'EVIL', 'PRIMARY_MATERIAL'])) === '["PROBLEM_DOMAIN","PRIMARY_MATERIAL"]', 'missing dimensions whitelist');
assert(JSON.stringify(parseMissingDimensions({})) === '[]', 'malformed missing dimensions safe');
assert(JSON.stringify(parseMissingDimensions(['MATERIAL_OTHER_TEXT'])) === '["MATERIAL_OTHER_TEXT"]', 'missing dimensions other text');

// Hide reason validation
assert(normalizeHideReason('  because  ').ok === true && normalizeHideReason('  because  ').ok && (normalizeHideReason('  because  ') as { reason: string }).reason === 'because', 'hide reason trimmed');
assert(normalizeHideReason('   ').ok === false, 'blank hide reason rejected');
assert(normalizeHideReason('x'.repeat(1001)).ok === false, 'overlong hide reason rejected');

// Status guards
assert(canSaveCaseStatus('DRAFT') === true, 'save DRAFT only');
assert(canPublishCaseStatus('DRAFT') === true && canPublishCaseStatus('PUBLISHED') === false && canPublishCaseStatus('HIDDEN') === false, 'publish DRAFT only');
assert(canHideCaseStatus('DRAFT') === true && canHideCaseStatus('PUBLISHED') === true && canHideCaseStatus('HIDDEN') === false, 'hide DRAFT/PUBLISHED only');
assert(canReopenCaseStatus('HIDDEN') === true && canReopenCaseStatus('DRAFT') === false && canReopenCaseStatus('PUBLISHED') === false, 'reopen HIDDEN only');
assert(canPublishCaseStatus('FUTURE') === false && canHideCaseStatus('FUTURE') === false && canReopenCaseStatus('FUTURE') === false, 'unknown status safe false');

// Presentation labels
assert(curationMissingFieldLabel('TITLE') === '案例标题' && curationMissingFieldLabel('LESSON_SUMMARY') === '核心教训', 'curation missing labels');
assert(curationMissingFieldLabel('FUTURE') === '案例整理内容仍有缺失，请检查后重试', 'curation unknown label fallback');
assert(metadataMissingDimensionLabel('PROBLEM_DOMAIN') === '问题环节' && metadataMissingDimensionLabel('PROCESS_OTHER_TEXT') === '其他工艺说明', 'metadata missing labels');
assert(metadataMissingDimensionLabel('FUTURE') === '来源复盘分类信息仍不完整，请检查后重试', 'metadata unknown label fallback');

// Hide -> Reopen version chain
stubFetch(async () => jsonResponse(200, hideResult));
const chainHide = await hideCase(CASE_NO, { expectedVersion: 7, reason: 'chain' });
assert(chainHide.version === 8 && chainHide.status === 'HIDDEN', 'hide chain result version 8');
stubFetch(async (url, init) => {
  capturedCall = { url, init };
  return jsonResponse(200, reopenResult);
});
await reopenCase(CASE_NO, { expectedVersion: chainHide.version });
assert(
  capturedCall?.init?.body === JSON.stringify({ expectedVersion: 8 }),
  'reopen after hide uses mutation result version 8',
);

// Shared cross-action lock
let publishCount = 0;
let hideCount = 0;
let reopenCount = 0;
const lock = { current: false };
stubFetch(async (url) => {
  if (url.includes('/publish')) publishCount++;
  if (url.includes('/hide')) hideCount++;
  if (url.includes('/reopen')) reopenCount++;
  return jsonResponse(200, publishResult);
});
await Promise.all([
  runExclusiveOnce(lock, () => publishCase(CASE_NO, { expectedVersion: 7, expectedSourceReviewVersion: 11 })),
  runExclusiveOnce(lock, () => hideCase(CASE_NO, { expectedVersion: 7, reason: 'x' })),
]);
assert(publishCount === 1 && hideCount === 0, 'publish pending blocks hide');

stubFetch(async (url) => {
  if (url.includes('/hide')) hideCount++;
  if (url.includes('/reopen')) reopenCount++;
  return jsonResponse(200, hideResult);
});
await Promise.all([
  runExclusiveOnce(lock, () => hideCase(CASE_NO, { expectedVersion: 8, reason: 'x' })),
  runExclusiveOnce(lock, () => reopenCase(CASE_NO, { expectedVersion: 8 })),
]);
assert(hideCount === 1 && reopenCount === 0, 'hide pending blocks reopen');

let updateCount = 0;
publishCount = 0;
stubFetch(async (url) => {
  if (url.endsWith('/cases/CASE-2026-000001')) updateCount++;
  if (url.endsWith('/publish')) publishCount++;
  return jsonResponse(200, publishResult);
});
await Promise.all([
  runExclusiveOnce(lock, () => updateCase(CASE_NO, { expectedVersion: 7, patch: { summary: 'B' } })),
  runExclusiveOnce(lock, () => publishCase(CASE_NO, { expectedVersion: 7, expectedSourceReviewVersion: 11 })),
]);
assert(updateCount === 1 && publishCount === 0, 'save pending blocks publish');

let publishDoubleCount = 0;
stubFetch(async (url) => {
  if (url.endsWith('/publish')) publishDoubleCount++;
  return jsonResponse(200, publishResult);
});
const publishLock = { current: false };
await Promise.all([
  runExclusiveOnce(publishLock, () => publishCase(CASE_NO, { expectedVersion: 7, expectedSourceReviewVersion: 11 })),
  runExclusiveOnce(publishLock, () => publishCase(CASE_NO, { expectedVersion: 7, expectedSourceReviewVersion: 11 })),
]);
assert(publishDoubleCount === 1, 'same-tick publish one POST via shared lock');

// Static contract: manage workspace, action bar, hide dialog
const manageSource = fs.readFileSync('src/app/review-center/cases/[caseNo]/manage/page.tsx', 'utf8');
const actionBarSource = fs.readFileSync('src/components/review-center/case/CaseManageActionBar.tsx', 'utf8');
const hideDialogSource = fs.readFileSync('src/components/review-center/case/CaseHideDialog.tsx', 'utf8');
const clientSource = fs.readFileSync('src/lib/review-center/case-api-client.ts', 'utf8');
const manageHelperSource = fs.readFileSync('src/lib/review-center/case-manage.ts', 'utf8');

assert(manageSource.includes('publishCase') && manageSource.includes('hideCase') && manageSource.includes('reopenCase'), 'manage page uses status mutation clients');
assert(manageSource.includes('canPublishCaseStatus') && manageSource.includes('canHideCaseStatus') && manageSource.includes('canReopenCaseStatus'), 'manage page uses status guards');
assert(manageSource.includes('refreshAdminAfterMutation'), 'manage page has mutation-success refetch path');
assert(manageSource.includes('generationRef.current') && manageSource.includes('abortRef.current'), 'refetch race guard present');
assert(manageSource.includes('setEditorLockedUntilRefresh(true)'), 'reopen refetch failure locks editor');
assert(manageSource.includes('admin.version') && manageSource.includes('admin.sourceCurrentVersion'), 'publish uses current admin authorities');
assert(manageSource.includes('刷新来源信息') && manageSource.includes('handleSourceMetadataRefresh'), 'metadata issue panel has source refresh action');
assert(manageSource.includes('查看来源复盘'), 'metadata issue panel keeps source review link');

const metadataRefreshStart = manageSource.indexOf('function handleSourceMetadataRefresh()');
const guardNavStart = manageSource.indexOf('function guardNavigation(');
assert(metadataRefreshStart !== -1 && guardNavStart !== -1 && metadataRefreshStart < guardNavStart, 'source metadata refresh handler present');
const metadataRefreshSource = manageSource.slice(metadataRefreshStart, guardNavStart);
assert(metadataRefreshSource.includes('refreshAdminAfterMutation'), 'metadata refresh reuses existing admin refresh');
assert(!metadataRefreshSource.includes('publishCase('), 'metadata refresh never auto publishes');

const publishHandlerStart = manageSource.indexOf('async function handlePublish()');
const hideHandlerStart = manageSource.indexOf('function handleHide(');
const reopenHandlerStart = manageSource.indexOf('function handleReopen()');
assert(publishHandlerStart !== -1 && hideHandlerStart !== -1 && reopenHandlerStart !== -1, 'status handlers present');
const publishHandlerSource = manageSource.slice(publishHandlerStart, hideHandlerStart);
const hideHandlerSource = manageSource.slice(hideHandlerStart, reopenHandlerStart);
assert(publishHandlerSource.indexOf('canPublishCaseStatus') < publishHandlerSource.indexOf('publishCase('), 'publish guard before publishCase');
assert(publishHandlerSource.includes('if (dirty) return;'), 'publish dirty guard before request');
assert(hideHandlerSource.indexOf('canHideCaseStatus') < hideHandlerSource.indexOf('hideCase('), 'hide guard before hideCase');
assert(hideHandlerSource.includes('if (dirty) return;'), 'hide dirty guard before request');
assert(!hideHandlerSource.includes('await reopenCase'), 'hide success does not auto reopen');
assert(manageSource.indexOf('canReopenCaseStatus') < manageSource.indexOf('reopenCase('), 'reopen guard before reopenCase');
assert(manageSource.includes('expectedVersion: admin.version') && manageSource.includes('reason: trimmedReason'), 'hide authority-at-confirm reads current admin');
assert(manageSource.includes('hideCase(caseNo, {') && manageSource.includes('reopenCase(caseNo, {'), 'confirm handlers read current state');

assert(actionBarSource.includes('发布案例') && actionBarSource.includes('隐藏案例') && actionBarSource.includes('重新整理') && actionBarSource.includes('重新打开整理'), 'action bar labels');
assert(actionBarSource.includes("isStale ? 'btn-primary' : 'btn-secondary'"), 'stale recurate primary presentation');
assert(hideDialogSource.includes('normalizeHideReason') && hideDialogSource.includes('隐藏原因'), 'hide dialog uses validation helper');
assert(!hideDialogSource.includes('sourceReviewId') && !hideDialogSource.includes('admin.version'), 'hide dialog no authority/UUID state');

for (const source of [actionBarSource, hideDialogSource, manageHelperSource]) {
  for (const token of ['fetchCaseAudit', '/audit', 'CaseAuditPanel', 'AuditSection', 'createClient', 'supabase', '.from(', '.rpc(', 'as any', 'as unknown as', '@ts-ignore', '@ts-expect-error']) {
    assert(!source.includes(token), 'no audit/supabase/unsafe cast: ' + token);
  }
}

assert(clientSource.includes('fetchCaseAudit'), 'client hosts audit fetch extension');
const auditClientStart = clientSource.indexOf('export async function fetchCaseAudit(');
const auditClientEnd = clientSource.indexOf('function parseOptionArray');
const auditClientSource = clientSource.slice(auditClientStart, auditClientEnd);
assert(auditClientSource.includes('/audit?') && auditClientSource.includes('requestJson('), 'audit client builds read URL');
assert(!auditClientSource.includes('method: '), 'audit client block has no mutation method');
assert(manageSource.includes('CaseAuditPanel'), 'manage page hosts audit panel');
assert(manageSource.includes('mutationInFlight={mutationInFlight}'), 'audit panel receives mutation in-flight flag');
const lifecycleHandlerSource = manageSource.slice(
  manageSource.indexOf('async function handlePublish()'),
  manageSource.indexOf('function handleManualRefresh()'),
);
assert(!lifecycleHandlerSource.includes('fetchCaseAudit'), 'publish/hide/reopen handlers do not fetch audit');
assert(!manageSource.includes('admin.hiddenReason'), 'hidden reason not displayed');
assert(!manageSource.includes("'STALE'"), 'no persistent STALE status');
assert(!manageSource.includes('await hideCase(') || !manageSource.includes('await reopenCase(') || manageSource.indexOf('async function confirmReopen()') > manageSource.indexOf('await hideCase('), 'no one-handler hide+reopen chain');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
