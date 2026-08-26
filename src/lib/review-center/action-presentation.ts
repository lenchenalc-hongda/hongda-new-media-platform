import type { ActionReadDto, ActionStatus, ActionType } from './actions';

export const ACTION_READ_ERROR_MESSAGE = '改善行动加载失败，请重试';

export const ACTION_REFRESH_FAILURE_MESSAGE =
  '操作已完成，但最新数据刷新失败，请手动重试。';

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  OPEN: '待开始',
  IN_PROGRESS: '进行中',
  PENDING_VERIFICATION: '待验证',
  VERIFIED: '已验证',
  CANCELLED: '已取消',
  UNKNOWN: '状态异常',
};

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  IMMEDIATE: '立即纠正',
  CORRECTIVE: '纠正措施',
  PREVENTIVE: '预防措施',
  UNKNOWN: '未知类型',
};

export const ACTION_STATUS_BADGE: Record<ActionStatus, string> = {
  OPEN: 'badge-blue',
  IN_PROGRESS: 'badge-yellow',
  PENDING_VERIFICATION: 'badge-purple',
  VERIFIED: 'badge-green',
  CANCELLED: 'badge-gray',
  UNKNOWN: 'badge-red',
};

export interface ActionPresentationCapabilities {
  canEdit: boolean;
  canStart: boolean;
  canSubmit: boolean;
  canVerify: boolean;
  canReturn: boolean;
  canCancel: boolean;
}

export interface ActionCreatePresentationInput {
  reviewStatus: string;
  currentRole: string | null;
  currentProfileId: string | null;
  reviewOwnerProfileId: string;
  reviewPmoProfileId: string | null;
}

export interface ActionPresentationInput extends ActionCreatePresentationInput {
  actionStatus: string;
  actionOwnerProfileId: string;
}

export interface ActionCommandErrorPresentation {
  message: string;
  shouldRefetchActions: boolean;
  shouldReloadOwnerDirectory: boolean;
  shouldCloseDialog: boolean;
}

const KNOWN_ROLES = new Set(['admin', 'manager', 'operator', 'sales', 'viewer']);
const MUTABLE_REVIEW_STATUSES = new Set(['draft', 'submitted']);
const EDITABLE_ACTION_STATUSES = new Set(['OPEN', 'IN_PROGRESS']);
const SUBMITTABLE_ACTION_STATUSES = new Set(['OPEN', 'IN_PROGRESS']);
const CANCELLABLE_ACTION_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'PENDING_VERIFICATION']);
const FINAL_ACTION_STATUSES = new Set(['VERIFIED', 'CANCELLED']);

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return lengths[month - 1];
}

export function formatActionDueDate(value: string | null | undefined): string {
  if (typeof value !== 'string') return '-';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return '-';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return '-';
  return `${match[1]}/${match[2]}/${match[3]}`;
}

export function actionStatusLabel(status: string): string {
  return ACTION_STATUS_LABELS[status as ActionStatus] ?? ACTION_STATUS_LABELS.UNKNOWN;
}

export function actionTypeLabel(actionType: string): string {
  return ACTION_TYPE_LABELS[actionType as ActionType] ?? ACTION_TYPE_LABELS.UNKNOWN;
}

export function actionStatusBadgeClass(status: string): string {
  return ACTION_STATUS_BADGE[status as ActionStatus] ?? 'badge-gray';
}

export function isActionFinalStatus(status: string): boolean {
  return FINAL_ACTION_STATUSES.has(status);
}

export function countNonFinalActions(actions: Pick<ActionReadDto, 'status'>[]): number {
  return actions.filter(action => !isActionFinalStatus(action.status)).length;
}

export function getActionSectionNonFinalWarning(
  actions: Pick<ActionReadDto, 'status'>[],
): string | null {
  const count = countNonFinalActions(actions);
  if (count <= 0) return null;
  return `当前还有 ${count} 项改善行动尚未闭环，关闭复盘时系统会进行最终校验。`;
}

export function getActionSectionEmptyCopy(canCreate: boolean): {
  title: string;
  description: string | null;
} {
  return {
    title: '暂无改善行动',
    description: canCreate ? '可为本次复盘创建需要跟进的整改事项' : null,
  };
}

export function canCreateActionForReview(
  input: ActionCreatePresentationInput,
): boolean {
  if (!MUTABLE_REVIEW_STATUSES.has(input.reviewStatus)) return false;
  if (input.currentRole === 'viewer') return false;
  if (input.currentRole === 'admin' || input.currentRole === 'manager') return true;
  const knownRole = input.currentRole != null && KNOWN_ROLES.has(input.currentRole);
  if (!knownRole || input.currentProfileId == null) return false;
  const ownerMatch = input.currentProfileId === input.reviewOwnerProfileId;
  const pmoMatch =
    input.reviewPmoProfileId != null
    && input.currentProfileId === input.reviewPmoProfileId;
  return ownerMatch || pmoMatch;
}

export function getActionPresentationCapabilities(
  input: ActionPresentationInput,
): ActionPresentationCapabilities {
  const empty: ActionPresentationCapabilities = {
    canEdit: false,
    canStart: false,
    canSubmit: false,
    canVerify: false,
    canReturn: false,
    canCancel: false,
  };
  if (!MUTABLE_REVIEW_STATUSES.has(input.reviewStatus)) return empty;
  if (input.currentRole === 'viewer') return empty;
  if (input.actionStatus === 'UNKNOWN') return empty;

  const adminManager =
    input.currentRole === 'admin' || input.currentRole === 'manager';
  const knownRole = input.currentRole != null && KNOWN_ROLES.has(input.currentRole);
  const nonViewer = knownRole && input.currentRole !== 'viewer';
  const profileId = input.currentProfileId;
  const ownerMatch = profileId != null && profileId === input.reviewOwnerProfileId;
  const pmoMatch =
    profileId != null
    && input.reviewPmoProfileId != null
    && profileId === input.reviewPmoProfileId;
  const actionOwnerMatch =
    nonViewer
    && profileId != null
    && profileId === input.actionOwnerProfileId;
  const reviewAuthority =
    adminManager || (nonViewer && (ownerMatch || pmoMatch));

  return {
    canEdit:
      EDITABLE_ACTION_STATUSES.has(input.actionStatus)
      && reviewAuthority,
    canStart:
      input.actionStatus === 'OPEN'
      && (adminManager || actionOwnerMatch),
    canSubmit:
      SUBMITTABLE_ACTION_STATUSES.has(input.actionStatus)
      && (adminManager || actionOwnerMatch),
    canVerify:
      input.actionStatus === 'PENDING_VERIFICATION'
      && !actionOwnerMatch
      && reviewAuthority,
    canReturn:
      input.actionStatus === 'PENDING_VERIFICATION'
      && !actionOwnerMatch
      && reviewAuthority,
    canCancel:
      CANCELLABLE_ACTION_STATUSES.has(input.actionStatus)
      && reviewAuthority,
  };
}

function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as Record<string, unknown>).code;
  return typeof code === 'string' ? code : null;
}

export function getActionCommandErrorPresentation(
  error: unknown,
): ActionCommandErrorPresentation {
  const generic: ActionCommandErrorPresentation = {
    message: '操作失败，请稍后重试',
    shouldRefetchActions: false,
    shouldReloadOwnerDirectory: false,
    shouldCloseDialog: false,
  };
  const code = extractErrorCode(error);
  if (!code) return generic;

  switch (code) {
    case 'VERSION_CONFLICT':
      return {
        message: '这条改善行动已被其他人更新，已为你刷新最新内容，请重新确认后操作。',
        shouldRefetchActions: true,
        shouldReloadOwnerDirectory: false,
        shouldCloseDialog: true,
      };
    case 'INVALID_TRANSITION':
      return {
        message: '当前状态不允许此操作，页面已刷新为最新状态',
        shouldRefetchActions: true,
        shouldReloadOwnerDirectory: false,
        shouldCloseDialog: true,
      };
    case 'SELF_VERIFICATION_FORBIDDEN':
      return {
        message: '负责人不能验证自己的行动',
        shouldRefetchActions: true,
        shouldReloadOwnerDirectory: false,
        shouldCloseDialog: true,
      };
    case 'FORBIDDEN':
      return {
        message: '你当前无权执行此操作',
        shouldRefetchActions: true,
        shouldReloadOwnerDirectory: false,
        shouldCloseDialog: true,
      };
    case 'NOT_FOUND':
      return {
        message: '改善行动不存在或已不可访问',
        shouldRefetchActions: true,
        shouldReloadOwnerDirectory: false,
        shouldCloseDialog: true,
      };
    case 'INVALID_OWNER':
      return {
        message: '负责人已不可分配，请重新选择',
        shouldRefetchActions: true,
        shouldReloadOwnerDirectory: true,
        shouldCloseDialog: false,
      };
    case 'INVALID_INPUT':
      return {
        message: '提交内容无效，请检查后重试',
        shouldRefetchActions: false,
        shouldReloadOwnerDirectory: false,
        shouldCloseDialog: false,
      };
    case 'INVALID_REASON':
      return {
        message: '原因内容无效，请检查后重试',
        shouldRefetchActions: false,
        shouldReloadOwnerDirectory: false,
        shouldCloseDialog: false,
      };
    default:
      return generic;
  }
}
