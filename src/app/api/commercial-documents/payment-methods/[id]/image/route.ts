import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};
function privateResponse(status: number) {
  return new NextResponse(null, { status, headers: privateHeaders });
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || !['admin', 'manager', 'operator', 'sales'].includes(user.role)) {
    return privateResponse(403);
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return privateResponse(400);
  const db = await createClient();
  if (!db) return privateResponse(503);
  const profile = await db.from('profiles').select('org_id,is_active,role')
    .eq('user_id', user.id).maybeSingle();
  if (profile.error || !profile.data?.is_active || profile.data.role !== user.role) {
    return privateResponse(403);
  }
  const result = await db.from('commercial_payment_methods')
    .select('kind,qr_png,qr_sha256,approved')
    .eq('id', params.id).eq('org_id', profile.data.org_id).maybeSingle();
  if (result.error || !result.data || result.data.kind !== 'qr') return privateResponse(404);
  if (!result.data.approved && !['admin', 'manager'].includes(user.role)) return privateResponse(403);
  const hex = result.data.qr_png;
  if (typeof hex !== 'string' || !/^\\x(?:[0-9a-f]{2})+$/i.test(hex)) return privateResponse(500);
  const bytes = Buffer.from(hex.slice(2), 'hex');
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(pngSignature)
      || createHash('sha256').update(bytes).digest('hex') !== result.data.qr_sha256) {
    return privateResponse(500);
  }
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': 'inline; filename="payment-qr.png"',
      ...privateHeaders,
    },
  });
}
