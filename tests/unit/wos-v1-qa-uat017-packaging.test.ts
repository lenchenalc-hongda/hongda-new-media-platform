import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(
  'docs/workshop-order-system/qa-fixture/'
    + 'production-m2-uat-20261126/inputs-uat017.json',
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
const qaM2Install = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/'
    + 'WOS_V1_QA_UAT_M2_INSTALL_NOT_AUTHORIZED.sql',
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
const proofMirrorInstall = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/'
    + 'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_INSTALL_NOT_AUTHORIZED.sql',
  'utf8',
);
const proofMirrorRollback = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/'
    + 'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_ROLLBACK_NOT_AUTHORIZED.sql',
  'utf8',
);
const currentOrderProofInstall = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/'
    + 'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_COMPAT_INSTALL_NOT_AUTHORIZED.sql',
  'utf8',
);
const currentOrderProofRollback = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/'
    + 'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_COMPAT_ROLLBACK_NOT_AUTHORIZED.sql',
  'utf8',
);

assert.equal(input.authorizationId, 'WOS-V1-PRODUCTION-M2-QA-UAT-017');
assert(
  runner.includes(
    'production-m2-uat-20261126/inputs-uat017.json',
  ),
);
assert(!runner.includes(
  'production-m2-uat-20261126/inputs-uat011.json',
));
assert.equal(
  input.sourceParentHead,
  '1e50c1c3aa21bc5a0385e02ea7d7b1041022677a',
);
assert.equal(input.mode, 'RESUME_EXISTING_ORDER');
assert.equal(input.resumeStage, 'MATERIAL_INPUTS_READY');
assert.equal(
  input.resumeOrderId,
  '3ade0180-e6bf-49da-b80b-fd00cd1948a8',
);
assert.equal(input.resumeExpectedVersion, 7);
assert.equal(input.resumeExpectedVersionLabel, 'V2');
assert.equal(input.resumeExpectedWorkflowStatus, 'WAITING_MATERIAL');
assert.equal(input.limits.maxNewOrders, 0);
assert.equal(input.limits.maxCreateCalls, 0);
assert.equal(input.postReleaseProofRefreshProbe, true);
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
  '16eef570-9940-4661-9f04-c48ebfaac513',
  '41bb8791-60ed-4fcc-a707-795967330065',
  '443077ce-1c21-4d7d-b592-3e89a3a10f79',
  '98506522-729f-4feb-9789-2a630aaee54a',
]);
for (const image of input.images.v2) {
  assert.match(image.imageId, /^[a-f0-9-]{36}$/i);
  assert(
    !consumedV2Ids.has(image.imageId),
    `UAT-017 reuses consumed V2 image ID ${image.imageId}`,
  );
}

for (const marker of [
  'WOS_UAT_RESUME_ORDER_ID',
  'RESUME_EXISTING_ORDER',
  'RESUME_AT_MATERIAL',
  'MATERIAL_INPUTS_READY',
  'WOS_UAT_RESUME_STAGE_UNSUPPORTED',
  'reverifyExistingImage',
  'postReleaseProofRefreshProbe',
  'postReleaseVerifiedState',
  'callImageProof',
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
assert(
  runner.indexOf('WOS_UAT_RESUME_STAGE_UNSUPPORTED')
    < runner.indexOf('const identities ='),
);

assert(edgeCloser.includes('WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY'));
assert(edgeCloser.includes('credential-preflight'));
assert(edgeCloser.includes('WOS_V1_QA_EDGE_PROBE_EXPECT'));
assert(edgeCloser.includes('CLOSE_UNVERIFIED'));
assert(edgeCloser.includes('probeEdgeOnce'));
assert(edgeCloser.includes('attempt <= 3'));
assert(dbCloser.includes('WOS_V1_QA_APP_EXECUTION_ID'));
assert(dbCloser.includes('67527336-0d2b-48ba-bd41-4d6f8d6781ff'));
assert(dbCloser.includes('install-v2-image-register-compat'));
assert(dbCloser.includes('rollback-v2-image-register-compat'));
assert(dbCloser.includes('install-verified-proof-mirror'));
assert(dbCloser.includes('rollback-verified-proof-mirror'));
assert(dbCloser.includes('install-current-order-proof-compat'));
assert(dbCloser.includes('rollback-current-order-proof-compat'));
assert(
  runner.includes(
    'WOS_V1_PRODUCTION_M2_QA_BUSINESS_UAT_017_20261128.json',
  ),
);
assert(
  !runner.includes(
    'WOS_V1_PRODUCTION_M2_QA_BUSINESS_UAT_006_20261127.json',
  ),
);
assert(appActivate.includes('WOS-V1-PRODUCTION-M2-QA-UAT-017'));
assert(appActivate.includes('67527336-0d2b-48ba-bd41-4d6f8d6781ff'));
assert(
  appActivate.includes(
    'WOS_V1_QA_UAT_APP_REQUIRES_WRAPPER_ACTIVATION',
  ),
);
assert(appActivate.includes(
  'WOS_V1_QA_UAT_CURRENT_ORDER_RENEWAL_REQUIRED',
));
assert(appActivate.includes('wos_v1_qa_uat_edge_renew_proof'));
assert(appActivate.includes(
  '2725b8fec3727fd810b2ad2d407780b0635c32db02254aa888088c791c449e1f',
));
assert(
  appActivate.includes(
    'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_COMPAT_REQUIRED',
  ),
);
assert(
  appActivate.includes(
    'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_REQUIRED',
  ),
);
assert(
  closerOnlyInstall.includes(
    "p_authorization_id<>'WOS-V1-PRODUCTION-M2-QA-UAT-017'",
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
    'd8250a39ce42e185b3376f016714899fa7c831341ee314708e90a9a21bcb1db7',
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
  imageRegisterInstall.includes('IMAGE_SUPERSESSION_CONFLICT'),
);
assert(
  imageRegisterInstall.includes('supersedes_image_id'),
);
assert(
  imageRegisterRollback.includes(
    'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_RESTORE_MISMATCH',
  ),
);
assert(
  proofMirrorInstall.includes(
    'wos_v1_qa_uat_edge_write_allowed',
  ),
);
assert(
  proofMirrorInstall.includes(
    'QA_VERIFIED_PROOF_MIRROR_GATE_REQUIRED',
  ),
);
assert(proofMirrorInstall.includes(
  'AFTER INSERT OR UPDATE ON public.wos_qa_verified_image_proofs',
));
assert(proofMirrorInstall.includes(
  'QA_VERIFIED_PROOF_MIRROR_WRITE_ONLY',
));
assert(proofMirrorInstall.includes(
  "current_setting('wos_v1.qa_mirror_from_formal', true) = 'yes'",
));
assert(proofMirrorInstall.includes('(trigger_row.tgtype & 16) <> 0'));
assert(
  proofMirrorInstall.includes(
    'public.wos_verified_image_proofs',
  ),
);
assert(
  proofMirrorRollback.includes(
    'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_TAMPERED',
  ),
);
assert(qaM2Install.includes(
  'CREATE OR REPLACE FUNCTION public.wos_v1_qa_uat_edge_renew_proof',
));
assert(qaM2Install.includes(
  'UPDATE public.wos_qa_verified_image_proofs proof',
));
assert(qaM2Install.includes(
  "set_config(\n      'wos_v1.qa_mirror_from_formal','yes',true\n    )",
));
assert(currentOrderProofInstall.includes(
  "'wos_v1.qa_current_order_proof'",
));
assert(currentOrderProofInstall.includes(
  'v_order.version_label ~ \'^V[2-9][0-9]{0,20}$\'',
));
assert(currentOrderProofRollback.includes(
  'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_RESTORE_MISMATCH',
));

console.log('wos-v1-qa-uat017-packaging.test.ts: PASS');
