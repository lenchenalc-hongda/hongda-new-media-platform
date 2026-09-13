// ===== Review Center Action Presentation Unit Tests =====
import {
  ACTION_READ_ERROR_MESSAGE,
  ACTION_REFRESH_FAILURE_MESSAGE,
  ACTION_STATUS_LABELS,
  ACTION_TYPE_LABELS,
  actionStatusBadgeClass,
  actionStatusLabel,
  actionTypeLabel,
  canCreateActionForReview,
  countNonFinalActions,
  formatActionDueDate,
  getActionCommandErrorPresentation,
  getActionPresentationCapabilities,
  getActionSectionEmptyCopy,
  getActionSectionNonFinalWarning,
} from '../../src/lib/review-center/action-presentation';
import type { ActionReadDto } from '../../src/lib/review-center/actions';

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

function caps(overrides: Record<string, unknown> = {}) {
  return getActionPresentationCapabilities({
    reviewStatus: 'draft',
    currentRole: 'admin',
    currentProfileId: 'actor-1',
    reviewOwnerProfileId: 'owner-1',
    reviewPmoProfileId: null,
    actionStatus: 'OPEN',
    actionOwnerProfileId: 'owner-2',
    ...overrides,
  });
}

function actionStatus(status: string) {
  return { status: status as ActionReadDto['status'] };
}

console.log('\n=== Review Center Action Presentation ===');

assert(ACTION_READ_ERROR_MESSAGE === '改善行动加载失败，请重试', 'read error dedicated copy');
assert(
  ACTION_REFRESH_FAILURE_MESSAGE === '操作已完成，但最新数据刷新失败，请手动重试。',
  'command success refresh failure copy',
);

assert(ACTION_STATUS_LABELS.OPEN === '待开始', 'OPEN label');
assert(ACTION_STATUS_LABELS.IN_PROGRESS === '进行中', 'IN_PROGRESS label');
assert(ACTION_STATUS_LABELS.PENDING_VERIFICATION === '待验证', 'PENDING label');
assert(ACTION_STATUS_LABELS.VERIFIED === '已验证', 'VERIFIED label');
assert(ACTION_STATUS_LABELS.CANCELLED === '已取消', 'CANCELLED label');
assert(ACTION_STATUS_LABELS.UNKNOWN === '状态异常', 'UNKNOWN label');
assert(actionStatusLabel('OPEN') === '待开始', 'actionStatusLabel');
assert(actionStatusLabel('FUTURE') === '状态异常', 'actionStatusLabel unknown');

assert(ACTION_TYPE_LABELS.IMMEDIATE === '立即纠正', 'IMMEDIATE label');
assert(ACTION_TYPE_LABELS.CORRECTIVE === '纠正措施', 'CORRECTIVE label');
assert(ACTION_TYPE_LABELS.PREVENTIVE === '预防措施', 'PREVENTIVE label');
assert(ACTION_TYPE_LABELS.UNKNOWN === '未知类型', 'UNKNOWN type label');
assert(actionTypeLabel('CORRECTIVE') === '纠正措施', 'actionTypeLabel');
assert(actionTypeLabel('FUTURE') === '未知类型', 'actionTypeLabel unknown');
assert(actionStatusBadgeClass('VERIFIED') === 'badge-green', 'status badge class');

assert(formatActionDueDate('2026-08-26') === '2026/08/26', 'date-only format stable');
assert(formatActionDueDate('2026-02-28') === '2026/02/28', 'valid february date');
assert(formatActionDueDate('2026-02-29') === '-', 'invalid february date');
assert(formatActionDueDate('2024-02-29') === '2024/02/29', 'leap year date');
assert(formatActionDueDate('2026-13-01') === '-', 'invalid month');
assert(formatActionDueDate('2026-00-10') === '-', 'zero month');
assert(formatActionDueDate('2026-08-32') === '-', 'invalid day');
assert(formatActionDueDate('not-a-date') === '-', 'invalid string');
assert(formatActionDueDate(null) === '-', 'null date');

const createBase = {
  reviewStatus: 'draft',
  currentRole: 'admin',
  currentProfileId: 'actor-1',
  reviewOwnerProfileId: 'owner-1',
  reviewPmoProfileId: null,
};
assert(canCreateActionForReview({ ...createBase, currentRole: 'admin' }), 'admin create');
assert(canCreateActionForReview({ ...createBase, currentRole: 'manager' }), 'manager create');
assert(canCreateActionForReview({
  ...createBase,
  currentRole: 'operator',
  currentProfileId: 'owner-1',
}), 'review owner create');
assert(canCreateActionForReview({
  ...createBase,
  currentRole: 'sales',
  currentProfileId: 'pmo-1',
  reviewPmoProfileId: 'pmo-1',
}), 'review pmo create');
assert(!canCreateActionForReview({
  ...createBase,
  currentRole: 'operator',
  currentProfileId: 'member-1',
}), 'ordinary member cannot create');
assert(!canCreateActionForReview({
  ...createBase,
  currentRole: 'viewer',
  currentProfileId: 'owner-1',
}), 'viewer cannot create even as owner');
assert(!canCreateActionForReview({
  ...createBase,
  reviewStatus: 'closed',
}), 'closed review cannot create');

const ordinaryOwnerOpen = caps({
  currentRole: 'operator',
  currentProfileId: 'owner-2',
  actionOwnerProfileId: 'owner-2',
});
assert(ordinaryOwnerOpen.canStart && ordinaryOwnerOpen.canSubmit, 'ordinary action owner open start/submit');
assert(!ordinaryOwnerOpen.canEdit && !ordinaryOwnerOpen.canVerify && !ordinaryOwnerOpen.canReturn && !ordinaryOwnerOpen.canCancel, 'ordinary action owner no edit/verify/return/cancel');

const reviewOwnerOpen = caps({
  currentRole: 'operator',
  currentProfileId: 'owner-1',
  actionOwnerProfileId: 'owner-2',
});
assert(reviewOwnerOpen.canEdit, 'review owner can edit');
assert(!reviewOwnerOpen.canStart, 'review owner cannot start unless action owner');
assert(!reviewOwnerOpen.canSubmit, 'review owner cannot submit unless action owner');
assert(reviewOwnerOpen.canCancel, 'review owner can cancel');

const managerOpen = caps({ currentRole: 'manager' });
assert(managerOpen.canEdit && managerOpen.canStart && managerOpen.canSubmit && managerOpen.canCancel, 'manager open edit/start/submit/cancel');
assert(!managerOpen.canVerify && !managerOpen.canReturn, 'manager open no verify/return');

const pendingReviewOwner = caps({
  currentRole: 'operator',
  currentProfileId: 'owner-1',
  actionStatus: 'PENDING_VERIFICATION',
  actionOwnerProfileId: 'owner-2',
});
assert(pendingReviewOwner.canVerify && pendingReviewOwner.canReturn && pendingReviewOwner.canCancel, 'pending review owner verify/return/cancel');
assert(!pendingReviewOwner.canEdit && !pendingReviewOwner.canStart && !pendingReviewOwner.canSubmit, 'pending review owner no edit/start/submit');

const managerActionOwnerPending = caps({
  currentRole: 'manager',
  currentProfileId: 'owner-2',
  actionStatus: 'PENDING_VERIFICATION',
  actionOwnerProfileId: 'owner-2',
});
assert(!managerActionOwnerPending.canVerify && !managerActionOwnerPending.canReturn, 'manager action owner self verify blocked');
assert(managerActionOwnerPending.canCancel, 'manager action owner can cancel pending');

const adminActionOwnerPending = caps({
  currentRole: 'admin',
  currentProfileId: 'owner-2',
  actionStatus: 'PENDING_VERIFICATION',
  actionOwnerProfileId: 'owner-2',
});
assert(!adminActionOwnerPending.canVerify && !adminActionOwnerPending.canReturn, 'admin action owner self verify blocked');

const verified = caps({ actionStatus: 'VERIFIED' });
assert(!verified.canEdit && !verified.canStart && !verified.canSubmit && !verified.canVerify && !verified.canReturn && !verified.canCancel, 'verified all false');
const cancelled = caps({ actionStatus: 'CANCELLED' });
assert(!cancelled.canEdit && !cancelled.canStart && !cancelled.canSubmit && !cancelled.canVerify && !cancelled.canReturn && !cancelled.canCancel, 'cancelled all false');
const unknown = caps({ actionStatus: 'UNKNOWN' });
assert(!unknown.canEdit && !unknown.canStart && !unknown.canSubmit && !unknown.canVerify && !unknown.canReturn && !unknown.canCancel, 'unknown all false');

const closedAdmin = caps({ reviewStatus: 'closed', actionStatus: 'OPEN' });
assert(!closedAdmin.canEdit && !closedAdmin.canStart && !closedAdmin.canSubmit && !closedAdmin.canVerify && !closedAdmin.canReturn && !closedAdmin.canCancel, 'closed admin read-only');

const viewerActionOwner = caps({
  currentRole: 'viewer',
  currentProfileId: 'owner-2',
  actionOwnerProfileId: 'owner-2',
});
assert(!viewerActionOwner.canStart && !viewerActionOwner.canSubmit && !viewerActionOwner.canEdit && !viewerActionOwner.canCancel, 'viewer action owner read-only');

assert(countNonFinalActions([
  actionStatus('OPEN'),
  actionStatus('IN_PROGRESS'),
  actionStatus('PENDING_VERIFICATION'),
  actionStatus('UNKNOWN'),
  actionStatus('VERIFIED'),
  actionStatus('CANCELLED'),
]) === 4, 'nonfinal count includes unknown');
assert(getActionSectionNonFinalWarning([
  actionStatus('VERIFIED'),
  actionStatus('CANCELLED'),
]) === null, 'final actions no warning');
assert(getActionSectionNonFinalWarning([
  actionStatus('OPEN'),
  actionStatus('CANCELLED'),
]) === '当前还有 1 项改善行动尚未闭环，关闭复盘时系统会进行最终校验。', 'nonfinal warning message');
assert(getActionSectionEmptyCopy(true).description === '可为本次复盘创建需要跟进的整改事项', 'empty create copy');
assert(getActionSectionEmptyCopy(false).description === null, 'empty read-only copy');

const versionError = getActionCommandErrorPresentation({ status: 409, code: 'VERSION_CONFLICT', message: 'RAW' });
assert(versionError.shouldRefetchActions && versionError.shouldCloseDialog, 'version conflict recovery');
assert(!versionError.message.includes('RAW'), 'version conflict raw hidden');
const transitionError = getActionCommandErrorPresentation({ status: 409, code: 'INVALID_TRANSITION' });
assert(transitionError.shouldRefetchActions && transitionError.shouldCloseDialog, 'invalid transition recovery');
const selfError = getActionCommandErrorPresentation({ status: 403, code: 'SELF_VERIFICATION_FORBIDDEN' });
assert(selfError.message === '负责人不能验证自己的行动' && selfError.shouldRefetchActions, 'self verification explicit');
const forbiddenError = getActionCommandErrorPresentation({ status: 403, code: 'FORBIDDEN' });
assert(forbiddenError.shouldRefetchActions, 'forbidden refetch');
const invalidOwner = getActionCommandErrorPresentation({ status: 400, code: 'INVALID_OWNER' });
assert(invalidOwner.shouldReloadOwnerDirectory && invalidOwner.shouldRefetchActions && !invalidOwner.shouldCloseDialog, 'invalid owner reload directory');
const genericError = getActionCommandErrorPresentation({ status: 500, code: 'SECRET_CODE', message: 'RAW SECRET' });
assert(genericError.message === '操作失败，请稍后重试', 'generic safe message');
assert(!genericError.message.includes('RAW') && !genericError.message.includes('SECRET'), 'generic raw hidden');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
