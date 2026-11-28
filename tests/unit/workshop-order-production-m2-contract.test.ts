import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  canActOnWosP2M2,
  canAuthorizeWosV1ProductionStart,
  isWosP2M2Result,
  isWosV1StartReleaseResult,
  parseWosP2M2Action,
  parseWosV1StartRelease,
  wosP2M2RpcArgs,
  wosV1StartReleaseRpcArgs,
} from '../../src/lib/workshop-orders/p2-m2-contract';
import {
  readBoundedRequestBody,
} from '../../src/lib/workshop-orders/bounded-request-body';

const orderId = '11111111-1111-4111-8111-111111111111';
const baselineId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const imageIds = [
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
];

const select = parseWosP2M2Action({
  orderId,
  requestId,
  expectedVersion: 7,
  action: 'BASELINE_SELECT',
  payload: {
    productionVersionLabel: 'V1',
    note: 'Office selects the current four-category proof set.',
    imageIds,
  },
});
assert(select);
assert.equal(wosP2M2RpcArgs(select).p_action, 'BASELINE_SELECT');
assert(isWosP2M2Result({
  status: 'APPLIED',
  orderId,
  requestId,
  version: 8,
  productionVersionLabel: 'V1',
  proofStatus: 'UNVERIFIED',
  canStart: false,
  workflowStatus: 'WAITING_MATERIAL',
  baselineId,
}, select));

const start = parseWosV1StartRelease({
  orderId,
  requestId,
  expectedVersion: 11,
  action: 'START_RELEASE',
  payload: {
    baselineId,
    note: 'Independent manager release after dual signoff.',
  },
});
assert(start);
assert.equal(
  wosV1StartReleaseRpcArgs(start).p_baseline_id,
  baselineId,
);
assert(canAuthorizeWosV1ProductionStart('admin'));
assert(canAuthorizeWosV1ProductionStart('manager'));
assert(!canAuthorizeWosV1ProductionStart('operator'));
assert(!canAuthorizeWosV1ProductionStart('sales'));
assert(isWosV1StartReleaseResult({
  status: 'AUTHORIZED',
  orderId,
  requestId,
  version: 12,
  productionVersionLabel: 'V1',
  workflowStatus: 'READY_TO_START',
  baselineId,
  proofSetDigest: 'a'.repeat(64),
  manualStartAuthorized: true,
  productionStarted: false,
  canStart: false,
}, start));
assert(!isWosV1StartReleaseResult({
  status: 'AUTHORIZED',
  orderId,
  requestId,
  version: 12,
  productionVersionLabel: 'V1',
  workflowStatus: 'IN_PRODUCTION',
  baselineId,
  proofSetDigest: 'a'.repeat(64),
  manualStartAuthorized: true,
  productionStarted: true,
  canStart: true,
}, start));

assert(canActOnWosP2M2('MATERIAL_RECORD', 'operator'));
assert(canActOnWosP2M2('BASELINE_OFFICE_CONFIRM', 'sales'));
assert(!canActOnWosP2M2('BASELINE_OFFICE_CONFIRM', 'operator'));
assert(parseWosP2M2Action({
  orderId,
  requestId,
  expectedVersion: 10,
  action: 'FINAL_READINESS_CONFIRM',
  payload: {
    productionVersionLabel: 'V1',
    note: 'All four final physical materials are confirmed.',
    baselineId,
    physicalCheckAttested: true,
    filmArrivedAt: '2026-11-26T01:00:00Z',
    fixtureArrivedAt: '2026-11-26T01:01:00Z',
    incomingArrivedAt: '2026-11-26T01:02:00Z',
    signedSampleArrivedAt: '2026-11-26T01:03:00Z',
    quantityExpected: 100,
    quantityArrived: 100,
  },
}));

const route = readFileSync(
  'src/app/api/workshop-orders/v1/m2/route.ts',
  'utf8',
);
assert(route.includes('resolveWosProductionRuntime'));
assert(route.includes('handleWosV1M2Request'));
assert(route.includes("adapter: 'production'"));
assert(route.includes('WOS_V1_M2_WRITES_DISABLED'));
assert(!route.includes('wos_qa_p2_m2_action'));
assert(!route.includes('service_role'));
assert(!route.includes('.insert('));
assert(!route.includes('.update('));

const qaRoute = readFileSync(
  'src/app/api/workshop-orders/v1-qa/m2/route.ts',
  'utf8',
);
assert(qaRoute.includes('resolveWosV1QaM2Runtime'));
assert(qaRoute.includes("adapter: 'qa-uat'"));
assert(qaRoute.includes('WOS_V1_QA_UAT_M2_WRITES_DISABLED'));
assert(qaRoute.includes('WOS_V1_QA_UAT_AUTHORIZATION_ID'));
assert(!qaRoute.includes('wos_qa_p2_m2_action'));
assert(!qaRoute.includes('service_role'));

const handler = readFileSync(
  'src/lib/workshop-orders/production-m2-handler.ts',
  'utf8',
);
assert(handler.includes("'wos_v1_m2_action'"));
assert(handler.includes("'wos_v1_authorize_production_start'"));
assert(handler.includes("'wos_v1_qa_uat_m2_action'"));
assert(handler.includes("'wos_v1_qa_uat_authorize_production_start'"));
assert(handler.includes("x-wos-v1-m2"));
assert(handler.includes('p_authorization_id'));
assert(handler.includes('WOS_V1_QA_UAT_AUTHORIZATION_ID_REQUIRED'));
assert(handler.includes("orderNumber.startsWith('QA-NONPROD-')"));
assert(handler.includes('!orderNumber.startsWith('));
assert(handler.includes('FOUR_IMAGE_BASELINE_REQUIRED'));
assert(handler.includes('readBoundedRequestBody(req, 8192)'));
assert(!handler.includes('wos_qa_p2_m2_action'));
assert(!handler.includes('service_role'));
assert(!handler.includes('.insert('));
assert(!handler.includes('.update('));

const sql = readFileSync(
  'supabase/migrations/20261126090000_wos_v1_production_m2_signoff.sql',
  'utf8',
);
assert(sql.includes('public.wos_v1_m2_action'));
assert(sql.includes('public.wos_v1_authorize_production_start'));
assert(sql.includes('public.wos_v1_m2_receipts'));
assert(sql.includes('public.wos_v1_start_releases'));
assert(sql.includes('public.wos_verified_image_proofs'));
assert(sql.includes("'START_RELEASE'"));
assert(sql.includes("'WOS_V1_START_RELEASE'"));
assert(sql.includes("'WOS_V1_M2_EVIDENCE_INVALIDATED'"));
assert(sql.includes("OLD.image_status='READY'"));
assert(sql.includes('BEFORE INSERT OR UPDATE OR DELETE'));
assert(sql.includes('AFTER UPDATE OR DELETE'));
assert(sql.includes("'productionStarted',false"));
assert(sql.includes("'canStart',false"));
assert(!sql.includes('wos_qa_p2_m2_gate'));
assert(!sql.includes('QA-NONPROD'));
assert(!sql.includes(
  'GRANT EXECUTE ON FUNCTION public.wos_v1_m2_action',
));
assert(!/CREATE\s+TABLE[^;]*wos_qa_p2_m2/i.test(sql));
assert(!/DROP\s+TABLE[^;]*wos_/i.test(sql));
const activation = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_ACTIVATION_NOT_AUTHORIZED.sql',
  'utf8',
);
assert(activation.includes(
  'WOS_V1_PRODUCTION_M2_ACTIVATION_NOT_AUTHORIZED',
));
assert(activation.includes(
  'GRANT EXECUTE ON FUNCTION public.wos_v1_m2_action',
));
assert(activation.includes(
  'GRANT EXECUTE ON FUNCTION public.wos_v1_authorize_production_start',
));
const deactivation = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_DEACTIVATE_NOT_AUTHORIZED.sql',
  'utf8',
);
assert(deactivation.includes(
  'REVOKE EXECUTE ON FUNCTION public.wos_v1_m2_action',
));
assert(deactivation.includes(
  'REVOKE EXECUTE ON FUNCTION public.wos_v1_authorize_production_start',
));
const rollback = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_ROLLBACK_NOT_AUTHORIZED.sql',
  'utf8',
);
assert(rollback.includes(
  'WOS_V1_PRODUCTION_M2_ROLLBACK_NOT_AUTHORIZED',
));
assert(rollback.includes(
  'DROP FUNCTION IF EXISTS public.wos_v1_m2_action',
));
assert(rollback.includes(
  'public.wos_v1_m2_receipts and public.wos_v1_start_releases are intentionally',
));
assert(!/DROP\s+TABLE/i.test(rollback));

const workbench = readFileSync(
  'src/components/workshop-orders/ProductionM2Workbench.tsx',
  'utf8',
);
assert(workbench.includes('fetchWosV1M2'));
assert(workbench.includes('adapter: WosV1M2Adapter'));
assert(workbench.includes('fetchWosV1M2(action, adapter)'));
assert(workbench.includes('BASELINE_SELECT'));
assert(workbench.includes('BASELINE_OFFICE_CONFIRM'));
assert(workbench.includes('MATERIAL_RECORD'));
assert(workbench.includes('BASELINE_WORKSHOP_CONFIRM'));
assert(workbench.includes('FINAL_READINESS_CONFIRM'));
assert(workbench.includes('START_RELEASE'));
assert(workbench.includes('registeredResourceTypes.size'));
assert(workbench.includes('finalResourceTypes.size'));
assert(workbench.includes('toIso(materialArrivedAt)'));
assert(workbench.includes('!finalDatesReady'));
assert(workbench.includes('const finalReadinessActor'));
assert(workbench.includes('!finalReadinessActor'));
assert(workbench.includes('canStart=false'));

const m2Client = readFileSync(
  'src/lib/workshop-orders/production-m2-client.ts',
  'utf8',
);
assert(m2Client.includes("'/api/workshop-orders/v1-qa/m2'"));
assert(m2Client.includes("'/api/workshop-orders/v1/m2'"));
assert(m2Client.includes('parseWosV1M2Capability'));
assert(!m2Client.includes('NEXT_PUBLIC_WOS_V1_QA_PREVIEW'));

const qaInstall = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_INSTALL_NOT_AUTHORIZED.sql',
  'utf8',
);
assert(qaInstall.includes('wos_v1_qa_uat.write_gates'));
assert(qaInstall.includes('QA_UAT_M2_GATE_CLOSED'));
assert(qaInstall.includes('public.wos_v1_m2_action'));
assert(qaInstall.includes('public.wos_v1_authorize_production_start'));
assert(qaInstall.includes("order_number LIKE 'QA-NONPROD-%'"));
assert(qaInstall.includes("interval '15 minutes'"));
assert(qaInstall.includes('FOR SHARE'));
assert(qaInstall.includes('WOS_V1_QA_DATABASE_NOT_IDENTIFIED'));
assert(qaInstall.includes('QA_UAT_AUTHORIZATION_ID_MISMATCH'));
assert(qaInstall.includes('gate.authorization_id=p_authorization_id'));
assert(!qaInstall.includes('PERFORM public.wos_qa_p2_m2_action'));
assert(!qaInstall.includes('RETURN public.wos_qa_p2_m2_action'));
assert(!/GRANT EXECUTE ON FUNCTION public\.wos_v1_qa_uat_m2_action[\s\S]{0,80}TO service_role/.test(
  qaInstall,
));
assert(!/GRANT EXECUTE ON FUNCTION public\.wos_v1_qa_uat_authorize_production_start[\s\S]{0,80}TO service_role/.test(
  qaInstall,
));
assert(qaInstall.includes(
  'GRANT EXECUTE ON FUNCTION public.wos_v1_qa_uat_edge_write_allowed',
));
assert(qaInstall.includes(
  'GRANT EXECUTE ON FUNCTION public.wos_v1_qa_uat_edge_control_status',
));
assert(!/GRANT EXECUTE[\s\S]{0,160}TO authenticated/.test(qaInstall));

const qaActivate = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_ACTIVATE_NOT_AUTHORIZED.sql',
  'utf8',
);
assert(qaActivate.includes('WOS_V1_QA_UAT_M2_ACTIVATION_NOT_AUTHORIZED'));
assert(qaActivate.includes('GRANT EXECUTE ON FUNCTION public.wos_v1_qa_uat_m2_action'));
assert(!qaActivate.includes(
  'GRANT EXECUTE ON FUNCTION public.wos_v1_m2_action',
));

const qaAppActivate = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_APP_ACTIVATE_NOT_AUTHORIZED.sql',
  'utf8',
);
assert(qaAppActivate.includes(
  'WOS_V1_QA_UAT_APP_ACTIVATION_NOT_AUTHORIZED',
));
assert(qaAppActivate.includes('WOS_V1_QA_UAT_APP_REQUIRES_ARMED_CLOSERS'));
assert(qaAppActivate.includes(
  "clock_timestamp() + interval '4 minutes'",
));
assert(qaAppActivate.includes(
  "db_last_heartbeat_at >=",
));
assert(qaAppActivate.includes('WOS_V1_QA_UAT_APP_EXECUTION_MISMATCH'));
assert(qaAppActivate.includes(
  "'f5149801-df08-4ce7-b336-df6d449c9aec'",
));
assert(qaAppActivate.includes('WOS_V1_QA_UAT_APP_RPC_NOT_INSTALLED'));
assert(qaAppActivate.includes('WOS_V1_QA_UAT_APP_BROAD_TABLE_ACCESS'));
assert(qaAppActivate.includes(
  'REVOKE INSERT, UPDATE, DELETE ON public.wos_production_orders',
));
assert(qaAppActivate.includes(
  'ON public.wos_office_revisions FROM PUBLIC, authenticated',
));
assert(qaAppActivate.includes(
  'FROM PUBLIC, anon;',
));
assert(qaAppActivate.includes('WOS_V1_QA_UAT_APP_RPC_ACL_VIOLATION'));
assert(qaAppActivate.includes(
  'current_setting(\'wos_v1.qa_execution_id\', true)::uuid',
));
assert(qaAppActivate.includes(
  'FROM PUBLIC, anon, authenticated;',
));
assert(qaAppActivate.includes(
  'GRANT EXECUTE ON FUNCTION public.wos_operator_review_correction(',
));
assert(!qaAppActivate.includes(
  'GRANT EXECUTE ON FUNCTION public.wos_create_production_order(uuid,jsonb)',
));
assert(qaAppActivate.includes(
  'WOS_V1_QA_UAT_CREATE_FORBIDDEN_IN_RESUME_MODE',
));
assert(!qaAppActivate.includes(
  'GRANT EXECUTE ON FUNCTION public.wos_v1_m2_action',
));
assert(!qaAppActivate.includes(
  'GRANT EXECUTE ON FUNCTION public.wos_v1_qa_uat_m2_action',
));
assert(qaAppActivate.includes(
  'public.wos_v1_assert_current_image_set(uuid,uuid,text)',
));

const qaAppDeactivate = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_APP_DEACTIVATE_NOT_AUTHORIZED.sql',
  'utf8',
);
assert(qaAppDeactivate.includes(
  'WOS_V1_QA_UAT_APP_DEACTIVATION_NOT_AUTHORIZED',
));
assert(qaAppDeactivate.includes(
  'REVOKE EXECUTE ON FUNCTION public.wos_create_production_order(uuid,jsonb)',
));
assert(qaAppDeactivate.includes(
  'REVOKE EXECUTE ON FUNCTION public.wos_operator_review_correction(',
));
assert(qaAppDeactivate.includes(
  'WOS_V1_QA_UAT_APP_DEACTIVATION_INCOMPLETE',
));
assert(qaAppDeactivate.includes(
  "has_function_privilege('anon', business_function, 'EXECUTE')",
));

const qaClose = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_DEACTIVATE_NOT_AUTHORIZED.sql',
  'utf8',
);
assert(qaClose.includes("state='CLOSED'"));
assert(qaClose.includes('REVOKE EXECUTE ON FUNCTION public.wos_v1_qa_uat_m2_action'));

const uatRoot =
  'docs/workshop-order-system/qa-fixture/production-m2-uat-20261126';
const uat = JSON.parse(
  readFileSync(`${uatRoot}/inputs-uat011.json`, 'utf8'),
) as {
  readonly requestId: string;
  readonly orderNumber: string;
  readonly qaProject: string;
  readonly qaOrganizationId: string;
  readonly mode: string;
  readonly resumeOrderId: string;
  readonly resumeExpectedVersion: number;
  readonly resumeExpectedVersionLabel: string;
  readonly resumeExpectedWorkflowStatus: string;
  readonly executionId: string;
  readonly edgeProcessNonce: string;
  readonly actors: Record<string, {
    readonly profileId: string;
    readonly authUserId: string;
    readonly email?: string;
    readonly role: string;
    readonly organizationId?: string;
    readonly keychainService: string;
    readonly jwtPreflight?: string;
  }>;
  readonly negativeActors: Record<string, {
    readonly profileId: string;
    readonly authUserId: string;
    readonly organizationId: string;
    readonly role: string;
  }>;
  readonly images: Record<string, readonly {
    readonly category: string;
    readonly imageId: string;
    readonly source: string;
    readonly sha256: string;
  }[]>;
  readonly environment: Record<string, string>;
};
const legacyUat = JSON.parse(
  readFileSync(`${uatRoot}/inputs.json`, 'utf8'),
) as {
  readonly createPayload: Record<string, unknown>;
};
assert.equal(uat.qaProject, 'xulmpqaknlwqqculbsek');
assert.equal(
  uat.orderNumber,
  'QA-NONPROD-' + uat.requestId,
);
assert.equal(Object.keys(legacyUat.createPayload).length, 21);
assert.equal(legacyUat.createPayload.orderNumber, uat.orderNumber);
assert.equal(uat.mode, 'RESUME_EXISTING_ORDER');
assert.equal(
  uat.resumeOrderId,
  '3ade0180-e6bf-49da-b80b-fd00cd1948a8',
);
assert.equal(uat.resumeExpectedVersion, 5);
assert.equal(uat.resumeExpectedVersionLabel, 'V2');
assert.equal(uat.resumeExpectedWorkflowStatus, 'NEEDS_INFORMATION');
assert.equal(new Set(
  Object.values(uat.actors).map(actor => actor.profileId),
).size, 3);
assert.equal(new Set(
  Object.values(uat.actors).map(actor => actor.authUserId),
).size, 3);
const independentRelease = uat.actors.independentRelease;
assert.deepEqual(independentRelease, {
  profileId: '9164ac91-a50c-4023-836c-5c0887b619fb',
  authUserId: 'b55ccc94-6352-4cad-8600-fad32955d014',
  email: 'testingadmin@hongda.cn',
  role: 'manager',
  organizationId: '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  keychainService: 'WOS_V1_QA_IDENTITY_INDEPENDENT_MANAGER',
  jwtPreflight: 'REQUIRED',
});
assert.notEqual(
  independentRelease.profileId,
  uat.actors.office.profileId,
);
assert.notEqual(
  independentRelease.profileId,
  uat.actors.workshop.profileId,
);
assert.notEqual(
  independentRelease.authUserId,
  uat.actors.office.authUserId,
);
assert.notEqual(
  independentRelease.authUserId,
  uat.actors.workshop.authUserId,
);
assert.equal(independentRelease.organizationId, uat.qaOrganizationId);
assert.notEqual(
  independentRelease.profileId,
  uat.negativeActors.viewer.profileId,
);
assert.notEqual(
  independentRelease.authUserId,
  uat.negativeActors.viewer.authUserId,
);
assert.notEqual(
  independentRelease.profileId,
  uat.negativeActors.crossOrganizationManager.profileId,
);
assert.notEqual(
  independentRelease.authUserId,
  uat.negativeActors.crossOrganizationManager.authUserId,
);
const preflightRaw = readFileSync(
  'docs/workshop-order-system/production-readiness/evidence/WOS_V1_PRODUCTION_M2_QA_UAT_PREFLIGHT_20261126.json',
  'utf8',
);
const preflight = JSON.parse(preflightRaw) as {
  readonly actors: {
    readonly independentRelease: {
      readonly profileId: string;
      readonly authUserId: string;
      readonly email: string;
      readonly role: string;
      readonly organizationId: string;
      readonly active: boolean;
      readonly authSessionObserved: boolean;
      readonly authUserEndpointVerified: boolean;
      readonly refreshVerified: boolean;
      readonly keychainServiceObserved: boolean;
    };
  };
};
assert.deepEqual(preflight.actors.independentRelease, {
  profileId: '9164ac91-a50c-4023-836c-5c0887b619fb',
  authUserId: 'b55ccc94-6352-4cad-8600-fad32955d014',
  email: 'testingadmin@hongda.cn',
  role: 'manager',
  organizationId: '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  active: true,
  authSessionObserved: true,
  authUserEndpointVerified: true,
  refreshVerified: true,
  keychainServiceObserved: true,
});
const ownerGate = readFileSync(
  'docs/workshop-order-system/production-readiness/WOS_V1_PRODUCTION_M2_QA_UAT_OWNER_GATE_20261126.md',
  'utf8',
);
assert(ownerGate.includes(
  'INDEPENDENT_RELEASE_AUTH_USER=b55ccc94-6352-4cad-8600-fad32955d014',
));
assert(ownerGate.includes(
  'INDEPENDENT_RELEASE_PROFILE=9164ac91-a50c-4023-836c-5c0887b619fb',
));
const uatRunner = readFileSync(
  'tests/sql/run-wos-v1-production-m2-qa-uat-pg17.sh',
  'utf8',
);
assert(uatRunner.includes(
  'b55ccc94-6352-4cad-8600-fad32955d014',
));
assert(uatRunner.includes(
  '9164ac91-a50c-4023-836c-5c0887b619fb',
));
assert(
  /SELECT public\.wos_v1_qa_uat_open_gate\(\s*'WOS-V1-PRODUCTION-M2-QA-UAT-011'[\s\S]*?'\$UAT_MANAGER_PROFILE'[\s\S]*?ARRAY\['START_RELEASE'\]/
    .test(uatRunner),
);
for (const stale of [
  '86eb4bfd-b1a6-4c94-86b3-e0599895f586',
  'eb62a21a-f809-414e-ac14-9c6fdfa1e117',
]) {
  assert(!preflightRaw.includes(stale));
  assert(!ownerGate.includes(stale));
  assert(!uatRunner.includes(stale));
}
assert.equal(uat.negativeActors.viewer.role, 'viewer');
assert.equal(
  uat.negativeActors.crossOrganizationManager.organizationId,
  'fbdb0989-ae25-4ba4-92f9-3266cc845977',
);
assert.equal(uat.environment.WOS_V1_QA_UAT_M2_ENABLED, 'true');
assert.equal(uat.environment.WOS_V1_QA_UAT_M2_WRITES_ENABLED, 'false');
assert.equal(
  uat.environment.WOS_V1_QA_UAT_AUTHORIZATION_ID,
  'WOS-V1-PRODUCTION-M2-QA-UAT-011',
);
for (const version of ['v1', 'v2']) {
  const images = uat.images[version];
  assert.equal(images.length, 4);
  assert.equal(new Set(images.map(image => image.category)).size, 4);
  assert.equal(new Set(images.map(image => image.imageId)).size, 4);
  for (const image of images) {
    const bytes = readFileSync(`${uatRoot}/${image.source}`);
    assert.deepEqual(
      Array.from(bytes.subarray(0, 8)),
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      image.sha256,
    );
  }
}

assert.equal(await readBoundedRequestBody(
  new Request('http://localhost/api/workshop-orders/v1/m2', {
    method: 'POST',
    body: '1234',
  }),
  4,
), '1234');
assert.equal(await readBoundedRequestBody(
  new Request('http://localhost/api/workshop-orders/v1/m2', {
    method: 'POST',
    body: '12345',
  }),
  4,
), null);

console.log('workshop-order-production-m2-contract.test.ts: PASS');
