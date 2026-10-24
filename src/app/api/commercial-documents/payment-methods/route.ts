import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createClient } from '@/lib/supabase/server';
import { parsePaymentWorkbook } from '@/lib/commercial-documents/payment-xlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers });
}

async function context() {
  const user = await getCurrentUser();
  if (!user || !['admin', 'manager', 'operator', 'sales'].includes(user.role)) return null;
  const db = await createClient();
  if (!db) return null;
  const profileResult = await db.from('profiles').select('id,org_id,role,is_active')
    .eq('user_id', user.id).maybeSingle();
  const profile = profileResult.data;
  if (profileResult.error || !profile || !profile.is_active || profile.role !== user.role) return null;
  return { user, db, profile };
}

export async function GET() {
  const ctx = await context();
  if (!ctx) return reply({ ok: false, message: '无权查看收款账户或测试数据库未登录' }, 403);
  const query = ctx.db.from('commercial_payment_methods')
    .select('id,method_key,kind,label_zh,label_en,beneficiary,bank_name,account_no,notes,source_cell,source_numeric,approved,qr_sha256')
    .eq('org_id', ctx.profile.org_id)
    .order('method_key');
  // Defense in depth; RLS enforces the same rule.
  if (!['admin', 'manager'].includes(ctx.user.role)) query.eq('approved', true);
  const result = await query;
  if (result.error) return reply({ ok: false, message: '收款账户库尚未准备好' }, 503);
  const methods = (result.data ?? []).map(row => ({
    id: row.id,
    methodKey: row.method_key,
    kind: row.kind,
    labelZh: row.label_zh,
    labelEn: row.label_en,
    beneficiary: row.beneficiary,
    bankName: row.bank_name,
    accountNo: row.account_no,
    notes: row.notes,
    sourceCell: row.source_cell,
    sourceNumeric: row.source_numeric,
    approved: row.approved,
    qrSha256: row.qr_sha256,
    qrUrl: row.kind === 'qr'
      ? '/api/commercial-documents/payment-methods/' + encodeURIComponent(row.id) + '/image'
      : null,
  }));
  return reply({ ok: true, methods });
}

/** Review-only import. Payment data and raw QR are never committed to GitHub. */
export async function POST(req: NextRequest) {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (process.env.VERCEL_ENV === 'production' ||
      !configuredUrl.startsWith('https://xulmpqaknlwqqculbsek.supabase.co')) {
    return reply({ ok: false, message: '安全保护：仅允许已核验的独立测试数据库导入，不允许操作正式环境' }, 403);
  }
  const ctx = await context();
  if (!ctx || ctx.user.role !== 'admin') return reply({ ok: false, message: '仅测试环境管理员可以导入' }, 403);
  let methods: ReturnType<typeof parsePaymentWorkbook>;
  try {
    const form = await req.formData();
    const file = form.get('workbook');
    if (!(file instanceof File) || file.size > 2 * 1024 * 1024 || file.size === 0) {
      return reply({ ok: false, message: '请选择原始 XLSX（限 2 MB）' }, 400);
    }
    methods = parsePaymentWorkbook(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法解析 Excel';
    return reply({ ok: false, message: '导入未执行：' + message }, 422);
  }
  const rows = methods.map(m => ({
    org_id: ctx.profile.org_id,
    method_key: m.method_key,
    kind: m.kind,
    label_zh: m.label_zh,
    label_en: m.label_en,
    beneficiary: m.beneficiary,
    bank_name: m.bank_name,
    account_no: m.account_no,
    notes: m.notes,
    source_cell: m.source_cell,
    source_numeric: m.source_numeric,
    // Bytea hex avoids numeric, character-set and base64 interpretation mistakes.
    qr_png: m.qr_png ? '\\x' + m.qr_png.toString('hex') : null,
    qr_sha256: m.qr_sha256,
    approved: false,
    approved_by: null,
    approved_at: null,
    imported_by: ctx.profile.id,
    imported_at: new Date().toISOString(),
  }));
  const written = await ctx.db.from('commercial_payment_methods')
    .upsert(rows, { onConflict: 'org_id,method_key' })
    .select('id,method_key,approved');
  if (written.error || (written.data?.length ?? 0) !== methods.length) {
    return reply({ ok: false, message: '数据库未确认全部导入，账户保持待审核；请联系管理员检查' }, 503);
  }
  return reply({
    ok: true, imported: written.data?.length ?? 0,
    pendingApproval: true,
    warnings: methods.filter(m => m.source_numeric).map(m => m.source_cell + ' 原单元格为数值类型：按 Excel 存储的原始数字字符串保留，需人工核查前导零。'),
  });
}
