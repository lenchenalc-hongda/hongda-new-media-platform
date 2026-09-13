// ===== Review Center Dashboard Data Foundation API Route Tests =====
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

const { GET } = await import('../../src/app/api/review-center/dashboard/route');

const ORG_ID = '00000000-0000-0000-0000-000000000002';
const PROFILE_ID = '00000000-0000-0000-0000-000000000006';
const OWNER_ID = '00000000-0000-0000-0000-000000000007';
const REVIEW_ID = '00000000-0000-0000-0000-000000000001';

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
  const url = 'http://localhost/api/review-center/dashboard' + (query ? '?' + query : '');
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

function validReview(overrides: Record<string, unknown> = {}): any {
  return {
    id: REVIEW_ID,
    review_no: 'REV-2026-000001',
    title: '复盘标题',
    review_type: 'A',
    status: 'draft',
    risk_level: 'RED',
    owner_id: OWNER_ID,
    created_at: '2026-08-10T00:00:00+08:00',
    ...overrides,
  };
}

function validAction(overrides: Record<string, unknown> = {}): any {
  return {
    review_id: REVIEW_ID,
    status: 'OPEN',
    due_date: '2026-08-25',
    verified_at: null,
    ...overrides,
  };
}

function directoryOk(items: any[] = []): any {
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

function makeClient(options: any) {
  const queryCalls: any[] = [];
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const client: any = {
    from: (table: string) => {
      const filters: Array<{ column: string; value: any }> = [];
      const builder: any = {
        select: (cols: string) => {
          queryCalls.push({ op: 'select', table, cols });
          return builder;
        },
        eq: (column: string, value: any) => {
          filters.push({ column, value });
          queryCalls.push({ op: 'eq', table, column, value });
          return builder;
        },
        order: (column: string, orderOptions: any) => {
          queryCalls.push({ op: 'order', table, column, options: orderOptions });
          return builder;
        },
        range: (start: number, end: number) => {
          queryCalls.push({ op: 'range', table, start, end });
          return builder;
        },
        maybeSingle: async () => {
          if (table === 'profiles') {
            const profile = options.profile?.data;
            if (!profile) return options.profile;
            const activeFilter = filters.find(filter => filter.column === 'is_active');
            if (activeFilter && activeFilter.value === true && profile.is_active !== true) {
              return { data: null, error: null };
            }
            return options.profile;
          }
          return { data: null, error: null };
        },
        then: (resolve: any) => {
          resolve(options.results?.[table] ?? { data: [], error: null });
        },
      };
      return builder;
    },
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return options.rpcResult ?? directoryOk([]);
    },
    auth: {
      getUser: async () => options.authUser,
    },
  };
  return { client, queryCalls, rpcCalls };
}

function baseOptions(overrides: Partial<{
  authUser: any;
  profile: any;
  results: any;
  rpcResult: any;
}> = {}) {
  return {
    authUser: { data: { user: { id: 'u_admin' } }, error: null },
    profile: { data: { id: PROFILE_ID, org_id: ORG_ID, role: 'admin', is_active: true }, error: null },
    results: {
      review_cases: { data: [], error: null },
      review_actions: { data: [], error: null },
      review_timeline_events: { data: [], error: null },
    },
    rpcResult: directoryOk([]),
    ...overrides,
  };
}

async function runGet(options: any, query = '', authenticated = true) {
  const holder = makeClient(options);
  (globalThis as any).__reviewCenterFakeSupabaseClient = holder.client;
  const response = await GET(request(query, authenticated));
  const body: any = await response.json();
  return {
    status: response.status,
    body,
    queryCalls: holder.queryCalls,
    rpcCalls: holder.rpcCalls,
  };
}

function collectKeys(value: any, keys: Set<string>) {
  if (value === null || typeof value !== 'object') return;
  for (const key of Object.keys(value)) keys.add(key);
  for (const child of Object.values(value)) collectKeys(child, keys);
}

console.log('\n=== Review Center Dashboard Data Foundation API Route ===');

const anonymous = await runGet(baseOptions({
  authUser: { data: { user: null }, error: null },
}), '', false);
assert(anonymous.status === 401 && anonymous.body.error === '未登录或无权限', 'anonymous returns 401');

const noProfile = await runGet(baseOptions({
  profile: { data: null, error: null },
}));
assert(noProfile.status === 403 && noProfile.body.error === '无有效档案', 'missing profile returns 403');
assert(
  noProfile.queryCalls.some(call => call.table === 'profiles' && call.column === 'user_id' && call.value === 'u_admin'),
  'profile query filters by auth user id',
);
assert(
  noProfile.queryCalls.some(call => call.table === 'profiles' && call.column === 'is_active' && call.value === true),
  'profile query filters is_active true',
);

const inactiveAdmin = await runGet(baseOptions({
  profile: { data: { id: PROFILE_ID, org_id: ORG_ID, role: 'admin', is_active: false }, error: null },
}));
assert(inactiveAdmin.status === 403 && inactiveAdmin.body.error === '无有效档案', 'inactive admin returns 403');
assert(!inactiveAdmin.queryCalls.some(call => call.table === 'review_cases'), 'inactive admin never queries dashboard tables');

const inactiveManager = await runGet(baseOptions({
  profile: { data: { id: PROFILE_ID, org_id: ORG_ID, role: 'manager', is_active: false }, error: null },
}));
assert(inactiveManager.status === 403 && inactiveManager.body.error === '无有效档案', 'inactive manager returns 403');
assert(!inactiveManager.queryCalls.some(call => call.table === 'review_actions'), 'inactive manager never queries dashboard tables');

for (const role of ['operator', 'sales', 'viewer', 'unknown']) {
  const blocked = await runGet(baseOptions({
    profile: { data: { id: PROFILE_ID, org_id: ORG_ID, role, is_active: true }, error: null },
  }));
  assert(blocked.status === 403 && blocked.body.error === '无权查看管理统计', role + ' blocked with 403');
  assert(!blocked.queryCalls.some(call => call.table === 'review_cases'), role + ' never queries dashboard tables');
  assert(blocked.rpcCalls.length === 0, role + ' never calls owner directory RPC');
}

const empty = await runGet(baseOptions());
assert(empty.status === 200 && empty.body.ok === true && empty.body.code === 'OK', 'empty dashboard success envelope');
assert(deepEqual(empty.body.data.current, {
  openReviews: 0,
  highRiskReviews: 0,
  openActions: 0,
  overdueActions: 0,
  pendingVerificationActions: 0,
}), 'empty current state all zero');
assert(deepEqual(empty.body.data.period, {
  range: 'THIS_MONTH',
  reviewsCreated: 0,
  reviewsClosedUnique: 0,
  actionsVerified: 0,
}), 'empty period defaults THIS_MONTH and all zero');
assert(empty.body.data.distributions.status.length === 10, 'status distribution fixed buckets');
assert(empty.body.data.distributions.risk.length === 5, 'risk distribution fixed buckets');
assert(empty.body.data.distributions.type.length === 4, 'type distribution fixed buckets');
assert(deepEqual(empty.body.data.attention, { items: [], total: 0 }), 'empty attention');
assert(empty.rpcCalls.length === 0, 'owner directory RPC skipped for zero reviews');
assert(!empty.queryCalls.some(call => call.table === 'review_audit_logs'), 'dashboard never queries audit logs');

for (const [query, expected] of [
  ['', 'THIS_MONTH'],
  ['range=this_month', 'THIS_MONTH'],
  ['range=THIS_MONTH', 'THIS_MONTH'],
  ['range=last_30_days', 'LAST_30_DAYS'],
  ['range=all', 'ALL'],
] as Array<[string, string]>) {
  const ok = await runGet(baseOptions(), query);
  assert(ok.status === 200 && ok.body.data.period.range === expected, 'range parsed: ' + (query || 'missing'));
}

for (const query of ['range=year', 'range=', 'range=this_month&range=last_30_days']) {
  const invalid = await runGet(baseOptions(), query);
  assert(invalid.status === 400 && invalid.body.error === '查询参数无效', 'invalid range rejected: ' + query);
  assert(!invalid.queryCalls.some(call => call.table === 'review_cases'), 'invalid range skips dashboard queries');
}

const rowsOptions = baseOptions({
  results: {
    review_cases: { data: [validReview()], error: null },
    review_actions: { data: [validAction()], error: null },
    review_timeline_events: { data: [], error: null },
  },
  rpcResult: directoryOk([
    { profile_id: OWNER_ID, display_name: '负责人', role: 'manager', department: null, assignment_eligible: true },
  ]),
});
const rows = await runGet(rowsOptions);
assert(rows.status === 200 && rows.body.data.current.openReviews === 1, 'dashboard aggregates reviews');
assert(rows.body.data.current.highRiskReviews === 1, 'dashboard aggregates high risk');
assert(rows.body.data.current.openActions === 1, 'dashboard aggregates actions');
assert(rows.rpcCalls.length === 1 && rows.rpcCalls[0].name === 'review_profile_directory', 'owner directory RPC called once');
assert(rows.rpcCalls[0].args.p_purpose === 'ACTION_OWNER', 'owner directory purpose ACTION_OWNER');
assert(
  rows.body.data.attention.items[0].ownerDisplayName === '负责人',
  'attention owner display name hydrated from safe directory',
);

const reviewSelect = rows.queryCalls.find(call => call.table === 'review_cases' && call.op === 'select');
const reviewCols = reviewSelect ? String(reviewSelect.cols) : '';
assert(reviewCols.includes('id') && reviewCols.includes('review_no') && reviewCols.includes('owner_id'), 'review select minimal fields');
assert(!reviewCols.includes('description') && !reviewCols.includes('customer_name'), 'review select excludes sensitive fields');
assert(!reviewCols.includes('risk_reason') && !reviewCols.includes('impact_summary'), 'review select excludes narrative fields');

const actionSelect = rows.queryCalls.find(call => call.table === 'review_actions' && call.op === 'select');
const actionCols = actionSelect ? String(actionSelect.cols) : '';
assert(actionCols.includes('review_id') && actionCols.includes('status') && actionCols.includes('due_date') && actionCols.includes('verified_at'), 'action select minimal fields');
assert(!actionCols.includes('description') && !actionCols.includes('completion_note'), 'action select excludes notes');
assert(!actionCols.includes('verification_note') && !actionCols.includes('cancel_reason'), 'action select excludes cancel/verify notes');

const timelineSelect = rows.queryCalls.find(call => call.table === 'review_timeline_events' && call.op === 'select');
const timelineCols = timelineSelect ? String(timelineSelect.cols) : '';
assert(timelineCols.includes('review_id') && timelineCols.includes('event_type') && timelineCols.includes('created_at'), 'timeline select minimal fields');
assert(!timelineCols.includes('payload') && !timelineCols.includes('actor_profile_id'), 'timeline select excludes payload/actor');

for (const table of ['review_cases', 'review_actions', 'review_timeline_events']) {
  assert(
    rows.queryCalls.some(call => call.table === table && call.op === 'eq' && call.column === 'org_id' && call.value === ORG_ID),
    table + ' scoped by org_id',
  );
}
assert(
  rows.queryCalls.some(call => call.table === 'review_timeline_events' && call.op === 'eq' && call.column === 'event_type' && call.value === 'REVIEW_CLOSED'),
  'timeline filtered to REVIEW_CLOSED',
);
const reviewOrders = rows.queryCalls.filter(call => call.table === 'review_cases' && call.op === 'order');
assert(reviewOrders.length === 2 && reviewOrders[0].column === 'created_at' && reviewOrders[1].column === 'id', 'review stable ordering');
const actionOrders = rows.queryCalls.filter(call => call.table === 'review_actions' && call.op === 'order');
assert(actionOrders.length === 2 && actionOrders[0].column === 'created_at' && actionOrders[1].column === 'id', 'action stable ordering');
const timelineOrders = rows.queryCalls.filter(call => call.table === 'review_timeline_events' && call.op === 'order');
assert(timelineOrders.length === 2 && timelineOrders[0].column === 'created_at' && timelineOrders[1].column === 'id', 'timeline stable ordering');
for (const table of ['review_cases', 'review_actions', 'review_timeline_events']) {
  assert(
    rows.queryCalls.some(call => call.table === table && call.op === 'range' && call.start === 0 && call.end === 499),
    table + ' batch range uses 500 rows',
  );
}

const manager = await runGet(baseOptions({
  profile: { data: { id: PROFILE_ID, org_id: ORG_ID, role: 'manager', is_active: true }, error: null },
}));
assert(manager.status === 200 && manager.body.data.period.range === 'THIS_MONTH', 'manager returns 200');

const reviewDbError = await runGet(baseOptions({
  results: {
    review_cases: { data: null, error: { message: 'RAW REVIEW DB', details: 'RAW DETAILS' } },
    review_actions: { data: [], error: null },
    review_timeline_events: { data: [], error: null },
  },
}));
assert(reviewDbError.status === 500 && reviewDbError.body.error === '管理统计加载失败，请稍后重试。', 'review db error generic 500');
assert(!JSON.stringify(reviewDbError.body).includes('RAW REVIEW DB'), 'review db raw message hidden');

const actionDbError = await runGet(baseOptions({
  results: {
    review_cases: { data: [], error: null },
    review_actions: { data: null, error: { message: 'RAW ACTION DB' } },
    review_timeline_events: { data: [], error: null },
  },
}));
assert(actionDbError.status === 500 && actionDbError.body.error === '管理统计加载失败，请稍后重试。', 'action db error generic 500');
assert(!JSON.stringify(actionDbError.body).includes('RAW ACTION DB'), 'action db raw message hidden');

const timelineDbError = await runGet(baseOptions({
  results: {
    review_cases: { data: [], error: null },
    review_actions: { data: [], error: null },
    review_timeline_events: { data: null, error: { message: 'RAW TIMELINE DB' } },
  },
}));
assert(timelineDbError.status === 500 && timelineDbError.body.error === '管理统计加载失败，请稍后重试。', 'timeline db error generic 500');
assert(!JSON.stringify(timelineDbError.body).includes('RAW TIMELINE DB'), 'timeline db raw message hidden');

const directoryFailure = await runGet(baseOptions({
  results: {
    review_cases: { data: [validReview()], error: null },
    review_actions: { data: [], error: null },
    review_timeline_events: { data: [], error: null },
  },
  rpcResult: { data: null, error: { message: 'RAW DIRECTORY ERROR' } },
}));
assert(directoryFailure.status === 200, 'owner directory failure does not break dashboard');
assert(directoryFailure.body.data.attention.items[0].ownerDisplayName === null, 'owner display name null on directory failure');
assert(!JSON.stringify(directoryFailure.body).includes('RAW DIRECTORY ERROR'), 'directory raw error hidden');

const privacyOptions = baseOptions({
  results: {
    review_cases: { data: [validReview({
      customer_name: 'SECRET_CUSTOMER',
      description: 'SECRET_DESCRIPTION',
      risk_reason: 'SECRET_RISK_REASON',
      impact_summary: 'SECRET_IMPACT',
      email: 'SECRET_EMAIL',
      org_id: 'SECRET_ORG',
    })], error: null },
    review_actions: { data: [validAction({
      description: 'SECRET_ACTION_DESCRIPTION',
      completion_note: 'SECRET_COMPLETION',
      verification_note: 'SECRET_VERIFY',
      cancel_reason: 'SECRET_CANCEL',
      email: 'SECRET_ACTION_EMAIL',
      org_id: 'SECRET_ACTION_ORG',
    })], error: null },
    review_timeline_events: { data: [], error: null },
  },
  rpcResult: directoryOk([
    { profile_id: OWNER_ID, display_name: '负责人', role: 'manager', department: null, assignment_eligible: true },
  ]),
});
const privacy = await runGet(privacyOptions);
const privacyText = JSON.stringify(privacy.body);
for (const marker of [
  'SECRET_CUSTOMER',
  'SECRET_DESCRIPTION',
  'SECRET_RISK_REASON',
  'SECRET_IMPACT',
  'SECRET_EMAIL',
  'SECRET_ORG',
  'SECRET_ACTION_DESCRIPTION',
  'SECRET_COMPLETION',
  'SECRET_VERIFY',
  'SECRET_CANCEL',
  'SECRET_ACTION_EMAIL',
  'SECRET_ACTION_ORG',
  'SECRET_OWNER',
]) {
  assert(!privacyText.includes(marker), 'dashboard response hides marker: ' + marker);
}
const responseKeys = new Set<string>();
collectKeys(privacy.body, responseKeys);
for (const forbidden of [
  'org_id',
  'owner_id',
  'owner_profile_id',
  'profile_id',
  'user_id',
  'email',
  'review_id',
  'action_id',
  'customer_name',
  'description',
  'risk_reason',
  'impact_summary',
  'completion_note',
  'verification_note',
  'cancel_reason',
  'payload',
]) {
  assert(!responseKeys.has(forbidden), 'dashboard response excludes forbidden key: ' + forbidden);
}
assert(responseKeys.has('reviewId'), 'attention reviewId allowed');

const noDataRpc = await runGet(baseOptions({
  results: {
    review_cases: { data: [validReview({ status: 'draft', risk_level: 'GREEN' })], error: null },
    review_actions: { data: [], error: null },
    review_timeline_events: { data: [], error: null },
  },
}));
assert(noDataRpc.status === 200 && noDataRpc.body.data.attention.total === 0, 'normal review without attention not returned');
assert(noDataRpc.rpcCalls.length === 1, 'owner directory still called when reviews exist');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
