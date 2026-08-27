import fs from 'node:fs';
import { register } from 'node:module';
import { NextRequest } from 'next/server';
import { AuthSessionMissingError } from '@supabase/supabase-js';

const loader = `
export async function load(url, context, nextLoad) {
  if (url.endsWith('/src/lib/supabase/server.ts')) {
    return {
      format: 'module',
      source: 'export async function createClient() { return globalThis.__caseMutationFakeSupabase || null; }',
      shortCircuit: true,
    };
  }
  if (url.endsWith('/src/lib/auth/current-user.ts')) {
    return {
      format: 'module',
      source: \`
        import { AuthError } from './types';
        export async function requireUserFromRequest(req) {
          const mode = globalThis.__caseMutationAuthMode || 'ok';
          if (mode === 'ok') {
            return { id: 'u_admin', name: 'Admin', role: 'admin', department: null, email: null, active: true, authSource: 'mock' };
          }
          if (mode === 'denied') {
            throw new AuthError('UNAUTHENTICATED', '未登录');
          }
          if (mode === 'unknown') {
            throw new Error('database unavailable');
          }
          return null;
        }
      \`,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
`;
await register('data:text/javascript,' + encodeURIComponent(loader), import.meta.url);

process.env.AUTH_MODE = 'mock';

const { GET: casesGet, POST: casesPost } = await import('../../src/app/api/review-center/cases/route');
const { GET: detailGet, PATCH: detailPatch } = await import('../../src/app/api/review-center/cases/[caseNo]/route');
const { POST: publishPost } = await import('../../src/app/api/review-center/cases/[caseNo]/publish/route');
const { POST: hidePost } = await import('../../src/app/api/review-center/cases/[caseNo]/hide/route');
const { POST: reopenPost } = await import('../../src/app/api/review-center/cases/[caseNo]/reopen/route');

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

function countRpc(calls: Array<{ name: string; args: Record<string, unknown> }>, name: string): number {
  return calls.filter(call => call.name === name).length;
}

const UUID = '00000000-0000-0000-0000-000000000001';
const CASE_NO = 'CASE-2026-000001';

const draftResult = {
  id: UUID,
  caseNo: CASE_NO,
  status: 'DRAFT',
  version: 1,
  sourceReviewVersion: 1,
};

const publishedResult = {
  id: UUID,
  caseNo: CASE_NO,
  status: 'PUBLISHED',
  version: 2,
  sourceReviewVersion: 1,
};

const hiddenResult = {
  id: UUID,
  caseNo: CASE_NO,
  status: 'HIDDEN',
  version: 3,
  sourceReviewVersion: 1,
};

function adminDetailFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: UUID,
    caseNo: CASE_NO,
    status: 'DRAFT',
    version: 3,
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
    sourceCurrentVersion: 2,
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
    ...overrides,
  };
}

function mutationSuccess(result: unknown) {
  return () => ({ data: result, error: null });
}

function readSuccess(result: unknown) {
  return () => ({ data: { ok: true, data: result }, error: null });
}

function businessFailure(code: string, message = 'SENSITIVE_DB_MESSAGE', data: unknown = null) {
  return () => ({ data: { ok: false, code, message, data }, error: null });
}

function transportFailure() {
  return () => ({
    data: null,
    error: { code: 'PGRST301', message: 'SECRET SQL ERROR https://secret.example' },
  });
}

function writeContractFailure() {
  return () => ({ data: { ...draftResult, version: 'bad' }, error: null });
}

function resolverContractFailure() {
  return () => ({ data: { ok: true, data: { id: 'bad' } }, error: null });
}

function makeClient(
  handlers: Record<string, () => { data: unknown; error: unknown } | undefined> = {},
  getUserResult?: any,
) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const getUserCalls: number[] = [];
  const client: any = {
    auth: {
      getUser: async () => {
        getUserCalls.push(1);
        return getUserResult ?? { data: { user: null }, error: null };
      },
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      const handler = handlers[name];
      if (!handler) return { data: null, error: null };
      return handler();
    },
    from: () => {
      throw new Error('base table access');
    },
  };
  return { client, calls, getUserCalls };
}

async function run(
  handler: any,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    authMode?: string;
    handlers?: Record<string, () => { data: unknown; error: unknown } | undefined>;
    params?: Record<string, string>;
    getUserResult?: any;
  } = {},
) {
  const holder = makeClient(options.handlers, options.getUserResult);
  (globalThis as any).__caseMutationFakeSupabase = holder.client;
  (globalThis as any).__caseMutationAuthMode = options.authMode ?? 'ok';
  const init = { method: options.method ?? 'GET' };
  if (options.body !== undefined) {
    (init as { body?: string }).body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }
  const req = new NextRequest('http://localhost' + path, init);
  const response = await handler(req, options.params ? { params: options.params } : undefined);
  const body = await response.json();
  return { status: response.status, body, calls: holder.calls, getUserCalls: holder.getUserCalls };
}

function assertDirectMutationBody(body: any, label: string) {
  assert(body.ok === undefined && body.code === undefined && body.message === undefined && body.data === undefined, label + ' success direct no envelope');
  assert(
    typeof body.id === 'string' &&
      typeof body.caseNo === 'string' &&
      ['DRAFT', 'PUBLISHED', 'HIDDEN'].includes(body.status) &&
      Number.isInteger(body.version) &&
      body.version > 0 &&
      Number.isInteger(body.sourceReviewVersion) &&
      body.sourceReviewVersion > 0,
    label + ' success mutation result fields',
  );
}

const internal500 = {
  status: 500,
  body: { ok: false, code: 'INTERNAL_ERROR', message: '服务异常', data: null },
};

const createBody = {
  sourceReviewId: UUID,
  expectedReviewVersion: 7,
  title: '  new case title  ',
};

const updateBody = {
  expectedVersion: 7,
  patch: {
    title: ' updated title ',
    summary: null,
    lessonSummary: 'lesson summary',
  },
};

const publishBody = {
  expectedVersion: 7,
  expectedSourceReviewVersion: 11,
};

const hideBody = {
  expectedVersion: 7,
  reason: '  SECRET_REASON_9f3a hide due to issue  ',
};

const reopenBody = {
  expectedVersion: 7,
};

console.log('\n=== Case Mutation API Slice 3 ===');

// Create: auth first
const createUnauth = await run(casesPost, '/api/review-center/cases', { method: 'POST', body: createBody, authMode: 'denied' });
assert(createUnauth.status === 401 && createUnauth.calls.length === 0, 'create unauth 401 no rpc');

const createUnauthMalformed = await run(casesPost, '/api/review-center/cases', { method: 'POST', body: '{bad', authMode: 'denied' });
assert(createUnauthMalformed.status === 401 && createUnauthMalformed.calls.length === 0, 'create unauth + malformed body 401 no rpc');

const createNoSession = await run(casesPost, '/api/review-center/cases', {
  method: 'POST',
  body: createBody,
  authMode: 'denied',
  getUserResult: { data: { user: null }, error: null },
});
assert(createNoSession.status === 401 && createNoSession.calls.length === 0, 'create no session 401 no write');

const createRealSessionMissing = await run(casesPost, '/api/review-center/cases', {
  method: 'POST',
  body: createBody,
  authMode: 'denied',
  getUserResult: { data: null, error: new AuthSessionMissingError() },
});
assert(createRealSessionMissing.status === 401 && createRealSessionMissing.body.error === '未登录或无权限' && createRealSessionMissing.calls.length === 0, 'create real session missing 401 no write');

const createProfileDenied = await run(casesPost, '/api/review-center/cases', {
  method: 'POST',
  body: createBody,
  authMode: 'denied',
  getUserResult: { data: { user: { id: 'u_inactive' } }, error: null },
});
assert(createProfileDenied.status === 403 && createProfileDenied.body.code === 'FORBIDDEN' && createProfileDenied.body.message === '没有权限执行该操作' && createProfileDenied.calls.length === 0, 'create profile denial 403 no write');

const createUnexpectedAuth = await run(casesPost, '/api/review-center/cases', { method: 'POST', body: createBody, authMode: 'unknown' });
assert(createUnexpectedAuth.status === 500 && createUnexpectedAuth.body.code === 'INTERNAL_ERROR' && createUnexpectedAuth.calls.length === 0, 'create unexpected auth 500 no write');

// Create: validation
const createMalformed = await run(casesPost, '/api/review-center/cases', { method: 'POST', body: '{bad' });
assert(createMalformed.status === 400 && JSON.stringify(createMalformed.body) === JSON.stringify({ error: '请求参数无效' }) && createMalformed.calls.length === 0, 'create malformed JSON 400 no rpc');

const createEmpty = await run(casesPost, '/api/review-center/cases', { method: 'POST', body: '' });
assert(createEmpty.status === 400 && createEmpty.calls.length === 0, 'create empty body 400 no rpc');

const createPrimitive = await run(casesPost, '/api/review-center/cases', { method: 'POST', body: 123 });
assert(createPrimitive.status === 400 && createPrimitive.calls.length === 0, 'create primitive body 400 no rpc');

const createArray = await run(casesPost, '/api/review-center/cases', { method: 'POST', body: [] });
assert(createArray.status === 400 && createArray.calls.length === 0, 'create array body 400 no rpc');

const createNull = await run(casesPost, '/api/review-center/cases', { method: 'POST', body: null });
assert(createNull.status === 400 && createNull.calls.length === 0, 'create null body 400 no rpc');

const createUnknownField = await run(casesPost, '/api/review-center/cases', { method: 'POST', body: { ...createBody, status: 'PUBLISHED' } });
assert(createUnknownField.status === 400 && createUnknownField.calls.length === 0, 'create unknown field 400');

const createBadUuid = await run(casesPost, '/api/review-center/cases', { method: 'POST', body: { ...createBody, sourceReviewId: 'bad' } });
assert(createBadUuid.status === 400 && createBadUuid.calls.length === 0, 'create invalid sourceReviewId 400');

const createZeroVersion = await run(casesPost, '/api/review-center/cases', { method: 'POST', body: { ...createBody, expectedReviewVersion: 0 } });
assert(createZeroVersion.status === 400 && createZeroVersion.calls.length === 0, 'create expectedReviewVersion 0 400');

const createDecimalVersion = await run(casesPost, '/api/review-center/cases', { method: 'POST', body: { ...createBody, expectedReviewVersion: 1.5 } });
assert(createDecimalVersion.status === 400 && createDecimalVersion.calls.length === 0, 'create decimal version 400');

const createStringVersion = await run(casesPost, '/api/review-center/cases', { method: 'POST', body: { ...createBody, expectedReviewVersion: '7' } });
assert(createStringVersion.status === 400 && createStringVersion.calls.length === 0, 'create string version 400');

const createBlankTitle = await run(casesPost, '/api/review-center/cases', { method: 'POST', body: { ...createBody, title: '   ' } });
assert(createBlankTitle.status === 400 && createBlankTitle.calls.length === 0, 'create blank title 400');

const createLongTitle = await run(casesPost, '/api/review-center/cases', { method: 'POST', body: { ...createBody, title: 'x'.repeat(201) } });
assert(createLongTitle.status === 400 && createLongTitle.calls.length === 0, 'create too-long title 400');

// Create: success
const createOk = await run(casesPost, '/api/review-center/cases', {
  method: 'POST',
  body: createBody,
  handlers: { 'review_case_create_from_review': mutationSuccess(draftResult) },
});
assert(createOk.status === 201, 'create success 201');
assertDirectMutationBody(createOk.body, 'create');
assert(createOk.calls.length === 1 && createOk.calls[0].name === 'review_case_create_from_review', 'create rpc function exact');
assert(JSON.stringify(createOk.calls[0].args) === JSON.stringify({ p_review_id: UUID, p_expected_review_version: 7, p_title: 'new case title' }), 'create rpc args exact');
assert(countRpc(createOk.calls, 'review_case_create_from_review') === 1, 'create write exactly once');

// Create: business errors through real wrapper
for (const code of ['ALREADY_EXISTS', 'SOURCE_NOT_CLOSED', 'SOURCE_VERSION_CONFLICT', 'CASE_NUMBER_EXHAUSTED']) {
  const res = await run(casesPost, '/api/review-center/cases', {
    method: 'POST',
    body: createBody,
    handlers: { 'review_case_create_from_review': businessFailure(code) },
  });
  assert(res.status === 409 && res.body.code === code, 'create ' + code + ' 409');
  assert(countRpc(res.calls, 'review_case_create_from_review') === 1, 'create ' + code + ' exactly once');
  assert(!JSON.stringify(res.body).includes('SENSITIVE_DB_MESSAGE'), 'create ' + code + ' local message');
}

const createForbidden = await run(casesPost, '/api/review-center/cases', {
  method: 'POST',
  body: createBody,
  handlers: { 'review_case_create_from_review': businessFailure('FORBIDDEN') },
});
assert(createForbidden.status === 403 && createForbidden.body.code === 'FORBIDDEN' && !JSON.stringify(createForbidden.body).includes('SENSITIVE_DB_MESSAGE'), 'create FORBIDDEN 403');

const createNotFound = await run(casesPost, '/api/review-center/cases', {
  method: 'POST',
  body: createBody,
  handlers: { 'review_case_create_from_review': businessFailure('NOT_FOUND') },
});
assert(createNotFound.status === 404 && createNotFound.body.code === 'NOT_FOUND', 'create NOT_FOUND 404');

// Create: transport / contract / strict response
const createTransport = await run(casesPost, '/api/review-center/cases', {
  method: 'POST',
  body: createBody,
  handlers: { 'review_case_create_from_review': transportFailure() },
});
assert(createTransport.status === 500 && JSON.stringify(createTransport.body) === JSON.stringify(internal500.body), 'create transport 500 exact');
assert(!JSON.stringify(createTransport.body).includes('SECRET SQL ERROR') && !JSON.stringify(createTransport.body).includes('secret.example'), 'create transport privacy');

const createContract = await run(casesPost, '/api/review-center/cases', {
  method: 'POST',
  body: createBody,
  handlers: { 'review_case_create_from_review': writeContractFailure() },
});
assert(createContract.status === 500 && createContract.body.code === 'INTERNAL_ERROR', 'create contract mismatch 500');

const createStrict = await run(casesPost, '/api/review-center/cases', {
  method: 'POST',
  body: createBody,
  handlers: { 'review_case_create_from_review': mutationSuccess({ ...draftResult, secretField: 'SECRET' }) },
});
assert(createStrict.status === 500 && createStrict.body.code === 'INTERNAL_ERROR' && !JSON.stringify(createStrict.body).includes('SECRET'), 'create strict mutation response validation 500 sanitized');

const createUnknownCode = await run(casesPost, '/api/review-center/cases', {
  method: 'POST',
  body: createBody,
  handlers: {
    'review_case_create_from_review': businessFailure('FUTURE_UNKNOWN_CODE', 'SENSITIVE_FUTURE_DB_MESSAGE', { secret: 'DO_NOT_LEAK' }),
  },
});
assert(createUnknownCode.status === 500 && JSON.stringify(createUnknownCode.body) === JSON.stringify(internal500.body), 'unknown business code real wrapper 500 exact');
assert(
  !JSON.stringify(createUnknownCode.body).includes('FUTURE_UNKNOWN_CODE') &&
    !JSON.stringify(createUnknownCode.body).includes('SENSITIVE_FUTURE_DB_MESSAGE') &&
    !JSON.stringify(createUnknownCode.body).includes('DO_NOT_LEAK'),
  'unknown business code raw code/message/data not leaked',
);
assert(countRpc(createUnknownCode.calls, 'review_case_create_from_review') === 1, 'unknown business code write exactly once');

// Update: auth first
const updateUnauth = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, { method: 'PATCH', body: updateBody, authMode: 'denied', params: { caseNo: CASE_NO } });
assert(updateUnauth.status === 401 && updateUnauth.calls.length === 0, 'update unauth 401 no rpc');

const updateUnauthInvalidInput = await run(detailPatch, '/api/review-center/cases/not-a-valid-case', {
  method: 'PATCH',
  body: '{malformed',
  authMode: 'denied',
  params: { caseNo: 'not-a-valid-case' },
});
assert(updateUnauthInvalidInput.status === 401 && JSON.stringify(updateUnauthInvalidInput.body) === JSON.stringify({ error: '未登录或无权限' }), 'dynamic unauth invalid caseNo + malformed body auth first 401');
assert(countRpc(updateUnauthInvalidInput.calls, 'review_case_admin_detail') === 0, 'dynamic unauth invalid input resolver rpc zero');
assert(countRpc(updateUnauthInvalidInput.calls, 'review_case_update_draft') === 0, 'dynamic unauth invalid input write rpc zero');

// Update: invalid caseNo before body and resolver
for (const bad of ['case-2026-000001', ' CASE-2026-000001 ']) {
  const res = await run(detailPatch, '/api/review-center/cases/' + encodeURIComponent(bad), {
    method: 'PATCH',
    body: updateBody,
    params: { caseNo: bad },
    handlers: { 'review_case_admin_detail': readSuccess(adminDetailFixture()) },
  });
  assert(res.status === 400 && res.calls.length === 0, 'update invalid caseNo 400 no rpc');
}

// Update: validation
const updateMalformed = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, { method: 'PATCH', body: '{bad', params: { caseNo: CASE_NO } });
assert(updateMalformed.status === 400 && updateMalformed.calls.length === 0, 'update malformed JSON 400 no resolver');

const updateUnknownRoot = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, { method: 'PATCH', body: { ...updateBody, orgId: UUID }, params: { caseNo: CASE_NO } });
assert(updateUnknownRoot.status === 400 && updateUnknownRoot.calls.length === 0, 'update unknown root field 400 no resolver');

const updateUnknownPatch = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, { method: 'PATCH', body: { expectedVersion: 7, patch: { status: 'PUBLISHED' } }, params: { caseNo: CASE_NO } });
assert(updateUnknownPatch.status === 400 && updateUnknownPatch.calls.length === 0, 'update unknown patch field 400 no resolver');

const updateInvalidVersion = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, { method: 'PATCH', body: { expectedVersion: 0, patch: {} }, params: { caseNo: CASE_NO } });
assert(updateInvalidVersion.status === 400 && updateInvalidVersion.calls.length === 0, 'update invalid version 400 no resolver');

const updateTitleNull = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, { method: 'PATCH', body: { expectedVersion: 7, patch: { title: null } }, params: { caseNo: CASE_NO } });
assert(updateTitleNull.status === 400 && updateTitleNull.calls.length === 0, 'update patch title null rejected');

// Update: empty patch allowed and absent/null preserved
const updateEmptyPatch = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, {
  method: 'PATCH',
  body: { expectedVersion: 7, patch: {} },
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture()),
    'review_case_update_draft': mutationSuccess(draftResult),
  },
});
assert(updateEmptyPatch.status === 200, 'update empty patch allowed 200');
assert(countRpc(updateEmptyPatch.calls, 'review_case_admin_detail') === 1 && countRpc(updateEmptyPatch.calls, 'review_case_update_draft') === 1, 'update empty patch resolver + write once');
const updateEmptyPatchRpc = updateEmptyPatch.calls[1].args.p_patch as Record<string, unknown>;
assert(JSON.stringify(updateEmptyPatchRpc) === '{}' && !('summary' in updateEmptyPatchRpc), 'update absent patch key preserved');

const updateNullSummary = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, {
  method: 'PATCH',
  body: { expectedVersion: 7, patch: { summary: null } },
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture()),
    'review_case_update_draft': mutationSuccess(draftResult),
  },
});
const updateNullSummaryPatch = updateNullSummary.calls[1].args.p_patch as { summary: unknown };
assert(updateNullSummary.status === 200 && updateNullSummaryPatch.summary === null, 'update explicit null patch preserved');

// Update: success and version authority
const updateOk = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, {
  method: 'PATCH',
  body: updateBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture()),
    'review_case_update_draft': mutationSuccess(draftResult),
  },
});
assert(updateOk.status === 200, 'update success 200');
assertDirectMutationBody(updateOk.body, 'update');
assert(countRpc(updateOk.calls, 'review_case_admin_detail') === 1 && countRpc(updateOk.calls, 'review_case_update_draft') === 1, 'update resolver1 write1');
assert(updateOk.calls[0].name === 'review_case_admin_detail' && updateOk.calls[0].args.p_case_no === CASE_NO, 'update resolver caseNo exact');
assert(updateOk.calls[1].args.p_case_id === UUID, 'update mutation caseId from resolver');
assert(JSON.stringify(updateOk.calls[1].args.p_patch) === JSON.stringify({ title: 'updated title', summary: null, lessonSummary: 'lesson summary' }), 'update patch normalized args');

const updateHard = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, {
  method: 'PATCH',
  body: { expectedVersion: 7, patch: { title: 'x' } },
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture({ version: 999 })),
    'review_case_update_draft': mutationSuccess(draftResult),
  },
});
const updateHardRpcVersion = updateHard.calls[1].args.p_expected_version;
assert(updateHardRpcVersion === 7, 'update version authority client literal 7');
assert(updateHardRpcVersion !== 999, 'update resolver version 999 not used');

// Update: business errors exactly once
for (const code of ['VERSION_CONFLICT', 'INVALID_TRANSITION']) {
  const res = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, {
    method: 'PATCH',
    body: updateBody,
    params: { caseNo: CASE_NO },
    handlers: {
      'review_case_admin_detail': readSuccess(adminDetailFixture()),
      'review_case_update_draft': businessFailure(code),
    },
  });
  assert(res.status === 409 && res.body.code === code, 'update ' + code + ' 409');
  assert(countRpc(res.calls, 'review_case_update_draft') === 1, 'update ' + code + ' write exactly once');
}

// Update: resolver failure short circuit
const updateResolverNotFound = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, {
  method: 'PATCH',
  body: updateBody,
  params: { caseNo: CASE_NO },
  handlers: { 'review_case_admin_detail': businessFailure('NOT_FOUND') },
});
assert(updateResolverNotFound.status === 404 && countRpc(updateResolverNotFound.calls, 'review_case_update_draft') === 0, 'update resolver NOT_FOUND 404 no write');

const updateResolverForbidden = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, {
  method: 'PATCH',
  body: updateBody,
  params: { caseNo: CASE_NO },
  handlers: { 'review_case_admin_detail': businessFailure('FORBIDDEN') },
});
assert(updateResolverForbidden.status === 403 && countRpc(updateResolverForbidden.calls, 'review_case_update_draft') === 0, 'update resolver FORBIDDEN 403 no write');

const updateResolverTransport = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, {
  method: 'PATCH',
  body: updateBody,
  params: { caseNo: CASE_NO },
  handlers: { 'review_case_admin_detail': transportFailure() },
});
assert(updateResolverTransport.status === 500 && countRpc(updateResolverTransport.calls, 'review_case_update_draft') === 0, 'update resolver transport 500 no write');

const updateResolverContract = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, {
  method: 'PATCH',
  body: updateBody,
  params: { caseNo: CASE_NO },
  handlers: { 'review_case_admin_detail': resolverContractFailure() },
});
assert(updateResolverContract.status === 500 && countRpc(updateResolverContract.calls, 'review_case_update_draft') === 0, 'update resolver contract 500 no write');

// Update: write transport / contract
const updateTransport = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, {
  method: 'PATCH',
  body: updateBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture()),
    'review_case_update_draft': transportFailure(),
  },
});
assert(updateTransport.status === 500 && updateTransport.body.code === 'INTERNAL_ERROR' && !JSON.stringify(updateTransport.body).includes('SECRET SQL ERROR'), 'update write transport 500 sanitized');
assert(countRpc(updateTransport.calls, 'review_case_update_draft') === 1, 'update transport no retry');

const updateContract = await run(detailPatch, '/api/review-center/cases/' + CASE_NO, {
  method: 'PATCH',
  body: updateBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture()),
    'review_case_update_draft': writeContractFailure(),
  },
});
assert(updateContract.status === 500 && updateContract.body.code === 'INTERNAL_ERROR', 'update write contract mismatch 500');

// Publish: auth first
const publishUnauth = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', { method: 'POST', body: publishBody, authMode: 'denied', params: { caseNo: CASE_NO } });
assert(publishUnauth.status === 401 && publishUnauth.calls.length === 0, 'publish unauth 401 no rpc');

const publishInvalidCaseNo = await run(publishPost, '/api/review-center/cases/bad/publish', { method: 'POST', body: publishBody, params: { caseNo: 'bad' } });
assert(publishInvalidCaseNo.status === 400 && publishInvalidCaseNo.calls.length === 0, 'publish invalid caseNo 400 no resolver');

// Publish: validation
const publishMalformed = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', { method: 'POST', body: '{bad', params: { caseNo: CASE_NO } });
assert(publishMalformed.status === 400 && publishMalformed.calls.length === 0, 'publish malformed JSON 400 no resolver');

const publishMissingCaseVersion = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', { method: 'POST', body: { expectedSourceReviewVersion: 11 }, params: { caseNo: CASE_NO } });
assert(publishMissingCaseVersion.status === 400 && publishMissingCaseVersion.calls.length === 0, 'publish missing expectedVersion 400');

const publishMissingSourceVersion = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', { method: 'POST', body: { expectedVersion: 7 }, params: { caseNo: CASE_NO } });
assert(publishMissingSourceVersion.status === 400 && publishMissingSourceVersion.calls.length === 0, 'publish missing expectedSourceReviewVersion 400');

const publishNullVersions = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', { method: 'POST', body: { expectedVersion: null, expectedSourceReviewVersion: null }, params: { caseNo: CASE_NO } });
assert(publishNullVersions.status === 400 && publishNullVersions.calls.length === 0, 'publish null versions 400');

const publishZero = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', { method: 'POST', body: { expectedVersion: 0, expectedSourceReviewVersion: 11 }, params: { caseNo: CASE_NO } });
assert(publishZero.status === 400 && publishZero.calls.length === 0, 'publish zero version 400');

const publishDecimal = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', { method: 'POST', body: { expectedVersion: 1.5, expectedSourceReviewVersion: 11 }, params: { caseNo: CASE_NO } });
assert(publishDecimal.status === 400 && publishDecimal.calls.length === 0, 'publish decimal version 400');

const publishString = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', { method: 'POST', body: { expectedVersion: '7', expectedSourceReviewVersion: '11' }, params: { caseNo: CASE_NO } });
assert(publishString.status === 400 && publishString.calls.length === 0, 'publish string versions 400');

const publishUnknownField = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', { method: 'POST', body: { ...publishBody, reason: 'x' }, params: { caseNo: CASE_NO } });
assert(publishUnknownField.status === 400 && publishUnknownField.calls.length === 0, 'publish unknown field 400');

// Publish: dual version hard authority test
const publishHard = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', {
  method: 'POST',
  body: publishBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture({ version: 999, sourceCurrentVersion: 888, caseSourceReviewVersion: 777 })),
    'review_case_publish': mutationSuccess(publishedResult),
  },
});
assert(publishHard.status === 200, 'publish hard authority success 200');
assertDirectMutationBody(publishHard.body, 'publish');
assert(countRpc(publishHard.calls, 'review_case_admin_detail') === 1 && countRpc(publishHard.calls, 'review_case_publish') === 1, 'publish resolver1 write1');
assert(publishHard.calls[0].args.p_case_no === CASE_NO, 'publish resolver caseNo exact');
assert(publishHard.calls[1].args.p_case_id === UUID, 'publish mutation caseId from resolver');
assert(publishHard.calls[1].args.p_expected_version === 7 && publishHard.calls[1].args.p_expected_source_review_version === 11, 'publish dual version client authority');
assert(
  !JSON.stringify(publishHard.calls[1].args).includes('999') &&
    !JSON.stringify(publishHard.calls[1].args).includes('888') &&
    !JSON.stringify(publishHard.calls[1].args).includes('777'),
  'publish resolver versions excluded from mutation authority',
);

// Publish: business errors exactly once
for (const code of ['VERSION_CONFLICT', 'SOURCE_VERSION_CONFLICT', 'INVALID_TRANSITION']) {
  const res = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', {
    method: 'POST',
    body: publishBody,
    params: { caseNo: CASE_NO },
    handlers: {
      'review_case_admin_detail': readSuccess(adminDetailFixture()),
      'review_case_publish': businessFailure(code),
    },
  });
  assert(res.status === 409 && res.body.code === code, 'publish ' + code + ' 409');
  assert(countRpc(res.calls, 'review_case_publish') === 1, 'publish ' + code + ' write exactly once');
}

const publishMetadataIncomplete = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', {
  method: 'POST',
  body: publishBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture()),
    'review_case_publish': businessFailure('CASE_METADATA_INCOMPLETE', 'SENSITIVE_DB_MESSAGE', { missingDimensions: ['PROBLEM_DOMAIN', 'EVIL', 'rawSecret'] }),
  },
});
assert(publishMetadataIncomplete.status === 422 && publishMetadataIncomplete.body.code === 'CASE_METADATA_INCOMPLETE' && publishMetadataIncomplete.body.message === '案例分类信息不完整', 'publish metadata incomplete 422');
assert(JSON.stringify(publishMetadataIncomplete.body.data) === JSON.stringify({ missingDimensions: ['PROBLEM_DOMAIN'] }), 'publish metadata incomplete sanitized');
assert(!JSON.stringify(publishMetadataIncomplete.body).includes('EVIL') && !JSON.stringify(publishMetadataIncomplete.body).includes('rawSecret') && !JSON.stringify(publishMetadataIncomplete.body).includes('SENSITIVE_DB_MESSAGE'), 'publish metadata incomplete privacy');

const publishCurationIncomplete = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', {
  method: 'POST',
  body: publishBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture()),
    'review_case_publish': businessFailure('CASE_CURATION_INCOMPLETE', 'SENSITIVE_DB_MESSAGE', { missingFields: ['TITLE', 'RAW_BODY', 'secret'] }),
  },
});
assert(publishCurationIncomplete.status === 422 && publishCurationIncomplete.body.code === 'CASE_CURATION_INCOMPLETE' && publishCurationIncomplete.body.message === '案例策展内容不完整', 'publish curation incomplete 422');
assert(JSON.stringify(publishCurationIncomplete.body.data) === JSON.stringify({ missingFields: ['TITLE'] }), 'publish curation incomplete sanitized');
assert(!JSON.stringify(publishCurationIncomplete.body).includes('RAW_BODY') && !JSON.stringify(publishCurationIncomplete.body).includes('secret'), 'publish curation incomplete privacy');

const publishInvalidDictionary = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', {
  method: 'POST',
  body: publishBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture()),
    'review_case_publish': businessFailure('INVALID_DICTIONARY'),
  },
});
assert(publishInvalidDictionary.status === 422 && publishInvalidDictionary.body.code === 'INVALID_DICTIONARY', 'publish INVALID_DICTIONARY 422');

// Publish: resolver failure short circuit
const publishResolverNotFound = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', {
  method: 'POST',
  body: publishBody,
  params: { caseNo: CASE_NO },
  handlers: { 'review_case_admin_detail': businessFailure('NOT_FOUND') },
});
assert(publishResolverNotFound.status === 404 && countRpc(publishResolverNotFound.calls, 'review_case_publish') === 0, 'publish resolver NOT_FOUND 404 no publish');

const publishResolverForbidden = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', {
  method: 'POST',
  body: publishBody,
  params: { caseNo: CASE_NO },
  handlers: { 'review_case_admin_detail': businessFailure('FORBIDDEN') },
});
assert(publishResolverForbidden.status === 403 && countRpc(publishResolverForbidden.calls, 'review_case_publish') === 0, 'publish resolver FORBIDDEN 403 no publish');

const publishResolverTransport = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', {
  method: 'POST',
  body: publishBody,
  params: { caseNo: CASE_NO },
  handlers: { 'review_case_admin_detail': transportFailure() },
});
assert(publishResolverTransport.status === 500 && countRpc(publishResolverTransport.calls, 'review_case_publish') === 0, 'publish resolver transport 500 no publish');

const publishResolverContract = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', {
  method: 'POST',
  body: publishBody,
  params: { caseNo: CASE_NO },
  handlers: { 'review_case_admin_detail': resolverContractFailure() },
});
assert(publishResolverContract.status === 500 && countRpc(publishResolverContract.calls, 'review_case_publish') === 0, 'publish resolver contract 500 no publish');

// Publish: write transport / contract
const publishTransport = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', {
  method: 'POST',
  body: publishBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture()),
    'review_case_publish': transportFailure(),
  },
});
assert(publishTransport.status === 500 && publishTransport.body.code === 'INTERNAL_ERROR' && !JSON.stringify(publishTransport.body).includes('SECRET SQL ERROR'), 'publish write transport 500 sanitized');

const publishContract = await run(publishPost, '/api/review-center/cases/' + CASE_NO + '/publish', {
  method: 'POST',
  body: publishBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture()),
    'review_case_publish': writeContractFailure(),
  },
});
assert(publishContract.status === 500 && publishContract.body.code === 'INTERNAL_ERROR', 'publish write contract mismatch 500');

// Hide: auth first
const hideUnauth = await run(hidePost, '/api/review-center/cases/' + CASE_NO + '/hide', { method: 'POST', body: hideBody, authMode: 'denied', params: { caseNo: CASE_NO } });
assert(hideUnauth.status === 401 && hideUnauth.calls.length === 0, 'hide unauth 401 no rpc');

const hideInvalidCaseNo = await run(hidePost, '/api/review-center/cases/bad/hide', { method: 'POST', body: hideBody, params: { caseNo: 'bad' } });
assert(hideInvalidCaseNo.status === 400 && hideInvalidCaseNo.calls.length === 0, 'hide invalid caseNo 400 no resolver');

// Hide: validation
const hideMalformed = await run(hidePost, '/api/review-center/cases/' + CASE_NO + '/hide', { method: 'POST', body: '{bad', params: { caseNo: CASE_NO } });
assert(hideMalformed.status === 400 && hideMalformed.calls.length === 0, 'hide malformed JSON 400 no resolver');

const hideInvalidVersion = await run(hidePost, '/api/review-center/cases/' + CASE_NO + '/hide', { method: 'POST', body: { expectedVersion: 0, reason: 'x' }, params: { caseNo: CASE_NO } });
assert(hideInvalidVersion.status === 400 && hideInvalidVersion.calls.length === 0, 'hide invalid version 400 no resolver');

const hideBlankReason = await run(hidePost, '/api/review-center/cases/' + CASE_NO + '/hide', { method: 'POST', body: { expectedVersion: 7, reason: '   ' }, params: { caseNo: CASE_NO } });
assert(hideBlankReason.status === 400 && hideBlankReason.calls.length === 0, 'hide blank reason 400 no resolver');

const hideLongReason = await run(hidePost, '/api/review-center/cases/' + CASE_NO + '/hide', { method: 'POST', body: { expectedVersion: 7, reason: 'x'.repeat(1001) }, params: { caseNo: CASE_NO } });
assert(hideLongReason.status === 400 && hideLongReason.calls.length === 0, 'hide reason >1000 400 no resolver');

const hideUnknownField = await run(hidePost, '/api/review-center/cases/' + CASE_NO + '/hide', { method: 'POST', body: { ...hideBody, note: 'x' }, params: { caseNo: CASE_NO } });
assert(hideUnknownField.status === 400 && hideUnknownField.calls.length === 0, 'hide unknown field 400 no resolver');

// Hide: success, version authority, reason privacy
const hideOk = await run(hidePost, '/api/review-center/cases/' + CASE_NO + '/hide', {
  method: 'POST',
  body: hideBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture({ version: 999 })),
    'review_case_hide': mutationSuccess(hiddenResult),
  },
});
assert(hideOk.status === 200, 'hide success 200');
assertDirectMutationBody(hideOk.body, 'hide');
assert(countRpc(hideOk.calls, 'review_case_admin_detail') === 1 && countRpc(hideOk.calls, 'review_case_hide') === 1, 'hide resolver1 write1');
assert(hideOk.calls[0].args.p_case_no === CASE_NO, 'hide resolver caseNo exact');
assert(hideOk.calls[1].args.p_case_id === UUID && hideOk.calls[1].args.p_expected_version === 7, 'hide mutation caseId and body version exact');
assert(hideOk.calls[1].args.p_reason === 'SECRET_REASON_9f3a hide due to issue', 'hide reason normalized exact');
assert(!JSON.stringify(hideOk.body).includes('SECRET_REASON_9f3a'), 'hide reason absent from success body');

// Hide: business errors
for (const code of ['VERSION_CONFLICT', 'INVALID_TRANSITION']) {
  const res = await run(hidePost, '/api/review-center/cases/' + CASE_NO + '/hide', {
    method: 'POST',
    body: hideBody,
    params: { caseNo: CASE_NO },
    handlers: {
      'review_case_admin_detail': readSuccess(adminDetailFixture()),
      'review_case_hide': businessFailure(code),
    },
  });
  assert(res.status === 409 && res.body.code === code, 'hide ' + code + ' 409');
  assert(countRpc(res.calls, 'review_case_hide') === 1, 'hide ' + code + ' write exactly once');
}

const hideForbidden = await run(hidePost, '/api/review-center/cases/' + CASE_NO + '/hide', {
  method: 'POST',
  body: hideBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture()),
    'review_case_hide': businessFailure('FORBIDDEN'),
  },
});
assert(hideForbidden.status === 403 && hideForbidden.body.code === 'FORBIDDEN' && !JSON.stringify(hideForbidden.body).includes('SENSITIVE_DB_MESSAGE'), 'hide FORBIDDEN 403');

const hideNotFound = await run(hidePost, '/api/review-center/cases/' + CASE_NO + '/hide', {
  method: 'POST',
  body: hideBody,
  params: { caseNo: CASE_NO },
  handlers: { 'review_case_admin_detail': businessFailure('NOT_FOUND') },
});
assert(hideNotFound.status === 404 && countRpc(hideNotFound.calls, 'review_case_hide') === 0, 'hide resolver NOT_FOUND 404 no hide');

const hideResolverTransport = await run(hidePost, '/api/review-center/cases/' + CASE_NO + '/hide', {
  method: 'POST',
  body: hideBody,
  params: { caseNo: CASE_NO },
  handlers: { 'review_case_admin_detail': transportFailure() },
});
assert(hideResolverTransport.status === 500 && countRpc(hideResolverTransport.calls, 'review_case_hide') === 0, 'hide resolver transport 500 no hide');

const hideTransport = await run(hidePost, '/api/review-center/cases/' + CASE_NO + '/hide', {
  method: 'POST',
  body: hideBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture()),
    'review_case_hide': transportFailure(),
  },
});
assert(hideTransport.status === 500 && hideTransport.body.code === 'INTERNAL_ERROR', 'hide write transport 500');
assert(!JSON.stringify(hideTransport.body).includes('SECRET_REASON_9f3a') && !JSON.stringify(hideTransport.body).includes('SECRET SQL ERROR'), 'hide transport reason and db message privacy');

const hideContract = await run(hidePost, '/api/review-center/cases/' + CASE_NO + '/hide', {
  method: 'POST',
  body: hideBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture()),
    'review_case_hide': writeContractFailure(),
  },
});
assert(hideContract.status === 500 && hideContract.body.code === 'INTERNAL_ERROR', 'hide write contract mismatch 500');

// Reopen: auth first
const reopenUnauth = await run(reopenPost, '/api/review-center/cases/' + CASE_NO + '/reopen', { method: 'POST', body: reopenBody, authMode: 'denied', params: { caseNo: CASE_NO } });
assert(reopenUnauth.status === 401 && reopenUnauth.calls.length === 0, 'reopen unauth 401 no rpc');

const reopenInvalidCaseNo = await run(reopenPost, '/api/review-center/cases/bad/reopen', { method: 'POST', body: reopenBody, params: { caseNo: 'bad' } });
assert(reopenInvalidCaseNo.status === 400 && reopenInvalidCaseNo.calls.length === 0, 'reopen invalid caseNo 400 no resolver');

// Reopen: validation
const reopenMalformed = await run(reopenPost, '/api/review-center/cases/' + CASE_NO + '/reopen', { method: 'POST', body: '{bad', params: { caseNo: CASE_NO } });
assert(reopenMalformed.status === 400 && reopenMalformed.calls.length === 0, 'reopen malformed JSON 400 no resolver');

const reopenInvalidVersion = await run(reopenPost, '/api/review-center/cases/' + CASE_NO + '/reopen', { method: 'POST', body: { expectedVersion: 0 }, params: { caseNo: CASE_NO } });
assert(reopenInvalidVersion.status === 400 && reopenInvalidVersion.calls.length === 0, 'reopen invalid expectedVersion 400 no resolver');

const reopenUnknownField = await run(reopenPost, '/api/review-center/cases/' + CASE_NO + '/reopen', { method: 'POST', body: { ...reopenBody, reason: 'x' }, params: { caseNo: CASE_NO } });
assert(reopenUnknownField.status === 400 && reopenUnknownField.calls.length === 0, 'reopen unknown field 400 no resolver');

// Reopen: success and version authority
const reopenOk = await run(reopenPost, '/api/review-center/cases/' + CASE_NO + '/reopen', {
  method: 'POST',
  body: reopenBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture({ version: 999 })),
    'review_case_reopen_curation': mutationSuccess(draftResult),
  },
});
assert(reopenOk.status === 200, 'reopen success 200');
assertDirectMutationBody(reopenOk.body, 'reopen');
assert(countRpc(reopenOk.calls, 'review_case_admin_detail') === 1 && countRpc(reopenOk.calls, 'review_case_reopen_curation') === 1, 'reopen resolver1 write1');
assert(reopenOk.calls[0].args.p_case_no === CASE_NO, 'reopen resolver caseNo exact');
const reopenRpcVersion = reopenOk.calls[1].args.p_expected_version;
assert(reopenOk.calls[1].args.p_case_id === UUID && reopenRpcVersion === 7, 'reopen mutation caseId and body version authority');
assert(reopenRpcVersion !== 999, 'reopen resolver version 999 not used');

// Reopen: business errors
for (const code of ['VERSION_CONFLICT', 'INVALID_TRANSITION']) {
  const res = await run(reopenPost, '/api/review-center/cases/' + CASE_NO + '/reopen', {
    method: 'POST',
    body: reopenBody,
    params: { caseNo: CASE_NO },
    handlers: {
      'review_case_admin_detail': readSuccess(adminDetailFixture()),
      'review_case_reopen_curation': businessFailure(code),
    },
  });
  assert(res.status === 409 && res.body.code === code, 'reopen ' + code + ' 409');
  assert(countRpc(res.calls, 'review_case_reopen_curation') === 1, 'reopen ' + code + ' write exactly once');
}

const reopenForbidden = await run(reopenPost, '/api/review-center/cases/' + CASE_NO + '/reopen', {
  method: 'POST',
  body: reopenBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture()),
    'review_case_reopen_curation': businessFailure('FORBIDDEN'),
  },
});
assert(reopenForbidden.status === 403 && reopenForbidden.body.code === 'FORBIDDEN', 'reopen FORBIDDEN 403');

const reopenNotFound = await run(reopenPost, '/api/review-center/cases/' + CASE_NO + '/reopen', {
  method: 'POST',
  body: reopenBody,
  params: { caseNo: CASE_NO },
  handlers: { 'review_case_admin_detail': businessFailure('NOT_FOUND') },
});
assert(reopenNotFound.status === 404 && countRpc(reopenNotFound.calls, 'review_case_reopen_curation') === 0, 'reopen resolver NOT_FOUND 404 no write');

const reopenResolverTransport = await run(reopenPost, '/api/review-center/cases/' + CASE_NO + '/reopen', {
  method: 'POST',
  body: reopenBody,
  params: { caseNo: CASE_NO },
  handlers: { 'review_case_admin_detail': transportFailure() },
});
assert(reopenResolverTransport.status === 500 && countRpc(reopenResolverTransport.calls, 'review_case_reopen_curation') === 0, 'reopen resolver transport 500 no write');

const reopenTransport = await run(reopenPost, '/api/review-center/cases/' + CASE_NO + '/reopen', {
  method: 'POST',
  body: reopenBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture()),
    'review_case_reopen_curation': transportFailure(),
  },
});
assert(reopenTransport.status === 500 && reopenTransport.body.code === 'INTERNAL_ERROR' && !JSON.stringify(reopenTransport.body).includes('SECRET SQL ERROR'), 'reopen write transport 500 sanitized');

const reopenContract = await run(reopenPost, '/api/review-center/cases/' + CASE_NO + '/reopen', {
  method: 'POST',
  body: reopenBody,
  params: { caseNo: CASE_NO },
  handlers: {
    'review_case_admin_detail': readSuccess(adminDetailFixture()),
    'review_case_reopen_curation': writeContractFailure(),
  },
});
assert(reopenContract.status === 500 && reopenContract.body.code === 'INTERNAL_ERROR', 'reopen write contract mismatch 500');

// Existing GET regression after adding mutation methods
const libraryData = { items: [], limit: 30, offset: 0, hasMore: false };
const casesGetOk = await run(casesGet, '/api/review-center/cases', {
  handlers: { 'review_case_library': readSuccess(libraryData) },
});
assert(casesGetOk.status === 200 && casesGetOk.body.ok === true && JSON.stringify(casesGetOk.body.data) === JSON.stringify(libraryData), 'existing cases GET regression 200');

const publicDetail = {
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
const detailGetOk = await run(detailGet, '/api/review-center/cases/' + CASE_NO, {
  params: { caseNo: CASE_NO },
  handlers: { 'review_case_detail': readSuccess(publicDetail) },
});
assert(detailGetOk.status === 200 && detailGetOk.body.ok === true && detailGetOk.body.data.caseNo === CASE_NO, 'existing case detail GET regression 200');

// Static guards
const mutationRouteFiles = [
  'src/app/api/review-center/cases/route.ts',
  'src/app/api/review-center/cases/[caseNo]/route.ts',
  'src/app/api/review-center/cases/[caseNo]/publish/route.ts',
  'src/app/api/review-center/cases/[caseNo]/hide/route.ts',
  'src/app/api/review-center/cases/[caseNo]/reopen/route.ts',
];
let serviceRoleOk = true;
let tableAccessOk = true;
let directRpcOk = true;
let roleDupOk = true;
let unsafeCastOk = true;
for (const file of mutationRouteFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const token of ['@/lib/supabase/admin', 'SUPABASE_SERVICE_ROLE_KEY', 'serviceRole', 'createAdminClient']) {
    if (source.includes(token)) serviceRoleOk = false;
  }
  if (source.includes('.from(')) tableAccessOk = false;
  if (source.includes('.rpc(')) directRpcOk = false;
  if (source.includes("role ===") || source.includes("['admin','manager']") || source.includes('is_active') || source.includes('org_id ===')) roleDupOk = false;
  for (const token of ['as any', 'as unknown as CaseRpcClient', '@ts-ignore', '@ts-expect-error']) {
    if (source.includes(token)) unsafeCastOk = false;
  }
}
assert(serviceRoleOk, 'mutation production no service role');
assert(tableAccessOk, 'mutation production no base table access');
assert(directRpcOk, 'mutation route files no direct rpc');
assert(roleDupOk, 'mutation production no role authorization duplication');
assert(unsafeCastOk, 'mutation production no unsafe client cast');

const casesRouteSource = fs.readFileSync(mutationRouteFiles[0], 'utf8');
const caseDetailRouteSource = fs.readFileSync(mutationRouteFiles[1], 'utf8');
assert(casesRouteSource.includes('export async function POST'), 'cases route POST method');
assert(caseDetailRouteSource.includes('export async function PATCH'), 'case detail route PATCH method');
assert(!casesRouteSource.includes('export async function PUT') && !casesRouteSource.includes('export async function DELETE'), 'cases route no PUT/DELETE');
assert(!caseDetailRouteSource.includes('export async function PUT') && !caseDetailRouteSource.includes('export async function DELETE'), 'case detail route no PUT/DELETE');

let forceDynamicOk = true;
for (const file of mutationRouteFiles.slice(2)) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes("export const dynamic = 'force-dynamic'")) forceDynamicOk = false;
  if (!source.includes('export async function POST')) forceDynamicOk = false;
  if (source.includes('export async function GET') || source.includes('export async function PUT') || source.includes('export async function DELETE')) forceDynamicOk = false;
}
assert(forceDynamicOk, 'new mutation routes force-dynamic POST only');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
