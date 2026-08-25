// ===== Review Center Timeline Read API Route Tests =====
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

const { GET } = await import('../../src/app/api/review-center/reviews/[id]/timeline/route');

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
  profile: any;
  review: any;
  timeline: any;
  rpcResult: any;
}) {
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const client: any = {
    from: (table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        range: () => builder,
        maybeSingle: async () => {
          if (table === 'profiles') return options.profile;
          if (table === 'review_cases') return options.review;
          return { data: null, error: null };
        },
        then: (resolve: any) => resolve(options.timeline),
      };
      return builder;
    },
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return options.rpcResult;
    },
  };
  return { client, rpcCalls };
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
  profile: any;
  review: any;
  timeline: any;
  rpcResult: any;
}> = {}) {
  return {
    profile: { data: { id: PROFILE_ID, org_id: ORG_ID }, error: null },
    review: { data: { id: REVIEW_ID }, error: null },
    timeline: { data: [], error: null },
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
  return { status: response.status, body, rpcCalls: holder.rpcCalls };
}

function collectKeys(value: any, keys: Set<string>) {
  if (value === null || typeof value !== 'object') return;
  for (const key of Object.keys(value)) keys.add(key);
  for (const child of Object.values(value)) collectKeys(child, keys);
}

console.log('\n=== Review Center Timeline Read API Route ===');

const auth401 = await runGet(baseOptions(), { authenticated: false });
assert(auth401.status === 401 && auth401.body.error === '未登录或无权限', 'unauthenticated returns 401');

const invalidId = await runGet(baseOptions(), { id: 'not-a-uuid' });
assert(invalidId.status === 400 && invalidId.body.error === '请求参数无效', 'invalid UUID returns 400');

const invalidPagination = await runGet(baseOptions(), { query: 'limit=abc' });
assert(invalidPagination.status === 400 && invalidPagination.body.error === '分页参数无效', 'invalid pagination returns 400');

const noProfile = await runGet(baseOptions({ profile: { data: null, error: null } }));
assert(noProfile.status === 403 && noProfile.body.error === '无有效档案', 'missing profile returns 403');

const reviewNotFound = await runGet(baseOptions({ review: { data: null, error: null } }));
assert(reviewNotFound.status === 404 && reviewNotFound.body.error === '复盘不存在或无权访问', 'review not found returns 404');
assert(reviewNotFound.rpcCalls.length === 0, 'actor RPC skipped when review not found');

const reviewDbError = await runGet(baseOptions({ review: { data: null, error: { message: 'RAW REVIEW DB' } } }));
assert(reviewDbError.status === 500 && reviewDbError.body.error === '项目动态加载失败，请稍后重试。', 'review db error returns generic 500');
assert(!JSON.stringify(reviewDbError.body).includes('RAW REVIEW DB'), 'review db raw message not exposed');

const empty = await runGet(baseOptions());
assert(empty.status === 200 && empty.body.ok === true && empty.body.code === 'OK', 'empty timeline success envelope');
assert(Array.isArray(empty.body.data.items) && empty.body.data.items.length === 0, 'empty timeline items array');
assert(empty.body.data.pageInfo.hasMore === false && empty.body.data.pageInfo.nextOffset === null, 'empty timeline pageInfo');
assert(empty.rpcCalls.length === 0, 'actor RPC skipped when no timeline rows');

const timelineRows = [
  {
    id: 'event-1',
    event_type: 'REVIEW_CREATED',
    actor_profile_id: PROFILE_ID,
    payload: { review_no: 'REV-2026-000002', review_type: 'A', title: '标题', secret: 'x' },
    version: 1,
    created_at: '2026-08-25T00:00:00Z',
  },
];
const rowsOptions = baseOptions({
  timeline: { data: timelineRows, error: null },
  rpcResult: actorOk([
    { profile_id: PROFILE_ID, display_name: '管理员', role: 'admin', is_active: true },
  ]),
});
const rows = await runGet(rowsOptions);
assert(rows.status === 200 && rows.body.data.items.length === 1, 'timeline rows returned');
assert(rows.rpcCalls.length === 1 && rows.rpcCalls[0].name === 'review_event_actor_directory', 'actor directory RPC called');
assert(rows.rpcCalls[0].args.p_purpose === 'TIMELINE', 'actor directory purpose TIMELINE');
const item = rows.body.data.items[0];
assert(item.eventType === 'REVIEW_CREATED' && item.actor.displayName === '管理员', 'DTO event and actor label');
assert(item.details.reviewNo === 'REV-2026-000002' && !('secret' in item.details), 'DTO details whitelisted');
assert(!('actor_profile_id' in item) && !('profile_id' in item) && !('version' in item) && !('payload' in item), 'DTO excludes raw ids/version/payload');

const pageKeys = new Set<string>();
collectKeys(rows.body, pageKeys);
for (const forbidden of ['org_id', 'review_id', 'actor_profile_id', 'profile_id', 'member_id', 'owner_id', 'pmo_id', 'user_id', 'email', 'token']) {
  assert(!pageKeys.has(forbidden), 'response excludes forbidden key: ' + forbidden);
}

const hasMoreOptions = baseOptions({
  timeline: { data: [...timelineRows, { ...timelineRows[0], id: 'event-2', event_type: 'REVIEW_UPDATED' }], error: null },
  rpcResult: actorOk([]),
});
const hasMore = await runGet(hasMoreOptions, { query: 'limit=1' });
assert(hasMore.status === 200 && hasMore.body.data.items.length === 1, 'limit limits returned items');
assert(hasMore.body.data.pageInfo.hasMore === true && hasMore.body.data.pageInfo.nextOffset === 1, 'hasMore and nextOffset computed');

const timelineDbError = await runGet(baseOptions({
  timeline: { data: null, error: { message: 'RAW TIMELINE DB', details: 'RAW DETAILS' } },
}));
assert(timelineDbError.status === 500 && timelineDbError.body.error === '项目动态加载失败，请稍后重试。', 'timeline db error generic 500');
assert(!JSON.stringify(timelineDbError.body).includes('RAW TIMELINE DB'), 'timeline db raw message not exposed');

const actorTransport = await runGet(baseOptions({
  timeline: { data: timelineRows, error: null },
  rpcResult: { data: null, error: { message: 'RAW ACTOR TRANSPORT' } },
}));
assert(actorTransport.status === 500 && actorTransport.body.error === '项目动态加载失败，请稍后重试。', 'actor transport error generic 500');
assert(!JSON.stringify(actorTransport.body).includes('RAW ACTOR TRANSPORT'), 'actor transport raw message not exposed');

const actorForbidden = await runGet(baseOptions({
  timeline: { data: timelineRows, error: null },
  rpcResult: { data: { ok: false, code: 'FORBIDDEN', message: 'RAW FORBIDDEN', data: null }, error: null },
}));
assert(actorForbidden.status === 403 && actorForbidden.body.error === '未登录或无权限', 'actor FORBIDDEN returns 403');
assert(!JSON.stringify(actorForbidden.body).includes('RAW FORBIDDEN'), 'actor FORBIDDEN raw message not exposed');

const actorNotFound = await runGet(baseOptions({
  timeline: { data: timelineRows, error: null },
  rpcResult: { data: { ok: false, code: 'NOT_FOUND', message: 'RAW NOT FOUND', data: null }, error: null },
}));
assert(actorNotFound.status === 404 && actorNotFound.body.error === '复盘不存在或无权访问', 'actor NOT_FOUND returns 404');
assert(!JSON.stringify(actorNotFound.body).includes('RAW NOT FOUND'), 'actor NOT_FOUND raw message not exposed');

const actorInvalidPurpose = await runGet(baseOptions({
  timeline: { data: timelineRows, error: null },
  rpcResult: { data: { ok: false, code: 'INVALID_PURPOSE', message: 'RAW PURPOSE', data: null }, error: null },
}));
assert(actorInvalidPurpose.status === 500 && actorInvalidPurpose.body.error === '项目动态加载失败，请稍后重试。', 'actor INVALID_PURPOSE returns generic 500');
assert(!JSON.stringify(actorInvalidPurpose.body).includes('RAW PURPOSE'), 'actor INVALID_PURPOSE raw message not exposed');

const actorUnknown = await runGet(baseOptions({
  timeline: { data: timelineRows, error: null },
  rpcResult: { data: { ok: false, code: 'SOMETHING_NEW', message: 'RAW UNKNOWN', data: null }, error: null },
}));
assert(actorUnknown.status === 500 && actorUnknown.body.error === '项目动态加载失败，请稍后重试。', 'actor unknown business code returns generic 500');
assert(!JSON.stringify(actorUnknown.body).includes('RAW UNKNOWN'), 'actor unknown raw message not exposed');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
