import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createClient } from '@/lib/supabase/server';
import { PAYMENT_METHOD_SOURCE_ROWS } from '@/lib/commercial-documents/payment-methods';

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
  const order = PAYMENT_METHOD_SOURCE_ROWS.map(method => method.key as string);
  methods.sort((a, b) => order.indexOf(a.methodKey) - order.indexOf(b.methodKey));
  return reply({ ok: true, methods });
}

