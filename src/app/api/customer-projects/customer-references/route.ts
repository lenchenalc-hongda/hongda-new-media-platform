import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCpcProfile } from '@/lib/customer-projects/api';

export const dynamic = 'force-dynamic';

const MAX_CUSTOMER_OPTIONS = 50;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  if (!supabase) return jsonError('数据库不可用', 500);

  const profileResult = await resolveCpcProfile(supabase);
  if (!profileResult.ok) {
    return jsonError(profileResult.message, profileResult.status);
  }
  const profile = profileResult.profile;

  const search = (req.nextUrl.searchParams.get('q') ?? '').trim();

  try {
    let query = supabase
      .from('cpc_customer_references')
      .select('id,reference_kind,display_name_snapshot,status,external_source,provisional_source_reference,updated_at')
      .eq('org_id', profile.orgId)
      .in('status', ['active', 'pending_review'])
      .order('updated_at', { ascending: false })
      .limit(MAX_CUSTOMER_OPTIONS);

    if (search) {
      query = query.ilike('display_name_snapshot', '%' + search.replace(/[%_]/g, '') + '%');
    }

    const result = await query;
    if (result.error) throw new Error('customer reference read failed');

    const customers = (result.data ?? []).map((row: any) => ({
      id: row.id,
      referenceKind: row.reference_kind,
      displayName: row.display_name_snapshot,
      status: row.status,
      sourceLabel: row.reference_kind === 'canonical'
        ? row.external_source
        : row.provisional_source_reference,
    }));

    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: { customers },
    });
  } catch {
    return jsonError('客户选择列表加载失败，请稍后重试。', 500);
  }
}
