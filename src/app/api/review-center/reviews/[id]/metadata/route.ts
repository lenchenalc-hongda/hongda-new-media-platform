import { NextRequest, NextResponse } from 'next/server';
import { requireUserFromRequest } from '@/lib/auth/current-user';
import { AuthError } from '@/lib/auth/types';
import { createClient } from '@/lib/supabase/server';
import { reviewIdSchema, metadataMutationSchema } from '@/lib/review-center/schemas';
import { getCurrentProfile, getReviewMetadataDTO } from '@/lib/review-center/service';
import {
  updateReviewMetadata,
  mapReviewMutationResult,
  buildMetadataRpcPayload,
} from '@/lib/review-center/mutation';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const parsedParams = reviewIdSchema.safeParse(params);
  if (!parsedParams.success) return jsonError('复盘编号无效', 404);

  let user;
  try {
    user = await requireUserFromRequest(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonError('未登录或无权限', err.code === 'UNAUTHENTICATED' ? 401 : 403);
    }
    return jsonError('服务异常', 500);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError('提交内容无效', 400);
  }

  const parsedBody = metadataMutationSchema.safeParse(rawBody);
  if (!parsedBody.success) return jsonError('提交内容无效', 400);

  const supabase = await createClient();
  if (!supabase) return jsonError('数据库不可用', 500);

  const profile = await getCurrentProfile(supabase, user.id);
  if (!profile) return jsonError('无有效档案', 403);

  try {
    const metadataPayload = buildMetadataRpcPayload(parsedBody.data);
    const result = await updateReviewMetadata(
      supabase,
      parsedParams.data.id,
      parsedBody.data.expectedVersion,
      metadataPayload,
    );
    const mapped = mapReviewMutationResult(result);
    if (mapped.status !== 200) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }

    const rawVersion = (mapped.body.data as Record<string, unknown> | undefined)?.newVersion;
    const version = typeof rawVersion === 'number'
      && Number.isInteger(rawVersion)
      && rawVersion >= 1
      ? rawVersion
      : null;
    if (version === null) return jsonError('服务异常', 500);

    const metadata = await getReviewMetadataDTO(supabase, profile.org_id, parsedParams.data.id);
    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: { version, metadata },
    });
  } catch {
    return jsonError('服务异常', 500);
  }
}
