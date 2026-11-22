import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { resolveVerifiedSupabaseIdentity } from '@/lib/auth/supabase-identity';
import { createClient } from '@/lib/supabase/server';
import {
  WOS_ACTIVE_PRODUCTION_STATUSES,
  WOS_ACTIVE_SAMPLING_STATUSES,
  WOS_API_INPUT_LIMIT_CHARS,
  WOS_INBOX_DETAIL_LIMIT,
  WOS_INBOX_LIMIT_PER_TYPE,
  buildWosInboxDetail,
  buildWosLiveInbox,
  canSubmitWosOfficeRequest,
  isWosNonproductionApiEnabled,
  isWosQaInboxReadonlyEnabled,
  isApprovedWosSandboxUrl,
  parseWosInboxReadRequest,
  resolveWosApiActor,
  parseWosProductionSubmitEnvelope,
  validateWosPostEnvelope,
  type WosApiActor,
  type WosInboxConfirmationRecord,
  type WosInboxHistoryRecord,
  type WosInboxProductionRecord,
  type WosInboxReferenceImageRecord,
  type WosInboxTransactionEvidence,
} from './api-contract';
import type {
  WosP2BaselineRow,
  WosP2BlockerRow,
  WosP2ResourceRow,
} from './p2-qa-readiness';
import {
  canActOnWosP2,
  isWosP2QaMutationEnabled,
} from './p2-action-contract';
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

function readonlyEnabled(): boolean {
  return isWosQaInboxReadonlyEnabled({
    vercelEnv: process.env.VERCEL_ENV,
    authMode: process.env.AUTH_MODE,
    enabled: process.env.WOS_QA_INBOX_READONLY_ENABLED,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
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

type PersistedTransaction = WosInboxTransactionEvidence & { readonly orderId: string };

async function verifyPersistedInboxTransactions(
  client: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  actor: WosApiActor,
  persistedRows: readonly {
    readonly id: string;
    readonly version: number;
    readonly version_label: string;
    readonly workflow_status: string;
  }[],
): Promise<
  | { readonly ok: true; readonly transactions: ReadonlyMap<string, PersistedTransaction> }
  | { readonly ok: false; readonly status: number; readonly code: string }
> {
  if (persistedRows.length === 0) return { ok: true, transactions: new Map() };
  const ids = persistedRows.map(row => row.id);
  const [taskRows, receiptRows] = await Promise.all([
    client.from('wos_workshop_inbox')
      .select('id,organization_id,order_id,submission_id,source_revision,source_version_label,workflow_status')
      .eq('organization_id', actor.orgId).in('order_id', ids).limit(WOS_INBOX_LIMIT_PER_TYPE + 1),
    client.from('wos_submission_receipts')
      .select('id,organization_id,order_id,source_revision,source_version_label')
      .eq('organization_id', actor.orgId).in('order_id', ids).limit(WOS_INBOX_LIMIT_PER_TYPE + 1),
  ]);
  if (taskRows.error || receiptRows.error) {
    return { ok: false, status: 503, code: 'DATABASE_READ_UNAVAILABLE' };
  }
  const tasks = taskRows.data ?? [];
  const receipts = receiptRows.data ?? [];
  if (tasks.length !== persistedRows.length || receipts.length !== persistedRows.length) {
    return { ok: false, status: 409, code: 'WORKSHOP_TRANSACTION_MISMATCH' };
  }
  const revised = persistedRows.filter(order =>
    !tasks.some(task => task.order_id === order.id
      && task.source_version_label === order.version_label));
  const revisionIds = revised.map(order => order.id);
  const amendments = revisionIds.length ? await client.from('wos_status_history')
    .select('organization_id,entity_type,entity_id,reason_code,metadata')
    .eq('organization_id', actor.orgId).eq('entity_type', 'PRODUCTION_ORDER')
    .in('entity_id', revisionIds)
    .in('reason_code', ['QA_P2_OFFICE_SAVE_CORRECTION', 'QA_P2_OFFICE_RESUBMIT_CORRECTION'])
    .limit(401) : null;
  if (amendments && (amendments.error || !Array.isArray(amendments.data)
    || amendments.data.length >= 401)) {
    return { ok: false, status: 409, code: 'WORKSHOP_REVISION_UNVERIFIED' };
  }
  const taskByOrder = new Map(tasks.map(task => [task.order_id, task]));
  const receiptById = new Map(receipts.map(receipt => [receipt.id, receipt]));
  if (taskByOrder.size !== tasks.length || receiptById.size !== receipts.length) {
    return { ok: false, status: 409, code: 'WORKSHOP_TRANSACTION_MISMATCH' };
  }
  const transactions = new Map<string, PersistedTransaction>();
  for (const order of persistedRows) {
    const task = taskByOrder.get(order.id);
    const receipt = task && receiptById.get(task.submission_id);
    if (!task || !receipt
      || task.organization_id !== actor.orgId || receipt.organization_id !== actor.orgId
      || task.order_id !== order.id || receipt.order_id !== order.id
      || task.workflow_status !== 'SUBMITTED'
      || task.source_revision + 1 > order.version
      || (order.workflow_status === 'SUBMITTED'
        && task.source_revision + 1 !== order.version)
      || receipt.source_revision !== task.source_revision
      || receipt.source_version_label !== task.source_version_label
      || (task.source_version_label !== order.version_label && !(
        /^QA-R[1-9][0-9]*$/.test(order.version_label)
        && (amendments?.data ?? []).some(revision =>
          revision.organization_id === actor.orgId
          && revision.entity_type === 'PRODUCTION_ORDER'
          && revision.entity_id === order.id
          && revision.metadata?.newVersionLabel === order.version_label
          && Number.isInteger(revision.metadata?.newVersion)
          && revision.metadata.newVersion <= order.version)
      ))) {
      return { ok: false, status: 409, code: 'WORKSHOP_TRANSACTION_MISMATCH' };
    }
    transactions.set(order.id, {
      orderId: order.id,
      inboxId: task.id,
      submissionReceiptId: receipt.id,
      sourceRevision: task.source_revision,
      sourceVersionLabel: task.source_version_label,
      originalWorkflowStatus: 'SUBMITTED',
    });
  }
  return { ok: true, transactions };
}

async function readInboxList(
  client: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  actor: WosApiActor,
) {
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

  const persistedRows = production.data ?? [];
  const verification = await verifyPersistedInboxTransactions(client, actor, persistedRows);
  if (!verification.ok) return response(verification.code, verification.status);

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
    capabilities: {
      canOperateWorkflow: canActOnWosP2(actor.role),
      workflowWriteEnabled: isWosP2QaMutationEnabled({
        vercelEnv: process.env.VERCEL_ENV,
        nodeEnv: process.env.NODE_ENV,
        flag: process.env.WOS_P2_QA_MUTATIONS_ENABLED,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        allowLocal: process.env.WOS_ALLOW_LOCAL_SUPABASE,
        publicAllowLocal: process.env.NEXT_PUBLIC_WOS_ALLOW_LOCAL_SUPABASE,
      }),
    },
  });
}

async function readInboxDetail(
  client: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  actor: WosApiActor,
  orderId: string,
) {
  const order = await client.from('wos_production_orders')
    .select('id,organization_id,order_number,customer_name_snapshot,project_name_snapshot,product_name,project_owner_profile_id,product_material,requested_quantity,current_batch_quantity,planned_ship_date,priority,is_urgent,version,version_label,workflow_status,surface_treatment,pattern_scope,seam_tolerance,position_reference,customer_acceptance_standard,packaging_method,carton_quantity,label_marking_rule,submitted_at')
    .eq('organization_id', actor.orgId)
    .eq('id', orderId)
    .in('workflow_status', WOS_ACTIVE_PRODUCTION_STATUSES)
    .maybeSingle();
  if (order.error) return response('DATABASE_READ_UNAVAILABLE', 503);
  if (!order.data) return response('ORDER_NOT_AVAILABLE', 404);

  const verification = await verifyPersistedInboxTransactions(client, actor, [order.data]);
  if (!verification.ok) return response(verification.code, verification.status);
  const transaction = verification.transactions.get(orderId);
  if (!transaction) return response('WORKSHOP_TRANSACTION_MISMATCH', 409);

  const [resources, blockers, baselines, history, images, confirmations] = await Promise.all([
    client.from('wos_resource_readiness')
      .select('organization_id,entity_id,entity_type,resource_type,status,version_label,quantity_expected,quantity_arrived,expected_at,arrived_at,confirmed_by_profile_id,confirmed_at,note')
      .eq('organization_id', actor.orgId).eq('entity_id', orderId)
      .eq('entity_type', 'PRODUCTION_ORDER').limit(WOS_INBOX_DETAIL_LIMIT + 1),
    client.from('wos_blockers')
      .select('organization_id,entity_id,entity_type,blocker_code,description,status')
      .eq('organization_id', actor.orgId).eq('entity_id', orderId)
      .eq('entity_type', 'PRODUCTION_ORDER').limit(WOS_INBOX_DETAIL_LIMIT + 1),
    client.from('wos_visual_baselines')
      .select('organization_id,entity_id,entity_type,version_label,status,office_confirmed_at,workshop_confirmed_at,superseded_at')
      .eq('organization_id', actor.orgId).eq('entity_id', orderId)
      .eq('entity_type', 'PRODUCTION_ORDER').limit(WOS_INBOX_DETAIL_LIMIT + 1),
    client.from('wos_status_history')
      .select('organization_id,entity_id,entity_type,previous_status,next_status,actor_role,reason_code,created_at,metadata')
      .eq('organization_id', actor.orgId).eq('entity_id', orderId)
      .eq('entity_type', 'PRODUCTION_ORDER')
      .order('created_at', { ascending: true })
      .limit(WOS_INBOX_DETAIL_LIMIT + 1),
    client.from('wos_reference_images')
      .select('id,organization_id,entity_type,entity_id,category,version_label,image_status,file_name,uploaded_at,superseded_at')
      .eq('organization_id', actor.orgId).eq('entity_id', orderId)
      .eq('entity_type', 'PRODUCTION_ORDER').limit(WOS_INBOX_DETAIL_LIMIT + 1),
    client.from('wos_confirmations')
      .select('organization_id,entity_id,entity_type,confirmation_type,decision,role_snapshot,note,confirmed_at')
      .eq('organization_id', actor.orgId).eq('entity_id', orderId)
      .eq('entity_type', 'PRODUCTION_ORDER').limit(WOS_INBOX_DETAIL_LIMIT + 1),
  ]);
  const batches = [resources, blockers, baselines, history, images, confirmations];
  if (batches.some(batch => batch.error || !Array.isArray(batch.data)
    || batch.data.length >= WOS_INBOX_DETAIL_LIMIT)) {
    return response('INBOX_DETAIL_READ_UNAVAILABLE_OR_TRUNCATED', 409);
  }
  for (const batch of batches) {
    for (const row of batch.data ?? []) {
      if (row.organization_id !== actor.orgId
        || row.entity_id !== orderId
        || row.entity_type !== 'PRODUCTION_ORDER') {
        return response('UNTRUSTED_DB_ROW', 409);
      }
    }
  }

  const projection = buildWosLiveInbox({
    actor,
    productionRows: [order.data],
    samplingRows: [],
    activeOwnerProfileIds: [order.data.project_owner_profile_id],
  });
  if (!projection.ok || projection.items.length !== 1) {
    return response('UNTRUSTED_DB_ROW', 409);
  }
  const detail = buildWosInboxDetail({
    item: projection.items[0],
    transaction,
    production: order.data as WosInboxProductionRecord,
    resources: (resources.data ?? []) as WosP2ResourceRow[],
    blockers: (blockers.data ?? []) as WosP2BlockerRow[],
    baselines: (baselines.data ?? []) as WosP2BaselineRow[],
    history: (history.data ?? []) as WosInboxHistoryRecord[],
    images: (images.data ?? []) as WosInboxReferenceImageRecord[],
    confirmations: (confirmations.data ?? []) as WosInboxConfirmationRecord[],
  });
  if (!detail.ok) return response(detail.code, 409);
  return response('OK', 200, {
    mode: 'LIVE_READ_ONLY_DETAIL',
    projectAuthority: 'WOS',
    source: 'SUPABASE_RLS',
    detail: detail.detail,
  });
}

export async function readWosWorkshopInbox(request: NextRequest) {
  // Reading is intentionally independent from every P5C/P7 write flag.
  if (!readonlyEnabled()) return response('NONPRODUCTION_READ_ONLY_DISABLED', 503);
  const requestScope = parseWosInboxReadRequest(request.url);
  if (!requestScope.ok) return response(requestScope.code, 400);
  const auth = await authenticatedWosClient();
  if (!auth.ok) return response(auth.code, auth.status);

  try {
    return requestScope.orderId
      ? await readInboxDetail(auth.client, auth.actor, requestScope.orderId)
      : await readInboxList(auth.client, auth.actor);
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
