import type { CaseAuditItem, CaseLibraryItem } from './case-schemas';
import { formatReviewDate, formatReviewDateTime } from './formatters';

export interface CaseMetadataDisplayGroup {
  code: string;
  label: string;
  primary?: boolean;
}

export interface CaseMetadataDisplay {
  materials: CaseMetadataDisplayGroup[];
  processes: CaseMetadataDisplayGroup[];
  problemDomains: CaseMetadataDisplayGroup[];
  problemSymptoms: CaseMetadataDisplayGroup[];
}

export function caseReviewTypeLabel(reviewType: string | null | undefined): string {
  if (reviewType === 'A' || reviewType === 'B' || reviewType === 'C') {
    return `${reviewType} 类`;
  }
  return typeof reviewType === 'string' && reviewType ? reviewType : '未知类型';
}

export function caseAuditActionLabel(action: CaseAuditItem['action'] | string | null | undefined): string {
  if (action === 'CASE_CREATED') return '创建案例';
  if (action === 'CASE_UPDATED') return '更新案例';
  if (action === 'CASE_PUBLISHED') return '发布案例';
  if (action === 'CASE_REPUBLISHED') return '再次发布';
  if (action === 'CASE_HIDDEN') return '隐藏案例';
  if (action === 'CASE_REOPENED') return '重新打开整理';
  return typeof action === 'string' && action ? action : '未知操作';
}

export function caseAuditVersionLabel(item: Pick<CaseAuditItem, 'versionBefore' | 'versionAfter'>): string {
  if (item.versionBefore === null) return `v${item.versionAfter}`;
  return `v${item.versionBefore} → v${item.versionAfter}`;
}

export function caseStatusLabel(status: string | null | undefined): string {
  if (status === 'DRAFT') return '草稿';
  if (status === 'PUBLISHED') return '已发布';
  if (status === 'HIDDEN') return '已隐藏';
  return typeof status === 'string' && status ? status : '未知状态';
}

export function canManageCaseRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

export function staleReasonLabel(reason: string | null | undefined): string {
  if (reason === 'SOURCE_NOT_CLOSED') return '来源复盘状态已变化';
  if (reason === 'SOURCE_VERSION_CHANGED') return '来源复盘内容已更新';
  return '来源复盘发生变化';
}

export function sourceReviewStatusLabel(status: string | null | undefined): string {
  if (status === 'closed') return '已关闭';
  if (status === 'draft') return '草稿';
  if (status === 'submitted') return '待确认';
  if (status === 'in_review') return '复盘中';
  if (status === 'action_required') return '待改善';
  if (status === 'verifying') return '验证中';
  if (status === 'rejected') return '已退回';
  if (status === 'cancelled') return '已取消';
  return typeof status === 'string' && status ? status : '未知状态';
}

export function curationMissingFieldLabel(code: string | null | undefined): string {
  if (code === 'TITLE') return '案例标题';
  if (code === 'SUMMARY') return '摘要';
  if (code === 'LESSON_SUMMARY') return '核心教训';
  if (code === 'PREVENTION_SUMMARY') return '预防措施';
  return '案例整理内容仍有缺失，请检查后重试';
}

export function metadataMissingDimensionLabel(code: string | null | undefined): string {
  if (code === 'PROBLEM_DOMAIN') return '问题环节';
  if (code === 'PROBLEM_SYMPTOM') return '问题现象';
  if (code === 'PRIMARY_MATERIAL') return '主要材质';
  if (code === 'PROCESS') return '工艺';
  if (code === 'MATERIAL_OTHER_TEXT') return '其他材质说明';
  if (code === 'PROCESS_OTHER_TEXT') return '其他工艺说明';
  if (code === 'PROBLEM_DOMAIN_OTHER_TEXT') return '其他问题环节说明';
  if (code === 'PROBLEM_SYMPTOM_OTHER_TEXT') return '其他问题现象说明';
  return '来源复盘分类信息仍不完整，请检查后重试';
}

export function caseRiskLabel(risk: string | null | undefined): string {
  if (risk === 'RED') return '高';
  if (risk === 'YELLOW') return '中';
  if (risk === 'GREEN') return '低';
  return risk ?? '未评级';
}

export function caseRiskBadgeClass(risk: string | null | undefined): string {
  if (risk === 'RED') return 'badge-red';
  if (risk === 'YELLOW') return 'badge-yellow';
  if (risk === 'GREEN') return 'badge-green';
  return 'badge-gray';
}

function otherLabel(code: string, label: string, otherText: string | null | undefined): string {
  return code === 'OTHER' && otherText ? `其他：${otherText}` : label;
}

export function buildCaseMetadataDisplay(metadata: CaseLibraryItem['metadata']): CaseMetadataDisplay {
  const materials = [...metadata.materials]
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.code.localeCompare(b.code))
    .map(item => ({
      code: item.code,
      label: otherLabel(item.code, item.label, metadata.materialOtherText),
      primary: item.isPrimary,
    }));

  const processes = metadata.processes.map(item => ({
    code: item.code,
    label: otherLabel(item.code, item.label, metadata.processOtherText),
  }));

  const problemDomains = metadata.problemDomains.map(item => ({
    code: item.code,
    label: otherLabel(item.code, item.label, metadata.problemDomainOtherText),
  }));

  const problemSymptoms = metadata.problemSymptoms.map(item => ({
    code: item.code,
    label: otherLabel(item.code, item.label, metadata.problemSymptomOtherText),
  }));

  return { materials, processes, problemDomains, problemSymptoms };
}

export function caseDateToIsoDate(value: string, endOfDay: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function formatCaseDate(value: string | null | undefined): string {
  return formatReviewDate(value);
}

export function formatCaseDateTime(value: string | null | undefined): string {
  return formatReviewDateTime(value);
}
