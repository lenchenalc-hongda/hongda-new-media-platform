// ===== Review Center Action Read API Route Tests =====
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

const { GET } = await import('../../src/app/api/review-center/reviews/[id]/actions/route');

const REVIEW_ID = '00000000-0000-0000-0000-000000000001';
const ORG_ID = '00000000-0000-0000-0000-000000000002';
const PROFILE_ID = '00000000-0000-0000-0000-000000000006';
const OWNER_ID = '00000000-0000-0000-0000-000000000007';
const CREATED_BY_ID = '00000000-0000-0000-0000-000000000008';
const VERIFIER_ID = '00000000-0000-0000-0000-000000000009';
const ACTION_ID = '00000000-0000-0000-0000-000000000010';

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

function request(role = 'admin', authenticated = true): NextRequest {
  return new NextRequest('http://localhost/api/review-center/reviews/' + REVIEW_ID + '/actions', {
    headers: authenticated ? {
      cookie: 'nmc_user=' + encodeURIComponent(JSON.stringify({
        id: 'u_' + role,
        full_name: role,
        email: role + '@hongda.com',
        role,
        org_id: 'org_001',
        department: null,
      })),
    } : {},
  });
}

function validParticipant(id: string, displayName: string, active = true) {
  return {
    profile_id: id,
    display_name: displayName,
    role: 'admin',
    department: null,
    is_active: active,
  };
}

function validActionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ACTION_ID,
    review_id: REVIEW_ID,
    sequence: 1,
    title: 'QA ACTION',
    description: 'full description',
    action_type: 'CORRECTIVE',
    status: 'OPEN',
    due_date: '2026-08-26',
    owner_profile_id: OWNER_ID,
    created_by_profile_id: CREATED_BY_ID,
    completion_note: null,
    verification_note: null,
    verified_by_profile_id: null,
    completed_at: null,
    verified_at: null,
    cancelled_at: null,
    cancel_reason: null,
    version: 1,
    created_at: '2026-08-25T00:00:00Z',
    updated_at: '2026-08-25T00:00:00Z',
    ...overrides,
  };
}

function participantOk(items: any[] = []): any {
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

function makeClient(options: {
  profile: any;
  review: any;
  actions: any;
  rpcResult?: any;
}) {
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const queryCalls: Array<{ op: string; table?: string; cols?: string; key?: string; value?: any; order?: any }> = [];
  const client: any = {
    from: (table: string) => {
      queryCalls.push({ op: 'from', table });
      const builder: any = {
        select: (cols: string) => {
          queryCalls.push({ op: 'select', table, cols });
          return builder;
        },
        eq: (key: string, value: any) => {
          queryCalls.push({ op: 'eq', table, key, value });
          return builder;
        },
        order: (key: string, order: any) => {
          queryCalls.push({ op: 'order', table, key, order });
          return builder;
        },
        maybeSingle: async () => {
          queryCalls.push({ op: 'maybeSingle', table });
          if (table === 'profiles') return options.profile;
          if (table === 'review_cases') return options.review;
          return { data: null, error: null };
        },
        then: (resolve: any) => resolve(options.actions),
      };
      return builder;
    },
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return options.rpcResult ?? participantOk([]);
    },
  };
  return { client, rpcCalls, queryCalls };
}

function baseOptions(overrides: Partial<{
  profile: any;
  review: any;
  actions: any;
  rpcResult: any;
}> = {}) {
  return {
    profile: { data: { id: PROFILE_ID, org_id: ORG_ID }, error: null },
    review: { data: { id: REVIEW_ID }, error: null },
    actions: { data: [], error: null },
    rpcResult: participantOk([]),
    ...overrides,
  };
}

async function runGet(options: any, role = 'admin', authenticated = true, id = REVIEW_ID) {
  const holder = makeClient(options);
  (globalThis as any).__reviewCenterFakeSupabaseClient = holder.client;
  const response = await GET(request(role, authenticated), { params: { id } });
  const body: any = await response.json();
  return { status: response.status, body, rpcCalls: holder.rpcCalls, queryCalls: holder.queryCalls };
}

console.log('\n=== Review Center Action Read API Route ===');

const unauth = await runGet(baseOptions(), 'admin', false);
assert(unauth.status === 401 && unauth.body.error === '未登录或无权限', 'unauthenticated 401');

const invalidUuid = await runGet(baseOptions(), 'admin', true, 'not-a-uuid');
assert(invalidUuid.status === 400 && invalidUuid.body.error === '请求参数无效', 'invalid UUID 400');

const noProfile = await runGet(baseOptions({ profile: { data: null, error: null } }));
assert(noProfile.status === 403 && noProfile.body.error === '无有效档案', 'missing profile 403');

const missingReview = await runGet(baseOptions({ review: { data: null, error: null } }));
assert(missingReview.status === 404 && missingReview.body.error === '复盘不存在或无权访问', 'missing review 404');
assert(!missingReview.queryCalls.some(c => c.table === 'review_actions'), 'review_actions query skipped when review missing');

const reviewError = await runGet(baseOptions({ review: { data: null, error: { message: 'RAW REVIEW ERROR' } } }));
assert(reviewError.status === 500 && reviewError.body.error === '服务异常', 'review db error 500 generic');
assert(!JSON.stringify(reviewError.body).includes('RAW REVIEW ERROR'), 'review raw error not exposed');

const empty = await runGet(baseOptions());
assert(empty.status === 200 && empty.body.ok === true && empty.body.code === 'OK', 'empty actions success envelope');
assert(Array.isArray(empty.body.data.actions) && empty.body.data.actions.length === 0, 'empty actions array');
assert(empty.rpcCalls.length === 0, 'no participant RPC for zero actions');

const rows = [validActionRow()];
const visible = await runGet(baseOptions({
  actions: { data: rows, error: null },
  rpcResult: participantOk([
    validParticipant(OWNER_ID, '负责人'),
    validParticipant(CREATED_BY_ID, '创建人'),
  ]),
}));
assert(visible.status === 200 && visible.body.data.actions.length === 1, 'visible actions returned');
assert(visible.rpcCalls.length === 1 && visible.rpcCalls[0].name === 'review_participant_directory', 'participant RPC called once');
const dto = visible.body.data.actions[0];
assert(dto.owner.profileId === OWNER_ID && dto.owner.displayName === '负责人', 'owner safe profile');
assert(dto.createdBy.profileId === CREATED_BY_ID && dto.createdBy.displayName === '创建人', 'createdBy safe profile');
assert(dto.verifiedBy === null, 'verifiedBy null for OPEN');
assert(!('org_id' in dto) && !('review_id' in dto), 'org_id/review_id excluded');
assert(!('owner_profile_id' in dto) && !('created_by_profile_id' in dto), 'raw profile ids excluded');

const viewer = await runGet(baseOptions({
  actions: { data: rows, error: null },
  rpcResult: participantOk([validParticipant(OWNER_ID, '负责人'), validParticipant(CREATED_BY_ID, '创建人')]),
}), 'viewer');
assert(viewer.status === 200 && viewer.body.data.actions.length === 1, 'viewer read allowed');

const actionError = await runGet(baseOptions({
  actions: { data: null, error: { message: 'RAW ACTION ERROR', details: 'RAW ACTION DETAILS' } },
}));
assert(actionError.status === 500 && actionError.body.error === '服务异常', 'action db error 500 generic');
assert(!JSON.stringify(actionError.body).includes('RAW ACTION ERROR'), 'action raw error not exposed');

const participantForbidden = await runGet(baseOptions({
  actions: { data: rows, error: null },
  rpcResult: { data: { ok: false, code: 'FORBIDDEN', message: 'RAW FORBIDDEN', data: null }, error: null },
}));
assert(participantForbidden.status === 403, 'participant FORBIDDEN 403');
assert(!JSON.stringify(participantForbidden.body).includes('RAW FORBIDDEN'), 'participant FORBIDDEN raw not exposed');

const participantNotFound = await runGet(baseOptions({
  actions: { data: rows, error: null },
  rpcResult: { data: { ok: false, code: 'NOT_FOUND', message: 'RAW NOT FOUND', data: null }, error: null },
}));
assert(participantNotFound.status === 404, 'participant NOT_FOUND 404');
assert(!JSON.stringify(participantNotFound.body).includes('RAW NOT FOUND'), 'participant NOT_FOUND raw not exposed');

const participantTransport = await runGet(baseOptions({
  actions: { data: rows, error: null },
  rpcResult: { data: null, error: { message: 'RAW TRANSPORT', details: 'RAW DETAILS', hint: 'RAW HINT' } },
}));
assert(participantTransport.status === 500 && participantTransport.body.error === '服务异常', 'participant transport 500 generic');
assert(!JSON.stringify(participantTransport.body).includes('RAW TRANSPORT'), 'participant transport raw not exposed');

const malformed = await runGet(baseOptions({
  actions: { data: [validActionRow({ sequence: 0 })], error: null },
  rpcResult: participantOk([validParticipant(OWNER_ID, '负责人'), validParticipant(CREATED_BY_ID, '创建人')]),
}));
assert(malformed.status === 500 && malformed.body.error === '服务异常', 'malformed action row 500 generic');

const orderRun = await runGet(baseOptions({
  actions: { data: rows, error: null },
  rpcResult: participantOk([validParticipant(OWNER_ID, '负责人'), validParticipant(CREATED_BY_ID, '创建人')]),
}));
const actionOrders = orderRun.queryCalls.filter(c => c.table === 'review_actions' && c.op === 'order');
assert(actionOrders.length === 2 && actionOrders[0].key === 'sequence' && actionOrders[1].key === 'id', 'sequence ASC then id ASC ordering');
const actionSelect = orderRun.queryCalls.find(c => c.table === 'review_actions' && c.op === 'select');
const actionSelectCols = actionSelect && typeof actionSelect.cols === 'string' ? actionSelect.cols : '';
assert(!!actionSelect && actionSelectCols !== '*' && actionSelectCols.includes('id') && actionSelectCols.includes('owner_profile_id'), 'explicit action select, no select star');
const fromTables = orderRun.queryCalls.filter(c => c.op === 'from').map(c => c.table);
assert(fromTables.indexOf('review_cases') < fromTables.indexOf('review_actions'), 'review visibility precheck before actions query');

const markerRows = [validActionRow({
  org_id: 'SECRET_ORG_MARKER',
  review_id: 'SECRET_REVIEW_MARKER',
  email: 'SECRET_EMAIL_MARKER',
  user_id: 'SECRET_USER_MARKER',
  token: 'SECRET_TOKEN_MARKER',
})];
const markerRun = await runGet(baseOptions({
  actions: { data: markerRows, error: null },
  rpcResult: participantOk([validParticipant(OWNER_ID, '负责人'), validParticipant(CREATED_BY_ID, '创建人')]),
}));
const markerText = JSON.stringify(markerRun.body);
assert(!markerText.includes('SECRET_ORG_MARKER'), 'org marker excluded');
assert(!markerText.includes('SECRET_REVIEW_MARKER'), 'review marker excluded');
assert(!markerText.includes('SECRET_EMAIL_MARKER'), 'email marker excluded');
assert(!markerText.includes('SECRET_USER_MARKER'), 'user marker excluded');
assert(!markerText.includes('SECRET_TOKEN_MARKER'), 'token marker excluded');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
