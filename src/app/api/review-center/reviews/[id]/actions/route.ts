import { NextRequest, NextResponse } from 'next/server';
import { requireUserFromRequest } from '@/lib/auth/current-user';
import { AuthError } from '@/lib/auth/types';
import { createClient } from '@/lib/supabase/server';
import { reviewIdSchema } from '@/lib/review-center/schemas';
import { getCurrentProfile } from '@/lib/review-center/service';
import { parseParticipantDirectoryResult } from '@/lib/review-center/participant';
import {
  ActionReadError,
  mapActionRowsToDtos,
} from '@/lib/review-center/actions';
import { ParticipantReadError } from '@/lib/review-center/participant';

export const dynamic = 'force-dynamic';

const ACTION_SELECT = [
  'id',
  'review_id',
  'sequence',
  'title',
  'description',
  'action_type',
  'status',
  'due_date',
  'owner_profile_id',
  'created_by_profile_id',
  'completion_note',
  'verification_note',
  'verified_by_profile_id',
  'completed_at',
  'verified_at',
  'cancelled_at',
  'cancel_reason',
  'version',
  'created_at',
  'updated_at',
].join(',');

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function success(actions: unknown[]) {
  return NextResponse.json({
    ok: true,
    code: 'OK',
    message: 'success',
    data: { actions },
  });
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

  const reviewId = parsed.data.id;

  const reviewResult = await supabase
    .from('review_cases')
    .select('id')
    .eq('id', reviewId)
    .maybeSingle();
  if (reviewResult.error) return jsonError('服务异常', 500);
  if (!reviewResult.data) return jsonError('复盘不存在或无权访问', 404);

  const actionResult = await supabase
    .from('review_actions')
    .select(ACTION_SELECT)
    .eq('review_id', reviewId)
    .order('sequence', { ascending: true })
    .order('id', { ascending: true });
  if (actionResult.error) return jsonError('服务异常', 500);

  const rows = Array.isArray(actionResult.data) ? actionResult.data : [];
  if (rows.length === 0) return success([]);

  let participants;
  try {
    const participantResult = await supabase.rpc('review_participant_directory', {
      p_review_id: reviewId,
    });
    const envelope = participantResult.data;
    if (!participantResult.error && envelope && typeof envelope === 'object') {
      const code = typeof (envelope as any).code === 'string' ? (envelope as any).code : '';
      if (code === 'FORBIDDEN') {
        return jsonError('未登录或无权限', 403);
      }
      if (code === 'NOT_FOUND') {
        return jsonError('复盘不存在或无权访问', 404);
      }
    }
    participants = parseParticipantDirectoryResult(participantResult);
  } catch (err) {
    if (err instanceof ParticipantReadError) {
      const status = err.status === 403 ? 403 : err.status === 404 ? 404 : 500;
      return jsonError(
        status === 403 ? '未登录或无权限' : status === 404 ? '复盘不存在或无权访问' : '服务异常',
        status,
      );
    }
    return jsonError('服务异常', 500);
  }

  try {
    const actions = mapActionRowsToDtos(rows, participants);
    return success(actions);
  } catch (err) {
    if (err instanceof ActionReadError) return jsonError('服务异常', 500);
    return jsonError('服务异常', 500);
  }
}
