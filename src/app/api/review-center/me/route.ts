import { NextRequest, NextResponse } from 'next/server';
import { requireUserFromRequest } from '@/lib/auth/current-user';
import { AuthError } from '@/lib/auth/types';
import { canCreateReview } from '@/lib/review-center/permissions';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserFromRequest(req);
    return NextResponse.json({
      role: user.role,
      can_create_review: canCreateReview(user.role),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: '未登录或无权限' },
        { status: err.code === 'UNAUTHENTICATED' ? 401 : 403 },
      );
    }
    return NextResponse.json({ error: '服务异常' }, { status: 500 });
  }
}
