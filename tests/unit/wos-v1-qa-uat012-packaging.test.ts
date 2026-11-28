import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(
  'docs/workshop-order-system/qa-fixture/'
    + 'production-m2-uat-20261126/inputs-uat012.json',
  'utf8',
));
const runner = readFileSync(
  'scripts/wos-production-readiness/wos-v1-qa-business-uat.mjs',
  'utf8',
);
const edgeCloser = readFileSync(
  'scripts/wos-production-readiness/wos-v1-qa-uat-edge-closer.mjs',
  'utf8',
);
const dbCloser = readFileSync(
  'scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs',
  'utf8',
);
const appActivate = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/'
    + 'WOS_V1_QA_UAT_APP_ACTIVATE_NOT_AUTHORIZED.sql',
  'utf8',
);
const closerOnlyInstall = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/'
    + 'WOS_V1_QA_CLOSER_ONLY_INSTALL_NOT_AUTHORIZED.sql',
  'utf8',
);

assert.equal(input.authorizationId, 'WOS-V1-PRODUCTION-M2-QA-UAT-012');
assert(
  runner.includes(
    'production-m2-uat-20261126/inputs-uat012.json',
  ),
);
assert(!runner.includes(
  'production-m2-uat-20261126/inputs-uat011.json',
));
assert.equal(
  input.sourceParentHead,
  '5a9e62e4254d59cb874f9d84d2911c9b916d04b7',
);
assert.equal(input.mode, 'RESUME_EXISTING_ORDER');
assert.equal(
  input.resumeOrderId,
  '3ade0180-e6bf-49da-b80b-fd00cd1948a8',
);
assert.equal(input.resumeExpectedVersion, 5);
assert.equal(input.resumeExpectedVersionLabel, 'V2');
assert.equal(input.resumeExpectedWorkflowStatus, 'NEEDS_INFORMATION');
assert.equal(input.limits.maxNewOrders, 0);
assert.equal(input.limits.maxCreateCalls, 0);
assert.equal(input.environment.WOS_V1_QA_APP_WRITES_ENABLED, 'false');
assert.equal(
  input.environment.WOS_V1_QA_UAT_M2_WRITES_ENABLED,
  'false',
);
assert.equal(input.images.v2.length, 4);
assert.equal(new Set(input.images.v2.map(
  (image: { imageId: string }) => image.imageId,
)).size, 4);
const consumedUat011V2Ids = new Set([
  '43eaf924-a0c1-48df-a17e-88c8b0069444',
  '6ff1d4dc-5526-4392-be79-65baf96cdab9',
  '39e079c2-d88d-4332-8a97-6a5fa5362d14',
  '51004463-2410-4e7c-a32d-e6dfc860523b',
]);
for (const image of input.images.v2) {
  assert.match(image.imageId, /^[a-f0-9-]{36}$/i);
  assert(
    !consumedUat011V2Ids.has(image.imageId),
    `UAT-012 reuses consumed V2 image ID ${image.imageId}`,
  );
}

for (const marker of [
  'WOS_UAT_RESUME_ORDER_ID',
  'RESUME_EXISTING_ORDER',
  "existingOrder.workflowStatus",
  "input.resumeExpectedWorkflowStatus",
  "if (!RESUME_MODE)",
  "test.createCalls = 0",
  'resumedAfterV1',
  "mode: RESUME_MODE ? 'RESUME_EXISTING_ORDER'",
  'createCalls',
  'WOS_UAT_CREATE_FORBIDDEN_IN_RESUME_MODE',
  'input.limits?.maxNewOrders',
  'input.limits?.maxCreateCalls',
]) {
  assert(runner.includes(marker), `UAT runner missing ${marker}`);
}
assert(!runner.includes('WOS-V1-PRODUCTION-M2-QA-UAT-005'));
assert(!runner.includes('WOS-V1-PRODUCTION-M2-QA-UAT-006'));
assert(!runner.includes('WOS-V1-PRODUCTION-M2-QA-UAT-007'));
assert(!runner.includes('WOS-V1-PRODUCTION-M2-QA-UAT-008'));
assert(
  runner.indexOf('if (RESUME_MODE)')
    < runner.indexOf('createBody = {'),
);

assert(edgeCloser.includes('WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY'));
assert(edgeCloser.includes('credential-preflight'));
assert(edgeCloser.includes('WOS_V1_QA_EDGE_PROBE_EXPECT'));
assert(edgeCloser.includes('CLOSE_UNVERIFIED'));
assert(edgeCloser.includes('probeEdgeOnce'));
assert(edgeCloser.includes('attempt <= 3'));
assert(dbCloser.includes('WOS_V1_QA_APP_EXECUTION_ID'));
assert(dbCloser.includes('c32a81d1-b997-4cfa-a346-871461a1af47'));
assert(
  runner.includes(
    'WOS_V1_PRODUCTION_M2_QA_BUSINESS_UAT_012_20261128.json',
  ),
);
assert(
  !runner.includes(
    'WOS_V1_PRODUCTION_M2_QA_BUSINESS_UAT_006_20261127.json',
  ),
);
assert(appActivate.includes('WOS-V1-PRODUCTION-M2-QA-UAT-012'));
assert(appActivate.includes('c32a81d1-b997-4cfa-a346-871461a1af47'));
assert(
  closerOnlyInstall.includes(
    "p_authorization_id<>'WOS-V1-PRODUCTION-M2-QA-UAT-012'",
  ),
);
assert(!closerOnlyInstall.includes('WOS-V1-PRODUCTION-M2-QA-UAT-005'));

console.log('wos-v1-qa-uat012-packaging.test.ts: PASS');
