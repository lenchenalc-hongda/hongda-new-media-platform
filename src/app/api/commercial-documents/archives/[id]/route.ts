import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const BUCKET = 'hongda-commercial-pdfs';
const response = (data: Record<string, unknown>, code = 200) =>
  NextResponse.json(data, { status: code, headers: { 'Cache-Control': 'private, no-store' } });

async function authorizeArchive(id: string) {
  const user = await getCurrentUser();
  if (!user || user.authSource !== 'supabase' || !user.active) return null;
  const db = createAdminSupabaseClient();
  if (!db) return null;
  const { data: profile, error } = await db.from('profiles')
    .select('id,org_id,role,is_active').eq('user_id', user.id).maybeSingle();
  if (error || !profile || profile.is_active !== true) return null;
  const { data: row, error: rowError } = await db.from('commercial_quotation_archives')
    .select('id,org_id,owner_profile_id,document_no,version,buyer_name,salesperson_name,project_name,document_date,currency,amount_minor,archived_at,snapshot,pdf_storage_path,pdf_sha256')
    .eq('id', id).eq('org_id', profile.org_id).maybeSingle();
  if (rowError || !row) return null;
  if (row.owner_profile_id !== profile.id && !['admin','manager'].includes(profile.role)) return null;
  return { db, row };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return response({ ok: false, message: '档案 ID 不正确' }, 400);
  const archive = await authorizeArchive(id);
  if (!archive) return response({ ok: false, message: '档案不存在或无访问权限' }, 404);
  if (req.nextUrl.searchParams.get('download') === 'pdf') {
    const { data, error } = await archive.db.storage.from(BUCKET)
      .createSignedUrl(archive.row.pdf_storage_path, 60, { download: archive.row.document_no + '-v' + archive.row.version + '.pdf' });
    if (error || !data?.signedUrl) return response({ ok: false, message: '无法生成 PDF 私有下载链接' }, 503);
    return response({ ok: true, url: data.signedUrl, expiresIn: 60 });
  }
  const { pdf_storage_path, ...safeRow } = archive.row;
  return response({ ok: true, archive: safeRow });
}
