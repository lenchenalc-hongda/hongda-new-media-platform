import {
  WOS_PRIORITIES,
  evaluateVersionAlignment,
  type WosEntityType,
  type WosPriority,
  type WosProductionOrder,
  type WosSamplingRequest,
} from './domain';
import {
  evaluateProductionStartGate,
  evaluateSamplingStartGate,
  type FilmReadiness,
  type FixtureReadiness,
  type GateBlockingCode,
  type IncomingMaterialReadiness,
  type ProductionWorkflowStatus,
  type SamplingWorkflowStatus,
  type SignedSampleReadiness,
  type VisualBaselineSummary,
} from './spec';

export type WorkshopReadinessBlockerCode =
  | GateBlockingCode
  | 'READINESS_INPUT_INCOMPLETE';

export interface WorkshopReadinessBlocker {
  readonly code: WorkshopReadinessBlockerCode;
  readonly label: string;
  readonly actionLabel: string;
}

export interface WorkshopReadinessFacts {
  filmReadiness: FilmReadiness | null;
  fixtureReadiness: FixtureReadiness | null;
  incomingMaterialReadiness: IncomingMaterialReadiness | null;
  signedSampleReadiness: SignedSampleReadiness | null;
  filmVersionLabel: string | null;
  filmRequired: boolean | null;
  fixtureRequired: boolean | null;
  customerSampleRequired: boolean | null;
  signedSampleRequired: boolean | null;
  visualBaseline: VisualBaselineSummary | null;
  unresolvedBlockerCount: number | null;
}

export interface ProductionWorkshopReadinessInput extends WorkshopReadinessFacts {
  readonly entityType: 'PRODUCTION_ORDER';
  readonly order: WosProductionOrder | null;
  readonly technicalConfirmed: boolean | null;
  readonly supervisorConfirmed: boolean | null;
}

export interface SamplingWorkshopReadinessInput extends WorkshopReadinessFacts {
  readonly entityType: 'SAMPLING_REQUEST';
  readonly request: WosSamplingRequest | null;
  readonly priority: WosPriority | null;
  readonly technicianAccepted: boolean | null;
}

export type WorkshopReadinessInput =
  | ProductionWorkshopReadinessInput
  | SamplingWorkshopReadinessInput;

export interface WorkshopReadinessEvaluation {
  readonly isReady: boolean;
  readonly blockers: readonly WorkshopReadinessBlocker[];
}

interface WorkshopQueueItemBase {
  readonly id: string;
  readonly entityType: WosEntityType;
  readonly typeLabel: string;
  readonly identifier: string;
  readonly customerName: string;
  readonly projectName: string;
  readonly productName: string;
  readonly versionLabel: string;
  readonly status: ProductionWorkflowStatus | SamplingWorkflowStatus;
  readonly statusLabel: string;
  readonly priority: WosPriority | null;
  readonly priorityLabel: string;
  readonly isReady: boolean;
  readonly readinessLabel: string;
  readonly nextActionLabel: string;
  readonly blockers: readonly WorkshopReadinessBlocker[];
}

export interface ProductionWorkshopQueueItem extends WorkshopQueueItemBase {
  readonly entityType: 'PRODUCTION_ORDER';
  readonly status: ProductionWorkflowStatus;
}

export interface SamplingWorkshopQueueItem extends WorkshopQueueItemBase {
  readonly entityType: 'SAMPLING_REQUEST';
  readonly status: SamplingWorkflowStatus;
}

export type WorkshopQueueItem =
  | ProductionWorkshopQueueItem
  | SamplingWorkshopQueueItem;

export interface WorkshopQueueSnapshot {
  readonly productionOrders: readonly ProductionWorkshopQueueItem[];
  readonly samplingRequests: readonly SamplingWorkshopQueueItem[];
}

export const EMPTY_WORKSHOP_QUEUE: WorkshopQueueSnapshot = Object.freeze({
  productionOrders: Object.freeze([]),
  samplingRequests: Object.freeze([]),
});

interface WorkflowPresentation {
  readonly statusLabel: string;
  readonly nextActionLabel: string;
}

const PRODUCTION_WORKFLOW_PRESENTATION: Readonly<
  Record<ProductionWorkflowStatus, WorkflowPresentation>
> = {
  DRAFT: {
    statusLabel: '资料草稿',
    nextActionLabel: '继续补齐资料并按受控流程提交',
  },
  SUBMITTED: {
    statusLabel: '已提交，待车间审阅',
    nextActionLabel: '安排车间审阅并核对齐套资料',
  },
  WORKSHOP_REVIEW: {
    statusLabel: '车间审阅中',
    nextActionLabel: '完成审阅并跟进待核实条件',
  },
  NEEDS_INFORMATION: {
    statusLabel: '资料待补充',
    nextActionLabel: '补齐缺失资料后重新提交',
  },
  WAITING_MATERIAL: {
    statusLabel: '等待物料',
    nextActionLabel: '跟进物料到货并核对实收数量',
  },
  READINESS_CHECK: {
    statusLabel: '齐套检查中',
    nextActionLabel: '逐项核对资源、版本与视觉基准',
  },
  READY_TO_SCHEDULE: {
    statusLabel: '可安排排期',
    nextActionLabel: '进入排期安排并保留齐套证据',
  },
  SCHEDULED: {
    statusLabel: '已排期',
    nextActionLabel: '跟进排期与开工前齐套复核',
  },
  READY_TO_START: {
    statusLabel: '开工前齐套已通过',
    nextActionLabel: '等待受控开工审核',
  },
  IN_PRODUCTION: {
    statusLabel: '生产中',
    nextActionLabel: '跟进生产进度与异常记录',
  },
  PAUSED: {
    statusLabel: '暂停中',
    nextActionLabel: '查明暂停原因并处理阻断项',
  },
  BLOCKED: {
    statusLabel: '已阻断',
    nextActionLabel: '先解除当前阻断并重新核查齐套',
  },
  PRODUCTION_COMPLETED: {
    statusLabel: '生产已完成',
    nextActionLabel: '完成后续验收与出货前核查',
  },
  READY_FOR_SHIPMENT: {
    statusLabel: '待出货',
    nextActionLabel: '完成出货前资料与实物核对',
  },
  CLOSED: {
    statusLabel: '已关闭',
    nextActionLabel: '无需车间处理',
  },
  CANCELLED: {
    statusLabel: '已取消',
    nextActionLabel: '无需车间处理',
  },
};

const SAMPLING_WORKFLOW_PRESENTATION: Readonly<
  Record<SamplingWorkflowStatus, WorkflowPresentation>
> = {
  DRAFT: {
    statusLabel: '申请草稿',
    nextActionLabel: '继续补齐资料并按受控流程提交',
  },
  SUBMITTED: {
    statusLabel: '已提交，待技术审阅',
    nextActionLabel: '安排技术审阅并核对打样条件',
  },
  TECHNICIAN_REVIEW: {
    statusLabel: '技术审阅中',
    nextActionLabel: '确认菲林、夹具、来料与视觉基准',
  },
  NEEDS_INFORMATION: {
    statusLabel: '资料待补充',
    nextActionLabel: '补齐缺失资料后重新提交',
  },
  WAITING_RESOURCE: {
    statusLabel: '等待资源',
    nextActionLabel: '跟进菲林、夹具和来料资源',
  },
  READY_FOR_SAMPLING: {
    statusLabel: '打样前齐套已通过',
    nextActionLabel: '等待受控打样开工审核',
  },
  SAMPLING_IN_PROGRESS: {
    statusLabel: '打样中',
    nextActionLabel: '跟进打样记录与异常处理',
  },
  RESULT_REVIEW: {
    statusLabel: '打样结果待审',
    nextActionLabel: '核对打样结果图与技术记录',
  },
  PROJECT_CONFIRMATION: {
    statusLabel: '待项目确认',
    nextActionLabel: '跟进项目负责人确认结果',
  },
  CLOSED: {
    statusLabel: '已关闭',
    nextActionLabel: '无需技术员处理',
  },
  CANCELLED: {
    statusLabel: '已取消',
    nextActionLabel: '无需技术员处理',
  },
};

const PRIORITY_LABELS: Readonly<Record<WosPriority, string>> = {
  LOW: '低',
  MEDIUM: '普通',
  HIGH: '高',
  CRITICAL: '特急',
};

const BLOCKER_PRESENTATION: Readonly<
  Record<
    WorkshopReadinessBlockerCode,
    Pick<WorkshopReadinessBlocker, 'label' | 'actionLabel'>
  >
> = {
  READINESS_INPUT_INCOMPLETE: {
    label: '齐套输入数据不完整或无效',
    actionLabel: '补齐并核实必填齐套数据后重新检查',
  },
  INVALID_WORKFLOW_STATUS: {
    label: '当前状态不在开工前齐套检查节点',
    actionLabel: '先按受控流程推进到开工前检查节点',
  },
  VISUAL_BASELINE_MISSING: {
    label: '缺少视觉基准',
    actionLabel: '建立并提交当前版本视觉基准',
  },
  VISUAL_BASELINE_NOT_CURRENT: {
    label: '视觉基准已过期',
    actionLabel: '替换为当前版本基准并重新确认',
  },
  VERSION_MISMATCH: {
    label: '基准图片或版本号不一致',
    actionLabel: '统一订单、基准图片与签样版本',
  },
  FILM_NOT_READY: {
    label: '菲林未到齐或不可用',
    actionLabel: '追齐菲林并登记到货状态',
  },
  FILM_VERSION_UNVERIFIED: {
    label: '菲林版本未核实',
    actionLabel: '核对菲林版本与当前订单或打样版本',
  },
  FIXTURE_NOT_READY: {
    label: '治具未完成适配确认',
    actionLabel: '完成治具制作、试装与适配确认',
  },
  INCOMING_MATERIAL_NOT_READY: {
    label: '来料数量未核实',
    actionLabel: '清点来料并登记实收数量',
  },
  SIGNED_SAMPLE_MISSING: {
    label: '必需签样缺失或未核实',
    actionLabel: '补齐并核验客户签样',
  },
  PRODUCT_IMAGE_MISSING: {
    label: '缺少产品基准图',
    actionLabel: '补充当前版本产品基准图',
  },
  FILM_IMAGE_MISSING: {
    label: '缺少菲林基准图',
    actionLabel: '补充当前版本菲林基准图',
  },
  CUSTOMER_SAMPLE_MISSING: {
    label: '缺少客户确认样图',
    actionLabel: '补充客户确认样图',
  },
  WORKSHOP_VISUAL_CONFIRMATION_MISSING: {
    label: '车间尚未确认视觉基准',
    actionLabel: '请车间核对并记录视觉确认',
  },
  TECHNICAL_CONFIRMATION_MISSING: {
    label: '技术确认未完成',
    actionLabel: '完成技术核对并记录确认结果',
  },
  SUPERVISOR_CONFIRMATION_MISSING: {
    label: '主管确认未完成',
    actionLabel: '完成主管核对并记录确认结果',
  },
  TECHNICIAN_ACCEPTANCE_MISSING: {
    label: '技术员尚未受理打样',
    actionLabel: '完成技术员受理与条件核对',
  },
  RESULT_IMAGE_MISSING: {
    label: '缺少打样结果图',
    actionLabel: '补齐打样结果图后再核查',
  },
  RESULT_DECISION_MISSING: {
    label: '打样结果结论缺失',
    actionLabel: '记录打样结果结论后再核查',
  },
  PROJECT_CONFIRMATION_MISSING: {
    label: '项目确认未完成',
    actionLabel: '完成项目负责人确认后再核查',
  },
  OPEN_BLOCKER: {
    label: '仍有未关闭阻断项',
    actionLabel: '逐项关闭未解决阻断并重新核查',
  },
};

const BLOCKER_ORDER: readonly WorkshopReadinessBlockerCode[] = [
  'READINESS_INPUT_INCOMPLETE',
  'INVALID_WORKFLOW_STATUS',
  'VISUAL_BASELINE_MISSING',
  'VISUAL_BASELINE_NOT_CURRENT',
  'VERSION_MISMATCH',
  'FILM_NOT_READY',
  'FILM_VERSION_UNVERIFIED',
  'FIXTURE_NOT_READY',
  'INCOMING_MATERIAL_NOT_READY',
  'SIGNED_SAMPLE_MISSING',
  'PRODUCT_IMAGE_MISSING',
  'FILM_IMAGE_MISSING',
  'CUSTOMER_SAMPLE_MISSING',
  'WORKSHOP_VISUAL_CONFIRMATION_MISSING',
  'TECHNICAL_CONFIRMATION_MISSING',
  'SUPERVISOR_CONFIRMATION_MISSING',
  'TECHNICIAN_ACCEPTANCE_MISSING',
  'RESULT_IMAGE_MISSING',
  'RESULT_DECISION_MISSING',
  'PROJECT_CONFIRMATION_MISSING',
  'OPEN_BLOCKER',
];

const BLOCKER_ORDER_INDEX = new Map(
  BLOCKER_ORDER.map((code, index) => [code, index] as const),
);

const PRIORITIES = new Set<string>(WOS_PRIORITIES);
const FILM_READINESS_VALUES = new Set<string>([
  'NOT_REQUIRED',
  'NOT_ARRIVED',
  'PARTIALLY_ARRIVED',
  'ARRIVED',
  'VERSION_VERIFIED',
]);
const FIXTURE_READINESS_VALUES = new Set<string>([
  'NOT_REQUIRED',
  'NOT_AVAILABLE',
  'IN_PRODUCTION',
  'ARRIVED',
  'FIT_VERIFIED',
]);
const INCOMING_MATERIAL_READINESS_VALUES = new Set<string>([
  'NOT_ARRIVED',
  'PARTIALLY_ARRIVED',
  'ARRIVED',
  'QUANTITY_VERIFIED',
]);
const SIGNED_SAMPLE_READINESS_VALUES = new Set<string>([
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

function isPriority(value: unknown): value is WosPriority {
  return typeof value === 'string' && PRIORITIES.has(value);
}

function isFilmReadiness(value: unknown): value is FilmReadiness {
  return typeof value === 'string' && FILM_READINESS_VALUES.has(value);
}

function isFixtureReadiness(value: unknown): value is FixtureReadiness {
  return typeof value === 'string' && FIXTURE_READINESS_VALUES.has(value);
}

function isIncomingMaterialReadiness(
  value: unknown,
): value is IncomingMaterialReadiness {
  return (
    typeof value === 'string'
    && INCOMING_MATERIAL_READINESS_VALUES.has(value)
  );
}

function isSignedSampleReadiness(
  value: unknown,
): value is SignedSampleReadiness {
  return (
    typeof value === 'string'
    && SIGNED_SAMPLE_READINESS_VALUES.has(value)
  );
}

function isVisualBaselineSummary(
  value: unknown,
): value is VisualBaselineSummary {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.versionLabel)
    && typeof value.isCurrent === 'boolean'
    && Number.isInteger(value.productImageCount)
    && Number(value.productImageCount) >= 0
    && Number.isInteger(value.filmImageCount)
    && Number(value.filmImageCount) >= 0
    && Number.isInteger(value.customerApprovedSampleCount)
    && Number(value.customerApprovedSampleCount) >= 0
    && Number.isInteger(value.signedSampleCount)
    && Number(value.signedSampleCount) >= 0
    && typeof value.workshopConfirmed === 'boolean'
  );
}

function isKnownProductionStatus(
  value: unknown,
): value is ProductionWorkflowStatus {
  return (
    typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(
      PRODUCTION_WORKFLOW_PRESENTATION,
      value,
    )
  );
}

function isKnownSamplingStatus(
  value: unknown,
): value is SamplingWorkflowStatus {
  return (
    typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(
      SAMPLING_WORKFLOW_PRESENTATION,
      value,
    )
  );
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeBaseline(value: unknown): {
  baseline: VisualBaselineSummary | null;
  malformed: boolean;
} {
  if (value === null) return { baseline: null, malformed: false };
  if (!isVisualBaselineSummary(value)) {
    return { baseline: null, malformed: true };
  }
  return { baseline: value, malformed: false };
}

function safeUnresolvedBlockerCount(value: unknown): number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 0
    ? value
    : 1;
}

function safeFilmReadiness(
  value: unknown,
  required: boolean,
): FilmReadiness {
  if (!required) return 'NOT_REQUIRED';
  return isFilmReadiness(value) ? value : 'NOT_ARRIVED';
}

function safeFixtureReadiness(
  value: unknown,
  required: boolean,
): FixtureReadiness {
  if (!required) return 'NOT_REQUIRED';
  return isFixtureReadiness(value) ? value : 'NOT_AVAILABLE';
}

function safeIncomingMaterialReadiness(
  value: unknown,
): IncomingMaterialReadiness {
  return isIncomingMaterialReadiness(value) ? value : 'NOT_ARRIVED';
}

function safeSignedSampleReadiness(
  value: unknown,
  required: boolean,
): SignedSampleReadiness {
  if (!required) return 'NOT_REQUIRED';
  return isSignedSampleReadiness(value) ? value : 'MISSING';
}

function alignmentBlockerCode(
  code: ReturnType<typeof evaluateVersionAlignment>['blockingCodes'][number],
): WorkshopReadinessBlockerCode {
  switch (code) {
    case 'BASELINE_MISSING':
      return 'VISUAL_BASELINE_MISSING';
    case 'BASELINE_NOT_CURRENT':
      return 'VISUAL_BASELINE_NOT_CURRENT';
    case 'BASELINE_VERSION_MISMATCH':
      return 'VERSION_MISMATCH';
    case 'FILM_VERSION_MISSING':
    case 'FILM_VERSION_MISMATCH':
      return 'FILM_VERSION_UNVERIFIED';
  }
}

function orderedBlockers(
  codes: readonly WorkshopReadinessBlockerCode[],
): readonly WorkshopReadinessBlocker[] {
  return [...new Set(codes)]
    .sort(
      (left, right) =>
        (BLOCKER_ORDER_INDEX.get(left) ?? Number.MAX_SAFE_INTEGER)
        - (BLOCKER_ORDER_INDEX.get(right) ?? Number.MAX_SAFE_INTEGER),
    )
    .map((code) => ({
      code,
      ...BLOCKER_PRESENTATION[code],
    }));
}

function commonInputIsComplete(
  input: WorkshopReadinessInput,
  baselineMalformed: boolean,
): boolean {
  const filmRequired = input.filmRequired !== false;
  const fixtureRequired = input.fixtureRequired !== false;
  const signedSampleRequired = input.signedSampleRequired !== false;

  return (
    typeof input.filmRequired === 'boolean'
    && typeof input.fixtureRequired === 'boolean'
    && typeof input.customerSampleRequired === 'boolean'
    && typeof input.signedSampleRequired === 'boolean'
    && isIncomingMaterialReadiness(input.incomingMaterialReadiness)
    && (!filmRequired || isFilmReadiness(input.filmReadiness))
    && (!filmRequired || isNonEmptyString(input.filmVersionLabel))
    && (!fixtureRequired || isFixtureReadiness(input.fixtureReadiness))
    && (
      !signedSampleRequired
      || isSignedSampleReadiness(input.signedSampleReadiness)
    )
    && !baselineMalformed
    && typeof input.unresolvedBlockerCount === 'number'
    && Number.isInteger(input.unresolvedBlockerCount)
    && input.unresolvedBlockerCount >= 0
  );
}

function productionEntityIsComplete(order: WosProductionOrder | null): boolean {
  return (
    order !== null
    && isNonEmptyString(order.id)
    && isNonEmptyString(order.organizationId)
    && isNonEmptyString(order.customerNameSnapshot)
    && isNonEmptyString(order.orderNumber)
    && isNonEmptyString(order.productName)
    && isNonEmptyString(order.versionLabel)
    && isPriority(order.priority)
    && typeof order.isUrgent === 'boolean'
    && isKnownProductionStatus(order.workflowStatus)
  );
}

function samplingEntityIsComplete(
  request: WosSamplingRequest | null,
  priority: WosPriority | null,
): boolean {
  return (
    request !== null
    && isNonEmptyString(request.id)
    && isNonEmptyString(request.organizationId)
    && isNonEmptyString(request.customerNameSnapshot)
    && isNonEmptyString(request.productName)
    && isNonEmptyString(request.versionLabel)
    && isKnownSamplingStatus(request.workflowStatus)
    && isPriority(priority)
  );
}

export function evaluateWorkshopReadiness(
  input: WorkshopReadinessInput,
): WorkshopReadinessEvaluation {
  const { baseline, malformed: baselineMalformed } = safeBaseline(
    input.visualBaseline,
  );
  const filmRequired = input.filmRequired !== false;
  const fixtureRequired = input.fixtureRequired !== false;
  const customerSampleRequired = input.customerSampleRequired !== false;
  const signedSampleRequired = input.signedSampleRequired !== false;
  const unresolvedBlockerCount = safeUnresolvedBlockerCount(
    input.unresolvedBlockerCount,
  );
  const filmReadiness = safeFilmReadiness(
    input.filmReadiness,
    filmRequired,
  );
  const fixtureReadiness = safeFixtureReadiness(
    input.fixtureReadiness,
    fixtureRequired,
  );
  const incomingMaterialReadiness = safeIncomingMaterialReadiness(
    input.incomingMaterialReadiness,
  );
  const signedSampleReadiness = safeSignedSampleReadiness(
    input.signedSampleReadiness,
    signedSampleRequired,
  );
  const filmVersionLabel = safeText(input.filmVersionLabel) || null;
  const codes: WorkshopReadinessBlockerCode[] = [];

  const commonComplete = commonInputIsComplete(input, baselineMalformed);

  if (input.entityType === 'PRODUCTION_ORDER') {
    const order = input.order;
    const workflowStatus = isKnownProductionStatus(order?.workflowStatus)
      ? order.workflowStatus
      : 'DRAFT';
    const orderVersionLabel = safeText(order?.versionLabel);
    const gate = evaluateProductionStartGate({
      workflowStatus,
      orderVersionLabel,
      filmReadiness,
      fixtureReadiness,
      incomingMaterialReadiness,
      signedSampleReadiness,
      filmRequired,
      customerSampleRequired,
      signedSampleRequired,
      visualBaseline: baseline,
      technicalConfirmed: input.technicalConfirmed === true,
      supervisorConfirmed: input.supervisorConfirmed === true,
      unresolvedBlockerCount,
    });

    codes.push(...gate.blockingCodes);

    if (
      !commonComplete
      || !productionEntityIsComplete(order)
      || typeof input.technicalConfirmed !== 'boolean'
      || typeof input.supervisorConfirmed !== 'boolean'
    ) {
      codes.push('READINESS_INPUT_INCOMPLETE');
    }

    const alignment = evaluateVersionAlignment({
      entityVersionLabel: orderVersionLabel,
      baselineVersionLabel: baseline?.versionLabel ?? null,
      filmVersionLabel,
      filmRequired,
      baselineIsCurrent: baseline?.isCurrent === true,
    });
    codes.push(...alignment.blockingCodes.map(alignmentBlockerCode));
  } else {
    const request = input.request;
    const workflowStatus = isKnownSamplingStatus(request?.workflowStatus)
      ? request.workflowStatus
      : 'DRAFT';
    const requestVersionLabel = safeText(request?.versionLabel);
    const gate = evaluateSamplingStartGate({
      workflowStatus,
      requestVersionLabel,
      filmReadiness,
      fixtureReadiness,
      incomingMaterialReadiness,
      filmRequired,
      customerSampleRequired,
      visualBaseline: baseline,
      technicianAccepted: input.technicianAccepted === true,
      unresolvedBlockerCount,
    });

    codes.push(...gate.blockingCodes);

    if (
      !commonComplete
      || !samplingEntityIsComplete(request, input.priority)
      || typeof input.technicianAccepted !== 'boolean'
    ) {
      codes.push('READINESS_INPUT_INCOMPLETE');
    }

    if (
      signedSampleRequired
      && (
        signedSampleReadiness !== 'VERIFIED'
        || !baseline
        || baseline.signedSampleCount < 1
      )
    ) {
      codes.push('SIGNED_SAMPLE_MISSING');
    }

    const alignment = evaluateVersionAlignment({
      entityVersionLabel: requestVersionLabel,
      baselineVersionLabel: baseline?.versionLabel ?? null,
      filmVersionLabel,
      filmRequired,
      baselineIsCurrent: baseline?.isCurrent === true,
    });
    codes.push(...alignment.blockingCodes.map(alignmentBlockerCode));
  }

  const blockers = orderedBlockers(codes);
  return {
    isReady: blockers.length === 0,
    blockers,
  };
}

function priorityRank(priority: WosPriority | null): number {
  switch (priority) {
    case 'CRITICAL':
      return 0;
    case 'HIGH':
      return 1;
    case 'MEDIUM':
      return 2;
    case 'LOW':
      return 3;
    default:
      return 4;
  }
}

function compareQueueItems(
  left: WorkshopQueueItem,
  right: WorkshopQueueItem,
): number {
  const priorityDifference =
    priorityRank(left.priority) - priorityRank(right.priority);
  return priorityDifference || left.id.localeCompare(right.id);
}

function productionQueueItem(
  input: ProductionWorkshopReadinessInput,
): ProductionWorkshopQueueItem {
  const order = input.order;
  const status = isKnownProductionStatus(order?.workflowStatus)
    ? order.workflowStatus
    : 'DRAFT';
  const presentation = PRODUCTION_WORKFLOW_PRESENTATION[status];
  const readiness = evaluateWorkshopReadiness(input);
  const priority = order?.isUrgent
    ? 'CRITICAL'
    : isPriority(order?.priority)
      ? order.priority
      : null;

  return {
    id: safeText(order?.id),
    entityType: 'PRODUCTION_ORDER',
    typeLabel: '生产单',
    identifier: safeText(order?.orderNumber) || '未提供编号',
    customerName: safeText(order?.customerNameSnapshot) || '未提供客户',
    projectName: safeText(order?.projectNameSnapshot) || '未关联项目',
    productName: safeText(order?.productName) || '未提供产品',
    versionLabel: safeText(order?.versionLabel) || '未提供版本',
    status,
    statusLabel:
      isKnownProductionStatus(order?.workflowStatus)
        ? presentation.statusLabel
        : '状态待核实',
    priority,
    priorityLabel: priority ? PRIORITY_LABELS[priority] : '未设优先级',
    isReady: readiness.isReady,
    readinessLabel: readiness.isReady
      ? '齐套检查通过，可进入下一受控环节'
      : '资料未齐套，暂不可开工',
    nextActionLabel:
      readiness.blockers[0]?.actionLabel ?? presentation.nextActionLabel,
    blockers: readiness.blockers,
  };
}

function samplingQueueItem(
  input: SamplingWorkshopReadinessInput,
): SamplingWorkshopQueueItem {
  const request = input.request;
  const status = isKnownSamplingStatus(request?.workflowStatus)
    ? request.workflowStatus
    : 'DRAFT';
  const presentation = SAMPLING_WORKFLOW_PRESENTATION[status];
  const readiness = evaluateWorkshopReadiness(input);
  const priority = isPriority(input.priority) ? input.priority : null;

  return {
    id: safeText(request?.id),
    entityType: 'SAMPLING_REQUEST',
    typeLabel: '打样申请',
    identifier: safeText(request?.id) || '未提供编号',
    customerName: safeText(request?.customerNameSnapshot) || '未提供客户',
    projectName: safeText(request?.projectNameSnapshot) || '未关联项目',
    productName: safeText(request?.productName) || '未提供产品',
    versionLabel: safeText(request?.versionLabel) || '未提供版本',
    status,
    statusLabel:
      isKnownSamplingStatus(request?.workflowStatus)
        ? presentation.statusLabel
        : '状态待核实',
    priority,
    priorityLabel: priority ? PRIORITY_LABELS[priority] : '未设优先级',
    isReady: readiness.isReady,
    readinessLabel: readiness.isReady
      ? '齐套检查通过，可进入下一受控环节'
      : '资料未齐套，暂不可开工',
    nextActionLabel:
      readiness.blockers[0]?.actionLabel ?? presentation.nextActionLabel,
    blockers: readiness.blockers,
  };
}

export function buildWorkshopQueueItem(
  input: WorkshopReadinessInput,
): WorkshopQueueItem {
  return input.entityType === 'PRODUCTION_ORDER'
    ? productionQueueItem(input)
    : samplingQueueItem(input);
}

export function buildWorkshopQueue(
  inputs: readonly WorkshopReadinessInput[],
): WorkshopQueueSnapshot {
  const productionOrders: ProductionWorkshopQueueItem[] = [];
  const samplingRequests: SamplingWorkshopQueueItem[] = [];

  for (const input of inputs) {
    if (input.entityType === 'PRODUCTION_ORDER') {
      productionOrders.push(productionQueueItem(input));
    } else if (input.entityType === 'SAMPLING_REQUEST') {
      samplingRequests.push(samplingQueueItem(input));
    }
  }

  productionOrders.sort(compareQueueItems);
  samplingRequests.sort(compareQueueItems);

  return {
    productionOrders,
    samplingRequests,
  };
}
