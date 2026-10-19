import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createClient } from '@/lib/supabase/server';

// Read-only customer lookup for the commercial editor.
// This intentionally respects existing Supabase RLS; it does not expand access
// to CPC customer data or change customer ownership.
export const dynamic = 'force-dynamic';

function respond(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return respond({ ok: false, message: '请先登录' }, 401);

  const raw = req.nextUrl.searchParams.get('q') ?? '';
  const query = raw.trim().slice(0, 80).replace(/[%_\\]/g, '');
  if (!query) return respond({ ok: true, customers: [] });
  const db = await createClient();
  if (!db) return respond({ ok: false, message: '客户库暂不可用，可直接填写客户名称' }, 503);

  try {
    const profileResult = await db.from('profiles')
      .select('id,org_id,is_active')
      .eq('user_id', user.id)
      .maybeSingle();
    const profile = profileResult.data;
    if (profileResult.error || !profile || profile.is_active === false) {
      return respond({ ok: false, message: '当前账号暂无客户库读取权限，可直接填写名称' }, 403);
    }

    const customerResult = await db.from('cpc_customer_references')
      .select('id,display_name_snapshot')
      .eq('org_id', profile.org_id)
      .in('status', ['active', 'pending_review'])
      .ilike('display_name_snapshot', '%' + query + '%')
      .order('display_name_snapshot', { ascending: true })
      .limit(25);

    if (customerResult.error) {
      return respond({ ok: false, message: '无法读取客户库，可直接填写名称' }, 403);
    }
    return respond({
      ok: true,
      customers: (customerResult.data ?? []).map(row => ({
        id: row.id,
        name: row.display_name_snapshot,
      })),
    });
  } catch {
    return respond({ ok: false, message: '客户库暂不可用，可直接填写客户名称' }, 503);
  }
}
