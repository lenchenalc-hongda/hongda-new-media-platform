import type { NextRequest } from 'next/server';
import { handleWosV1M2Request } from '@/lib/workshop-orders/production-m2-handler';
import { resolveWosV1QaM2Runtime } from '@/lib/workshop-orders/production-app-contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<Response> {
  const qa = resolveWosV1QaM2Runtime({
    vercelEnv: process.env.VERCEL_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    authMode: process.env.AUTH_MODE,
    qaEnabled: process.env.WOS_V1_QA_APP_ENABLED,
    qaUatM2Enabled: process.env.WOS_V1_QA_UAT_M2_ENABLED,
    qaUatM2WritesEnabled: process.env.WOS_V1_QA_UAT_M2_WRITES_ENABLED,
    qaUatAuthorizationId: process.env.WOS_V1_QA_UAT_AUTHORIZATION_ID,
  });
  if (!qa.writesEnabled) {
    return Response.json({
      ok: false,
      code: 'WOS_V1_QA_UAT_M2_WRITES_DISABLED',
      data: null,
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store, private' },
    });
  }
  return handleWosV1M2Request(req, {
    adapter: 'qa-uat',
    writesEnabled: qa.writesEnabled,
    authorizationId: qa.authorizationId,
  });
}
