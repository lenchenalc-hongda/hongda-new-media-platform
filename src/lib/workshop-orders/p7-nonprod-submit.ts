import 'server-only';

import type { createClient } from '@/lib/supabase/server';
import {
  isApprovedWosSandboxUrl,
  type WosApiActor,
  type WosProductionSubmitEnvelope,
} from './api-contract';

type AuthenticatedClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

type Result = {
  status: 200 | 400 | 403 | 409 | 503;
  code: string;
  data?: unknown;
};

function failure(code: string, status: 400 | 403 | 409 | 503): Result {
  return { status, code };
}

function trulyIsolated(): boolean {
  // This is a QA-only feature. Production must not call WOS mutations even
  // if a configuration flag is accidentally copied into its environment.
  return process.env.WOS_P7_NONPROD_SUBMIT_ENABLED === 'true'
    && process.env.VERCEL_ENV !== 'production'
    && isApprovedWosSandboxUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
    && (process.env.VERCEL_ENV === 'preview'
        || (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'development'));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export async function submitWosProductionNonproduction(
  client: AuthenticatedClient,
  actor: WosApiActor,
  input: WosProductionSubmitEnvelope,
): Promise<Result> {
  if (!trulyIsolated()) return failure('NONPRODUCTION_ONLY_DISABLED', 503);
  try {
    const request = await client.rpc('wos_submit_production_order', {
      p_order_id: input.orderId,
      p_expected_revision: input.expectedVersion,
      p_expected_label: input.versionLabel,
      p_idempotency_key: input.idempotencyKey,
    });

    if (request.error) {
      const code = request.error.message;
      if (code === 'NOT_AUTHORIZED') return failure('FORBIDDEN', 403);
      if (code === 'VERSION_CONFLICT' || code === 'IDEMPOTENCY_CONFLICT'
          || code === 'OFFICE_READINESS_REQUIRED')
        return failure(code, 409);
      return failure('DATABASE_WRITE_UNVERIFIED', 503);
    }
    // Only the pinned DB RPC can produce these facts; browser claims are ignored.
    const fact = request.data as Record<string, unknown> | null;
    const receiptId = fact?.receiptId;
    const inboxId = fact?.inboxTaskId;
    if (!nonEmpty(receiptId) || !nonEmpty(inboxId)
        || (fact?.status !== 'CREATED' && fact?.status !== 'REPLAYED')
        || fact?.orderId !== input.orderId
        || fact?.sourceRevision !== input.expectedVersion) {
      return failure('PERSISTENCE_STATUS_UNVERIFIED', 409);
    }
    const [order, receipt, inbox, audit] = await Promise.all([
      client.from('wos_production_orders')
        .select('id,organization_id,version,workflow_status')
        .eq('id',input.orderId).maybeSingle(),
      client.from('wos_submission_receipts')
        .select('id,organization_id,order_id,source_revision,idempotency_key')
        .eq('id',receiptId).maybeSingle(),
      client.from('wos_workshop_inbox')
        .select('id,organization_id,order_id,submission_id,workflow_status')
        .eq('id',inboxId).maybeSingle(),
      client.from('wos_status_history')
        .select('id,organization_id,metadata')
        .eq('entity_type','PRODUCTION_ORDER')
        .eq('entity_id',input.orderId)
        .eq('reason_code','OFFICE_SUBMISSION_COMMITTED')
        .limit(2),
    ]);
    if (order.error || receipt.error || inbox.error || audit.error
      || !order.data || !receipt.data || !inbox.data
      || order.data.organization_id !== actor.orgId
      || receipt.data.organization_id !== actor.orgId
      || inbox.data.organization_id !== actor.orgId
      || order.data.workflow_status !== 'SUBMITTED'
      || order.data.version !== input.expectedVersion + 1
      || receipt.data.id !== receiptId
      || receipt.data.order_id !== input.orderId
      || receipt.data.source_revision !== input.expectedVersion
      || receipt.data.idempotency_key !== input.idempotencyKey
      || inbox.data.submission_id !== receiptId
      || inbox.data.order_id !== input.orderId
      || inbox.data.workflow_status !== 'SUBMITTED'
      || !Array.isArray(audit.data)
      || audit.data.filter(x => x.organization_id === actor.orgId
        && x.metadata?.receiptId === receiptId
        && x.metadata?.inboxTaskId === inboxId).length !== 1) {
      // An RPC may have committed even if a verification read fails. Do not
      // recommend replaying a new idempotency key or assert persisted:false.
      return failure('PERSISTENCE_STATUS_UNVERIFIED', 409);
    }
    return {
      status: 200,
      code: fact.status === 'REPLAYED' ? 'SUBMISSION_REPLAY_VERIFIED' : 'SUBMISSION_VERIFIED',
      data: {
        persisted: true,
        productionStarted: false,
        orderId: input.orderId,
        receiptId,
        inboxTaskId: inboxId,
        workflowStatus: 'SUBMITTED',
        source: 'PINNED_ISOLATED_SUPABASE',
      },
    };
  } catch {
    return failure('PERSISTENCE_STATUS_UNVERIFIED', 409);
  }
}
