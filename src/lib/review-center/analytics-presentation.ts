import type {
  AnalyticsRange,
  AnalyticsSnapshot,
} from './analytics';

export const ANALYTICS_RANGE_LABELS: Record<AnalyticsRange, string> = {
  LAST_6_MONTHS: '近6个月',
  LAST_12_MONTHS: '近12个月',
  THIS_YEAR: '本年',
};

export function canViewManagementAnalytics(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

export function formatAnalyticsRangeLabel(
  range: string | null | undefined,
): string {
  return typeof range === 'string' && range in ANALYTICS_RANGE_LABELS
    ? ANALYTICS_RANGE_LABELS[range as AnalyticsRange]
    : '未知';
}

export function formatAnalyticsMonthLabel(period: string | null | undefined): string {
  if (typeof period !== 'string') return '未知';
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match) return '未知';
  return `${match[1]}年${Number(match[2])}月`;
}

export function formatAnalyticsDays(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}天`;
}

export function analyticsBarPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

export function getReviewFlowModuleCopy() {
  return {
    title: '复盘流转趋势',
    description: '按月比较新建复盘与当月至少关闭一次的复盘数量',
    createdLabel: '新建复盘',
    closedLabel: '关闭复盘',
    closeDefinition: '“关闭复盘”为该月内至少关闭过一次的复盘，按复盘去重。',
    crossBucketNote: '月度值按月去重；期间总数按整个区间再次去重。',
  };
}

export function getActionFlowModuleCopy() {
  return {
    title: '改善行动趋势',
    description: '按月比较新建改善行动和最终验证通过的改善行动数量',
    createdLabel: '新建改善行动',
    verifiedLabel: '验证通过改善行动',
    verifiedDefinition: '验证通过改善行动为最终状态已验证且验证时间在当月的改善行动。',
  };
}

export function getCycleModuleCopy() {
  return {
    title: '验证周期',
    description: '改善行动从创建到最终验证通过所经历的实际时间中位数',
    medianLabel: '月度验证周期中位数',
    elapsedDefinition: '按实际经过时间计算，24小时=1天。',
    nullSampleText: '暂无有效样本',
  };
}

export function getAnalyticsDataCompletenessCopy(): string {
  return '关闭与重新打开趋势在系统启用生命周期事件记录后更完整，早期历史数据可能不完整。';
}

export function formatAnalyticsCycleSampleCount(count: number): string {
  return `有效样本 ${count} 项`;
}

export function formatAnalyticsInvalidCycleDisclosure(count: number): string {
  return `有 ${count} 条历史记录因时间数据异常未纳入周期计算。`;
}

export function hasAnalyticsData(snapshot: AnalyticsSnapshot): boolean {
  const summary = snapshot.summary;
  return summary.reviewsCreatedTotal > 0
    || summary.reviewsClosedUniqueInRange > 0
    || summary.reviewsReopenedUniqueInRange > 0
    || summary.actionsCreatedTotal > 0
    || summary.actionsVerifiedTotal > 0
    || summary.actionsCancelledTotal > 0
    || summary.verificationCycleSampleCount > 0;
}
