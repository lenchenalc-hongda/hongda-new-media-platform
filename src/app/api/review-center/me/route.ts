import { NextRequest, NextResponse } from 'next/server';
import { requireUserFromRequest } from '@/lib/auth/current-user';
import { AuthError } from '@/lib/auth/types';
import { canCreateReview } from '@/lib/review-center/permissions';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/review-center/service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserFromRequest(req);
    const supabase = await createClient();
    let profileId: string | null = null;
    if (supabase) {
      const profile = await getCurrentProfile(supabase, user.id);
      profileId = profile?.id ?? null;
    }
    return NextResponse.json({
      role: user.role,
      can_create_review: canCreateReview(user.role),
      profile_id: profileId,
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
