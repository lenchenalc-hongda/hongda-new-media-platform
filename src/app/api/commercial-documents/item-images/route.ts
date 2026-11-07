import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { draftContext, privateHeaders } from '@/lib/commercial-documents/cloud-drafts';
import {
  QUOTATION_IMAGE_BUCKET, QUOTATION_IMAGE_URL_TTL_SECONDS, MAX_IMAGE_UPLOAD_BYTES,
  canAccessQuotationImagePath, imageExtension, validImageSignature,
} from '@/lib/commercial-documents/item-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const respond = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: privateHeaders });

/** Resolve an expiring private Storage URL. Call again when opening archived drafts. */
export async function GET(request: NextRequest) {
  const ctx = await draftContext();
  if (!ctx) return respond({ ok: false, message: '请先登录' }, 403);
  const path = request.nextUrl.searchParams.get('path');
  if (!canAccessQuotationImagePath(path, ctx.profile.org_id, ctx.profile.id, ctx.user.role)) {
    return respond({ ok: false, message: '没有权限查看此照片' }, 403);
  }
  const { data, error } = await ctx.db.storage.from(QUOTATION_IMAGE_BUCKET)
    .createSignedUrl(path!, QUOTATION_IMAGE_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return respond({ ok: false, message: '照片不存在或暂时无法查看' }, 404);
  }
  return respond({ ok: true, path, url: data.signedUrl });
}

/** One immutable object per upload; changing/removing a photo never deletes old archival images. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (origin && (!host || (() => { try { return new URL(origin).host !== host; } catch { return true; } })())) {
    return respond({ ok: false, message: '来源不匹配' }, 403);
  }
  const ctx = await draftContext();
  if (!ctx) return respond({ ok: false, message: '无权上传照片' }, 403);
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > MAX_IMAGE_UPLOAD_BYTES + 150000) {
    return respond({ ok: false, message: '图片最大 3 MB' }, 413);
  }
  let form: FormData;
  try { form = await request.formData(); }
  catch { return respond({ ok: false, message: '图片上传格式无效' }, 400); }
  const file = form.get('photo');
  if (!file || typeof file === 'string' || !('arrayBuffer' in file)) {
    return respond({ ok: false, message: '请选择一张照片' }, 400);
  }
  const image = file as File;
  const ext = imageExtension(image.type);
  if (!ext || image.size < 12 || image.size > MAX_IMAGE_UPLOAD_BYTES) {
    return respond({ ok: false, message: '仅支持 JPG、PNG、WebP，图片最大 3 MB' }, 422);
  }
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (!validImageSignature(bytes, image.type)) {
    return respond({ ok: false, message: '图片格式与内容不一致，请重新选择' }, 422);
  }
  const path = [ctx.profile.org_id, ctx.profile.id, randomUUID() + '.' + ext].join('/');
  const bucket = ctx.db.storage.from(QUOTATION_IMAGE_BUCKET);
  const { error: uploadError } = await bucket.upload(path, bytes, {
    contentType: image.type, cacheControl: '3600', upsert: false,
  });
  if (uploadError) {
    return respond({ ok: false, message: '图片保存失败，未写入报价单；请重试' }, 503);
  }
  const { data, error } = await bucket.createSignedUrl(path, QUOTATION_IMAGE_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return respond({ ok: false, message: '图片已上传但无法加载，请重新上传' }, 503);
  }
  return respond({ ok: true, path, url: data.signedUrl }, 201);
}
