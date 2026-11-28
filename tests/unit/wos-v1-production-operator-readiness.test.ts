import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routeAccess = readFileSync(
  'src/lib/workshop-orders/route-access.ts',
  'utf8',
);
const appContract = readFileSync(
  'src/lib/workshop-orders/production-app-contract.ts',
  'utf8',
);
const handler = readFileSync(
  'src/lib/workshop-orders/production-app-handler.ts',
  'utf8',
);
const operatorSql = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_OPERATOR_PROFILE_BIND_NOT_AUTHORIZED.sql',
  'utf8',
);
const pilotDoc = readFileSync(
  'docs/workshop-order-system/production-readiness/WOS_V1_PRODUCTION_OPERATOR_AND_OFFICE_PILOT_20261128.md',
  'utf8',
);

assert(routeAccess.includes("  'sales',"));
assert(appContract.includes(
  "WOS_V1_APP_OFFICE_ROLES = ['admin', 'manager', 'sales']",
));
assert(appContract.includes(
  "WOS_V1_APP_OPERATOR_ROLES = ['admin', 'manager', 'operator']",
));
assert(handler.includes(
  "if (query.view === 'office' || query.view === 'returned')",
));
assert(handler.includes(
  "} else if (!['admin', 'manager', 'operator'].includes(auth.actor.role))",
));

for (const marker of [
  "wos_v1.production_operator_binding_authorized",
  "wos_v1.operator_auth_user_id",
  "wos_v1.operator_email",
  "WOS_V1_JAKE_SALES_ROLE_MUST_REMAIN_UNCHANGED",
  "auth_user.email_confirmed_at IS NOT NULL",
  "v_existing.role NOT IN ('viewer', 'operator')",
  "role = 'operator'",
]) assert(operatorSql.includes(marker), `operator SQL missing ${marker}`);

assert(!operatorSql.includes('INSERT INTO auth.users'));
assert(!operatorSql.includes('UPDATE auth.users'));
assert(!operatorSql.includes('GRANT '));
assert(pilotDoc.includes('Jake must not be promoted to Operator'));
assert(pilotDoc.includes(
  'No duplicate invitation, password reset, Auth user creation,',
));

console.log('wos-v1-production-operator-readiness.test.ts: PASS');
console.log('WOS_V1_JAKE_OFFICE_ROLE=PASS');
console.log('WOS_V1_OPERATOR_BINDING_TEMPLATE_GUARDED=PASS');
console.log('WOS_V1_OPERATOR_ACCOUNT_CREATION=NOT_AUTHORIZED');
