import type { MetricValue } from './domain';

export type DerivedReportPeriod = 'daily' | 'weekly';

interface DerivedReportListItemBase {
  id: string;
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

export interface DailyReportListItem extends DerivedReportListItemBase {
  periodType: 'daily';
}

export interface WeeklyReportListItem extends DerivedReportListItemBase {
  periodType: 'weekly';
}

export type DerivedReportListItem =
  | DailyReportListItem
  | WeeklyReportListItem;

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

export const WEEKLY_REPORT_METRIC_LABELS: Record<string, string> = {
  ...DAILY_REPORT_METRIC_LABELS,
  customerCommitmentOverdueEndCount: '周末仍逾期承诺',
};

export const WEEKLY_REPORT_METRIC_ORDER = [
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

export const SHANGHAI_BUSINESS_TIME_ZONE = 'Asia/Shanghai';
export const WEEK_STARTS_ON = 'monday' as const;

export function knownMetricValue(
  metrics: Record<string, MetricValue<number>>,
  key: string,
): number | null {
  const metric = metrics[key];
  return metric?.state === 'known' ? metric.value : null;
}

export function reportMetricOrder(
  periodType: DerivedReportPeriod,
): readonly string[] {
  return periodType === 'weekly'
    ? WEEKLY_REPORT_METRIC_ORDER
    : DAILY_REPORT_METRIC_ORDER;
}

export function reportMetricLabels(
  periodType: DerivedReportPeriod,
): Record<string, string> {
  return periodType === 'weekly'
    ? WEEKLY_REPORT_METRIC_LABELS
    : DAILY_REPORT_METRIC_LABELS;
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
}

function addUtcDays(value: string, days: number): string {
  const date = new Date(value + 'T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function enumerateBusinessDates(
  periodStart: string,
  periodEnd: string,
): string[] {
  if (!validIsoDate(periodStart) || !validIsoDate(periodEnd)) return [];
  if (periodStart > periodEnd) return [];

  const dates: string[] = [];
  let current = periodStart;
  while (current <= periodEnd && dates.length < 370) {
    dates.push(current);
    current = addUtcDays(current, 1);
  }
  return dates;
}

export function weeklyPeriodForBusinessDate(
  businessDate: string,
): { periodStart: string; periodEnd: string } | null {
  if (!validIsoDate(businessDate)) return null;

  const date = new Date(businessDate + 'T00:00:00.000Z');
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  const periodStart = addUtcDays(businessDate, -mondayOffset);
  return {
    periodStart,
    periodEnd: addUtcDays(periodStart, 6),
  };
}

export interface WeeklyDailySnapshot {
  reportId: string;
  periodStart: string;
  status: 'draft' | 'submitted';
  revisionNo: number;
  version: number;
  deterministicMetrics: Record<string, MetricValue<number>>;
  unknowns: unknown[];
  sourceEventSeq: number | null;
  sourceAuditSeq: number | null;
}

export interface WeeklyReportCoverage {
  type: 'WEEKLY_DAILY_COVERAGE';
  periodStart: string;
  periodEnd: string;
  coverageThrough: string;
  weekStartsOn: typeof WEEK_STARTS_ON;
  timezone: typeof SHANGHAI_BUSINESS_TIME_ZONE;
  expectedDailyCount: number;
  coveredDailyCount: number;
  missingDates: string[];
  complete: boolean;
  snapshots: Array<{
    reportId: string;
    businessDate: string;
    status: 'draft' | 'submitted';
    revisionNo: number;
    version: number;
    sourceEventSeq: number | null;
    sourceAuditSeq: number | null;
  }>;
}

export interface WeeklyReportAggregation {
  deterministicMetrics: Record<string, MetricValue<number>>;
  unknowns: unknown[];
  coverage: WeeklyReportCoverage;
  sourceEventSeq: number | null;
  sourceAuditSeq: number | null;
}

const SUMMED_WEEKLY_METRICS = new Set<string>([
  'meaningfulProgressCount',
  'stageLifecycleWaitingChangeCount',
  'projectCreatedCount',
  'projectWonCount',
  'projectLostCount',
  'nextActionCreatedCount',
  'nextActionCompletedCount',
  'nextActionRescheduledCount',
  'customerCommitmentDueCount',
  'customerCommitmentCompletedCount',
  'internalCollaborationCompletedCount',
  'managementDecisionCompletedCount',
  'oldCustomerFollowUpCount',
  'quoteSentCount',
  'sampleSentCount',
  'customerCommercialConfirmedCount',
  'orderConfirmedCount',
]);

function unknownMetric(reason: string): MetricValue<number> {
  return { state: 'unknown', reason };
}

function maxNullable(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length > 0 ? Math.max(...known) : null;
}

export function aggregateWeeklyReport(
  input: {
    periodStart: string;
    periodEnd: string;
    coverageThrough: string;
    snapshots: WeeklyDailySnapshot[];
  },
): WeeklyReportAggregation {
  const expectedDates = enumerateBusinessDates(
    input.periodStart,
    input.coverageThrough,
  );
  const latestByDate = new Map<string, WeeklyDailySnapshot>();

  for (const snapshot of input.snapshots) {
    const current = latestByDate.get(snapshot.periodStart);
    if (
      !current
      || snapshot.revisionNo > current.revisionNo
      || (
        snapshot.revisionNo === current.revisionNo
        && snapshot.version > current.version
      )
    ) {
      latestByDate.set(snapshot.periodStart, snapshot);
    }
  }

  const snapshots = expectedDates
    .map(date => latestByDate.get(date))
    .filter((snapshot): snapshot is WeeklyDailySnapshot => snapshot !== undefined);
  const missingDates = expectedDates.filter(date => !latestByDate.has(date));
  const coverage: WeeklyReportCoverage = {
    type: 'WEEKLY_DAILY_COVERAGE',
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    coverageThrough: input.coverageThrough,
    weekStartsOn: WEEK_STARTS_ON,
    timezone: SHANGHAI_BUSINESS_TIME_ZONE,
    expectedDailyCount: expectedDates.length,
    coveredDailyCount: snapshots.length,
    missingDates,
    complete: missingDates.length === 0,
    snapshots: snapshots.map(snapshot => ({
      reportId: snapshot.reportId,
      businessDate: snapshot.periodStart,
      status: snapshot.status,
      revisionNo: snapshot.revisionNo,
      version: snapshot.version,
      sourceEventSeq: snapshot.sourceEventSeq,
      sourceAuditSeq: snapshot.sourceAuditSeq,
    })),
  };

  const deterministicMetrics: Record<string, MetricValue<number>> = {};
  const unknowns: unknown[] = [coverage];

  if (missingDates.length > 0) {
    unknowns.push({
      type: 'WEEKLY_DAILY_COVERAGE_GAP',
      dates: missingDates,
      reason: '缺少日报快照，缺失覆盖不会按 0 处理',
    });
  }

  for (const key of WEEKLY_REPORT_METRIC_ORDER) {
    if (expectedDates.length === 0) {
      deterministicMetrics[key] = unknownMetric(
        '本周没有可验证的日报覆盖，缺失覆盖不会按 0 处理',
      );
      continue;
    }

    if (missingDates.length > 0) {
      deterministicMetrics[key] = unknownMetric(
        `本周缺少 ${missingDates.length} 天日报快照，不能将缺失覆盖按 0 处理`,
      );
      continue;
    }

    const metricValues = snapshots.map(snapshot => snapshot.deterministicMetrics[key]);
    if (
      metricValues.some((metric: MetricValue<number> | undefined) =>
        !metric || metric.state !== 'known'
      )
    ) {
      const reasons = metricValues
        .filter((metric: MetricValue<number> | undefined) =>
          metric?.state === 'unknown'
        )
        .map(metric => metric && metric.state === 'unknown' ? metric.reason : '')
        .filter(Boolean);
      deterministicMetrics[key] = unknownMetric(
        reasons.length > 0
          ? Array.from(new Set(reasons)).join('；')
          : '日报快照未提供此指标，不能按 0 处理',
      );
      continue;
    }

    const values = metricValues.map(metric =>
      metric && metric.state === 'known' ? metric.value : 0
    );
    const value = key === 'customerCommitmentOverdueEndCount'
      ? Math.max(...values)
      : SUMMED_WEEKLY_METRICS.has(key)
        ? values.reduce((sum, current) => sum + current, 0)
        : 0;
    deterministicMetrics[key] = { state: 'known', value };
  }

  for (const snapshot of snapshots) {
    for (const unknown of snapshot.unknowns) {
      if (
        unknown
        && typeof unknown === 'object'
        && !Array.isArray(unknown)
        && (unknown as Record<string, unknown>).type === 'WEEKLY_DAILY_COVERAGE'
      ) {
        continue;
      }
      unknowns.push({
        type: 'DAILY_SNAPSHOT_UNKNOWN',
        businessDate: snapshot.periodStart,
        reportId: snapshot.reportId,
        value: unknown,
      });
    }
  }

  unknowns.push({
    type: 'EXTERNAL_SOURCE_COVERAGE',
    sources: [
      {
        key: 'external_order_payment_receipt_quote',
        status: 'unknown',
        reason: '外部订单、回款、收据或报价权威源尚未集成；缺失不会被当作 0',
      },
    ],
  });

  return {
    deterministicMetrics,
    unknowns,
    coverage,
    sourceEventSeq: maxNullable(snapshots.map(snapshot => snapshot.sourceEventSeq)),
    sourceAuditSeq: maxNullable(snapshots.map(snapshot => snapshot.sourceAuditSeq)),
  };
}
