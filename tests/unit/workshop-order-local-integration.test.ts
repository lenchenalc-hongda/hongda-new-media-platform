import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  getPortalForPath,
  PORTAL_GROUPS,
} from '@/lib/constants/navigation';

const workshop = PORTAL_GROUPS.find(group => group.id === 'workshop');
assert.ok(workshop, 'workshop portal group must exist');
assert.equal(getPortalForPath('/workshop-orders'), 'workshop');
assert.equal(getPortalForPath('/workshop-orders/readiness'), 'workshop');

for (const path of [
  '/workshop-orders',
  '/workshop-orders/production/new',
  '/workshop-orders/inbox',
  '/workshop-orders/readiness',
  '/workshop-orders/sampling/new',
  '/workshop-orders/schedule',
]) {
  assert.ok(
    workshop.items.some(item => item.path === path),
    `workshop navigation must include ${path}`,
  );
}

const readinessPage = readFileSync(
  'src/app/workshop-orders/readiness/page.tsx',
  'utf8',
);
assert.match(readinessPage, /V1 禁止自动开工/);
assert.match(readinessPage, /canExposeP2QaReadonlyPreview/);
assert.ok(
  existsSync('src/components/workshop-orders/LiveQaHandoffReadOnly.tsx'),
  'read-only handoff detail component must be integrated',
);
assert.ok(
  existsSync('src/components/workshop-orders/LiveQaWorkshopReadiness.tsx'),
  'material readiness workbench must be integrated',
);
assert.ok(
  existsSync('src/lib/workshop-orders/p2-visual-evidence.ts'),
  'four-category private proof evaluator must be integrated',
);

console.log('workshop-order-local-integration.test.ts: PASS');
console.log('WOS_LOCAL_NAVIGATION_AND_READINESS_ROUTES=PASS');
