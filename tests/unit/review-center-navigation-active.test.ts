// ===== Review Center navigation active-state regression tests =====
import { PORTAL_GROUPS, getActiveNavItemPath } from '../../src/lib/constants/navigation';

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

var reviewItems = PORTAL_GROUPS.find(group => group.id === 'review')!.items;

function active(path: string): string | null {
  return getActiveNavItemPath(path, reviewItems);
}

console.log('=== Review Center Navigation Active State ===');

assert(active('/review-center') === '/review-center', 'review home active only for exact home');
assert(active('/review-center/new') === '/review-center/new', 'new review active');
assert(active('/review-center/reviews') === '/review-center/reviews', 'all reviews active');
assert(active('/review-center/reviews/mine') === '/review-center/reviews/mine', 'mine wins over reviews prefix');
assert(active('/review-center/reviews/abc') === '/review-center/reviews', 'detail maps to all reviews');
assert(active('/review-center/approvals') === '/review-center/approvals', 'approvals active');
assert(active('/review-center/actions') === '/review-center/actions', 'actions active');
assert(active('/review-center/actions/overdue') === '/review-center/actions', 'action subpage maps to actions');
assert(active('/review-center/analytics') === '/review-center/analytics', 'analytics active');
assert(active('/review-center/analytics/projects') === '/review-center/analytics', 'analytics subpage maps to analytics');
assert(active('/review-center/cases') === '/review-center/cases', 'cases active');
assert(active('/review-center/cases/abc') === '/review-center/cases', 'case detail maps to cases');
assert(active('/review-center/downloads') === '/review-center/downloads', 'downloads active');
assert(active('/review-center/settings') === null, 'disabled settings has no active state');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
