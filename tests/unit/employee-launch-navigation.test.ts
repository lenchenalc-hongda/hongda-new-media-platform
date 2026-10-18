// Employee launch navigation regression tests
import { getVisiblePortalGroups } from '../../src/lib/constants/navigation';

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

const groups = getVisiblePortalGroups({
  projectReviewCenterEnabled: true,
  customerProjectCenterEnabled: true,
  canAccessCustomerProjectCenter: true,
  canAccessCustomerProjectTeam: false,
  canAccessCustomerProjectSettings: false,
  currentRole: 'sales',
});

console.log('=== Employee Launch Navigation ===');

assert(groups[0]?.id === 'sales', 'sales portal is the first workspace entry');
assert(groups.some(group => group.id === 'review'), 'review portal remains visible to sales');
assert(groups.some(group => group.id === 'media'), 'media portal remains when it has sales-accessible pages');
assert(!groups.some(group => group.id === 'official'), 'official portal is hidden from sales');
assert(!groups.some(group => group.id === 'knowledge'), 'knowledge portal is hidden from sales');
assert(!groups.some(group => group.id === 'admin'), 'admin portal is hidden from sales');

const sales = groups.find(group => group.id === 'sales');
assert(!!sales, 'sales portal exists');
assert(!sales?.items.some(item => item.path === '/customer-projects/team'), 'team board is hidden from sales');
assert(!sales?.items.some(item => item.path === '/customer-projects/settings'), 'CPC settings are hidden from sales');

const media = groups.find(group => group.id === 'media');
const mediaPaths = media?.items.map(item => item.path) ?? [];
assert(mediaPaths.includes('/dashboard'), 'sales keeps dashboard access');
assert(mediaPaths.includes('/leads'), 'sales keeps lead access');
assert(!mediaPaths.includes('/scripts'), 'sales does not see script factory');
assert(!mediaPaths.includes('/topics'), 'sales does not see topic library');
assert(!mediaPaths.includes('/reports'), 'sales does not see reports');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
