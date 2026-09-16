import { NextRequest, NextResponse } from 'next/server';
import { requireRoleFromRequest, requireUserFromRequest } from '@/lib/auth/current-user';
import { AuthError } from '@/lib/auth/types';
import { createClient } from '@/lib/supabase/server';
import { REVIEW_CREATE_ROLES } from '@/lib/review-center/permissions';
import { createDraftSchema, listQuerySchema } from '@/lib/review-center/schemas';
import {
  createDraftReview,
  getCurrentProfile,
  listMyReviewCases,
  listReviewCases,
  ReviewServiceError,
} from '@/lib/review-center/service';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function authStatus(error: AuthError): number {
  return error.code === 'UNAUTHENTICATED' ? 401 : 403;
}

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireUserFromRequest(req);
  } catch (err) {
    if (err instanceof AuthError) return jsonError('未登录或无权限', authStatus(err));
    return jsonError('服务异常', 500);
  }

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listQuerySchema.safeParse(params);
  if (!parsed.success) return jsonError('查询参数无效', 400);

  const supabase = await createClient();
  if (!supabase) return jsonError('数据库不可用', 500);

  const profile = await getCurrentProfile(supabase, user.id);
  if (!profile) return jsonError('无有效档案', 403);

  try {
    const result = parsed.data.scope === 'mine'
      ? await listMyReviewCases(supabase, profile.org_id, profile.id, parsed.data)
      : await listReviewCases(supabase, profile.org_id, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ReviewServiceError) return jsonError(err.message, err.status);
    return jsonError('复盘列表读取失败', 500);
  }
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireRoleFromRequest(req, REVIEW_CREATE_ROLES);
  } catch (err) {
    if (err instanceof AuthError) return jsonError('无权限创建复盘', authStatus(err));
    return jsonError('服务异常', 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('请求体不是有效 JSON', 400);
  }

  const parsed = createDraftSchema.safeParse(body);
  if (!parsed.success) return jsonError('提交内容无效', 400);

  const supabase = await createClient();
  if (!supabase) return jsonError('数据库不可用', 500);

  const profile = await getCurrentProfile(supabase, user.id);
  if (!profile) return jsonError('无有效档案', 403);

  try {
    const review = await createDraftReview(supabase, profile.org_id, profile.id, parsed.data);
    return NextResponse.json(review, { status: 201 });
  } catch (err) {
    if (err instanceof ReviewServiceError) return jsonError(err.message, err.status);
    return jsonError('复盘创建失败', 500);
  }
}
