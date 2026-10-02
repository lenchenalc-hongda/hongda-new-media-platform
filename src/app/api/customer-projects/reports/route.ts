import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCpcProfile } from '@/lib/customer-projects/api';
import { derivedReportSnapshotSchema } from '@/lib/customer-projects/schemas';
import type { DailyReportListItem } from '@/lib/customer-projects/reports';

export const dynamic = 'force-dynamic';

const MAX_REPORT_ROWS = 100;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function toDailyReportListItem(row: unknown): DailyReportListItem | null {
  const parsed = derivedReportSnapshotSchema.safeParse(row);
  if (!parsed.success || parsed.data.period_type !== 'daily') return null;

  const report = parsed.data;
  return {
    id: report.id,
    periodType: 'daily',
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

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  if (!supabase) return jsonError('数据库不可用', 500);

  const profileResult = await resolveCpcProfile(supabase);
  if (!profileResult.ok) {
    return jsonError(profileResult.message, profileResult.status);
  }
  const profile = profileResult.profile;

  try {
    const result = await supabase
      .from('cpc_reports')
      .select(
        'id,org_id,subject_profile_id,period_type,period_start,period_end,revision_no,status,metrics_schema_version,deterministic_metrics,narrative,unknowns,source_event_seq,source_audit_seq,supersedes_report_id,created_by_profile_id,submitted_by_profile_id,submitted_at,version,created_at,updated_at',
      )
      .eq('org_id', profile.orgId)
      .eq('subject_profile_id', profile.id)
      .eq('period_type', 'daily')
      .order('period_start', { ascending: false })
      .order('revision_no', { ascending: false })
      .range(0, MAX_REPORT_ROWS - 1);

    if (result.error) throw new Error('daily reports read failed');

    const reports: DailyReportListItem[] = [];
    for (const row of result.data ?? []) {
      const parsed = toDailyReportListItem(row);
      if (parsed) reports.push(parsed);
    }

    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: { reports },
    });
  } catch {
    return jsonError('日报加载失败，请稍后重试。', 500);
  }
}
