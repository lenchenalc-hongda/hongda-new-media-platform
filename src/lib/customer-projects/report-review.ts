import { z } from 'zod';
import type { MetricValue } from './domain';
import { derivedReportSnapshotSchema } from './schemas';

const reportReviewerProfileSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  full_name: z.string().nullable(),
  department: z.string().nullable(),
  is_active: z.boolean().nullable(),
}).strict();

interface SubmittedReportReviewItemBase {
  id: string;
  status: 'submitted';
  periodStart: string;
  periodEnd: string;
  revisionNo: number;
  metricsSchemaVersion: number;
  deterministicMetrics: Record<string, MetricValue<number>>;
  narrative: string | null;
  unknowns: unknown[];
  sourceEventSeq: number | null;
  sourceAuditSeq: number | null;
  supersedesReportId: string | null;
  submittedAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  subject: {
    displayName: string;
    department: string | null;
    isActive: boolean | null;
  };
}

export interface SubmittedDailyReportReviewItem
  extends SubmittedReportReviewItemBase {
  periodType: 'daily';
}

export interface SubmittedWeeklyReportReviewItem
  extends SubmittedReportReviewItemBase {
  periodType: 'weekly';
}

export type SubmittedReportReviewItem =
  | SubmittedDailyReportReviewItem
  | SubmittedWeeklyReportReviewItem;

export function canReviewSubmittedDailyReports(
  role: string | null | undefined,
): boolean {
  return role === 'admin' || role === 'manager';
}

export function buildSubmittedDailyReportReviewItems(input: {
  reports: unknown[];
  profiles: unknown[];
  orgId: string;
}): SubmittedDailyReportReviewItem[] {
  return buildSubmittedReportReviewItems({
    ...input,
    periodType: 'daily',
  }) as SubmittedDailyReportReviewItem[];
}

export function buildSubmittedWeeklyReportReviewItems(input: {
  reports: unknown[];
  profiles: unknown[];
  orgId: string;
}): SubmittedWeeklyReportReviewItem[] {
  return buildSubmittedReportReviewItems({
    ...input,
    periodType: 'weekly',
  }) as SubmittedWeeklyReportReviewItem[];
}

function buildSubmittedReportReviewItems(input: {
  reports: unknown[];
  profiles: unknown[];
  orgId: string;
  periodType: 'daily' | 'weekly';
}): SubmittedReportReviewItem[] {
  const profiles = new Map<string, z.infer<typeof reportReviewerProfileSchema>>();

  for (const row of input.profiles) {
    const parsed = reportReviewerProfileSchema.safeParse(row);
    if (!parsed.success || parsed.data.org_id !== input.orgId) continue;
    profiles.set(parsed.data.id, parsed.data);
  }

  const items: SubmittedReportReviewItem[] = [];

  for (const row of input.reports) {
    const parsed = derivedReportSnapshotSchema.safeParse(row);
    if (!parsed.success) continue;

    const report = parsed.data;
    if (
      report.org_id !== input.orgId
      || report.period_type !== input.periodType
      || report.status !== 'submitted'
      || report.submitted_at === null
    ) {
      continue;
    }

    const submittedAt = report.submitted_at;
    const subject = profiles.get(report.subject_profile_id);
    if (!subject) continue;

    items.push({
      id: report.id,
      periodType: report.period_type,
      status: 'submitted',
      periodStart: report.period_start,
      periodEnd: report.period_end,
      revisionNo: report.revision_no,
      metricsSchemaVersion: report.metrics_schema_version,
      deterministicMetrics: report.deterministic_metrics,
      narrative: report.narrative,
      unknowns: report.unknowns,
      sourceEventSeq: report.source_event_seq,
      sourceAuditSeq: report.source_audit_seq,
      supersedesReportId: report.supersedes_report_id,
      submittedAt,
      version: report.version,
      createdAt: report.created_at,
      updatedAt: report.updated_at,
      subject: {
        displayName: subject.full_name?.trim() || '未命名用户',
        department: subject.department,
        isActive: subject.is_active,
      },
    });
  }

  return items.sort((left, right) => (
    right.periodStart.localeCompare(left.periodStart)
    || right.revisionNo - left.revisionNo
    || right.submittedAt.localeCompare(left.submittedAt)
  ));
}
