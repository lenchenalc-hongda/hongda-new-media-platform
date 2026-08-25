import type { ReviewDetail, ReviewType } from './types';
import {
  classifyMutationResponse,
  type BasicInfoDraft,
  type EditorMutationErrorInfo,
} from './editor';

const A_ONLY_FIELDS = [
  'pre_production_stage',
  'problem_found_stage',
  'order_loss_reason',
  'customer_trust_impact',
  'customer_notified',
] as const;

const B_ONLY_FIELDS = [
  'abnormal_phase',
  'abnormal_phenomenon',
  'defect_rate',
  'defect_items',
  'delivery_impact',
  'onsite_records',
] as const;

const C_ONLY_FIELDS = [
  'frontend_stage',
  'production_stage',
  'root_cause_summary',
  'responsibility',
  'improvement_advice',
] as const;

export type TypeDetailFieldKey =
  | typeof A_ONLY_FIELDS[number]
  | typeof B_ONLY_FIELDS[number]
  | typeof C_ONLY_FIELDS[number];

const TEXT_FIELDS: TypeDetailFieldKey[] = [
  'pre_production_stage',
  'problem_found_stage',
  'order_loss_reason',
  'customer_trust_impact',
  'abnormal_phase',
  'abnormal_phenomenon',
  'defect_items',
  'delivery_impact',
  'onsite_records',
  'frontend_stage',
  'production_stage',
  'root_cause_summary',
  'responsibility',
  'improvement_advice',
];

export interface AdditionalNoteRow {
  key: string;
  value: string;
}

export interface TypeDetailsDraft {
  noteRows: AdditionalNoteRow[];
  preservedNotes: Record<string, unknown>;
  pre_production_stage: string;
  problem_found_stage: string;
  order_loss_reason: string;
  customer_trust_impact: string;
  customer_notified: '' | 'true' | 'false';
  abnormal_phase: string;
  abnormal_phenomenon: string;
  defect_rate: string;
  defect_items: string;
  delivery_impact: string;
  onsite_records: string;
  frontend_stage: string;
  production_stage: string;
  root_cause_summary: string;
  responsibility: string;
  improvement_advice: string;
}

export const TYPE_DETAIL_LABELS: Record<TypeDetailFieldKey, string> = {
  pre_production_stage: '量产前阶段',
  problem_found_stage: '问题发现阶段',
  order_loss_reason: '订单损失原因',
  customer_trust_impact: '客户信任影响',
  customer_notified: '是否已通知客户',
  abnormal_phase: '异常阶段',
  abnormal_phenomenon: '异常现象',
  defect_rate: '缺陷率',
  defect_items: '缺陷项目',
  delivery_impact: '交付影响',
  onsite_records: '现场记录',
  frontend_stage: '前端阶段',
  production_stage: '生产阶段',
  root_cause_summary: '根因总结',
  responsibility: '责任归属',
  improvement_advice: '改善建议',
};

export const TYPE_DETAIL_GROUPS: Record<ReviewType, Array<{ title: string; fields: TypeDetailFieldKey[] }>> = {
  A: [
    { title: '前期 / 订单 / 客户影响', fields: [...A_ONLY_FIELDS] },
  ],
  B: [
    { title: '异常 / 品质 / 交付', fields: [...B_ONLY_FIELDS] },
  ],
  C: [
    { title: '前端阶段信息', fields: ['frontend_stage'] },
    { title: '生产异常信息', fields: [...A_ONLY_FIELDS, ...B_ONLY_FIELDS, 'production_stage'] },
    { title: '综合根因与改善', fields: ['root_cause_summary', 'responsibility', 'improvement_advice'] },
  ],
};

export function getVisibleTypeDetailFields(type: ReviewType): TypeDetailFieldKey[] {
  if (type === 'A') return [...A_ONLY_FIELDS];
  if (type === 'B') return [...B_ONLY_FIELDS];
  return [...A_ONLY_FIELDS, ...B_ONLY_FIELDS, ...C_ONLY_FIELDS];
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normalizeTypeDetails(
  details: Record<string, unknown> | null | undefined,
): TypeDetailsDraft {
  const source = details && typeof details === 'object' && !Array.isArray(details) ? details : {};
  const rawNotes =
    source.additional_notes
    && typeof source.additional_notes === 'object'
    && !Array.isArray(source.additional_notes)
      ? source.additional_notes as Record<string, unknown>
      : {};
  const noteRows: AdditionalNoteRow[] = [];
  const preservedNotes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawNotes)) {
    if (typeof value === 'string') {
      noteRows.push({ key, value });
    } else {
      preservedNotes[key] = value;
    }
  }

  return {
    noteRows,
    preservedNotes,
    pre_production_stage: textValue(source.pre_production_stage),
    problem_found_stage: textValue(source.problem_found_stage),
    order_loss_reason: textValue(source.order_loss_reason),
    customer_trust_impact: textValue(source.customer_trust_impact),
    customer_notified:
      source.customer_notified === true ? 'true'
        : source.customer_notified === false ? 'false'
          : '',
    abnormal_phase: textValue(source.abnormal_phase),
    abnormal_phenomenon: textValue(source.abnormal_phenomenon),
    defect_rate:
      typeof source.defect_rate === 'number' && Number.isFinite(source.defect_rate)
        ? String(source.defect_rate)
        : '',
    defect_items: textValue(source.defect_items),
    delivery_impact: textValue(source.delivery_impact),
    onsite_records: textValue(source.onsite_records),
    frontend_stage: textValue(source.frontend_stage),
    production_stage: textValue(source.production_stage),
    root_cause_summary: textValue(source.root_cause_summary),
    responsibility: textValue(source.responsibility),
    improvement_advice: textValue(source.improvement_advice),
  };
}

export function validateNoteRows(
  rows: AdditionalNoteRow[],
  preservedNotes: Record<string, unknown> = {},
): string | null {
  const seen = new Set<string>(Object.keys(preservedNotes).map(key => key.trim()));
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) return '补充说明的键不能为空';
    if (seen.has(key)) return '补充说明存在重复键';
    seen.add(key);
  }
  return null;
}

export function notesToObject(rows: AdditionalNoteRow[]): Record<string, string> | null {
  const error = validateNoteRows(rows);
  if (error) return null;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key.trim()] = row.value;
  }
  return result;
}

export function buildAdditionalNotes(
  rows: AdditionalNoteRow[],
  preservedNotes: Record<string, unknown>,
): Record<string, unknown> | null {
  if (validateNoteRows(rows, preservedNotes)) return null;
  const notes = notesToObject(rows);
  if (!notes) return null;
  return { ...notes, ...preservedNotes };
}

export interface TypeDetailsDiffResult {
  patch: Record<string, unknown>;
  valid: boolean;
  error?: string;
}

export function diffTypeDetails(
  initial: TypeDetailsDraft,
  draft: TypeDetailsDraft,
): TypeDetailsDiffResult {
  const patch: Record<string, unknown> = {};

  for (const key of TEXT_FIELDS) {
    const initialValue = initial[key].trim();
    const draftValue = draft[key].trim();
    if (initialValue !== draftValue) {
      patch[key] = draftValue === '' ? null : draftValue;
    }
  }

  if (initial.customer_notified !== draft.customer_notified) {
    patch.customer_notified =
      draft.customer_notified === '' ? null : draft.customer_notified === 'true';
  }

  if (initial.defect_rate !== draft.defect_rate) {
    const raw = draft.defect_rate.trim();
    if (raw === '') {
      patch.defect_rate = null;
    } else {
      const numberValue = Number(raw);
      if (!Number.isFinite(numberValue)) {
        return { patch: {}, valid: false, error: '缺陷率格式无效' };
      }
      patch.defect_rate = numberValue;
    }
  }

  const noteError = validateNoteRows(draft.noteRows, draft.preservedNotes);
  if (noteError) {
    return { patch: {}, valid: false, error: noteError };
  }
  const initialNotes = buildAdditionalNotes(initial.noteRows, initial.preservedNotes);
  const draftNotes = buildAdditionalNotes(draft.noteRows, draft.preservedNotes);
  if (initialNotes === null || draftNotes === null) {
    return { patch: {}, valid: false, error: '补充说明存在重复键' };
  }
  if (JSON.stringify(initialNotes) !== JSON.stringify(draftNotes)) {
    patch.additional_notes = draftNotes;
  }

  return { patch, valid: true };
}

export function isTypeDetailsDirty(initial: TypeDetailsDraft, draft: TypeDetailsDraft): boolean {
  const result = diffTypeDetails(initial, draft);
  return result.valid && Object.keys(result.patch).length > 0;
}

export function typeDetailsSaveBlockedByBasic(input: {
  basicInfoDirty: boolean;
  persistedReviewType: ReviewType;
  draftReviewType: ReviewType;
}): boolean {
  return input.basicInfoDirty && input.draftReviewType !== input.persistedReviewType;
}

export function shouldBlockReviewTypeSaveForDirtyDetails(input: {
  persistedReviewType: ReviewType;
  draftReviewType: ReviewType;
  typeDetailsDirty: boolean;
}): boolean {
  return input.typeDetailsDirty && input.draftReviewType !== input.persistedReviewType;
}

export function getReviewTypeChangeBlockReason(input: {
  persistedReviewType: ReviewType;
  draftReviewType: ReviewType;
  typeDetailsDirty: boolean;
}): string | null {
  if (!shouldBlockReviewTypeSaveForDirtyDetails(input)) return null;
  return '你还有未保存的专项复盘内容。切换复盘类型前，请先清空未保存的专项内容，或恢复原来的复盘类型。';
}

export function extractTypeDetailsSaveResult(body: any): {
  version: number;
  typeDetails: Record<string, unknown> | null;
} | null {
  const data = body?.data;
  if (!data || typeof data !== 'object' || typeof data.version !== 'number') return null;
  if (!Object.prototype.hasOwnProperty.call(data, 'type_details')) return null;
  const typeDetails =
    data.type_details && typeof data.type_details === 'object' && !Array.isArray(data.type_details)
      ? data.type_details as Record<string, unknown>
      : null;
  return { version: data.version, typeDetails };
}

export function rebuildTypeDetailsBaseline(
  typeDetails: Record<string, unknown> | null,
): { initial: TypeDetailsDraft; draft: TypeDetailsDraft } {
  const next = normalizeTypeDetails(typeDetails);
  return { initial: next, draft: next };
}

export const TYPE_DETAILS_FALLBACK_SYNC_FAILURE_MESSAGE =
  '专项内容已保存，但最新状态同步失败，请重新加载页面后继续操作。';

export interface TypeDetailsFallbackPlan {
  version: number;
  detail: ReviewDetail;
  initialTypeDetails: TypeDetailsDraft;
  draftTypeDetails: TypeDetailsDraft;
  basicInitial: BasicInfoDraft;
  basicDraft: BasicInfoDraft;
}

export function planTypeDetailsFallbackSync(
  latestDetail: ReviewDetail,
  basicInitial: BasicInfoDraft,
  basicDraft: BasicInfoDraft,
): TypeDetailsFallbackPlan {
  const nextType = normalizeTypeDetails(latestDetail.type_details);
  return {
    version: latestDetail.version,
    detail: latestDetail,
    initialTypeDetails: nextType,
    draftTypeDetails: nextType,
    basicInitial,
    basicDraft,
  };
}

export function classifyTypeDetailsMutationResponse(
  status: number,
  body: Record<string, unknown> | null | undefined,
): EditorMutationErrorInfo {
  const base = classifyMutationResponse(status, body);
  if (status === 409 && body?.code === 'TYPE_MISMATCH') {
    return {
      state: 'reload_required',
      message: '复盘类型或专项内容已发生变化，请重新加载最新数据。',
    };
  }
  if (status === 400) {
    return {
      state: 'validation',
      message: '请检查专项复盘内容后重试。',
    };
  }
  if (status === 500) {
    return {
      state: 'error',
      message: '专项内容保存失败，请稍后重试。',
    };
  }
  return base;
}
