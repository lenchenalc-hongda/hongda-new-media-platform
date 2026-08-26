import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getShanghaiBusinessDate } from '@/lib/review-center/actions';
import {
  DASHBOARD_BATCH_SIZE,
  calculateDashboardSnapshot,
  fetchAllWithBatchPaging,
  parseDashboardRange,
  type DashboardActionRow,
  type DashboardClosedEventRow,
  type DashboardOwnerMap,
  type DashboardReviewRow,
} from '@/lib/review-center/dashboard';

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
    return jsonError('无权查看管理统计', 403);
  }

  const rangeValues = req.nextUrl.searchParams.getAll('range');
  if (rangeValues.length > 1) return jsonError('查询参数无效', 400);
  const range = parseDashboardRange(rangeValues[0] ?? null);
  if (!range) return jsonError('查询参数无效', 400);

  let businessDate: string;
  try {
    businessDate = getShanghaiBusinessDate(new Date());
  } catch {
    return jsonError('管理统计加载失败，请稍后重试。', 500);
  }

  const orgId = profile.org_id;
  try {
    const reviews = await fetchAllWithBatchPaging<DashboardReviewRow>(async (offset) => {
      return await supabase
        .from('review_cases')
        .select('id,review_no,title,review_type,status,risk_level,owner_id,created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + DASHBOARD_BATCH_SIZE - 1);
    });

    const actions = await fetchAllWithBatchPaging<DashboardActionRow>(async (offset) => {
      return await supabase
        .from('review_actions')
        .select('review_id,status,due_date,verified_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + DASHBOARD_BATCH_SIZE - 1);
    });

    const closedEvents = await fetchAllWithBatchPaging<DashboardClosedEventRow>(async (offset) => {
      return await supabase
        .from('review_timeline_events')
        .select('review_id,event_type,created_at')
        .eq('org_id', orgId)
        .eq('event_type', 'REVIEW_CLOSED')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + DASHBOARD_BATCH_SIZE - 1);
    });

    let ownerMap: DashboardOwnerMap = new Map();
    if (reviews.length > 0) {
      try {
        const directoryResult = await supabase.rpc('review_profile_directory', {
          p_purpose: 'ACTION_OWNER',
        });
        const envelope = directoryResult?.data;
        const items = isObject(envelope) ? envelope.data?.items : null;
        if (!directoryResult?.error && Array.isArray(items)) {
          const entries: Array<readonly [string, string]> = [];
          for (const item of items) {
            if (
              isObject(item)
              && typeof item.profile_id === 'string'
              && typeof item.display_name === 'string'
            ) {
              entries.push([item.profile_id, item.display_name]);
            }
          }
          ownerMap = new Map(entries);
        }
      } catch {
        ownerMap = new Map();
      }
    }

    const snapshot = calculateDashboardSnapshot({
      reviews,
      actions,
      closedEvents,
      ownerMap,
      range,
      businessDate,
      attentionLimit: 10,
    });

    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: snapshot,
    });
  } catch {
    return jsonError('管理统计加载失败，请稍后重试。', 500);
  }
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
