import type { ReviewDetail, ReviewType, RiskLevel, ReviewStatus } from './types';
import type { Role } from '@/lib/auth/types';

export interface EditorMe {
  role: Role;
  can_create_review: boolean;
  profile_id?: string | null;
}

export interface BasicInfoDraft {
  title: string;
  review_type: ReviewType;
  occurred_at: string;
  customer_name: string;
  order_no: string;
  project_name: string;
  product_name: string;
  process_name: string;
  description: string;
  impact_summary: string;
  risk_level: RiskLevel | '';
  risk_reason: string;
}

export type EditorMutationState =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'conflict'
  | 'non_editable'
  | 'reload_required'
  | 'forbidden'
  | 'validation'
  | 'error';

export interface EditorMutationErrorInfo {
  state: 'conflict' | 'non_editable' | 'reload_required' | 'forbidden' | 'validation' | 'error';
  message: string;
}

const TEXT_BASIC_FIELDS = [
  'customer_name',
  'order_no',
  'project_name',
  'product_name',
  'process_name',
  'description',
  'impact_summary',
  'risk_reason',
] as const;

export function canEditDraft(input: {
  role: Role;
  status: ReviewStatus;
  currentProfileId?: string | null;
  ownerId: string;
  pmoId?: string | null;
}): boolean {
  if (input.status !== 'draft') return false;
  if (input.role === 'viewer') return false;
  if (input.role === 'admin' || input.role === 'manager') return true;
  if (!input.currentProfileId) return false;
  return (
    input.currentProfileId === input.ownerId
    || input.currentProfileId === input.pmoId
  );
}

export function isReviewTypeLocked(typeDetails: ReviewDetail['type_details']): boolean {
  return typeDetails !== null && typeDetails !== undefined;
}

export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function normalizeBasicInfo(
  detail: Pick<
    ReviewDetail,
    | 'title'
    | 'review_type'
    | 'occurred_at'
    | 'customer_name'
    | 'order_no'
    | 'project_name'
    | 'product_name'
    | 'process_name'
    | 'description'
    | 'impact_summary'
    | 'risk_level'
    | 'risk_reason'
  >,
): BasicInfoDraft {
  return {
    title: detail.title,
    review_type: detail.review_type,
    occurred_at: toDateTimeLocal(detail.occurred_at),
    customer_name: detail.customer_name ?? '',
    order_no: detail.order_no ?? '',
    project_name: detail.project_name ?? '',
    product_name: detail.product_name ?? '',
    process_name: detail.process_name ?? '',
    description: detail.description ?? '',
    impact_summary: detail.impact_summary ?? '',
    risk_level: detail.risk_level ?? '',
    risk_reason: detail.risk_reason ?? '',
  };
}

export function diffBasicInfo(
  initial: BasicInfoDraft,
  draft: BasicInfoDraft,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (draft.title !== initial.title) {
    patch.title = draft.title.trim();
  }
  if (draft.review_type !== initial.review_type) {
    patch.review_type = draft.review_type;
  }
  if (draft.occurred_at !== initial.occurred_at) {
    patch.occurred_at = fromDateTimeLocal(draft.occurred_at);
  }
  for (const key of TEXT_BASIC_FIELDS) {
    if (draft[key] !== initial[key]) {
      const value = draft[key].trim();
      patch[key] = value === '' ? null : value;
    }
  }
  if (draft.risk_level !== initial.risk_level) {
    patch.risk_level = draft.risk_level === '' ? null : draft.risk_level;
  }

  return patch;
}

export function basicInfoDirty(initial: BasicInfoDraft, draft: BasicInfoDraft): boolean {
  return Object.keys(diffBasicInfo(initial, draft)).length > 0;
}

export function classifyMutationResponse(
  status: number,
  body: Record<string, unknown> | null | undefined,
): EditorMutationErrorInfo {
  const code = typeof body?.code === 'string' ? body.code : '';
  if (status === 409 && code === 'VERSION_CONFLICT') {
    return {
      state: 'conflict',
      message: '此复盘已被其他人更新，请重新加载最新数据后再继续编辑。',
    };
  }
  if (status === 409 && code === 'DRAFT_ONLY') {
    return {
      state: 'non_editable',
      message: '当前复盘已不是草稿状态，无法继续编辑。',
    };
  }
  if (status === 409 && code === 'TYPE_MISMATCH') {
    return {
      state: 'reload_required',
      message: '专项复盘内容已建立，复盘类型不能再修改。请重新加载最新数据。',
    };
  }
  if (status === 403) {
    return {
      state: 'forbidden',
      message: '你没有编辑此复盘的权限。',
    };
  }
  if (status === 400) {
    return {
      state: 'validation',
      message: '请检查填写内容后重试。',
    };
  }
  return {
    state: 'error',
    message: '保存失败，请稍后重试。',
  };
}

export type EditorDetailLoadStatus =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'GENERIC_LOAD_ERROR';

export function classifyEditorDetailLoadStatus(status: number): EditorDetailLoadStatus {
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  return 'GENERIC_LOAD_ERROR';
}

export function extractMutationVersion(body: any): number | null {
  const version = body?.data?.version ?? body?.version;
  return typeof version === 'number' && Number.isInteger(version) ? version : null;
}
