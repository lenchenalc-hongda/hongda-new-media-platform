// ===== Review Center Action Command Route Tests =====
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

const createRoute = await import('../../src/app/api/review-center/reviews/[id]/actions/route');
const updateRoute = await import('../../src/app/api/review-center/reviews/[id]/actions/[actionId]/route');
const startRoute = await import('../../src/app/api/review-center/reviews/[id]/actions/[actionId]/start/route');
const submitRoute = await import('../../src/app/api/review-center/reviews/[id]/actions/[actionId]/submit-for-verification/route');
const verifyRoute = await import('../../src/app/api/review-center/reviews/[id]/actions/[actionId]/verify/route');
const returnRoute = await import('../../src/app/api/review-center/reviews/[id]/actions/[actionId]/return/route');
const cancelRoute = await import('../../src/app/api/review-center/reviews/[id]/actions/[actionId]/cancel/route');

const REVIEW_ID = '00000000-0000-0000-0000-000000000001';
const ACTION_ID = '00000000-0000-0000-0000-000000000002';
const OWNER_ID = '00000000-0000-0000-0000-000000000003';

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

function request(
  path: string,
  method: string,
  body?: unknown,
  authenticated = true,
  rawBody?: string,
): NextRequest {
  const headers: Record<string, string> = {};
  if (authenticated) {
    headers.cookie = 'nmc_user=' + encodeURIComponent(JSON.stringify({
      id: 'u_admin',
      full_name: '管理员',
      email: 'admin@hongda.com',
      role: 'admin',
      org_id: 'org_001',
      department: null,
    }));
  }
  return new NextRequest('http://localhost' + path, {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : (body === undefined ? undefined : JSON.stringify(body)),
  });
}

function okResult(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      ok: true,
      code: 'OK',
      message: 'success',
      data: {
        id: ACTION_ID,
        review_id: REVIEW_ID,
        sequence: 1,
        status: 'OPEN',
        version: 1,
        updated_at: '2026-08-25T00:00:00Z',
        completed_at: null,
        verified_at: null,
        cancelled_at: null,
        ...overrides,
      },
    },
    error: null,
  };
}

function makeClient(result: any) {
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const fromCalls: string[] = [];
  const client: any = {
    from: (table: string) => {
      fromCalls.push(table);
      throw new Error('unexpected from call: ' + table);
    },
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return result;
    },
  };
  return { client, rpcCalls, fromCalls };
}

async function run(routeModule: any, method: string, path: string, body?: unknown, result?: any, rawBody?: string, authenticated = true) {
  const holder = makeClient(result ?? okResult());
  (globalThis as any).__reviewCenterFakeSupabaseClient = holder.client;
  const req = request(path, method, body, authenticated, rawBody);
  const idFromPath = path.split('/reviews/')[1]?.split('/')[0] ?? REVIEW_ID;
  const actionFromPath = path.split('/actions/')[1]?.split('/')[0];
  const params = actionFromPath
    ? { id: idFromPath, actionId: actionFromPath }
    : { id: idFromPath };
  let response;
  if (method === 'POST') response = await routeModule.POST(req, { params });
  else response = await routeModule.PATCH(req, { params });
  const json: any = await response.json();
  return { status: response.status, body: json, rpcCalls: holder.rpcCalls, fromCalls: holder.fromCalls };
}

console.log('\n=== Review Center Action Command Routes ===');

const createBody = {
  title: 'QA ACTION',
  actionType: 'CORRECTIVE',
  ownerProfileId: OWNER_ID,
  dueDate: '2026-08-26',
};
const create = await run(createRoute, 'POST', '/api/review-center/reviews/' + REVIEW_ID + '/actions', createBody);
assert(create.status === 201 && create.body.data.action.id === ACTION_ID, 'create 201');
assert(create.rpcCalls.length === 1 && create.rpcCalls[0].name === 'review_action_create', 'create RPC binding');
assert(create.rpcCalls[0].args.p_review_id === REVIEW_ID && create.rpcCalls[0].args.p_owner_profile_id === OWNER_ID, 'create RPC args');
assert(create.fromCalls.length === 0, 'create no pre-read');

const updateBody = {
  expectedVersion: 1,
  title: 'QA UPDATED',
  description: 'updated',
  actionType: 'CORRECTIVE',
  ownerProfileId: OWNER_ID,
  dueDate: '2026-08-26',
};
const update = await run(updateRoute, 'PATCH', '/api/review-center/reviews/' + REVIEW_ID + '/actions/' + ACTION_ID, updateBody);
assert(update.status === 200, 'update 200');
assert(update.rpcCalls[0].name === 'review_action_update', 'update RPC binding');
assert(update.rpcCalls[0].args.p_action_id === ACTION_ID && update.rpcCalls[0].args.p_expected_version === 1, 'update RPC args');
assert(update.fromCalls.length === 0, 'update no pre-read');

const start = await run(startRoute, 'POST', '/api/review-center/reviews/' + REVIEW_ID + '/actions/' + ACTION_ID + '/start', { expectedVersion: 1 });
assert(start.status === 200 && start.rpcCalls[0].name === 'review_action_start', 'start RPC binding');
assert(start.rpcCalls[0].args.p_action_id === ACTION_ID && start.rpcCalls[0].args.p_expected_version === 1, 'start RPC args');
assert(start.fromCalls.length === 0, 'start no pre-read');

const submit = await run(submitRoute, 'POST', '/api/review-center/reviews/' + REVIEW_ID + '/actions/' + ACTION_ID + '/submit-for-verification', { expectedVersion: 1, completionNote: 'done' });
assert(submit.status === 200 && submit.rpcCalls[0].name === 'review_action_submit_for_verification', 'submit RPC binding');
assert(submit.rpcCalls[0].args.p_completion_note === 'done', 'submit RPC args');
assert(submit.fromCalls.length === 0, 'submit no pre-read');

const verify = await run(verifyRoute, 'POST', '/api/review-center/reviews/' + REVIEW_ID + '/actions/' + ACTION_ID + '/verify', { expectedVersion: 1 });
assert(verify.status === 200 && verify.rpcCalls[0].name === 'review_action_verify', 'verify RPC binding');
assert(verify.rpcCalls[0].args.p_verification_note === null, 'verify RPC args');
assert(verify.fromCalls.length === 0, 'verify no pre-read');

const ret = await run(returnRoute, 'POST', '/api/review-center/reviews/' + REVIEW_ID + '/actions/' + ACTION_ID + '/return', { expectedVersion: 1, reason: 'why' });
assert(ret.status === 200 && ret.rpcCalls[0].name === 'review_action_return', 'return RPC binding');
assert(ret.rpcCalls[0].args.p_reason === 'why', 'return RPC args');
assert(ret.fromCalls.length === 0, 'return no pre-read');

const cancel = await run(cancelRoute, 'POST', '/api/review-center/reviews/' + REVIEW_ID + '/actions/' + ACTION_ID + '/cancel', { expectedVersion: 1, reason: 'why' });
assert(cancel.status === 200 && cancel.rpcCalls[0].name === 'review_action_cancel', 'cancel RPC binding');
assert(cancel.rpcCalls[0].args.p_reason === 'why', 'cancel RPC args');
assert(cancel.fromCalls.length === 0, 'cancel no pre-read');

const unauth = await run(createRoute, 'POST', '/api/review-center/reviews/' + REVIEW_ID + '/actions', createBody, undefined, undefined, false);
assert(unauth.status === 401 && unauth.rpcCalls.length === 0, 'create unauth 401 no RPC');

const invalidReview = await run(createRoute, 'POST', '/api/review-center/reviews/not-a-uuid/actions', createBody);
assert(invalidReview.status === 400 && invalidReview.rpcCalls.length === 0, 'invalid review uuid 400 no RPC');

const invalidAction = await run(startRoute, 'POST', '/api/review-center/reviews/' + REVIEW_ID + '/actions/not-a-uuid/start', { expectedVersion: 1 });
assert(invalidAction.status === 400 && invalidAction.rpcCalls.length === 0, 'invalid action uuid 400 no RPC');

const malformedJson = await run(createRoute, 'POST', '/api/review-center/reviews/' + REVIEW_ID + '/actions', undefined, undefined, 'not-json');
assert(malformedJson.status === 400 && malformedJson.rpcCalls.length === 0, 'malformed JSON 400 no RPC');

const unknownField = await run(createRoute, 'POST', '/api/review-center/reviews/' + REVIEW_ID + '/actions', { ...createBody, status: 'VERIFIED' });
assert(unknownField.status === 400 && unknownField.rpcCalls.length === 0, 'unknown body field 400 no RPC');

const badExpected = await run(startRoute, 'POST', '/api/review-center/reviews/' + REVIEW_ID + '/actions/' + ACTION_ID + '/start', { expectedVersion: 0 });
assert(badExpected.status === 400 && badExpected.rpcCalls.length === 0, 'expectedVersion 0 400 no RPC');

const mismatch = await run(updateRoute, 'PATCH', '/api/review-center/reviews/' + REVIEW_ID + '/actions/' + ACTION_ID, updateBody, okResult({ id: '00000000-0000-0000-0000-000000000099' }));
assert(mismatch.status === 500 && mismatch.body.code === 'INTERNAL_ERROR', 'action identity mismatch 500');

const unknownCode = await run(createRoute, 'POST', '/api/review-center/reviews/' + REVIEW_ID + '/actions', createBody, {
  data: { ok: false, code: 'SOME_FUTURE_SECRET_CODE', message: 'RAW SECRET', data: null },
  error: null,
});
assert(unknownCode.status === 500 && unknownCode.body.code === 'INTERNAL_ERROR', 'unknown RPC code 500 generic');
assert(!JSON.stringify(unknownCode.body).includes('SOME_FUTURE_SECRET_CODE'), 'unknown code not leaked');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
