// ===== Review Center Metadata PATCH Route RPC Contract Tests =====
import { register } from 'node:module';
import { NextRequest } from 'next/server';
import { buildMetadataRpcPayload } from '../../src/lib/review-center/mutation';

const loader = `
export async function load(url, context, nextLoad) {
  if (url.endsWith('/src/lib/supabase/server.ts')) {
    return {
      format: 'module',
      source: 'export async function createClient() { return globalThis.__metadataFakeSupabaseClient || null; }',
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
`;
await register('data:text/javascript,' + encodeURIComponent(loader), import.meta.url);

process.env.AUTH_MODE = 'mock';

const { PATCH } = await import('../../src/app/api/review-center/reviews/[id]/metadata/route');

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

function makeRequest(method: string, path: string, body?: unknown, authenticated = true): NextRequest {
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
  const init: any = { method, headers };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    headers.set('content-type', 'application/json');
  }
  return new NextRequest('http://localhost' + path, init);
}

function success(data: any = { newVersion: 8 }): any {
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

function makeFakeClient(rpcResult: any) {
  const calls: Array<{ name: string; args: any }> = [];
  const client: any = {
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      return rpcResult;
    },
    from(table: string) {
      const builder: any = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.in = () => builder;
      builder.maybeSingle = async () => {
        if (table === 'profiles') {
          return { data: { id: 'p_admin', org_id: 'org_001' }, error: null };
        }
        if (table === 'review_metadata') {
          return { data: null, error: null };
        }
        return { data: [], error: null };
      };
      return builder;
    },
  };
  return { client, calls };
}

async function run(
  body: unknown,
  options: { authenticated?: boolean; id?: string; rpcResult?: any } = {},
) {
  const holder = makeFakeClient(options.rpcResult ?? success());
  (globalThis as any).__metadataFakeSupabaseClient = holder.client;
  const id = options.id ?? REVIEW_ID;
  const req = makeRequest(
    'PATCH',
    '/api/review-center/reviews/[ID]/metadata'.replace('[ID]', id),
    body,
    options.authenticated ?? true,
  );
  const response = await PATCH(req, { params: { id } });
  const json = await response.json();
  return { status: response.status, body: json, calls: holder.calls };
}

function validBody() {
  return {
    expectedVersion: 7,
    materials: [
      { code: 'PP', isPrimary: true },
      { code: 'METAL', isPrimary: false },
    ],
    processes: ['HEAT_TRANSFER'],
    problemDomains: ['CUSTOMER_REQUIREMENT'],
    problemSymptoms: ['TRANSFER_INCOMPLETE'],
    other: {
      materialOtherText: null,
      processOtherText: null,
      problemDomainOtherText: null,
      problemSymptomOtherText: null,
    },
  };
}

console.log('\n=== Review Center Metadata PATCH Route RPC Contract ===');

// Unauth / invalid id
const unauth = await run(validBody(), { authenticated: false });
assert(unauth.status === 401 && unauth.calls.length === 0, 'unauth 401 no rpc');
const invalidId = await run(validBody(), { id: 'not-a-uuid' });
assert(invalidId.status === 404 && invalidId.calls.length === 0, 'invalid uuid 404 no rpc');

// Valid body must pass expectedVersion as its own RPC arg and keep p_metadata clean.
const ok = await run(validBody());
assert(ok.status === 200 && ok.calls.length === 1, 'valid body 200 one rpc');
assert(ok.calls[0].name === 'review_upsert_metadata', 'rpc name review_upsert_metadata');
assert(ok.calls[0].args.p_review_id === REVIEW_ID, 'p_review_id passed');
assert(ok.calls[0].args.p_expected_version === 7, 'p_expected_version equals request expectedVersion');
const meta = ok.calls[0].args.p_metadata;
assert(!!meta && typeof meta === 'object' && !Array.isArray(meta), 'p_metadata object');
assert(!('expectedVersion' in meta), 'expectedVersion excluded from p_metadata');
const allowedKeys = ['materials', 'other', 'problemDomains', 'problemSymptoms', 'processes'];
assert(JSON.stringify(Object.keys(meta).sort()) === JSON.stringify(allowedKeys.sort()), 'p_metadata only allowed keys');
for (const forbidden of ['reviewId', 'orgId', 'profileId', 'role', 'status', 'dict_item_id', 'dict_id']) {
  assert(!(forbidden in meta), 'p_metadata excludes ' + forbidden);
}
assert(meta.materials.length === 2 && meta.materials[0].code === 'PP' && meta.materials[0].isPrimary === true, 'primary material explicit true');
assert(meta.materials[1].code === 'METAL' && meta.materials[1].isPrimary === false, 'secondary material explicit false');
assert(meta.processes[0] === 'HEAT_TRANSFER', 'process passed');
assert(meta.problemDomains[0] === 'CUSTOMER_REQUIREMENT', 'domain passed');
assert(meta.problemSymptoms[0] === 'TRANSFER_INCOMPLETE', 'symptom passed');
assert(meta.reason === undefined, 'reason omitted when absent');

// Reason must pass through when present.
const withReason = await run({ ...validBody(), expectedVersion: 8, reason: 'fix reason' });
assert(withReason.status === 200 && withReason.calls[0].args.p_expected_version === 8, 'reason body expectedVersion');
assert(withReason.calls[0].args.p_metadata.reason === 'fix reason', 'reason passed to p_metadata');
assert(!('expectedVersion' in withReason.calls[0].args.p_metadata), 'reason body still excludes expectedVersion');

// Unknown API body key rejected before RPC.
const unknownKey = await run({ ...validBody(), orgId: 'x' });
assert(unknownKey.status === 400 && unknownKey.calls.length === 0, 'unknown root key rejected 400');

// isPrimary remains required boolean.
const missingPrimary = await run({ ...validBody(), materials: [{ code: 'PP' }] });
assert(missingPrimary.status === 400 && missingPrimary.calls.length === 0, 'missing isPrimary rejected 400');
const stringPrimary = await run({ ...validBody(), materials: [{ code: 'PP', isPrimary: 'true' }] });
assert(stringPrimary.status === 400 && stringPrimary.calls.length === 0, 'string isPrimary rejected 400');

// INVALID_METADATA mapping stays safe.
const invalidMeta = await run(validBody(), { rpcResult: business('INVALID_METADATA', 'metadata 包含不允许的字段') });
assert(invalidMeta.status === 400 && invalidMeta.body.code === 'INVALID_METADATA', 'INVALID_METADATA maps 400');
assert(invalidMeta.body.message === 'metadata 包含不允许的字段', 'INVALID_METADATA safe message preserved');
assert(!JSON.stringify(invalidMeta.body).includes('RAW'), 'INVALID_METADATA raw message hidden');

// Transport DB error stays generic.
const transport = await run(validBody(), {
  rpcResult: { data: null, error: { code: 'PGRST301', message: 'RAW TRANSPORT', details: 'RAW DETAILS', hint: 'RAW HINT' } },
});
assert(transport.status === 500 && transport.body.code === 'INTERNAL', 'transport error maps 500 generic');
assert(!JSON.stringify(transport.body).includes('RAW'), 'transport raw details hidden');

// Helper-level contract.
const helperPayload = buildMetadataRpcPayload(validBody() as any);
assert(!('expectedVersion' in helperPayload), 'helper excludes expectedVersion');
const helperReason = buildMetadataRpcPayload({ ...(validBody() as any), reason: 'ok' });
assert(helperReason.reason === 'ok', 'helper includes reason when present');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
