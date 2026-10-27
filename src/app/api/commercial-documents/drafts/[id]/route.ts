import { NextRequest, NextResponse } from 'next/server';
import { draftContext, draftMetadata, privateHeaders, safeDraft } from '@/lib/commercial-documents/cloud-drafts';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Context = { params: { id: string } };
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}
export async function GET(_req: NextRequest, { params }: Context) {
  if (!uuid.test(params.id)) return response({ ok: false }, 400);
  const ctx = await draftContext();
  if (!ctx) return response({ ok: false }, 403);
  let query = ctx.db.from('commercial_quotation_drafts')
    .select('id,owner_profile_id,draft_json,revision,updated_at')
    .eq('id', params.id).eq('org_id', ctx.profile.org_id).eq('status', 'active');
  if (!['admin','manager'].includes(ctx.user.role)) query = query.eq('owner_profile_id', ctx.profile.id);
  const { data, error } = await query.maybeSingle();
  if (error) return response({ ok: false, message: '读取草稿失败' }, 503);
  if (!data) return response({ ok: false, message: '草稿不存在或没有权限' }, 404);
  return response({ ok: true, draft: data.draft_json, id: data.id, revision: data.revision,
    updatedAt: data.updated_at, canEdit: data.owner_profile_id === ctx.profile.id });
}
export async function PATCH(request: NextRequest, { params }: Context) {
  if (!uuid.test(params.id)) return response({ ok: false }, 400);
  const ctx = await draftContext();
  if (!ctx) return response({ ok: false }, 403);
  let payload: Record<string, unknown>;
  try { payload = await request.json(); } catch { return response({ ok: false }, 400); }
  if (!payload || !Number.isSafeInteger(payload.revision) || (payload.revision as number) < 1)
    return response({ ok: false, message: '草稿修订号无效' }, 400);
  const draft = safeDraft(payload.draft, ctx.user.name);
  if (!draft) return response({ ok: false, message: '草稿格式无效' }, 422);
  // Updates must be conditional on exact revision and active owner, preventing lost edits.
  const { data, error } = await ctx.db.from('commercial_quotation_drafts')
    .update({
      draft_json: draft, ...draftMetadata(draft),
      revision: (payload.revision as number) + 1,
      updated_at: new Date().toISOString(),
      updated_by_profile_id: ctx.profile.id,
    })
    .eq('id', params.id).eq('org_id', ctx.profile.org_id)
    .eq('owner_profile_id', ctx.profile.id).eq('status','active')
    .eq('revision', payload.revision as number)
    .select('id,revision,updated_at').maybeSingle();
  if (error) return response({ ok: false, message: '保存失败，请保留当前内容' }, 503);
  if (!data) return response({ ok: false, code: 'REVISION_CONFLICT', message: '云端草稿已在别处更新，请先复制当前内容，再重新打开核对，防止覆盖' }, 409);
  return response({ ok: true, id: data.id, revision: data.revision, updatedAt: data.updated_at });
}
export async function DELETE(request: NextRequest, { params }: Context) {
  if (!uuid.test(params.id)) return response({ ok: false }, 400);
  const ctx = await draftContext();
  if (!ctx) return response({ ok: false }, 403);
  let payload: Record<string, unknown>;
  try { payload = await request.json(); } catch { return response({ ok: false }, 400); }
  if (!payload || !Number.isSafeInteger(payload.revision)) return response({ ok: false }, 400);
  const { data,error } = await ctx.db.from('commercial_quotation_drafts')
    .update({ status: 'deleted', revision: (payload.revision as number) + 1,
      updated_at: new Date().toISOString(), updated_by_profile_id: ctx.profile.id })
    .eq('id',params.id).eq('org_id',ctx.profile.org_id).eq('owner_profile_id',ctx.profile.id)
    .eq('status','active').eq('revision',payload.revision as number).select('id').maybeSingle();
  if (error) return response({ ok: false, message: '删除失败' }, 503);
  if (!data) return response({ ok:false,code:'REVISION_CONFLICT',message:'草稿已改变，不能直接删除' },409);
  return response({ ok: true });
}
