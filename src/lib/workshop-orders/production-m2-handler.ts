import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { resolveVerifiedSupabaseIdentity } from '@/lib/auth/supabase-identity';
import { isSameOriginWosMutation } from '@/lib/workshop-orders/api-contract';
import { readBoundedRequestBody } from '@/lib/workshop-orders/bounded-request-body';
import {
  canActOnWosP2M2,
  canAuthorizeWosV1ProductionStart,
  isWosP2M2Result,
  isWosV1StartReleaseResult,
  parseWosP2M2Action,
  parseWosV1StartRelease,
  wosP2M2RpcArgs,
  wosV1StartReleaseRpcArgs,
} from '@/lib/workshop-orders/p2-m2-contract';

export type WosV1M2HandlerAdapter = 'production' | 'qa-uat';

export interface WosV1M2HandlerConfig {
  readonly adapter: WosV1M2HandlerAdapter;
  readonly writesEnabled: boolean;
  readonly authorizationId?: string;
}

const headers = { 'Cache-Control': 'no-store, private' } as const;

function answer(status: number, code: string, data: unknown = null): Response {
  return Response.json(
    { ok: status === 200, code, data },
    { status, headers },
  );
}

function rpcFailure(error: unknown, adapter: WosV1M2HandlerAdapter): Response {
  const value = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : null;
  const code = typeof value?.code === 'string' ? value.code : '';
  const message = typeof value?.message === 'string' ? value.message : '';
  if (code === '42501') {
    return answer(
      403,
      adapter === 'qa-uat'
        ? message || 'QA_UAT_GATE_CLOSED'
        : message || 'FORBIDDEN',
    );
  }
  if (code === 'PT409' || code === '23505') {
    return answer(409, message || 'VERSION_OR_EVIDENCE_CONFLICT');
  }
  if (code === '22023' || code === '22P02') {
    return answer(400, message || 'INVALID_INPUT');
  }
  if (code === 'PGRST202' || code === '42883') {
    return answer(
      503,
      adapter === 'qa-uat'
        ? 'WOS_V1_QA_UAT_M2_RPC_NOT_INSTALLED'
        : 'WOS_V1_M2_RPC_NOT_INSTALLED',
    );
  }
  return answer(
    503,
    adapter === 'qa-uat'
      ? 'WOS_V1_QA_UAT_M2_TRANSACTION_UNAVAILABLE'
      : 'WOS_V1_M2_TRANSACTION_UNAVAILABLE',
  );
}

function rpcName(
  adapter: WosV1M2HandlerAdapter,
  operation: 'M2_ACTION' | 'START_RELEASE',
): string {
  if (adapter === 'qa-uat') {
    return operation === 'M2_ACTION'
      ? 'wos_v1_qa_uat_m2_action'
      : 'wos_v1_qa_uat_authorize_production_start';
  }
  return operation === 'M2_ACTION'
    ? 'wos_v1_m2_action'
    : 'wos_v1_authorize_production_start';
}

function orderScopeAllowed(
  adapter: WosV1M2HandlerAdapter,
  orderNumber: string,
): boolean {
  if (adapter === 'qa-uat') {
    return orderNumber.startsWith('QA-NONPROD-');
  }
  return !orderNumber.startsWith('QA-');
}

export async function handleWosV1M2Request(
  req: Request,
  config: WosV1M2HandlerConfig,
): Promise<Response> {
  if (!config.writesEnabled) {
    return answer(
      503,
      config.adapter === 'qa-uat'
        ? 'WOS_V1_QA_UAT_M2_WRITES_DISABLED'
        : 'WOS_V1_M2_WRITES_DISABLED',
    );
  }
  if (config.adapter === 'qa-uat' && !config.authorizationId) {
    return answer(503, 'WOS_V1_QA_UAT_AUTHORIZATION_ID_REQUIRED');
  }
  if (!isSameOriginWosMutation(
    req.url,
    req.headers.get('origin'),
    req.headers.get('referer'),
    req.headers.get('host'),
    req.headers.get('x-forwarded-proto'),
  )
    || req.headers.get('x-wos-v1-m2') !== '1'
    || !req.headers.get('content-type')?.startsWith('application/json')) {
    return answer(403, 'ORIGIN_OR_HEADER_DENIED');
  }
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (!Number.isFinite(contentLength)
    || contentLength < 0
    || contentLength > 8192) {
    return answer(400, 'INVALID_INPUT');
  }

  let raw: unknown;
  try {
    const text = await readBoundedRequestBody(req, 8192);
    if (text === null) return answer(400, 'INVALID_INPUT');
    raw = JSON.parse(text);
  } catch {
    return answer(400, 'INVALID_INPUT');
  }
  const actionName = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>).action
    : null;
  const m2Action = actionName === 'START_RELEASE'
    ? null
    : parseWosP2M2Action(raw);
  const startRelease = actionName === 'START_RELEASE'
    ? parseWosV1StartRelease(raw)
    : null;
  if (!m2Action && !startRelease) return answer(400, 'INVALID_INPUT');
  if (m2Action?.action === 'BASELINE_SELECT'
    && m2Action.payload.imageIds.length !== 4) {
    return answer(400, 'FOUR_IMAGE_BASELINE_REQUIRED');
  }

  const client = await createClient();
  if (!client) {
    return answer(
      503,
      config.adapter === 'qa-uat'
        ? 'WOS_V1_QA_UAT_DATABASE_UNAVAILABLE'
        : 'WOS_V1_DATABASE_UNAVAILABLE',
    );
  }
  const identity = await resolveVerifiedSupabaseIdentity(client);
  if (!identity) return answer(401, 'UNAUTHENTICATED');
  const profile = await client.from('profiles')
    .select('id,user_id,org_id,role,is_active')
    .eq('user_id', identity.id)
    .eq('is_active', true)
    .maybeSingle();
  const actor = profile.data;
  const roleAllowed = m2Action
    ? canActOnWosP2M2(m2Action.action, actor?.role)
    : canAuthorizeWosV1ProductionStart(actor?.role);
  if (profile.error
    || !actor
    || actor.user_id !== identity.id
    || actor.is_active !== true
    || !roleAllowed) {
    return answer(403, 'FORBIDDEN');
  }

  const action = m2Action ?? startRelease;
  if (!action) return answer(400, 'INVALID_INPUT');
  const order = await client.from('wos_production_orders')
    .select('id,organization_id,order_number,workflow_status,version,created_by_profile_id,sales_owner_profile_id')
    .eq('id', action.orderId)
    .eq('organization_id', actor.org_id)
    .maybeSingle();
  if (order.error) {
    return answer(
      503,
      config.adapter === 'qa-uat'
        ? 'WOS_V1_QA_UAT_ORDER_READ_UNAVAILABLE'
        : 'WOS_V1_ORDER_READ_UNAVAILABLE',
    );
  }
  if (!order.data
    || order.data.organization_id !== actor.org_id
    || !orderScopeAllowed(config.adapter, order.data.order_number)
    || (actor.role === 'sales'
      && m2Action
      && (m2Action.action === 'BASELINE_SELECT'
        || m2Action.action === 'BASELINE_OFFICE_CONFIRM')
      && actor.id !== order.data.created_by_profile_id
      && actor.id !== order.data.sales_owner_profile_id)) {
    return answer(
      403,
      config.adapter === 'qa-uat' ? 'QA_UAT_ORDER_SCOPE_DENIED' : 'FORBIDDEN',
    );
  }

  if (m2Action) {
    const args = wosP2M2RpcArgs(m2Action);
    const result = await client.rpc(
      rpcName(config.adapter, 'M2_ACTION'),
      config.adapter === 'qa-uat'
        ? {
            p_authorization_id: config.authorizationId,
            ...args,
          }
        : args,
    );
    if (result.error) return rpcFailure(result.error, config.adapter);
    if (!isWosP2M2Result(result.data, m2Action)) {
      return answer(
        503,
        config.adapter === 'qa-uat'
          ? 'WOS_V1_QA_UAT_M2_UNVERIFIED_RESPONSE'
          : 'WOS_V1_M2_UNVERIFIED_RESPONSE',
      );
    }
    return answer(
      200,
      result.data.status === 'REPLAYED'
        ? 'WOS_V1_M2_REPLAY_VERIFIED'
        : 'WOS_V1_M2_ACTION_APPLIED',
      result.data,
    );
  }

  if (!startRelease) return answer(400, 'INVALID_INPUT');
  const args = wosV1StartReleaseRpcArgs(startRelease);
  const result = await client.rpc(
    rpcName(config.adapter, 'START_RELEASE'),
    config.adapter === 'qa-uat'
      ? {
          p_authorization_id: config.authorizationId,
          ...args,
        }
      : args,
  );
  if (result.error) return rpcFailure(result.error, config.adapter);
  if (!isWosV1StartReleaseResult(result.data, startRelease)) {
    return answer(
      503,
      config.adapter === 'qa-uat'
        ? 'WOS_V1_QA_UAT_START_RELEASE_UNVERIFIED_RESPONSE'
        : 'WOS_V1_START_RELEASE_UNVERIFIED_RESPONSE',
    );
  }
  return answer(
    200,
    result.data.status === 'REPLAYED'
      ? 'WOS_V1_START_RELEASE_REPLAY_VERIFIED'
      : 'WOS_V1_START_RELEASE_AUTHORIZED',
    result.data,
  );
}
