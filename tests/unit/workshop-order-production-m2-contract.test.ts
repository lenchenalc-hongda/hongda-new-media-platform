import assert from 'node:assert/strict';
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
assert(route.includes("'wos_v1_m2_action'"));
assert(route.includes("'wos_v1_authorize_production_start'"));
assert(route.includes('resolveWosProductionRuntime'));
assert(route.includes("x-wos-v1-m2"));
assert(route.includes("startsWith('QA-')"));
assert(route.includes('FOUR_IMAGE_BASELINE_REQUIRED'));
assert(route.includes('readBoundedRequestBody(req, 8192)'));
assert(!route.includes('wos_qa_p2_m2_action'));
assert(!route.includes('service_role'));
assert(!route.includes('.insert('));
assert(!route.includes('.update('));

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
