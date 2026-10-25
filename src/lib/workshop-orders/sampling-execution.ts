import type { WosSamplingRequest } from './domain';
import {
  evaluateProductionStartGate,
  type FilmReadiness,
  type FixtureReadiness,
  type GateEvaluation,
  type IncomingMaterialReadiness,
  type SamplingResultDecision,
  type SamplingWorkflowStatus,
  type SignedSampleReadiness,
  type VisualBaselineSummary,
} from './spec';

export const SAMPLING_RESULT_IMAGE_CATEGORIES = [
  'OVERALL_RESULT',
  'SEAM',
  'EDGE',
  'STRETCH_AREA',
  'ADHESION_TEST',
  'DEFECT_DETAIL',
] as const;
export type SamplingResultImageCategory =
  (typeof SAMPLING_RESULT_IMAGE_CATEGORIES)[number];

export const SAMPLING_RESULT_IMAGE_STATUSES = [
  'READY',
  'UPLOADING',
  'FAILED',
  'QUARANTINED',
  'SUPERSEDED',
  'ARCHIVED',
] as const;
export type SamplingResultImageStatus =
  (typeof SAMPLING_RESULT_IMAGE_STATUSES)[number];

export const SAMPLING_PRESSURE_LEVELS = ['LIGHT', 'MEDIUM', 'HEAVY'] as const;
export type SamplingPressureLevel = (typeof SAMPLING_PRESSURE_LEVELS)[number];

export const SAMPLING_RESULT_CONFIRMATION_TYPES = [
  'TECHNICIAN',
  'PROJECT_OWNER',
] as const;
export type SamplingResultConfirmationType =
  (typeof SAMPLING_RESULT_CONFIRMATION_TYPES)[number];

export interface SamplingTechnicalParameterVersion {
  readonly versionLabel: string;
  readonly machineLabel: string;
  readonly temperatureC: number | null;
  readonly transferSeconds: number | null;
  readonly rollerHardness: string | null;
  readonly fixtureMode: string | null;
  readonly pressureLevel: SamplingPressureLevel | null;
  readonly pressureNote: string | null;
  readonly pretreatment: string | null;
  readonly filmVersionLabel: string | null;
  readonly adjustmentCount: number | null;
  readonly estimatedBulkEfficiency: string | null;
}

export interface SamplingResultImageReference {
  readonly imageId: string;
  readonly organizationId: string;
  readonly samplingRequestId: string;
  readonly attemptId: string;
  readonly category: SamplingResultImageCategory;
  readonly versionLabel: string;
  readonly status: SamplingResultImageStatus;
}

export interface SamplingAttemptCommand {
  readonly attemptId: string;
  readonly organizationId: string;
  readonly samplingRequestId: string;
  readonly attemptNumber: number;
  readonly requestVersionLabel: string;
  readonly parameterVersion: SamplingTechnicalParameterVersion;
  readonly resultDecision: SamplingResultDecision;
  readonly failureReason: string | null;
  readonly bulkRiskNotes: string | null;
  readonly improvementRecommendation: string | null;
  readonly resultImages: readonly SamplingResultImageReference[];
  readonly technicianProfileId: string;
  readonly completedAt: string;
}

export type SamplingExecutionAttempt = SamplingAttemptCommand;

export interface SamplingResultConfirmation {
  readonly confirmationId: string;
  readonly organizationId: string;
  readonly samplingRequestId: string;
  readonly attemptId: string;
  readonly confirmationType: SamplingResultConfirmationType;
  readonly decision: 'CONFIRMED' | 'REJECTED';
  readonly profileId: string;
  readonly roleSnapshot: string;
  readonly confirmedAt: string;
}

export type SamplingExecutionBlockerCode =
  | 'INVALID_EXECUTION_INPUT'
  | 'REQUEST_IDENTITY_MISMATCH'
  | 'REQUEST_VERSION_MISSING'
  | 'REQUEST_VERSION_STALE'
  | 'ATTEMPT_HISTORY_INVALID'
  | 'ATTEMPT_ID_MISSING'
  | 'ATTEMPT_ID_DUPLICATE'
  | 'ATTEMPT_ID_MISMATCH'
  | 'ATTEMPT_SEQUENCE_INVALID'
  | 'ATTEMPT_NOT_FOUND'
  | 'STALE_RESULT'
  | 'PARAMETER_VERSION_MISSING'
  | 'PARAMETER_VERSION_STALE'
  | 'PARAMETER_MISSING'
  | 'FILM_VERSION_STALE'
  | 'RESULT_DECISION_MISSING'
  | 'FAILURE_REASON_MISSING'
  | 'RESULT_IMAGE_MISSING'
  | 'RESULT_IMAGE_ATTEMPT_MISMATCH'
  | 'RESULT_IMAGE_VERSION_MISMATCH'
  | 'RESULT_IMAGE_NOT_READY'
  | 'TECHNICIAN_PROFILE_MISSING'
  | 'TECHNICIAN_CONFIRMATION_MISSING'
  | 'TECHNICIAN_CONFIRMATION_REJECTED'
  | 'TECHNICIAN_CONFIRMATION_PROFILE_MISMATCH'
  | 'PROJECT_OWNER_CONFIRMATION_MISSING'
  | 'PROJECT_OWNER_CONFIRMATION_REJECTED'
  | 'PROJECT_OWNER_CONFIRMATION_PROFILE_MISMATCH'
  | 'CONFIRMATION_ROLE_MISMATCH'
  | 'CONFIRMATION_CONFLICT'
  | 'RESULT_REVIEW_NOT_APPROVED'
  | 'PASS_DECISION_REQUIRED'
  | 'DRAFT_ID_MISSING'
  | 'DRAFT_NUMBER_MISSING';

export interface SamplingExecutionBlocker {
  readonly code: SamplingExecutionBlockerCode;
  readonly message: string;
}

export interface SamplingAttemptAppendResult {
  readonly appended: boolean;
  readonly history: readonly SamplingExecutionAttempt[];
  readonly attempt: SamplingExecutionAttempt | null;
  readonly blockers: readonly SamplingExecutionBlocker[];
}

export interface SamplingResultReviewResult {
  readonly allowed: boolean;
  readonly workflowStatus:
    | Extract<SamplingWorkflowStatus, 'RESULT_REVIEW' | 'PROJECT_CONFIRMATION' | 'CLOSED'>;
  readonly decision: SamplingResultDecision | null;
  readonly selectedAttempt: SamplingExecutionAttempt | null;
  readonly technicianConfirmed: boolean;
  readonly projectOwnerConfirmed: boolean;
  readonly productionDraftEligible: boolean;
  readonly blockers: readonly SamplingExecutionBlocker[];
}

export interface SamplingProductionGateEvidence {
  readonly filmRequired: boolean;
  readonly customerSampleRequired: boolean;
  readonly signedSampleRequired: boolean;
  readonly filmReadiness: FilmReadiness;
  readonly fixtureReadiness: FixtureReadiness;
  readonly incomingMaterialReadiness: IncomingMaterialReadiness;
  readonly signedSampleReadiness: SignedSampleReadiness;
  readonly visualBaseline: VisualBaselineSummary | null;
  readonly technicalConfirmed: boolean;
  readonly supervisorConfirmed: boolean;
  readonly unresolvedBlockerCount: number;
}

export interface SamplingProductionDraftInput {
  readonly draftId: string;
  readonly orderNumber: string;
  readonly request: WosSamplingRequest;
  readonly review: SamplingResultReviewResult;
  readonly productionGate: SamplingProductionGateEvidence | null;
}

export interface SamplingProductionDraft {
  readonly id: string;
  readonly organizationId: string;
  readonly customerId: string | null;
  readonly customerNameSnapshot: string;
  readonly projectId: string | null;
  readonly projectNameSnapshot: string | null;
  readonly orderNumber: string;
  readonly productName: string;
  readonly projectOwnerProfileId: string;
  readonly versionLabel: string;
  readonly workflowStatus: 'DRAFT';
  readonly sourceSamplingRequestId: string;
  readonly sourceAttemptId: string;
  readonly sourceAttemptNumber: number;
  readonly sourceResultDecision: 'PASS';
  readonly productMaterial: string;
  readonly surfaceTreatment: string | null;
  readonly parameterVersion: SamplingTechnicalParameterVersion;
  readonly resultImages: readonly SamplingResultImageReference[];
  readonly bulkRiskNotes: string | null;
  readonly improvementRecommendation: string | null;
  readonly productionStartGate: GateEvaluation;
  readonly canStartProduction: false;
}

export interface SamplingProductionDraftResult {
  readonly draft: SamplingProductionDraft | null;
  readonly blockers: readonly SamplingExecutionBlocker[];
}

const BLOCKER_MESSAGES: Readonly<
  Record<SamplingExecutionBlockerCode, string>
> = {
  INVALID_EXECUTION_INPUT: '执行记录或审阅输入不完整或格式无效',
  REQUEST_IDENTITY_MISMATCH: '组织或打样申请与当前任务不一致',
  REQUEST_VERSION_MISSING: '当前打样申请缺少有效版本',
  REQUEST_VERSION_STALE: '执行记录版本与当前打样申请版本不一致',
  ATTEMPT_HISTORY_INVALID: '历史技术尝试不连续、重复或结构无效',
  ATTEMPT_ID_MISSING: '技术尝试缺少 ID',
  ATTEMPT_ID_DUPLICATE: '技术尝试 ID 已存在，历史记录不可覆盖',
  ATTEMPT_ID_MISMATCH: '参数或结果图片绑定的尝试 ID 不一致',
  ATTEMPT_SEQUENCE_INVALID: '新尝试次数必须紧接当前历史次数',
  ATTEMPT_NOT_FOUND: '找不到指定的技术尝试',
  STALE_RESULT: '指定的技术尝试不是最新尝试，结果已过期',
  PARAMETER_VERSION_MISSING: '技术参数缺少参数版本',
  PARAMETER_VERSION_STALE: '技术参数版本与申请版本不一致',
  PARAMETER_MISSING: '技术参数不完整或无效',
  FILM_VERSION_STALE: '执行参数中的花膜版本与申请版本不一致',
  RESULT_DECISION_MISSING: '缺少有效的 PASS、FAIL 或 CANNOT_SAMPLE 判定',
  FAILURE_REASON_MISSING: '非 PASS 结果必须填写失败或无法打样原因',
  RESULT_IMAGE_MISSING: '至少需要一张已就绪的本次尝试结果图',
  RESULT_IMAGE_ATTEMPT_MISMATCH: '结果图未绑定到本次技术尝试',
  RESULT_IMAGE_VERSION_MISMATCH: '结果图版本与当前申请版本不一致',
  RESULT_IMAGE_NOT_READY: '结果图尚未就绪、已失败或已被替代',
  TECHNICIAN_PROFILE_MISSING: '技术尝试缺少技术员',
  TECHNICIAN_CONFIRMATION_MISSING: '技术员尚未确认本次结果',
  TECHNICIAN_CONFIRMATION_REJECTED: '技术员已拒绝本次结果',
  TECHNICIAN_CONFIRMATION_PROFILE_MISMATCH: '确认技术员与执行技术员不一致',
  PROJECT_OWNER_CONFIRMATION_MISSING: '项目负责人尚未确认本次结果',
  PROJECT_OWNER_CONFIRMATION_REJECTED: '项目负责人已拒绝本次结果',
  PROJECT_OWNER_CONFIRMATION_PROFILE_MISMATCH:
    '项目确认人与打样申请负责人不一致',
  CONFIRMATION_ROLE_MISMATCH: '确认角色快照与确认类型不一致',
  CONFIRMATION_CONFLICT: '同一角色存在互相冲突的确认记录',
  RESULT_REVIEW_NOT_APPROVED: '结果审阅未通过，不能转生产单草稿',
  PASS_DECISION_REQUIRED: '只有最新 PASS 结果可以转生产单草稿',
  DRAFT_ID_MISSING: '生产单草稿缺少草稿 ID',
  DRAFT_NUMBER_MISSING: '生产单草稿缺少订单编号',
};

const DECISIONS = new Set<string>(['PASS', 'FAIL', 'CANNOT_SAMPLE']);
const RESULT_IMAGE_CATEGORY_SET = new Set<string>(
  SAMPLING_RESULT_IMAGE_CATEGORIES,
);
const RESULT_IMAGE_STATUS_SET = new Set<string>(
  SAMPLING_RESULT_IMAGE_STATUSES,
);
const PRESSURE_LEVEL_SET = new Set<string>(SAMPLING_PRESSURE_LEVELS);
const CONFIRMATION_TYPE_SET = new Set<string>(
  SAMPLING_RESULT_CONFIRMATION_TYPES,
);
const FILM_READINESS_SET = new Set<string>([
  'NOT_REQUIRED',
  'NOT_ARRIVED',
  'PARTIALLY_ARRIVED',
  'ARRIVED',
  'VERSION_VERIFIED',
]);
const FIXTURE_READINESS_SET = new Set<string>([
  'NOT_REQUIRED',
  'NOT_AVAILABLE',
  'IN_PRODUCTION',
  'ARRIVED',
  'FIT_VERIFIED',
]);
const INCOMING_MATERIAL_READINESS_SET = new Set<string>([
  'NOT_ARRIVED',
  'PARTIALLY_ARRIVED',
  'ARRIVED',
  'QUANTITY_VERIFIED',
]);
const SIGNED_SAMPLE_READINESS_SET = new Set<string>([
  'NOT_REQUIRED',
  'MISSING',
  'UPLOADED',
  'PHYSICAL_SAMPLE_RECEIVED',
  'VERIFIED',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function addBlocker(
  blockers: SamplingExecutionBlocker[],
  code: SamplingExecutionBlockerCode,
): void {
  if (blockers.some((blocker) => blocker.code === code)) return;
  blockers.push({
    code,
    message: BLOCKER_MESSAGES[code],
  });
}

function requestIdentityIsValid(request: WosSamplingRequest): boolean {
  return (
    isRecord(request)
    && isNonEmptyString(request.id)
    && isNonEmptyString(request.organizationId)
    && isNonEmptyString(request.productOwnerProfileId)
  );
}

function parameterValuesAreComplete(
  parameter: SamplingTechnicalParameterVersion,
): boolean {
  if (!isRecord(parameter)) return false;
  return (
    isNonEmptyString(parameter.versionLabel)
    && isNonEmptyString(parameter.machineLabel)
    && isPositiveFiniteNumber(parameter.temperatureC)
    && isPositiveFiniteNumber(parameter.transferSeconds)
    && isNonEmptyString(parameter.rollerHardness)
    && isNonEmptyString(parameter.fixtureMode)
    && typeof parameter.pressureLevel === 'string'
    && PRESSURE_LEVEL_SET.has(parameter.pressureLevel)
    && isNonEmptyString(parameter.pressureNote)
    && isNonEmptyString(parameter.pretreatment)
    && isNonEmptyString(parameter.filmVersionLabel)
    && isPositiveInteger(parameter.adjustmentCount)
    && isNonEmptyString(parameter.estimatedBulkEfficiency)
  );
}

function resultImageShapeIsValid(image: SamplingResultImageReference): boolean {
  return (
    isRecord(image)
    && isNonEmptyString(image.imageId)
    && isNonEmptyString(image.organizationId)
    && isNonEmptyString(image.samplingRequestId)
    && isNonEmptyString(image.attemptId)
    && typeof image.category === 'string'
    && RESULT_IMAGE_CATEGORY_SET.has(image.category)
    && isNonEmptyString(image.versionLabel)
    && typeof image.status === 'string'
    && RESULT_IMAGE_STATUS_SET.has(image.status)
  );
}

function attemptShapeIsValid(attempt: SamplingExecutionAttempt): boolean {
  return (
    isRecord(attempt)
    && isNonEmptyString(attempt.attemptId)
    && isNonEmptyString(attempt.organizationId)
    && isNonEmptyString(attempt.samplingRequestId)
    && isPositiveInteger(attempt.attemptNumber)
    && isNonEmptyString(attempt.requestVersionLabel)
    && parameterValuesAreComplete(attempt.parameterVersion)
    && typeof attempt.resultDecision === 'string'
    && DECISIONS.has(attempt.resultDecision)
    && (attempt.failureReason === null || isNonEmptyString(attempt.failureReason))
    && (
      attempt.resultDecision === 'PASS'
      || isNonEmptyString(attempt.failureReason)
    )
    && (attempt.bulkRiskNotes === null || isNonEmptyString(attempt.bulkRiskNotes))
    && (
      attempt.improvementRecommendation === null
      || isNonEmptyString(attempt.improvementRecommendation)
    )
    && Array.isArray(attempt.resultImages)
    && isNonEmptyString(attempt.technicianProfileId)
    && isNonEmptyString(attempt.completedAt)
  );
}

function historyShapeIsValid(
  history: readonly SamplingExecutionAttempt[],
  request: WosSamplingRequest,
): boolean {
  if (!Array.isArray(history)) return false;

  const attemptIds = new Set<string>();
  const imageIds = new Set<string>();

  for (const [index, attempt] of history.entries()) {
    if (
      !attemptShapeIsValid(attempt)
      || attempt.attemptNumber !== index + 1
      || attempt.organizationId !== request.organizationId
      || attempt.samplingRequestId !== request.id
      || attemptIds.has(attempt.attemptId)
    ) {
      return false;
    }
    attemptIds.add(attempt.attemptId);

    const resultImages =
      attempt.resultImages as readonly SamplingResultImageReference[];
    if (
      !Array.isArray(resultImages)
      || resultImages.length === 0
      || resultImages.some((image) => (
        !resultImageShapeIsValid(image)
        || image.attemptId !== attempt.attemptId
        || image.organizationId !== request.organizationId
        || image.samplingRequestId !== request.id
        || imageIds.has(image.imageId)
      ))
    ) {
      return false;
    }
    for (const image of resultImages) imageIds.add(image.imageId);
  }

  return true;
}

function validateCurrentAttempt(
  attempt: SamplingAttemptCommand,
  request: WosSamplingRequest,
  expectedAttemptNumber: number,
  existingAttemptIds: ReadonlySet<string>,
  blockers: SamplingExecutionBlocker[],
): void {
  if (!isRecord(attempt)) {
    addBlocker(blockers, 'INVALID_EXECUTION_INPUT');
    return;
  }

  if (!isNonEmptyString(attempt.attemptId)) {
    addBlocker(blockers, 'ATTEMPT_ID_MISSING');
  } else if (existingAttemptIds.has(attempt.attemptId)) {
    addBlocker(blockers, 'ATTEMPT_ID_DUPLICATE');
  }

  if (
    attempt.organizationId !== request.organizationId
    || attempt.samplingRequestId !== request.id
  ) {
    addBlocker(blockers, 'REQUEST_IDENTITY_MISMATCH');
  }

  if (attempt.attemptNumber !== expectedAttemptNumber) {
    addBlocker(blockers, 'ATTEMPT_SEQUENCE_INVALID');
  }

  if (!isNonEmptyString(request.versionLabel)) {
    addBlocker(blockers, 'REQUEST_VERSION_MISSING');
  }
  if (!isNonEmptyString(attempt.requestVersionLabel)) {
    addBlocker(blockers, 'REQUEST_VERSION_MISSING');
  } else if (
    isNonEmptyString(request.versionLabel)
    && attempt.requestVersionLabel !== request.versionLabel
  ) {
    addBlocker(blockers, 'REQUEST_VERSION_STALE');
  }

  const parameter = attempt.parameterVersion;
  if (!isRecord(parameter) || !isNonEmptyString(parameter.versionLabel)) {
    addBlocker(blockers, 'PARAMETER_VERSION_MISSING');
  } else if (parameter.versionLabel !== attempt.requestVersionLabel) {
    addBlocker(blockers, 'PARAMETER_VERSION_STALE');
  }
  if (!parameterValuesAreComplete(parameter)) {
    addBlocker(blockers, 'PARAMETER_MISSING');
  } else if (parameter.filmVersionLabel !== attempt.requestVersionLabel) {
    addBlocker(blockers, 'FILM_VERSION_STALE');
  }

  if (!DECISIONS.has(attempt.resultDecision)) {
    addBlocker(blockers, 'RESULT_DECISION_MISSING');
  }
  if (
    attempt.resultDecision !== 'PASS'
    && !isNonEmptyString(attempt.failureReason)
  ) {
    addBlocker(blockers, 'FAILURE_REASON_MISSING');
  }
  if (!isNonEmptyString(attempt.technicianProfileId)) {
    addBlocker(blockers, 'TECHNICIAN_PROFILE_MISSING');
  }
  if (!isNonEmptyString(attempt.completedAt)) {
    addBlocker(blockers, 'INVALID_EXECUTION_INPUT');
  }

  if (!Array.isArray(attempt.resultImages) || attempt.resultImages.length === 0) {
    addBlocker(blockers, 'RESULT_IMAGE_MISSING');
    return;
  }

  const resultImageIds = new Set<string>();
  for (const image of attempt.resultImages) {
    if (!resultImageShapeIsValid(image)) {
      addBlocker(blockers, 'INVALID_EXECUTION_INPUT');
      continue;
    }
    if (resultImageIds.has(image.imageId)) {
      addBlocker(blockers, 'INVALID_EXECUTION_INPUT');
    }
    resultImageIds.add(image.imageId);
    if (image.attemptId !== attempt.attemptId) {
      addBlocker(blockers, 'RESULT_IMAGE_ATTEMPT_MISMATCH');
    }
    if (
      image.organizationId !== request.organizationId
      || image.samplingRequestId !== request.id
      || image.attemptId !== attempt.attemptId
    ) {
      addBlocker(blockers, 'ATTEMPT_ID_MISMATCH');
    }
    if (
      !isNonEmptyString(attempt.requestVersionLabel)
      || image.versionLabel !== attempt.requestVersionLabel
    ) {
      addBlocker(blockers, 'RESULT_IMAGE_VERSION_MISMATCH');
    }
    if (image.status !== 'READY') {
      addBlocker(blockers, 'RESULT_IMAGE_NOT_READY');
    }
  }

  if (resultImageIds.size !== attempt.resultImages.length) {
    addBlocker(blockers, 'INVALID_EXECUTION_INPUT');
  }
}

function cloneFrozenAttempt(
  attempt: SamplingAttemptCommand,
): SamplingExecutionAttempt {
  const parameterVersion = Object.freeze({
    ...attempt.parameterVersion,
  });
  const resultImages = Object.freeze(
    attempt.resultImages.map((image) => Object.freeze({ ...image })),
  );
  return Object.freeze({
    ...attempt,
    parameterVersion,
    resultImages,
  });
}

export function appendSamplingAttempt(
  history: readonly SamplingExecutionAttempt[],
  attempt: SamplingAttemptCommand,
  request: WosSamplingRequest,
): SamplingAttemptAppendResult {
  const blockers: SamplingExecutionBlocker[] = [];

  if (!requestIdentityIsValid(request)) {
    addBlocker(blockers, 'INVALID_EXECUTION_INPUT');
    return {
      appended: false,
      history,
      attempt: null,
      blockers,
    };
  }

  if (!historyShapeIsValid(history, request)) {
    addBlocker(blockers, 'ATTEMPT_HISTORY_INVALID');
    return {
      appended: false,
      history,
      attempt: null,
      blockers,
    };
  }

  const existingAttemptIds = new Set(
    history.map((entry) => entry.attemptId),
  );
  validateCurrentAttempt(
    attempt,
    request,
    history.length + 1,
    existingAttemptIds,
    blockers,
  );

  if (blockers.length > 0) {
    return {
      appended: false,
      history,
      attempt: null,
      blockers,
    };
  }

  const savedAttempt = cloneFrozenAttempt(attempt);
  return {
    appended: true,
    history: Object.freeze([...history, savedAttempt]),
    attempt: savedAttempt,
    blockers: [],
  };
}

function confirmationShapeIsValid(
  confirmation: SamplingResultConfirmation,
): boolean {
  return (
    isRecord(confirmation)
    && isNonEmptyString(confirmation.confirmationId)
    && isNonEmptyString(confirmation.organizationId)
    && isNonEmptyString(confirmation.samplingRequestId)
    && isNonEmptyString(confirmation.attemptId)
    && typeof confirmation.confirmationType === 'string'
    && CONFIRMATION_TYPE_SET.has(confirmation.confirmationType)
    && (
      confirmation.decision === 'CONFIRMED'
      || confirmation.decision === 'REJECTED'
    )
    && isNonEmptyString(confirmation.profileId)
    && isNonEmptyString(confirmation.roleSnapshot)
    && isNonEmptyString(confirmation.confirmedAt)
  );
}

function confirmationsForType(
  confirmations: readonly SamplingResultConfirmation[],
  request: WosSamplingRequest,
  attemptId: string,
  type: SamplingResultConfirmationType,
  blockers: SamplingExecutionBlocker[],
): SamplingResultConfirmation[] {
  const matching: SamplingResultConfirmation[] = [];

  for (const confirmation of confirmations) {
    if (!confirmationShapeIsValid(confirmation)) {
      addBlocker(blockers, 'INVALID_EXECUTION_INPUT');
      continue;
    }
    if (
      confirmation.organizationId !== request.organizationId
      || confirmation.samplingRequestId !== request.id
    ) {
      addBlocker(blockers, 'REQUEST_IDENTITY_MISMATCH');
      continue;
    }
    if (
      confirmation.attemptId === attemptId
      && confirmation.confirmationType === type
    ) {
      const expectedRole = type === 'TECHNICIAN'
        ? 'TECHNICIAN'
        : 'PROJECT_OWNER';
      if (confirmation.roleSnapshot !== expectedRole) {
        addBlocker(blockers, 'CONFIRMATION_ROLE_MISMATCH');
      }
      matching.push(confirmation);
    }
  }

  const confirmationIds = new Set(
    matching.map((confirmation) => confirmation.confirmationId),
  );
  if (confirmationIds.size !== matching.length) {
    addBlocker(blockers, 'CONFIRMATION_CONFLICT');
  }
  if (matching.length > 1) {
    addBlocker(blockers, 'CONFIRMATION_CONFLICT');
  }

  return matching;
}

export function evaluateSamplingResultReview(input: {
  readonly request: WosSamplingRequest;
  readonly attempts: readonly SamplingExecutionAttempt[];
  readonly confirmations: readonly SamplingResultConfirmation[];
  readonly selectedAttemptId: string;
}): SamplingResultReviewResult {
  const blockers: SamplingExecutionBlocker[] = [];
  const { request, attempts, confirmations, selectedAttemptId } = input;

  if (!requestIdentityIsValid(request)) {
    addBlocker(blockers, 'INVALID_EXECUTION_INPUT');
    return {
      allowed: false,
      workflowStatus: 'RESULT_REVIEW',
      decision: null,
      selectedAttempt: null,
      technicianConfirmed: false,
      projectOwnerConfirmed: false,
      productionDraftEligible: false,
      blockers,
    };
  }

  if (
    !historyShapeIsValid(attempts, request)
    || !Array.isArray(confirmations)
  ) {
    addBlocker(blockers, 'ATTEMPT_HISTORY_INVALID');
    return {
      allowed: false,
      workflowStatus: 'RESULT_REVIEW',
      decision: null,
      selectedAttempt: null,
      technicianConfirmed: false,
      projectOwnerConfirmed: false,
      productionDraftEligible: false,
      blockers,
    };
  }

  if (!isNonEmptyString(selectedAttemptId)) {
    addBlocker(blockers, 'ATTEMPT_NOT_FOUND');
  }
  const selectedMatches = attempts.filter(
    (attempt) => attempt.attemptId === selectedAttemptId,
  );
  const selectedAttempt = selectedMatches.length === 1
    ? selectedMatches[0]
    : null;
  if (!selectedAttempt) {
    addBlocker(blockers, 'ATTEMPT_NOT_FOUND');
  } else {
    const latestAttempt = attempts[attempts.length - 1];
    if (selectedAttempt.attemptId !== latestAttempt.attemptId) {
      addBlocker(blockers, 'STALE_RESULT');
    }
    if (!isNonEmptyString(request.versionLabel)) {
      addBlocker(blockers, 'REQUEST_VERSION_MISSING');
    } else if (
      selectedAttempt.requestVersionLabel !== request.versionLabel
    ) {
      addBlocker(blockers, 'REQUEST_VERSION_STALE');
    }
    if (
      selectedAttempt.parameterVersion.versionLabel
      !== selectedAttempt.requestVersionLabel
    ) {
      addBlocker(blockers, 'PARAMETER_VERSION_STALE');
    }
    if (
      selectedAttempt.parameterVersion.filmVersionLabel
      !== selectedAttempt.requestVersionLabel
    ) {
      addBlocker(blockers, 'FILM_VERSION_STALE');
    }
    for (const image of selectedAttempt.resultImages) {
      if (image.versionLabel !== selectedAttempt.requestVersionLabel) {
        addBlocker(blockers, 'RESULT_IMAGE_VERSION_MISMATCH');
      }
      if (image.status !== 'READY') {
        addBlocker(blockers, 'RESULT_IMAGE_NOT_READY');
      }
    }
  }

  const attemptId = selectedAttempt?.attemptId ?? '';
  const technicianConfirmations = confirmationsForType(
    confirmations,
    request,
    attemptId,
    'TECHNICIAN',
    blockers,
  );
  const projectOwnerConfirmations = confirmationsForType(
    confirmations,
    request,
    attemptId,
    'PROJECT_OWNER',
    blockers,
  );

  const technicianConfirmation = technicianConfirmations[0] ?? null;
  const projectOwnerConfirmation = projectOwnerConfirmations[0] ?? null;

  if (!technicianConfirmation) {
    addBlocker(blockers, 'TECHNICIAN_CONFIRMATION_MISSING');
  } else if (technicianConfirmation.decision === 'REJECTED') {
    addBlocker(blockers, 'TECHNICIAN_CONFIRMATION_REJECTED');
  } else if (
    !selectedAttempt
    || technicianConfirmation.profileId !== selectedAttempt.technicianProfileId
  ) {
    addBlocker(blockers, 'TECHNICIAN_CONFIRMATION_PROFILE_MISMATCH');
  }

  if (!projectOwnerConfirmation) {
    addBlocker(blockers, 'PROJECT_OWNER_CONFIRMATION_MISSING');
  } else if (projectOwnerConfirmation.decision === 'REJECTED') {
    addBlocker(blockers, 'PROJECT_OWNER_CONFIRMATION_REJECTED');
  } else if (
    !selectedAttempt
    || projectOwnerConfirmation.profileId !== request.productOwnerProfileId
  ) {
    addBlocker(blockers, 'PROJECT_OWNER_CONFIRMATION_PROFILE_MISMATCH');
  }

  const technicianConfirmed =
    technicianConfirmation?.decision === 'CONFIRMED'
    && selectedAttempt !== null
    && technicianConfirmation.profileId === selectedAttempt.technicianProfileId;
  const projectOwnerConfirmed =
    projectOwnerConfirmation?.decision === 'CONFIRMED'
    && selectedAttempt !== null
    && projectOwnerConfirmation.profileId === request.productOwnerProfileId;

  const workflowStatus: SamplingResultReviewResult['workflowStatus'] =
    blockers.length === 0
      ? 'CLOSED'
      : technicianConfirmed
        ? 'PROJECT_CONFIRMATION'
        : 'RESULT_REVIEW';
  const allowed = blockers.length === 0;

  return {
    allowed,
    workflowStatus,
    decision: selectedAttempt?.resultDecision ?? null,
    selectedAttempt,
    technicianConfirmed,
    projectOwnerConfirmed,
    productionDraftEligible:
      allowed && selectedAttempt?.resultDecision === 'PASS',
    blockers,
  };
}

function safeFilmReadiness(value: unknown): FilmReadiness {
  return typeof value === 'string' && FILM_READINESS_SET.has(value)
    ? value as FilmReadiness
    : 'NOT_ARRIVED';
}

function safeFixtureReadiness(value: unknown): FixtureReadiness {
  return typeof value === 'string' && FIXTURE_READINESS_SET.has(value)
    ? value as FixtureReadiness
    : 'NOT_AVAILABLE';
}

function safeIncomingMaterialReadiness(
  value: unknown,
): IncomingMaterialReadiness {
  return (
    typeof value === 'string'
    && INCOMING_MATERIAL_READINESS_SET.has(value)
  )
    ? value as IncomingMaterialReadiness
    : 'NOT_ARRIVED';
}

function safeSignedSampleReadiness(value: unknown): SignedSampleReadiness {
  return (
    typeof value === 'string'
    && SIGNED_SAMPLE_READINESS_SET.has(value)
  )
    ? value as SignedSampleReadiness
    : 'MISSING';
}

function safeVisualBaseline(
  value: unknown,
): VisualBaselineSummary | null {
  if (!isRecord(value)) return null;
  if (
    !isNonEmptyString(value.versionLabel)
    || typeof value.isCurrent !== 'boolean'
    || !Number.isInteger(value.productImageCount)
    || Number(value.productImageCount) < 0
    || !Number.isInteger(value.filmImageCount)
    || Number(value.filmImageCount) < 0
    || !Number.isInteger(value.customerApprovedSampleCount)
    || Number(value.customerApprovedSampleCount) < 0
    || !Number.isInteger(value.signedSampleCount)
    || Number(value.signedSampleCount) < 0
    || typeof value.workshopConfirmed !== 'boolean'
  ) {
    return null;
  }
  return Object.freeze({
    versionLabel: value.versionLabel,
    isCurrent: value.isCurrent,
    productImageCount: Number(value.productImageCount),
    filmImageCount: Number(value.filmImageCount),
    customerApprovedSampleCount: Number(value.customerApprovedSampleCount),
    signedSampleCount: Number(value.signedSampleCount),
    workshopConfirmed: value.workshopConfirmed,
  });
}

function reviewIsDraftEligible(review: SamplingResultReviewResult): boolean {
  return (
    review.allowed === true
    && review.workflowStatus === 'CLOSED'
    && review.decision === 'PASS'
    && review.technicianConfirmed === true
    && review.projectOwnerConfirmed === true
    && review.productionDraftEligible === true
    && Array.isArray(review.blockers)
    && review.blockers.length === 0
    && review.selectedAttempt?.resultDecision === 'PASS'
  );
}

export function deriveSamplingProductionDraft(
  input: SamplingProductionDraftInput,
): SamplingProductionDraftResult {
  const blockers: SamplingExecutionBlocker[] = [];
  const { review, request } = input;

  if (!isRecord(request) || !isRecord(review)) {
    if (!isRecord(review) || !reviewIsDraftEligible(review)) {
      addBlocker(blockers, 'RESULT_REVIEW_NOT_APPROVED');
    }
    if (!isRecord(request) || !requestIdentityIsValid(request)) {
      addBlocker(blockers, 'INVALID_EXECUTION_INPUT');
    }
    return {
      draft: null,
      blockers,
    };
  }

  if (
    !reviewIsDraftEligible(review)
    || !requestIdentityIsValid(request)
  ) {
    addBlocker(blockers, 'RESULT_REVIEW_NOT_APPROVED');
  }
  if (!isNonEmptyString(request.versionLabel)) {
    addBlocker(blockers, 'REQUEST_VERSION_MISSING');
  }
  if (review.selectedAttempt?.resultDecision !== 'PASS') {
    addBlocker(blockers, 'PASS_DECISION_REQUIRED');
  }
  if (!isNonEmptyString(input.draftId)) {
    addBlocker(blockers, 'DRAFT_ID_MISSING');
  }
  if (!isNonEmptyString(input.orderNumber)) {
    addBlocker(blockers, 'DRAFT_NUMBER_MISSING');
  }
  if (
    review.selectedAttempt
    && !attemptShapeIsValid(review.selectedAttempt)
  ) {
    addBlocker(blockers, 'INVALID_EXECUTION_INPUT');
  }
  if (
    review.selectedAttempt
    && (
      review.selectedAttempt.samplingRequestId !== request.id
      || review.selectedAttempt.organizationId !== request.organizationId
      || review.selectedAttempt.requestVersionLabel !== request.versionLabel
    )
  ) {
    addBlocker(blockers, 'STALE_RESULT');
  }
  if (review.selectedAttempt) {
    for (const image of review.selectedAttempt.resultImages) {
      if (
        image.attemptId !== review.selectedAttempt.attemptId
        || image.organizationId !== request.organizationId
        || image.samplingRequestId !== request.id
      ) {
        addBlocker(blockers, 'ATTEMPT_ID_MISMATCH');
      }
      if (
        !isNonEmptyString(review.selectedAttempt.requestVersionLabel)
        || image.versionLabel !== review.selectedAttempt.requestVersionLabel
      ) {
        addBlocker(blockers, 'RESULT_IMAGE_VERSION_MISMATCH');
      }
      if (image.status !== 'READY') {
        addBlocker(blockers, 'RESULT_IMAGE_NOT_READY');
      }
    }
  }

  if (blockers.length > 0) {
    return {
      draft: null,
      blockers,
    };
  }

  const attempt = review.selectedAttempt as SamplingExecutionAttempt;
  const gateInput = input.productionGate;
  const gate = evaluateProductionStartGate({
    workflowStatus: 'DRAFT',
    orderVersionLabel: request.versionLabel,
    filmReadiness: safeFilmReadiness(gateInput?.filmReadiness),
    fixtureReadiness: safeFixtureReadiness(gateInput?.fixtureReadiness),
    incomingMaterialReadiness: safeIncomingMaterialReadiness(
      gateInput?.incomingMaterialReadiness,
    ),
    signedSampleReadiness: safeSignedSampleReadiness(
      gateInput?.signedSampleReadiness,
    ),
    filmRequired: gateInput?.filmRequired !== false,
    customerSampleRequired: gateInput?.customerSampleRequired !== false,
    // A sampling PASS never waives the production sign-sample boundary.
    signedSampleRequired: true,
    visualBaseline: safeVisualBaseline(gateInput?.visualBaseline),
    technicalConfirmed: gateInput?.technicalConfirmed === true,
    supervisorConfirmed: gateInput?.supervisorConfirmed === true,
    unresolvedBlockerCount:
      typeof gateInput?.unresolvedBlockerCount === 'number'
      && Number.isInteger(gateInput.unresolvedBlockerCount)
      && gateInput.unresolvedBlockerCount >= 0
        ? gateInput.unresolvedBlockerCount
        : 1,
  });

  const parameterVersion = Object.freeze({
    ...attempt.parameterVersion,
  });
  const resultImages = Object.freeze(
    attempt.resultImages.map((image) => Object.freeze({ ...image })),
  );
  const draft: SamplingProductionDraft = Object.freeze({
    id: input.draftId.trim(),
    organizationId: request.organizationId,
    customerId: request.customerId,
    customerNameSnapshot: request.customerNameSnapshot,
    projectId: request.projectId,
    projectNameSnapshot: request.projectNameSnapshot,
    orderNumber: input.orderNumber.trim(),
    productName: request.productName,
    projectOwnerProfileId: request.productOwnerProfileId,
    versionLabel: request.versionLabel,
    workflowStatus: 'DRAFT',
    sourceSamplingRequestId: request.id,
    sourceAttemptId: attempt.attemptId,
    sourceAttemptNumber: attempt.attemptNumber,
    sourceResultDecision: 'PASS',
    productMaterial: request.productMaterial,
    surfaceTreatment: request.surfaceTreatment,
    parameterVersion,
    resultImages,
    bulkRiskNotes: attempt.bulkRiskNotes,
    improvementRecommendation: attempt.improvementRecommendation,
    productionStartGate: gate,
    canStartProduction: false,
  });

  return {
    draft,
    blockers: [],
  };
}
