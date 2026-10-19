import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  canTransitionProduction,
  canTransitionSampling,
  evaluateVersionAlignment,
  mayClientDirectlySetWorkflowStatus,
  replaceCurrentBaseline,
} from '../../src/lib/workshop-orders/domain';
import {
  directClientWorkflowMutationSchema,
  productionOrderCreateSchema,
  samplingRequestCreateSchema,
  samplingTechnicalAttemptSchema,
  statusTransitionSchema,
  visualBaselineCreateSchema,
} from '../../src/lib/workshop-orders/schemas';
import {
  productionBaselineV1Fixture,
  productionBaselineV2DraftFixture,
  productionOrderFixture,
  samplingRequestFixture,
  WOS_FIXTURE_IDS,
} from '../../src/lib/workshop-orders/fixtures';

assert.notEqual(
  productionOrderFixture.id,
  samplingRequestFixture.id,
  'production orders and sampling requests remain separate entities',
);
assert.equal(productionOrderFixture.workflowStatus, 'READY_TO_START');
assert.equal(samplingRequestFixture.workflowStatus, 'READY_FOR_SAMPLING');

assert.equal(canTransitionProduction('DRAFT', 'SUBMITTED'), true);
assert.equal(canTransitionProduction('DRAFT', 'IN_PRODUCTION'), false);
assert.equal(canTransitionSampling('DRAFT', 'SUBMITTED'), true);
assert.equal(canTransitionSampling('DRAFT', 'SAMPLING_IN_PROGRESS'), false);

const aligned = evaluateVersionAlignment({
  entityVersionLabel: 'V1',
  baselineVersionLabel: 'V1',
  filmVersionLabel: 'V1',
  filmRequired: true,
  baselineIsCurrent: true,
});
assert.equal(aligned.allowed, true);
assert.deepEqual(aligned.blockingCodes, []);

const mismatched = evaluateVersionAlignment({
  entityVersionLabel: 'V2',
  baselineVersionLabel: 'V1',
  filmVersionLabel: 'V1',
  filmRequired: true,
  baselineIsCurrent: true,
});
assert.equal(mismatched.allowed, false);
assert(mismatched.blockingCodes.includes('BASELINE_VERSION_MISMATCH'));
assert(mismatched.blockingCodes.includes('FILM_VERSION_MISMATCH'));

const missing = evaluateVersionAlignment({
  entityVersionLabel: 'V2',
  baselineVersionLabel: null,
  filmVersionLabel: null,
  filmRequired: true,
  baselineIsCurrent: false,
});
assert.equal(missing.allowed, false);
assert(missing.blockingCodes.includes('BASELINE_MISSING'));
assert(missing.blockingCodes.includes('FILM_VERSION_MISSING'));

const replacement = replaceCurrentBaseline(
  productionBaselineV1Fixture,
  productionBaselineV2DraftFixture,
);
assert.equal(replacement.previousBaseline.status, 'SUPERSEDED');
assert.equal(replacement.previousBaseline.id, productionBaselineV1Fixture.id);
assert.equal(replacement.nextBaseline.status, 'CURRENT');
assert.equal(replacement.nextBaseline.id, productionBaselineV2DraftFixture.id);
assert.equal(
  replacement.nextBaseline.confirmedByWorkshopProfileId,
  null,
  'changing the baseline invalidates prior workshop visual confirmation',
);
assert.throws(
  () => replaceCurrentBaseline(productionBaselineV1Fixture, {
    ...productionBaselineV1Fixture,
    status: 'DRAFT',
  }),
  /replacement requires a new id/,
);

assert.equal(
  mayClientDirectlySetWorkflowStatus('PRODUCTION_ORDER', 'IN_PRODUCTION'),
  false,
);
assert.equal(
  mayClientDirectlySetWorkflowStatus('SAMPLING_REQUEST', 'SAMPLING_IN_PROGRESS'),
  false,
);
assert.equal(
  directClientWorkflowMutationSchema.safeParse({ workflowStatus: 'IN_PRODUCTION' }).success,
  false,
);

const productionInput = productionOrderCreateSchema.parse({
  organizationId: WOS_FIXTURE_IDS.organizationId,
  customerId: WOS_FIXTURE_IDS.customerId,
  customerNameSnapshot: 'Fixture Customer',
  projectId: WOS_FIXTURE_IDS.projectId,
  projectNameSnapshot: 'Fixture Project',
  orderNumber: 'PO-001',
  productName: 'PP cup',
  salesOwnerProfileId: WOS_FIXTURE_IDS.salesProfileId,
  projectOwnerProfileId: WOS_FIXTURE_IDS.projectOwnerProfileId,
  priority: 'HIGH',
  isUrgent: false,
  versionLabel: 'V1',
  requestedQuantity: 1000,
  currentBatchQuantity: 500,
  plannedShipDate: '2026-11-15',
  splitDelivery: true,
  productMaterial: 'PP',
  surfaceTreatment: null,
  createdByProfileId: WOS_FIXTURE_IDS.projectOwnerProfileId,
});
assert.equal(productionInput.projectOwnerProfileId, WOS_FIXTURE_IDS.projectOwnerProfileId);
assert.equal(
  productionOrderCreateSchema.safeParse({
    ...productionInput,
    currentBatchQuantity: 1200,
  }).success,
  false,
);

const samplingInput = samplingRequestCreateSchema.parse({
  organizationId: WOS_FIXTURE_IDS.organizationId,
  customerId: WOS_FIXTURE_IDS.customerId,
  customerNameSnapshot: 'Fixture Customer',
  projectId: WOS_FIXTURE_IDS.projectId,
  projectNameSnapshot: 'Fixture Project',
  productName: 'PP cup',
  productOwnerProfileId: WOS_FIXTURE_IDS.projectOwnerProfileId,
  requestStage: 'ESTABLISHED',
  objectives: ['PRODUCIBILITY', 'ADHESION'],
  versionLabel: 'V1',
  isUrgent: false,
  productMaterial: 'PP',
  sampleInputQuantity: 20,
  requiredGoodQuantity: 5,
  specialFixtureRequired: false,
  createdByProfileId: WOS_FIXTURE_IDS.projectOwnerProfileId,
});
assert.equal(samplingInput.objectives.length, 2);

assert.equal(
  samplingTechnicalAttemptSchema.safeParse({
    organizationId: WOS_FIXTURE_IDS.organizationId,
    samplingRequestId: WOS_FIXTURE_IDS.samplingRequestId,
    attemptNumber: 1,
    machineLabel: 'Machine A',
    resultDecision: 'FAIL',
    technicianProfileId: WOS_FIXTURE_IDS.technicianProfileId,
  }).success,
  false,
  'non-PASS attempt must explain failure',
);

assert.equal(
  visualBaselineCreateSchema.safeParse({
    organizationId: WOS_FIXTURE_IDS.organizationId,
    entityType: 'PRODUCTION_ORDER',
    entityId: WOS_FIXTURE_IDS.productionOrderId,
    versionLabel: 'V1',
    imageIds: ['00000000-0000-4000-8000-000000000031'],
    requiredImageIds: ['00000000-0000-4000-8000-000000000032'],
  }).success,
  false,
  'required baseline images must be members of the baseline',
);

assert.equal(
  statusTransitionSchema.safeParse({
    entityType: 'PRODUCTION_ORDER',
    entityId: WOS_FIXTURE_IDS.productionOrderId,
    expectedVersion: 1,
    fromStatus: 'READY_TO_START',
    toStatus: 'IN_PRODUCTION',
    actorProfileId: WOS_FIXTURE_IDS.projectOwnerProfileId,
    reasonCode: 'START_RELEASED',
  }).success,
  true,
);

const migration = fs.readFileSync(
  'supabase/migrations/20261014102000_workshop_order_system_foundation.sql',
  'utf8',
);
for (const table of [
  'wos_production_orders',
  'wos_sampling_requests',
  'wos_resource_readiness',
  'wos_reference_images',
  'wos_visual_baselines',
  'wos_visual_baseline_items',
  'wos_blockers',
  'wos_confirmations',
  'wos_sampling_technical_records',
  'wos_status_history',
]) {
  assert(
    migration.includes('public.' + table),
    'migration contains ' + table,
  );
  assert(
    migration.includes('alter table public.' + table + ' enable row level security'),
    'RLS enabled for ' + table,
  );
}
assert(
  migration.includes('references public.profiles(id)'),
  'business actor references use profiles.id',
);
assert(
  migration.includes('wos_one_current_visual_baseline'),
  'only one CURRENT baseline is allowed per entity',
);
assert(
  migration.includes('No UPDATE/DELETE grants are intentionally present'),
  'consequential workflow mutations are fail-closed at the client grant layer',
);
assert(
  !migration.includes('grant update')
    && !migration.includes('grant delete')
    && !migration.includes('to anon'),
  'authenticated clients do not receive direct update/delete and anon receives no access',
);

console.log('workshop-order-foundation.test.ts: PASS');
