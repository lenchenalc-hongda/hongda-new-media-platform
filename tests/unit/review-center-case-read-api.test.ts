import fs from 'node:fs';
import { register } from 'node:module';
import { NextRequest } from 'next/server';
import { AuthSessionMissingError } from '@supabase/supabase-js';

const loader = `
export async function load(url, context, nextLoad) {
  if (url.endsWith('/src/lib/supabase/server.ts')) {
    return {
      format: 'module',
      source: 'export async function createClient() { return globalThis.__caseReadFakeSupabase || null; }',
      shortCircuit: true,
    };
  }
  if (url.endsWith('/src/lib/auth/current-user.ts')) {
    return {
      format: 'module',
      source: \`
        import { AuthError } from './types';
        export async function requireUserFromRequest(req) {
          const mode = globalThis.__caseReadAuthMode || 'ok';
          if (mode === 'ok') {
            return { id: 'u_admin', name: 'Admin', role: 'admin', department: null, email: null, active: true, authSource: 'mock' };
          }
          if (mode === 'denied') {
            throw new AuthError('UNAUTHENTICATED', '未登录');
          }
          if (mode === 'unknown') {
            throw new Error('database unavailable');
          }
          if (mode === 'config-missing') {
            throw new AuthError('AUTH_CONFIG_MISSING', 'Supabase 配置缺失');
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

const { GET: casesGet } = await import('../../src/app/api/review-center/cases/route');
const { GET: detailGet } = await import('../../src/app/api/review-center/cases/[caseNo]/route');
const { GET: candidatesGet } = await import('../../src/app/api/review-center/case-candidates/route');
const { GET: adminGet } = await import('../../src/app/api/review-center/cases/[caseNo]/admin/route');
const { GET: auditGet } = await import('../../src/app/api/review-center/cases/[caseNo]/audit/route');

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

const UUID = '00000000-0000-0000-0000-000000000001';
const CASE_NO = 'CASE-2026-000001';

const libraryData = { items: [], limit: 30, offset: 0, hasMore: false };
const candidateData = { items: [], limit: 30, offset: 0, hasMore: false };
const auditData = { items: [], limit: 30, offset: 0, hasMore: false };

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

const adminDetail = {
  id: UUID,
  caseNo: CASE_NO,
  status: 'PUBLISHED',
  version: 3,
  title: 'case title',
  summary: null,
  lessonSummary: null,
  preventionSummary: null,
  applicabilityNotes: null,
  reviewTypeSnapshot: 'A',
  riskSnapshot: null,
  occurredAtSnapshot: null,
  publishedAt: '2026-08-27T00:00:00Z',
  hiddenAt: null,
  hiddenReason: null,
  sourceReviewId: UUID,
  sourceReviewNo: 'REV-2026-000001',
  sourceCurrentStatus: 'closed',
  sourceCurrentVersion: 2,
  caseSourceReviewVersion: 1,
  sourceChangedSinceSnapshot: true,
  isStale: true,
  staleReasons: ['SOURCE_VERSION_CHANGED'],
  currentSourceMetadata: [],
  caseSnapshotMetadata: {
    materials: [],
    processes: [],
    problemDomains: [],
    problemSymptoms: [],
  },
};

function successRpc(result: unknown) {
  return () => ({ data: { ok: true, data: result }, error: null });
}

function businessRpc(code: string, message = 'SENSITIVE_DB_MESSAGE') {
  return () => ({ data: { ok: false, code, message, data: null }, error: null });
}

function transportRpc() {
  return () => ({
    data: null,
    error: { code: 'PGRST301', message: 'RAW SQLSTATE SECRET_CONSTRAINT https://secret.example' },
  });
}

function contractRpc() {
  return () => ({ data: { ok: true, data: { items: [], limit: 30, offset: 0, hasMore: 'bad' } }, error: null });
}

function makeClient(
  rpc?: (name: string, args: Record<string, unknown>) => any,
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
      return rpc ? rpc(name, args) : { data: null, error: null };
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
    authMode?: string;
    rpc?: (name: string, args: Record<string, unknown>) => any;
    params?: Record<string, string>;
    getUserResult?: any;
  } = {},
) {
  const holder = makeClient(options.rpc, options.getUserResult);
  (globalThis as any).__caseReadFakeSupabase = holder.client;
  (globalThis as any).__caseReadAuthMode = options.authMode ?? 'ok';
  const req = new NextRequest('http://localhost' + path);
  const response = await handler(req, options.params ? { params: options.params } : undefined);
  const body = await response.json();
  return { status: response.status, body, calls: holder.calls, getUserCalls: holder.getUserCalls };
}

const internal500 = {
  status: 500,
  body: { ok: false, code: 'INTERNAL_ERROR', message: '服务异常', data: null },
};

console.log('\n=== Case Read API Slice 2 ===');

// Library route
const libUnauth = await run(casesGet, '/api/review-center/cases', { authMode: 'denied' });
assert(libUnauth.status === 401 && JSON.stringify(libUnauth.body) === JSON.stringify({ error: '未登录或无权限' }), 'library unauth 401');
assert(libUnauth.calls.length === 0, 'library unauth no rpc');

const libUnauthInvalid = await run(casesGet, '/api/review-center/cases?limit=0', { authMode: 'denied' });
assert(libUnauthInvalid.status === 401 && libUnauthInvalid.calls.length === 0, 'library unauth + invalid query 401 no rpc');

const libDefault = await run(casesGet, '/api/review-center/cases', { rpc: successRpc(libraryData) });
assert(libDefault.status === 200 && libDefault.body.ok === true && JSON.stringify(libDefault.body.data) === JSON.stringify(libraryData), 'library default 200');
assert(libDefault.calls.length === 1 && libDefault.calls[0].name === 'review_case_library', 'library rpc name');
assert(libDefault.calls[0].args.p_limit === 30 && libDefault.calls[0].args.p_offset === 0 && libDefault.calls[0].args.p_query === null, 'library default args');
assert(libDefault.getUserCalls.length === 0, 'library success no secondary getUser');

const libPercent = await run(casesGet, '/api/review-center/cases?q=%25', { rpc: successRpc(libraryData) });
assert(libPercent.calls[0].args.p_query === '%', 'library q percent preserved');
const libUnderscore = await run(casesGet, '/api/review-center/cases?q=_', { rpc: successRpc(libraryData) });
assert(libUnderscore.calls[0].args.p_query === '_', 'library q underscore preserved');

const libRepeated = await run(casesGet, '/api/review-center/cases?material=PP&material=ABS', { rpc: successRpc(libraryData) });
assert(JSON.stringify(libRepeated.calls[0].args.p_material_codes) === JSON.stringify(['PP', 'ABS']), 'library repeated materials');

const lib51 = await run(casesGet, '/api/review-center/cases?' + Array.from({ length: 51 }, () => 'material=PP').join('&'), { rpc: successRpc(libraryData) });
assert(lib51.status === 400 && lib51.calls.length === 0, 'library 51 filters 400 no rpc');

const libEnum = await run(casesGet, '/api/review-center/cases?reviewType=Z', { rpc: successRpc(libraryData) });
assert(libEnum.status === 400 && libEnum.calls.length === 0, 'library invalid enum 400');

const libPage = await run(casesGet, '/api/review-center/cases?limit=101', { rpc: successRpc(libraryData) });
assert(libPage.status === 400 && libPage.calls.length === 0, 'library invalid pagination 400');

const libDup = await run(casesGet, '/api/review-center/cases?limit=1&limit=2', { rpc: successRpc(libraryData) });
assert(libDup.status === 400 && libDup.calls.length === 0, 'library duplicate scalar 400');

const libForbidden = await run(casesGet, '/api/review-center/cases', { rpc: businessRpc('FORBIDDEN') });
assert(libForbidden.status === 403 && libForbidden.body.code === 'FORBIDDEN' && !JSON.stringify(libForbidden.body).includes('SENSITIVE_DB_MESSAGE'), 'library FORBIDDEN 403 local message');
assert(libForbidden.calls.length === 1, 'library business error no retry');

const libInvalidCase = await run(casesGet, '/api/review-center/cases', { rpc: businessRpc('INVALID_CASE') });
assert(libInvalidCase.status === 400 && libInvalidCase.body.code === 'INVALID_CASE', 'library INVALID_CASE 400');

const libTransport = await run(casesGet, '/api/review-center/cases', { rpc: transportRpc() });
assert(libTransport.status === 500 && JSON.stringify(libTransport.body) === JSON.stringify(internal500.body), 'library transport 500 exact');
assert(!JSON.stringify(libTransport.body).includes('RAW SQLSTATE') && !JSON.stringify(libTransport.body).includes('secret.example'), 'library transport privacy');

const libContract = await run(casesGet, '/api/review-center/cases', { rpc: contractRpc() });
assert(libContract.status === 500 && libContract.body.code === 'INTERNAL_ERROR', 'library contract mismatch 500');

// Public detail route
const detUnauth = await run(detailGet, '/api/review-center/cases/' + CASE_NO, { authMode: 'denied', params: { caseNo: CASE_NO } });
assert(detUnauth.status === 401 && detUnauth.calls.length === 0, 'detail unauth 401');

const detOk = await run(detailGet, '/api/review-center/cases/' + CASE_NO, { params: { caseNo: CASE_NO }, rpc: successRpc(publicDetail) });
assert(detOk.status === 200 && detOk.body.ok === true && detOk.body.data.caseNo === CASE_NO, 'detail valid 200');
assert(detOk.calls.length === 1 && detOk.calls[0].name === 'review_case_detail', 'detail only public rpc');
assert(!detOk.calls.some(c => c.name === 'review_case_admin_detail'), 'detail no admin fallback');

for (const bad of ['case-2026-000001', ' CASE-2026-000001 ']) {
  const res = await run(detailGet, '/api/review-center/cases/' + encodeURIComponent(bad), { params: { caseNo: bad }, rpc: successRpc(publicDetail) });
  assert(res.status === 400 && res.calls.length === 0, 'detail invalid caseNo 400');
}

const detNotFound = await run(detailGet, '/api/review-center/cases/' + CASE_NO, { params: { caseNo: CASE_NO }, rpc: businessRpc('NOT_FOUND') });
assert(detNotFound.status === 404 && !JSON.stringify(detNotFound.body).includes('SENSITIVE_DB_MESSAGE'), 'detail NOT_FOUND 404');

const detForbidden = await run(detailGet, '/api/review-center/cases/' + CASE_NO, { params: { caseNo: CASE_NO }, rpc: businessRpc('FORBIDDEN') });
assert(detForbidden.status === 403, 'detail FORBIDDEN 403');

const detTransport = await run(detailGet, '/api/review-center/cases/' + CASE_NO, { params: { caseNo: CASE_NO }, rpc: transportRpc() });
assert(detTransport.status === 500 && detTransport.body.code === 'INTERNAL_ERROR', 'detail transport 500');

const detContract = await run(detailGet, '/api/review-center/cases/' + CASE_NO, { params: { caseNo: CASE_NO }, rpc: contractRpc() });
assert(detContract.status === 500 && detContract.body.code === 'INTERNAL_ERROR', 'detail contract mismatch 500');

// Candidate route
const candUnauth = await run(candidatesGet, '/api/review-center/case-candidates', { authMode: 'denied' });
assert(candUnauth.status === 401 && candUnauth.calls.length === 0, 'candidate unauth 401');

const candOk = await run(candidatesGet, '/api/review-center/case-candidates', { rpc: successRpc(candidateData) });
assert(candOk.status === 200 && candOk.body.ok === true && candOk.calls.length === 1 && candOk.calls[0].name === 'review_case_candidates', 'candidate default 200');

const candQ = await run(candidatesGet, '/api/review-center/case-candidates?q=REV-2026-000001', { rpc: successRpc(candidateData) });
assert(candQ.calls[0].args.p_query === 'REV-2026-000001', 'candidate q mapping');

const candLong = await run(candidatesGet, '/api/review-center/case-candidates?q=' + 'x'.repeat(201), { rpc: successRpc(candidateData) });
assert(candLong.status === 400 && candLong.calls.length === 0, 'candidate q >200 400');
const candEmptyLimit = await run(candidatesGet, '/api/review-center/case-candidates?limit=', { rpc: successRpc(candidateData) });
assert(candEmptyLimit.status === 400 && candEmptyLimit.calls.length === 0, 'candidate empty limit 400');
const candBigLimit = await run(candidatesGet, '/api/review-center/case-candidates?limit=101', { rpc: successRpc(candidateData) });
assert(candBigLimit.status === 400, 'candidate limit >100 400');
const candBigOffset = await run(candidatesGet, '/api/review-center/case-candidates?offset=100001', { rpc: successRpc(candidateData) });
assert(candBigOffset.status === 400, 'candidate offset >100000 400');
const candDup = await run(candidatesGet, '/api/review-center/case-candidates?offset=1&offset=2', { rpc: successRpc(candidateData) });
assert(candDup.status === 400 && candDup.calls.length === 0, 'candidate duplicate scalar 400');
const candForbidden = await run(candidatesGet, '/api/review-center/case-candidates', { rpc: businessRpc('FORBIDDEN') });
assert(candForbidden.status === 403, 'candidate FORBIDDEN 403');
const candTransport = await run(candidatesGet, '/api/review-center/case-candidates', { rpc: transportRpc() });
assert(candTransport.status === 500, 'candidate transport 500');
const candContract = await run(candidatesGet, '/api/review-center/case-candidates', { rpc: contractRpc() });
assert(candContract.status === 500, 'candidate contract mismatch 500');

// Admin detail route
const admUnauth = await run(adminGet, '/api/review-center/cases/' + CASE_NO + '/admin', { authMode: 'denied', params: { caseNo: CASE_NO } });
assert(admUnauth.status === 401 && admUnauth.calls.length === 0, 'admin unauth 401');

const admOk = await run(adminGet, '/api/review-center/cases/' + CASE_NO + '/admin', { params: { caseNo: CASE_NO }, rpc: successRpc(adminDetail) });
assert(admOk.status === 200 && admOk.body.data.sourceCurrentVersion === 2 && admOk.body.data.version === 3 && JSON.stringify(admOk.body.data.staleReasons) === '["SOURCE_VERSION_CHANGED"]', 'admin concurrency fields preserved');
assert(admOk.calls.length === 1 && admOk.calls[0].name === 'review_case_admin_detail', 'admin rpc once');

const admInvalid = await run(adminGet, '/api/review-center/cases/bad/admin', { params: { caseNo: 'bad' }, rpc: successRpc(adminDetail) });
assert(admInvalid.status === 400 && admInvalid.calls.length === 0, 'admin invalid caseNo 400');
const admForbidden = await run(adminGet, '/api/review-center/cases/' + CASE_NO + '/admin', { params: { caseNo: CASE_NO }, rpc: businessRpc('FORBIDDEN') });
assert(admForbidden.status === 403, 'admin FORBIDDEN 403');
const admNotFound = await run(adminGet, '/api/review-center/cases/' + CASE_NO + '/admin', { params: { caseNo: CASE_NO }, rpc: businessRpc('NOT_FOUND') });
assert(admNotFound.status === 404, 'admin NOT_FOUND 404');
const admTransport = await run(adminGet, '/api/review-center/cases/' + CASE_NO + '/admin', { params: { caseNo: CASE_NO }, rpc: transportRpc() });
assert(admTransport.status === 500, 'admin transport 500');
const admContract = await run(adminGet, '/api/review-center/cases/' + CASE_NO + '/admin', { params: { caseNo: CASE_NO }, rpc: contractRpc() });
assert(admContract.status === 500, 'admin contract mismatch 500');

// Audit route
const auditUnauth = await run(auditGet, '/api/review-center/cases/' + CASE_NO + '/audit', { authMode: 'denied', params: { caseNo: CASE_NO } });
assert(auditUnauth.status === 401 && auditUnauth.calls.length === 0, 'audit unauth 401 no rpc');

const auditBadNo = await run(auditGet, '/api/review-center/cases/bad/audit', { params: { caseNo: 'bad' }, rpc: () => auditData });
assert(auditBadNo.status === 400 && auditBadNo.calls.length === 0, 'audit invalid caseNo 400 no rpc');

const auditBadPage = await run(auditGet, '/api/review-center/cases/' + CASE_NO + '/audit?limit=0', { params: { caseNo: CASE_NO }, rpc: () => auditData });
assert(auditBadPage.status === 400 && auditBadPage.calls.length === 0, 'audit invalid pagination 400 no rpc');

function auditRpc(adminResult: any, auditResult: any) {
  return (name: string) => {
    if (name === 'review_case_admin_detail') return adminResult;
    if (name === 'review_case_audit') return auditResult;
    return { data: null, error: null };
  };
}

const auditNotFound = await run(auditGet, '/api/review-center/cases/' + CASE_NO + '/audit', {
  params: { caseNo: CASE_NO },
  rpc: auditRpc(businessRpc('NOT_FOUND')(), { data: { ok: true, data: auditData }, error: null }),
});
assert(auditNotFound.status === 404 && !auditNotFound.calls.some(c => c.name === 'review_case_audit'), 'audit resolver NOT_FOUND 404 no audit rpc');

const auditForbidden = await run(auditGet, '/api/review-center/cases/' + CASE_NO + '/audit', {
  params: { caseNo: CASE_NO },
  rpc: auditRpc(businessRpc('FORBIDDEN')(), { data: { ok: true, data: auditData }, error: null }),
});
assert(auditForbidden.status === 403 && !auditForbidden.calls.some(c => c.name === 'review_case_audit'), 'audit resolver FORBIDDEN 403 no audit rpc');

const auditInvalidCase = await run(auditGet, '/api/review-center/cases/' + CASE_NO + '/audit', {
  params: { caseNo: CASE_NO },
  rpc: auditRpc(businessRpc('INVALID_CASE')(), { data: { ok: true, data: auditData }, error: null }),
});
assert(auditInvalidCase.status === 400 && !auditInvalidCase.calls.some(c => c.name === 'review_case_audit'), 'audit resolver INVALID_CASE 400 no audit rpc');

const auditResolverTransport = await run(auditGet, '/api/review-center/cases/' + CASE_NO + '/audit', {
  params: { caseNo: CASE_NO },
  rpc: auditRpc(transportRpc(), { data: { ok: true, data: auditData }, error: null }),
});
assert(auditResolverTransport.status === 500 && !auditResolverTransport.calls.some(c => c.name === 'review_case_audit'), 'audit resolver transport 500 no audit rpc');

const auditResolverContract = await run(auditGet, '/api/review-center/cases/' + CASE_NO + '/audit', {
  params: { caseNo: CASE_NO },
  rpc: auditRpc(contractRpc(), { data: { ok: true, data: auditData }, error: null }),
});
assert(auditResolverContract.status === 500 && !auditResolverContract.calls.some(c => c.name === 'review_case_audit'), 'audit resolver contract mismatch 500 no audit rpc');

const auditOk = await run(auditGet, '/api/review-center/cases/' + CASE_NO + '/audit', {
  params: { caseNo: CASE_NO },
  rpc: auditRpc({ data: { ok: true, data: adminDetail }, error: null }, { data: { ok: true, data: auditData }, error: null }),
});
assert(auditOk.status === 200 && auditOk.body.ok === true, 'audit success 200');
assert(auditOk.calls.length === 2 && auditOk.calls[0].name === 'review_case_admin_detail' && auditOk.calls[1].name === 'review_case_audit', 'audit resolver + audit rpc');
assert(auditOk.calls[1].args.p_case_id === UUID && auditOk.calls[1].args.p_limit === 30 && auditOk.calls[1].args.p_offset === 0, 'audit rpc args');

const auditBusiness = await run(auditGet, '/api/review-center/cases/' + CASE_NO + '/audit', {
  params: { caseNo: CASE_NO },
  rpc: auditRpc({ data: { ok: true, data: adminDetail }, error: null }, businessRpc('FORBIDDEN')()),
});
assert(auditBusiness.status === 403 && !JSON.stringify(auditBusiness.body).includes('SENSITIVE_DB_MESSAGE'), 'audit business FORBIDDEN 403');

const auditTransport = await run(auditGet, '/api/review-center/cases/' + CASE_NO + '/audit', {
  params: { caseNo: CASE_NO },
  rpc: auditRpc({ data: { ok: true, data: adminDetail }, error: null }, transportRpc()),
});
assert(auditTransport.status === 500, 'audit transport 500');

const auditContract = await run(auditGet, '/api/review-center/cases/' + CASE_NO + '/audit', {
  params: { caseNo: CASE_NO },
  rpc: auditRpc({ data: { ok: true, data: adminDetail }, error: null }, contractRpc()),
});
assert(auditContract.status === 500, 'audit contract mismatch 500');

// Auth edge cases
const inactive = await run(casesGet, '/api/review-center/cases', {
  authMode: 'denied',
  getUserResult: { data: { user: { id: 'u_inactive' } }, error: null },
  rpc: successRpc(libraryData),
});
assert(inactive.status === 403 && inactive.body.code === 'FORBIDDEN' && inactive.body.message === '没有权限执行该操作' && inactive.calls.length === 0, 'inactive actor 403 no rpc');
assert(inactive.getUserCalls.length === 1, 'inactive uses secondary getUser');

const noSession = await run(casesGet, '/api/review-center/cases', {
  authMode: 'denied',
  getUserResult: { data: { user: null }, error: null },
  rpc: successRpc(libraryData),
});
assert(noSession.status === 401 && noSession.calls.length === 0, 'no session 401 no rpc');

const realSessionMissing = await run(casesGet, '/api/review-center/cases', {
  authMode: 'denied',
  getUserResult: { data: { user: null }, error: new AuthSessionMissingError() },
  rpc: successRpc(libraryData),
});
assert(realSessionMissing.status === 401 && realSessionMissing.body.error === '未登录或无权限' && realSessionMissing.calls.length === 0, 'real AuthSessionMissingError 401 no rpc');
assert(realSessionMissing.getUserCalls.length === 1, 'real session missing secondary lookup once');

const unknownAuth = await run(casesGet, '/api/review-center/cases', {
  authMode: 'unknown',
  rpc: successRpc(libraryData),
});
assert(unknownAuth.status === 500 && unknownAuth.body.code === 'INTERNAL_ERROR' && unknownAuth.status !== 403 && unknownAuth.calls.length === 0, 'unknown auth failure 500 not 403');

const configMissing = await run(casesGet, '/api/review-center/cases', {
  authMode: 'config-missing',
  rpc: successRpc(libraryData),
});
assert(configMissing.status === 500 && configMissing.body.code === 'INTERNAL_ERROR' && configMissing.calls.length === 0 && configMissing.getUserCalls.length === 0, 'AUTH_CONFIG_MISSING 500 no secondary lookup');

const getUserFailure = await run(casesGet, '/api/review-center/cases', {
  authMode: 'denied',
  getUserResult: { data: null, error: { message: 'auth transport raw' } },
  rpc: successRpc(libraryData),
});
assert(getUserFailure.status === 500 && getUserFailure.body.code === 'INTERNAL_ERROR' && getUserFailure.status !== 401 && getUserFailure.status !== 403 && getUserFailure.calls.length === 0, 'auth.getUser failure 500');
assert(!JSON.stringify(getUserFailure.body).includes('auth transport raw'), 'auth.getUser error not leaked');

// Static guards
const productionReadFiles = [
  'src/lib/review-center/case-route-auth.ts',
  'src/lib/review-center/case-route-errors.ts',
  'src/app/api/review-center/cases/route.ts',
  'src/app/api/review-center/cases/[caseNo]/route.ts',
  'src/app/api/review-center/case-candidates/route.ts',
  'src/app/api/review-center/cases/[caseNo]/admin/route.ts',
  'src/app/api/review-center/cases/[caseNo]/audit/route.ts',
];
let serviceRoleOk = true;
let tableAccessOk = true;
let directRpcOk = true;
let roleDupOk = true;
for (const file of productionReadFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const token of ['@/lib/supabase/admin', 'SUPABASE_SERVICE_ROLE_KEY', 'serviceRole', 'createAdminClient']) {
    if (source.includes(token)) serviceRoleOk = false;
  }
  if (source.includes('.from(')) tableAccessOk = false;
  if (source.includes('.rpc(')) directRpcOk = false;
  if (source.includes("role ===") || source.includes("['admin','manager']") || source.includes('is_active') || source.includes('org_id ===')) roleDupOk = false;
}
assert(serviceRoleOk, 'read production no service role');
assert(tableAccessOk, 'read production no base table access');
assert(directRpcOk, 'route files no direct rpc');
assert(roleDupOk, 'read production no role authorization duplication');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
