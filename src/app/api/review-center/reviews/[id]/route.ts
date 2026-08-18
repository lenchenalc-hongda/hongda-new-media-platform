import { NextRequest, NextResponse } from 'next/server';
import { requireUserFromRequest } from '@/lib/auth/current-user';
import { AuthError } from '@/lib/auth/types';
import { createClient } from '@/lib/supabase/server';
import { reviewIdSchema } from '@/lib/review-center/schemas';
import { getCurrentProfile, getReviewDetail, ReviewServiceError } from '@/lib/review-center/service';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const parsed = reviewIdSchema.safeParse(params);
  if (!parsed.success) return jsonError('复盘编号无效', 404);

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

  try {
    const review = await getReviewDetail(supabase, profile.org_id, parsed.data.id);
    return NextResponse.json(review);
  } catch (err) {
    if (err instanceof ReviewServiceError) return jsonError(err.message, err.status);
    return jsonError('复盘详情读取失败', 500);
  }
}
