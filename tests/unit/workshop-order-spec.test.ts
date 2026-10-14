import assert from 'node:assert/strict';
import './workshop-order-suite.test';
import {
  WORKSHOP_CONTROL_ISSUE,
  WORKSHOP_PROJECT_SLUG,
  evaluateProductionStartGate,
  evaluateSamplingCloseGate,
  evaluateSamplingStartGate,
  type VisualBaselineSummary,
} from '../../src/lib/workshop-orders/spec';

assert.equal(WORKSHOP_PROJECT_SLUG, 'workshop-order-system');
assert.equal(WORKSHOP_CONTROL_ISSUE, 104);

const baseline: VisualBaselineSummary = {
  versionLabel: 'V3',
  isCurrent: true,
  productImageCount: 1,
  filmImageCount: 1,
  customerApprovedSampleCount: 1,
  signedSampleCount: 1,
  workshopConfirmed: true,
};

const productionPass = evaluateProductionStartGate({
  workflowStatus: 'READY_TO_START',
  orderVersionLabel: 'V3',
  filmReadiness: 'VERSION_VERIFIED',
  fixtureReadiness: 'FIT_VERIFIED',
  incomingMaterialReadiness: 'QUANTITY_VERIFIED',
  signedSampleReadiness: 'VERIFIED',
  filmRequired: true,
  customerSampleRequired: true,
  signedSampleRequired: true,
  visualBaseline: baseline,
  technicalConfirmed: true,
  supervisorConfirmed: true,
  unresolvedBlockerCount: 0,
});
assert.equal(productionPass.allowed, true);
assert.deepEqual(productionPass.blockingCodes, []);

const productionMismatch = evaluateProductionStartGate({
  workflowStatus: 'READY_TO_START',
  orderVersionLabel: 'V4',
  filmReadiness: 'ARRIVED',
  fixtureReadiness: 'ARRIVED',
  incomingMaterialReadiness: 'PARTIALLY_ARRIVED',
  signedSampleReadiness: 'MISSING',
  filmRequired: true,
  customerSampleRequired: true,
  signedSampleRequired: true,
  visualBaseline: { ...baseline, workshopConfirmed: false },
  technicalConfirmed: false,
  supervisorConfirmed: false,
  unresolvedBlockerCount: 1,
});
assert.equal(productionMismatch.allowed, false);
assert(productionMismatch.blockingCodes.includes('FILM_VERSION_UNVERIFIED'));
assert(productionMismatch.blockingCodes.includes('FIXTURE_NOT_READY'));
assert(productionMismatch.blockingCodes.includes('INCOMING_MATERIAL_NOT_READY'));
assert(productionMismatch.blockingCodes.includes('SIGNED_SAMPLE_MISSING'));
assert(productionMismatch.blockingCodes.includes('VERSION_MISMATCH'));
assert(productionMismatch.blockingCodes.includes('WORKSHOP_VISUAL_CONFIRMATION_MISSING'));
assert(productionMismatch.blockingCodes.includes('TECHNICAL_CONFIRMATION_MISSING'));
assert(productionMismatch.blockingCodes.includes('SUPERVISOR_CONFIRMATION_MISSING'));
assert(productionMismatch.blockingCodes.includes('OPEN_BLOCKER'));

const missingImages = evaluateProductionStartGate({
  workflowStatus: 'READY_TO_START',
  orderVersionLabel: 'V3',
  filmReadiness: 'VERSION_VERIFIED',
  fixtureReadiness: 'NOT_REQUIRED',
  incomingMaterialReadiness: 'QUANTITY_VERIFIED',
  signedSampleReadiness: 'NOT_REQUIRED',
  filmRequired: true,
  customerSampleRequired: true,
  signedSampleRequired: false,
  visualBaseline: {
    ...baseline,
    productImageCount: 0,
    filmImageCount: 0,
    customerApprovedSampleCount: 0,
  },
  technicalConfirmed: true,
  supervisorConfirmed: true,
  unresolvedBlockerCount: 0,
});
assert.equal(missingImages.allowed, false);
assert(missingImages.blockingCodes.includes('PRODUCT_IMAGE_MISSING'));
assert(missingImages.blockingCodes.includes('FILM_IMAGE_MISSING'));
assert(missingImages.blockingCodes.includes('CUSTOMER_SAMPLE_MISSING'));

const samplingPass = evaluateSamplingStartGate({
  workflowStatus: 'READY_FOR_SAMPLING',
  requestVersionLabel: 'V3',
  filmReadiness: 'VERSION_VERIFIED',
  fixtureReadiness: 'FIT_VERIFIED',
  incomingMaterialReadiness: 'QUANTITY_VERIFIED',
  filmRequired: true,
  customerSampleRequired: true,
  visualBaseline: baseline,
  technicianAccepted: true,
  unresolvedBlockerCount: 0,
});
assert.equal(samplingPass.allowed, true);

const samplingNoBaseline = evaluateSamplingStartGate({
  workflowStatus: 'READY_FOR_SAMPLING',
  requestVersionLabel: 'V3',
  filmReadiness: 'NOT_REQUIRED',
  fixtureReadiness: 'NOT_REQUIRED',
  incomingMaterialReadiness: 'QUANTITY_VERIFIED',
  filmRequired: false,
  customerSampleRequired: false,
  visualBaseline: null,
  technicianAccepted: true,
  unresolvedBlockerCount: 0,
});
assert.equal(samplingNoBaseline.allowed, false);
assert.deepEqual(samplingNoBaseline.blockingCodes, ['VISUAL_BASELINE_MISSING']);

const closePass = evaluateSamplingCloseGate({
  workflowStatus: 'PROJECT_CONFIRMATION',
  resultDecision: 'PASS',
  resultImageCount: 3,
  technicalRecordComplete: true,
  technicianConfirmed: true,
  projectOwnerConfirmed: true,
  unresolvedBlockerCount: 0,
});
assert.equal(closePass.allowed, true);

const closeBlocked = evaluateSamplingCloseGate({
  workflowStatus: 'RESULT_REVIEW',
  resultDecision: null,
  resultImageCount: 0,
  technicalRecordComplete: false,
  technicianConfirmed: false,
  projectOwnerConfirmed: false,
  unresolvedBlockerCount: 1,
});
assert.equal(closeBlocked.allowed, false);
assert(closeBlocked.blockingCodes.includes('INVALID_WORKFLOW_STATUS'));
assert(closeBlocked.blockingCodes.includes('RESULT_DECISION_MISSING'));
assert(closeBlocked.blockingCodes.includes('RESULT_IMAGE_MISSING'));
assert(closeBlocked.blockingCodes.includes('TECHNICAL_CONFIRMATION_MISSING'));
assert(closeBlocked.blockingCodes.includes('PROJECT_CONFIRMATION_MISSING'));
assert(closeBlocked.blockingCodes.includes('OPEN_BLOCKER'));

console.log('workshop-order-spec.test.ts: PASS');
