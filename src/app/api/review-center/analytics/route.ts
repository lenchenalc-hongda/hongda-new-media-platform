import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getShanghaiBusinessDate } from '@/lib/review-center/actions';
import {
  ANALYTICS_BATCH_SIZE,
  calculateAnalyticsSnapshot,
  fetchAllWithBatchPaging,
  getAnalyticsRangeBounds,
  parseAnalyticsRange,
  type AnalyticsActionRow,
  type AnalyticsReviewRow,
  type AnalyticsTimelineRow,
} from '@/lib/review-center/analytics';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  if (!supabase) return jsonError('数据库不可用', 500);

  let authUserId: string | null = null;
  try {
    const authResult = await supabase.auth.getUser();
    const authUser = authResult?.data?.user;
    authUserId = typeof authUser?.id === 'string' ? authUser.id : null;
  } catch {
    return jsonError('未登录或无权限', 401);
  }
  if (!authUserId) return jsonError('未登录或无权限', 401);

  const profileResult = await supabase
    .from('profiles')
    .select('id,org_id,role')
    .eq('user_id', authUserId)
    .eq('is_active', true)
    .maybeSingle();
  if (profileResult.error || !profileResult.data) {
    return jsonError('无有效档案', 403);
  }
  const profile = profileResult.data as { id: string; org_id: string; role: string };
  if (profile.role !== 'admin' && profile.role !== 'manager') {
    return jsonError('无权查看分析数据', 403);
  }

  const rangeValues = req.nextUrl.searchParams.getAll('range');
  if (rangeValues.length > 1) return jsonError('查询参数无效', 400);
  const range = parseAnalyticsRange(rangeValues[0] ?? null);
  if (!range) return jsonError('查询参数无效', 400);

  let businessDate: string;
  try {
    businessDate = getShanghaiBusinessDate(new Date());
  } catch {
    return jsonError('分析数据加载失败，请稍后重试。', 500);
  }
  const bounds = getAnalyticsRangeBounds(range, businessDate);
  if (!bounds) return jsonError('分析数据加载失败，请稍后重试。', 500);

  const orgId = profile.org_id;
  try {
    const [reviews, actionsCreated, actionsVerified, actionsCancelled, timelineEvents] =
      await Promise.all([
        fetchAllWithBatchPaging<AnalyticsReviewRow>(async (offset) => {
          return await supabase
            .from('review_cases')
            .select('id,created_at')
            .eq('org_id', orgId)
            .gte('created_at', bounds.start)
            .lt('created_at', bounds.end)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + ANALYTICS_BATCH_SIZE - 1);
        }),
        fetchAllWithBatchPaging<AnalyticsActionRow>(async (offset) => {
          return await supabase
            .from('review_actions')
            .select('id,created_at')
            .eq('org_id', orgId)
            .gte('created_at', bounds.start)
            .lt('created_at', bounds.end)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + ANALYTICS_BATCH_SIZE - 1);
        }),
        fetchAllWithBatchPaging<AnalyticsActionRow>(async (offset) => {
          return await supabase
            .from('review_actions')
            .select('id,created_at,status,verified_at')
            .eq('org_id', orgId)
            .eq('status', 'VERIFIED')
            .gte('verified_at', bounds.start)
            .lt('verified_at', bounds.end)
            .order('verified_at', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + ANALYTICS_BATCH_SIZE - 1);
        }),
        fetchAllWithBatchPaging<AnalyticsActionRow>(async (offset) => {
          return await supabase
            .from('review_actions')
            .select('id,created_at,status,cancelled_at')
            .eq('org_id', orgId)
            .eq('status', 'CANCELLED')
            .gte('cancelled_at', bounds.start)
            .lt('cancelled_at', bounds.end)
            .order('cancelled_at', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + ANALYTICS_BATCH_SIZE - 1);
        }),
        fetchAllWithBatchPaging<AnalyticsTimelineRow>(async (offset) => {
          return await supabase
            .from('review_timeline_events')
            .select('id,review_id,event_type,created_at')
            .eq('org_id', orgId)
            .in('event_type', ['REVIEW_CLOSED', 'REVIEW_REOPENED'])
            .gte('created_at', bounds.start)
            .lt('created_at', bounds.end)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + ANALYTICS_BATCH_SIZE - 1);
        }),
      ]);

    const snapshot = calculateAnalyticsSnapshot({
      range,
      businessDate,
      reviews,
      timelineEvents,
      actionsCreated,
      actionsVerified,
      actionsCancelled,
    });

    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: snapshot,
    });
  } catch {
    return jsonError('分析数据加载失败，请稍后重试。', 500);
  }
}
