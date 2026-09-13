// ===== Review Center Management Audit Read API Route Tests =====
import { register } from 'node:module';
import { NextRequest } from 'next/server';

const loader = `
export async function load(url, context, nextLoad) {
  if (url.endsWith('/src/lib/supabase/server.ts')) {
    return {
      format: 'module',
      source: 'export async function createClient() { return globalThis.__reviewCenterFakeSupabaseClient || null; }',
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
`;
await register('data:text/javascript,' + encodeURIComponent(loader), import.meta.url);

process.env.AUTH_MODE = 'mock';

const { GET } = await import('../../src/app/api/review-center/reviews/[id]/audit-logs/route');

const REVIEW_ID = '00000000-0000-0000-0000-000000000001';
const ORG_ID = '00000000-0000-0000-0000-000000000002';
const PROFILE_ID = '00000000-0000-0000-0000-000000000006';

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

function request(query = '', authenticated = true): NextRequest {
  const url = 'http://localhost/api/review-center/reviews/' + REVIEW_ID + (query ? '?' + query : '');
  return new NextRequest(url, {
    headers: authenticated ? {
      cookie: 'nmc_user=' + encodeURIComponent(JSON.stringify({
        id: 'u_admin',
        full_name: '管理员',
        email: 'admin@hongda.com',
        role: 'admin',
        org_id: 'org_001',
        department: '管理部',
      })),
    } : {},
  });
}

function makeClient(options: {
  authUser: any;
  profile: any;
  review: any;
  audit: any;
  rpcResult: any;
}) {
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const fromCalls: string[] = [];
  const eqCalls: Array<{ table: string; column: string; value: any }> = [];
  const orderCalls: Array<{ column: string; options: any }> = [];
  const rangeCalls: Array<{ start: number; end: number }> = [];
  const client: any = {
    from: (table: string) => {
      fromCalls.push(table);
      const filters: Array<{ column: string; value: any }> = [];
      const builder: any = {
        select: () => builder,
        eq: (column: string, value: any) => {
          filters.push({ column, value });
          eqCalls.push({ table, column, value });
          return builder;
        },
        order: (column: string, orderOptions: any) => {
          orderCalls.push({ column, options: orderOptions });
          return builder;
        },
        range: (start: number, end: number) => {
          rangeCalls.push({ start, end });
          return builder;
        },
        maybeSingle: async () => {
          if (table === 'profiles') {
            const profileData = options.profile?.data;
            if (!profileData) return options.profile;
            const activeFilter = filters.find(filter => filter.column === 'is_active');
            if (activeFilter && activeFilter.value === true && profileData.is_active !== true) {
              return { data: null, error: null };
            }
            return options.profile;
          }
          if (table === 'review_cases') return options.review;
          return { data: null, error: null };
        },
        then: (resolve: any) => resolve(options.audit),
      };
      return builder;
    },
    auth: {
      getUser: async () => options.authUser,
    },
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return options.rpcResult;
    },
  };
  return { client, rpcCalls, fromCalls, eqCalls, orderCalls, rangeCalls };
}

function actorOk(items: any[] = []): any {
  return {
    data: {
      ok: true,
      code: 'OK',
      message: 'success',
      data: { items },
    },
    error: null,
  };
}

function baseOptions(overrides: Partial<{
  authUser: any;
  profile: any;
  review: any;
  audit: any;
  rpcResult: any;
}> = {}) {
  return {
    authUser: { data: { user: { id: 'u_admin' } }, error: null },
    profile: { data: { id: PROFILE_ID, org_id: ORG_ID, role: 'admin', is_active: true }, error: null },
    review: { data: { id: REVIEW_ID }, error: null },
    audit: { data: [], error: null },
    rpcResult: actorOk([]),
    ...overrides,
  };
}

async function runGet(options: any, opts: { query?: string; authenticated?: boolean; id?: string } = {}) {
  const holder = makeClient(options);
  (globalThis as any).__reviewCenterFakeSupabaseClient = holder.client;
  const req = request(opts.query ?? '', opts.authenticated ?? true);
  const response = await GET(req, { params: { id: opts.id ?? REVIEW_ID } });
  const body: any = await response.json();
  return {
    status: response.status,
    body,
    rpcCalls: holder.rpcCalls,
    fromCalls: holder.fromCalls,
    eqCalls: holder.eqCalls,
    orderCalls: holder.orderCalls,
    rangeCalls: holder.rangeCalls,
  };
}

function collectKeys(value: any, keys: Set<string>) {
  if (value === null || typeof value !== 'object') return;
  for (const key of Object.keys(value)) keys.add(key);
  for (const child of Object.values(value)) collectKeys(child, keys);
}

console.log('\n=== Review Center Management Audit Read API Route ===');

const auth401 = await runGet(baseOptions({
  authUser: { data: { user: null }, error: null },
}), { authenticated: false });
assert(auth401.status === 401 && auth401.body.error === '未登录或无权限', 'unauthenticated returns 401');

const invalidId = await runGet(baseOptions(), { id: 'not-a-uuid' });
assert(invalidId.status === 400 && invalidId.body.error === '请求参数无效', 'invalid UUID returns 400');

const invalidLimit = await runGet(baseOptions(), { query: 'limit=abc' });
assert(invalidLimit.status === 400 && invalidLimit.body.error === '分页参数无效', 'invalid limit returns 400');

const invalidOffset = await runGet(baseOptions(), { query: 'offset=-1' });
assert(invalidOffset.status === 400 && invalidOffset.body.error === '分页参数无效', 'invalid offset returns 400');

const noProfile = await runGet(baseOptions({
  authUser: { data: { user: { id: 'u_no_profile' } }, error: null },
  profile: { data: null, error: null },
}));
assert(noProfile.status === 403 && noProfile.body.error === '无有效档案', 'missing profile returns 403');
assert(
  noProfile.eqCalls.some(call => call.table === 'profiles' && call.column === 'user_id' && call.value === 'u_no_profile'),
  'profile query filters by authenticated user id',
);
assert(
  noProfile.eqCalls.some(call => call.table === 'profiles' && call.column === 'is_active' && call.value === true),
  'profile query filters is_active true',
);

const inactiveAdmin = await runGet(baseOptions({
  authUser: { data: { user: { id: 'u_inactive_admin' } }, error: null },
  profile: { data: { id: PROFILE_ID, org_id: ORG_ID, role: 'admin', is_active: false }, error: null },
}));
assert(inactiveAdmin.status === 403 && inactiveAdmin.body.error === '无有效档案', 'inactive admin returns 403');
assert(!inactiveAdmin.fromCalls.includes('review_audit_logs'), 'inactive admin never queries audit table');
assert(inactiveAdmin.rpcCalls.length === 0, 'inactive admin never calls actor RPC');

const inactiveManager = await runGet(baseOptions({
  authUser: { data: { user: { id: 'u_inactive_manager' } }, error: null },
  profile: { data: { id: PROFILE_ID, org_id: ORG_ID, role: 'manager', is_active: false }, error: null },
}));
assert(inactiveManager.status === 403 && inactiveManager.body.error === '无有效档案', 'inactive manager returns 403');
assert(!inactiveManager.fromCalls.includes('review_audit_logs'), 'inactive manager never queries audit table');
assert(inactiveManager.rpcCalls.length === 0, 'inactive manager never calls actor RPC');

for (const role of ['operator', 'sales', 'viewer']) {
  const blocked = await runGet(baseOptions({
    profile: { data: { id: PROFILE_ID, org_id: ORG_ID, role, is_active: true }, error: null },
  }));
  assert(blocked.status === 403 && blocked.body.error === '无权查看管理日志', role + ' blocked with 403');
  assert(!blocked.fromCalls.includes('review_audit_logs'), role + ' never queries audit table');
  assert(blocked.rpcCalls.length === 0, role + ' never calls actor RPC');
}

const reviewNotFound = await runGet(baseOptions({ review: { data: null, error: null } }));
assert(reviewNotFound.status === 404 && reviewNotFound.body.error === '复盘不存在或无权访问', 'review not found returns 404');
assert(!reviewNotFound.fromCalls.includes('review_audit_logs'), 'review not found skips audit query');
assert(reviewNotFound.rpcCalls.length === 0, 'review not found skips actor RPC');

const reviewDbError = await runGet(baseOptions({ review: { data: null, error: { message: 'RAW REVIEW DB' } } }));
assert(reviewDbError.status === 500 && reviewDbError.body.error === '管理日志加载失败，请稍后重试。', 'review db error generic 500');
assert(!JSON.stringify(reviewDbError.body).includes('RAW REVIEW DB'), 'review db raw message hidden');

const empty = await runGet(baseOptions());
assert(empty.status === 200 && empty.body.ok === true && empty.body.code === 'OK', 'empty audit success envelope');
assert(Array.isArray(empty.body.data.logs) && empty.body.data.logs.length === 0, 'empty audit logs array');
assert(empty.body.data.pageInfo.hasMore === false && empty.body.data.pageInfo.nextOffset === null, 'empty audit pageInfo');
assert(empty.rpcCalls.length === 0, 'actor RPC skipped when no audit rows');

const auditRows = [
  {
    id: 'log-1',
    entity_type: 'REVIEW',
    action: 'REVIEW_UPDATED',
    actor_profile_id: PROFILE_ID,
    changes: {
      title: { before: '旧', after: '新' },
      description: { before: 'SECRET_DESCRIPTION', after: 'SECRET_DESCRIPTION2' },
      risk_reason: { before: 'SECRET_RISK_REASON', after: 'x' },
      customer_name: { before: 'SECRET_CUSTOMER', after: 'y' },
      email: 'SECRET_EMAIL',
      user_id: 'SECRET_USER_ID',
      nested: { secret: 'SECRET_NESTED' },
    },
    version_before: 1,
    version_after: 2,
    created_at: '2026-08-25T00:00:00Z',
  },
  {
    id: 'log-2',
    entity_type: 'ACTION',
    action: 'ACTION_CREATED',
    actor_profile_id: null,
    changes: {
      sequence: 1,
      title: '行动',
      description: 'SECRET_ACTION_DESCRIPTION',
      owner_profile_id: 'SECRET_OWNER_UUID',
    },
    version_before: null,
    version_after: 1,
    created_at: '2026-08-26T00:00:00Z',
  },
];
const rowsOptions = baseOptions({
  audit: { data: auditRows, error: null },
  rpcResult: actorOk([
    { profile_id: PROFILE_ID, display_name: '管理员', role: 'admin', is_active: true },
  ]),
});
const rows = await runGet(rowsOptions);
assert(rows.status === 200 && rows.body.data.logs.length === 2, 'audit rows returned');
assert(rows.rpcCalls.length === 1 && rows.rpcCalls[0].name === 'review_event_actor_directory', 'actor directory RPC called once');
assert(rows.rpcCalls[0].args.p_purpose === 'AUDIT', 'actor directory purpose AUDIT');
const updatedLog = rows.body.data.logs[0];
assert(updatedLog.entityType === 'REVIEW' && updatedLog.action === 'REVIEW_UPDATED', 'audit DTO entity/action preserved');
assert(updatedLog.actor.displayName === '管理员' && updatedLog.actor.role === 'admin', 'audit DTO actor safe');
assert(updatedLog.versionBefore === 1 && updatedLog.versionAfter === 2, 'audit DTO version pair');
const actionLog = rows.body.data.logs[1];
assert(actionLog.actor.displayName === '系统操作', 'audit null actor safe');
assert(actionLog.details.sequence === 1 && actionLog.details.title === '行动', 'audit ACTION_CREATED safe details');
assert(!('description' in actionLog.details) && !('owner_profile_id' in actionLog.details), 'audit ACTION_CREATED strips sensitive');

const rowsSerialized = JSON.stringify(rows.body);
for (const marker of [
  'SECRET_DESCRIPTION',
  'SECRET_RISK_REASON',
  'SECRET_CUSTOMER',
  'SECRET_EMAIL',
  'SECRET_USER_ID',
  'SECRET_NESTED',
  'SECRET_ACTION_DESCRIPTION',
  'SECRET_OWNER_UUID',
]) {
  assert(!rowsSerialized.includes(marker), 'audit response hides marker: ' + marker);
}
const responseKeys = new Set<string>();
collectKeys(rows.body, responseKeys);
for (const forbidden of [
  'org_id',
  'review_id',
  'entity_id',
  'actor_profile_id',
  'profile_id',
  'user_id',
  'email',
  'changes',
  'payload',
]) {
  assert(!responseKeys.has(forbidden), 'audit response excludes forbidden key: ' + forbidden);
}

const managerAllowed = await runGet(baseOptions({
  profile: { data: { id: PROFILE_ID, org_id: ORG_ID, role: 'manager', is_active: true }, error: null },
  audit: { data: [auditRows[0]], error: null },
  rpcResult: actorOk([]),
}));
assert(managerAllowed.status === 200 && managerAllowed.body.data.logs.length === 1, 'manager allowed');

const hasMoreOptions = baseOptions({
  audit: { data: [auditRows[0], { ...auditRows[0], id: 'log-2' }], error: null },
  rpcResult: actorOk([]),
});
const hasMore = await runGet(hasMoreOptions, { query: 'limit=1' });
assert(hasMore.status === 200 && hasMore.body.data.logs.length === 1, 'audit limit limits returned items');
assert(hasMore.body.data.pageInfo.hasMore === true && hasMore.body.data.pageInfo.nextOffset === 1, 'audit hasMore and nextOffset');

const ordering = await runGet(baseOptions({
  audit: { data: [auditRows[0]], error: null },
  rpcResult: actorOk([]),
}), { query: 'limit=5&offset=0' });
assert(ordering.orderCalls.length === 2, 'audit stable ordering two keys');
assert(ordering.orderCalls[0].column === 'created_at' && ordering.orderCalls[0].options.ascending === false, 'audit orders created_at DESC');
assert(ordering.orderCalls[1].column === 'id' && ordering.orderCalls[1].options.ascending === false, 'audit orders id DESC');
assert(ordering.rangeCalls.length === 1 && ordering.rangeCalls[0].start === 0 && ordering.rangeCalls[0].end === 5, 'audit range query correct');

const malformedChanges = await runGet(baseOptions({
  audit: { data: [{ ...auditRows[0], changes: 'SECRET_STRING' }], error: null },
  rpcResult: actorOk([]),
}));
assert(malformedChanges.status === 200 && malformedChanges.body.data.logs.length === 1, 'malformed changes row still returns');
assert(malformedChanges.body.data.logs[0].details && Object.keys(malformedChanges.body.data.logs[0].details).length === 0, 'malformed changes details empty');
assert(!JSON.stringify(malformedChanges.body).includes('SECRET_STRING'), 'malformed changes raw not exposed');

const unknownAction = await runGet(baseOptions({
  audit: { data: [{ ...auditRows[0], entity_type: 'FUTURE_ENTITY', action: 'FUTURE_ACTION', changes: { secret: 'SECRET_STRING' } }], error: null },
  rpcResult: actorOk([]),
}));
assert(unknownAction.status === 200 && unknownAction.body.data.logs.length === 1, 'unknown action row still returns');
assert(Object.keys(unknownAction.body.data.logs[0].details).length === 0, 'unknown action details empty');

const malformedCoreVersion = await runGet(baseOptions({
  audit: { data: [{ ...auditRows[0], version_after: 0 }], error: null },
  rpcResult: actorOk([]),
}));
assert(malformedCoreVersion.status === 500 && malformedCoreVersion.body.error === '管理日志加载失败，请稍后重试。', 'malformed core version fails closed 500');

const auditDbError = await runGet(baseOptions({
  audit: { data: null, error: { message: 'RAW AUDIT DB', details: 'RAW DETAILS' } },
}));
assert(auditDbError.status === 500 && auditDbError.body.error === '管理日志加载失败，请稍后重试。', 'audit db error generic 500');
assert(!JSON.stringify(auditDbError.body).includes('RAW AUDIT DB'), 'audit db raw message hidden');

const actorTransport = await runGet(baseOptions({
  audit: { data: [auditRows[0]], error: null },
  rpcResult: { data: null, error: { message: 'RAW ACTOR TRANSPORT' } },
}));
assert(actorTransport.status === 500 && actorTransport.body.error === '管理日志加载失败，请稍后重试。', 'actor transport error generic 500');
assert(!JSON.stringify(actorTransport.body).includes('RAW ACTOR TRANSPORT'), 'actor transport raw message hidden');

const actorForbidden = await runGet(baseOptions({
  audit: { data: [auditRows[0]], error: null },
  rpcResult: { data: { ok: false, code: 'FORBIDDEN', message: 'RAW FORBIDDEN', data: null }, error: null },
}));
assert(actorForbidden.status === 403 && actorForbidden.body.error === '未登录或无权限', 'actor FORBIDDEN returns 403');
assert(!JSON.stringify(actorForbidden.body).includes('RAW FORBIDDEN'), 'actor FORBIDDEN raw message hidden');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
