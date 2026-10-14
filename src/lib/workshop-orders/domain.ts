// Workshop Order System Phase 1: repository-only domain contracts.
// Two office entry points have distinct entities; workshop execution may share
// readiness, version, blockers, confirmations and append-only history.
import type {
  FilmReadiness, FixtureReadiness, IncomingMaterialReadiness,
  ProductionWorkflowStatus, ReferenceImageCategory,
  SamplingResultDecision, SamplingWorkflowStatus, SignedSampleReadiness,
} from './spec';

export type WosTaskKind = 'PRODUCTION_ORDER' | 'SAMPLING_REQUEST';
export type WosPriority = 'NORMAL' | 'URGENT';
export type WosResourceKind = 'FILM' | 'FIXTURE' | 'INCOMING_MATERIAL' | 'SIGNED_SAMPLE';
export type WosConfirmationKind = 'PROJECT_OWNER' | 'TECHNICAL' | 'WORKSHOP_SUPERVISOR' | 'QUALITY' | 'VISUAL_BASELINE';
export type WosBlockerState = 'OPEN' | 'RESOLVED';

export interface WosRequestIdentity {
  readonly id: string;
  readonly orgId: string;
  readonly projectId: string | null; // CPC project reference; not an independent customer master
  readonly customerReferenceId: string | null; // CPC reference; no customer ownership copied here
  readonly requestNumber: string;
  readonly versionLabel: string;
  readonly createdByProfileId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WosProductionOrder extends WosRequestIdentity {
  readonly kind: 'PRODUCTION_ORDER';
  readonly status: ProductionWorkflowStatus;
  readonly productName: string;
  readonly quantity: number;
  readonly priority: WosPriority;
  readonly requestedShipAt: string | null;
  readonly filmRequired: boolean;
  readonly customerSampleRequired: boolean;
  readonly signedSampleRequired: boolean;
  readonly materialName: string | null;
  readonly processRequirements: string | null;
  readonly packagingRequirements: string | null;
}

export interface WosSamplingRequest extends WosRequestIdentity {
  readonly kind: 'SAMPLING_REQUEST';
  readonly status: SamplingWorkflowStatus;
  readonly productName: string;
  readonly sampleQuantity: number;
  readonly goal: 'FEASIBILITY' | 'FINAL_PRODUCTION_EFFECT';
  readonly targetGoodQuantity: number;
  readonly filmRequired: boolean;
  readonly customerSampleRequired: boolean;
  readonly requestedAt: string;
}

export type WosOfficeRequest = WosProductionOrder | WosSamplingRequest;

export interface WosResourceReadiness {
  readonly id: string;
  readonly orgId: string;
  readonly taskKind: WosTaskKind;
  readonly taskId: string;
  readonly film: FilmReadiness;
  readonly fixture: FixtureReadiness;
  readonly incomingMaterial: IncomingMaterialReadiness;
  readonly signedSample: SignedSampleReadiness;
  readonly expectedQuantity: number | null;
  readonly receivedQuantity: number | null;
  readonly expectedArrivalAt: string | null;
  readonly confirmedByProfileId: string | null;
  readonly confirmedAt: string | null;
}

export interface WosReferenceImage {
  readonly id: string;
  readonly orgId: string;
  readonly taskKind: WosTaskKind;
  readonly taskId: string;
  readonly category: ReferenceImageCategory;
  readonly storagePath: string; // private Storage key, never public URL
  readonly mimeType: string;
  readonly fileSha256: string;
  readonly caption: string | null;
  readonly versionLabel: string;
  readonly uploadedByProfileId: string;
  readonly uploadedAt: string;
  readonly supersedesImageId: string | null; // append-only replacement, never mutate bytes
}

export interface WosVisualBaseline {
  readonly id: string;
  readonly orgId: string;
  readonly taskKind: WosTaskKind;
  readonly taskId: string;
  readonly versionLabel: string;
  readonly imageIds: readonly string[];
  readonly selectedByProfileId: string;
  readonly selectedAt: string;
  readonly retiredAt: string | null;
  readonly retiredByProfileId: string | null;
}

export interface WosVisualVerification {
  readonly baselineId: string;
  readonly verifiedByProfileId: string;
  readonly verifiedAt: string;
  readonly versionLabel: string;
}

export interface WosBlocker {
  readonly id: string;
  readonly orgId: string;
  readonly taskKind: WosTaskKind;
  readonly taskId: string;
  readonly reasonCode: string;
  readonly detail: string;
  readonly status: WosBlockerState;
  readonly reportedByProfileId: string;
  readonly reportedAt: string;
  readonly resolvedByProfileId: string | null;
  readonly resolvedAt: string | null;
}

export interface WosConfirmation {
  readonly id: string;
  readonly orgId: string;
  readonly taskKind: WosTaskKind;
  readonly taskId: string;
  readonly kind: WosConfirmationKind;
  readonly actorProfileId: string;
  readonly confirmedVersionLabel: string;
  readonly baselineId: string | null;
  readonly confirmedAt: string;
}

export interface WosSamplingAttempt {
  readonly id: string;
  readonly orgId: string;
  readonly samplingRequestId: string;
  readonly attemptNumber: number;
  readonly technicianProfileId: string;
  readonly temperatureCelsius: number | null;
  readonly pressTimeSeconds: number | null;
  readonly rollerHardness: string | null;
  readonly pressureLevel: 'LIGHT' | 'MEDIUM' | 'HEAVY' | null;
  readonly fixtureMode: 'LIVE' | 'FIXED' | null;
  readonly surfaceTreatment: string | null;
  readonly decision: SamplingResultDecision | null;
  readonly resultImageIds: readonly string[];
  readonly recordedAt: string;
}

export interface WosStatusHistory {
  readonly id: string;
  readonly orgId: string;
  readonly taskKind: WosTaskKind;
  readonly taskId: string;
  readonly previousStatus: string;
  readonly nextStatus: string;
  readonly versionLabel: string;
  readonly actorProfileId: string;
  readonly occurredAt: string;
  readonly reason: string | null;
}

// UI is deliberately not given a mutation schema for statuses, signatures,
// selected production baselines, or readiness confirmations.
export function hasConsistentVisualBaseline(
  orderVersion: string,
  baseline: WosVisualBaseline,
  images: readonly WosReferenceImage[],
): boolean {
  if (baseline.versionLabel !== orderVersion || baseline.retiredAt !== null) return false;
  if (baseline.imageIds.length === 0 || new Set(baseline.imageIds).size !== baseline.imageIds.length) return false;
  const byId = new Map(images.map(image => [image.id, image]));
  return baseline.imageIds.every(id => {
    const image = byId.get(id);
    return !!image && image.versionLabel === orderVersion
      && image.taskId === baseline.taskId && image.taskKind === baseline.taskKind
      && image.orgId === baseline.orgId;
  });
}

export function canAttachSamplingResult(
  attempt: WosSamplingAttempt,
  image: WosReferenceImage,
): boolean {
  return image.category === 'SAMPLING_RESULT'
    && image.taskKind === 'SAMPLING_REQUEST'
    && image.taskId === attempt.samplingRequestId
    && image.orgId === attempt.orgId;
}
