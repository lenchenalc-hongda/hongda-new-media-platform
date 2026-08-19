// ===== Review Center Profile Directory API Unit Tests =====
import {
  callProfileDirectory,
  mapProfileDirectoryResult,
  parseProfileDirectoryQuery,
} from '../../src/lib/review-center/profile-directory';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

function validItem(overrides: Record<string, unknown> = {}) {
  return {
    profile_id: '00000000-0000-0000-0000-000000000000',
    display_name: '用户',
    role: 'admin',
    department: null,
    assignment_eligible: true,
    ...overrides,
  };
}

console.log('\n=== Review Center Profile Directory API ===');

assert(parseProfileDirectoryQuery(new URLSearchParams('?purpose=MEMBER')).success, 'MEMBER query pass');
assert(parseProfileDirectoryQuery(new URLSearchParams('?purpose=ASSIGNMENT')).success, 'ASSIGNMENT query pass');
assert(!parseProfileDirectoryQuery(new URLSearchParams('')).success, 'missing purpose rejected');
assert(!parseProfileDirectoryQuery(new URLSearchParams('?purpose=')).success, 'empty purpose rejected');
assert(!parseProfileDirectoryQuery(new URLSearchParams('?purpose=member')).success, 'lowercase member rejected');
assert(!parseProfileDirectoryQuery(new URLSearchParams('?purpose=assignment')).success, 'lowercase assignment rejected');
assert(!parseProfileDirectoryQuery(new URLSearchParams('?purpose=%20MEMBER%20')).success, 'whitespace purpose rejected');
assert(!parseProfileDirectoryQuery(new URLSearchParams('?purpose=UNKNOWN')).success, 'unknown purpose rejected');
assert(!parseProfileDirectoryQuery(new URLSearchParams('?purpose=MEMBER&orgId=x')).success, 'extra orgId rejected');
assert(!parseProfileDirectoryQuery(new URLSearchParams('?purpose=MEMBER&role=viewer')).success, 'extra role rejected');
assert(!parseProfileDirectoryQuery(new URLSearchParams('?purpose=MEMBER&actorId=x')).success, 'extra actorId rejected');
assert(!parseProfileDirectoryQuery(new URLSearchParams('?purpose=MEMBER&purpose=ASSIGNMENT')).success, 'duplicate purpose rejected');
assert(!parseProfileDirectoryQuery(new URLSearchParams('?purpose=MEMBER&purpose=MEMBER')).success, 'duplicate same purpose rejected');

const okResult = {
  data: {
    ok: true,
    code: 'OK',
    message: 'success',
    data: { items: [validItem()] },
  },
  error: null,
};
const okMapped = mapProfileDirectoryResult(okResult);
assert(okMapped.status === 200 && okMapped.body.code === 'OK', 'OK -> 200');
const okData: any = okMapped.body.data;
assert(Array.isArray(okData?.items) && okData.items.length === 1, 'OK returns items');

const invalidPurpose = mapProfileDirectoryResult({
  data: { ok: false, code: 'INVALID_PURPOSE', message: 'Invalid directory purpose', data: null },
  error: null,
});
assert(invalidPurpose.status === 400 && invalidPurpose.body.code === 'INVALID_PURPOSE', 'INVALID_PURPOSE -> 400');

const forbidden = mapProfileDirectoryResult({
  data: { ok: false, code: 'FORBIDDEN', message: 'Forbidden', data: null },
  error: null,
});
assert(forbidden.status === 403 && forbidden.body.code === 'FORBIDDEN', 'FORBIDDEN -> 403');

const unknown = mapProfileDirectoryResult({
  data: { ok: false, code: 'UNKNOWN_CODE', message: 'secret message', data: null },
  error: null,
});
assert(unknown.status === 500 && unknown.body.message === 'Unable to load profile directory', 'unknown code generic 500');
assert(unknown.body.message !== 'secret message', 'unknown message not echoed');

const rpcError = mapProfileDirectoryResult({
  data: null,
  error: { code: 'PGRST301' },
});
assert(rpcError.status === 500 && rpcError.body.message === 'Unable to load profile directory', 'rpc error generic 500');

const malformedItems = mapProfileDirectoryResult({
  data: { ok: true, code: 'OK', message: 'success', data: { items: 'bad' } },
  error: null,
});
assert(malformedItems.status === 500, 'malformed data.items -> 500');

const invalidItem = mapProfileDirectoryResult({
  data: { ok: true, code: 'OK', message: 'success', data: { items: [validItem({ profile_id: 'abc' })] } },
  error: null,
});
assert(invalidItem.status === 500, 'invalid item shape -> 500');

const extraField = mapProfileDirectoryResult({
  data: { ok: true, code: 'OK', message: 'success', data: { items: [validItem({ email: 'x@example.com' })] } },
  error: null,
});
assert(extraField.status === 500, 'extra item field not passed through');

async function runServiceMappingTests() {
  const calls: Array<{ name: string; args: any }> = [];
  const client: any = {
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      return okResult;
    },
  };

  await callProfileDirectory(client, 'MEMBER');
  await callProfileDirectory(client, 'ASSIGNMENT');
  assert(calls.length === 2, 'two rpc calls');
  assert(calls[0].name === 'review_profile_directory' && calls[0].args.p_purpose === 'MEMBER', 'member rpc mapping');
  assert(calls[1].name === 'review_profile_directory' && calls[1].args.p_purpose === 'ASSIGNMENT', 'assignment rpc mapping');
}

runServiceMappingTests().then(() => {
  console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
  if (failed > 0) process.exitCode = 1;
}).catch(err => {
  console.error('Profile directory tests crashed:', String(err?.message || err));
  process.exit(1);
});
