import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCpcProfile } from '@/lib/customer-projects/api';
import {
  buildSubmittedWeeklyReportReviewItems,
  canReviewSubmittedDailyReports,
} from '@/lib/customer-projects/report-review';

export const dynamic = 'force-dynamic';

const MAX_REVIEW_REPORT_ROWS = 200;

const REPORT_REVIEW_SELECT = [
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

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  if (!supabase) return jsonError('数据库不可用', 500);

  const profileResult = await resolveCpcProfile(supabase);
  if (!profileResult.ok) {
    return jsonError(profileResult.message, profileResult.status);
  }

  const profile = profileResult.profile;
  if (!canReviewSubmittedDailyReports(profile.role)) {
    return jsonError('无权查看周报审阅', 403);
  }

  try {
    const reportResult = await supabase
      .from('cpc_reports')
      .select(REPORT_REVIEW_SELECT)
      .eq('org_id', profile.orgId)
      .eq('period_type', 'weekly')
      .eq('status', 'submitted')
      .order('period_start', { ascending: false })
      .order('revision_no', { ascending: false })
      .range(0, MAX_REVIEW_REPORT_ROWS - 1);

    if (reportResult.error) throw new Error('submitted weekly reports read failed');

    const reportRows: unknown[] = reportResult.data ?? [];
    const subjectProfileIds = Array.from(new Set(
      reportRows.flatMap(row => {
        if (!row || typeof row !== 'object') return [];
        const subjectProfileId =
          (row as Record<string, unknown>).subject_profile_id;
        return typeof subjectProfileId === 'string'
          ? [subjectProfileId]
          : [];
      }),
    ));

    const profileRows = subjectProfileIds.length > 0
      ? await supabase
        .from('profiles')
        .select('id,org_id,full_name,department,is_active')
        .eq('org_id', profile.orgId)
        .in('id', subjectProfileIds)
      : { data: [], error: null };

    if (profileRows.error) throw new Error('report subject profiles read failed');

    const reports = buildSubmittedWeeklyReportReviewItems({
      reports: reportRows,
      profiles: profileRows.data ?? [],
      orgId: profile.orgId,
    });

    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: { reports },
    });
  } catch {
    return jsonError('周报审阅加载失败，请稍后重试。', 500);
  }
}
