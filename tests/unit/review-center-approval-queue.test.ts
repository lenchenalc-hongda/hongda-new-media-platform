// ===== Review Center approval queue tests =====
import fs from 'node:fs';
import {
  canHandleSubmittedReview,
  getLifecyclePresentation,
} from '../../src/lib/review-center/lifecycle-presentation';

var passed = 0;
var failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + msg);
  }
}

console.log('=== Review Center Approval Queue ===');

assert(canHandleSubmittedReview('admin') === true, 'admin can handle submitted');
assert(canHandleSubmittedReview('manager') === true, 'manager can handle submitted');
assert(canHandleSubmittedReview('operator') === false, 'operator cannot handle submitted');
assert(canHandleSubmittedReview('sales') === false, 'sales cannot handle submitted');
assert(canHandleSubmittedReview('viewer') === false, 'viewer cannot handle submitted');
assert(canHandleSubmittedReview(null) === false, 'unknown role cannot handle submitted');

function detail(role: string) {
  return getLifecyclePresentation({
    status: 'submitted',
    currentRole: role,
    currentProfileId: 'profile-1',
    ownerId: 'owner-1',
    pmoId: null,
  });
}

assert(detail('admin').canClose === true, 'admin detail can close submitted');
assert(detail('manager').canClose === true, 'manager detail can close submitted');
assert(detail('operator').canClose === false, 'operator detail cannot close submitted');

const source = fs.readFileSync('src/app/review-center/approvals/page.tsx', 'utf8');
assert(source.includes('/api/review-center/reviews?status=submitted'), 'queue uses submitted status query');
assert(source.includes('当前没有需要你处理的审核事项。'), 'queue empty state text');
assert(!source.includes('DEBUG RACE'), 'no QA hardcode in queue page');
assert(!source.includes('CASE_PAR_'), 'no QA hardcode in queue page');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
