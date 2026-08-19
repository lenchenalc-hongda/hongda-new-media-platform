import { NextRequest, NextResponse } from 'next/server';
import { requireUserFromRequest } from '@/lib/auth/current-user';
import { AuthError } from '@/lib/auth/types';
import { createClient } from '@/lib/supabase/server';
import {
  callProfileDirectory,
  mapProfileDirectoryResult,
  parseProfileDirectoryQuery,
} from '@/lib/review-center/profile-directory';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    await requireUserFromRequest(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonError('未登录或无权限', err.code === 'UNAUTHENTICATED' ? 401 : 403);
    }
    return jsonError('服务异常', 500);
  }

  const parsed = parseProfileDirectoryQuery(req.nextUrl.searchParams);
  if (!parsed.success) return jsonError('查询参数无效', 400);

  const supabase = await createClient();
  if (!supabase) return jsonError('数据库不可用', 500);

  try {
    const result = await callProfileDirectory(supabase, parsed.data.purpose);
    const mapped = mapProfileDirectoryResult(result);
    return NextResponse.json(mapped.body, { status: mapped.status });
  } catch {
    return jsonError('服务异常', 500);
  }
}
