import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCpcProfile, runCpcMutation } from '@/lib/customer-projects/api';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  if (!isDate(date)) return jsonError('日报日期无效', 400);

  const supabase = await createClient();
  if (!supabase) return jsonError('数据库不可用', 500);

  const profileResult = await resolveCpcProfile(supabase);
  if (!profileResult.ok) {
    return jsonError(profileResult.message, profileResult.status);
  }
  const profile = profileResult.profile;

  try {
    const reportsResult = await supabase
      .from('cpc_reports')
      .select('id,period_type,period_start,period_end,revision_no,status,metrics_schema_version,deterministic_metrics,narrative,unknowns,source_event_seq,source_audit_seq,supersedes_report_id,version,submitted_at,created_at,updated_at')
      .eq('org_id', profile.orgId)
      .eq('subject_profile_id', profile.id)
      .eq('period_type', 'daily')
      .eq('period_start', date)
      .eq('period_end', date)
      .order('revision_no', { ascending: false })
      .range(0, 19);

    if (reportsResult.error) throw new Error('report read failed');

    const recentResult = await supabase
      .from('cpc_reports')
      .select('id,period_start,revision_no,status,submitted_at,version')
      .eq('org_id', profile.orgId)
      .eq('subject_profile_id', profile.id)
      .eq('period_type', 'daily')
      .eq('status', 'submitted')
      .order('period_start', { ascending: false })
      .order('revision_no', { ascending: false })
      .range(0, 29);

    if (recentResult.error) throw new Error('report history read failed');

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    let liveMetrics: any = null;
    if (date === today) {
      const metricsResult = await supabase.rpc('cpc_get_daily_report_metrics', {
        p_period_date: date,
      });
      if (metricsResult.error) throw new Error('report metrics read failed');
      if (metricsResult.data?.ok === true) {
        liveMetrics = metricsResult.data.data;
      }
    }

    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: {
        requestedDate: date,
        businessDate: today,
        currentReport: (reportsResult.data ?? [])[0] ?? null,
        revisions: reportsResult.data ?? [],
        recentSubmitted: recentResult.data ?? [],
        liveMetrics,
      },
    });
  } catch {
    return jsonError('日报加载失败，请稍后重试。', 500);
  }
}

export async function POST(req: NextRequest) {
  return runCpcMutation(req, {}, 'REFRESH_DAILY_REPORT');
}
