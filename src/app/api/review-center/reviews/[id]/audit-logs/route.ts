import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { reviewIdSchema } from '@/lib/review-center/schemas';
import {
  buildAuditDTO,
  buildAuditPageInfo,
  parseAuditPagination,
  type AuditActorDirectoryItem,
  type AuditRow,
} from '@/lib/review-center/audit';

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
    return jsonError('无权查看管理日志', 403);
  }

  const pagination = parseAuditPagination(req.nextUrl.searchParams);
  if (!pagination.ok) return jsonError('分页参数无效', 400);
  const { limit, offset } = pagination.data;
  const reviewId = parsed.data.id;

  const reviewResult = await supabase
    .from('review_cases')
    .select('id')
    .eq('id', reviewId)
    .maybeSingle();
  if (reviewResult.error) return jsonError('管理日志加载失败，请稍后重试。', 500);
  if (!reviewResult.data) return jsonError('复盘不存在或无权访问', 404);

  const auditResult = await supabase
    .from('review_audit_logs')
    .select(
      'id,entity_type,action,actor_profile_id,changes,version_before,version_after,created_at',
    )
    .eq('review_id', reviewId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit);
  if (auditResult.error) return jsonError('管理日志加载失败，请稍后重试。', 500);

  const rows = Array.isArray(auditResult.data) ? auditResult.data : [];
  const hasMore = rows.length > limit;
  const visibleRows = hasMore ? rows.slice(0, limit) : rows;
  let actorDirectory: AuditActorDirectoryItem[] = [];

  if (visibleRows.length > 0) {
    const actorResult = await supabase.rpc('review_event_actor_directory', {
      p_review_id: reviewId,
      p_purpose: 'AUDIT',
    });
    if (actorResult.error) return jsonError('管理日志加载失败，请稍后重试。', 500);

    const envelope = actorResult.data;
    if (!envelope || typeof envelope !== 'object' || envelope.ok !== true || envelope.code !== 'OK') {
      const code = typeof envelope?.code === 'string' ? envelope.code : '';
      if (code === 'NOT_FOUND') return jsonError('复盘不存在或无权访问', 404);
      if (code === 'FORBIDDEN') return jsonError('未登录或无权限', 403);
      return jsonError('管理日志加载失败，请稍后重试。', 500);
    }

    const items = envelope.data?.items;
    if (!Array.isArray(items)) return jsonError('管理日志加载失败，请稍后重试。', 500);
    actorDirectory = items as AuditActorDirectoryItem[];
  }

  const built = visibleRows.map(row => buildAuditDTO(row as AuditRow, actorDirectory));
  if (built.some(item => item === null)) {
    return jsonError('管理日志加载失败，请稍后重试。', 500);
  }
  const logs = built as NonNullable<typeof built[number]>[];
  const pageInfo = buildAuditPageInfo(limit, offset, logs.length, hasMore);

  return NextResponse.json({
    ok: true,
    code: 'OK',
    message: 'success',
    data: { logs, pageInfo },
  });
}
