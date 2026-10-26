import { NextRequest, NextResponse } from 'next/server';
import { draftContext, draftMetadata, privateHeaders, safeDraft } from '@/lib/commercial-documents/cloud-drafts';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}
export async function GET(request: NextRequest) {
  const ctx = await draftContext();
  if (!ctx) return response({ ok: false, message: '请重新登录' }, 403);
  const search = (request.nextUrl.searchParams.get('search') ?? '').trim().slice(0, 80);
  let query = ctx.db.from('commercial_quotation_drafts')
    .select('id,owner_profile_id,document_no,buyer_name,project_name,language,revision,updated_at,status')
    .eq('org_id', ctx.profile.org_id).eq('status', 'active')
    .order('updated_at', { ascending: false }).limit(80);
  if (!['admin','manager'].includes(ctx.user.role)) query = query.eq('owner_profile_id', ctx.profile.id);
  if (search) query = query.or('document_no.ilike.%' + search.replace(/[%_,().]/g, '') +
    '%,buyer_name.ilike.%' + search.replace(/[%_,().]/g, '') + '%');
  const { data, error } = await query;
  if (error) return response({ ok: false, message: '云端草稿库暂不可用' }, 503);
  return response({ ok: true, drafts: data ?? [] });
}
export async function POST(request: NextRequest) {
  const ctx = await draftContext();
  if (!ctx) return response({ ok: false, message: '无权创建报价草稿' }, 403);
  let payload: unknown;
  try { payload = await request.json(); } catch { return response({ ok: false, message: '请求格式无效' }, 400); }
  const value = typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>).draft : null;
  const draft = safeDraft(value, ctx.user.name);
  if (!draft) return response({ ok: false, message: '草稿内容格式无效或超过容量限制' }, 422);
  const { data, error } = await ctx.db.from('commercial_quotation_drafts')
    .insert({
      org_id: ctx.profile.org_id, owner_profile_id: ctx.profile.id,
      updated_by_profile_id: ctx.profile.id, draft_json: draft,
      ...draftMetadata(draft),
    }).select('id,revision,updated_at').single();
  if (error || !data) return response({ ok: false, message: '草稿保存失败，请保留当前编辑内容' }, 503);
  return response({ ok: true, id: data.id, revision: data.revision, updatedAt: data.updated_at }, 201);
}
