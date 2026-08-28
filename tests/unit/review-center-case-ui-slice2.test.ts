import fs from 'node:fs';
import {
  CaseApiError,
  buildCaseCandidateQueryString,
  createCase,
  fetchCaseAdminDetail,
  fetchCaseCandidates,
  parseCaseAdminDetailResponse,
  parseCaseCandidateResponse,
  parseCaseMutationResult,
  runExclusiveOnce,
} from '../../src/lib/review-center/case-api-client';
import {
  canManageCaseRole,
  caseStatusLabel,
} from '../../src/lib/review-center/case-presentation';
import type { CaseCandidateItem } from '../../src/lib/review-center/case-schemas';

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

const candidateNoExisting: CaseCandidateItem = {
  sourceReviewId: UUID_1,
  reviewNo: 'REV-2026-000001',
  reviewType: 'A',
  risk: 'RED',
  occurredAt: '2026-08-01T00:00:00Z',
  sourceVersion: 11,
  metadataSummary: [
    { metadataType: 'MATERIAL', code: 'PP', label: 'PP', isPrimary: true },
  ],
  existingCase: null,
};

const candidateWithExisting: CaseCandidateItem = {
  ...candidateNoExisting,
  sourceReviewId: UUID_2,
  reviewNo: 'REV-2026-000002',
  existingCase: {
    id: UUID_1,
    caseNo: CASE_NO,
    status: 'PUBLISHED',
    version: 3,
    isSourceChanged: true,
  },
};

const mutationResult = {
  id: UUID_1,
  caseNo: CASE_NO,
  status: 'DRAFT',
  version: 1,
  sourceReviewVersion: 11,
};

const fullAdminDetail = {
  id: UUID_1,
  caseNo: CASE_NO,
  status: 'PUBLISHED',
  version: 3,
  title: 'case title',
  summary: null,
  lessonSummary: null,
  preventionSummary: null,
  applicabilityNotes: null,
  reviewTypeSnapshot: 'A',
  riskSnapshot: 'RED',
  occurredAtSnapshot: null,
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  (globalThis as any).fetch = handler;
}

console.log('\n=== Case UI Slice 2 ===');

// Candidate query serializer
const queryString = buildCaseCandidateQueryString({ q: '100%_ABS 中文', limit: 30, offset: 60 });
const queryParams = new URLSearchParams(queryString);
assert(queryParams.get('q') === '100%_ABS 中文', 'candidate q literal preserved');
assert(queryParams.get('limit') === '30' && queryParams.get('offset') === '60', 'candidate limit/offset params');

// Candidate client: success without existing case
stubFetch(async () => jsonResponse(200, {
  ok: true,
  data: { items: [candidateNoExisting], limit: 30, offset: 0, hasMore: false },
}));
const candidateResult = await fetchCaseCandidates({ q: null, limit: 30, offset: 0 });
assert(candidateResult.items.length === 1 && candidateResult.items[0].sourceReviewId === UUID_1, 'candidate success parsed');
assert(candidateResult.items[0].existingCase === null, 'candidate existingCase null');
assert(candidateResult.items[0].sourceVersion === 11, 'candidate sourceVersion preserved');

const parsedCandidates = parseCaseCandidateResponse({
  ok: true,
  data: { items: [candidateNoExisting], limit: 30, offset: 0, hasMore: true },
});
assert(parsedCandidates.hasMore === true && parsedCandidates.limit === 30, 'candidate response parser');

// Candidate client: existing case row
stubFetch(async () => jsonResponse(200, {
  ok: true,
  data: { items: [candidateWithExisting], limit: 30, offset: 0, hasMore: false },
}));
const existingResult = await fetchCaseCandidates({ q: null, limit: 30, offset: 0 });
assert(existingResult.items[0].existingCase?.caseNo === CASE_NO, 'existing case caseNo parsed');
assert(existingResult.items[0].existingCase?.status === 'PUBLISHED', 'existing case status parsed');
assert(existingResult.items[0].existingCase?.isSourceChanged === true, 'existing case source changed parsed');

// Candidate client: malformed responses
stubFetch(async () => jsonResponse(200, { ok: true, data: { items: 'bad' } }));
try {
  await fetchCaseCandidates({ q: null, limit: 30, offset: 0 });
  assert(false, 'malformed candidate envelope should throw');
} catch (error) {
  assert(error instanceof CaseApiError && error.code === 'INVALID_RESPONSE', 'malformed candidate envelope safe error');
}

stubFetch(async () => jsonResponse(200, {
  ok: true,
  data: { items: [{ ...candidateNoExisting, sourceVersion: 0 }], limit: 30, offset: 0, hasMore: false },
}));
try {
  await fetchCaseCandidates({ q: null, limit: 30, offset: 0 });
  assert(false, 'malformed candidate item should throw');
} catch (error) {
  assert(error instanceof CaseApiError && error.code === 'INVALID_RESPONSE', 'malformed candidate item safe error');
}

stubFetch(async () => jsonResponse(200, {
  ok: true,
  data: {
    items: [{ ...candidateWithExisting, existingCase: { ...candidateWithExisting.existingCase, caseNo: 'bad' } }],
    limit: 30,
    offset: 0,
    hasMore: false,
  },
}));
try {
  await fetchCaseCandidates({ q: null, limit: 30, offset: 0 });
  assert(false, 'malformed existingCase should throw');
} catch (error) {
  assert(error instanceof CaseApiError && error.code === 'INVALID_RESPONSE', 'malformed existingCase safe error');
}

// Candidate client: HTTP errors
for (const status of [401, 403, 500]) {
  stubFetch(async () => jsonResponse(status, {
    ok: false,
    code: 'X',
    message: 'RAW_CANDIDATE_SECRET',
    data: null,
  }));
  try {
    await fetchCaseCandidates({ q: null, limit: 30, offset: 0 });
    assert(false, 'candidate http error should throw: ' + status);
  } catch (error) {
    assert(error instanceof CaseApiError && error.status === status, 'candidate http status ' + status);
    assert(error instanceof CaseApiError && error.code === 'X', 'candidate http code ' + status);
    assert(error instanceof CaseApiError && !error.message.includes('RAW_CANDIDATE_SECRET'), 'candidate raw message hidden ' + status);
  }
}

// Create client: POST + direct 201 DTO + exact body
let capturedCall: any = null;
stubFetch(async (url, init) => {
  capturedCall = { url, init };
  return jsonResponse(201, mutationResult);
});
const created = await createCase({
  sourceReviewId: UUID_1,
  expectedReviewVersion: 11,
  title: '新案例',
});
assert(capturedCall?.url === '/api/review-center/cases', 'create POST url');
assert(capturedCall?.init?.method === 'POST', 'create POST method');
assert(
  capturedCall?.init?.headers instanceof Headers
    && capturedCall.init.headers.get('Content-Type') === 'application/json',
  'create Content-Type json',
);
assert(
  capturedCall?.init?.body === JSON.stringify({
    sourceReviewId: UUID_1,
    expectedReviewVersion: 11,
    title: '新案例',
  }),
  'create body exact',
);
assert(created.caseNo === CASE_NO && created.status === 'DRAFT' && created.version === 1, 'create direct 201 result parsed');

const parsedMutation = parseCaseMutationResult(mutationResult);
assert(parsedMutation.sourceReviewVersion === 11, 'mutation result parser');

// Create client: wrong read envelope rejected
stubFetch(async () => jsonResponse(201, { ok: true, data: mutationResult }));
try {
  await createCase({ sourceReviewId: UUID_1, expectedReviewVersion: 11, title: 'x' });
  assert(false, 'read envelope should not pass as mutation success');
} catch (error) {
  assert(error instanceof CaseApiError && error.code === 'INVALID_RESPONSE', 'read envelope rejected');
}

// Create client: business/HTTP errors, exactly once, no raw message
for (const [status, code] of [[409, 'ALREADY_EXISTS'], [409, 'SOURCE_VERSION_CONFLICT'], [409, 'SOURCE_NOT_CLOSED'], [409, 'CASE_NUMBER_EXHAUSTED'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [500, 'INTERNAL_ERROR']] as Array<[number, string]>) {
  let fetchCount = 0;
  stubFetch(async () => {
    fetchCount++;
    return jsonResponse(status, {
      ok: false,
      code,
      message: 'RAW_CREATE_SECRET',
      data: null,
    });
  });
  try {
    await createCase({ sourceReviewId: UUID_1, expectedReviewVersion: 11, title: 'x' });
    assert(false, 'create error should throw: ' + code);
  } catch (error) {
    assert(error instanceof CaseApiError && error.status === status && error.code === code, 'create error status/code ' + code);
    assert(error instanceof CaseApiError && !error.message.includes('RAW_CREATE_SECRET'), 'create raw message hidden ' + code);
  }
  assert(fetchCount === 1, 'create no retry ' + code);
}

// Same-tick double invocation guard
let taskCalls = 0;
const guard = { current: false };
const results = await Promise.all([
  runExclusiveOnce(guard, async () => {
    taskCalls++;
    return 'ok';
  }),
  runExclusiveOnce(guard, async () => {
    taskCalls++;
    return 'ok';
  }),
]);
assert(taskCalls === 1, 'same-tick double invoke one task');
assert(results[0] === 'ok' && results[1] === null, 'second same-tick invoke skipped');

// Admin shell client
stubFetch(async (url) => {
  assert(url === '/api/review-center/cases/CASE-2026-000001/admin', 'admin detail URL exact');
  return jsonResponse(200, {
    ok: true,
    data: fullAdminDetail,
  });
});
const adminDetail = await fetchCaseAdminDetail(CASE_NO);
assert(adminDetail.caseNo === CASE_NO && adminDetail.title === 'case title' && adminDetail.status === 'PUBLISHED', 'admin shell detail parsed');

const parsedAdmin = parseCaseAdminDetailResponse({
  ok: true,
  data: { ...fullAdminDetail, status: 'DRAFT', version: 1 },
});
assert(parsedAdmin.version === 1 && parsedAdmin.sourceCurrentVersion === 11, 'admin shell response parser');

stubFetch(async () => jsonResponse(200, { ok: true, data: { caseNo: CASE_NO, status: 'BAD', title: 'x', version: 1 } }));
try {
  await fetchCaseAdminDetail(CASE_NO);
  assert(false, 'malformed admin detail should throw');
} catch (error) {
  assert(error instanceof CaseApiError && error.code === 'INVALID_RESPONSE', 'malformed admin detail safe error');
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

// Presentation helpers
assert(canManageCaseRole('admin') === true && canManageCaseRole('manager') === true, 'admin/manager can manage');
assert(canManageCaseRole('operator') === false && canManageCaseRole('sales') === false && canManageCaseRole('viewer') === false, 'non-manager roles hidden');
assert(canManageCaseRole(null) === false && canManageCaseRole('FUTURE') === false, 'unknown role safe');
assert(caseStatusLabel('DRAFT') === '草稿' && caseStatusLabel('PUBLISHED') === '已发布' && caseStatusLabel('HIDDEN') === '已隐藏', 'case status labels');
assert(caseStatusLabel('FUTURE') === 'FUTURE', 'case status unknown safe fallback');

// Static contract: files and routes exist
const candidatesPage = 'src/app/review-center/cases/candidates/page.tsx';
const managePage = 'src/app/review-center/cases/[caseNo]/manage/page.tsx';
const dialogFile = 'src/components/review-center/case/CaseCreateDialog.tsx';
assert(fs.existsSync(candidatesPage), 'candidates route exists');
assert(fs.existsSync(managePage), 'manage route exists');
assert(fs.existsSync(dialogFile), 'create dialog exists');

const librarySource = fs.readFileSync('src/app/review-center/cases/page.tsx', 'utf8');
const candidatesSource = fs.readFileSync(candidatesPage, 'utf8');
const manageSource = fs.readFileSync(managePage, 'utf8');
const dialogSource = fs.readFileSync(dialogFile, 'utf8');
const clientSource = fs.readFileSync('src/lib/review-center/case-api-client.ts', 'utf8');

assert(librarySource.includes('待整理案例') && librarySource.includes('/review-center/cases/candidates'), 'library management CTA');
assert(librarySource.includes('还没有已发布的案例'), 'library public empty state preserved');

assert(candidatesSource.includes('fetchCaseCandidates') && candidatesSource.includes('CaseCreateDialog'), 'candidates page uses candidate client and dialog');
assert(candidatesSource.includes(`/review-center/cases/${'${encodeURIComponent(result.caseNo)}'}/manage`), 'create success navigates by caseNo');
assert(!candidatesSource.includes('createCase('), 'candidates page does not call create directly');

assert(manageSource.includes('fetchCaseAdminDetail'), 'manage shell uses admin detail client');
assert(manageSource.includes('案例管理概览'), 'manage shell neutral title');

for (const source of [candidatesSource, manageSource, dialogSource]) {
  for (const token of ['@supabase', 'createClient', 'supabase.from(', '.rpc(', 'as any', 'as unknown as', '@ts-ignore', '@ts-expect-error']) {
    assert(!source.includes(token), 'no direct supabase / unsafe cast');
  }
  for (const endpoint of ['/audit', '/publish', '/hide', '/reopen']) {
    assert(!source.includes(endpoint), 'no forbidden management endpoint');
  }
  for (const method of ["method: 'PATCH'", "method: 'PUT'", "method: 'DELETE'"]) {
    assert(!source.includes(method), 'no forbidden mutation method');
  }
}

assert(!candidatesSource.includes('>{candidate.sourceReviewId}'), 'candidate source UUID not rendered as text');
assert(!manageSource.includes('>{admin.id}') && !manageSource.includes('>{admin.sourceReviewId}'), 'manage shell no internal UUID text render');
assert(!manageSource.includes('案例已创建') && !manageSource.includes('建设中') && !manageSource.includes('下一阶段开放'), 'manage shell no transient copy');
assert(
  !manageSource.includes('publishCase')
    && !manageSource.includes('hideCase')
    && !manageSource.includes('reopenCase')
    && !manageSource.includes('fetchCaseAudit')
    && !manageSource.includes('CaseHideDialog')
    && !manageSource.includes('CaseAuditPanel'),
  'manage shell no slice3b/3c features',
);

assert(dialogSource.includes('createCase') && dialogSource.includes('runExclusiveOnce'), 'dialog uses create client and exclusive guard');
assert(dialogSource.includes('title.trim()'), 'dialog trims title before request');
assert(!dialogSource.includes('sourceReviewId =') && !dialogSource.includes('sourceVersion ='), 'dialog does not edit source fields');

assert(clientSource.includes('fetchCaseCandidates') && clientSource.includes('createCase') && clientSource.includes('fetchCaseAdminDetail'), 'case client slice2 extensions');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
