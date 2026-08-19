// ===== Review Center Detail Route Participant Failure Propagation Tests =====
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

const { GET } = await import('../../src/app/api/review-center/reviews/[id]/route');

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

function adminRequest(): NextRequest {
  return new NextRequest('http://localhost/api/review-center/reviews/' + REVIEW_ID, {
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

function makeClient(options: {
  profile: any;
  review: any;
  typeDetails: any;
  members: any;
  rpcResult: any;
}) {
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const client: any = {
    from: (table: string) => {
      const result =
        table === 'profiles' ? options.profile :
        table === 'review_cases' ? options.review :
        table === 'review_type_details' ? options.typeDetails :
        table === 'review_members' ? options.members :
        null;
      if (!result) throw new Error('unexpected table: ' + table);
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        maybeSingle: async () => result,
        then: (resolve: any) => resolve(result),
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

function baseOptions(rpcResult: any): any {
  return {
    profile: { data: { id: PROFILE_ID, org_id: ORG_ID }, error: null },
    review: {
      data: {
        id: REVIEW_ID,
        org_id: ORG_ID,
        owner_id: PROFILE_ID,
        pmo_id: PROFILE_ID,
        created_by: PROFILE_ID,
        title: 'route test',
      },
      error: null,
    },
    typeDetails: { data: null, error: null },
    members: { data: [], error: null },
    rpcResult,
  };
}

async function runGet(options: any) {
  const holder = makeClient(options);
  (globalThis as any).__reviewCenterFakeSupabaseClient = holder.client;
  const response = await GET(adminRequest(), { params: { id: REVIEW_ID } });
  const body: any = await response.json();
  return { status: response.status, body, rpcCalls: holder.rpcCalls };
}

console.log('\n=== Review Center Detail Route Participant Failure Propagation ===');

const notFound = await runGet(baseOptions({
  data: {
    ok: false,
    code: 'NOT_FOUND',
    message: 'INTERNAL PARTICIPANT NOT FOUND DETAIL',
    data: null,
  },
  error: null,
}));
assert(notFound.status === 500, 'participant NOT_FOUND after visible detail -> HTTP 500');
assert(notFound.body.error === '复盘详情读取失败', 'NOT_FOUND returns generic body');
assert(!JSON.stringify(notFound.body).includes('INTERNAL PARTICIPANT NOT FOUND DETAIL'), 'NOT_FOUND raw message not exposed');
assert(notFound.rpcCalls.length === 1 && notFound.rpcCalls[0].name === 'review_participant_directory', 'participant RPC called for visible detail');

const forbidden = await runGet(baseOptions({
  data: {
    ok: false,
    code: 'FORBIDDEN',
    message: 'RAW PARTICIPANT FORBIDDEN MESSAGE',
    data: null,
  },
  error: null,
}));
assert(forbidden.status === 403, 'participant FORBIDDEN -> HTTP 403');
assert(forbidden.body.error === '复盘详情读取失败', 'FORBIDDEN returns generic body');
assert(!JSON.stringify(forbidden.body).includes('RAW PARTICIPANT FORBIDDEN MESSAGE'), 'FORBIDDEN raw message not exposed');

const unknownCode = await runGet(baseOptions({
  data: {
    ok: false,
    code: 'SOMETHING_NEW',
    message: 'RAW FUTURE BUSINESS MESSAGE',
    data: null,
  },
  error: null,
}));
assert(unknownCode.status === 500, 'unknown participant business code -> HTTP 500');
assert(unknownCode.body.error === '复盘详情读取失败', 'unknown code returns generic body');
assert(!JSON.stringify(unknownCode.body).includes('RAW FUTURE BUSINESS MESSAGE'), 'unknown code raw message not exposed');

const transport = await runGet(baseOptions({
  data: null,
  error: {
    message: 'RAW DATABASE MESSAGE',
    details: 'RAW DATABASE DETAILS',
    hint: 'RAW DATABASE HINT',
    code: 'RAW_DATABASE_CODE',
  },
}));
assert(transport.status === 500, 'participant RPC transport error -> HTTP 500');
assert(transport.body.error === '复盘详情读取失败', 'transport error returns generic body');
const transportText = JSON.stringify(transport.body);
assert(
  !transportText.includes('RAW DATABASE MESSAGE')
    && !transportText.includes('RAW DATABASE DETAILS')
    && !transportText.includes('RAW DATABASE HINT')
    && !transportText.includes('RAW_DATABASE_CODE'),
  'transport raw error fields not exposed',
);

const missingDetailOptions = baseOptions({
  data: {
    ok: false,
    code: 'NOT_FOUND',
    message: 'SHOULD NOT BE CALLED',
    data: null,
  },
  error: null,
});
missingDetailOptions.review = { data: null, error: null };
const missingDetail = await runGet(missingDetailOptions);
assert(missingDetail.status === 404, 'original detail NOT_FOUND -> HTTP 404');
assert(missingDetail.body.error === '复盘不存在或不可见', 'original detail 404 body preserved');
assert(missingDetail.rpcCalls.length === 0, 'participant RPC skipped when review not found');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
