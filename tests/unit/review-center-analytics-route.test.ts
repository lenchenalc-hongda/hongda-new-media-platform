// ===== Review Center Analytics Data Foundation API Route Tests =====
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

const { GET } = await import('../../src/app/api/review-center/analytics/route');

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

function request(query = ''): NextRequest {
  const url = 'http://localhost/api/review-center/analytics' + (query ? '?' + query : '');
  return new NextRequest(url, {
    headers: {
      cookie: 'nmc_user=' + encodeURIComponent(JSON.stringify({
        id: 'u_admin',
        full_name: '管理员',
        email: 'admin@hongda.com',
        role: 'admin',
        org_id: 'org_001',
        department: '管理部',
      })),
    },
  });
}

function makeClient(options: any) {
  const queryCalls: any[] = [];
  const rpcCalls: any[] = [];
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
        gte: (column: string, value: any) => {
          queryCalls.push({ op: 'gte', table, column, value });
          return builder;
        },
        lt: (column: string, value: any) => {
          queryCalls.push({ op: 'lt', table, column, value });
          return builder;
        },
        in: (column: string, values: any[]) => {
          queryCalls.push({ op: 'in', table, column, values });
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
          if (table === 'review_cases') {
            resolve(options.reviewsResult ?? { data: [], error: null });
            return;
          }
          if (table === 'review_timeline_events') {
            resolve(options.timelineResult ?? { data: [], error: null });
            return;
          }
          if (table === 'review_actions') {
            const status = filters.find(filter => filter.column === 'status')?.value;
            if (status === 'VERIFIED') {
              resolve(options.actionsVerifiedResult ?? { data: [], error: null });
              return;
            }
            if (status === 'CANCELLED') {
              resolve(options.actionsCancelledResult ?? { data: [], error: null });
              return;
            }
            resolve(options.actionsCreatedResult ?? { data: [], error: null });
            return;
          }
          resolve({ data: [], error: null });
        },
      };
      return builder;
    },
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return options.rpcResult ?? { data: null, error: null };
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
  reviewsResult: any;
  actionsCreatedResult: any;
  actionsVerifiedResult: any;
  actionsCancelledResult: any;
  timelineResult: any;
  rpcResult: any;
}> = {}) {
  return {
    authUser: { data: { user: { id: 'u_admin' } }, error: null },
    profile: { data: { id: PROFILE_ID, org_id: ORG_ID, role: 'admin', is_active: true }, error: null },
    reviewsResult: { data: [], error: null },
    actionsCreatedResult: { data: [], error: null },
    actionsVerifiedResult: { data: [], error: null },
    actionsCancelledResult: { data: [], error: null },
    timelineResult: { data: [], error: null },
    rpcResult: { data: null, error: null },
    ...overrides,
  };
}

async function runGet(options: any, query = '') {
  const holder = makeClient(options);
  (globalThis as any).__reviewCenterFakeSupabaseClient = holder.client;
  const response = await GET(request(query));
  const body: any = await response.json();
  return {
    status: response.status,
    body,
    queryCalls: holder.queryCalls,
    rpcCalls: holder.rpcCalls,
  };
}

console.log('\n=== Review Center Analytics Data Foundation API Route ===');

const anonymous = await runGet(baseOptions({
  authUser: { data: { user: null }, error: null },
}));
assert(anonymous.status === 401 && anonymous.body.error === '未登录或无权限', 'anonymous returns 401');

const noProfile = await runGet(baseOptions({
  profile: { data: null, error: null },
}));
assert(noProfile.status === 403 && noProfile.body.error === '无有效档案', 'missing profile returns 403');

const inactiveAdmin = await runGet(baseOptions({
  profile: { data: { id: PROFILE_ID, org_id: ORG_ID, role: 'admin', is_active: false }, error: null },
}));
assert(inactiveAdmin.status === 403 && inactiveAdmin.body.error === '无有效档案', 'inactive admin returns 403');

const inactiveManager = await runGet(baseOptions({
  profile: { data: { id: PROFILE_ID, org_id: ORG_ID, role: 'manager', is_active: false }, error: null },
}));
assert(inactiveManager.status === 403 && inactiveManager.body.error === '无有效档案', 'inactive manager returns 403');

for (const role of ['operator', 'sales', 'viewer', 'unknown']) {
  const blocked = await runGet(baseOptions({
    profile: { data: { id: PROFILE_ID, org_id: ORG_ID, role, is_active: true }, error: null },
  }));
  assert(blocked.status === 403 && blocked.body.error === '无权查看分析数据', role + ' blocked with 403');
  assert(!blocked.queryCalls.some(call => call.table === 'review_cases'), role + ' never queries analytics tables');
}

const empty = await runGet(baseOptions());
assert(empty.status === 200 && empty.body.ok === true && empty.body.code === 'OK', 'empty analytics success envelope');
assert(empty.body.data.range === 'LAST_6_MONTHS', 'default range LAST_6_MONTHS');
assert(empty.body.data.buckets.length === 6, 'zero-filled 6 buckets');
assert(empty.body.data.buckets.every((bucket: any) => bucket.reviewsCreated === 0), 'empty buckets zero');
assert(empty.body.data.summary.reviewsCreatedTotal === 0, 'empty summary zero');
assert(empty.body.data.dataCompleteness.lifecycleHistory === 'PARTIAL_LEGACY', 'legacy disclosure');

for (const [query, expected] of [
  ['', 'LAST_6_MONTHS'],
  ['range=last_6_months', 'LAST_6_MONTHS'],
  ['range=last_12_months', 'LAST_12_MONTHS'],
  ['range=this_year', 'THIS_YEAR'],
] as Array<[string, string]>) {
  const ok = await runGet(baseOptions(), query);
  assert(ok.status === 200 && ok.body.data.range === expected, 'range parsed: ' + (query || 'missing'));
}

for (const query of ['range=year', 'range=', 'range=last_6_months&range=this_year']) {
  const invalid = await runGet(baseOptions(), query);
  assert(invalid.status === 400 && invalid.body.error === '查询参数无效', 'invalid range rejected: ' + query);
  assert(!invalid.queryCalls.some(call => call.table === 'review_cases'), 'invalid range skips queries');
}

const privacyOptions = baseOptions();
const privacy = await runGet(privacyOptions);
const reviewSelect = privacy.queryCalls.find(call => call.table === 'review_cases' && call.op === 'select');
assert(reviewSelect.cols === 'id,created_at', 'review select minimal');
assert(!reviewSelect.cols.includes('risk_level') && !reviewSelect.cols.includes('review_type') && !reviewSelect.cols.includes('status'), 'review select excludes historical-risk/type/status fields');
assert(!reviewSelect.cols.includes('title') && !reviewSelect.cols.includes('customer_name') && !reviewSelect.cols.includes('description'), 'review select excludes sensitive fields');

const actionCreatedSelect = privacy.queryCalls.find(call => call.table === 'review_actions' && call.op === 'select' && call.cols === 'id,created_at');
const actionVerifiedSelect = privacy.queryCalls.find(call => call.table === 'review_actions' && call.op === 'select' && call.cols === 'id,created_at,status,verified_at');
const actionCancelledSelect = privacy.queryCalls.find(call => call.table === 'review_actions' && call.op === 'select' && call.cols === 'id,created_at,status,cancelled_at');
assert(!!actionCreatedSelect, 'action created minimal select');
assert(!!actionVerifiedSelect, 'action verified minimal select');
assert(!!actionCancelledSelect, 'action cancelled minimal select');
for (const select of [actionCreatedSelect, actionVerifiedSelect, actionCancelledSelect]) {
  assert(!select.cols.includes('title') && !select.cols.includes('description') && !select.cols.includes('completion_note') && !select.cols.includes('verification_note'), 'action selects exclude notes/title/description');
}

const timelineSelect = privacy.queryCalls.find(call => call.table === 'review_timeline_events' && call.op === 'select');
assert(timelineSelect.cols === 'id,review_id,event_type,created_at', 'timeline select minimal');
assert(!timelineSelect.cols.includes('payload') && !timelineSelect.cols.includes('actor_profile_id'), 'timeline select excludes payload/actor');

assert(!privacy.queryCalls.some(call => call.table === 'review_audit_logs'), 'analytics never queries audit logs');
assert(privacy.rpcCalls.length === 0, 'analytics never calls RPC');

const pushdown = await runGet(baseOptions());
const reviewRange = pushdown.queryCalls.filter(call => call.table === 'review_cases' && (call.op === 'gte' || call.op === 'lt'));
assert(reviewRange.length === 2 && reviewRange[0].column === 'created_at' && reviewRange[1].column === 'created_at', 'review created range pushdown');
assert(pushdown.queryCalls.some(call => call.table === 'review_cases' && call.op === 'eq' && call.column === 'org_id' && call.value === ORG_ID), 'review org scoped');
assert(pushdown.queryCalls.some(call => call.table === 'review_actions' && call.op === 'eq' && call.column === 'status' && call.value === 'VERIFIED'), 'verified status filter');
assert(pushdown.queryCalls.some(call => call.table === 'review_actions' && call.op === 'gte' && call.column === 'verified_at'), 'verified range pushdown');
assert(pushdown.queryCalls.some(call => call.table === 'review_actions' && call.op === 'eq' && call.column === 'status' && call.value === 'CANCELLED'), 'cancelled status filter');
assert(pushdown.queryCalls.some(call => call.table === 'review_actions' && call.op === 'gte' && call.column === 'cancelled_at'), 'cancelled range pushdown');
assert(pushdown.queryCalls.some(call => call.table === 'review_timeline_events' && call.op === 'in' && call.column === 'event_type' && call.values.includes('REVIEW_CLOSED') && call.values.includes('REVIEW_REOPENED')), 'timeline event filter');
assert(pushdown.queryCalls.some(call => call.table === 'review_timeline_events' && call.op === 'gte' && call.column === 'created_at'), 'timeline range pushdown');

const reviewOrders = pushdown.queryCalls.filter(call => call.table === 'review_cases' && call.op === 'order');
assert(reviewOrders.length === 2 && reviewOrders[0].column === 'created_at' && reviewOrders[1].column === 'id', 'review stable ordering');
const timelineOrders = pushdown.queryCalls.filter(call => call.table === 'review_timeline_events' && call.op === 'order');
assert(timelineOrders.length === 2 && timelineOrders[0].column === 'created_at' && timelineOrders[1].column === 'id', 'timeline stable ordering');
const verifiedOrders = pushdown.queryCalls.filter(call => call.table === 'review_actions' && call.op === 'order' && call.column === 'verified_at');
assert(verifiedOrders.length === 1, 'verified ordered by verified_at');
assert(pushdown.queryCalls.some(call => call.op === 'range' && call.table === 'review_cases' && call.start === 0 && call.end === 499), 'review batch range 500');
assert(pushdown.queryCalls.some(call => call.op === 'range' && call.table === 'review_timeline_events' && call.start === 0 && call.end === 499), 'timeline batch range 500');

const reviewError = await runGet(baseOptions({
  reviewsResult: { data: null, error: { message: 'RAW REVIEW ERROR' } },
}));
assert(reviewError.status === 500 && reviewError.body.error === '分析数据加载失败，请稍后重试。', 'review db error generic 500');
assert(!JSON.stringify(reviewError.body).includes('RAW REVIEW ERROR'), 'review raw error hidden');

const verifiedError = await runGet(baseOptions({
  actionsVerifiedResult: { data: null, error: { message: 'RAW VERIFIED ERROR' } },
}));
assert(verifiedError.status === 500 && verifiedError.body.error === '分析数据加载失败，请稍后重试。', 'verified db error generic 500');
assert(!JSON.stringify(verifiedError.body).includes('RAW VERIFIED ERROR'), 'verified raw error hidden');

const timelineError = await runGet(baseOptions({
  timelineResult: { data: null, error: { message: 'RAW TIMELINE ERROR' } },
}));
assert(timelineError.status === 500 && timelineError.body.error === '分析数据加载失败，请稍后重试。', 'timeline db error generic 500');
assert(!JSON.stringify(timelineError.body).includes('RAW TIMELINE ERROR'), 'timeline raw error hidden');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
