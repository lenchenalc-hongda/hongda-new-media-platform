// ===== Review Center Action Overdue Helpers =====
import {
  getShanghaiBusinessDate,
  isActionOverdue,
  isValidDateOnly,
} from '../../src/lib/review-center/actions';

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

const afterMidnight = new Date('2026-08-25T16:01:00Z');
const beforeMidnight = new Date('2026-08-25T15:59:00Z');

console.log('\n=== Review Center Action Overdue Helpers ===');

assert(getShanghaiBusinessDate(beforeMidnight) === '2026-08-25', 'UTC 15:59 is Shanghai same day');
assert(getShanghaiBusinessDate(afterMidnight) === '2026-08-26', 'UTC 16:01 is Shanghai next day');

assert(isActionOverdue({ dueDate: '2026-08-25', status: 'OPEN', now: afterMidnight }) === true, 'OPEN yesterday overdue');
assert(isActionOverdue({ dueDate: '2026-08-26', status: 'OPEN', now: afterMidnight }) === false, 'OPEN today not overdue');
assert(isActionOverdue({ dueDate: '2026-08-27', status: 'OPEN', now: afterMidnight }) === false, 'OPEN tomorrow not overdue');
assert(isActionOverdue({ dueDate: '2026-08-25', status: 'IN_PROGRESS', now: afterMidnight }) === true, 'IN_PROGRESS past overdue');
assert(isActionOverdue({ dueDate: '2026-08-25', status: 'PENDING_VERIFICATION', now: afterMidnight }) === true, 'PENDING past overdue');
assert(isActionOverdue({ dueDate: '2026-08-25', status: 'VERIFIED', now: afterMidnight }) === false, 'VERIFIED past not overdue');
assert(isActionOverdue({ dueDate: '2026-08-25', status: 'CANCELLED', now: afterMidnight }) === false, 'CANCELLED past not overdue');
assert(isActionOverdue({ dueDate: '2026-08-25', status: 'UNKNOWN', now: afterMidnight }) === false, 'UNKNOWN past fail closed');
assert(isActionOverdue({ dueDate: '2026-08-26', status: 'OPEN', now: beforeMidnight }) === false, 'due today before boundary not overdue');
assert(isActionOverdue({ dueDate: '2026-08-25', status: 'OPEN', now: beforeMidnight }) === false, 'due same Shanghai day before boundary not overdue');
assert(isActionOverdue({ dueDate: 'bad-date', status: 'OPEN', now: afterMidnight }) === false, 'invalid dueDate safe false');
assert(isActionOverdue({ dueDate: '2026-08-25', status: 'OPEN', now: new Date('invalid') }) === false, 'invalid now safe false');

assert(isValidDateOnly('2026-02-28') === true, 'valid leap-adjacent date');
assert(isValidDateOnly('2026-02-30') === false, 'invalid calendar date rejected');
assert(isValidDateOnly('2026-99-99') === false, 'invalid month/day rejected');
assert(isValidDateOnly('2026-08-25T00:00:00Z') === false, 'timestamp rejected as date-only');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
