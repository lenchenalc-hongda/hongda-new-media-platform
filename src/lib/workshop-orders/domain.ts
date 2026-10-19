import type {
  FixtureReadiness,
  FilmReadiness,
  IncomingMaterialReadiness,
  ProductionWorkflowStatus,
  ReferenceImageCategory,
  SamplingResultDecision,
  SamplingWorkflowStatus,
  SignedSampleReadiness,
} from './spec';

export const WOS_ENTITY_TYPES = ['PRODUCTION_ORDER', 'SAMPLING_REQUEST'] as const;
export type WosEntityType = (typeof WOS_ENTITY_TYPES)[number];

export const WOS_RESOURCE_TYPES = [
  'FILM',
  'FIXTURE',
  'INCOMING_MATERIAL',
  'SIGNED_SAMPLE',
] as const;
export type WosResourceType = (typeof WOS_RESOURCE_TYPES)[number];

export const WOS_CONFIRMATION_TYPES = [
  'OFFICE_COMPLETENESS',
  'TECHNICAL',
  'WORKSHOP_SUPERVISOR',
  'QUALITY',
  'VISUAL_BASELINE',
  'PROJECT_OWNER_RESULT',
  'START_RELEASE',
] as const;
export type WosConfirmationType = (typeof WOS_CONFIRMATION_TYPES)[number];

export const WOS_BASELINE_STATUSES = ['DRAFT', 'CURRENT', 'SUPERSEDED'] as const;
export type WosBaselineStatus = (typeof WOS_BASELINE_STATUSES)[number];

export const WOS_BLOCKER_STATUSES = ['OPEN', 'RESOLVED', 'WAIVED'] as const;
export type WosBlockerStatus = (typeof WOS_BLOCKER_STATUSES)[number];

export const WOS_REFERENCE_IMAGE_STATUSES = [
  'UPLOADING',
  'READY',
  'FAILED',
  'QUARANTINED',
  'SUPERSEDED',
  'ARCHIVED',
] as const;
export type WosReferenceImageStatus = (typeof WOS_REFERENCE_IMAGE_STATUSES)[number];

export const WOS_REQUEST_STAGES = ['UNESTABLISHED', 'ESTABLISHED'] as const;
export type WosRequestStage = (typeof WOS_REQUEST_STAGES)[number];

export const WOS_SAMPLING_OBJECTIVES = [
  'PRODUCIBILITY',
  'ADHESION',
  'SEAM',
  'STRETCH',
  'EDGE',
  'POSITIONING',
  'MAX_PRINT_POSITION',
  'BULK_EFFICIENCY',
  'OTHER',
] as const;
export type WosSamplingObjective = (typeof WOS_SAMPLING_OBJECTIVES)[number];

export const WOS_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type WosPriority = (typeof WOS_PRIORITIES)[number];

export const PRODUCTION_TRANSITIONS: Readonly<Record<ProductionWorkflowStatus, readonly ProductionWorkflowStatus[]>> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['WORKSHOP_REVIEW', 'NEEDS_INFORMATION', 'CANCELLED'],
  WORKSHOP_REVIEW: ['NEEDS_INFORMATION', 'WAITING_MATERIAL', 'READINESS_CHECK', 'CANCELLED'],
  NEEDS_INFORMATION: ['SUBMITTED', 'CANCELLED'],
  WAITING_MATERIAL: ['READINESS_CHECK', 'NEEDS_INFORMATION', 'CANCELLED'],
  READINESS_CHECK: ['READY_TO_SCHEDULE', 'WAITING_MATERIAL', 'BLOCKED', 'CANCELLED'],
  READY_TO_SCHEDULE: ['SCHEDULED', 'BLOCKED', 'CANCELLED'],
  SCHEDULED: ['READY_TO_START', 'BLOCKED', 'CANCELLED'],
  READY_TO_START: ['IN_PRODUCTION', 'BLOCKED', 'CANCELLED'],
  IN_PRODUCTION: ['PAUSED', 'BLOCKED', 'PRODUCTION_COMPLETED'],
  PAUSED: ['IN_PRODUCTION', 'BLOCKED', 'CANCELLED'],
  BLOCKED: ['READINESS_CHECK', 'READY_TO_SCHEDULE', 'READY_TO_START', 'IN_PRODUCTION', 'CANCELLED'],
  PRODUCTION_COMPLETED: ['READY_FOR_SHIPMENT', 'BLOCKED'],
  READY_FOR_SHIPMENT: ['CLOSED', 'BLOCKED'],
  CLOSED: [],
  CANCELLED: [],
};

export const SAMPLING_TRANSITIONS: Readonly<Record<SamplingWorkflowStatus, readonly SamplingWorkflowStatus[]>> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['TECHNICIAN_REVIEW', 'NEEDS_INFORMATION', 'CANCELLED'],
  TECHNICIAN_REVIEW: ['NEEDS_INFORMATION', 'WAITING_RESOURCE', 'READY_FOR_SAMPLING', 'CANCELLED'],
  NEEDS_INFORMATION: ['SUBMITTED', 'CANCELLED'],
  WAITING_RESOURCE: ['TECHNICIAN_REVIEW', 'READY_FOR_SAMPLING', 'CANCELLED'],
  READY_FOR_SAMPLING: ['SAMPLING_IN_PROGRESS', 'WAITING_RESOURCE', 'CANCELLED'],
  SAMPLING_IN_PROGRESS: ['RESULT_REVIEW', 'WAITING_RESOURCE', 'CANCELLED'],
  RESULT_REVIEW: ['PROJECT_CONFIRMATION'],
  PROJECT_CONFIRMATION: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransitionProduction(
  from: ProductionWorkflowStatus,
  to: ProductionWorkflowStatus,
): boolean {
  return PRODUCTION_TRANSITIONS[from].includes(to);
}

export function canTransitionSampling(
  from: SamplingWorkflowStatus,
  to: SamplingWorkflowStatus,
): boolean {
  return SAMPLING_TRANSITIONS[from].includes(to);
}

export interface WosProductionOrder {
  id: string;
  organizationId: string;
  customerId: string | null;
  customerNameSnapshot: string;
  projectId: string | null;
  projectNameSnapshot: string | null;
  orderNumber: string;
  productName: string;
  salesOwnerProfileId: string;
  projectOwnerProfileId: string;
  priority: WosPriority;
  isUrgent: boolean;
  versionLabel: string;
  workflowStatus: ProductionWorkflowStatus;
  requestedQuantity: number;
  currentBatchQuantity: number;
  plannedShipDate: string | null;
  productMaterial: string;
  surfaceTreatment: string | null;
  customerAcceptanceStandard: string | null;
  createdByProfileId: string;
}

export interface WosSamplingRequest {
  id: string;
  organizationId: string;
  customerId: string | null;
  customerNameSnapshot: string;
  projectId: string | null;
  projectNameSnapshot: string | null;
  productName: string;
  productOwnerProfileId: string;
  requestStage: WosRequestStage;
  objectives: WosSamplingObjective[];
  versionLabel: string;
  workflowStatus: SamplingWorkflowStatus;
  resultDecision: SamplingResultDecision | null;
  productMaterial: string;
  surfaceTreatment: string | null;
  sampleInputQuantity: number;
  requiredGoodQuantity: number;
  createdByProfileId: string;
}

export type WosResourceReadinessStatus =
  | FilmReadiness
  | FixtureReadiness
  | IncomingMaterialReadiness
  | SignedSampleReadiness;

export interface WosResourceReadiness {
  id: string;
  organizationId: string;
  entityType: WosEntityType;
  entityId: string;
  resourceType: WosResourceType;
  status: WosResourceReadinessStatus;
  versionLabel: string | null;
  confirmedByProfileId: string | null;
  confirmedAt: string | null;
}

export interface WosReferenceImage {
  id: string;
  organizationId: string;
  entityType: WosEntityType;
  entityId: string;
  category: ReferenceImageCategory;
  storageBucket: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  versionLabel: string;
  imageStatus: WosReferenceImageStatus;
  supersedesImageId: string | null;
  uploadedByProfileId: string;
}

export interface WosVisualBaseline {
  id: string;
  organizationId: string;
  entityType: WosEntityType;
  entityId: string;
  versionLabel: string;
  status: WosBaselineStatus;
  confirmedByOfficeProfileId: string | null;
  confirmedByWorkshopProfileId: string | null;
}

export interface WosBlocker {
  id: string;
  organizationId: string;
  entityType: WosEntityType;
  entityId: string;
  blockerCode: string;
  blockerCategory: string;
  description: string;
  status: WosBlockerStatus;
  openedByProfileId: string;
  resolvedByProfileId: string | null;
}

export interface WosConfirmation {
  id: string;
  organizationId: string;
  entityType: WosEntityType;
  entityId: string;
  confirmationType: WosConfirmationType;
  decision: 'CONFIRMED' | 'REJECTED';
  profileId: string;
  roleSnapshot: string;
}

export interface WosSamplingTechnicalAttempt {
  id: string;
  organizationId: string;
  samplingRequestId: string;
  attemptNumber: number;
  machineLabel: string;
  temperature: number | null;
  transferSeconds: number | null;
  rollerHardness: string | null;
  fixtureMode: string | null;
  pressureLevel: 'LIGHT' | 'MEDIUM' | 'HEAVY' | null;
  pretreatment: string | null;
  filmVersionLabel: string | null;
  resultDecision: SamplingResultDecision;
  technicianProfileId: string;
}

export interface WosStatusTransition {
  entityType: WosEntityType;
  entityId: string;
  fromStatus: ProductionWorkflowStatus | SamplingWorkflowStatus;
  toStatus: ProductionWorkflowStatus | SamplingWorkflowStatus;
  actorProfileId: string;
  reasonCode: string;
  note?: string | null;
}

export interface WosVersionAlignmentInput {
  entityVersionLabel: string;
  baselineVersionLabel: string | null;
  filmVersionLabel: string | null;
  filmRequired: boolean;
  baselineIsCurrent: boolean;
}

export interface WosVersionAlignmentResult {
  allowed: boolean;
  blockingCodes: Array<
    | 'BASELINE_MISSING'
    | 'BASELINE_NOT_CURRENT'
    | 'BASELINE_VERSION_MISMATCH'
    | 'FILM_VERSION_MISSING'
    | 'FILM_VERSION_MISMATCH'
  >;
}

export function evaluateVersionAlignment(
  input: WosVersionAlignmentInput,
): WosVersionAlignmentResult {
  const blockingCodes: WosVersionAlignmentResult['blockingCodes'] = [];

  if (!input.baselineVersionLabel) {
    blockingCodes.push('BASELINE_MISSING');
  } else {
    if (!input.baselineIsCurrent) blockingCodes.push('BASELINE_NOT_CURRENT');
    if (input.baselineVersionLabel !== input.entityVersionLabel) {
      blockingCodes.push('BASELINE_VERSION_MISMATCH');
    }
  }

  if (input.filmRequired) {
    if (!input.filmVersionLabel) blockingCodes.push('FILM_VERSION_MISSING');
    else if (input.filmVersionLabel !== input.entityVersionLabel) {
      blockingCodes.push('FILM_VERSION_MISMATCH');
    }
  }

  return {
    allowed: blockingCodes.length === 0,
    blockingCodes,
  };
}

export interface WosBaselineReplacement {
  previousBaseline: WosVisualBaseline;
  nextBaseline: WosVisualBaseline;
}

export function replaceCurrentBaseline(
  current: WosVisualBaseline,
  replacement: WosVisualBaseline,
): WosBaselineReplacement {
  if (current.entityType !== replacement.entityType || current.entityId !== replacement.entityId) {
    throw new Error('baseline replacement must target the same entity');
  }
  if (current.status !== 'CURRENT') {
    throw new Error('only a CURRENT baseline can be superseded');
  }
  if (replacement.id === current.id) {
    throw new Error('baseline records are immutable; replacement requires a new id');
  }

  return {
    previousBaseline: { ...current, status: 'SUPERSEDED' },
    nextBaseline: {
      ...replacement,
      status: 'CURRENT',
      confirmedByWorkshopProfileId: null,
    },
  };
}

const CONSEQUENTIAL_PRODUCTION_STATUSES = new Set<ProductionWorkflowStatus>([
  'READY_TO_SCHEDULE',
  'SCHEDULED',
  'READY_TO_START',
  'IN_PRODUCTION',
  'PRODUCTION_COMPLETED',
  'READY_FOR_SHIPMENT',
  'CLOSED',
]);

const CONSEQUENTIAL_SAMPLING_STATUSES = new Set<SamplingWorkflowStatus>([
  'READY_FOR_SAMPLING',
  'SAMPLING_IN_PROGRESS',
  'RESULT_REVIEW',
  'PROJECT_CONFIRMATION',
  'CLOSED',
]);

export function mayClientDirectlySetWorkflowStatus(
  entityType: WosEntityType,
  status: ProductionWorkflowStatus | SamplingWorkflowStatus,
): boolean {
  if (entityType === 'PRODUCTION_ORDER') {
    return !CONSEQUENTIAL_PRODUCTION_STATUSES.has(status as ProductionWorkflowStatus);
  }
  return !CONSEQUENTIAL_SAMPLING_STATUSES.has(status as SamplingWorkflowStatus);
}
