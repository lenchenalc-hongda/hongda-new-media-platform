// ===== Review Center Lifecycle Detail UI Presentation Tests =====
import {
  applyLifecycleSuccessToDetail,
  buildLifecycleRequest,
  classifyLifecycleError,
  createMutationLock,
  getLifecyclePresentation,
  isLifecycleManagedStatus,
  lifecycleStatusDescription,
  lifecycleStatusLabel,
  normalizeLifecycleSuccess,
  sanitizeIncompleteFields,
} from '../../src/lib/review-center/lifecycle-presentation';
import { reviewStatusLabel } from '../../src/lib/review-center/formatters';
import type { ReviewDetail } from '../../src/lib/review-center/types';

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

function present(
  status: string,
  role: string | null,
  profileId: string | null,
  ownerId: string,
  pmoId: string | null = null,
) {
  return getLifecyclePresentation({
    status,
    currentProfileId: profileId,
    currentRole: role,
    ownerId,
    pmoId,
  });
}

function makeDetail(): ReviewDetail {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    org_id: 'org-1',
    review_no: 'REV-2026-000999',
    review_type: 'A',
    title: 'QA',
    status: 'draft',
    risk_level: 'GREEN',
    risk_reason: 'QA reason',
    occurred_at: '2026-08-25T00:00:00Z',
    customer_name: null,
    order_no: null,
    project_name: null,
    product_name: null,
    process_name: null,
    description: 'QA',
    impact_summary: null,
    created_by: 'creator-1',
    owner_id: 'owner-1',
    pmo_id: null,
    submitted_at: null,
    submitted_by_profile_id: null,
    closed_at: null,
    closed_by: null,
    close_override_reason: null,
    report_generated_at: null,
    archived_at: null,
    version: 1,
    created_at: '2026-08-25T00:00:00Z',
    updated_at: '2026-08-25T00:00:00Z',
    type_details: null,
    members: [],
    participants: [],
    metadata: null,
  };
}

console.log('\n=== Review Center Lifecycle Detail UI Presentation ===');

assert(lifecycleStatusLabel('draft') === '草稿', 'draft label');
assert(lifecycleStatusLabel('submitted') === '待确认', 'submitted label');
assert(lifecycleStatusLabel('closed') === '已关闭', 'closed label');
assert(lifecycleStatusLabel('future') === '未知状态', 'unknown status label hidden');
assert(reviewStatusLabel('submitted') === '待确认', 'canonical submitted label is 待确认');

assert(lifecycleStatusDescription('draft') === '内容可编辑，完成后可提交确认。', 'draft description');
assert(lifecycleStatusDescription('submitted') === '复盘已提交，等待管理人员确认关闭或退回修改。', 'submitted description');
assert(lifecycleStatusDescription('closed') === '本次复盘流程已关闭，如需继续修改需由管理员重新打开。', 'closed description');
assert(lifecycleStatusDescription('in_review') === '当前状态暂不支持生命周期操作。', 'legacy description');
assert(isLifecycleManagedStatus('draft'), 'draft managed');
assert(isLifecycleManagedStatus('submitted'), 'submitted managed');
assert(isLifecycleManagedStatus('closed'), 'closed managed');
assert(!isLifecycleManagedStatus('in_review'), 'legacy not managed');
assert(!isLifecycleManagedStatus('future'), 'unknown not managed');

const draftAdmin = present('draft', 'admin', null, 'owner-1');
assert(draftAdmin.canEdit && draftAdmin.canSubmit, 'draft admin can edit/submit');
const draftManager = present('draft', 'manager', null, 'owner-1');
assert(draftManager.canEdit && draftManager.canSubmit, 'draft manager can edit/submit');
const draftOwnerOperator = present('draft', 'operator', 'owner-1', 'owner-1');
assert(draftOwnerOperator.canEdit && draftOwnerOperator.canSubmit, 'draft operator owner can edit/submit');
const draftPmoOperator = present('draft', 'operator', 'pmo-1', 'owner-1', 'pmo-1');
assert(draftPmoOperator.canEdit && draftPmoOperator.canSubmit, 'draft operator pmo can edit/submit');
const draftOwnerSales = present('draft', 'sales', 'owner-1', 'owner-1');
assert(draftOwnerSales.canEdit && draftOwnerSales.canSubmit, 'draft sales owner can edit/submit');
const draftPmoSales = present('draft', 'sales', 'pmo-1', 'owner-1', 'pmo-1');
assert(draftPmoSales.canEdit && draftPmoSales.canSubmit, 'draft sales pmo can edit/submit');
const draftMemberOnly = present('draft', 'operator', 'member-1', 'owner-1');
assert(!draftMemberOnly.canEdit && !draftMemberOnly.canSubmit, 'draft member-only cannot edit/submit');
const draftUnrelatedOperator = present('draft', 'operator', 'other-1', 'owner-1');
assert(!draftUnrelatedOperator.canEdit && !draftUnrelatedOperator.canSubmit, 'draft unrelated operator cannot edit/submit');
const draftUnrelatedSales = present('draft', 'sales', 'other-1', 'owner-1');
assert(!draftUnrelatedSales.canEdit && !draftUnrelatedSales.canSubmit, 'draft unrelated sales cannot edit/submit');
const draftViewerOwner = present('draft', 'viewer', 'owner-1', 'owner-1');
assert(!draftViewerOwner.canEdit && !draftViewerOwner.canSubmit, 'draft viewer owner cannot edit/submit');

const submittedAdmin = present('submitted', 'admin', null, 'owner-1');
assert(submittedAdmin.canReturnToDraft && submittedAdmin.canClose, 'submitted admin return/close');
assert(!submittedAdmin.canEdit && !submittedAdmin.canSubmit, 'submitted admin cannot edit/submit');
const submittedManager = present('submitted', 'manager', null, 'owner-1');
assert(submittedManager.canReturnToDraft && submittedManager.canClose, 'submitted manager return/close');
const submittedOwner = present('submitted', 'operator', 'owner-1', 'owner-1');
assert(!submittedOwner.canReturnToDraft && !submittedOwner.canClose, 'submitted owner cannot return/close');
const submittedPmo = present('submitted', 'operator', 'pmo-1', 'owner-1', 'pmo-1');
assert(!submittedPmo.canReturnToDraft && !submittedPmo.canClose, 'submitted pmo cannot return/close');
const submittedMember = present('submitted', 'operator', 'member-1', 'owner-1');
assert(!submittedMember.canReturnToDraft && !submittedMember.canClose, 'submitted member cannot return/close');
const submittedViewer = present('submitted', 'viewer', null, 'owner-1');
assert(!submittedViewer.canReturnToDraft && !submittedViewer.canClose, 'submitted viewer cannot return/close');

const closedAdmin = present('closed', 'admin', null, 'owner-1');
assert(closedAdmin.canReopenClosed, 'closed admin can reopen');
const closedManager = present('closed', 'manager', null, 'owner-1');
assert(!closedManager.canReopenClosed, 'closed manager cannot reopen');
const closedOwner = present('closed', 'operator', 'owner-1', 'owner-1');
assert(!closedOwner.canReopenClosed, 'closed owner cannot reopen');
const closedMember = present('closed', 'operator', 'member-1', 'owner-1');
assert(!closedMember.canReopenClosed, 'closed member cannot reopen');
const closedViewer = present('closed', 'viewer', null, 'owner-1');
assert(!closedViewer.canReopenClosed, 'closed viewer cannot reopen');

for (const legacy of ['in_review', 'action_required', 'verifying', 'archived', 'rejected', 'cancelled']) {
  const p = present(legacy, 'admin', null, 'owner-1');
  assert(!p.canEdit && !p.canSubmit && !p.canReturnToDraft && !p.canClose && !p.canReopenClosed, 'legacy status no actions: ' + legacy);
}
const unknownStatus = present('future', 'admin', null, 'owner-1');
assert(!unknownStatus.canEdit && !unknownStatus.canSubmit && !unknownStatus.canReturnToDraft && !unknownStatus.canClose && !unknownStatus.canReopenClosed, 'unknown status fail closed');
const unknownRole = present('draft', 'future_role', null, 'owner-1');
assert(!unknownRole.canEdit && !unknownRole.canSubmit, 'unknown role fail closed');
const nullRole = present('draft', null, 'owner-1', 'owner-1');
assert(!nullRole.canEdit && !nullRole.canSubmit, 'null role fail closed');
const pmoNullUnrelated = present('draft', 'operator', 'other-1', 'owner-1', null);
assert(!pmoNullUnrelated.canSubmit, 'pmo null unrelated no accidental allow');

assert(JSON.stringify(sanitizeIncompleteFields(['description', 'type_details', 'unknown_secret'])) === '["description","type_details"]', 'incomplete field whitelist');
assert(JSON.stringify(sanitizeIncompleteFields('bad')) === '[]', 'incomplete non-array safe');

const success = normalizeLifecycleSuccess({
  ok: true,
  code: 'OK',
  data: { status: 'submitted', version: 2, submitted_at: '2026-08-25T00:00:00Z', closed_at: null },
});
assert(success?.status === 'submitted' && success.version === 2 && success.submittedAt === '2026-08-25T00:00:00Z', 'success normalized');
assert(normalizeLifecycleSuccess(null) === null, 'malformed success null');
assert(normalizeLifecycleSuccess({ ok: true, code: 'OK', data: { status: 'submitted', version: '2', submitted_at: null, closed_at: null } }) === null, 'malformed success version string');

const forbidden = classifyLifecycleError(403, { code: 'FORBIDDEN', message: 'RAW' });
assert(forbidden.message === '你当前无权执行此操作。' && forbidden.shouldRefreshAuthority, '403 mapping');
const conflict = classifyLifecycleError(409, { code: 'VERSION_CONFLICT', message: 'RAW' });
assert(conflict.message === '复盘已被其他操作更新，请刷新后重试。' && conflict.shouldRefreshAuthority, '409 version mapping');
const transition = classifyLifecycleError(409, { code: 'INVALID_TRANSITION', message: 'RAW' });
assert(transition.message === '复盘状态已发生变化，页面将刷新为最新状态。' && transition.shouldRefreshAuthority, '409 transition mapping');
const incomplete = classifyLifecycleError(422, {
  code: 'INCOMPLETE_REVIEW',
  data: { missingFields: ['description', 'unknown_secret'] },
});
assert(incomplete.message === '复盘内容还未填写完整，请先补充以下内容：' && JSON.stringify(incomplete.incompleteFields) === '["description"]', 'incomplete mapping');
const invalidReason = classifyLifecycleError(422, { code: 'INVALID_REASON', message: 'RAW' });
assert(invalidReason.message === '请填写有效的重新打开原因。' && invalidReason.keepDialogOpen, 'invalid reason mapping');
const openActions = classifyLifecycleError(409, {
  code: 'OPEN_ACTIONS_EXIST',
  message: 'RAW',
  data: { openActionCount: 2 },
});
assert(openActions.message === '还有 2 项改善行动未完成验证，暂不能关闭复盘。', 'OPEN_ACTIONS_EXIST count mapping');
const openActionsNoCount = classifyLifecycleError(409, {
  code: 'OPEN_ACTIONS_EXIST',
  message: 'RAW',
  data: null,
});
assert(openActionsNoCount.message === '还有改善行动未完成验证，暂不能关闭复盘。', 'OPEN_ACTIONS_EXIST fallback mapping');
assert(!openActions.message.includes('RAW') && !openActionsNoCount.message.includes('RAW'), 'OPEN_ACTIONS_EXIST raw hidden');
const internal = classifyLifecycleError(500, { code: 'SOMETHING', message: 'RAW' });
assert(internal.message === '操作失败，请稍后重试。', '500 generic');

const submitReq = buildLifecycleRequest('SUBMIT', 'review-1', 2);
assert(submitReq.url === '/api/review-center/reviews/review-1/submit' && JSON.stringify(submitReq.body) === '{"expectedVersion":2}', 'submit request');
const closeReq = buildLifecycleRequest('CLOSE', 'review-1', 3);
assert(closeReq.url === '/api/review-center/reviews/review-1/close' && JSON.stringify(closeReq.body) === '{"expectedVersion":3}', 'close request');
const returnReq = buildLifecycleRequest('RETURN', 'review-1', 4);
assert(returnReq.url === '/api/review-center/reviews/review-1/reopen' && JSON.stringify(returnReq.body) === '{"expectedVersion":4,"reason":null}', 'return request');
const reopenReq = buildLifecycleRequest('REOPEN', 'review-1', 5, '  reason  ');
assert(reopenReq.url === '/api/review-center/reviews/review-1/reopen' && reopenReq.body.reason === 'reason', 'reopen request trims reason');

const lock = createMutationLock();
assert(lock.acquire() === true, 'lock first acquire');
assert(lock.acquire() === false, 'lock second acquire blocked');
lock.release();
assert(lock.acquire() === true, 'lock releases');

const patched = applyLifecycleSuccessToDetail(makeDetail(), {
  status: 'submitted',
  version: 2,
  submittedAt: '2026-08-25T00:00:00Z',
  closedAt: null,
});
assert(patched.status === 'submitted' && patched.version === 2 && patched.submitted_at === '2026-08-25T00:00:00Z' && patched.closed_at === null, 'success patch');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
