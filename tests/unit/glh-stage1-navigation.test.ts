import assert from 'node:assert/strict';
import {
  getActiveNavItemPath,
  getPortalForPath,
  getVisiblePortalGroups,
} from '../../src/lib/constants/navigation';
import {
  canRoleAccessPage,
  getPageSlugFromRoute,
  getRouteFromPage,
} from '../../src/lib/auth/roles';

const base = {
  projectReviewCenterEnabled:true,
  customerProjectCenterEnabled:true,
  canAccessCustomerProjectCenter:true,
};

const glhPaths = [
  '/global-lead-hub',
  '/global-lead-hub/leads',
  '/global-lead-hub/leads/new',
  '/global-lead-hub/tasks',
  '/global-lead-hub/leads/00000000-0000-4000-8000-000000009001',
];

for (const path of glhPaths) {
  assert.equal(getPageSlugFromRoute(path), 'global_lead_hub');
  assert.equal(getPortalForPath(path), 'glh');
}
assert.equal(getRouteFromPage('global_lead_hub'),'/global-lead-hub');
for (const role of ['admin','manager','sales'] as const) {
  assert(canRoleAccessPage(role,'global_lead_hub'));
  const visible=getVisiblePortalGroups({ ...base,currentRole:role });
  const group=visible.find(item=>item.id==='glh');
  assert(group,role+' must see the GLH portal');
  assert(group.items.some(item=>item.path==='/global-lead-hub/leads/new'));
  assert.equal(
    getActiveNavItemPath('/global-lead-hub/leads/new',group.items),
    '/global-lead-hub/leads/new',
  );
}
for (const role of ['operator','viewer'] as const) {
  assert(!canRoleAccessPage(role,'global_lead_hub'));
  const visible=getVisiblePortalGroups({ ...base,currentRole:role });
  assert(!visible.some(item=>item.id==='glh'),role+' must not see GLH links');
}
const hidden=getVisiblePortalGroups({...base,currentRole:null});
assert(!hidden.some(item=>item.id==='glh'),'Unauthenticated/default role cannot see GLH');
assert.equal(getPageSlugFromRoute('/leads'),'leads');
assert.equal(getPortalForPath('/leads'),'media');
assert.equal(getPageSlugFromRoute('/customer-projects'),'customer_project_center');
console.log('GLH Stage 1 portal navigation and role visibility tests passed');
