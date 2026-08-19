// ===== Review Center Detail Participant Enrichment Unit Tests =====
import {
  ParticipantReadError,
  parseParticipantDirectoryResult,
  reviewParticipantSchema,
} from '../../src/lib/review-center/participant';
import { getReviewDetail } from '../../src/lib/review-center/service';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

function validItem(overrides: Record<string, unknown> = {}) {
  return {
    profile_id: '00000000-0000-0000-0000-000000000000',
    display_name: '用户',
    role: 'viewer',
    department: null,
    is_active: true,
    ...overrides,
  };
}

function okEnvelope(items: any[]) {
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

console.log('\n=== Review Center Detail Participant Enrichment ===');

const parsed = parseParticipantDirectoryResult(okEnvelope([validItem()]));
assert(parsed.length === 1 && parsed[0].profile_id === validItem().profile_id, 'valid participant payload parse');

const inactive = parseParticipantDirectoryResult(okEnvelope([validItem({ is_active: false })]));
assert(inactive[0].is_active === false, 'inactive participant allowed');

const nullDepartment = parseParticipantDirectoryResult(okEnvelope([validItem({ department: null })]));
assert(nullDepartment[0].department === null, 'department null allowed');

function expectReadError(payload: any, status: number, msg: string) {
  let caught: any = null;
  try {
    parseParticipantDirectoryResult(payload);
  } catch (err) {
    caught = err;
  }
  assert(caught instanceof ParticipantReadError && caught.status === status, msg);
}

expectReadError(okEnvelope([validItem({ profile_id: 'abc' })]), 500, 'invalid profile_id rejected');
expectReadError(okEnvelope([validItem({ role: 'superuser' })]), 500, 'invalid role rejected');
expectReadError(okEnvelope([validItem({ is_active: 'yes' })]), 500, 'invalid is_active rejected');
expectReadError(okEnvelope([validItem({ email: 'x@example.com' })]), 500, 'extra email rejected');
expectReadError(okEnvelope([validItem({ user_id: 'abc' })]), 500, 'extra user_id rejected');
expectReadError({ data: { ok: true, code: 'OK', message: 'success', data: { items: 'bad' } }, error: null }, 500, 'malformed items rejected');
expectReadError({ data: { ok: true, code: 'OK', message: 'success', data: { items: [validItem({ is_owner: true })] } }, error: null }, 500, 'relationship flag rejected');

assert(parseParticipantDirectoryResult(okEnvelope([])).length === 0, 'empty participant items valid');

expectReadError({
  data: { ok: false, code: 'NOT_FOUND', message: 'secret', data: null },
  error: null,
}, 500, 'NOT_FOUND after visible detail -> 500');

let rawCaught: any = null;
try {
  parseParticipantDirectoryResult({
    data: { ok: false, code: 'UNKNOWN_CODE', message: 'secret-detail', data: null },
    error: null,
  });
} catch (err) {
  rawCaught = err;
}
assert(
  rawCaught instanceof ParticipantReadError
    && rawCaught.message === '复盘参与人读取失败'
    && !rawCaught.message.includes('secret-detail'),
  'raw RPC message not exposed',
);

expectReadError({
  data: { ok: false, code: 'FORBIDDEN', message: 'secret', data: null },
  error: null,
}, 403, 'FORBIDDEN -> 403');

expectReadError({
  data: { ok: false, code: 'UNKNOWN_CODE', message: 'secret', data: null },
  error: null,
}, 500, 'unknown business code -> 500');

expectReadError({ data: null, error: { code: 'PGRST301' } }, 500, 'transport error -> 500');

function chainableResult(result: any) {
  const obj: any = {
    select: () => obj,
    eq: () => obj,
    order: () => obj,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: any) => resolve(result),
  };
  return obj;
}

async function runServiceEnrichmentTest() {
  const review = {
    id: '00000000-0000-0000-0000-000000000001',
    org_id: '00000000-0000-0000-0000-000000000002',
    owner_id: '00000000-0000-0000-0000-000000000003',
    pmo_id: '00000000-0000-0000-0000-000000000004',
    created_by: '00000000-0000-0000-0000-000000000005',
    title: 't',
  };
  const members = [{
    id: '00000000-0000-0000-0000-000000000006',
    profile_id: '00000000-0000-0000-0000-000000000007',
    member_role: 'QUALITY',
    is_primary: true,
    created_at: '2026-01-01T00:00:00Z',
  }];
  const participants = [
    validItem({ profile_id: '00000000-0000-0000-0000-000000000003', role: 'admin', is_active: true }),
    validItem({ profile_id: '00000000-0000-0000-0000-000000000005', role: 'admin', is_active: false }),
  ];

  const client: any = {
    from: (table: string) => {
      if (table === 'review_cases') return chainableResult({ data: review, error: null });
      if (table === 'review_type_details') return chainableResult({ data: null, error: null });
      if (table === 'review_members') {
        const builder = chainableResult({ data: members, error: null });
        return builder;
      }
      return chainableResult({ data: null, error: null });
    },
    rpc: async () => okEnvelope(participants),
  };

  const detail = await getReviewDetail(client, review.org_id, review.id);
  assert(detail.owner_id === review.owner_id, 'owner_id preserved');
  assert(detail.pmo_id === review.pmo_id, 'pmo_id preserved');
  assert(detail.created_by === review.created_by, 'created_by preserved');
  assert(detail.members.length === 1 && detail.members[0].profile_id === members[0].profile_id, 'member structure preserved');
  assert(detail.participants.length === 2, 'participants additive');
  assert(detail.participants[1].is_active === false, 'inactive participant preserved in detail');
}

runServiceEnrichmentTest().then(() => {
  console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
  if (failed > 0) process.exitCode = 1;
}).catch(err => {
  console.error('Participant enrichment tests crashed:', String(err?.message || err));
  process.exit(1);
});
