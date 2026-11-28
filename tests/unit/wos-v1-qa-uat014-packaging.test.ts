import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(
  'docs/workshop-order-system/qa-fixture/'
    + 'production-m2-uat-20261126/inputs-uat014.json',
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
const imageRegisterInstall = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/'
    + 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_COMPAT_INSTALL_NOT_AUTHORIZED.sql',
  'utf8',
);
const imageRegisterRollback = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/'
    + 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_COMPAT_ROLLBACK_NOT_AUTHORIZED.sql',
  'utf8',
);

assert.equal(input.authorizationId, 'WOS-V1-PRODUCTION-M2-QA-UAT-014');
assert(
  runner.includes(
    'production-m2-uat-20261126/inputs-uat014.json',
  ),
);
assert(!runner.includes(
  'production-m2-uat-20261126/inputs-uat011.json',
));
assert.equal(
  input.sourceParentHead,
  'c50bae4c7234c690e33d47450f4ce7aee599b385',
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
const consumedV2Ids = new Set([
  '43eaf924-a0c1-48df-a17e-88c8b0069444',
  '6ff1d4dc-5526-4392-be79-65baf96cdab9',
  '39e079c2-d88d-4332-8a97-6a5fa5362d14',
  '51004463-2410-4e7c-a32d-e6dfc860523b',
  'c06a3c22-1293-4d91-8f36-ccb8dbf955a7',
  '189e03ce-20b9-4956-9827-9b77faa8f644',
  '23b69b5e-683c-4126-b9e8-d3651c114179',
  'ec4a9034-aae5-4e64-9464-5ae820556601',
  '1fd6ab38-4b0d-46e3-8b9a-50634fbae41c',
  'c4fdc9d7-0a60-45ca-bbd0-29ef2fa0f741',
  'b9687a0b-8d5b-4783-ae10-ed9cc415c545',
  '1bc10d50-ac7d-4311-a6fa-48329ae8f6d6',
]);
for (const image of input.images.v2) {
  assert.match(image.imageId, /^[a-f0-9-]{36}$/i);
  assert(
    !consumedV2Ids.has(image.imageId),
    `UAT-014 reuses consumed V2 image ID ${image.imageId}`,
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
assert(dbCloser.includes('e646bb29-0fb2-47e5-ad4e-d59428d3ca22'));
assert(dbCloser.includes('install-v2-image-register-compat'));
assert(dbCloser.includes('rollback-v2-image-register-compat'));
assert(
  runner.includes(
    'WOS_V1_PRODUCTION_M2_QA_BUSINESS_UAT_014_20261128.json',
  ),
);
assert(
  !runner.includes(
    'WOS_V1_PRODUCTION_M2_QA_BUSINESS_UAT_006_20261127.json',
  ),
);
assert(appActivate.includes('WOS-V1-PRODUCTION-M2-QA-UAT-014'));
assert(appActivate.includes('e646bb29-0fb2-47e5-ad4e-d59428d3ca22'));
assert(
  closerOnlyInstall.includes(
    "p_authorization_id<>'WOS-V1-PRODUCTION-M2-QA-UAT-014'",
  ),
);
assert(!closerOnlyInstall.includes('WOS-V1-PRODUCTION-M2-QA-UAT-005'));
assert(
  imageRegisterInstall.includes(
    'f508ce6444cc679662c2f4622003bfca4baf27b5b2cf02d01594aeb8d9f72187',
  ),
);
assert(
  imageRegisterInstall.includes(
    '40231c055eae538f101ca7394880e1f746adcccb8265b07a832909238b678f0d',
  ),
);
assert(
  imageRegisterInstall.includes(
    "v_order.workflow_status='NEEDS_INFORMATION'",
  ),
);
assert(
  imageRegisterInstall.includes(
    "v_order.version_label ~ '^V[2-9][0-9]{0,20}$'",
  ),
);
assert(
  imageRegisterRollback.includes(
    'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_RESTORE_MISMATCH',
  ),
);

console.log('wos-v1-qa-uat014-packaging.test.ts: PASS');
