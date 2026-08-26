import type {
  DashboardAttentionItem,
  DashboardAttentionReason,
  DashboardRange,
  DashboardReviewStatus,
  DashboardRiskLevel,
} from './dashboard';

export const DASHBOARD_RANGE_LABELS: Record<DashboardRange, string> = {
  THIS_MONTH: '本月',
  LAST_30_DAYS: '近30天',
  ALL: '全部',
};

export const DASHBOARD_REVIEW_STATUS_LABELS: Record<DashboardReviewStatus, string> = {
  draft: '草稿',
  submitted: '已提交',
  in_review: '审核中（未启用）',
  action_required: '待改善（未启用）',
  verifying: '验证中（未启用）',
  closed: '已关闭',
  archived: '已归档（未启用）',
  rejected: '已驳回（未启用）',
  cancelled: '已取消（未启用）',
  UNKNOWN: '未知',
};

export const DASHBOARD_RISK_LABELS: Record<DashboardRiskLevel, string> = {
  RED: '红色风险',
  YELLOW: '黄色风险',
  GREEN: '绿色风险',
  UNSET: '未设置',
  UNKNOWN: '未知',
};

export const DASHBOARD_TYPE_LABELS: Record<DashboardReviewTypeLabelKey, string> = {
  A: 'A类',
  B: 'B类',
  C: 'C类',
  UNKNOWN: '未知',
};

type DashboardReviewTypeLabelKey = 'A' | 'B' | 'C' | 'UNKNOWN';

export const DASHBOARD_ATTENTION_REASON_LABELS: Record<DashboardAttentionReason, string> = {
  OVERDUE_ACTION: '有逾期行动',
  HIGH_RISK: '红色风险',
  PENDING_VERIFICATION: '有待验证行动',
  SUBMITTED_WITH_OPEN_ACTION: '已提交但行动未闭环',
};

const DASHBOARD_METRIC_DEFINITIONS = {
  openReviews: '当前状态为草稿或已提交的复盘',
  highRiskReviews: '当前开放且风险等级为红色的复盘',
  openActions: '待开始、进行中或待验证的改善行动',
  overdueActions: '已过截止日期且尚未验证或取消的改善行动',
  pendingVerificationActions: '已提交完成、等待验证的改善行动',
  reviewsCreated: '期间内新建的复盘',
  reviewsClosedUnique: '期间内至少关闭过一次的复盘，按复盘去重',
  actionsVerified: '状态为已验证且验证时间在期间内的改善行动',
} as const;

export type DashboardMetricKey = keyof typeof DASHBOARD_METRIC_DEFINITIONS;

export function canViewManagementDashboard(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

export function formatDashboardRangeLabel(
  range: string | null | undefined,
): string {
  return typeof range === 'string' && range in DASHBOARD_RANGE_LABELS
    ? DASHBOARD_RANGE_LABELS[range as DashboardRange]
    : '未知';
}

export function formatDashboardStatusLabel(
  status: string | null | undefined,
): string {
  return typeof status === 'string' && status in DASHBOARD_REVIEW_STATUS_LABELS
    ? DASHBOARD_REVIEW_STATUS_LABELS[status as DashboardReviewStatus]
    : '未知';
}

export function formatDashboardRiskLabel(
  risk: string | null | undefined,
): string {
  if (risk === null || risk === undefined) return '未设置';
  return typeof risk === 'string' && risk in DASHBOARD_RISK_LABELS
    ? DASHBOARD_RISK_LABELS[risk as DashboardRiskLevel]
    : '未知';
}

export function formatDashboardTypeLabel(
  reviewType: string | null | undefined,
): string {
  return typeof reviewType === 'string' && reviewType in DASHBOARD_TYPE_LABELS
    ? DASHBOARD_TYPE_LABELS[reviewType as DashboardReviewTypeLabelKey]
    : '未知';
}

export function formatDashboardAttentionReasonLabel(
  reason: string | null | undefined,
): string {
  return typeof reason === 'string' && reason in DASHBOARD_ATTENTION_REASON_LABELS
    ? DASHBOARD_ATTENTION_REASON_LABELS[reason as DashboardAttentionReason]
    : '未知';
}

export function getPeriodKpiLabels(range: DashboardRange): {
  created: string;
  closed: string;
  verified: string;
} {
  if (range === 'THIS_MONTH') {
    return {
      created: '本月新建复盘',
      closed: '本月关闭复盘',
      verified: '本月已验证改善行动',
    };
  }
  if (range === 'LAST_30_DAYS') {
    return {
      created: '近30天新建复盘',
      closed: '近30天关闭复盘',
      verified: '近30天已验证改善行动',
    };
  }
  return {
    created: '累计新建复盘',
    closed: '累计关闭过的复盘',
    verified: '累计已验证改善行动',
  };
}

export function getDashboardMetricDefinition(key: DashboardMetricKey): string {
  return DASHBOARD_METRIC_DEFINITIONS[key];
}

export function getAttentionCountLabels(
  item: Pick<
    DashboardAttentionItem,
    'openActionCount' | 'overdueActionCount' | 'pendingVerificationActionCount'
  >,
): string[] {
  const labels: string[] = [];
  if (item.openActionCount > 0) labels.push(`未闭环 ${item.openActionCount}`);
  if (item.overdueActionCount > 0) labels.push(`逾期 ${item.overdueActionCount}`);
  if (item.pendingVerificationActionCount > 0) {
    labels.push(`待验证 ${item.pendingVerificationActionCount}`);
  }
  return labels;
}

export function formatDashboardOwnerDisplayName(
  ownerDisplayName: string | null | undefined,
): string {
  return typeof ownerDisplayName === 'string' && ownerDisplayName.trim() !== ''
    ? ownerDisplayName
    : '—';
}

export function formatDashboardRefreshTime(
  value: Date | null | undefined,
): string {
  if (!value || Number.isNaN(value.getTime())) return '';
  const time = value.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `最后刷新 ${time}`;
}

export function dashboardDistributionPercentage(
  count: number,
  total: number,
): number {
  if (!Number.isFinite(count) || !Number.isFinite(total) || count <= 0 || total <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((count / total) * 100)));
}
