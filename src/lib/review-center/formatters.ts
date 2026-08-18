import type { ReviewStatus, RiskLevel } from './types';

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: '草稿',
  submitted: '已提交',
  in_review: '复盘中',
  action_required: '待改善',
  verifying: '验证中',
  closed: '已关闭',
  archived: '已归档',
  rejected: '已退回',
  cancelled: '已取消',
};

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  RED: '高',
  YELLOW: '中',
  GREEN: '低',
};

export function reviewStatusLabel(status: ReviewStatus): string {
  return REVIEW_STATUS_LABELS[status] ?? status;
}

export function riskLevelLabel(risk: RiskLevel | null): string {
  return risk ? (RISK_LEVEL_LABELS[risk] ?? risk) : '未评级';
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatReviewDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatReviewDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${formatReviewDate(value)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
