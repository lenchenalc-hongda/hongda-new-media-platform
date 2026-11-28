import { NextRequest, NextResponse } from 'next/server';
import { handleWosV1M2Request } from '@/lib/workshop-orders/production-m2-handler';
import { resolveWosProductionRuntime } from '@/lib/workshop-orders/production-runtime-contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const production = resolveWosProductionRuntime({
    vercelEnv: process.env.VERCEL_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    writesEnabled: process.env.WOS_V1_APP_WRITES_ENABLED,
    authMode: process.env.AUTH_MODE,
  });
  if (!production.writesEnabled) {
    return NextResponse.json({
      ok: false,
      code: 'WOS_V1_M2_WRITES_DISABLED',
      data: null,
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store, private' },
    });
  }
  return handleWosV1M2Request(req, {
    adapter: 'production',
    writesEnabled: production.writesEnabled,
  });
}
