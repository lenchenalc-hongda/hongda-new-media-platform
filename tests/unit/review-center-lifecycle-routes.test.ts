// ===== Review Center Lifecycle Status Command API Route Tests =====
import { register } from 'node:module';
import fs from 'node:fs';
import { NextRequest } from 'next/server';

const loader = `
export async function load(url, context, nextLoad) {
  if (url.endsWith('/src/lib/supabase/server.ts')) {
    return {
      format: 'module',
      source: 'export async function createClient() { return globalThis.__lifecycleFakeSupabaseClient || null; }',
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
`;
await register('data:text/javascript,' + encodeURIComponent(loader), import.meta.url);

process.env.AUTH_MODE = 'mock';

const { POST: submitPost } = await import('../../src/app/api/review-center/reviews/[id]/submit/route');
const { POST: closePost } = await import('../../src/app/api/review-center/reviews/[id]/close/route');
const { POST: reopenPost } = await import('../../src/app/api/review-center/reviews/[id]/reopen/route');

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

function makeRequest(path: string, body?: unknown, authenticated = true): NextRequest {
  const headers = new Headers();
  if (authenticated) {
    headers.set('cookie', 'nmc_user=' + encodeURIComponent(JSON.stringify({
      id: 'u_admin',
      full_name: '管理员',
      email: 'admin@hongda.com',
      role: 'admin',
      org_id: 'org_001',
      department: '管理部',
    })));
  }
  const init: any = { method: 'POST', headers };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    headers.set('content-type', 'application/json');
  }
  return new NextRequest('http://localhost' + path, init);
}

function makeClient(rpcResult: any) {
  const calls: Array<{ name: string; args: any }> = [];
  const client: any = {
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      return rpcResult;
    },
  };
  return { client, calls };
}

function success(data: any = {
  status: 'submitted',
  version: 2,
  submitted_at: '2026-08-25T00:00:00Z',
  closed_at: null,
}): any {
  return {
    data: { ok: true, code: 'OK', message: 'success', data },
    error: null,
  };
}

function business(code: string, message = 'RAW BUSINESS MESSAGE', data: any = null): any {
  return {
    data: { ok: false, code, message, data },
    error: null,
  };
}

async function run(
  handler: any,
  path: string,
  body: unknown,
  options: { authenticated?: boolean; id?: string; client?: any } = {},
) {
  const holder = makeClient(options.client ?? success());
  (globalThis as any).__lifecycleFakeSupabaseClient = holder.client;
  const id = options.id ?? REVIEW_ID;
  const req = makeRequest(path.replace('[ID]', id), body, options.authenticated ?? true);
  const response = await handler(req, { params: { id } });
  const json = await response.json();
  return { status: response.status, body: json, calls: holder.calls };
}

function collectKeys(value: any, keys: Set<string>) {
  if (value === null || typeof value !== 'object') return;
  for (const key of Object.keys(value)) keys.add(key);
  for (const child of Object.values(value)) collectKeys(child, keys);
}

const routes = [
  ['submit', submitPost, '/api/review-center/reviews/[ID]/submit'],
  ['close', closePost, '/api/review-center/reviews/[ID]/close'],
  ['reopen', reopenPost, '/api/review-center/reviews/[ID]/reopen'],
] as const;

console.log('\n=== Review Center Lifecycle Status API Routes ===');

// Static source check: routes must not duplicate DB/status rules.
const sourceFiles = [
  'src/app/api/review-center/reviews/[id]/submit/route.ts',
  'src/app/api/review-center/reviews/[id]/close/route.ts',
  'src/app/api/review-center/reviews/[id]/reopen/route.ts',
  'src/lib/review-center/lifecycle-api.ts',
];
let staticRuleOk = true;
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const forbidden of ['.from(', '.update(', '.insert(', 'owner_id =', 'pmo_id =', "role === 'admin'", "role === 'viewer'"]) {
    if (source.includes(forbidden)) staticRuleOk = false;
  }
}
assert(staticRuleOk, 'no API database rule duplication');

// Unauthenticated
for (const [label, handler, path] of routes) {
  const res = await run(handler, path, { expectedVersion: 1 }, { authenticated: false });
  assert(res.status === 401 && res.calls.length === 0, label + ' unauth 401 no rpc');
}

// Invalid UUID
for (const [label, handler, path] of routes) {
  const res = await run(handler, path, { expectedVersion: 1 }, { id: 'not-a-uuid' });
  assert(res.status === 400 && res.calls.length === 0, label + ' invalid uuid 400 no rpc');
}

// Malformed JSON
for (const [label, handler, path] of routes) {
  const res = await run(handler, path, '{bad json', {});
  assert(res.status === 400 && res.calls.length === 0, label + ' malformed json 400 no rpc');
}

// Submit/Close body validation
for (const [label, handler, path] of [routes[0], routes[1]] as const) {
  for (const bad of [undefined, {}, { expectedVersion: 0 }, { expectedVersion: -1 }, { expectedVersion: 1.5 }, { expectedVersion: '2' }, { expectedVersion: null }, { expectedVersion: 1, status: 'draft' }]) {
    const res = await run(handler, path, bad, {});
    assert(res.status === 400 && res.calls.length === 0, label + ' invalid body 400: ' + JSON.stringify(bad));
  }
}

// Reopen body validation
for (const bad of [
  undefined,
  {},
  { expectedVersion: 0 },
  { expectedVersion: -1 },
  { expectedVersion: 1.5 },
  { expectedVersion: '2' },
  { expectedVersion: null },
  { expectedVersion: 1, reason: 123 },
  { expectedVersion: 1, reason: {} },
  { expectedVersion: 1, reason: [] },
  { expectedVersion: 1, reason: true },
  { expectedVersion: 1, reason: 'x'.repeat(1001) },
  { expectedVersion: 1, status: 'draft' },
]) {
  const res = await run(reopenPost, routes[2][2], bad, {});
  const preview = JSON.stringify(bad === undefined ? 'undefined' : bad) ?? '';
  assert(res.status === 400 && res.calls.length === 0, 'reopen invalid body 400: ' + preview.slice(0, 80));
}

// Reopen whitespace reason passed to RPC
const wsRun = await run(reopenPost, routes[2][2], { expectedVersion: 1, reason: '   ' }, {});
assert(wsRun.status === 200, 'reopen whitespace reason reaches RPC');
assert(wsRun.calls.length === 1 && wsRun.calls[0].name === 'review_reopen' && wsRun.calls[0].args.p_reason === '   ', 'reopen whitespace reason passed as-is');

// RPC argument mapping and success DTO
const submitSuccess = await run(submitPost, routes[0][2], { expectedVersion: 2 }, { client: success({ status: 'submitted', version: 2, submitted_at: '2026-08-25T00:00:00Z', closed_at: null, org_id: 'o', owner_id: 'ow', pmo_id: 'p', submitted_by_profile_id: 'a', closed_by_profile_id: 'c', email: 'e', secret: 's', token: 't' }) });
assert(submitSuccess.status === 200 && submitSuccess.calls.length === 1, 'submit success 200');
assert(submitSuccess.calls[0].name === 'review_submit', 'submit rpc name');
assert(submitSuccess.calls[0].args.p_review_id === REVIEW_ID && submitSuccess.calls[0].args.p_expected_version === 2, 'submit rpc args');
assert(JSON.stringify(Object.keys(submitSuccess.body.data).sort()) === '["closedAt","status","submittedAt","version"]', 'submit success DTO whitelist');

const closeSuccess = await run(closePost, routes[1][2], { expectedVersion: 3 }, { client: success({ status: 'closed', version: 3, submitted_at: '2026-08-25T00:00:00Z', closed_at: '2026-08-25T01:00:00Z' }) });
assert(closeSuccess.status === 200 && closeSuccess.calls[0].name === 'review_close', 'close success rpc');
assert(closeSuccess.calls[0].args.p_review_id === REVIEW_ID && closeSuccess.calls[0].args.p_expected_version === 3, 'close rpc args');
assert(closeSuccess.body.data.closedAt === '2026-08-25T01:00:00Z', 'close DTO closedAt');

const reopenSuccess = await run(reopenPost, routes[2][2], { expectedVersion: 4, reason: 'QA reason' }, { client: success({ status: 'draft', version: 4, submitted_at: null, closed_at: null }) });
assert(reopenSuccess.status === 200 && reopenSuccess.calls[0].name === 'review_reopen', 'reopen success rpc');
assert(reopenSuccess.calls[0].args.p_reason === 'QA reason', 'reopen reason passed');
assert(reopenSuccess.body.data.status === 'draft' && reopenSuccess.body.data.version === 4, 'reopen DTO');

// No-op success
const noop = await run(submitPost, routes[0][2], { expectedVersion: 5 }, { client: success({ status: 'submitted', version: 5, submitted_at: '2026-08-25T00:00:00Z', closed_at: null }) });
assert(noop.status === 200 && noop.body.data.version === 5, 'no-op success 200');

// Business error mapping per command
for (const [label, handler, path] of routes) {
  const forbidden = await run(handler, path, { expectedVersion: 1 }, { client: business('FORBIDDEN', 'RAW FORBIDDEN') });
  assert(forbidden.status === 403 && !JSON.stringify(forbidden.body).includes('RAW FORBIDDEN'), label + ' FORBIDDEN 403');

  const notFound = await run(handler, path, { expectedVersion: 1 }, { client: business('NOT_FOUND') });
  assert(notFound.status === 404 && notFound.body.message === '复盘不存在或无权访问', label + ' NOT_FOUND 404');

  const conflict = await run(handler, path, { expectedVersion: 1 }, { client: business('VERSION_CONFLICT') });
  assert(conflict.status === 409 && conflict.body.message === '复盘已被其他操作更新，请刷新后重试', label + ' VERSION_CONFLICT 409');

  const invalidTransition = await run(handler, path, { expectedVersion: 1 }, { client: business('INVALID_TRANSITION') });
  assert(invalidTransition.status === 409 && invalidTransition.body.message === '当前复盘状态不允许执行此操作', label + ' INVALID_TRANSITION 409');
}

// Command-aware incomplete/invalid reason
const incompleteSubmit = await run(submitPost, routes[0][2], { expectedVersion: 1 }, { client: business('INCOMPLETE_REVIEW', 'RAW INCOMPLETE', { missing_fields: ['description', 'type_details', 'unknown_secret'] }) });
assert(incompleteSubmit.status === 422 && JSON.stringify(incompleteSubmit.body.data.missingFields) === '["description","type_details"]', 'submit INCOMPLETE_REVIEW 422 whitelist');
assert(!JSON.stringify(incompleteSubmit.body).includes('RAW INCOMPLETE'), 'submit incomplete raw hidden');

const closeIncomplete = await run(closePost, routes[1][2], { expectedVersion: 1 }, { client: business('INCOMPLETE_REVIEW') });
assert(closeIncomplete.status === 500, 'close INCOMPLETE_REVIEW 500');
const reopenIncomplete = await run(reopenPost, routes[2][2], { expectedVersion: 1 }, { client: business('INCOMPLETE_REVIEW') });
assert(reopenIncomplete.status === 500, 'reopen INCOMPLETE_REVIEW 500');

const reopenReason = await run(reopenPost, routes[2][2], { expectedVersion: 1 }, { client: business('INVALID_REASON', 'RAW REASON') });
assert(reopenReason.status === 422 && !JSON.stringify(reopenReason.body).includes('RAW REASON'), 'reopen INVALID_REASON 422');
const submitReason = await run(submitPost, routes[0][2], { expectedVersion: 1 }, { client: business('INVALID_REASON') });
assert(submitReason.status === 500, 'submit INVALID_REASON 500');
const closeReason = await run(closePost, routes[1][2], { expectedVersion: 1 }, { client: business('INVALID_REASON') });
assert(closeReason.status === 500, 'close INVALID_REASON 500');

// Unknown code and transport
const unknown = await run(submitPost, routes[0][2], { expectedVersion: 1 }, { client: business('FUTURE_INTERNAL_CODE', 'RAW FUTURE') });
assert(unknown.status === 500 && unknown.body.code === 'INTERNAL_ERROR', 'unknown code 500 generic');
assert(!JSON.stringify(unknown.body).includes('FUTURE_INTERNAL_CODE'), 'unknown code not exposed');
assert(!JSON.stringify(unknown.body).includes('RAW FUTURE'), 'unknown raw hidden');

const transportErr = await run(closePost, routes[1][2], { expectedVersion: 1 }, { client: { data: null, error: { code: 'PGRST301', message: 'RAW TRANSPORT', details: 'RAW DETAILS', hint: 'RAW HINT' } } });
assert(transportErr.status === 500 && transportErr.body.code === 'INTERNAL_ERROR', 'transport 500 generic');
assert(!JSON.stringify(transportErr.body).includes('RAW TRANSPORT'), 'transport raw hidden');
assert(!JSON.stringify(transportErr.body).includes('RAW DETAILS'), 'transport details hidden');
assert(!JSON.stringify(transportErr.body).includes('RAW HINT'), 'transport hint hidden');

// Malformed success
for (const badData of [null, { status: 'submitted', version: '2', submitted_at: null, closed_at: null }, { status: 'submitted', version: 2, submitted_at: {}, closed_at: null }, { status: 'submitted', version: 2, submitted_at: null, closed_at: 3 }]) {
  const res = await run(submitPost, routes[0][2], { expectedVersion: 1 }, { client: success(badData) });
  assert(res.status === 500 && res.body.code === 'INTERNAL_ERROR', 'malformed success 500');
}

// Response privacy
const privacyKeys = new Set<string>();
collectKeys(submitSuccess.body, privacyKeys);
collectKeys(closeSuccess.body, privacyKeys);
collectKeys(reopenSuccess.body, privacyKeys);
for (const forbidden of ['org_id', 'review_id', 'profile_id', 'actor_profile_id', 'owner_id', 'pmo_id', 'submitted_by_profile_id', 'closed_by_profile_id', 'user_id', 'email', 'token', 'secret']) {
  assert(!privacyKeys.has(forbidden), 'response excludes forbidden key: ' + forbidden);
}

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
