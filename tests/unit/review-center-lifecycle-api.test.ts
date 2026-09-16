// ===== Review Center Lifecycle API Helper Tests =====
import {
  mapLifecycleRpcResult,
  parseLifecycleBody,
  sanitizeMissingFields,
  type LifecycleRpcResult,
} from '../../src/lib/review-center/lifecycle-api';

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

function success(data: any = {
  status: 'submitted',
  version: 2,
  submitted_at: '2026-08-25T00:00:00Z',
  closed_at: null,
}): LifecycleRpcResult {
  return {
    data: {
      ok: true,
      code: 'OK',
      message: 'success',
      data,
    },
    error: null,
  };
}

function business(
  code: string,
  message = 'RAW BUSINESS MESSAGE',
  data: any = null,
): LifecycleRpcResult {
  return {
    data: {
      ok: false,
      code,
      message,
      data,
    },
    error: null,
  };
}

function transport(): LifecycleRpcResult {
  return {
    data: null,
    error: {
      code: 'PGRST301',
      message: 'RAW TRANSPORT MESSAGE',
      details: 'RAW DETAILS',
      hint: 'RAW HINT',
    },
  };
}

console.log('\n=== Review Center Lifecycle API Helper ===');

const submitValid = parseLifecycleBody('SUBMIT', { expectedVersion: 2 });
assert(submitValid.ok && submitValid.data.expectedVersion === 2, 'submit valid body');
const closeValid = parseLifecycleBody('CLOSE', { expectedVersion: 3 });
assert(closeValid.ok && closeValid.data.expectedVersion === 3, 'close valid body');

for (const bad of [undefined, {}, { expectedVersion: 0 }, { expectedVersion: -1 }, { expectedVersion: 1.5 }, { expectedVersion: '2' }, { expectedVersion: null }, { expectedVersion: 1, status: 'draft' }]) {
  assert(!parseLifecycleBody('SUBMIT', bad).ok, 'submit invalid body rejected: ' + JSON.stringify(bad));
  assert(!parseLifecycleBody('CLOSE', bad).ok, 'close invalid body rejected: ' + JSON.stringify(bad));
}

const reopenNoReason = parseLifecycleBody('REOPEN', { expectedVersion: 1 });
assert(reopenNoReason.ok && reopenNoReason.data.reason === undefined, 'reopen reason optional');
const reopenNull = parseLifecycleBody('REOPEN', { expectedVersion: 1, reason: null });
assert(reopenNull.ok && reopenNull.data.reason === null, 'reopen reason null accepted');
const reopenEmpty = parseLifecycleBody('REOPEN', { expectedVersion: 1, reason: '' });
assert(reopenEmpty.ok && reopenEmpty.data.reason === '', 'reopen empty reason accepted');
const reopenWhitespace = parseLifecycleBody('REOPEN', { expectedVersion: 1, reason: '   ' });
assert(reopenWhitespace.ok && reopenWhitespace.data.reason === '   ', 'reopen whitespace reason preserved');
const reopenMax = parseLifecycleBody('REOPEN', { expectedVersion: 1, reason: 'x'.repeat(1000) });
assert(reopenMax.ok, 'reopen 1000 char reason accepted');
assert(!parseLifecycleBody('REOPEN', { expectedVersion: 1, reason: 'x'.repeat(1001) }).ok, 'reopen 1001 char reason rejected');
for (const bad of [{ expectedVersion: 1, reason: 123 }, { expectedVersion: 1, reason: {} }, { expectedVersion: 1, reason: [] }, { expectedVersion: 1, reason: true }, { expectedVersion: 1, status: 'draft' }]) {
  assert(!parseLifecycleBody('REOPEN', bad).ok, 'reopen invalid body rejected: ' + JSON.stringify(bad));
}

assert(JSON.stringify(sanitizeMissingFields(['description', 'type_details', 'unknown_secret', 'description'])) === '["description","type_details"]', 'missing fields whitelist');
assert(JSON.stringify(sanitizeMissingFields('not-array')) === '[]', 'missing fields non-array safe');

const mappedSuccess = mapLifecycleRpcResult('SUBMIT', success({
  status: 'submitted',
  version: 2,
  submitted_at: '2026-08-25T00:00:00Z',
  closed_at: null,
  org_id: 'org-1',
  owner_id: 'owner-1',
  pmo_id: 'pmo-1',
  submitted_by_profile_id: 'actor-1',
  closed_by_profile_id: 'closer-1',
  email: 'raw@example.com',
  secret: 'raw-secret',
  token: 'raw-token',
}));
assert(mappedSuccess.status === 200, 'success status 200');
const successData = mappedSuccess.body.data as Record<string, unknown>;
assert(JSON.stringify(Object.keys(successData).sort()) === '["closedAt","status","submittedAt","version"]', 'success DTO camelCase whitelist');
assert(!JSON.stringify(mappedSuccess.body).includes('org_id'), 'success body excludes org_id');
assert(!JSON.stringify(mappedSuccess.body).includes('submitted_by_profile_id'), 'success body excludes submitted_by');
assert(!JSON.stringify(mappedSuccess.body).includes('closed_by_profile_id'), 'success body excludes closed_by');
assert(!JSON.stringify(mappedSuccess.body).includes('email'), 'success body excludes email');
assert(!JSON.stringify(mappedSuccess.body).includes('secret'), 'success body excludes secret');
assert(!JSON.stringify(mappedSuccess.body).includes('token'), 'success body excludes token');

const noop = mapLifecycleRpcResult('SUBMIT', success({ status: 'submitted', version: 5, submitted_at: '2026-08-25T00:00:00Z', closed_at: null }));
assert(noop.status === 200 && (noop.body.data as Record<string, unknown>).version === 5, 'no-op success 200');

for (const bad of [
  success(null),
  success({ status: 'submitted', version: '2', submitted_at: null, closed_at: null }),
  success({ status: 'submitted', version: 2, submitted_at: {}, closed_at: null }),
  success({ status: 'submitted', version: 2, submitted_at: null, closed_at: 3 }),
  success({ version: 2, submitted_at: null, closed_at: null }),
]) {
  const mapped = mapLifecycleRpcResult('SUBMIT', bad);
  assert(mapped.status === 500 && mapped.body.code === 'INTERNAL_ERROR', 'malformed success fails closed');
}

const forbidden = mapLifecycleRpcResult('SUBMIT', business('FORBIDDEN', 'RAW FORBIDDEN'));
assert(forbidden.status === 403 && forbidden.body.message === '无权执行此复盘状态操作', 'FORBIDDEN 403 local message');
assert(!JSON.stringify(forbidden.body).includes('RAW FORBIDDEN'), 'FORBIDDEN raw message hidden');

const notFound = mapLifecycleRpcResult('CLOSE', business('NOT_FOUND'));
assert(notFound.status === 404 && notFound.body.message === '复盘不存在或无权访问', 'NOT_FOUND 404');

const versionConflict = mapLifecycleRpcResult('REOPEN', business('VERSION_CONFLICT'));
assert(versionConflict.status === 409 && versionConflict.body.message === '复盘已被其他操作更新，请刷新后重试', 'VERSION_CONFLICT 409');

const invalidTransition = mapLifecycleRpcResult('CLOSE', business('INVALID_TRANSITION'));
assert(invalidTransition.status === 409 && invalidTransition.body.message === '当前复盘状态不允许执行此操作', 'INVALID_TRANSITION 409');

const incompleteSubmit = mapLifecycleRpcResult('SUBMIT', business('INCOMPLETE_REVIEW', 'RAW INCOMPLETE', {
  missing_fields: ['description', 'type_details', 'unknown_secret'],
}));
assert(incompleteSubmit.status === 422 && incompleteSubmit.body.code === 'INCOMPLETE_REVIEW', 'submit INCOMPLETE_REVIEW 422');
const incompleteData = incompleteSubmit.body.data as { missingFields?: unknown };
assert(JSON.stringify(incompleteData.missingFields) === '["description","type_details"]', 'submit missingFields whitelist');
assert(!JSON.stringify(incompleteSubmit.body).includes('unknown_secret'), 'unknown missing field hidden');
assert(!JSON.stringify(incompleteSubmit.body).includes('RAW INCOMPLETE'), 'incomplete raw message hidden');
const reorderedMissing = mapLifecycleRpcResult(
  'SUBMIT',
  business('INCOMPLETE_REVIEW', 'RAW', {
    missing_fields: [
      'type_details',
      'owner_id',
      'risk_level',
      'description',
      'risk_level',
      'unknown',
    ],
  }),
);
assert(
  JSON.stringify((reorderedMissing.body.data as Record<string, unknown>).missingFields)
    === '["description","risk_level","owner_id","type_details"]',
  'submit missingFields are whitelisted, deduped, and stably ordered',
);

assert(mapLifecycleRpcResult('CLOSE', business('INCOMPLETE_REVIEW')).status === 500, 'close INCOMPLETE_REVIEW fail closed 500');
assert(mapLifecycleRpcResult('REOPEN', business('INCOMPLETE_REVIEW')).status === 500, 'reopen INCOMPLETE_REVIEW fail closed 500');

const invalidReason = mapLifecycleRpcResult('REOPEN', business('INVALID_REASON', 'RAW REASON'));
assert(invalidReason.status === 422 && invalidReason.body.message === '重新打开原因无效，请填写有效原因', 'reopen INVALID_REASON 422');
assert(!JSON.stringify(invalidReason.body).includes('RAW REASON'), 'INVALID_REASON raw message hidden');
assert(mapLifecycleRpcResult('SUBMIT', business('INVALID_REASON')).status === 500, 'submit INVALID_REASON fail closed 500');
assert(mapLifecycleRpcResult('CLOSE', business('INVALID_REASON')).status === 500, 'close INVALID_REASON fail closed 500');

const unknown = mapLifecycleRpcResult('SUBMIT', business('FUTURE_INTERNAL_CODE', 'RAW FUTURE'));
assert(unknown.status === 500 && unknown.body.code === 'INTERNAL_ERROR', 'unknown code 500 generic');
assert(!JSON.stringify(unknown.body).includes('FUTURE_INTERNAL_CODE'), 'unknown code not exposed');
assert(!JSON.stringify(unknown.body).includes('RAW FUTURE'), 'unknown raw message hidden');

const transportMapped = mapLifecycleRpcResult('SUBMIT', transport());
assert(transportMapped.status === 500 && transportMapped.body.code === 'INTERNAL_ERROR', 'transport 500 generic');
assert(!JSON.stringify(transportMapped.body).includes('RAW TRANSPORT MESSAGE'), 'transport raw message hidden');
assert(!JSON.stringify(transportMapped.body).includes('RAW DETAILS'), 'transport raw details hidden');
assert(!JSON.stringify(transportMapped.body).includes('RAW HINT'), 'transport raw hint hidden');

const openActions = mapLifecycleRpcResult('CLOSE', business('OPEN_ACTIONS_EXIST', 'RAW OPEN', {
  openActionCount: 2,
  secret_action_id: 'raw-action',
  secret_title: 'raw-title',
}));
assert(openActions.status === 409 && openActions.body.code === 'OPEN_ACTIONS_EXIST', 'OPEN_ACTIONS_EXIST 409');
assert(JSON.stringify(openActions.body.data) === '{"openActionCount":2}', 'OPEN_ACTIONS_EXIST data whitelist');
assert(!JSON.stringify(openActions.body).includes('RAW OPEN'), 'OPEN_ACTIONS_EXIST raw message hidden');
assert(!JSON.stringify(openActions.body).includes('raw-action'), 'OPEN_ACTIONS_EXIST action id hidden');
assert(!JSON.stringify(openActions.body).includes('raw-title'), 'OPEN_ACTIONS_EXIST title hidden');

for (const badCount of ['2', 0, -1, 1.5, null]) {
  const malformed = mapLifecycleRpcResult('CLOSE', business('OPEN_ACTIONS_EXIST', 'RAW', { openActionCount: badCount }));
  assert(malformed.status === 409 && malformed.body.data === null, 'OPEN_ACTIONS_EXIST malformed count safe 409');
}

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
