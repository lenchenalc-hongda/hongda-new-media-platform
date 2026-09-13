// ===== Review Center Action Section State Unit Tests =====
import {
  ACTION_READ_ERROR_MESSAGE,
  ACTION_REFRESH_FAILURE_MESSAGE,
  countNonFinalActions,
  getActionCommandErrorPresentation,
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

function status(value: string) {
  return { status: value as ActionReadDto['status'] };
}

console.log('\n=== Review Center Action Section State ===');

assert(ACTION_READ_ERROR_MESSAGE === '改善行动加载失败，请重试', 'dedicated read error copy');
assert(
  ACTION_REFRESH_FAILURE_MESSAGE === '操作已完成，但最新数据刷新失败，请手动重试。',
  'command success refresh failure copy',
);

assert(countNonFinalActions([]) === 0, 'empty nonfinal count');
assert(countNonFinalActions([
  status('OPEN'),
  status('IN_PROGRESS'),
  status('PENDING_VERIFICATION'),
  status('UNKNOWN'),
]) === 4, 'all nonfinal statuses counted');
assert(countNonFinalActions([
  status('VERIFIED'),
  status('CANCELLED'),
]) === 0, 'final statuses excluded');
assert(countNonFinalActions([
  status('OPEN'),
  status('VERIFIED'),
  status('CANCELLED'),
  status('PENDING_VERIFICATION'),
]) === 2, 'mixed nonfinal count');

assert(getActionSectionNonFinalWarning([]) === null, 'no warning when empty');
assert(getActionSectionNonFinalWarning([status('VERIFIED')]) === null, 'no warning all final');
assert(
  getActionSectionNonFinalWarning([status('OPEN'), status('VERIFIED')])
    === '当前还有 1 项改善行动尚未闭环，关闭复盘时系统会进行最终校验。',
  'nonfinal warning copy',
);

const emptyWithCreate = getActionSectionEmptyCopy(true);
assert(emptyWithCreate.title === '暂无改善行动', 'empty title');
assert(emptyWithCreate.description === '可为本次复盘创建需要跟进的整改事项', 'empty create description');
assert(getActionSectionEmptyCopy(false).description === null, 'empty read-only description');

const versionConflict = getActionCommandErrorPresentation({
  status: 409,
  code: 'VERSION_CONFLICT',
  message: 'RAW SECRET',
});
assert(
  versionConflict.message === '这条改善行动已被其他人更新，已为你刷新最新内容，请重新确认后操作。'
  && versionConflict.shouldRefetchActions
  && versionConflict.shouldCloseDialog,
  'version conflict closes and refetches',
);
assert(!versionConflict.message.includes('RAW SECRET'), 'version conflict raw hidden');

const invalidTransition = getActionCommandErrorPresentation({
  status: 409,
  code: 'INVALID_TRANSITION',
  message: 'RAW',
});
assert(invalidTransition.shouldRefetchActions && invalidTransition.shouldCloseDialog, 'invalid transition recovery');

const invalidOwner = getActionCommandErrorPresentation({
  status: 400,
  code: 'INVALID_OWNER',
  message: 'RAW',
});
assert(
  invalidOwner.message === '负责人已不可分配，请重新选择'
  && invalidOwner.shouldReloadOwnerDirectory
  && invalidOwner.shouldRefetchActions
  && !invalidOwner.shouldCloseDialog,
  'invalid owner reloads owner directory and keeps dialog',
);

const selfVerify = getActionCommandErrorPresentation({
  status: 403,
  code: 'SELF_VERIFICATION_FORBIDDEN',
  message: 'RAW',
});
assert(selfVerify.message === '负责人不能验证自己的行动' && selfVerify.shouldRefetchActions, 'self verify explicit');

const generic = getActionCommandErrorPresentation({
  status: 500,
  code: 'SOME_INTERNAL_SECRET',
  message: 'RAW STACK TRACE',
});
assert(generic.message === '操作失败，请稍后重试', 'generic safe copy');
assert(!generic.message.includes('STACK') && !generic.message.includes('SECRET'), 'generic raw hidden');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
