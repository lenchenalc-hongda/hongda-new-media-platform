// ===== Review status label consistency regression tests =====
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_ENABLED,
  reviewStatusLabel,
  reviewStatusDisplayLabel,
} from '../../src/lib/review-center/formatters';
import { formatDashboardStatusLabel } from '../../src/lib/review-center/dashboard-presentation';

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

console.log('=== Review Status Label Consistency ===');

assert(reviewStatusLabel('submitted') === '待确认', 'formatter uses 待确认');
assert(reviewStatusDisplayLabel('submitted') === '待确认', 'display formatter uses 待确认');
assert(reviewStatusDisplayLabel('in_review') === '复盘中（未启用）', 'unreleased status marked unavailable');

for (const status of Object.keys(REVIEW_STATUS_LABELS) as Array<keyof typeof REVIEW_STATUS_LABELS>) {
  assert(
    formatDashboardStatusLabel(status) === reviewStatusDisplayLabel(status),
    `dashboard and list agree for ${status}`,
  );
}

assert(REVIEW_STATUS_ENABLED.draft === true, 'draft enabled');
assert(REVIEW_STATUS_ENABLED.submitted === true, 'submitted enabled');
assert(REVIEW_STATUS_ENABLED.closed === true, 'closed enabled');
assert(REVIEW_STATUS_ENABLED.in_review === false, 'in_review not enabled');
assert(REVIEW_STATUS_ENABLED.action_required === false, 'action_required not enabled');
assert(REVIEW_STATUS_ENABLED.verifying === false, 'verifying not enabled');
assert(REVIEW_STATUS_ENABLED.archived === false, 'archived not enabled');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
