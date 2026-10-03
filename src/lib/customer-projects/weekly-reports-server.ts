// @server-only
// Weekly report drafts are derived from the subject's authoritative daily
// snapshots. Browser clients never receive a privileged Supabase client.

import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import type { CpcProfile } from './api';
import { derivedReportSnapshotSchema } from './schemas';
import {
  SHANGHAI_BUSINESS_TIME_ZONE,
  WEEK_STARTS_ON,
  aggregateWeeklyReport,
  weeklyPeriodForBusinessDate,
  type WeeklyDailySnapshot,
  type WeeklyReportListItem,
} from './reports';

const REPORT_SELECT = [
  'id',
  'org_id',
  'subject_profile_id',
  'period_type',
  'period_start',
  'period_end',
  'revision_no',
  'status',
  'metrics_schema_version',
  'deterministic_metrics',
  'narrative',
  'unknowns',
  'source_event_seq',
  'source_audit_seq',
  'supersedes_report_id',
  'created_by_profile_id',
  'submitted_by_profile_id',
  'submitted_at',
  'version',
  'created_at',
  'updated_at',
].join(',');

export class WeeklyReportServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WeeklyReportServiceError';
  }
}

function fail(
  status: number,
  code: string,
  message: string,
): never {
  throw new WeeklyReportServiceError(status, code, message);
}

function nowIso(): string {
  return new Date().toISOString();
}

function requestId(): string {
  return globalThis.crypto.randomUUID();
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
}

export function currentShanghaiBusinessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SHANGHAI_BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = new Map(parts.map(part => [part.type, part.value]));
  return values.get('year') + '-' + values.get('month') + '-' + values.get('day');
}

function toWeeklyReport(row: unknown): WeeklyReportListItem | null {
  const parsed = derivedReportSnapshotSchema.safeParse(row);
  if (!parsed.success || parsed.data.period_type !== 'weekly') return null;

  const report = parsed.data;
  return {
    id: report.id,
    periodType: 'weekly',
    periodStart: report.period_start,
    periodEnd: report.period_end,
    revisionNo: report.revision_no,
    status: report.status,
    metricsSchemaVersion: report.metrics_schema_version,
    deterministicMetrics: report.deterministic_metrics,
    narrative: report.narrative,
    unknowns: report.unknowns,
    sourceEventSeq: report.source_event_seq,
    sourceAuditSeq: report.source_audit_seq,
    supersedesReportId: report.supersedes_report_id,
    submittedAt: report.submitted_at,
    version: report.version,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
  };
}

export async function readOwnWeeklyReport(
  session: any,
  profile: CpcProfile,
  reportId: string,
): Promise<WeeklyReportListItem> {
  const result = await session
    .from('cpc_reports')
    .select(REPORT_SELECT)
    .eq('id', reportId)
    .eq('org_id', profile.orgId)
    .eq('subject_profile_id', profile.id)
    .eq('period_type', 'weekly')
    .maybeSingle();

  if (result.error) {
    fail(500, 'INTERNAL_ERROR', '周报读取失败，请稍后重试。');
  }
  const report = result.data ? toWeeklyReport(result.data) : null;
  if (!report) {
    fail(404, 'NOT_FOUND', '周报不存在或无权访问。');
  }
  return report;
}

async function loadDailySnapshots(
  session: any,
  profile: CpcProfile,
  periodStart: string,
  periodEnd: string,
): Promise<WeeklyDailySnapshot[]> {
  const result = await session
    .from('cpc_reports')
    .select(REPORT_SELECT)
    .eq('org_id', profile.orgId)
    .eq('subject_profile_id', profile.id)
    .eq('period_type', 'daily')
    .gte('period_start', periodStart)
    .lte('period_end', periodEnd)
    .order('period_start', { ascending: true })
    .order('revision_no', { ascending: false });

  if (result.error) {
    fail(500, 'INTERNAL_ERROR', '周报来源快照读取失败，请稍后重试。');
  }

  const latestByDate = new Map<string, WeeklyDailySnapshot>();
  for (const row of result.data ?? []) {
    const parsed = derivedReportSnapshotSchema.safeParse(row);
    if (
      !parsed.success
      || parsed.data.period_start !== parsed.data.period_end
      || parsed.data.period_start < periodStart
      || parsed.data.period_start > periodEnd
    ) {
      continue;
    }

    const snapshot: WeeklyDailySnapshot = {
      reportId: parsed.data.id,
      periodStart: parsed.data.period_start,
      status: parsed.data.status,
      revisionNo: parsed.data.revision_no,
      version: parsed.data.version,
      deterministicMetrics: parsed.data.deterministic_metrics,
      unknowns: parsed.data.unknowns,
      sourceEventSeq: parsed.data.source_event_seq,
      sourceAuditSeq: parsed.data.source_audit_seq,
    };
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

  return Array.from(latestByDate.values());
}

async function writeAudit(
  admin: any,
  input: {
    orgId: string;
    entityId: string;
    action: string;
    actorProfileId: string;
    beforeValues: Record<string, unknown> | null;
    afterValues: Record<string, unknown> | null;
    metadata: Record<string, unknown>;
    reason?: string | null;
  },
): Promise<void> {
  const result = await admin
    .from('cpc_audit_log')
    .insert({
      org_id: input.orgId,
      entity_type: 'REPORT',
      entity_id: input.entityId,
      action: input.action,
      actor_profile_id: input.actorProfileId,
      reason: input.reason ?? null,
      before_values: input.beforeValues,
      after_values: input.afterValues,
      metadata: input.metadata,
      request_id: requestId(),
    });

  if (result.error) {
    fail(500, 'INTERNAL_ERROR', '周报审计写入失败，请稍后重试。');
  }
}

function requireAdminStore(): any {
  const admin = createAdminSupabaseClient();
  if (!admin) {
    fail(503, 'REPORT_STORE_UNAVAILABLE', '周报存储暂不可用。');
  }
  return admin;
}

function resolveWeeklyWindow(businessDate: string): {
  periodStart: string;
  periodEnd: string;
} {
  if (!validIsoDate(businessDate)) {
    fail(422, 'INVALID_INPUT', '业务日期无效。');
  }
  const today = currentShanghaiBusinessDate();
  if (businessDate > today) {
    fail(422, 'INVALID_INPUT', '不能生成未来周报。');
  }
  const period = weeklyPeriodForBusinessDate(businessDate);
  if (!period) {
    fail(422, 'INVALID_INPUT', '周报周期无效。');
  }
  return period;
}

export async function generateWeeklyReportDraft(
  session: any,
  profile: CpcProfile,
  businessDate: string,
  expectedVersion: number | null,
): Promise<{
  reportId: string;
  status: 'draft';
  periodStart: string;
  periodEnd: string;
  revisionNo: number;
  version: number;
}> {
  const { periodStart, periodEnd } = resolveWeeklyWindow(businessDate);
  const dailySnapshots = await loadDailySnapshots(
    session,
    profile,
    periodStart,
    periodEnd,
  );
  const aggregation = aggregateWeeklyReport({
    periodStart,
    periodEnd,
    coverageThrough: businessDate,
    snapshots: dailySnapshots,
  });

  const admin = requireAdminStore();
  const draftResult = await admin
    .from('cpc_reports')
    .select('id,revision_no,status,version')
    .eq('org_id', profile.orgId)
    .eq('subject_profile_id', profile.id)
    .eq('period_type', 'weekly')
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .eq('status', 'draft')
    .maybeSingle();

  if (draftResult.error) {
    fail(500, 'INTERNAL_ERROR', '周报草稿读取失败，请稍后重试。');
  }

  const timestamp = nowIso();
  if (draftResult.data) {
    if (expectedVersion === null || expectedVersion !== draftResult.data.version) {
      fail(409, 'VERSION_CONFLICT', '周报版本已经变化，请刷新后重试。');
    }

    const updated = await admin
      .from('cpc_reports')
      .update({
        deterministic_metrics: aggregation.deterministicMetrics,
        metrics_schema_version: 1,
        unknowns: aggregation.unknowns,
        source_event_seq: aggregation.sourceEventSeq,
        source_audit_seq: aggregation.sourceAuditSeq,
        version: draftResult.data.version + 1,
        updated_at: timestamp,
      })
      .eq('id', draftResult.data.id)
      .eq('org_id', profile.orgId)
      .eq('subject_profile_id', profile.id)
      .eq('status', 'draft')
      .eq('version', expectedVersion)
      .select('id,revision_no,version')
      .maybeSingle();

    if (updated.error) {
      fail(500, 'INTERNAL_ERROR', '周报草稿刷新失败，请稍后重试。');
    }
    if (!updated.data) {
      fail(409, 'VERSION_CONFLICT', '周报版本已经变化，请刷新后重试。');
    }

    await writeAudit(admin, {
      orgId: profile.orgId,
      entityId: updated.data.id,
      action: 'WEEKLY_REPORT_DRAFT_REFRESHED',
      actorProfileId: profile.id,
      beforeValues: {
        version: draftResult.data.version,
      },
      afterValues: {
        version: updated.data.version,
      },
      metadata: {
        period_type: 'weekly',
        week_starts_on: WEEK_STARTS_ON,
        period_start: periodStart,
        period_end: periodEnd,
        coverage_complete: aggregation.coverage.complete,
        covered_daily_count: aggregation.coverage.coveredDailyCount,
        expected_daily_count: aggregation.coverage.expectedDailyCount,
        source_event_seq: aggregation.sourceEventSeq,
        source_audit_seq: aggregation.sourceAuditSeq,
      },
    });

    return {
      reportId: updated.data.id,
      status: 'draft',
      periodStart,
      periodEnd,
      revisionNo: updated.data.revision_no,
      version: updated.data.version,
    };
  }

  const submittedResult = await admin
    .from('cpc_reports')
    .select('id')
    .eq('org_id', profile.orgId)
    .eq('subject_profile_id', profile.id)
    .eq('period_type', 'weekly')
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .eq('status', 'submitted')
    .limit(1);
  if (submittedResult.error) {
    fail(500, 'INTERNAL_ERROR', '周报状态读取失败，请稍后重试。');
  }
  if ((submittedResult.data ?? []).length > 0) {
    fail(
      409,
      'REPORT_ALREADY_SUBMITTED',
      '该周周报已经提交；如需修改请创建更正版。',
    );
  }

  const revisionResult = await admin
    .from('cpc_reports')
    .select('revision_no')
    .eq('org_id', profile.orgId)
    .eq('subject_profile_id', profile.id)
    .eq('period_type', 'weekly')
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .order('revision_no', { ascending: false })
    .limit(1);
  if (revisionResult.error) {
    fail(500, 'INTERNAL_ERROR', '周报版本读取失败，请稍后重试。');
  }
  const revisionNo =
    (revisionResult.data?.[0]?.revision_no ?? 0) + 1;

  const inserted = await admin
    .from('cpc_reports')
    .insert({
      org_id: profile.orgId,
      subject_profile_id: profile.id,
      period_type: 'weekly',
      period_start: periodStart,
      period_end: periodEnd,
      revision_no: revisionNo,
      status: 'draft',
      metrics_schema_version: 1,
      deterministic_metrics: aggregation.deterministicMetrics,
      narrative: null,
      unknowns: aggregation.unknowns,
      source_event_seq: aggregation.sourceEventSeq,
      source_audit_seq: aggregation.sourceAuditSeq,
      created_by_profile_id: profile.id,
      version: 1,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select('id,revision_no,version')
    .maybeSingle();

  if (inserted.error || !inserted.data) {
    fail(500, 'INTERNAL_ERROR', '周报草稿创建失败，请稍后重试。');
  }

  await writeAudit(admin, {
    orgId: profile.orgId,
    entityId: inserted.data.id,
    action: 'WEEKLY_REPORT_DRAFT_GENERATED',
    actorProfileId: profile.id,
    beforeValues: null,
    afterValues: {
      status: 'draft',
      revision_no: revisionNo,
      version: inserted.data.version,
    },
    metadata: {
      period_type: 'weekly',
      week_starts_on: WEEK_STARTS_ON,
      period_start: periodStart,
      period_end: periodEnd,
      coverage_complete: aggregation.coverage.complete,
      covered_daily_count: aggregation.coverage.coveredDailyCount,
      expected_daily_count: aggregation.coverage.expectedDailyCount,
      source_event_seq: aggregation.sourceEventSeq,
      source_audit_seq: aggregation.sourceAuditSeq,
    },
  });

  return {
    reportId: inserted.data.id,
    status: 'draft',
    periodStart,
    periodEnd,
    revisionNo: inserted.data.revision_no,
    version: inserted.data.version,
  };
}

export async function createWeeklyReportCorrection(
  session: any,
  profile: CpcProfile,
  reportId: string,
  expectedVersion: number,
  reason: string,
): Promise<{
  reportId: string;
  status: 'draft';
  revisionNo: number;
  version: number;
  supersedesReportId: string;
}> {
  const source = await readOwnWeeklyReport(session, profile, reportId);
  if (source.status !== 'submitted') {
    fail(409, 'INVALID_TRANSITION', '只有已提交周报可以创建更正版。');
  }
  if (source.version !== expectedVersion) {
    fail(409, 'VERSION_CONFLICT', '周报版本已经变化，请刷新后重试。');
  }
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    fail(422, 'REASON_REQUIRED', '创建更正版必须填写原因。');
  }

  const admin = requireAdminStore();
  const latestResult = await admin
    .from('cpc_reports')
    .select('id,revision_no')
    .eq('org_id', profile.orgId)
    .eq('subject_profile_id', profile.id)
    .eq('period_type', 'weekly')
    .eq('period_start', source.periodStart)
    .eq('period_end', source.periodEnd)
    .order('revision_no', { ascending: false })
    .limit(1);
  if (latestResult.error) {
    fail(500, 'INTERNAL_ERROR', '周报更正版本读取失败，请稍后重试。');
  }
  const latest = latestResult.data?.[0];
  if (!latest || latest.id !== source.id) {
    fail(409, 'INVALID_TRANSITION', '只能从最新提交版本创建更正版。');
  }

  const draftResult = await admin
    .from('cpc_reports')
    .select('id')
    .eq('org_id', profile.orgId)
    .eq('subject_profile_id', profile.id)
    .eq('period_type', 'weekly')
    .eq('period_start', source.periodStart)
    .eq('period_end', source.periodEnd)
    .eq('status', 'draft')
    .limit(1);
  if (draftResult.error) {
    fail(500, 'INTERNAL_ERROR', '周报更正草稿读取失败，请稍后重试。');
  }
  if ((draftResult.data ?? []).length > 0) {
    fail(409, 'REPORT_DRAFT_EXISTS', '该周已有更正草稿，请先处理现有草稿。');
  }

  const dailySnapshots = await loadDailySnapshots(
    session,
    profile,
    source.periodStart,
    source.periodEnd,
  );
  const aggregation = aggregateWeeklyReport({
    periodStart: source.periodStart,
    periodEnd: source.periodEnd,
    coverageThrough: source.periodEnd < currentShanghaiBusinessDate()
      ? source.periodEnd
      : currentShanghaiBusinessDate(),
    snapshots: dailySnapshots,
  });
  const revisionNo = (latest.revision_no ?? source.revisionNo) + 1;
  const timestamp = nowIso();

  const inserted = await admin
    .from('cpc_reports')
    .insert({
      org_id: profile.orgId,
      subject_profile_id: profile.id,
      period_type: 'weekly',
      period_start: source.periodStart,
      period_end: source.periodEnd,
      revision_no: revisionNo,
      status: 'draft',
      metrics_schema_version: 1,
      deterministic_metrics: aggregation.deterministicMetrics,
      narrative: null,
      unknowns: aggregation.unknowns,
      source_event_seq: aggregation.sourceEventSeq,
      source_audit_seq: aggregation.sourceAuditSeq,
      supersedes_report_id: source.id,
      created_by_profile_id: profile.id,
      version: 1,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select('id,revision_no,version')
    .maybeSingle();

  if (inserted.error || !inserted.data) {
    fail(500, 'INTERNAL_ERROR', '周报更正草稿创建失败，请稍后重试。');
  }

  await writeAudit(admin, {
    orgId: profile.orgId,
    entityId: inserted.data.id,
    action: 'WEEKLY_REPORT_CORRECTION_CREATED',
    actorProfileId: profile.id,
    reason: trimmedReason,
    beforeValues: {
      report_id: source.id,
      revision_no: source.revisionNo,
      version: source.version,
    },
    afterValues: {
      status: 'draft',
      revision_no: inserted.data.revision_no,
      version: inserted.data.version,
      supersedes_report_id: source.id,
    },
    metadata: {
      period_type: 'weekly',
      period_start: source.periodStart,
      period_end: source.periodEnd,
      coverage_complete: aggregation.coverage.complete,
      covered_daily_count: aggregation.coverage.coveredDailyCount,
      expected_daily_count: aggregation.coverage.expectedDailyCount,
    },
  });

  return {
    reportId: inserted.data.id,
    status: 'draft',
    revisionNo: inserted.data.revision_no,
    version: inserted.data.version,
    supersedesReportId: source.id,
  };
}
