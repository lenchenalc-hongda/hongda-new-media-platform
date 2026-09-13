import { NextRequest, NextResponse } from 'next/server';
import { requireUserFromRequest } from '@/lib/auth/current-user';
import { AuthError } from '@/lib/auth/types';
import { createClient } from '@/lib/supabase/server';
import { reviewIdSchema } from '@/lib/review-center/schemas';
import { getCurrentProfile } from '@/lib/review-center/service';
import {
  buildTimelineDTO,
  buildTimelinePageInfo,
  parseTimelinePagination,
  type TimelineActorDirectoryItem,
} from '@/lib/review-center/timeline';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const parsed = reviewIdSchema.safeParse(params);
  if (!parsed.success) return jsonError('请求参数无效', 400);

  let user;
  try {
    user = await requireUserFromRequest(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonError('未登录或无权限', err.code === 'UNAUTHENTICATED' ? 401 : 403);
    }
    return jsonError('服务异常', 500);
  }

  const supabase = await createClient();
  if (!supabase) return jsonError('数据库不可用', 500);

  const profile = await getCurrentProfile(supabase, user.id);
  if (!profile) return jsonError('无有效档案', 403);

  const pagination = parseTimelinePagination(req.nextUrl.searchParams);
  if (!pagination.ok) return jsonError('分页参数无效', 400);
  const { limit, offset } = pagination.data;
  const reviewId = parsed.data.id;

  const reviewResult = await supabase
    .from('review_cases')
    .select('id')
    .eq('id', reviewId)
    .maybeSingle();
  if (reviewResult.error) return jsonError('项目动态加载失败，请稍后重试。', 500);
  if (!reviewResult.data) return jsonError('复盘不存在或无权访问', 404);

  const timelineResult = await supabase
    .from('review_timeline_events')
    .select('id,event_type,actor_profile_id,payload,version,created_at')
    .eq('review_id', reviewId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit);
  if (timelineResult.error) return jsonError('项目动态加载失败，请稍后重试。', 500);

  const rows = Array.isArray(timelineResult.data) ? timelineResult.data : [];
  const hasMore = rows.length > limit;
  const visibleRows = hasMore ? rows.slice(0, limit) : rows;
  let actorDirectory: TimelineActorDirectoryItem[] = [];

  if (visibleRows.length > 0) {
    const actorResult = await supabase.rpc('review_event_actor_directory', {
      p_review_id: reviewId,
      p_purpose: 'TIMELINE',
    });
    if (actorResult.error) return jsonError('项目动态加载失败，请稍后重试。', 500);

    const envelope = actorResult.data;
    if (!envelope || typeof envelope !== 'object' || envelope.ok !== true || envelope.code !== 'OK') {
      const code = typeof envelope?.code === 'string' ? envelope.code : '';
      if (code === 'NOT_FOUND') return jsonError('复盘不存在或无权访问', 404);
      if (code === 'FORBIDDEN') return jsonError('未登录或无权限', 403);
      return jsonError('项目动态加载失败，请稍后重试。', 500);
    }

    const items = envelope.data?.items;
    if (!Array.isArray(items)) return jsonError('项目动态加载失败，请稍后重试。', 500);
    actorDirectory = items as TimelineActorDirectoryItem[];
  }

  const items = visibleRows.map(row => buildTimelineDTO(row as any, actorDirectory));
  const pageInfo = buildTimelinePageInfo(limit, offset, items.length, hasMore);
  return NextResponse.json({
    ok: true,
    code: 'OK',
    message: 'success',
    data: { items, pageInfo },
  });
}
