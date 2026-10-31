import { NextRequest, NextResponse } from 'next/server';
import { draftContext, privateHeaders } from '@/lib/commercial-documents/cloud-drafts';
import { UUID_PATTERN, validateSupplierOrder } from '@/lib/commercial-supplier-orders/validation';
import { supplierOrdersEnabled } from '@/lib/commercial-supplier-orders/availability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const reply = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: privateHeaders });

export async function GET() {
  if (!supplierOrdersEnabled()) return reply({ok:false,message:'功能尚未开放'},503);
  const ctx = await draftContext();
  if (!ctx) return reply({ ok: false, message: '未授权' }, 403);

  let query = ctx.db.from('commercial_supplier_orders')
    .select('id,order_no,latest_version,created_at,owner_profile_id')
    .eq('org_id', ctx.profile.org_id)
    .order('created_at', { ascending: false })
    .limit(80);
  if (!['admin', 'manager'].includes(ctx.user.role)) {
    query = query.eq('owner_profile_id', ctx.profile.id);
  }
  const { data, error } = await query;
  if (error) return reply({ ok: false, message: '查询正式布产单失败' }, 503);
  return reply({ ok: true, orders: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!supplierOrdersEnabled()) return reply({ok:false,message:'功能尚未开放'},503);
  const ctx = await draftContext();
  if (!ctx) return reply({ ok: false, message: '无权保存' }, 403);
  let payload: unknown;
  try { payload = await request.json(); } catch {
    return reply({ ok: false, message: '请求格式错误' }, 400);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return reply({ ok: false, message: '请求格式错误' }, 400);
  }
  const body = payload as Record<string, unknown>;
  const requestId = body.requestId;
  const orderId = body.orderId ?? null;
  const expectedVersion = body.expectedVersion;
  if (typeof requestId !== 'string' || !UUID_PATTERN.test(requestId) ||
      (orderId !== null && (typeof orderId !== 'string' || !UUID_PATTERN.test(orderId))) ||
      typeof expectedVersion !== 'number' || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    return reply({ ok: false, message: '版本或幂等请求编号错误' }, 400);
  }

  const checked = validateSupplierOrder(body.snapshot);
  if (!checked.ok) return reply({ ok: false, message: checked.message }, 422);

  const { data, error } = await ctx.db.rpc('save_supplier_order_version', {
    p_request_id: requestId,
    p_order_id: orderId,
    p_expected_version: expectedVersion,
    p_snapshot: checked.snapshot,
    p_total_thousandths: checked.amountThousandths,
  });
  if (error) {
    const code = error.message.includes('VERSION_CONFLICT') ? 'VERSION_CONFLICT'
      : error.message.includes('REQUEST_MISMATCH') ? 'REQUEST_MISMATCH'
      : error.message.includes('AMOUNT_MISMATCH') ? 'AMOUNT_MISMATCH'
      : error.message.includes('NOT_AUTHORIZED') ? 'NOT_AUTHORIZED'
      : 'SAVE_FAILED';
    const status = code === 'VERSION_CONFLICT' || code === 'REQUEST_MISMATCH' ? 409
      : code === 'NOT_AUTHORIZED' ? 403
      : code === 'AMOUNT_MISMATCH' ? 422 : 503;
    return reply({
      ok: false,
      code,
      message: code === 'VERSION_CONFLICT' ? '订单已有更新版本，请重新打开后核对'
        : code === 'REQUEST_MISMATCH' ? '本次请求号对应另一份内容，请重新保存'
        : code === 'AMOUNT_MISMATCH' ? '订单金额与明细不一致'
        : '正式布产单保存失败，原始内容未覆盖',
    }, status);
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return reply({ ok: false, message: '归档响应异常' }, 503);
  return reply({
    ok: true,
    orderId: row.order_id,
    version: row.version,
    orderNo: row.order_no,
    savedAt: row.saved_at,
  }, 201);
}
