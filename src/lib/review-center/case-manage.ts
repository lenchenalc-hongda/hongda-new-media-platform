import type {
  CaseAdminDetail,
  CaseMutationResult,
} from './case-schemas';

export interface CaseEditorDraft {
  title: string;
  summary: string;
  lessonSummary: string;
  preventionSummary: string;
  applicabilityNotes: string;
}

export interface CaseEditorBaseline {
  title: string;
  summary: string | null;
  lessonSummary: string | null;
  preventionSummary: string | null;
  applicabilityNotes: string | null;
}

export type CaseEditorField = keyof CaseEditorBaseline;

export interface CaseEditorFieldErrors {
  titleError: string | null;
  fieldErrors: Partial<Record<CaseEditorField, string>>;
}

export interface CasePatchResult {
  patch: Partial<Record<CaseEditorField, string | null>>;
  dirty: boolean;
  errors: CaseEditorFieldErrors;
}

export const CASE_EDITOR_FIELD_LIMITS: Record<Exclude<CaseEditorField, 'title'>, number> = {
  summary: 5000,
  lessonSummary: 5000,
  preventionSummary: 5000,
  applicabilityNotes: 2000,
};

export const CASE_EDITOR_FIELD_LABELS: Record<Exclude<CaseEditorField, 'title'>, string> = {
  summary: '摘要',
  lessonSummary: '核心教训',
  preventionSummary: '预防措施',
  applicabilityNotes: '适用说明',
};

export function normalizeCaseEditorValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function normalizeCaseEditorDraft(draft: CaseEditorDraft): CaseEditorBaseline {
  return {
    title: draft.title.trim(),
    summary: normalizeCaseEditorValue(draft.summary),
    lessonSummary: normalizeCaseEditorValue(draft.lessonSummary),
    preventionSummary: normalizeCaseEditorValue(draft.preventionSummary),
    applicabilityNotes: normalizeCaseEditorValue(draft.applicabilityNotes),
  };
}

export function editorBaselineFromAdmin(admin: CaseAdminDetail): CaseEditorBaseline {
  return {
    title: admin.title,
    summary: admin.summary,
    lessonSummary: admin.lessonSummary,
    preventionSummary: admin.preventionSummary,
    applicabilityNotes: admin.applicabilityNotes,
  };
}

export function editorDraftFromBaseline(baseline: CaseEditorBaseline): CaseEditorDraft {
  return {
    title: baseline.title,
    summary: baseline.summary ?? '',
    lessonSummary: baseline.lessonSummary ?? '',
    preventionSummary: baseline.preventionSummary ?? '',
    applicabilityNotes: baseline.applicabilityNotes ?? '',
  };
}

export function buildCasePatch(
  baseline: CaseEditorBaseline,
  draft: CaseEditorDraft,
): CasePatchResult {
  const canonical = normalizeCaseEditorDraft(draft);
  const fieldErrors: Partial<Record<CaseEditorField, string>> = {};
  let titleError: string | null = null;

  if (!canonical.title) {
    titleError = '请输入案例标题。';
  } else if (canonical.title.length > 200) {
    titleError = '案例标题不能超过 200 字。';
  }

  const nullableField = (
    field: Exclude<CaseEditorField, 'title'>,
    value: string | null,
  ): void => {
    if (value !== null && value.length > CASE_EDITOR_FIELD_LIMITS[field]) {
      fieldErrors[field] = `${CASE_EDITOR_FIELD_LABELS[field]}不能超过 ${CASE_EDITOR_FIELD_LIMITS[field]} 字。`;
    }
  };

  nullableField('summary', canonical.summary);
  nullableField('lessonSummary', canonical.lessonSummary);
  nullableField('preventionSummary', canonical.preventionSummary);
  nullableField('applicabilityNotes', canonical.applicabilityNotes);

  const patch: Partial<Record<CaseEditorField, string | null>> = {};
  if (canonical.title !== baseline.title) patch.title = canonical.title;
  if (canonical.summary !== baseline.summary) patch.summary = canonical.summary;
  if (canonical.lessonSummary !== baseline.lessonSummary) patch.lessonSummary = canonical.lessonSummary;
  if (canonical.preventionSummary !== baseline.preventionSummary) patch.preventionSummary = canonical.preventionSummary;
  if (canonical.applicabilityNotes !== baseline.applicabilityNotes) patch.applicabilityNotes = canonical.applicabilityNotes;

  return {
    patch,
    dirty: Object.keys(patch).length > 0,
    errors: {
      titleError,
      fieldErrors,
    },
  };
}

export function caseEditorDirty(
  baseline: CaseEditorBaseline,
  draft: CaseEditorDraft,
): boolean {
  return buildCasePatch(baseline, draft).dirty;
}

export function canSaveCaseStatus(status: string | null | undefined): boolean {
  return status === 'DRAFT';
}

export function canPublishCaseStatus(status: string | null | undefined): boolean {
  return status === 'DRAFT';
}

export function canHideCaseStatus(status: string | null | undefined): boolean {
  return status === 'DRAFT' || status === 'PUBLISHED';
}

export function canReopenCaseStatus(status: string | null | undefined): boolean {
  return status === 'HIDDEN';
}

const CURATION_MISSING_WHITELIST = new Set([
  'TITLE',
  'SUMMARY',
  'LESSON_SUMMARY',
  'PREVENTION_SUMMARY',
]);

export function parseMissingFields(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && CURATION_MISSING_WHITELIST.has(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

const METADATA_MISSING_WHITELIST = new Set([
  'PROBLEM_DOMAIN',
  'PROBLEM_SYMPTOM',
  'PRIMARY_MATERIAL',
  'PROCESS',
  'MATERIAL_OTHER_TEXT',
  'PROCESS_OTHER_TEXT',
  'PROBLEM_DOMAIN_OTHER_TEXT',
  'PROBLEM_SYMPTOM_OTHER_TEXT',
]);

export function parseMissingDimensions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && METADATA_MISSING_WHITELIST.has(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

export function normalizeHideReason(
  value: string,
): { ok: true; reason: string } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: '请输入隐藏原因。' };
  if (trimmed.length > 1000) return { ok: false, error: '隐藏原因不能超过 1000 字。' };
  return { ok: true, reason: trimmed };
}

export function confirmDiscardIfNeeded(
  dirty: boolean,
  confirm: (message: string) => boolean,
): boolean {
  if (!dirty) return true;
  return confirm('刷新后当前未保存修改将被覆盖，是否继续？');
}

export function applyMutationResultToAdminState(
  result: CaseMutationResult,
  admin: CaseAdminDetail,
): Pick<CaseAdminDetail, 'version' | 'status' | 'caseSourceReviewVersion'> {
  return {
    version: result.version,
    status: result.status,
    caseSourceReviewVersion: result.sourceReviewVersion,
  };
}

export interface CaseCurrentMetadataGroup {
  materials: Array<{ code: string; label: string; isPrimary: boolean }>;
  processes: Array<{ code: string; label: string }>;
  problemDomains: Array<{ code: string; label: string }>;
  problemSymptoms: Array<{ code: string; label: string }>;
}

export function groupCurrentSourceMetadata(
  items: CaseAdminDetail['currentSourceMetadata'],
): CaseCurrentMetadataGroup {
  const group = {
    materials: [],
    processes: [],
    problemDomains: [],
    problemSymptoms: [],
  } as CaseCurrentMetadataGroup;

  for (const item of items) {
    if (item.metadataType === 'MATERIAL') {
      group.materials.push({ code: item.code, label: item.label, isPrimary: item.isPrimary });
    } else if (item.metadataType === 'PROCESS') {
      group.processes.push({ code: item.code, label: item.label });
    } else if (item.metadataType === 'PROBLEM_DOMAIN') {
      group.problemDomains.push({ code: item.code, label: item.label });
    } else if (item.metadataType === 'PROBLEM_SYMPTOM') {
      group.problemSymptoms.push({ code: item.code, label: item.label });
    }
  }

  return group;
}
