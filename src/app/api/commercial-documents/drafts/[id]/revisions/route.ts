import { NextRequest, NextResponse } from 'next/server';
import { draftContext, privateHeaders } from '@/lib/commercial-documents/cloud-drafts';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!uuid.test(params.id)) return NextResponse.json({ ok: false }, { status: 400, headers: privateHeaders });
  const ctx = await draftContext();
  if (!ctx) return NextResponse.json({ ok: false }, { status: 403, headers: privateHeaders });
  let query = ctx.db.from('commercial_quotation_draft_revisions')
    .select('revision,status,snapshot,recorded_at,editor_profile_id')
    .eq('draft_id', params.id).eq('org_id', ctx.profile.org_id)
    .order('revision', { ascending: false }).limit(30);
  if (!['admin','manager'].includes(ctx.user.role)) query = query.eq('owner_profile_id',ctx.profile.id);
  const { data,error } = await query;
  if (error) return NextResponse.json({ ok: false, message: '历史版本读取失败' }, { status: 503, headers: privateHeaders });
  return NextResponse.json({ ok: true, revisions: data ?? [] }, { headers: privateHeaders });
}
