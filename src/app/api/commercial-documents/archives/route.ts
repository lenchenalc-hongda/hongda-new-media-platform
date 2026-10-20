import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { documentAmount, isDraftShape, validateForPrint, type CommercialDocumentDraft } from '@/lib/commercial-documents/template';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'hongda-commercial-pdfs';
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const respond = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

async function context() {
  const user = await getCurrentUser();
  if (!user || user.authSource !== 'supabase' || !user.active) return null;
  const db = createAdminSupabaseClient();
  if (!db) return null;
  const { data: profile, error } = await db.from('profiles').select('id,org_id,role,is_active')
    .eq('user_id', user.id).maybeSingle();
  if (error || !profile?.is_active || !profile.org_id) return null;
  if (!['admin', 'manager', 'sales', 'operator'].includes(profile.role)) return null;
  return { user, db, profile };
}

export async function GET(req: NextRequest) {
  const ctx = await context();
  if (!ctx) return respond({ ok: false, message: '未授权访问报价档案' }, 403);
  const { profile, db } = ctx;
  const queryText = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 80).replace(/[%,_\\]/g, '');
  const page = Math.max(1, Math.min(1000, Number(req.nextUrl.searchParams.get('page')) || 1));
  let query = db.from('commercial_quotation_archives')
    .select('id,document_no,version,buyer_name,salesperson_name,project_name,document_date,currency,amount_minor,archived_at,owner_profile_id', { count: 'exact' })
    .eq('org_id', profile.org_id).order('archived_at', { ascending: false });
  if (!['admin', 'manager'].includes(profile.role)) query = query.eq('owner_profile_id', profile.id);
  if (queryText) query = query.or('document_no.ilike.%' + queryText + '%,buyer_name.ilike.%' + queryText + '%,project_name.ilike.%' + queryText + '%');
  const { data, error, count } = await query.range((page - 1) * 20, page * 20 - 1);
  if (error) return respond({ ok: false, message: '读取报价档案失败' }, 503);
  return respond({ ok: true, rows: data, total: count || 0, page });
}

export async function POST(req: NextRequest) {
  const ctx = await context();
  if (!ctx) return respond({ ok: false, message: '未授权保存报价档案' }, 403);
  const { profile, user, db } = ctx;
  if (Number(req.headers.get('content-length') || 0) > 14_500_000) {
    return respond({ ok: false, message: 'PDF 超过允许大小' }, 413);
  }
  let payload: { draft?: unknown; pdfBase64?: unknown; sourceArchiveId?: unknown };
  try { payload = await req.json(); }
  catch { return respond({ ok: false, message: '请求内容不正确' }, 400); }
  if (!isDraftShape(payload.draft)) return respond({ ok: false, message: '报价结构不正确' }, 400);
  const draft = payload.draft as CommercialDocumentDraft;
  if (draft.kind !== 'quotation') return respond({ ok: false, message: '首期仅支持产品报价单归档' }, 400);
  if (draft.salespersonName !== user.name) return respond({ ok: false, message: '归档业务员必须为当前账号' }, 403);
  const errors = validateForPrint(draft);
  if (errors.length) return respond({ ok: false, message: '报价校验未通过', errors }, 400);
  if (typeof payload.pdfBase64 !== 'string' || payload.pdfBase64.length > 14_100_000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.pdfBase64)) {
    return respond({ ok: false, message: '必须提交正式生成的 PDF 文件' }, 400);
  }
  const pdf = Buffer.from(payload.pdfBase64, 'base64');
  if (pdf.length < 100 || pdf.length > MAX_PDF_BYTES ||
      pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    return respond({ ok: false, message: 'PDF 文件格式或大小不正确' }, 400);
  }
  const sourceId = typeof payload.sourceArchiveId === 'string' && /^[0-9a-f-]{36}$/i.test(payload.sourceArchiveId)
    ? payload.sourceArchiveId : null;
  if (sourceId) {
    const { data: source } = await db.from('commercial_quotation_archives')
      .select('id,owner_profile_id,document_no')
      .eq('org_id', profile.org_id).eq('id', sourceId).maybeSingle();
    if (!source || source.document_no !== draft.documentNo ||
       (!['admin', 'manager'].includes(profile.role) && source.owner_profile_id !== profile.id)) {
      return respond({ ok: false, message: '无权引用指定的历史版本' }, 403);
    }
  }
  const docNo = draft.documentNo;
  const sha = createHash('sha256').update(pdf).digest('hex');
  const amountMinor = documentAmount(draft).amountMinor;
  // Unique index on (org_id, document_no, version) prevents concurrent overwrite.
  // On conflict we retry with a new version and object path.
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: latest, error: qError } = await db.from('commercial_quotation_archives')
      .select('version').eq('org_id', profile.org_id).eq('document_no', docNo)
      .order('version', { ascending: false }).limit(1);
    if (qError) return respond({ ok: false, message: '查询版本号失败，未归档' }, 503);
    const version = (latest?.[0]?.version || 0) + 1;
    const path = `${profile.org_id}/${randomUUID()}.pdf`;
    const uploaded = await db.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false });
    if (uploaded.error) return respond({ ok: false, message: 'PDF 私有存储失败，未归档' }, 503);
    const { data, error } = await db.from('commercial_quotation_archives').insert({
      org_id: profile.org_id, owner_profile_id: profile.id,
      document_no: docNo, version, source_archive_id: sourceId,
      buyer_name: draft.buyerName, buyer_customer_reference_id: null,
      salesperson_name: user.name, project_name: draft.projectName, document_date: draft.date,
      market: draft.market, language: draft.language, currency: draft.currency,
      amount_minor: amountMinor, snapshot: draft, pdf_storage_path: path,
      pdf_sha256: sha, pdf_size_bytes: pdf.length,
    }).select('id,document_no,version,archived_at').single();
    if (!error && data) return respond({ ok: true, archive: data }, 201);
    await db.storage.from(BUCKET).remove([path]);
    if (error?.code !== '23505') return respond({ ok: false, message: '保存报价档案失败，未归档' }, 503);
  }
  return respond({ ok: false, message: '版本冲突，请稍后重试' }, 409);
}
