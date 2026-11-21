import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveVerifiedSupabaseIdentity } from '@/lib/auth/supabase-identity';
import {
  canActOnWosP2M2,
  isWosP2M2Enabled,
  isWosP2M2Result,
  parseWosP2M2Action,
  wosP2M2RpcArgs,
} from '@/lib/workshop-orders/p2-m2-contract';
import { isSameOriginWosMutation } from '@/lib/workshop-orders/api-contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = { 'Cache-Control': 'no-store, private' } as const;
function answer(status: number, code: string, data: unknown = null) {
  return NextResponse.json({ ok: status === 200, code, data }, { status, headers });
}

export async function POST(req: NextRequest) {
  if (!isWosP2M2Enabled({
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
    flag: process.env.WOS_P2_QA_M2_ENABLED,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    allowLocal: process.env.WOS_ALLOW_LOCAL_SUPABASE,
    publicAllowLocal: process.env.NEXT_PUBLIC_WOS_ALLOW_LOCAL_SUPABASE,
  })) return answer(503, 'QA_P2_M2_NOT_AUTHORIZED');

  if (!isSameOriginWosMutation(
    req.url, req.headers.get('origin'), req.headers.get('referer'),
    req.headers.get('host'), req.headers.get('x-forwarded-proto'))
    || req.headers.get('x-wos-p2-m2') !== '1'
    || !req.headers.get('content-type')?.startsWith('application/json')) {
    return answer(403, 'ORIGIN_OR_HEADER_DENIED');
  }
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > 8192) {
    return answer(400, 'INVALID_INPUT');
  }

  let request: ReturnType<typeof parseWosP2M2Action>;
  try {
    const raw = await req.text();
    if (raw.length > 8192) return answer(400, 'INVALID_INPUT');
    request = parseWosP2M2Action(JSON.parse(raw));
  } catch {
    return answer(400, 'INVALID_INPUT');
  }
  if (!request) return answer(400, 'INVALID_INPUT');

  const client = await createClient();
  if (!client) return answer(503, 'QA_DATABASE_UNAVAILABLE');
  const identity = await resolveVerifiedSupabaseIdentity(client);
  if (!identity) return answer(401, 'UNAUTHENTICATED');
  const profile = await client.from('profiles')
    .select('id,user_id,org_id,role,is_active')
    .eq('user_id', identity.id).eq('is_active', true).maybeSingle();
  const actor = profile.data;
  if (profile.error || !actor || actor.user_id !== identity.id
    || actor.is_active !== true || !canActOnWosP2M2(request.action, actor.role)) {
    return answer(403, 'FORBIDDEN');
  }

  const order = await client.from('wos_production_orders')
    .select('id,organization_id,order_number,workflow_status,version')
    .eq('id', request.orderId).eq('organization_id', actor.org_id).maybeSingle();
  if (order.error) return answer(503, 'QA_ORDER_READ_UNAVAILABLE');
  if (!order.data || order.data.organization_id !== actor.org_id
    || !order.data.order_number.startsWith('QA-')) {
    return answer(403, 'FORBIDDEN');
  }

  const result = await client.rpc('wos_qa_p2_m2_action', wosP2M2RpcArgs(request));
  if (result.error) {
    const code = result.error.code ?? '';
    if (code === '42501') return answer(403, 'FORBIDDEN_OR_DB_GATE_CLOSED');
    if (code === 'PT409' || code === '23505') {
      return answer(409, 'VERSION_OR_EVIDENCE_CONFLICT');
    }
    if (code === '22023' || code === '22P02') return answer(400, 'INVALID_INPUT');
    if (code === 'PGRST202' || code === '42883') return answer(503, 'QA_P2_M2_RPC_NOT_INSTALLED');
    return answer(503, 'QA_P2_M2_TRANSACTION_UNAVAILABLE');
  }
  if (!isWosP2M2Result(result.data, request)) {
    return answer(503, 'QA_P2_M2_UNVERIFIED_RESPONSE');
  }
  return answer(200, result.data.status === 'REPLAYED'
    ? 'QA_P2_M2_REPLAY_VERIFIED' : 'QA_P2_M2_ACTION_APPLIED', result.data);
}
