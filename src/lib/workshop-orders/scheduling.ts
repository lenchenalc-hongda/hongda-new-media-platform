import {
  WOS_PRIORITIES,
  type WosEntityType,
  type WosPriority,
} from './domain';
import {
  productionOrderFixture,
  samplingRequestFixture,
} from './fixtures';
import {
  evaluateWorkshopReadiness,
  type ProductionWorkshopReadinessInput,
  type SamplingWorkshopReadinessInput,
  type WorkshopReadinessBlockerCode,
  type WorkshopReadinessEvaluation,
  type WorkshopReadinessFacts,
  type WorkshopReadinessInput,
} from './readiness';
import type { VisualBaselineSummary } from './spec';

export const SCHEDULING_TASK_TYPES = ['PRODUCTION', 'SAMPLING'] as const;
export type SchedulingTaskType = (typeof SCHEDULING_TASK_TYPES)[number];

export interface WorkingDayWindow {
  readonly id: string;
  readonly startAt: string;
  readonly endAt: string;
}

export interface SchedulingTimeRange {
  readonly startAt: string;
  readonly endAt: string;
}

export interface MachineSlot {
  readonly id: string;
  readonly machineId: string;
  readonly machineLabel: string;
  readonly workingWindowId: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly taskTypes: readonly SchedulingTaskType[];
}

export interface TechnicianAvailability {
  readonly technicianProfileId: string;
  readonly availableRanges: readonly SchedulingTimeRange[];
}

export interface CapacityEstimate {
  readonly estimateId: string;
  readonly estimatedQuantity: number;
  readonly durationMinutes: number;
  readonly estimatedByTechnicianProfileId: string;
}

export interface SchedulingFacts {
  readonly taskType: SchedulingTaskType;
  readonly entityType: WosEntityType;
  readonly entityId: string;
  readonly identifier: string;
  readonly versionLabel: string;
  readonly priority: WosPriority;
  readonly machineSlotId: string;
  readonly technicianProfileId: string;
  readonly scheduledStart: string;
  readonly scheduledEnd: string;
  readonly dueDate: string;
  readonly quantity: number;
  readonly capacityEstimate: CapacityEstimate | null;
}

export interface ScheduleCandidate extends SchedulingFacts {
  readonly id: string;
  readonly readiness: WorkshopReadinessInput | null;
}

export interface ExistingBooking extends SchedulingFacts {
  readonly bookingId: string;
  readonly version: number;
}

export interface SchedulingContext {
  readonly workingDayWindows: readonly WorkingDayWindow[];
  readonly machineSlots: readonly MachineSlot[];
  readonly technicianAvailability: readonly TechnicianAvailability[];
  readonly existingBookings: readonly ExistingBooking[];
}

export type SchedulingBlockerCode =
  | 'INVALID_SCHEDULE_INPUT'
  | 'INVALID_TASK_ENTITY'
  | 'INVALID_PRIORITY'
  | 'INVALID_QUANTITY'
  | 'DUE_DATE_MISSING'
  | 'INVALID_DUE_DATE'
  | 'INVALID_TIME_RANGE'
  | 'MACHINE_SLOT_MISSING'
  | 'MACHINE_TASK_UNSUPPORTED'
  | 'WORKING_WINDOW_MISSING'
  | 'OUTSIDE_WORKING_WINDOW'
  | 'OUTSIDE_MACHINE_SLOT'
  | 'TECHNICIAN_AVAILABILITY_MISSING'
  | 'TECHNICIAN_UNAVAILABLE'
  | 'CAPACITY_ESTIMATE_MISSING'
  | 'CAPACITY_ESTIMATE_INVALID'
  | 'CAPACITY_ESTIMATE_TECHNICIAN_MISMATCH'
  | 'CAPACITY_ESTIMATE_INSUFFICIENT'
  | 'DURATION_ESTIMATE_MISMATCH'
  | 'MACHINE_TIME_CONFLICT'
  | 'TECHNICIAN_TIME_CONFLICT'
  | 'SCHEDULING_CONTEXT_INVALID'
  | WorkshopReadinessBlockerCode;

export type SchedulingWarningCode = 'LATE_AFTER_DUE_DATE';

export interface SchedulingBlocker {
  readonly code: SchedulingBlockerCode;
  readonly label: string;
  readonly actionLabel: string;
  readonly relatedBookingId?: string;
}

export interface SchedulingWarning {
  readonly code: SchedulingWarningCode;
  readonly label: string;
  readonly actionLabel: string;
}

export interface ScheduleEvaluation {
  readonly isSchedulable: boolean;
  readonly blockers: readonly SchedulingBlocker[];
  readonly warnings: readonly SchedulingWarning[];
  readonly readiness: WorkshopReadinessEvaluation | null;
}

export type RescheduleProposalError =
  | 'PROPOSAL_ID_MISSING'
  | 'RESCHEDULE_OWNER_INVALID'
  | 'PROPOSAL_REASON_MISSING'
  | 'RESCHEDULE_TIME_INVALID'
  | 'RESCHEDULE_TIME_UNCHANGED'
  | 'RESCHEDULE_BASE_MISSING'
  | 'RESCHEDULE_BASE_DUPLICATE'
  | 'RESCHEDULE_BASE_STALE';

export interface RescheduleRequest {
  readonly proposalId: string;
  readonly reason: string;
  readonly proposedByProfileId: string;
  readonly proposedByRole: 'WORKSHOP_SUPERVISOR';
  readonly scheduledStart: string;
  readonly scheduledEnd: string;
  readonly readiness: WorkshopReadinessInput | null;
}

export interface ScheduleRescheduleProposal {
  readonly status: 'PROPOSED' | 'BLOCKED';
  readonly proposalId: string;
  readonly bookingId: string;
  readonly version: number;
  readonly basedOnVersion: number;
  readonly reason: string;
  readonly proposedByProfileId: string;
  readonly proposedByRole: 'WORKSHOP_SUPERVISOR';
  readonly candidate: ScheduleCandidate;
}

export interface RescheduleProposalResult {
  readonly proposal: ScheduleRescheduleProposal | null;
  readonly evaluation: ScheduleEvaluation | null;
  readonly errors: readonly RescheduleProposalError[];
}

export interface SchedulingPreviewBlocker {
  readonly code: SchedulingBlockerCode;
  readonly label: string;
  readonly actionLabel: string;
  readonly relatedBookingId: string | null;
}

export interface SchedulingPreviewWarning {
  readonly code: SchedulingWarningCode;
  readonly label: string;
  readonly actionLabel: string;
}

export interface SchedulingPreviewItem {
  readonly id: string;
  readonly entityType: WosEntityType;
  readonly taskLabel: string;
  readonly identifier: string;
  readonly versionLabel: string;
  readonly priority: WosPriority;
  readonly priorityLabel: string;
  readonly machineLabel: string;
  readonly scheduledWindowLabel: string;
  readonly dueDateLabel: string;
  readonly durationLabel: string;
  readonly capacityLabel: string;
  readonly readinessLabel: string;
  readonly scheduleStatusLabel: string;
  readonly nextActionLabel: string;
  readonly ownershipLabel: string;
  readonly isSchedulable: boolean;
  readonly isLate: boolean;
  readonly blockers: readonly SchedulingPreviewBlocker[];
  readonly warnings: readonly SchedulingPreviewWarning[];
}

export interface SchedulingPreviewSnapshot {
  readonly production: readonly SchedulingPreviewItem[];
  readonly sampling: readonly SchedulingPreviewItem[];
}

export const EMPTY_SCHEDULING_PREVIEW: SchedulingPreviewSnapshot = Object.freeze({
  production: Object.freeze([]),
  sampling: Object.freeze([]),
});

const SCHEDULING_BLOCKER_COPY: Readonly<
  Record<
    Exclude<SchedulingBlockerCode, WorkshopReadinessBlockerCode>,
    Pick<SchedulingBlocker, 'label' | 'actionLabel'>
  >
> = {
  INVALID_SCHEDULE_INPUT: {
    label: '排期输入不完整或无效',
    actionLabel: '补齐排期编号、版本、机器与时间资料后重新检查',
  },
  INVALID_TASK_ENTITY: {
    label: '任务类型与生产单或打样申请不一致',
    actionLabel: '确认这是独立生产单或打样申请，并修正任务类型',
  },
  INVALID_PRIORITY: {
    label: '订单优先级缺失或无效',
    actionLabel: '由项目负责人确认优先级后重新提交排期',
  },
  INVALID_QUANTITY: {
    label: '排期数量不完整或无效',
    actionLabel: '填写需要安排的正整数数量',
  },
  DUE_DATE_MISSING: {
    label: '缺少订单交期',
    actionLabel: '由项目负责人确认交期后再排期',
  },
  INVALID_DUE_DATE: {
    label: '订单交期格式或日期无效',
    actionLabel: '修正交期日期后再检查',
  },
  INVALID_TIME_RANGE: {
    label: '排期开始或结束时间无效',
    actionLabel: '改为有效且结束晚于开始的时间',
  },
  MACHINE_SLOT_MISSING: {
    label: '找不到指定机台时段',
    actionLabel: '选择已发布的有效机台时段',
  },
  MACHINE_TASK_UNSUPPORTED: {
    label: '该机台不支持此任务类型',
    actionLabel: '改选支持生产或打样的机台',
  },
  WORKING_WINDOW_MISSING: {
    label: '机台时段缺少有效工作日窗口',
    actionLabel: '补齐工作日历后重新检查',
  },
  OUTSIDE_WORKING_WINDOW: {
    label: '排期超出工作日窗口',
    actionLabel: '把整段排期移入有效工作时间内',
  },
  OUTSIDE_MACHINE_SLOT: {
    label: '排期超出所选机台时段',
    actionLabel: '改选完整覆盖本次任务的机台时段',
  },
  TECHNICIAN_AVAILABILITY_MISSING: {
    label: '缺少技术员可用信息',
    actionLabel: '登记技术员可用工作日后再排期',
  },
  TECHNICIAN_UNAVAILABLE: {
    label: '技术员在所选工作日不可用',
    actionLabel: '改选有技术员覆盖的时段',
  },
  CAPACITY_ESTIMATE_MISSING: {
    label: '缺少产能与工时估算',
    actionLabel: '请技术员补充本次产能和时长估算',
  },
  CAPACITY_ESTIMATE_INVALID: {
    label: '产能与工时估算无效',
    actionLabel: '请技术员重新确认正整数产能与估时',
  },
  CAPACITY_ESTIMATE_TECHNICIAN_MISMATCH: {
    label: '产能估算人和排期技术员不一致',
    actionLabel: '请当前执行技术员重新确认产能和工时估算',
  },
  CAPACITY_ESTIMATE_INSUFFICIENT: {
    label: '估时产能不足以覆盖排期数量',
    actionLabel: '拆分批次或请技术员更新产能估算',
  },
  DURATION_ESTIMATE_MISMATCH: {
    label: '排期时长与技术员估时不一致',
    actionLabel: '统一排期时长和经确认的技术员估时',
  },
  MACHINE_TIME_CONFLICT: {
    label: '机台时间已被占用',
    actionLabel: '改选空余机台时段；优先级不能覆盖既有占用',
  },
  TECHNICIAN_TIME_CONFLICT: {
    label: '技术员已有重叠任务',
    actionLabel: '改选技术员空余时段或调整执行人',
  },
  SCHEDULING_CONTEXT_INVALID: {
    label: '排期日历或既有占用数据不完整',
    actionLabel: '先修复工作日历、机台或占用记录数据',
  },
};

const READINESS_INPUT_INCOMPLETE_COPY: Pick<
  SchedulingBlocker,
  'label' | 'actionLabel'
> = {
  label: 'Phase 3 齐套输入不完整或无效',
  actionLabel: '先完成并核实齐套检查输入，再进入排期',
};

const LATE_WARNING: SchedulingWarning = {
  code: 'LATE_AFTER_DUE_DATE',
  label: '预计完成日晚于订单交期',
  actionLabel: '提交主管复核交期风险，不得用高优先级绕过占用',
};

const PRIORITY_LABELS: Readonly<Record<WosPriority, string>> = {
  LOW: '低',
  MEDIUM: '普通',
  HIGH: '高',
  CRITICAL: '特急',
};

const PRIORITIES = new Set<string>(WOS_PRIORITIES);
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isTaskType(value: unknown): value is SchedulingTaskType {
  return value === 'PRODUCTION' || value === 'SAMPLING';
}

function isEntityType(value: unknown): value is WosEntityType {
  return value === 'PRODUCTION_ORDER' || value === 'SAMPLING_REQUEST';
}

function isPriority(value: unknown): value is WosPriority {
  return typeof value === 'string' && PRIORITIES.has(value);
}

function calendarDateIsValid(
  year: number,
  month: number,
  day: number,
): boolean {
  const value = new Date(Date.UTC(year, month - 1, day));
  return (
    value.getUTCFullYear() === year
    && value.getUTCMonth() === month - 1
    && value.getUTCDate() === day
  );
}

function parseLocalDateTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (
    !calendarDateIsValid(year, month, day)
    || hour > 23
    || minute > 59
  ) {
    return null;
  }

  return Date.UTC(year, month - 1, day, hour, minute);
}

function isValidDueDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;
  return calendarDateIsValid(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  );
}

function addBlocker(
  blockers: SchedulingBlocker[],
  code: SchedulingBlockerCode,
  relatedBookingId?: string,
): void {
  if (blockers.some((blocker) => (
    blocker.code === code
    && blocker.relatedBookingId === relatedBookingId
  ))) {
    return;
  }

  if (code === 'READINESS_INPUT_INCOMPLETE') {
    blockers.push({
      code,
      ...READINESS_INPUT_INCOMPLETE_COPY,
    });
    return;
  }

  const copy = SCHEDULING_BLOCKER_COPY[
    code as Exclude<SchedulingBlockerCode, WorkshopReadinessBlockerCode>
  ];
  if (copy) {
    blockers.push({
      code,
      ...copy,
      ...(relatedBookingId ? { relatedBookingId } : {}),
    });
  }
}

function addReadinessBlockers(
  blockers: SchedulingBlocker[],
  readiness: WorkshopReadinessEvaluation,
): void {
  for (const blocker of readiness.blockers) {
    if (blockers.some((existing) => existing.code === blocker.code)) continue;
    blockers.push({
      code: blocker.code,
      label: blocker.label,
      actionLabel: blocker.actionLabel,
    });
  }
}

function hasTaskEntityMismatch(candidate: ScheduleCandidate): boolean {
  if (candidate.taskType === 'PRODUCTION') {
    return candidate.entityType !== 'PRODUCTION_ORDER';
  }
  return candidate.entityType !== 'SAMPLING_REQUEST';
}

function readinessMatchesCandidate(candidate: ScheduleCandidate): boolean {
  const readiness = candidate.readiness;
  if (!isRecord(readiness) || readiness.entityType !== candidate.entityType) {
    return false;
  }

  if (candidate.entityType === 'PRODUCTION_ORDER') {
    const order = readiness.order;
    return isRecord(order)
      && order.id === candidate.entityId
      && isNonEmptyString(order.versionLabel)
      && order.versionLabel === candidate.versionLabel;
  }

  const request = readiness.request;
  return isRecord(request)
    && request.id === candidate.entityId
    && isNonEmptyString(request.versionLabel)
    && request.versionLabel === candidate.versionLabel;
}

function safeReadinessEvaluation(
  candidate: ScheduleCandidate,
): WorkshopReadinessEvaluation | null {
  if (!candidate.readiness || !readinessMatchesCandidate(candidate)) {
    return null;
  }

  try {
    return evaluateWorkshopReadiness(candidate.readiness);
  } catch {
    return null;
  }
}

function isCapacityEstimate(value: unknown): value is CapacityEstimate {
  return (
    isRecord(value)
    && isNonEmptyString(value.estimateId)
    && isPositiveInteger(value.estimatedQuantity)
    && isPositiveInteger(value.durationMinutes)
    && isNonEmptyString(value.estimatedByTechnicianProfileId)
  );
}

function isWorkingDayWindow(value: unknown): value is WorkingDayWindow {
  if (
    !isRecord(value)
    || !isNonEmptyString(value.id)
    || !isNonEmptyString(value.startAt)
    || !isNonEmptyString(value.endAt)
  ) {
    return false;
  }

  const start = parseLocalDateTime(value.startAt);
  const end = parseLocalDateTime(value.endAt);
  return start !== null && end !== null && start < end;
}

function isMachineSlot(value: unknown): value is MachineSlot {
  return (
    isRecord(value)
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.machineId)
    && isNonEmptyString(value.machineLabel)
    && isNonEmptyString(value.workingWindowId)
    && isSchedulingTimeRange(value)
    && Array.isArray(value.taskTypes)
    && value.taskTypes.every(isTaskType)
  );
}

function isSchedulingTimeRange(
  value: unknown,
): value is SchedulingTimeRange {
  if (
    !isRecord(value)
    || !isNonEmptyString(value.startAt)
    || !isNonEmptyString(value.endAt)
  ) {
    return false;
  }

  const start = parseLocalDateTime(value.startAt);
  const end = parseLocalDateTime(value.endAt);
  return start !== null && end !== null && start < end;
}

function isTechnicianAvailability(
  value: unknown,
): value is TechnicianAvailability {
  return (
    isRecord(value)
    && isNonEmptyString(value.technicianProfileId)
    && Array.isArray(value.availableRanges)
    && value.availableRanges.length > 0
    && value.availableRanges.every(isSchedulingTimeRange)
  );
}

function isExistingBooking(
  value: unknown,
  context: SchedulingContext,
): value is ExistingBooking {
  if (!isRecord(value)) return false;
  if (
    !isNonEmptyString(value.bookingId)
    || !(Number.isInteger(value.version) && Number(value.version) > 0)
    || !isTaskType(value.taskType)
    || !isEntityType(value.entityType)
    || !isPriority(value.priority)
    || !isNonEmptyString(value.machineSlotId)
    || !isNonEmptyString(value.technicianProfileId)
    || parseLocalDateTime(value.scheduledStart) === null
    || parseLocalDateTime(value.scheduledEnd) === null
    || String(value.scheduledStart) >= String(value.scheduledEnd)
  ) {
    return false;
  }

  return context.machineSlots.some(
    (slot) => slot.id === value.machineSlotId,
  );
}

function intervalsOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function evaluateScheduleCandidate(
  candidate: ScheduleCandidate,
  context: SchedulingContext,
): ScheduleEvaluation {
  const blockers: SchedulingBlocker[] = [];
  const warnings: SchedulingWarning[] = [];
  const readiness = safeReadinessEvaluation(candidate);

  if (!isRecord(candidate)) {
    addBlocker(blockers, 'INVALID_SCHEDULE_INPUT');
    addBlocker(blockers, 'READINESS_INPUT_INCOMPLETE');
    return {
      isSchedulable: false,
      blockers,
      warnings,
      readiness: null,
    };
  }

  if (
    !isNonEmptyString(candidate.id)
    || !isEntityType(candidate.entityType)
    || !isNonEmptyString(candidate.entityId)
    || !isNonEmptyString(candidate.identifier)
    || !isNonEmptyString(candidate.versionLabel)
    || !isNonEmptyString(candidate.machineSlotId)
    || !isNonEmptyString(candidate.technicianProfileId)
  ) {
    addBlocker(blockers, 'INVALID_SCHEDULE_INPUT');
  }
  if (!isTaskType(candidate.taskType) || hasTaskEntityMismatch(candidate)) {
    addBlocker(blockers, 'INVALID_TASK_ENTITY');
  }
  if (!isPriority(candidate.priority)) {
    addBlocker(blockers, 'INVALID_PRIORITY');
  }
  if (!isPositiveInteger(candidate.quantity)) {
    addBlocker(blockers, 'INVALID_QUANTITY');
  }
  if (candidate.dueDate === '') {
    addBlocker(blockers, 'DUE_DATE_MISSING');
  } else if (!isValidDueDate(candidate.dueDate)) {
    addBlocker(blockers, 'INVALID_DUE_DATE');
  }

  if (readiness === null) {
    addBlocker(blockers, 'READINESS_INPUT_INCOMPLETE');
  } else {
    addReadinessBlockers(blockers, readiness);
  }

  if (!isRecord(context)) {
    addBlocker(blockers, 'SCHEDULING_CONTEXT_INVALID');
    return {
      isSchedulable: false,
      blockers,
      warnings,
      readiness,
    };
  }

  const workingDayWindows = Array.isArray(context.workingDayWindows)
    ? context.workingDayWindows
    : [];
  const machineSlots = Array.isArray(context.machineSlots)
    ? context.machineSlots
    : [];
  const technicianAvailability = Array.isArray(context.technicianAvailability)
    ? context.technicianAvailability
    : [];
  const existingBookings = Array.isArray(context.existingBookings)
    ? context.existingBookings
    : [];

  if (
    !Array.isArray(context.workingDayWindows)
    || !Array.isArray(context.machineSlots)
    || !Array.isArray(context.technicianAvailability)
    || !Array.isArray(context.existingBookings)
  ) {
    addBlocker(blockers, 'SCHEDULING_CONTEXT_INVALID');
  }

  const windowsById = new Map<string, WorkingDayWindow>();
  for (const window of workingDayWindows) {
    if (!isWorkingDayWindow(window) || windowsById.has(window.id)) {
      addBlocker(blockers, 'SCHEDULING_CONTEXT_INVALID');
      continue;
    }
    windowsById.set(window.id, window);
  }

  const slotsById = new Map<string, MachineSlot>();
  for (const slot of machineSlots) {
    if (!isMachineSlot(slot) || slotsById.has(slot.id)) {
      addBlocker(blockers, 'SCHEDULING_CONTEXT_INVALID');
      continue;
    }

    const slotWindow = windowsById.get(slot.workingWindowId);
    const slotStart = parseLocalDateTime(slot.startAt);
    const slotEnd = parseLocalDateTime(slot.endAt);
    const windowStart = slotWindow
      ? parseLocalDateTime(slotWindow.startAt)
      : null;
    const windowEnd = slotWindow
      ? parseLocalDateTime(slotWindow.endAt)
      : null;
    if (
      !slotWindow
      || slotStart === null
      || slotEnd === null
      || windowStart === null
      || windowEnd === null
      || slotStart < windowStart
      || slotEnd > windowEnd
    ) {
      addBlocker(blockers, 'SCHEDULING_CONTEXT_INVALID');
      continue;
    }
    slotsById.set(slot.id, slot);
  }

  const candidateStart = parseLocalDateTime(candidate.scheduledStart);
  const candidateEnd = parseLocalDateTime(candidate.scheduledEnd);
  const candidateTimeIsValid =
    candidateStart !== null
    && candidateEnd !== null
    && candidateStart < candidateEnd;
  if (!candidateTimeIsValid) {
    addBlocker(blockers, 'INVALID_TIME_RANGE');
  }

  const machineSlot = slotsById.get(candidate.machineSlotId);
  if (!machineSlot) {
    addBlocker(blockers, 'MACHINE_SLOT_MISSING');
  } else if (
    isTaskType(candidate.taskType)
    && !machineSlot.taskTypes.includes(candidate.taskType)
  ) {
    addBlocker(blockers, 'MACHINE_TASK_UNSUPPORTED');
  }

  const window = machineSlot
    ? windowsById.get(machineSlot.workingWindowId)
    : undefined;
  if (machineSlot && !window) {
    addBlocker(blockers, 'WORKING_WINDOW_MISSING');
  }

  if (window && candidateTimeIsValid) {
    const windowStart = parseLocalDateTime(window.startAt);
    const windowEnd = parseLocalDateTime(window.endAt);
    if (
      windowStart === null
      || windowEnd === null
      || candidateStart < windowStart
      || candidateEnd > windowEnd
    ) {
      addBlocker(blockers, 'OUTSIDE_WORKING_WINDOW');
    }
  }

  if (machineSlot && candidateTimeIsValid) {
    const slotStart = parseLocalDateTime(machineSlot.startAt);
    const slotEnd = parseLocalDateTime(machineSlot.endAt);
    if (
      slotStart === null
      || slotEnd === null
      || candidateStart < slotStart
      || candidateEnd > slotEnd
    ) {
      addBlocker(blockers, 'OUTSIDE_MACHINE_SLOT');
    }
  }

  let availability: TechnicianAvailability | undefined;
  for (const entry of technicianAvailability) {
    if (!isTechnicianAvailability(entry)) {
      addBlocker(blockers, 'SCHEDULING_CONTEXT_INVALID');
      continue;
    }
    if (entry.technicianProfileId === candidate.technicianProfileId) {
      availability = entry;
    }
  }

  if (!availability || !isNonEmptyString(candidate.technicianProfileId)) {
    addBlocker(blockers, 'TECHNICIAN_AVAILABILITY_MISSING');
  } else if (candidateTimeIsValid) {
    const technicianIsAvailable = availability.availableRanges.some((range) => {
      const rangeStart = parseLocalDateTime(range.startAt);
      const rangeEnd = parseLocalDateTime(range.endAt);
      return (
        rangeStart !== null
        && rangeEnd !== null
        && candidateStart >= rangeStart
        && candidateEnd <= rangeEnd
      );
    });
    if (!technicianIsAvailable) {
      addBlocker(blockers, 'TECHNICIAN_UNAVAILABLE');
    }
  }

  const durationMinutes =
    candidateTimeIsValid
      ? (candidateEnd - candidateStart) / 60_000
      : null;
  if (candidate.capacityEstimate === null) {
    addBlocker(blockers, 'CAPACITY_ESTIMATE_MISSING');
  } else if (!isCapacityEstimate(candidate.capacityEstimate)) {
    addBlocker(blockers, 'CAPACITY_ESTIMATE_INVALID');
  } else {
    if (
      candidate.capacityEstimate.estimatedByTechnicianProfileId
      !== candidate.technicianProfileId
    ) {
      addBlocker(blockers, 'CAPACITY_ESTIMATE_TECHNICIAN_MISMATCH');
    }
    if (
      isPositiveInteger(candidate.quantity)
      && candidate.capacityEstimate.estimatedQuantity < candidate.quantity
    ) {
      addBlocker(blockers, 'CAPACITY_ESTIMATE_INSUFFICIENT');
    }
    if (
      durationMinutes !== null
      && candidate.capacityEstimate.durationMinutes !== durationMinutes
    ) {
      addBlocker(blockers, 'DURATION_ESTIMATE_MISMATCH');
    }
  }

  if (
    candidateTimeIsValid
    && isValidDueDate(candidate.dueDate)
    && candidate.scheduledEnd.slice(0, 10) > candidate.dueDate
  ) {
    warnings.push(LATE_WARNING);
  }

  const bookingsToCheck = [...existingBookings]
    .filter((booking) => isExistingBooking(booking, context))
    .sort((left, right) => (
      left.scheduledStart.localeCompare(right.scheduledStart)
      || left.bookingId.localeCompare(right.bookingId)
    ));

  if (bookingsToCheck.length !== existingBookings.length) {
    addBlocker(blockers, 'SCHEDULING_CONTEXT_INVALID');
  }

  if (candidateTimeIsValid && machineSlot) {
    for (const booking of bookingsToCheck) {
      const bookingStart = parseLocalDateTime(booking.scheduledStart);
      const bookingEnd = parseLocalDateTime(booking.scheduledEnd);
      const bookingSlot = slotsById.get(booking.machineSlotId);
      if (
        bookingStart === null
        || bookingEnd === null
        || !bookingSlot
        || !intervalsOverlap(
          candidateStart,
          candidateEnd,
          bookingStart,
          bookingEnd,
        )
      ) {
        continue;
      }

      if (bookingSlot.machineId === machineSlot.machineId) {
        addBlocker(blockers, 'MACHINE_TIME_CONFLICT', booking.bookingId);
      }
      if (
        booking.technicianProfileId === candidate.technicianProfileId
      ) {
        addBlocker(blockers, 'TECHNICIAN_TIME_CONFLICT', booking.bookingId);
      }
    }
  }

  return {
    isSchedulable: blockers.length === 0,
    blockers,
    warnings,
    readiness,
  };
}

function bookingMatchesCurrentBase(
  currentBooking: ExistingBooking,
  liveBooking: ExistingBooking,
  context: SchedulingContext,
): boolean {
  if (
    !isExistingBooking(currentBooking, context)
    || !isExistingBooking(liveBooking, context)
    || !isNonEmptyString(currentBooking.entityId)
    || !isNonEmptyString(currentBooking.identifier)
    || !isNonEmptyString(currentBooking.versionLabel)
    || !isValidDueDate(currentBooking.dueDate)
    || !isPositiveInteger(currentBooking.quantity)
  ) {
    return false;
  }

  const currentEstimate = currentBooking.capacityEstimate;
  const liveEstimate = liveBooking.capacityEstimate;
  const capacityMatches = (
    (currentEstimate === null && liveEstimate === null)
    || (
      isCapacityEstimate(currentEstimate)
      && isCapacityEstimate(liveEstimate)
      && currentEstimate.estimateId === liveEstimate.estimateId
      && currentEstimate.estimatedQuantity === liveEstimate.estimatedQuantity
      && currentEstimate.durationMinutes === liveEstimate.durationMinutes
      && currentEstimate.estimatedByTechnicianProfileId
        === liveEstimate.estimatedByTechnicianProfileId
    )
  );

  return capacityMatches
    && currentBooking.bookingId === liveBooking.bookingId
    && currentBooking.version === liveBooking.version
    && currentBooking.taskType === liveBooking.taskType
    && currentBooking.entityType === liveBooking.entityType
    && currentBooking.entityId === liveBooking.entityId
    && currentBooking.identifier === liveBooking.identifier
    && currentBooking.versionLabel === liveBooking.versionLabel
    && currentBooking.priority === liveBooking.priority
    && currentBooking.machineSlotId === liveBooking.machineSlotId
    && currentBooking.technicianProfileId === liveBooking.technicianProfileId
    && currentBooking.scheduledStart === liveBooking.scheduledStart
    && currentBooking.scheduledEnd === liveBooking.scheduledEnd
    && currentBooking.dueDate === liveBooking.dueDate
    && currentBooking.quantity === liveBooking.quantity;
}

export function createRescheduleProposal(
  currentBooking: ExistingBooking,
  request: RescheduleRequest,
  context: SchedulingContext,
): RescheduleProposalResult {
  const errors: RescheduleProposalError[] = [];

  if (!isNonEmptyString(request.proposalId)) {
    errors.push('PROPOSAL_ID_MISSING');
  }
  if (
    request.proposedByRole !== 'WORKSHOP_SUPERVISOR'
    || !isNonEmptyString(request.proposedByProfileId)
  ) {
    errors.push('RESCHEDULE_OWNER_INVALID');
  }
  if (!isNonEmptyString(request.reason)) {
    errors.push('PROPOSAL_REASON_MISSING');
  }

  const requestedStart = parseLocalDateTime(request.scheduledStart);
  const requestedEnd = parseLocalDateTime(request.scheduledEnd);
  if (
    requestedStart === null
    || requestedEnd === null
    || requestedStart >= requestedEnd
  ) {
    errors.push('RESCHEDULE_TIME_INVALID');
  } else if (
    request.scheduledStart === currentBooking.scheduledStart
    && request.scheduledEnd === currentBooking.scheduledEnd
  ) {
    errors.push('RESCHEDULE_TIME_UNCHANGED');
  }

  // An old caller snapshot must never remove a newer, live booking from
  // conflict checks. A matching and unique live baseline is mandatory.
  if (
    !isRecord(context)
    || !Array.isArray(context.existingBookings)
    || !Array.isArray(context.machineSlots)
    || !isNonEmptyString(currentBooking.bookingId)
  ) {
    errors.push('RESCHEDULE_BASE_MISSING');
  } else {
    const liveBases = context.existingBookings.filter(
      (booking) => isRecord(booking)
        && booking.bookingId === currentBooking.bookingId,
    );
    if (liveBases.length === 0) {
      errors.push('RESCHEDULE_BASE_MISSING');
    } else if (liveBases.length !== 1) {
      errors.push('RESCHEDULE_BASE_DUPLICATE');
    } else if (!bookingMatchesCurrentBase(currentBooking, liveBases[0], context)) {
      errors.push('RESCHEDULE_BASE_STALE');
    }
  }

  if (errors.length > 0) {
    return {
      proposal: null,
      evaluation: null,
      errors,
    };
  }

  const candidate: ScheduleCandidate = Object.freeze({
    id: request.proposalId,
    taskType: currentBooking.taskType,
    entityType: currentBooking.entityType,
    entityId: currentBooking.entityId,
    identifier: currentBooking.identifier,
    versionLabel: currentBooking.versionLabel,
    priority: currentBooking.priority,
    machineSlotId: currentBooking.machineSlotId,
    technicianProfileId: currentBooking.technicianProfileId,
    scheduledStart: request.scheduledStart,
    scheduledEnd: request.scheduledEnd,
    dueDate: currentBooking.dueDate,
    quantity: currentBooking.quantity,
    capacityEstimate: currentBooking.capacityEstimate,
    readiness: request.readiness,
  });

  const evaluation = evaluateScheduleCandidate(candidate, {
    ...context,
    existingBookings: context.existingBookings.filter(
      (booking) => booking.bookingId !== currentBooking.bookingId,
    ),
  });
  const proposal: ScheduleRescheduleProposal = Object.freeze({
    status: evaluation.isSchedulable ? 'PROPOSED' : 'BLOCKED',
    proposalId: request.proposalId,
    bookingId: currentBooking.bookingId,
    version: currentBooking.version + 1,
    basedOnVersion: currentBooking.version,
    reason: request.reason.trim(),
    proposedByProfileId: request.proposedByProfileId.trim(),
    proposedByRole: 'WORKSHOP_SUPERVISOR',
    candidate,
  });

  return {
    proposal,
    evaluation,
    errors: [],
  };
}

function priorityRank(priority: WosPriority): number {
  switch (priority) {
    case 'CRITICAL':
      return 0;
    case 'HIGH':
      return 1;
    case 'MEDIUM':
      return 2;
    case 'LOW':
      return 3;
  }
}

function formatScheduledWindow(startAt: string, endAt: string): string {
  return `${startAt.replace('T', ' ')} 至 ${endAt.replace('T', ' ')}`;
}

function previewItem(
  candidate: ScheduleCandidate,
  context: SchedulingContext,
): SchedulingPreviewItem {
  const evaluation = evaluateScheduleCandidate(candidate, context);
  const machine = context.machineSlots.find(
    (slot) => slot.id === candidate.machineSlotId,
  );
  const estimate = candidate.capacityEstimate;
  const firstBlocker = evaluation.blockers[0];
  const firstWarning = evaluation.warnings[0];

  return {
    id: candidate.id,
    entityType: candidate.entityType,
    taskLabel: candidate.taskType === 'PRODUCTION' ? '生产排期' : '打样排期',
    identifier: candidate.identifier,
    versionLabel: candidate.versionLabel,
    priority: candidate.priority,
    priorityLabel: PRIORITY_LABELS[candidate.priority] ?? '未设优先级',
    machineLabel: machine?.machineLabel ?? '机台待核实',
    scheduledWindowLabel: formatScheduledWindow(
      candidate.scheduledStart,
      candidate.scheduledEnd,
    ),
    dueDateLabel: `交期 ${candidate.dueDate}`,
    durationLabel: estimate
      ? `技术员估时 ${estimate.durationMinutes} 分钟`
      : '缺少技术员估时',
    capacityLabel: estimate
      ? `估算产能 ${estimate.estimatedQuantity} / 排期数量 ${candidate.quantity}`
      : `缺少估算产能 / 排期数量 ${candidate.quantity}`,
    readinessLabel:
      evaluation.readiness?.isReady === true
        ? 'Phase 3 齐套：已通过'
        : 'Phase 3 齐套：未通过',
    scheduleStatusLabel: evaluation.isSchedulable
      ? firstWarning
        ? '可提交复核，需确认延期'
        : '可提交主管复核'
      : '暂不可排期',
    nextActionLabel:
      firstBlocker?.actionLabel
      ?? firstWarning?.actionLabel
      ?? '提交车间主管复核该非生产排期提案',
    ownershipLabel:
      '项目负责人确认需求 · 车间主管负责排期 · 技术员提供时长估算',
    isSchedulable: evaluation.isSchedulable,
    isLate: evaluation.warnings.length > 0,
    blockers: evaluation.blockers.map((blocker) => ({
      code: blocker.code,
      label: blocker.label,
      actionLabel: blocker.actionLabel,
      relatedBookingId: blocker.relatedBookingId ?? null,
    })),
    warnings: evaluation.warnings.map((warning) => ({ ...warning })),
  };
}

function comparePreviewItems(
  left: ScheduleCandidate,
  right: ScheduleCandidate,
): number {
  return (
    priorityRank(left.priority) - priorityRank(right.priority)
    || left.dueDate.localeCompare(right.dueDate)
    || left.scheduledStart.localeCompare(right.scheduledStart)
    || left.id.localeCompare(right.id)
  );
}

export function buildSchedulingPreview(
  candidates: readonly ScheduleCandidate[],
  context: SchedulingContext,
): SchedulingPreviewSnapshot {
  const production: SchedulingPreviewItem[] = [];
  const sampling: SchedulingPreviewItem[] = [];
  const ordered = [...candidates].sort(comparePreviewItems);

  for (const candidate of ordered) {
    const item = previewItem(candidate, context);
    if (candidate.taskType === 'PRODUCTION') {
      production.push(item);
    } else {
      sampling.push(item);
    }
  }

  return {
    production,
    sampling,
  };
}

const previewBaseline: VisualBaselineSummary = {
  versionLabel: 'V1',
  isCurrent: true,
  productImageCount: 1,
  filmImageCount: 1,
  customerApprovedSampleCount: 1,
  signedSampleCount: 1,
  workshopConfirmed: true,
};

const previewReadinessFacts: WorkshopReadinessFacts = {
  filmReadiness: 'VERSION_VERIFIED',
  fixtureReadiness: 'FIT_VERIFIED',
  incomingMaterialReadiness: 'QUANTITY_VERIFIED',
  signedSampleReadiness: 'VERIFIED',
  filmVersionLabel: 'V1',
  filmRequired: true,
  fixtureRequired: true,
  customerSampleRequired: true,
  signedSampleRequired: true,
  visualBaseline: previewBaseline,
  unresolvedBlockerCount: 0,
};

const previewProductionReadiness: ProductionWorkshopReadinessInput = {
  entityType: 'PRODUCTION_ORDER',
  order: productionOrderFixture,
  technicalConfirmed: true,
  supervisorConfirmed: true,
  ...previewReadinessFacts,
};

const previewSamplingReadiness: SamplingWorkshopReadinessInput = {
  entityType: 'SAMPLING_REQUEST',
  request: samplingRequestFixture,
  priority: 'CRITICAL',
  technicianAccepted: true,
  ...previewReadinessFacts,
};

const previewWindows: readonly WorkingDayWindow[] = [
  {
    id: 'preview-window-2026-11-02',
    startAt: '2026-11-02T08:00',
    endAt: '2026-11-02T17:00',
  },
  {
    id: 'preview-window-2026-11-03',
    startAt: '2026-11-03T08:00',
    endAt: '2026-11-03T17:00',
  },
];

const previewMachineSlots: readonly MachineSlot[] = [
  {
    id: 'preview-slot-a-production',
    machineId: 'preview-machine-a',
    machineLabel: 'A 机',
    workingWindowId: 'preview-window-2026-11-02',
    startAt: '2026-11-02T09:00',
    endAt: '2026-11-02T11:00',
    taskTypes: ['PRODUCTION', 'SAMPLING'],
  },
  {
    id: 'preview-slot-a-sampling',
    machineId: 'preview-machine-a',
    machineLabel: 'A 机',
    workingWindowId: 'preview-window-2026-11-03',
    startAt: '2026-11-03T09:00',
    endAt: '2026-11-03T10:00',
    taskTypes: ['PRODUCTION', 'SAMPLING'],
  },
];

const previewCandidates: readonly ScheduleCandidate[] = [
  {
    id: 'preview-production-proposal',
    taskType: 'PRODUCTION',
    entityType: 'PRODUCTION_ORDER',
    entityId: productionOrderFixture.id,
    identifier: productionOrderFixture.orderNumber,
    versionLabel: productionOrderFixture.versionLabel,
    priority: productionOrderFixture.priority,
    machineSlotId: 'preview-slot-a-production',
    technicianProfileId: '00000000-0000-4000-8000-000000000006',
    scheduledStart: '2026-11-02T09:00',
    scheduledEnd: '2026-11-02T11:00',
    dueDate: '2026-11-02',
    quantity: productionOrderFixture.currentBatchQuantity,
    capacityEstimate: {
      estimateId: 'preview-estimate-production',
      estimatedQuantity: productionOrderFixture.currentBatchQuantity,
      durationMinutes: 120,
      estimatedByTechnicianProfileId:
        '00000000-0000-4000-8000-000000000006',
    },
    readiness: previewProductionReadiness,
  },
  {
    id: 'preview-sampling-proposal',
    taskType: 'SAMPLING',
    entityType: 'SAMPLING_REQUEST',
    entityId: samplingRequestFixture.id,
    identifier: samplingRequestFixture.productName,
    versionLabel: samplingRequestFixture.versionLabel,
    priority: 'CRITICAL',
    machineSlotId: 'preview-slot-a-sampling',
    technicianProfileId: '00000000-0000-4000-8000-000000000006',
    scheduledStart: '2026-11-03T09:00',
    scheduledEnd: '2026-11-03T10:00',
    dueDate: '2026-11-02',
    quantity: samplingRequestFixture.requiredGoodQuantity,
    capacityEstimate: {
      estimateId: 'preview-estimate-sampling',
      estimatedQuantity: samplingRequestFixture.requiredGoodQuantity,
      durationMinutes: 60,
      estimatedByTechnicianProfileId:
        '00000000-0000-4000-8000-000000000006',
    },
    readiness: previewSamplingReadiness,
  },
];

const previewContext: SchedulingContext = {
  workingDayWindows: previewWindows,
  machineSlots: previewMachineSlots,
  technicianAvailability: [
    {
      technicianProfileId: '00000000-0000-4000-8000-000000000006',
      availableRanges: [
        {
          startAt: '2026-11-02T08:00',
          endAt: '2026-11-02T17:00',
        },
        {
          startAt: '2026-11-03T08:00',
          endAt: '2026-11-03T17:00',
        },
      ],
    },
  ],
  existingBookings: [],
};

export const SCHEDULING_PREVIEW_FIXTURE = buildSchedulingPreview(
  previewCandidates,
  previewContext,
);
