export const WORKSHOP_PROJECT_SLUG = 'workshop-order-system' as const;
export const WORKSHOP_CONTROL_ISSUE = 104 as const;

export type WorkshopTaskType = 'PRODUCTION_ORDER' | 'SAMPLING_REQUEST';

export type ProductionWorkflowStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'WORKSHOP_REVIEW'
  | 'NEEDS_INFORMATION'
  | 'WAITING_MATERIAL'
  | 'READINESS_CHECK'
  | 'READY_TO_SCHEDULE'
  | 'SCHEDULED'
  | 'READY_TO_START'
  | 'IN_PRODUCTION'
  | 'PAUSED'
  | 'BLOCKED'
  | 'PRODUCTION_COMPLETED'
  | 'READY_FOR_SHIPMENT'
  | 'CLOSED'
  | 'CANCELLED';

export type SamplingWorkflowStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'TECHNICIAN_REVIEW'
  | 'NEEDS_INFORMATION'
  | 'WAITING_RESOURCE'
  | 'READY_FOR_SAMPLING'
  | 'SAMPLING_IN_PROGRESS'
  | 'RESULT_REVIEW'
  | 'PROJECT_CONFIRMATION'
  | 'CLOSED'
  | 'CANCELLED';

export type SamplingResultDecision = 'PASS' | 'FAIL' | 'CANNOT_SAMPLE';

export type FilmReadiness =
  | 'NOT_REQUIRED'
  | 'NOT_ARRIVED'
  | 'PARTIALLY_ARRIVED'
  | 'ARRIVED'
  | 'VERSION_VERIFIED';

export type FixtureReadiness =
  | 'NOT_REQUIRED'
  | 'NOT_AVAILABLE'
  | 'IN_PRODUCTION'
  | 'ARRIVED'
  | 'FIT_VERIFIED';

export type IncomingMaterialReadiness =
  | 'NOT_ARRIVED'
  | 'PARTIALLY_ARRIVED'
  | 'ARRIVED'
  | 'QUANTITY_VERIFIED';

export type SignedSampleReadiness =
  | 'NOT_REQUIRED'
  | 'MISSING'
  | 'UPLOADED'
  | 'PHYSICAL_SAMPLE_RECEIVED'
  | 'VERIFIED';

export type ReferenceImageCategory =
  | 'FILM_PATTERN'
  | 'PRODUCT'
  | 'CUSTOMER_APPROVED_SAMPLE'
  | 'SIGNED_SAMPLE'
  | 'SAMPLING_RESULT'
  | 'PACKAGING_LABEL'
  | 'DEFECT_RISK'
  | 'OTHER';

export type GateBlockingCode =
  | 'INVALID_WORKFLOW_STATUS'
  | 'FILM_NOT_READY'
  | 'FILM_VERSION_UNVERIFIED'
  | 'FIXTURE_NOT_READY'
  | 'INCOMING_MATERIAL_NOT_READY'
  | 'SIGNED_SAMPLE_MISSING'
  | 'VISUAL_BASELINE_MISSING'
  | 'VISUAL_BASELINE_NOT_CURRENT'
  | 'PRODUCT_IMAGE_MISSING'
  | 'FILM_IMAGE_MISSING'
  | 'CUSTOMER_SAMPLE_MISSING'
  | 'VERSION_MISMATCH'
  | 'WORKSHOP_VISUAL_CONFIRMATION_MISSING'
  | 'TECHNICAL_CONFIRMATION_MISSING'
  | 'SUPERVISOR_CONFIRMATION_MISSING'
  | 'TECHNICIAN_ACCEPTANCE_MISSING'
  | 'RESULT_IMAGE_MISSING'
  | 'RESULT_DECISION_MISSING'
  | 'PROJECT_CONFIRMATION_MISSING'
  | 'OPEN_BLOCKER';

export interface GateEvaluation {
  allowed: boolean;
  blockingCodes: GateBlockingCode[];
}

export interface VisualBaselineSummary {
  versionLabel: string;
  isCurrent: boolean;
  productImageCount: number;
  filmImageCount: number;
  customerApprovedSampleCount: number;
  signedSampleCount: number;
  workshopConfirmed: boolean;
}

export interface ProductionStartGateInput {
  workflowStatus: ProductionWorkflowStatus;
  orderVersionLabel: string;
  filmReadiness: FilmReadiness;
  fixtureReadiness: FixtureReadiness;
  incomingMaterialReadiness: IncomingMaterialReadiness;
  signedSampleReadiness: SignedSampleReadiness;
  filmRequired: boolean;
  customerSampleRequired: boolean;
  signedSampleRequired: boolean;
  visualBaseline: VisualBaselineSummary | null;
  technicalConfirmed: boolean;
  supervisorConfirmed: boolean;
  unresolvedBlockerCount: number;
}

export interface SamplingStartGateInput {
  workflowStatus: SamplingWorkflowStatus;
  requestVersionLabel: string;
  filmReadiness: FilmReadiness;
  fixtureReadiness: FixtureReadiness;
  incomingMaterialReadiness: IncomingMaterialReadiness;
  filmRequired: boolean;
  customerSampleRequired: boolean;
  visualBaseline: VisualBaselineSummary | null;
  technicianAccepted: boolean;
  unresolvedBlockerCount: number;
}

export interface SamplingCloseGateInput {
  workflowStatus: SamplingWorkflowStatus;
  resultDecision: SamplingResultDecision | null;
  resultImageCount: number;
  technicalRecordComplete: boolean;
  technicianConfirmed: boolean;
  projectOwnerConfirmed: boolean;
  unresolvedBlockerCount: number;
}

function result(blockingCodes: GateBlockingCode[]): GateEvaluation {
  return {
    allowed: blockingCodes.length === 0,
    blockingCodes: [...new Set(blockingCodes)],
  };
}

function evaluateBaseline(
  baseline: VisualBaselineSummary | null,
  expectedVersion: string,
  options: {
    filmRequired: boolean;
    customerSampleRequired: boolean;
    signedSampleRequired?: boolean;
    workshopConfirmationRequired: boolean;
  },
): GateBlockingCode[] {
  if (!baseline) return ['VISUAL_BASELINE_MISSING'];

  const blockers: GateBlockingCode[] = [];
  if (!baseline.isCurrent) blockers.push('VISUAL_BASELINE_NOT_CURRENT');
  if (baseline.versionLabel !== expectedVersion) blockers.push('VERSION_MISMATCH');
  if (baseline.productImageCount < 1) blockers.push('PRODUCT_IMAGE_MISSING');
  if (options.filmRequired && baseline.filmImageCount < 1) blockers.push('FILM_IMAGE_MISSING');
  if (options.customerSampleRequired && baseline.customerApprovedSampleCount < 1) {
    blockers.push('CUSTOMER_SAMPLE_MISSING');
  }
  if (options.signedSampleRequired && baseline.signedSampleCount < 1) {
    blockers.push('SIGNED_SAMPLE_MISSING');
  }
  if (options.workshopConfirmationRequired && !baseline.workshopConfirmed) {
    blockers.push('WORKSHOP_VISUAL_CONFIRMATION_MISSING');
  }
  return blockers;
}

export function evaluateProductionStartGate(
  input: ProductionStartGateInput,
): GateEvaluation {
  const blockers: GateBlockingCode[] = [];

  if (input.workflowStatus !== 'READY_TO_START') {
    blockers.push('INVALID_WORKFLOW_STATUS');
  }
  if (input.filmRequired && input.filmReadiness !== 'VERSION_VERIFIED') {
    blockers.push(
      input.filmReadiness === 'ARRIVED'
        ? 'FILM_VERSION_UNVERIFIED'
        : 'FILM_NOT_READY',
    );
  }
  if (
    input.fixtureReadiness !== 'NOT_REQUIRED'
    && input.fixtureReadiness !== 'FIT_VERIFIED'
  ) {
    blockers.push('FIXTURE_NOT_READY');
  }
  if (input.incomingMaterialReadiness !== 'QUANTITY_VERIFIED') {
    blockers.push('INCOMING_MATERIAL_NOT_READY');
  }
  if (
    input.signedSampleRequired
    && input.signedSampleReadiness !== 'VERIFIED'
  ) {
    blockers.push('SIGNED_SAMPLE_MISSING');
  }

  blockers.push(...evaluateBaseline(input.visualBaseline, input.orderVersionLabel, {
    filmRequired: input.filmRequired,
    customerSampleRequired: input.customerSampleRequired,
    signedSampleRequired: input.signedSampleRequired,
    workshopConfirmationRequired: true,
  }));

  if (!input.technicalConfirmed) blockers.push('TECHNICAL_CONFIRMATION_MISSING');
  if (!input.supervisorConfirmed) blockers.push('SUPERVISOR_CONFIRMATION_MISSING');
  if (input.unresolvedBlockerCount > 0) blockers.push('OPEN_BLOCKER');

  return result(blockers);
}

export function evaluateSamplingStartGate(
  input: SamplingStartGateInput,
): GateEvaluation {
  const blockers: GateBlockingCode[] = [];

  if (input.workflowStatus !== 'READY_FOR_SAMPLING') {
    blockers.push('INVALID_WORKFLOW_STATUS');
  }
  if (input.filmRequired && input.filmReadiness !== 'VERSION_VERIFIED') {
    blockers.push(
      input.filmReadiness === 'ARRIVED'
        ? 'FILM_VERSION_UNVERIFIED'
        : 'FILM_NOT_READY',
    );
  }
  if (
    input.fixtureReadiness !== 'NOT_REQUIRED'
    && input.fixtureReadiness !== 'FIT_VERIFIED'
  ) {
    blockers.push('FIXTURE_NOT_READY');
  }
  if (input.incomingMaterialReadiness !== 'QUANTITY_VERIFIED') {
    blockers.push('INCOMING_MATERIAL_NOT_READY');
  }

  blockers.push(...evaluateBaseline(input.visualBaseline, input.requestVersionLabel, {
    filmRequired: input.filmRequired,
    customerSampleRequired: input.customerSampleRequired,
    workshopConfirmationRequired: true,
  }));

  if (!input.technicianAccepted) blockers.push('TECHNICIAN_ACCEPTANCE_MISSING');
  if (input.unresolvedBlockerCount > 0) blockers.push('OPEN_BLOCKER');

  return result(blockers);
}

export function evaluateSamplingCloseGate(
  input: SamplingCloseGateInput,
): GateEvaluation {
  const blockers: GateBlockingCode[] = [];

  if (input.workflowStatus !== 'PROJECT_CONFIRMATION') {
    blockers.push('INVALID_WORKFLOW_STATUS');
  }
  if (!input.resultDecision) blockers.push('RESULT_DECISION_MISSING');
  if (input.resultImageCount < 1) blockers.push('RESULT_IMAGE_MISSING');
  if (!input.technicalRecordComplete || !input.technicianConfirmed) {
    blockers.push('TECHNICAL_CONFIRMATION_MISSING');
  }
  if (!input.projectOwnerConfirmed) blockers.push('PROJECT_CONFIRMATION_MISSING');
  if (input.unresolvedBlockerCount > 0) blockers.push('OPEN_BLOCKER');

  return result(blockers);
}
