import { NextRequest, NextResponse } from 'next/server';
import { requireUserFromRequest } from '@/lib/auth/current-user';
import { AuthError } from '@/lib/auth/types';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/review-center/service';
import {
  buildMetadataOptionsDto,
  canReadMetadataOptions,
} from '@/lib/review-center/metadata';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
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
  if (!canReadMetadataOptions(profile)) {
    return jsonError('无有效档案', 403);
  }

  try {
    const { data, error } = await supabase
      .from('review_dict_items')
      .select('org_id,dict_type,code,label,description,sort_order,is_system,enabled')
      .is('org_id', null)
      .eq('is_system', true)
      .eq('enabled', true)
      .in('dict_type', ['MATERIAL', 'PROCESS', 'PROBLEM_DOMAIN', 'PROBLEM_SYMPTOM'])
      .order('sort_order', { ascending: true })
      .order('code', { ascending: true });
    if (error) return jsonError('服务异常', 500);

    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: buildMetadataOptionsDto(data ?? []),
    });
  } catch {
    return jsonError('服务异常', 500);
  }
}
