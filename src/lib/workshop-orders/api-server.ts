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
  parseWosProductionSubmitEnvelope,
  validateWosPostEnvelope,
  type WosApiActor,
} from './api-contract';
import type { WosEntityType } from './domain';
import { submitWosProductionNonproduction } from './p7-nonprod-submit';

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
    // A P2 workshop state is always linked to the exact immutable P1
    // submission receipt and original Inbox. P2 never creates a second Inbox,
    // and the Inbox table's CHECK constraint allows only SUBMITTED.
    // Never fabricate a queue item from an order row without its receipt.
    const persistedRows = production.data ?? [];
    if (persistedRows.length > 0) {
      const ids = persistedRows.map(row => row.id);
      const [taskRows, receiptRows] = await Promise.all([
        client.from('wos_workshop_inbox')
          .select('id,organization_id,order_id,submission_id,source_revision,source_version_label,workflow_status')
          .eq('organization_id', actor.orgId).in('order_id', ids).limit(WOS_INBOX_LIMIT_PER_TYPE + 1),
        client.from('wos_submission_receipts')
          .select('id,organization_id,order_id,source_revision,source_version_label')
          .eq('organization_id', actor.orgId).in('order_id', ids).limit(WOS_INBOX_LIMIT_PER_TYPE + 1),
      ]);
      if (taskRows.error || receiptRows.error) return response('DATABASE_READ_UNAVAILABLE', 503);
      const tasks = taskRows.data ?? [];
      const receipts = receiptRows.data ?? [];
      if (tasks.length !== persistedRows.length || receipts.length !== persistedRows.length)
        return response('WORKSHOP_TRANSACTION_MISMATCH', 409);
      // A corrected order keeps its immutable P1 Inbox/receipt, while the
      // current revision label advances. Verify every advanced label against
      // an append-only, RLS-scoped Office revision history record.
      const revised = persistedRows.filter(order =>
        !tasks.some(task => task.order_id===order.id &&
          task.source_version_label===order.version_label));
      const revisionIds = revised.map(order=>order.id);
      const amendments = revisionIds.length ? await client.from('wos_status_history')
        .select('organization_id,entity_type,entity_id,reason_code,metadata')
        .eq('organization_id',actor.orgId).eq('entity_type','PRODUCTION_ORDER')
        .in('entity_id',revisionIds)
        .in('reason_code',['QA_P2_OFFICE_SAVE_CORRECTION','QA_P2_OFFICE_RESUBMIT_CORRECTION'])
        .limit(401) : null;
      if (amendments && (amendments.error || !Array.isArray(amendments.data)
        || amendments.data.length>=401)) return response('WORKSHOP_REVISION_UNVERIFIED',409);
      const taskByOrder = new Map(tasks.map(task => [task.order_id, task]));
      const receiptById = new Map(receipts.map(receipt => [receipt.id, receipt]));
      if (taskByOrder.size !== tasks.length || receiptById.size !== receipts.length)
        return response('WORKSHOP_TRANSACTION_MISMATCH', 409);
      for (const order of persistedRows) {
        const task = taskByOrder.get(order.id);
        const receipt = task && receiptById.get(task.submission_id);
        if (!task || !receipt
          || task.organization_id !== actor.orgId || receipt.organization_id !== actor.orgId
          || task.order_id !== order.id || receipt.order_id !== order.id
          // Inbox always records original submission, never current P2 state.
          || task.workflow_status !== 'SUBMITTED'
          || task.source_revision + 1 > order.version
          || (order.workflow_status === 'SUBMITTED'
              && task.source_revision + 1 !== order.version)
          || receipt.source_revision !== task.source_revision
          || receipt.source_version_label !== task.source_version_label
          || (task.source_version_label !== order.version_label && !(
            /^QA-R[1-9][0-9]*$/.test(order.version_label) &&
            (amendments?.data??[]).some(revision=>
              revision.organization_id===actor.orgId
              && revision.entity_type==='PRODUCTION_ORDER'
              && revision.entity_id===order.id
              && revision.metadata?.newVersionLabel===order.version_label
              && Number.isInteger(revision.metadata?.newVersion)
              && revision.metadata.newVersion<=order.version
            )
          ))) {
          return response('WORKSHOP_TRANSACTION_MISMATCH', 409);
        }
      }
    }
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
    if (ownerIds.some(id => typeof id !== 'string' || !id)) {
      return response('UNTRUSTED_DB_ROW', 409);
    }
    // The inbox is a read-only projection of trusted WOS rows already filtered
    // by the caller's JWT, RLS and organization_id. An Operator may view an
    // assigned order but is intentionally NOT allowed to enumerate the Admin
    // or Sales profiles that own it. Requerying 'profiles' here causes false
    // 409/503 for legitimate Operator users even though the same order is
    // readable from WOS. Do not weaken profiles RLS or elevate this endpoint.
    //
    // WOS owner UUIDs are FK-backed source references, not authorization
    // claims. Actual reassignment / start gates must separately validate
    // owner active state via their own authorized transaction paths.
    const projection = buildWosLiveInbox({
      actor, productionRows, samplingRows, activeOwnerProfileIds: ownerIds,
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

  // Only a separately enabled, exact-project-pinned Preview can submit a
  // previously-created production DRAFT. Sampling remains 409 fail-closed.
  if (entityType === 'PRODUCTION_ORDER'
    && process.env.WOS_P7_NONPROD_SUBMIT_ENABLED === 'true') {
    const input = parseWosProductionSubmitEnvelope(value);
    if (!input) return response('INVALID_INPUT', 400);
    const result = await submitWosProductionNonproduction(auth.client, auth.actor, input);
    return response(result.code, result.status, result.data ?? null);
  }

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
