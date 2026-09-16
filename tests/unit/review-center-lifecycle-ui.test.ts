// ===== Review Center Lifecycle Detail UI Logic + Source Tests =====
import fs from 'node:fs';
import {
  buildLifecycleRequest,
  classifyLifecycleError,
  createMutationLock,
  getLifecyclePresentation,
  INCOMPLETE_FIELD_LABELS,
  normalizeLifecycleSuccess,
} from '../../src/lib/review-center/lifecycle-presentation';

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

console.log('\n=== Review Center Lifecycle Detail UI ===');

const submitReq = buildLifecycleRequest('SUBMIT', 'id-1', 7);
assert(submitReq.url === '/api/review-center/reviews/id-1/submit' && JSON.stringify(submitReq.body) === '{"expectedVersion":7}', 'submit url/body');
const closeReq = buildLifecycleRequest('CLOSE', 'id-1', 8);
assert(closeReq.url === '/api/review-center/reviews/id-1/close' && JSON.stringify(closeReq.body) === '{"expectedVersion":8}', 'close url/body');
const returnReq = buildLifecycleRequest('RETURN', 'id-1', 9, '  退回原因  ');
assert(
  returnReq.url === '/api/review-center/reviews/id-1/reopen'
  && JSON.stringify(returnReq.body) === '{"expectedVersion":9,"reason":"退回原因"}',
  'return url/body includes reason',
);
const reopenReq = buildLifecycleRequest('REOPEN', 'id-1', 10, '  reason  ');
assert(reopenReq.url === '/api/review-center/reviews/id-1/reopen' && reopenReq.body.reason === 'reason', 'reopen url/body trimmed');

const success = normalizeLifecycleSuccess({
  ok: true,
  code: 'OK',
  data: { status: 'closed', version: 5, submittedAt: null, closedAt: '2026-08-25T00:00:00Z' },
});
assert(success?.status === 'closed' && success.version === 5 && success.closedAt === '2026-08-25T00:00:00Z', 'success parse');
const submitSuccess = normalizeLifecycleSuccess({
  ok: true,
  code: 'OK',
  data: { status: 'submitted', version: 6, submittedAt: '2026-08-25T00:00:00Z', closedAt: null },
});
assert(submitSuccess?.status === 'submitted' && submitSuccess.version === 6 && submitSuccess.submittedAt === '2026-08-25T00:00:00Z', 'submit success parse');
const reopenSuccess = normalizeLifecycleSuccess({
  ok: true,
  code: 'OK',
  data: { status: 'draft', version: 7, submittedAt: null, closedAt: null },
});
assert(reopenSuccess?.status === 'draft' && reopenSuccess.version === 7, 'reopen success parse');
assert(normalizeLifecycleSuccess({ ok: true, code: 'OK', data: null }) === null, 'malformed success null data');
assert(normalizeLifecycleSuccess({ ok: true, code: 'OK', data: { status: 'draft', version: 0, submittedAt: null, closedAt: null } }) === null, 'malformed success version 0');
assert(normalizeLifecycleSuccess({ ok: true, code: 'OK', data: { status: 'submitted', version: 2, closedAt: null } }) === null, 'missing submittedAt rejected');
assert(normalizeLifecycleSuccess({ ok: true, code: 'OK', data: { status: 'submitted', version: 2, submittedAt: '2026-08-25T00:00:00Z' } }) === null, 'missing closedAt rejected');

assert(classifyLifecycleError(401, {}).message === '未登录或登录已过期。', '401 message');
assert(classifyLifecycleError(403, { code: 'FORBIDDEN', message: 'RAW' }).message === '你当前无权执行此操作。', '403 message');
assert(classifyLifecycleError(409, { code: 'VERSION_CONFLICT' }).message === '复盘已被其他操作更新，请刷新后重试。', '409 version message');
assert(classifyLifecycleError(409, { code: 'INVALID_TRANSITION' }).message === '复盘状态已发生变化，页面将刷新为最新状态。', '409 transition message');
const incomplete = classifyLifecycleError(422, { code: 'INCOMPLETE_REVIEW', data: { missingFields: ['title', 'unknown_secret'] } });
assert(incomplete.message === '复盘内容还未填写完整，请先补充以下内容：' && JSON.stringify(incomplete.incompleteFields) === '["title"]', 'incomplete fields');
const incompleteFallback = classifyLifecycleError(422, {
  code: 'INCOMPLETE_REVIEW',
  data: { missingFields: [] },
});
assert(
  incompleteFallback.emptyIncompleteFallback === true
  && incompleteFallback.message.includes('系统未能识别具体缺失项'),
  'empty incomplete fields use fallback copy',
);
assert(
  classifyLifecycleError(422, { code: 'INVALID_REASON' }, 'RETURN').message
    === '请填写有效的退回原因。',
  'return invalid reason copy',
);
assert(
  INCOMPLETE_FIELD_LABELS.description === '问题描述'
  && INCOMPLETE_FIELD_LABELS.risk_level === '风险等级'
  && INCOMPLETE_FIELD_LABELS.owner_id === '项目负责人'
  && INCOMPLETE_FIELD_LABELS.type_details === '专项复盘内容',
  'incomplete field labels match user-facing copy',
);
assert(classifyLifecycleError(422, { code: 'INVALID_REASON' }).keepDialogOpen === true, 'invalid reason keeps dialog');
assert(classifyLifecycleError(500, { code: 'RAW_CODE', message: 'RAW' }).message === '操作失败，请稍后重试。', '500 generic');
assert(classifyLifecycleError(200, null).message === '操作失败，请稍后重试。', 'malformed response generic');

const lock = createMutationLock();
assert(lock.acquire() === true && lock.acquire() === false, 'double-click lock blocks second request');
lock.release();
assert(lock.acquire() === true, 'lock releases after request');

const viewerDraft = getLifecyclePresentation({
  status: 'draft',
  currentProfileId: 'owner-1',
  currentRole: 'viewer',
  ownerId: 'owner-1',
  pmoId: null,
});
assert(!viewerDraft.canEdit && !viewerDraft.canSubmit, 'viewer draft hidden');
const legacy = getLifecyclePresentation({
  status: 'in_review',
  currentProfileId: null,
  currentRole: 'admin',
  ownerId: 'owner-1',
  pmoId: null,
});
assert(!legacy.canEdit && !legacy.canSubmit && !legacy.canReturnToDraft && !legacy.canClose && !legacy.canReopenClosed, 'legacy no action');

const sectionSource = fs.readFileSync('src/app/review-center/reviews/[id]/lifecycle-section.tsx', 'utf8');
for (const required of [
  '提交复盘',
  '关闭复盘',
  '退回修改',
  '重新打开',
  '关闭复盘仅代表本次复盘流程完成，不代表生产、品质或出货放行',
  '确认提交',
  '确认关闭',
  '确认退回',
  '退回原因 *',
  '请填写退回原因。',
  '请说明需要补充或修改的内容',
  'classifyLifecycleError(response.status, payload, action)',
  'handleReturnConfirm',
  'return-dialog-title',
  'id="return-reason"',
  '确认重新打开',
  'maxLength={1000}',
  '请填写重新打开原因。',
  'onLifecycleSuccess',
  'onAuthorityRefresh',
  'incompleteFields.length > 0 || incompleteReviewFallback',
  '去编辑补充',
  '去编辑检查',
  'incompleteReviewFallback',
  'confirmDisabled={isMutating}',
  'disabled={isMutating}',
  'role="dialog"',
  'aria-modal="true"',
  'aria-labelledby="reopen-dialog-title"',
  'id="reopen-dialog-title"',
  'htmlFor="reopen-reason"',
  'event.stopPropagation()',
  'Escape',
  'closeReopenDialog',
]) {
  assert(sectionSource.includes(required), 'lifecycle section contains: ' + required);
}
for (const forbidden of [
  'supabase.rpc',
  'service_role',
  'window.location.reload',
  'CustomEvent',
  ".from('review_cases')",
  '.update(',
  'auth_has_role',
  "role === 'admin'",
  "role === 'viewer'",
]) {
  assert(!sectionSource.includes(forbidden), 'lifecycle section excludes: ' + forbidden);
}

const incompleteError = classifyLifecycleError(422, {
  code: 'INCOMPLETE_REVIEW',
  data: { missingFields: ['description'] },
});
const invalidReasonError = classifyLifecycleError(422, { code: 'INVALID_REASON' });
const internalError = classifyLifecycleError(500, { code: 'RAW', message: 'RAW' });
assert(incompleteError.shouldRefreshAuthority === false, 'incomplete review does not trigger authority refresh');
assert(invalidReasonError.shouldRefreshAuthority === false, 'invalid reason does not trigger authority refresh');
assert(internalError.shouldRefreshAuthority === false, 'internal error does not trigger authority refresh');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
