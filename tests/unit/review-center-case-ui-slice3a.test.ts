import fs from 'node:fs';
import {
  CaseApiError,
  fetchCaseAdminDetail,
  parseCaseAdminDetailResponse,
  runExclusiveOnce,
  updateCase,
} from '../../src/lib/review-center/case-api-client';
import {
  sourceReviewStatusLabel,
  staleReasonLabel,
} from '../../src/lib/review-center/case-presentation';
import {
  applyMutationResultToAdminState,
  buildCasePatch,
  canSaveCaseStatus,
  caseEditorDirty,
  confirmDiscardIfNeeded,
  editorBaselineFromAdmin,
  editorDraftFromBaseline,
  groupCurrentSourceMetadata,
  normalizeCaseEditorDraft,
} from '../../src/lib/review-center/case-manage';
import type { CaseAdminDetail, CaseMutationResult } from '../../src/lib/review-center/case-schemas';

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
const UUID_2 = '00000000-0000-0000-0000-000000000002';
const CASE_NO = 'CASE-2026-000001';

const adminDetail: CaseAdminDetail = {
  id: UUID_1,
  caseNo: CASE_NO,
  status: 'PUBLISHED',
  version: 3,
  title: 'case title',
  summary: 'summary',
  lessonSummary: 'lesson',
  preventionSummary: 'prevention',
  applicabilityNotes: 'notes',
  reviewTypeSnapshot: 'A',
  riskSnapshot: 'RED',
  occurredAtSnapshot: '2026-08-01T00:00:00Z',
  publishedAt: '2026-08-27T00:00:00Z',
  hiddenAt: null,
  hiddenReason: null,
  sourceReviewId: UUID_2,
  sourceReviewNo: 'REV-2026-000001',
  sourceCurrentStatus: 'closed',
  sourceCurrentVersion: 11,
  caseSourceReviewVersion: 5,
  sourceChangedSinceSnapshot: true,
  isStale: true,
  staleReasons: ['SOURCE_VERSION_CHANGED'],
  currentSourceMetadata: [
    { metadataType: 'MATERIAL', code: 'PP', label: 'PP', isPrimary: true },
  ],
  caseSnapshotMetadata: {
    materials: [{ code: 'ABS', label: 'ABS', isPrimary: false }],
    processes: [],
    problemDomains: [],
    problemSymptoms: [],
  },
};

const mutationResult: CaseMutationResult = {
  id: UUID_1,
  caseNo: CASE_NO,
  status: 'DRAFT',
  version: 8,
  sourceReviewVersion: 5,
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

console.log('\n=== Case UI Slice 3A ===');

// Editor baseline/draft roundtrip
const baseline = editorBaselineFromAdmin(adminDetail);
const draft = editorDraftFromBaseline(baseline);
assert(baseline.title === 'case title' && baseline.summary === 'summary', 'editor baseline from admin');
assert(draft.summary === 'summary' && draft.applicabilityNotes === 'notes', 'editor draft from baseline');

// Canonical normalization + patch presence
const samePatch = buildCasePatch(baseline, { ...draft });
assert(samePatch.dirty === false && Object.keys(samePatch.patch).length === 0, 'unchanged fields produce empty patch');

const changedPatch = buildCasePatch(baseline, { ...draft, summary: 'B' });
assert(changedPatch.dirty === true && changedPatch.patch.summary === 'B', 'changed field present in patch');
assert(changedPatch.patch.title === undefined, 'unchanged title absent from patch');

const clearNullPatch = buildCasePatch(baseline, { ...draft, summary: '   ' });
assert(clearNullPatch.patch.summary === null, 'nullable cleared to null');

const nullToTextPatch = buildCasePatch(
  { ...baseline, summary: null },
  { ...draft, summary: ' X ' },
);
assert(nullToTextPatch.patch.summary === 'X', 'nullable null to text trimmed');

const revertPatch = buildCasePatch(baseline, { ...draft, summary: 'B' });
assert(revertPatch.dirty === true, 'changed draft dirty');
const revertClean = buildCasePatch(baseline, { ...draft, summary: baseline.summary ?? '' });
assert(revertClean.dirty === false && revertClean.patch.summary === undefined, 'changed then reverted clean');

const whitespacePatch = buildCasePatch(baseline, { ...draft, title: '  case title  ' });
assert(whitespacePatch.dirty === false && whitespacePatch.patch.title === undefined, 'whitespace-only title canonical clean');

const normalized = normalizeCaseEditorDraft({ ...draft, title: '  X  ', summary: '   ' });
assert(normalized.title === 'X' && normalized.summary === null, 'canonical normalization');

// Validation
const blankTitle = buildCasePatch(baseline, { ...draft, title: '   ' });
assert(blankTitle.errors.titleError === '请输入案例标题。', 'blank title blocked');

const longTitle = buildCasePatch(baseline, { ...draft, title: 'x'.repeat(201) });
assert(longTitle.errors.titleError === '案例标题不能超过 200 字。', 'long title blocked');

const longSummary = buildCasePatch(baseline, { ...draft, summary: 'x'.repeat(5001) });
assert(longSummary.errors.fieldErrors.summary === '摘要不能超过 5000 字。', 'long summary blocked');

const longNotes = buildCasePatch(baseline, { ...draft, applicabilityNotes: 'x'.repeat(2001) });
assert(longNotes.errors.fieldErrors.applicabilityNotes === '适用说明不能超过 2000 字。', 'long applicability blocked');

assert(caseEditorDirty(baseline, draft) === false, 'dirty false for clean draft');
assert(caseEditorDirty(baseline, { ...draft, lessonSummary: 'new' }) === true, 'dirty true for changed draft');

// Discard confirm helper
let confirmCalls = 0;
assert(confirmDiscardIfNeeded(false, () => { confirmCalls++; return true; }) === true, 'clean refresh no confirm needed');
assert(confirmCalls === 0, 'clean refresh confirm not called');
assert(confirmDiscardIfNeeded(true, () => false) === false, 'dirty refresh cancelled by user');
assert(confirmDiscardIfNeeded(true, () => true) === true, 'dirty refresh confirmed');

// Mutation -> admin mapping keeps source current version
const mapped = applyMutationResultToAdminState(mutationResult, adminDetail);
assert(mapped.version === 8 && mapped.status === 'DRAFT' && mapped.caseSourceReviewVersion === 5, 'mutation mapped to admin state');
const mergedAdmin = { ...adminDetail, ...mapped };
assert(mergedAdmin.sourceCurrentVersion === 11, 'sourceCurrentVersion unchanged after save mapping');
assert(mergedAdmin.caseSourceReviewVersion === 5, 'caseSourceReviewVersion updated after save mapping');

// Group current source metadata
const grouped = groupCurrentSourceMetadata(adminDetail.currentSourceMetadata);
assert(grouped.materials.length === 1 && grouped.materials[0].label === 'PP', 'current source metadata grouped');
assert(grouped.processes.length === 0, 'empty process group');

// Admin client: full success parse
stubFetch(async () => jsonResponse(200, { ok: true, data: adminDetail }));
const parsedAdmin = await fetchCaseAdminDetail(CASE_NO);
assert(parsedAdmin.caseNo === CASE_NO && parsedAdmin.isStale === true, 'admin full detail parsed');
assert(parsedAdmin.sourceCurrentVersion === 11 && parsedAdmin.caseSourceReviewVersion === 5, 'admin version fields parsed');
assert(parsedAdmin.caseSnapshotMetadata.materials[0].label === 'ABS', 'admin snapshot metadata parsed');
assert(parsedAdmin.currentSourceMetadata[0].label === 'PP', 'admin current source metadata parsed');

const directParsedAdmin = parseCaseAdminDetailResponse({ ok: true, data: adminDetail });
assert(directParsedAdmin.staleReasons[0] === 'SOURCE_VERSION_CHANGED', 'admin response parser stale reasons');

// Admin client: malformed
stubFetch(async () => jsonResponse(200, {
  ok: true,
  data: { ...adminDetail, caseSnapshotMetadata: null },
}));
try {
  await fetchCaseAdminDetail(CASE_NO);
  assert(false, 'malformed admin should throw');
} catch (error) {
  assert(error instanceof CaseApiError && error.code === 'INVALID_RESPONSE', 'malformed admin safe error');
}

for (const status of [403, 404, 500]) {
  stubFetch(async () => jsonResponse(status, { ok: false, code: 'X', message: 'RAW_ADMIN_SECRET', data: null }));
  try {
    await fetchCaseAdminDetail(CASE_NO);
    assert(false, 'admin http error should throw: ' + status);
  } catch (error) {
    assert(error instanceof CaseApiError && error.status === status, 'admin http status ' + status);
    assert(error instanceof CaseApiError && !error.message.includes('RAW_ADMIN_SECRET'), 'admin raw message hidden ' + status);
  }
}

// Update client: PATCH exact body + direct result + version authority
let capturedCall: any = null;
stubFetch(async (url, init) => {
  capturedCall = { url, init };
  return jsonResponse(200, mutationResult);
});
const updated = await updateCase(CASE_NO, { expectedVersion: 7, patch: { summary: 'B' } });
assert(capturedCall?.url === '/api/review-center/cases/CASE-2026-000001', 'update PATCH url');
assert(capturedCall?.init?.method === 'PATCH', 'update PATCH method');
assert(
  capturedCall?.init?.headers instanceof Headers
    && capturedCall.init.headers.get('Content-Type') === 'application/json',
  'update Content-Type json',
);
assert(
  capturedCall?.init?.body === JSON.stringify({ expectedVersion: 7, patch: { summary: 'B' } }),
  'update body exact with expectedVersion 7',
);
assert(!capturedCall?.init?.body.includes('999'), 'unrelated version not in update body');
assert(updated.version === 8 && updated.status === 'DRAFT', 'update direct result parsed');

stubFetch(async (url, init) => {
  capturedCall = { url, init };
  return jsonResponse(200, mutationResult);
});
await updateCase(CASE_NO, { expectedVersion: 8, patch: {} });
assert(
  capturedCall?.init?.body === JSON.stringify({ expectedVersion: 8, patch: {} }),
  'next update uses mutation result version 8',
);

// Update client: wrong read envelope rejected
stubFetch(async () => jsonResponse(200, { ok: true, data: mutationResult }));
try {
  await updateCase(CASE_NO, { expectedVersion: 7, patch: {} });
  assert(false, 'read envelope should not pass as mutation success');
} catch (error) {
  assert(error instanceof CaseApiError && error.code === 'INVALID_RESPONSE', 'update wrong envelope rejected');
}

// Update client: errors exactly once + raw privacy
for (const [status, code] of [[409, 'VERSION_CONFLICT'], [409, 'INVALID_TRANSITION'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [500, 'INTERNAL_ERROR']] as Array<[number, string]>) {
  let fetchCount = 0;
  stubFetch(async () => {
    fetchCount++;
    return jsonResponse(status, { ok: false, code, message: 'RAW_UPDATE_SECRET', data: null });
  });
  try {
    await updateCase(CASE_NO, { expectedVersion: 7, patch: { summary: 'B' } });
    assert(false, 'update error should throw: ' + code);
  } catch (error) {
    assert(error instanceof CaseApiError && error.status === status && error.code === code, 'update error status/code ' + code);
    assert(error instanceof CaseApiError && !error.message.includes('RAW_UPDATE_SECRET'), 'update raw message hidden ' + code);
  }
  assert(fetchCount === 1, 'update no retry ' + code);
}

// Same-tick save guard through real updateCase
let updateFetchCount = 0;
stubFetch(async () => {
  updateFetchCount++;
  await new Promise(resolve => setTimeout(resolve, 5));
  return jsonResponse(200, mutationResult);
});
const saveGuard = { current: false };
const saveResults = await Promise.all([
  runExclusiveOnce(saveGuard, () => updateCase(CASE_NO, { expectedVersion: 7, patch: { summary: 'B' } })),
  runExclusiveOnce(saveGuard, () => updateCase(CASE_NO, { expectedVersion: 7, patch: { summary: 'B' } })),
]);
assert(updateFetchCount === 1, 'same-tick double save one PATCH');
assert(saveResults[0] !== null && saveResults[1] === null, 'second same-tick save skipped');

// Presentation helpers
assert(staleReasonLabel('SOURCE_NOT_CLOSED') === '来源复盘状态已变化', 'stale reason label not closed');
assert(staleReasonLabel('SOURCE_VERSION_CHANGED') === '来源复盘内容已更新', 'stale reason label version changed');
assert(staleReasonLabel('FUTURE') === '来源复盘发生变化', 'unknown stale reason fallback');
assert(sourceReviewStatusLabel('closed') === '已关闭' && sourceReviewStatusLabel('FUTURE') === 'FUTURE', 'source status safe labels');

// Non-DRAFT save eligibility
assert(canSaveCaseStatus('DRAFT') === true, 'DRAFT save eligible');
assert(canSaveCaseStatus('PUBLISHED') === false, 'PUBLISHED save blocked');
assert(canSaveCaseStatus('HIDDEN') === false, 'HIDDEN save blocked');
assert(canSaveCaseStatus('FUTURE' as string) === false && canSaveCaseStatus(null) === false, 'unknown status save blocked');

// Static contract: manage workspace and components
const manageSource = fs.readFileSync('src/app/review-center/cases/[caseNo]/manage/page.tsx', 'utf8');
const editorSource = fs.readFileSync('src/components/review-center/case/CaseCurationEditor.tsx', 'utf8');
const metadataSource = fs.readFileSync('src/components/review-center/case/CaseMetadataComparison.tsx', 'utf8');
const staleSource = fs.readFileSync('src/components/review-center/case/CaseStaleWarning.tsx', 'utf8');
const manageHelperSource = fs.readFileSync('src/lib/review-center/case-manage.ts', 'utf8');
const clientSource = fs.readFileSync('src/lib/review-center/case-api-client.ts', 'utf8');

assert(manageSource.includes('fetchCaseAdminDetail') && manageSource.includes('updateCase'), 'manage workspace uses admin get + update');
assert(manageSource.includes('admin.status === \'DRAFT\''), 'editor editable only for DRAFT');
assert(manageSource.includes('beforeunload'), 'beforeunload guard present');
assert(manageSource.includes('confirmDiscardIfNeeded'), 'dirty refresh confirm helper used');
assert(manageSource.includes('canSaveCaseStatus(admin.status)'), 'save handler uses status guard helper');

const saveHandlerStart = manageSource.indexOf('async function handleSave()');
const manualRefreshStart = manageSource.indexOf('function handleManualRefresh()');
assert(saveHandlerStart !== -1 && manualRefreshStart !== -1 && saveHandlerStart < manualRefreshStart, 'save and refresh handlers present in order');
const saveHandlerSource = manageSource.slice(saveHandlerStart, manualRefreshStart);
const guardIndex = saveHandlerSource.indexOf('canSaveCaseStatus(admin.status)');
const updateCallIndex = saveHandlerSource.indexOf('updateCase(');
assert(guardIndex !== -1 && updateCallIndex !== -1 && guardIndex < updateCallIndex, 'status guard precedes updateCase call');
assert(!saveHandlerSource.includes('loadAdmin'), 'save path never auto admin refetch');

const conflictStart = saveHandlerSource.indexOf("code === 'VERSION_CONFLICT'");
const transitionStart = saveHandlerSource.indexOf("code === 'INVALID_TRANSITION'");
const forbiddenStart = saveHandlerSource.indexOf("error instanceof CaseApiError && error.status === 403");
assert(conflictStart !== -1 && transitionStart !== -1 && forbiddenStart !== -1 && conflictStart < transitionStart && transitionStart < forbiddenStart, 'save error branches present');
assert(!saveHandlerSource.slice(conflictStart, transitionStart).includes('loadAdmin'), 'version conflict branch no admin refetch');
assert(!saveHandlerSource.slice(transitionStart, forbiddenStart).includes('loadAdmin'), 'invalid transition branch no admin refetch');

const silentLoadIndex = manageSource.indexOf('loadAdmin({ silent: true })');
const confirmRefreshIndex = manageSource.indexOf('confirmDiscardIfNeeded(dirty, message => window.confirm(message))');
assert(silentLoadIndex !== -1 && confirmRefreshIndex !== -1 && confirmRefreshIndex < silentLoadIndex, 'silent refresh is guarded by dirty confirm');

for (const source of [manageSource, editorSource, metadataSource, staleSource, manageHelperSource, clientSource]) {
  for (const token of ['@supabase', 'createClient', 'supabase.from(', '.rpc(', 'as any', 'as unknown as', '@ts-ignore', '@ts-expect-error']) {
    assert(!source.includes(token), 'no direct supabase / unsafe cast');
  }
}

for (const token of ['fetchCaseAudit', '/audit', 'CaseAuditPanel', 'AuditSection']) {
  assert(!manageSource.includes(token), 'manage workspace no audit reference: ' + token);
}

assert(!manageSource.includes('>{admin.id}') && !manageSource.includes('>{admin.sourceReviewId}'), 'manage no internal UUID text render');
assert(metadataSource.includes('案例当前快照') && metadataSource.includes('来源复盘当前分类'), 'metadata comparison sections separated');
assert(staleSource.includes('来源复盘已发生变化') && staleSource.includes('staleReasonLabel'), 'stale warning present');
assert(manageHelperSource.includes('buildCasePatch') && manageHelperSource.includes('normalizeCaseEditorDraft'), 'manage pure helpers exist');
assert(clientSource.includes('updateCase') && clientSource.includes('parseCaseMutationResult'), 'client update extension present');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
