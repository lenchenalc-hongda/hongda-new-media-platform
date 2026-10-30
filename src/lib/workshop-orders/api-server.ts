import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { resolveVerifiedSupabaseIdentity } from '@/lib/auth/supabase-identity';
import { createClient } from '@/lib/supabase/server';
import {
  WOS_ACTIVE_PRODUCTION_STATUSES,
  WOS_ACTIVE_SAMPLING_STATUSES,
  WOS_API_INPUT_LIMIT_CHARS,
  WOS_INBOX_LIMIT_PER_TYPE,
  buildWosLiveInbox,
  canSubmitWosOfficeRequest,
  isWosNonproductionApiEnabled,
  isApprovedWosSandboxUrl,
  resolveWosApiActor,
  validateWosPostEnvelope,
  type WosApiActor,
} from './api-contract';
import type { WosEntityType } from './domain';

const headers = { 'Cache-Control': 'no-store, private' } as const;

function response(code: string, status: number, data: unknown = null) {
  return NextResponse.json({ ok: status === 200, code, data }, { status, headers });
}

function enabled(): boolean {
  return isWosNonproductionApiEnabled({
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
    enabled: process.env.WOS_P5C_NONPROD_API_ENABLED,
  }) && isApprovedWosSandboxUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

async function authenticatedWosClient(): Promise<
  | { ok: true; client: NonNullable<Awaited<ReturnType<typeof createClient>>>; actor: WosApiActor }
  | { ok: false; status: number; code: string }
> {
  const client = await createClient();
  if (!client) return { ok: false, status: 503, code: 'DATABASE_UNAVAILABLE' };

  const identity = await resolveVerifiedSupabaseIdentity(client);
  if (!identity) return { ok: false, status: 401, code: 'UNAUTHENTICATED' };

  // Profile is authoritative. Never accept organization, user or owner IDs
  // from client query, request body or editable user_metadata claims.
  const result = await client.from('profiles')
    .select('id,user_id,org_id,role,is_active')
    .eq('user_id', identity.id)
    .eq('is_active', true)
    .maybeSingle();
  if (result.error || !result.data) {
    return { ok: false, status: 403, code: 'FORBIDDEN' };
  }

  const actor = resolveWosApiActor(identity.id, result.data);
  if (!actor.ok) return actor;
  return { ok: true, client, actor: actor.actor };
}

export async function readWosWorkshopInbox() {
  // This code may be deployed on a shared master, but must never read the
  // Production database until a separate, specific Production authorization.
  if (!enabled()) return response('NONPRODUCTION_ONLY_DISABLED', 503);
  const auth = await authenticatedWosClient();
  if (!auth.ok) return response(auth.code, auth.status);

  try {
    const { client, actor } = auth;
    const [production, sampling] = await Promise.all([
      client.from('wos_production_orders')
        .select('id,organization_id,customer_name_snapshot,order_number,product_name,project_owner_profile_id,priority,is_urgent,version,version_label,workflow_status,submitted_at')
        .eq('organization_id', actor.orgId)
        .in('workflow_status', WOS_ACTIVE_PRODUCTION_STATUSES)
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true })
        .limit(WOS_INBOX_LIMIT_PER_TYPE + 1),
      client.from('wos_sampling_requests')
        .select('id,organization_id,customer_name_snapshot,product_name,product_owner_profile_id,is_urgent,version,version_label,workflow_status,submitted_at')
        .eq('organization_id', actor.orgId)
        .in('workflow_status', WOS_ACTIVE_SAMPLING_STATUSES)
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true })
        .limit(WOS_INBOX_LIMIT_PER_TYPE + 1),
    ]);

    if (production.error || sampling.error) return response('DATABASE_READ_UNAVAILABLE', 503);
    const productionRows = production.data ?? [];
    const samplingRows = sampling.data ?? [];
    if (productionRows.length > WOS_INBOX_LIMIT_PER_TYPE
      || samplingRows.length > WOS_INBOX_LIMIT_PER_TYPE) {
      return response('INBOX_LIMIT_EXCEEDED', 409);
    }

    const ownerIds = Array.from(new Set([
      ...productionRows.map(row => row.project_owner_profile_id),
      ...samplingRows.map(row => row.product_owner_profile_id),
    ]));
    let owners: string[] = [];
    if (ownerIds.length > 0) {
      if (ownerIds.some(id => typeof id !== 'string' || !id)) {
        return response('UNTRUSTED_DB_ROW', 409);
      }
      const ownerResult = await client.from('profiles')
        .select('id,org_id,is_active')
        .eq('org_id', actor.orgId)
        .eq('is_active', true)
        .in('id', ownerIds)
        .limit(WOS_INBOX_LIMIT_PER_TYPE * 2 + 1);
      if (ownerResult.error) return response('DATABASE_READ_UNAVAILABLE', 503);
      const found = ownerResult.data ?? [];
      if (found.length !== ownerIds.length
        || found.some(row => row.org_id !== actor.orgId || row.is_active !== true)) {
        return response('UNTRUSTED_DB_ROW', 409);
      }
      owners = found.map(row => row.id);
    }

    const projection = buildWosLiveInbox({
      actor, productionRows, samplingRows, activeOwnerProfileIds: owners,
    });
    if (!projection.ok) return response(projection.code, 409);
    return response('OK', 200, {
      mode: 'LIVE_READ_ONLY',
      projectAuthority: 'WOS',
      source: 'SUPABASE_RLS',
      items: projection.items,
      count: projection.items.length,
    });
  } catch {
    return response('DATABASE_READ_UNAVAILABLE', 503);
  }
}

export async function rejectUnsafeWosOfficePost(req: NextRequest, entityType: WosEntityType) {
  if (!enabled()) return response('NONPRODUCTION_ONLY_DISABLED', 503);
  const auth = await authenticatedWosClient();
  if (!auth.ok) return response(auth.code, auth.status);
  if (!canSubmitWosOfficeRequest(auth.actor.role)) return response('FORBIDDEN', 403);

  const lengthHeader = req.headers.get('content-length');
  if (lengthHeader && Number(lengthHeader) > WOS_API_INPUT_LIMIT_CHARS) {
    return response('INVALID_INPUT', 400);
  }
  let value: unknown;
  try {
    const raw = await req.text();
    if (raw.length > WOS_API_INPUT_LIMIT_CHARS) return response('INVALID_INPUT', 400);
    value = JSON.parse(raw);
  } catch {
    return response('INVALID_INPUT', 400);
  }
  if (!validateWosPostEnvelope(value)) return response('INVALID_INPUT', 400);

  // Existing Phase 1 tables only permit independent DRAFT INSERTs; they do
  // not atomically create a SUBMITTED record, immutable audit trail and
  // idempotent inbox projection. Never pretend an insert equals submission.
  // Both distinct entry types deliberately share this fail-closed gate.
  if (entityType !== 'PRODUCTION_ORDER' && entityType !== 'SAMPLING_REQUEST') {
    return response('INVALID_INPUT', 400);
  }
  return response('ATOMIC_SUBMISSION_RPC_REQUIRED', 409, {
    entityType,
    persisted: false,
    productionChanged: false,
  });
}
