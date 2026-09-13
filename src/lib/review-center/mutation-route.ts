import { NextRequest, NextResponse } from 'next/server';
import { requireUserFromRequest } from '@/lib/auth/current-user';
import { AuthError } from '@/lib/auth/types';
import { createClient } from '@/lib/supabase/server';
import { mapReviewMutationResult, type MutationRpcResult } from './mutation';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function authStatus(error: AuthError): number {
  return error.code === 'UNAUTHENTICATED' ? 401 : 403;
}

export async function runMutationRoute(
  req: NextRequest,
  params: Record<string, string>,
  paramsSchema: any,
  bodySchema: any,
  rpc: (client: any, params: any, body: any) => Promise<MutationRpcResult>,
) {
  try {
    await requireUserFromRequest(req);
  } catch (err) {
    if (err instanceof AuthError) return jsonError('未登录或无权限', authStatus(err));
    return jsonError('服务异常', 500);
  }

  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) return jsonError('请求参数无效', 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('请求体不是有效 JSON', 400);
  }

  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) return jsonError('提交内容无效', 400);

  const supabase = await createClient();
  if (!supabase) return jsonError('数据库不可用', 500);

  try {
    const result = await rpc(supabase, parsedParams.data, parsedBody.data);
    const mapped = mapReviewMutationResult(result);
    return NextResponse.json(mapped.body, { status: mapped.status });
  } catch {
    return jsonError('服务异常', 500);
  }
}
