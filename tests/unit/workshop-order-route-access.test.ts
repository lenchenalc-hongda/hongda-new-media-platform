import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canAccessWorkshopOrdersPage,
  isWorkshopOrdersFeatureEnabled,
  isWorkshopOrdersPageRoleAllowed,
  isWorkshopOrdersRoute,
  WORKSHOP_ORDERS_PAGE_ROLES,
} from '../../src/lib/workshop-orders/route-access';

const routes = [
  '/workshop-orders',
  '/workshop-orders/inbox',
  '/workshop-orders/readiness',
  '/workshop-orders/production/new',
  '/workshop-orders/qa-handoff-readonly',
  '/workshop-orders/sampling/new',
  '/workshop-orders/schedule',
] as const;

for (const pathname of routes) {
  assert.equal(isWorkshopOrdersRoute(pathname), true, `${pathname} must be gated`);
}
assert.equal(isWorkshopOrdersRoute('/workshop-order'), false);
assert.equal(isWorkshopOrdersRoute('/api/workshop-orders/inbox'), false);

for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes']) {
  assert.equal(isWorkshopOrdersFeatureEnabled(value), false, `flag ${String(value)} must fail closed`);
}
assert.equal(isWorkshopOrdersFeatureEnabled('true'), true);

for (const role of WORKSHOP_ORDERS_PAGE_ROLES) {
  assert.equal(isWorkshopOrdersPageRoleAllowed(role), true, `${role} must be allowed`);
}
for (const role of ['viewer', 'workshop', 'technician', 'anonymous', '', undefined, null]) {
  assert.equal(isWorkshopOrdersPageRoleAllowed(role as any), false, `${String(role)} must be denied`);
}

assert.equal(canAccessWorkshopOrdersPage({
  featureValue: undefined,
  authenticated: true,
  role: 'admin',
}), false);
assert.equal(canAccessWorkshopOrdersPage({
  featureValue: 'false',
  authenticated: true,
  role: 'admin',
}), false);
assert.equal(canAccessWorkshopOrdersPage({
  featureValue: 'true',
  authenticated: false,
  role: null,
}), false);
assert.equal(canAccessWorkshopOrdersPage({
  featureValue: 'true',
  authenticated: true,
  role: 'viewer',
}), false);
assert.equal(canAccessWorkshopOrdersPage({
  featureValue: 'true',
  authenticated: true,
  role: 'admin',
}), true);
assert.equal(canAccessWorkshopOrdersPage({
  featureValue: 'true',
  authenticated: true,
  role: 'operator',
}), true);

const layout = readFileSync('src/app/workshop-orders/layout.tsx', 'utf8');
assert(layout.includes("export const dynamic = 'force-dynamic'"));
assert(layout.includes('getCurrentUserReadOnly'));
assert(layout.includes('notFound()'));
assert(!layout.includes('useEffect'));
assert(!layout.includes('localStorage'));

console.log(`WOS_ROUTE_ACCESS_PATHS=${routes.length}`);
console.log(`WOS_ROUTE_ACCESS_ALLOWED_ROLES=${WORKSHOP_ORDERS_PAGE_ROLES.length}`);
console.log('WOS_ROUTE_ACCESS_FLAG_FAIL_CLOSED=PASS');
console.log('WOS_ROUTE_ACCESS_SERVER_LAYOUT=PASS');
console.log('workshop-order-route-access.test.ts: PASS');
