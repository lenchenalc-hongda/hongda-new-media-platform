// ===== Review Center Action Command API Helper Tests =====
import { parseActionCommandRpcResult } from '../../src/lib/review-center/action-command';

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

const REVIEW_ID = '00000000-0000-0000-0000-000000000001';
const ACTION_ID = '00000000-0000-0000-0000-000000000002';

function successData(overrides: Record<string, unknown> = {}) {
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
        SECRET_EMAIL_MARKER: 'x',
        SECRET_ORG_MARKER: 'x',
        SECRET_NOTE_MARKER: 'x',
        SECRET_TOKEN_MARKER: 'x',
        ...overrides,
      },
    },
    error: null,
  };
}

function business(code: string, message = 'RAW MESSAGE') {
  return {
    data: {
      ok: false,
      code,
      message,
      data: null,
    },
    error: null,
  };
}

function transport() {
  return { data: null, error: { code: 'PGRST301' } };
}

console.log('\n=== Review Center Action Command API Helper ===');

const ok = parseActionCommandRpcResult(successData(), { reviewId: REVIEW_ID });
assert(ok.status === 200 && ok.body.ok === true && ok.body.code === 'OK', 'OK success');
const dto = (ok.body.data as any).action;
assert(dto.id === ACTION_ID && dto.sequence === 1 && dto.status === 'OPEN' && dto.version === 1, 'success DTO core fields');
assert(!('review_id' in dto) && !('updated_at' in dto), 'raw snake_case and review_id excluded');
assert(!JSON.stringify(ok.body).includes('SECRET_EMAIL_MARKER'), 'email marker excluded');
assert(!JSON.stringify(ok.body).includes('SECRET_ORG_MARKER'), 'org marker excluded');
assert(!JSON.stringify(ok.body).includes('SECRET_NOTE_MARKER'), 'note marker excluded');
assert(!JSON.stringify(ok.body).includes('SECRET_TOKEN_MARKER'), 'token marker excluded');

assert(parseActionCommandRpcResult(business('FORBIDDEN'), { reviewId: REVIEW_ID }).status === 403, 'FORBIDDEN 403');
assert(parseActionCommandRpcResult(business('NOT_FOUND'), { reviewId: REVIEW_ID }).status === 404, 'NOT_FOUND 404');
assert(parseActionCommandRpcResult(business('VERSION_CONFLICT'), { reviewId: REVIEW_ID }).status === 409, 'VERSION_CONFLICT 409');
assert(parseActionCommandRpcResult(business('INVALID_TRANSITION'), { reviewId: REVIEW_ID }).status === 409, 'INVALID_TRANSITION 409');
assert(parseActionCommandRpcResult(business('INVALID_INPUT'), { reviewId: REVIEW_ID }).status === 400, 'INVALID_INPUT 400');
assert(parseActionCommandRpcResult(business('INVALID_OWNER'), { reviewId: REVIEW_ID }).status === 400, 'INVALID_OWNER 400');
assert(parseActionCommandRpcResult(business('INVALID_REASON'), { reviewId: REVIEW_ID }).status === 400, 'INVALID_REASON 400');
const self = parseActionCommandRpcResult(business('SELF_VERIFICATION_FORBIDDEN'), { reviewId: REVIEW_ID });
assert(self.status === 403 && self.body.code === 'SELF_VERIFICATION_FORBIDDEN', 'SELF_VERIFICATION_FORBIDDEN 403 with code');

const unknown = parseActionCommandRpcResult(business('SOME_FUTURE_SECRET_CODE'), { reviewId: REVIEW_ID });
assert(unknown.status === 500 && unknown.body.code === 'INTERNAL_ERROR', 'unknown code 500 generic');
assert(!JSON.stringify(unknown.body).includes('SOME_FUTURE_SECRET_CODE'), 'unknown code not leaked');
assert(!JSON.stringify(unknown.body).includes('RAW MESSAGE'), 'raw message not leaked');

const transportResult = parseActionCommandRpcResult(transport(), { reviewId: REVIEW_ID });
assert(transportResult.status === 500 && transportResult.body.code === 'INTERNAL_ERROR', 'transport 500');

const malformed = parseActionCommandRpcResult({ data: { ok: true }, error: null }, { reviewId: REVIEW_ID });
assert(malformed.status === 500, 'malformed envelope 500');

const wrongReview = parseActionCommandRpcResult(successData({ review_id: '00000000-0000-0000-0000-000000000099' }), { reviewId: REVIEW_ID });
assert(wrongReview.status === 500, 'review identity mismatch 500');

const wrongAction = parseActionCommandRpcResult(successData({ id: '00000000-0000-0000-0000-000000000098' }), { reviewId: REVIEW_ID, actionId: ACTION_ID });
assert(wrongAction.status === 500, 'action identity mismatch 500');

assert(parseActionCommandRpcResult(successData({ sequence: 0 }), { reviewId: REVIEW_ID }).status === 500, 'bad sequence 500');
assert(parseActionCommandRpcResult(successData({ version: 0 }), { reviewId: REVIEW_ID }).status === 500, 'bad version 500');
assert(parseActionCommandRpcResult(successData({ status: 'UNKNOWN' }), { reviewId: REVIEW_ID }).status === 500, 'unknown success status 500');
assert(parseActionCommandRpcResult(successData({ updated_at: 'bad' }), { reviewId: REVIEW_ID }).status === 500, 'bad updated_at 500');
assert(parseActionCommandRpcResult(successData({ id: 'bad' }), { reviewId: REVIEW_ID }).status === 500, 'bad action uuid 500');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
