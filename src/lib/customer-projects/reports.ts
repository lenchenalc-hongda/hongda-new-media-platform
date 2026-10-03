import type { MetricValue } from './domain';

export interface DailyReportListItem {
  id: string;
  periodType: 'daily';
  periodStart: string;
  periodEnd: string;
  revisionNo: number;
  status: 'draft' | 'submitted';
  metricsSchemaVersion: number;
  deterministicMetrics: Record<string, MetricValue<number>>;
  narrative: string | null;
  unknowns: unknown[];
  sourceEventSeq: number | null;
  sourceAuditSeq: number | null;
  supersedesReportId: string | null;
  submittedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export const DAILY_REPORT_METRIC_LABELS: Record<string, string> = {
  meaningfulProgressCount: '有效推进',
  stageLifecycleWaitingChangeCount: '阶段 / 状态 / 等待变化',
  projectCreatedCount: '新建项目',
  projectWonCount: '项目成交',
  projectLostCount: '项目流失',
  nextActionCreatedCount: '新建下一步',
  nextActionCompletedCount: '完成下一步',
  nextActionRescheduledCount: '下一步改期',
  customerCommitmentDueCount: '客户承诺当日到期',
  customerCommitmentCompletedCount: '完成客户承诺',
  customerCommitmentOverdueEndCount: '日末仍逾期承诺',
  internalCollaborationCompletedCount: '完成内部协作',
  managementDecisionCompletedCount: '完成管理决策',
  oldCustomerFollowUpCount: '老客户回访',
  quoteSentCount: '正式报价已发送',
  sampleSentCount: '样品 / 打样已发送',
  customerCommercialConfirmedCount: '客户 / 商务确认',
  orderConfirmedCount: '人工确认订单',
};

export const DAILY_REPORT_METRIC_ORDER = [
  'meaningfulProgressCount',
  'stageLifecycleWaitingChangeCount',
  'nextActionCompletedCount',
  'nextActionCreatedCount',
  'nextActionRescheduledCount',
  'customerCommitmentDueCount',
  'customerCommitmentCompletedCount',
  'customerCommitmentOverdueEndCount',
  'oldCustomerFollowUpCount',
  'internalCollaborationCompletedCount',
  'managementDecisionCompletedCount',
  'quoteSentCount',
  'sampleSentCount',
  'customerCommercialConfirmedCount',
  'orderConfirmedCount',
  'projectCreatedCount',
  'projectWonCount',
  'projectLostCount',
] as const;

export function knownMetricValue(
  metrics: Record<string, MetricValue<number>>,
  key: string,
): number | null {
  const metric = metrics[key];
  return metric?.state === 'known' ? metric.value : null;
}
