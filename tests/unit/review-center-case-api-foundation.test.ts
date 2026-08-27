import fs from 'node:fs';
import {
  caseAdminDetailSchema,
  caseAuditItemSchema,
  caseCandidateItemSchema,
  caseCreateRequestSchema,
  caseExpectedVersionSchema,
  caseHideRequestSchema,
  caseLibraryItemSchema,
  caseMutationResultSchema,
  caseNoSchema,
  casePublicDetailSchema,
  casePublishRequestSchema,
  caseReopenRequestSchema,
  caseUpdatePatchSchema,
  caseUpdateRequestSchema,
  parseCaseAuditQuery,
  parseCaseCandidateQuery,
  parseCaseLibraryQuery,
  type CaseAdminDetail,
  type CaseAuditItem,
  type CaseCandidateItem,
  type CaseLibraryItem,
  type CaseMutationResult,
} from '../../src/lib/review-center/case-schemas';
import {
  CASE_BUSINESS_CODES,
  CaseBusinessError,
  CaseRpcContractError,
  CaseRpcUnexpectedError,
  getCaseBusinessHttpStatus,
  getCaseBusinessMessage,
  sanitizeCaseBusinessErrorData,
} from '../../src/lib/review-center/case-errors';
import {
  callCaseAdminDetail,
  callCaseAudit,
  callCaseCandidates,
  callCaseCreate,
  callCaseHide,
  callCaseLibrary,
  callCasePublicDetail,
  callCasePublish,
  callCaseReopen,
  callCaseUpdateDraft,
  type CaseRpcClient,
} from '../../src/lib/review-center/case-rpc';
import { resolveAdminCaseId } from '../../src/lib/review-center/case-id-resolver';

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

function fakeClient(
  result: unknown,
  calls: Array<{ name: string; args: Record<string, unknown> }> = [],
): CaseRpcClient {
  return {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return result as any;
    },
  };
}

function repeatedQuery(key: string, value: string, count: number): URLSearchParams {
  return new URLSearchParams(
    Array.from({ length: count }, () => `${key}=${encodeURIComponent(value)}`).join('&'),
  );
}

const UUID = '00000000-0000-0000-0000-000000000001';
const CASE_NO = 'CASE-2026-000001';

const mutation: CaseMutationResult = {
  id: UUID,
  caseNo: CASE_NO,
  status: 'DRAFT',
  version: 1,
  sourceReviewVersion: 1,
};

const libraryItem: CaseLibraryItem = {
  caseNo: CASE_NO,
  title: 'case title',
  summary: null,
  lessonSummary: null,
  preventionSummary: null,
  applicabilityNotes: null,
  reviewType: 'A',
  risk: null,
  occurredAt: null,
  publishedAt: '2026-08-27T00:00:00Z',
  metadata: {
    materials: [],
    processes: [],
    problemDomains: [],
    problemSymptoms: [],
    materialOtherText: null,
    processOtherText: null,
    problemDomainOtherText: null,
    problemSymptomOtherText: null,
  },
};

const candidateItem: CaseCandidateItem = {
  sourceReviewId: UUID,
  reviewNo: 'REV-2026-000001',
  reviewType: 'A',
  risk: null,
  occurredAt: null,
  sourceVersion: 1,
  metadataSummary: [],
  existingCase: null,
};

const adminDetail: CaseAdminDetail = {
  id: UUID,
  caseNo: CASE_NO,
  status: 'DRAFT',
  version: 1,
  title: 'case title',
  summary: null,
  lessonSummary: null,
  preventionSummary: null,
  applicabilityNotes: null,
  reviewTypeSnapshot: null,
  riskSnapshot: null,
  occurredAtSnapshot: null,
  publishedAt: null,
  hiddenAt: null,
  hiddenReason: null,
  sourceReviewId: UUID,
  sourceReviewNo: 'REV-2026-000001',
  sourceCurrentStatus: 'closed',
  sourceCurrentVersion: 1,
  caseSourceReviewVersion: 1,
  sourceChangedSinceSnapshot: false,
  isStale: false,
  staleReasons: [],
  currentSourceMetadata: [],
  caseSnapshotMetadata: {
    materials: [],
    processes: [],
    problemDomains: [],
    problemSymptoms: [],
  },
};

const auditItem: CaseAuditItem = {
  action: 'CASE_CREATED',
  versionBefore: null,
  versionAfter: 1,
  actorDisplayName: 'QA Admin',
  createdAt: '2026-08-27T00:00:00Z',
  safeChangeSummary: {
    changedFields: null,
    fromStatus: null,
    toStatus: null,
    sourceReviewVersion: null,
    publishKind: null,
    status: 'DRAFT',
  },
};

console.log('\n=== Case API Foundation Slice 1 ===');

// CaseNo
assert(caseNoSchema.safeParse(CASE_NO).success, 'valid caseNo');
for (const bad of [
  null,
  '',
  ' CASE-2026-000001 ',
  'case-2026-000001',
  'CASE-26-1',
  'CASE-2026-0000001',
  'CASE-2026-000001x',
  'CASE-2026-00000A',
]) {
  assert(!caseNoSchema.safeParse(bad).success, 'invalid caseNo rejected: ' + JSON.stringify(bad));
}

// Expected version
assert(caseExpectedVersionSchema.safeParse(1).success, 'expected version 1 accepted');
for (const bad of ['3', null, undefined, 0, -1, 1.5, NaN, Infinity, -Infinity]) {
  assert(!caseExpectedVersionSchema.safeParse(bad).success, 'invalid expected version rejected: ' + String(bad));
}

// Create request
const createValid = caseCreateRequestSchema.safeParse({
  sourceReviewId: UUID,
  expectedReviewVersion: 1,
  title: '  title  ',
});
assert(createValid.success && createValid.data.title === 'title', 'create title trimmed');
assert(caseCreateRequestSchema.safeParse({
  sourceReviewId: UUID,
  expectedReviewVersion: 1,
  title: '  ' + 'x'.repeat(200) + '  ',
}).success, 'create title normalized length accepted');
assert(!caseCreateRequestSchema.safeParse({
  sourceReviewId: 'bad',
  expectedReviewVersion: 1,
  title: 'x',
}).success, 'create invalid uuid rejected');
assert(!caseCreateRequestSchema.safeParse({
  sourceReviewId: UUID,
  expectedReviewVersion: '1',
  title: 'x',
}).success, 'create string version rejected');
assert(!caseCreateRequestSchema.safeParse({
  sourceReviewId: UUID,
  expectedReviewVersion: null,
  title: 'x',
}).success, 'create null version rejected');
assert(!caseCreateRequestSchema.safeParse({
  sourceReviewId: UUID,
  expectedReviewVersion: 1,
  title: 'x',
  status: 'PUBLISHED',
}).success, 'create unknown field rejected');

// Update / patch presence
const emptyPatch = caseUpdateRequestSchema.safeParse({ expectedVersion: 1, patch: {} });
assert(emptyPatch.success && !('summary' in emptyPatch.data.patch), 'empty patch allowed and no summary');
const nullPatch = caseUpdateRequestSchema.safeParse({ expectedVersion: 1, patch: { summary: null } });
assert(nullPatch.success && nullPatch.data.patch.summary === null, 'explicit null preserved');
const blankPatch = caseUpdateRequestSchema.safeParse({ expectedVersion: 1, patch: { summary: '   ' } });
assert(blankPatch.success && blankPatch.data.patch.summary === null, 'blank optional normalized to null');
assert(!caseUpdateRequestSchema.safeParse({ expectedVersion: 1, patch: { title: null } }).success, 'patch title null rejected');
assert(!caseUpdateRequestSchema.safeParse({ expectedVersion: 1, patch: { status: 'PUBLISHED' } }).success, 'patch unknown key rejected');
assert(!caseUpdateRequestSchema.safeParse({ expectedVersion: 1, patch: { summary: 123 } }).success, 'patch number rejected');
assert(!caseUpdateRequestSchema.safeParse({ expectedVersion: 1, patch: { summary: {} } }).success, 'patch object rejected');
assert(!caseUpdateRequestSchema.safeParse({ expectedVersion: 1, patch: { summary: [] } }).success, 'patch array rejected');
assert(!caseUpdateRequestSchema.safeParse({ expectedVersion: 1, patch: {}, orgId: UUID }).success, 'update root unknown rejected');

// Publish / Hide / Reopen
assert(casePublishRequestSchema.safeParse({ expectedVersion: 1, expectedSourceReviewVersion: 2 }).success, 'publish valid');
assert(!casePublishRequestSchema.safeParse({ expectedVersion: 1 }).success, 'publish missing source version');
assert(!casePublishRequestSchema.safeParse({ expectedVersion: 1, expectedSourceReviewVersion: null }).success, 'publish null source version');
assert(caseHideRequestSchema.safeParse({ expectedVersion: 1, reason: '  hide  ' }).data?.reason === 'hide', 'hide reason trimmed');
assert(!caseHideRequestSchema.safeParse({ expectedVersion: 1, reason: '   ' }).success, 'hide blank reason rejected');
assert(!caseReopenRequestSchema.safeParse({ expectedVersion: 1, reason: 'x' }).success, 'reopen extra field rejected');

// Response privacy / strict boundary
assert(caseMutationResultSchema.safeParse(mutation).success, 'mutation result valid');
assert(!caseMutationResultSchema.safeParse({ ...mutation, orgId: UUID }).success, 'mutation extra orgId rejected');
assert(!caseMutationResultSchema.safeParse({ ...mutation, status: 'submitted' }).success, 'mutation invalid status rejected');
assert(!caseMutationResultSchema.safeParse({ ...mutation, version: 0 }).success, 'mutation version 0 rejected');
assert(!caseMutationResultSchema.safeParse({ ...mutation, sourceReviewVersion: null }).success, 'mutation null source version rejected');
assert(caseLibraryItemSchema.safeParse(libraryItem).success, 'library item valid');
assert(!caseLibraryItemSchema.safeParse({ ...libraryItem, id: UUID }).success, 'library item id rejected');
assert(!caseLibraryItemSchema.safeParse({ ...libraryItem, sourceReviewId: UUID }).success, 'library item sourceReviewId rejected');
assert(!caseLibraryItemSchema.safeParse({ ...libraryItem, customer: 'x' }).success, 'library item customer rejected');
assert(casePublicDetailSchema.safeParse(libraryItem).success, 'public detail valid');
assert(!casePublicDetailSchema.safeParse({ ...libraryItem, sourceReviewNo: 'REV-1' }).success, 'public detail source link rejected');
assert(caseCandidateItemSchema.safeParse(candidateItem).success, 'candidate item valid');
assert(!caseCandidateItemSchema.safeParse({ ...candidateItem, customerName: 'x' }).success, 'candidate customer rejected');
assert(!caseCandidateItemSchema.safeParse({ ...candidateItem, otherRawText: 'x' }).success, 'candidate other raw rejected');
assert(caseAdminDetailSchema.safeParse(adminDetail).success, 'admin detail valid');
assert(!caseAdminDetailSchema.safeParse({ ...adminDetail, customer: 'x' }).success, 'admin detail customer rejected');
assert(!caseAdminDetailSchema.safeParse({ ...adminDetail, rawReviewBody: 'x' }).success, 'admin detail raw review rejected');
assert(caseAuditItemSchema.safeParse(auditItem).success, 'audit item valid');
assert(!caseAuditItemSchema.safeParse({ ...auditItem, actorProfileId: UUID }).success, 'audit actor uuid rejected');
assert(!caseAuditItemSchema.safeParse({ ...auditItem, changes: { secret: 'x' } }).success, 'audit raw changes rejected');

// Error mapping / data whitelist
const expectedStatuses: Record<string, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  SOURCE_VERSION_CONFLICT: 409,
  INVALID_TRANSITION: 409,
  SOURCE_NOT_CLOSED: 409,
  ALREADY_EXISTS: 409,
  INVALID_CASE: 400,
  CASE_METADATA_INCOMPLETE: 422,
  CASE_CURATION_INCOMPLETE: 422,
  INVALID_DICTIONARY: 422,
  CASE_NUMBER_EXHAUSTED: 409,
};
for (const code of CASE_BUSINESS_CODES) {
  assert(getCaseBusinessHttpStatus(code) === expectedStatuses[code], 'http status ' + code);
  assert(typeof getCaseBusinessMessage(code) === 'string' && getCaseBusinessMessage(code).length > 0, 'message ' + code);
}
assert(
  JSON.stringify(sanitizeCaseBusinessErrorData('CASE_METADATA_INCOMPLETE', {
    missingDimensions: ['PROBLEM_DOMAIN', 'EVIL', 'PROBLEM_SYMPTOM', 'CUSTOM', 'PROBLEM_DOMAIN', 'rawText'],
  })) === JSON.stringify({ missingDimensions: ['PROBLEM_DOMAIN', 'PROBLEM_SYMPTOM'] }),
  'metadata missing whitelist',
);
assert(
  JSON.stringify(sanitizeCaseBusinessErrorData('CASE_CURATION_INCOMPLETE', {
    missingFields: ['TITLE', 'RAW_BODY', 'SUMMARY', 'TITLE'],
  })) === JSON.stringify({ missingFields: ['TITLE', 'SUMMARY'] }),
  'curation missing whitelist',
);
assert(sanitizeCaseBusinessErrorData('NOT_FOUND', { secret: 'x' }) === null, 'other error data null');

// RPC transport / business envelope / schema mismatch
const transportCalls: any[] = [];
try {
  await callCaseCreate(fakeClient({ data: null, error: { code: 'PGRST301', message: 'raw' } }, transportCalls), {
    sourceReviewId: UUID,
    expectedReviewVersion: 1,
    title: 'x',
  });
  assert(false, 'transport error should throw');
} catch (err) {
  assert(err instanceof CaseRpcUnexpectedError, 'transport error becomes unexpected');
  assert(transportCalls.length === 1, 'transport error no retry');
}

try {
  await callCasePublish(fakeClient({ data: { ok: false, code: 'VERSION_CONFLICT', message: 'raw', data: null }, error: null }), UUID, {
    expectedVersion: 1,
    expectedSourceReviewVersion: 1,
  });
  assert(false, 'business envelope should throw CaseBusinessError');
} catch (err) {
  assert(err instanceof CaseBusinessError && err.code === 'VERSION_CONFLICT', 'business envelope parsed');
}

const mismatchCalls: any[] = [];
try {
  await callCaseUpdateDraft(fakeClient({ data: { ...mutation, version: undefined }, error: null }, mismatchCalls), UUID, {
    expectedVersion: 1,
    patch: { summary: null },
  });
  assert(false, 'schema mismatch should throw contract error');
} catch (err) {
  assert(err instanceof CaseRpcContractError, 'schema mismatch becomes contract error');
  assert(mismatchCalls.length === 1, 'schema mismatch no retry');
}

// Mutation exactly once + RPC args
async function mutationOnce(label: string, run: (client: CaseRpcClient) => Promise<unknown>, expectedName: string, expectedArgs: Record<string, unknown>) {
  const calls: any[] = [];
  const client = fakeClient({ data: mutation, error: null }, calls);
  const result = await run(client);
  assert(!!result && calls.length === 1 && calls[0].name === expectedName, label + ' exactly once');
  assert(JSON.stringify(calls[0].args) === JSON.stringify(expectedArgs), label + ' args');
}

await mutationOnce(
  'create',
  client => callCaseCreate(client, { sourceReviewId: UUID, expectedReviewVersion: 3, title: 'x' }),
  'review_case_create_from_review',
  { p_review_id: UUID, p_expected_review_version: 3, p_title: 'x' },
);
await mutationOnce(
  'update',
  client => callCaseUpdateDraft(client, UUID, { expectedVersion: 2, patch: { summary: null } }),
  'review_case_update_draft',
  { p_case_id: UUID, p_expected_version: 2, p_patch: { summary: null } },
);
await mutationOnce(
  'publish',
  client => callCasePublish(client, UUID, { expectedVersion: 2, expectedSourceReviewVersion: 3 }),
  'review_case_publish',
  { p_case_id: UUID, p_expected_version: 2, p_expected_source_review_version: 3 },
);
await mutationOnce(
  'hide',
  client => callCaseHide(client, UUID, { expectedVersion: 2, reason: 'reason' }),
  'review_case_hide',
  { p_case_id: UUID, p_expected_version: 2, p_reason: 'reason' },
);
await mutationOnce(
  'reopen',
  client => callCaseReopen(client, UUID, { expectedVersion: 2 }),
  'review_case_reopen_curation',
  { p_case_id: UUID, p_expected_version: 2 },
);

// Read RPC args
const libCalls: any[] = [];
await callCaseLibrary(fakeClient({ data: { ok: true, data: { items: [], limit: 30, offset: 0, hasMore: false } }, error: null }, libCalls), {
  q: '%_literal',
  materialCodes: ['PP', 'ABS'],
  processCodes: [],
  problemDomainCodes: ['PROCESS'],
  problemSymptomCodes: [],
  reviewTypes: ['A'],
  riskLevels: [],
  publishedFrom: '2026-08-27T00:00:00+08:00',
  publishedTo: null,
  limit: 30,
  offset: 0,
});
assert(libCalls.length === 1 && libCalls[0].name === 'review_case_library', 'library rpc name');
assert(libCalls[0].args.p_query === '%_literal', 'library literal query preserved');
assert(JSON.stringify(libCalls[0].args.p_material_codes) === JSON.stringify(['PP', 'ABS']), 'library material codes');
assert(libCalls[0].args.p_process_codes === null && libCalls[0].args.p_problem_symptom_codes === null && libCalls[0].args.p_risk_levels === null, 'library empty arrays to null');
assert(libCalls[0].args.p_published_from === '2026-08-27T00:00:00+08:00' && libCalls[0].args.p_published_to === null, 'library date args');
assert(libCalls[0].args.p_limit === 30 && libCalls[0].args.p_offset === 0, 'library numeric pagination');

const candCalls: any[] = [];
await callCaseCandidates(fakeClient({ data: { ok: true, data: { items: [], limit: 30, offset: 0, hasMore: false } }, error: null }, candCalls), {
  q: null,
  limit: 20,
  offset: 10,
});
assert(candCalls.length === 1 && candCalls[0].name === 'review_case_candidates', 'candidate rpc');
assert(JSON.stringify(candCalls[0].args) === JSON.stringify({ p_limit: 20, p_offset: 10, p_query: null }), 'candidate args');

const auditCalls: any[] = [];
await callCaseAudit(fakeClient({ data: { ok: true, data: { items: [], limit: 30, offset: 0, hasMore: false } }, error: null }, auditCalls), UUID, {
  limit: 20,
  offset: 5,
});
assert(auditCalls.length === 1 && auditCalls[0].name === 'review_case_audit', 'audit rpc');
assert(JSON.stringify(auditCalls[0].args) === JSON.stringify({ p_case_id: UUID, p_limit: 20, p_offset: 5 }), 'audit args');

const detailCalls: any[] = [];
await callCasePublicDetail(fakeClient({ data: { ok: true, data: libraryItem }, error: null }, detailCalls), CASE_NO);
assert(detailCalls.length === 1 && detailCalls[0].name === 'review_case_detail' && detailCalls[0].args.p_case_no === CASE_NO, 'public detail rpc');

const adminCalls: any[] = [];
await callCaseAdminDetail(fakeClient({ data: { ok: true, data: adminDetail }, error: null }, adminCalls), CASE_NO);
assert(adminCalls.length === 1 && adminCalls[0].name === 'review_case_admin_detail' && adminCalls[0].args.p_case_no === CASE_NO, 'admin detail rpc');

// Resolver
const resolverCalls: any[] = [];
const resolverClient: CaseRpcClient = {
  rpc: async (name, args) => {
    resolverCalls.push({ name, args });
    return { data: { ok: true, data: adminDetail }, error: null };
  },
};
const resolved = await resolveAdminCaseId(resolverClient, CASE_NO);
assert(resolved === UUID && resolverCalls.length === 1 && resolverCalls[0].name === 'review_case_admin_detail', 'resolver uses admin detail once');

try {
  await resolveAdminCaseId(fakeClient({ data: { ok: false, code: 'NOT_FOUND', message: 'raw', data: null }, error: null }), CASE_NO);
  assert(false, 'resolver NOT_FOUND should throw business error');
} catch (err) {
  assert(err instanceof CaseBusinessError && err.code === 'NOT_FOUND', 'resolver preserves NOT_FOUND');
}

try {
  await resolveAdminCaseId(fakeClient({ data: { ok: true, data: { ...adminDetail, id: 'bad' } }, error: null }), CASE_NO);
  assert(false, 'resolver malformed response should throw contract error');
} catch (err) {
  assert(err instanceof CaseRpcContractError, 'resolver malformed response contract error');
}

// Query parsers
const libQuery = parseCaseLibraryQuery(new URLSearchParams(
  'q=%25_literal&material=PP&material=ABS&problemDomain=PROCESS&reviewType=A&reviewType=A&publishedFrom=2026-08-27T00:00:00%2B08:00&limit=50&offset=20&tracking=ignored',
));
assert(libQuery.ok && libQuery.data.q === '%_literal', 'library q literal preserved');
assert(libQuery.ok && JSON.stringify(libQuery.data.materialCodes) === JSON.stringify(['PP', 'ABS']), 'library repeated arrays');
assert(libQuery.ok && JSON.stringify(libQuery.data.reviewTypes) === JSON.stringify(['A']), 'library enum dedup');
assert(libQuery.ok && libQuery.data.publishedFrom === '2026-08-27T00:00:00+08:00', 'library date query');
assert(libQuery.ok && libQuery.data.limit === 50 && libQuery.data.offset === 20, 'library pagination');
assert(!parseCaseLibraryQuery(new URLSearchParams('material=')).ok, 'library empty code rejected');
assert(!parseCaseLibraryQuery(new URLSearchParams('limit=')).ok, 'library empty limit rejected');
assert(!parseCaseLibraryQuery(new URLSearchParams('limit=1&limit=2')).ok, 'library duplicate limit rejected');
assert(!parseCaseLibraryQuery(new URLSearchParams('publishedFrom=2026-08-01')).ok, 'library date-only rejected');
assert(parseCaseCandidateQuery(new URLSearchParams('q=REV-2026-000001')).ok, 'candidate query default pagination');
assert(!parseCaseCandidateQuery(new URLSearchParams('limit=101')).ok, 'candidate limit bound');
assert(parseCaseAuditQuery(new URLSearchParams('')).ok, 'audit query default pagination');
assert(!parseCaseAuditQuery(new URLSearchParams('limit=51')).ok, 'audit limit bound');
assert(!parseCaseAuditQuery(new URLSearchParams('offset=100001')).ok, 'audit offset bound');

// Filter raw count gate: 50 accepted, 51 rejected, dedupe after raw count
const mat50Dup = parseCaseLibraryQuery(repeatedQuery('material', 'PP', 50));
assert(mat50Dup.ok && JSON.stringify(mat50Dup.data.materialCodes) === '["PP"]', 'material 50 duplicates accepted');
const mat50Distinct = parseCaseLibraryQuery(new URLSearchParams(
  Array.from({ length: 50 }, (_, i) => `material=CODE${i}`).join('&'),
));
assert(mat50Distinct.ok && mat50Distinct.data.materialCodes.length === 50, 'material 50 distinct accepted');
assert(!parseCaseLibraryQuery(repeatedQuery('material', 'PP', 51)).ok, 'material 51 duplicates rejected');
assert(!parseCaseLibraryQuery(new URLSearchParams(
  Array.from({ length: 51 }, (_, i) => `material=CODE${i}`).join('&'),
)).ok, 'material 51 distinct rejected');
assert(!parseCaseLibraryQuery(repeatedQuery('process', 'FILM_MAKING', 51)).ok, 'process 51 rejected');
assert(!parseCaseLibraryQuery(repeatedQuery('problemDomain', 'PROCESS', 51)).ok, 'problemDomain 51 rejected');
assert(!parseCaseLibraryQuery(repeatedQuery('problemSymptom', 'TRANSFER_INCOMPLETE', 51)).ok, 'problemSymptom 51 rejected');
assert(!parseCaseLibraryQuery(repeatedQuery('reviewType', 'A', 51)).ok, 'reviewType 51 rejected');
assert(!parseCaseLibraryQuery(repeatedQuery('risk', 'RED', 51)).ok, 'risk 51 rejected');

const dedupeOrder = parseCaseLibraryQuery(new URLSearchParams(
  'material=PP&material=ABS&material=PP&material=PET',
));
assert(
  dedupeOrder.ok && JSON.stringify(dedupeOrder.data.materialCodes) === '["PP","ABS","PET"]',
  'first occurrence dedupe order preserved',
);

for (const key of ['material', 'process', 'problemDomain', 'problemSymptom', 'reviewType', 'risk']) {
  assert(!parseCaseLibraryQuery(new URLSearchParams(`${key}=`)).ok, 'empty filter value rejected: ' + key);
}
assert(!parseCaseLibraryQuery(new URLSearchParams('reviewType=a')).ok, 'reviewType lowercase rejected');
assert(!parseCaseLibraryQuery(new URLSearchParams('risk=red')).ok, 'risk lowercase rejected');

// Static service role / retry guard
const foundationFiles = [
  'src/lib/review-center/case-schemas.ts',
  'src/lib/review-center/case-errors.ts',
  'src/lib/review-center/case-rpc.ts',
  'src/lib/review-center/case-id-resolver.ts',
];
const forbidden = [
  '@/lib/supabase/admin',
  'createAdminSupabaseClient',
  'supabaseAdmin',
  'serviceRole',
  'SUPABASE_SERVICE_ROLE_KEY',
];
let serviceRoleGuard = true;
let retryGuard = true;
for (const file of foundationFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const token of forbidden) {
    if (source.includes(token)) serviceRoleGuard = false;
  }
  if (source.includes('retry')) retryGuard = false;
}
assert(serviceRoleGuard, 'service role import guard');
assert(retryGuard, 'no retry source guard');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
