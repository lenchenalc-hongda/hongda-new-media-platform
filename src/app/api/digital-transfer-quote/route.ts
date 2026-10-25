import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getAuthMode } from '@/lib/auth/types';
import { loadPriceSchedule, quoteDigitalTransfer } from '@/lib/digital-transfer-pricing';

export const dynamic = 'force-dynamic';
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' },
});

// No GET endpoint, preventing price-table enumeration through a public listing.
export async function POST(request: NextRequest) {
  try {
    if (getAuthMode() !== 'supabase') return json({ ok:false, message:'需使用正式身份认证' }, 403);
    const user = await getCurrentUser();
    if (!user) return json({ ok:false, message:'请先登录' }, 401);
    if (!user.active || !['admin','manager','sales'].includes(user.role)) return json({ ok:false, message:'无报价查询权限' }, 403);
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({ ok:false, message:'仅支持JSON请求' }, 415);
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) return json({ ok:false, message:'来源不受信任' }, 403);
    const raw = await request.text();
    if (raw.length > 1024) return json({ ok:false, message:'请求过大' }, 413);
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body,'area')) {
      return json({ ok:false, message:'请求字段无效' }, 400);
    }
    const area = (body as { area: unknown }).area;
    const result = quoteDigitalTransfer(area, loadPriceSchedule(process.env.DIGITAL_TRANSFER_PRICE_TIERS));
    if (!result.ok) return json(result, result.code === 'UNAVAILABLE' ? 503 : 422);
    return json(result);
  } catch {
    return json({ ok:false, message:'请求解析或报价服务失败' }, 400);
  }
}
