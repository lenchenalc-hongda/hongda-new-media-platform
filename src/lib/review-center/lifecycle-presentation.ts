import type { ReviewDetail, ReviewStatus } from './types';
import { REVIEW_STATUS_LABELS } from './formatters';
import { sanitizeMissingDimensions } from './metadata';

export type LifecycleActionKind = 'SUBMIT' | 'CLOSE' | 'RETURN' | 'REOPEN';

export interface LifecyclePresentationInput {
  status: string;
  currentProfileId: string | null | undefined;
  currentRole: string | null | undefined;
  ownerId: string;
  pmoId: string | null | undefined;
}

export interface LifecyclePresentation {
  statusLabel: string;
  statusDescription: string;
  canEdit: boolean;
  canSubmit: boolean;
  canReturnToDraft: boolean;
  canClose: boolean;
  canReopenClosed: boolean;
  isLifecycleManagedStatus: boolean;
}

export interface LifecycleSuccessData {
  status: string;
  version: number;
  submittedAt: string | null;
  closedAt: string | null;
}

export interface LifecycleRequest {
  url: string;
  body: Record<string, unknown>;
}

export interface LifecycleUiError {
  code: string;
  message: string;
  shouldRefreshAuthority: boolean;
  keepDialogOpen: boolean;
  incompleteFields: string[];
  missingDimensions: string[];
}

export interface MutationLock {
  acquire(): boolean;
  release(): void;
}

const KNOWN_ROLES = new Set(['admin', 'manager', 'operator', 'sales', 'viewer']);
const LIFECYCLE_STATUSES = new Set(['draft', 'submitted', 'closed']);

const STATUS_DESCRIPTIONS: Record<string, string> = {
  draft: '内容可编辑，完成后可提交确认。',
  submitted: '复盘已提交，等待管理人员确认关闭或退回修改。',
  closed: '本次复盘流程已关闭，如需继续修改需由管理员重新打开。',
};

export const INCOMPLETE_FIELD_LABELS: Record<string, string> = {
  title: '复盘标题',
  review_type: '复盘类型',
  description: '问题描述',
  risk_level: '风险等级',
  risk_reason: '风险说明',
  owner_id: '项目负责人',
  type_details: '专项复盘内容',
};

export function lifecycleStatusLabel(status: string): string {
  const label = REVIEW_STATUS_LABELS[status as ReviewStatus];
  return label ?? '未知状态';
}

export function lifecycleStatusDescription(status: string): string {
  return STATUS_DESCRIPTIONS[status] ?? '当前状态暂不支持生命周期操作。';
}

export function isLifecycleManagedStatus(status: string): boolean {
  return LIFECYCLE_STATUSES.has(status);
}

export function getLifecyclePresentation(
  input: LifecyclePresentationInput,
): LifecyclePresentation {
  const status = input.status;
  const adminManager = input.currentRole === 'admin' || input.currentRole === 'manager';
  const knownRole = input.currentRole != null && KNOWN_ROLES.has(input.currentRole);
  const nonViewer = knownRole && input.currentRole !== 'viewer';
  const ownerMatch = input.currentProfileId != null && input.currentProfileId === input.ownerId;
  const pmoMatch =
    input.currentProfileId != null
    && input.pmoId != null
    && input.currentProfileId === input.pmoId;

  const canEditDraft =
    status === 'draft'
    && (adminManager || (nonViewer && (ownerMatch || pmoMatch)));

  return {
    statusLabel: lifecycleStatusLabel(status),
    statusDescription: lifecycleStatusDescription(status),
    canEdit: canEditDraft,
    canSubmit: canEditDraft,
    canReturnToDraft: status === 'submitted' && adminManager,
    canClose: status === 'submitted' && adminManager,
    canReopenClosed: status === 'closed' && input.currentRole === 'admin',
    isLifecycleManagedStatus: isLifecycleManagedStatus(status),
  };
}

export function buildLifecycleRequest(
  action: LifecycleActionKind,
  reviewId: string,
  expectedVersion: number,
  reason?: string | null,
): LifecycleRequest {
  const base = `/api/review-center/reviews/${encodeURIComponent(reviewId)}`;
  if (action === 'SUBMIT') {
    return { url: `${base}/submit`, body: { expectedVersion } };
  }
  if (action === 'CLOSE') {
    return { url: `${base}/close`, body: { expectedVersion } };
  }
  if (action === 'RETURN') {
    return { url: `${base}/reopen`, body: { expectedVersion, reason: null } };
  }
  if (action === 'REOPEN') {
    return {
      url: `${base}/reopen`,
      body: { expectedVersion, reason: reason?.trim() || null },
    };
  }
  throw new Error('未知生命周期操作');
}

export function normalizeLifecycleSuccess(payload: unknown): LifecycleSuccessData | null {
  if (!payload || typeof payload !== 'object') return null;
  const envelope = payload as Record<string, unknown>;
  if (envelope.ok !== true || envelope.code !== 'OK') return null;
  const data = envelope.data;
  if (!data || typeof data !== 'object') return null;
  const source = data as Record<string, unknown>;
  if (
    typeof source.status !== 'string'
    || source.status.length === 0
    || typeof source.version !== 'number'
    || !Number.isInteger(source.version)
    || source.version < 1
    || (typeof source.submitted_at !== 'string' && source.submitted_at !== null)
    || (typeof source.closed_at !== 'string' && source.closed_at !== null)
  ) {
    return null;
  }
  return {
    status: source.status,
    version: source.version,
    submittedAt: source.submitted_at,
    closedAt: source.closed_at,
  };
}

export function sanitizeIncompleteFields(fields: unknown): string[] {
  if (!Array.isArray(fields)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const field of fields) {
    if (
      typeof field === 'string'
      && Object.prototype.hasOwnProperty.call(INCOMPLETE_FIELD_LABELS, field)
      && !seen.has(field)
    ) {
      seen.add(field);
      result.push(field);
    }
  }
  return result;
}

export function classifyLifecycleError(
  status: number,
  payload: unknown,
): LifecycleUiError {
  const body = payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>)
    : null;
  const code = typeof body?.code === 'string' ? body.code : 'UNKNOWN';

  if (status === 401) {
    return {
      code: 'UNAUTHENTICATED',
      message: '未登录或登录已过期。',
      shouldRefreshAuthority: false,
      keepDialogOpen: false,
      incompleteFields: [],
      missingDimensions: [],
    };
  }
  if (status === 403) {
    return {
      code: 'FORBIDDEN',
      message: '你当前无权执行此操作。',
      shouldRefreshAuthority: true,
      keepDialogOpen: false,
      incompleteFields: [],
      missingDimensions: [],
    };
  }
  if (status === 409 && code === 'VERSION_CONFLICT') {
    return {
      code,
      message: '复盘已被其他操作更新，请刷新后重试。',
      shouldRefreshAuthority: true,
      keepDialogOpen: false,
      incompleteFields: [],
      missingDimensions: [],
    };
  }
  if (status === 409 && code === 'INVALID_TRANSITION') {
    return {
      code,
      message: '复盘状态已发生变化，页面将刷新为最新状态。',
      shouldRefreshAuthority: true,
      keepDialogOpen: false,
      incompleteFields: [],
      missingDimensions: [],
    };
  }
  if (status === 422 && code === 'INCOMPLETE_REVIEW') {
    const data = body?.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : null;
    return {
      code,
      message: '复盘内容还未填写完整，请先补充以下内容：',
      shouldRefreshAuthority: false,
      keepDialogOpen: false,
      incompleteFields: sanitizeIncompleteFields(
        data?.missingFields ?? data?.missing_fields,
      ),
      missingDimensions: [],
    };
  }
  if (status === 422 && code === 'METADATA_INCOMPLETE') {
    const data = body?.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : null;
    return {
      code,
      message: '项目分类信息未完整，请补齐以下内容：',
      shouldRefreshAuthority: false,
      keepDialogOpen: false,
      incompleteFields: [],
      missingDimensions: sanitizeMissingDimensions(
        data?.missingDimensions ?? data?.missing_dimensions,
      ),
    };
  }
  if (status === 422 && code === 'INVALID_REASON') {
    return {
      code,
      message: '请填写有效的重新打开原因。',
      shouldRefreshAuthority: false,
      keepDialogOpen: true,
      incompleteFields: [],
      missingDimensions: [],
    };
  }
  if (status === 409 && code === 'OPEN_ACTIONS_EXIST') {
    const data = body?.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : null;
    const count =
      data?.openActionCount !== null
      && typeof data?.openActionCount === 'number'
      && Number.isSafeInteger(data.openActionCount)
      && data.openActionCount >= 1
        ? data.openActionCount as number
        : null;
    return {
      code,
      message: count === null
        ? '还有改善行动未完成验证，暂不能关闭复盘。'
        : `还有 ${count} 项改善行动未完成验证，暂不能关闭复盘。`,
      shouldRefreshAuthority: false,
      keepDialogOpen: false,
      incompleteFields: [],
      missingDimensions: [],
    };
  }
  return {
    code: 'INTERNAL_ERROR',
    message: '操作失败，请稍后重试。',
    shouldRefreshAuthority: false,
    keepDialogOpen: false,
    incompleteFields: [],
    missingDimensions: [],
  };
}

export function createMutationLock(): MutationLock {
  let locked = false;
  return {
    acquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
  };
}

export function applyLifecycleSuccessToDetail(
  detail: ReviewDetail,
  data: LifecycleSuccessData,
): ReviewDetail {
  return {
    ...detail,
    status: data.status as ReviewStatus,
    version: data.version,
    submitted_at: data.submittedAt,
    closed_at: data.closedAt,
  };
}
