import { z } from 'zod';
import { PRODUCTION_TRANSITIONS, SAMPLING_TRANSITIONS, type WosEntityType } from './domain';
import {
  evaluateWosP2Readiness,
  type WosP2BaselineRow,
  type WosP2BlockerRow,
  type WosP2ReadinessResult,
  type WosP2ResourceRow,
} from './p2-qa-readiness';
import {
  evaluateWosP2HandoffTimeline,
  type WosP2HandoffHistory,
  type WosP2HandoffResult,
} from './p2-handoff-timeline';

// Phase 5C: read-only, organization-scoped API contracts. No database writes
// are permitted until a reviewed atomic submission RPC and audit gate exist.
export const WOS_INBOX_LIMIT_PER_TYPE = 200;
export const WOS_INBOX_DETAIL_LIMIT = 100;
export const WOS_API_INPUT_LIMIT_CHARS = 32768;
export const WOS_READ_ROLES = ['admin', 'manager', 'sales', 'operator', 'workshop', 'technician'] as const;
export const WOS_SUBMIT_ROLES = ['admin', 'manager', 'sales'] as const;
export const WOS_ACTIVE_PRODUCTION_STATUSES = Object.keys(PRODUCTION_TRANSITIONS)
  .filter(value => !['DRAFT', 'CANCELLED', 'CLOSED'].includes(value));
export const WOS_ACTIVE_SAMPLING_STATUSES = Object.keys(SAMPLING_TRANSITIONS)
  .filter(value => !['DRAFT', 'CANCELLED', 'CLOSED'].includes(value));

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

type WosRole = (typeof WOS_READ_ROLES)[number];

export interface WosApiActor {
  readonly id: string;
  readonly userId: string;
  readonly orgId: string;
  readonly role: WosRole;
}

export type WosActorResolution =
  | { readonly ok: true; readonly actor: WosApiActor }
  | { readonly ok: false; readonly status: 401 | 403; readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' };

export interface WosInboxItem {
  readonly entityType: WosEntityType;
  readonly id: string;
  readonly organizationId: string;
  readonly projectOwnerProfileId: string;
  readonly customerNameSnapshot: string;
  readonly productName: string;
  readonly workflowStatus: string;
  readonly version: number;
  readonly versionLabel: string;
  readonly submittedAt: string;
  readonly priority: string | null;
  readonly isUrgent: boolean;
  readonly orderNumber: string | null;
}

export interface WosInboxTransactionEvidence {
  readonly inboxId: string;
  readonly submissionReceiptId: string;
  readonly sourceRevision: number;
  readonly sourceVersionLabel: string;
  readonly originalWorkflowStatus: 'SUBMITTED';
}

export interface WosInboxProductionRecord {
  readonly id: string;
  readonly organization_id: string;
  readonly order_number: string;
  readonly customer_name_snapshot: string;
  readonly project_name_snapshot: string | null;
  readonly product_name: string;
  readonly product_material: string | null;
  readonly requested_quantity: number | null;
  readonly current_batch_quantity: number;
  readonly planned_ship_date: string | null;
  readonly priority: string;
  readonly surface_treatment: string | null;
  readonly pattern_scope: string | null;
  readonly seam_tolerance: string | null;
  readonly position_reference: string | null;
  readonly customer_acceptance_standard: string | null;
  readonly packaging_method: string | null;
  readonly carton_quantity: number | null;
  readonly label_marking_rule: string | null;
  readonly workflow_status: string;
  readonly version: number;
  readonly version_label: string;
  readonly submitted_at: string;
}

export interface WosInboxHistoryRecord extends WosP2HandoffHistory {
  readonly organization_id: string;
  readonly entity_type: 'PRODUCTION_ORDER';
  readonly entity_id: string;
}

export interface WosInboxReferenceImageRecord {
  readonly id: string;
  readonly organization_id: string;
  readonly entity_type: 'PRODUCTION_ORDER';
  readonly entity_id: string;
  readonly category: string;
  readonly version_label: string;
  readonly image_status: string;
  readonly file_name: string;
  readonly uploaded_at: string;
  readonly superseded_at: string | null;
}

export interface WosInboxConfirmationRecord {
  readonly confirmation_type: string;
  readonly decision: string;
  readonly role_snapshot: string;
  readonly note: string | null;
  readonly confirmed_at: string;
}

export interface WosInboxReadDetail {
  readonly item: WosInboxItem;
  readonly transaction: WosInboxTransactionEvidence;
  readonly production: WosInboxProductionRecord;
  readonly resources: readonly WosP2ResourceRow[];
  readonly blockers: readonly WosP2BlockerRow[];
  readonly baselines: readonly WosP2BaselineRow[];
  readonly history: readonly WosInboxHistoryRecord[];
  readonly images: readonly WosInboxReferenceImageRecord[];
  readonly confirmations: readonly WosInboxConfirmationRecord[];
  readonly readiness: WosP2ReadinessResult;
  readonly handoff: WosP2HandoffResult;
  readonly canStart: false;
  readonly source: 'SUPABASE_RLS';
}

export type WosInboxProjection =
  | { readonly ok: true; readonly items: readonly WosInboxItem[] }
  | { readonly ok: false; readonly code: 'UNTRUSTED_DB_ROW' | 'LIMIT_EXCEEDED' | 'DUPLICATE_SOURCE' };

export type WosInboxReadRequest =
  | { readonly ok: true; readonly orderId: string | null }
  | { readonly ok: false; readonly code: 'INVALID_READ_QUERY' };

export type WosInboxDetailProjection =
  | { readonly ok: true; readonly detail: WosInboxReadDetail }
  | { readonly ok: false; readonly code: 'UNTRUSTED_DB_ROW' | 'LIMIT_EXCEEDED' | 'TRANSACTION_MISMATCH' };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isWosNonproductionApiEnabled(input: {
  readonly vercelEnv?: string;
  readonly nodeEnv?: string;
  readonly enabled?: string;
}): boolean {
  if (input.enabled !== 'true') return false;
  if (input.vercelEnv === 'production') return false;
  // Unknown or CI environments fail closed, even if an untrusted flag is set.
  return input.vercelEnv === 'preview'
    || (input.vercelEnv === undefined && input.nodeEnv === 'development');
}

export function isWosQaInboxReadonlyEnabled(input: {
  readonly vercelEnv?: string;
  readonly authMode?: string;
  readonly enabled?: string;
  readonly supabaseUrl?: string;
}): boolean {
  if (input.vercelEnv !== 'preview'
    || input.authMode !== 'supabase'
    || input.enabled !== 'true') return false;
  return isApprovedWosSandboxUrl(input.supabaseUrl, {
    nodeEnv: 'production',
    allowLocal: 'false',
    publicAllowLocal: 'false',
  });
}

// Pin the nonproduction Preview to the vetted hongda-review-dev database.
// Preview can otherwise inherit Production Supabase URL variables.
export const WOS_P5C_SANDBOX_REF = 'xulmpqaknlwqqculbsek' as const;
export interface WosSandboxUrlEnvironment {
  readonly nodeEnv?: string;
  readonly allowLocal?: string;
  readonly publicAllowLocal?: string;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

/**
 * Structural check only. Callers must still require an explicit opt-in and a
 * non-production runtime before treating a loopback URL as approved.
 */
export function isWosLoopbackSupabaseUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:'
      && isLoopbackHostname(url.hostname)
      && /^[1-9][0-9]{1,4}$/.test(url.port)
      && !url.username && !url.password
      && (url.pathname === '/' || url.pathname === '')
      && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function isApprovedWosSandboxUrl(
  value: unknown,
  environment: WosSandboxUrlEnvironment = {},
): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const approvedCloudSandbox = url.protocol === 'https:'
      && url.hostname === WOS_P5C_SANDBOX_REF + '.supabase.co'
      && !url.username && !url.password
      && (url.pathname === '/' || url.pathname === '')
      && !url.search && !url.hash;
    if (approvedCloudSandbox) return true;

    const nodeEnv = environment.nodeEnv ?? process.env.NODE_ENV;
    const allowLocal = environment.allowLocal
      ?? process.env.WOS_ALLOW_LOCAL_SUPABASE;
    const publicAllowLocal = environment.publicAllowLocal
      ?? process.env.NEXT_PUBLIC_WOS_ALLOW_LOCAL_SUPABASE;
    return nodeEnv !== 'production'
      && (allowLocal === 'true' || publicAllowLocal === 'true')
      && isWosLoopbackSupabaseUrl(value);
  } catch {
    return false;
  }
}

export function parseWosInboxReadRequest(requestUrl: string): WosInboxReadRequest {
  try {
    const search = new URL(requestUrl).searchParams;
    const keys = Array.from(search.keys());
    if (keys.length === 0) return { ok: true, orderId: null };
    if (keys.length !== 1 || keys[0] !== 'orderId'
      || search.getAll('orderId').length !== 1) {
      return { ok: false, code: 'INVALID_READ_QUERY' };
    }
    const orderId = search.get('orderId');
    return orderId && uuid(orderId)
      ? { ok: true, orderId }
      : { ok: false, code: 'INVALID_READ_QUERY' };
  } catch {
    return { ok: false, code: 'INVALID_READ_QUERY' };
  }
}

export function isWosQaRevisionImageUploadEnabled(input: {
  readonly enabled?: string;
  readonly vercelEnv?: string;
  readonly nodeEnv?: string;
  readonly supabaseUrl?: string;
  readonly allowLocal?: string;
  readonly publicAllowLocal?: string;
}): boolean {
  const approvedRuntime = input.vercelEnv === 'preview'
    || (input.vercelEnv === undefined && input.nodeEnv === 'development');
  return approvedRuntime
    && input.enabled === 'true'
    && isApprovedWosSandboxUrl(input.supabaseUrl, {
      nodeEnv: input.nodeEnv,
      allowLocal: input.allowLocal,
      publicAllowLocal: input.publicAllowLocal,
    });
}

export function isSameOriginWosMutation(
  requestUrl: string,
  origin: string | null,
  referer: string | null,
  host: string | null = null,
  forwardedProto: string | null = null,
): boolean {
  let expected: string;
  try {
    const target = new URL(requestUrl);
    const hostValue = host?.split(',')[0]?.trim();
    const protocol = forwardedProto === 'https' || forwardedProto === 'http'
      ? forwardedProto : target.protocol.replace(':', '');
    expected = new URL(`${protocol}://${hostValue || target.host}`).origin;
  } catch {
    return false;
  }
  if (origin !== null) return origin === expected;
  if (referer === null) return false;
  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}

export function resolveWosApiActor(
  verifiedUserId: unknown,
  profile: unknown,
): WosActorResolution {
  if (!uuid(verifiedUserId)) {
    return { ok: false, code: 'UNAUTHENTICATED', status: 401 };
  }
  if (!record(profile)
    || profile.user_id !== verifiedUserId
    || profile.is_active !== true
    || !uuid(profile.id)
    || !uuid(profile.org_id)
    || typeof profile.role !== 'string'
    || !(WOS_READ_ROLES as readonly string[]).includes(profile.role)) {
    return { ok: false, code: 'FORBIDDEN', status: 403 };
  }
  return {
    ok: true,
    actor: {
      userId: verifiedUserId,
      id: profile.id,
      orgId: profile.org_id,
      role: profile.role as WosRole,
    },
  };
}

export function canSubmitWosOfficeRequest(role: unknown): boolean {
  return typeof role === 'string'
    && (WOS_SUBMIT_ROLES as readonly string[]).includes(role);
}

// Reject client-controlled organization/owner/status identifiers even though
// this version never persists a POST. Future RPC must derive actor values.
const postSchema = z.object({
  idempotencyKey: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()),
}).strict();

const clientControlled = new Set([
  'organizationId', 'organization_id', 'orgId', 'org_id',
  'createdByProfileId', 'created_by_profile_id', 'userId', 'user_id',
  'projectOwnerProfileId', 'project_owner_profile_id',
  'salesOwnerProfileId', 'sales_owner_profile_id',
  'workflowStatus', 'workflow_status',
  'resultDecision', 'result_decision',
]);

export function validateWosPostEnvelope(value: unknown): boolean {
  const parsed = postSchema.safeParse(value);
  if (!parsed.success || Object.keys(parsed.data.payload).length === 0) return false;
  return !Object.keys(parsed.data.payload).some(key => clientControlled.has(key));
}


export interface WosProductionSubmitEnvelope {
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly orderId: string;
  readonly versionLabel: string;
}

// The P7 API submits a *previously created* DRAFT. It cannot accept direct
// client-written org, actor, owner, status, receipt, image or audit fields.
const productionSubmitPayloadSchema = z.object({
  orderId: z.string().uuid(),
  versionLabel: z.string().regex(/^V[1-9][0-9]{0,20}$/),
}).strict();

export function parseWosProductionSubmitEnvelope(value: unknown): WosProductionSubmitEnvelope | null {
  if (!validateWosPostEnvelope(value)) return null;
  const envelope = postSchema.safeParse(value);
  if (!envelope.success) return null;
  const payload = productionSubmitPayloadSchema.safeParse(envelope.data.payload);
  if (!payload.success) return null;
  return {
    idempotencyKey: envelope.data.idempotencyKey,
    expectedVersion: envelope.data.expectedVersion,
    orderId: payload.data.orderId,
    versionLabel: payload.data.versionLabel,
  };
}

function mapInboxRow(type: WosEntityType, raw: unknown, actor: WosApiActor): WosInboxItem | null {
  if (!record(raw)
    || !uuid(raw.id)
    || raw.organization_id !== actor.orgId
    || !text(raw.customer_name_snapshot)
    || !text(raw.product_name)
    || !text(raw.version_label)
    || !Number.isInteger(raw.version)
    || (raw.version as number) < 1
    || !text(raw.submitted_at)
    || !Number.isFinite(Date.parse(raw.submitted_at as string))
    || typeof raw.workflow_status !== 'string'
    || typeof raw.is_urgent !== 'boolean') return null;
  const statuses = type === 'PRODUCTION_ORDER'
    ? WOS_ACTIVE_PRODUCTION_STATUSES : WOS_ACTIVE_SAMPLING_STATUSES;
  if (!statuses.includes(raw.workflow_status)) return null;
  const owner = type === 'PRODUCTION_ORDER'
    ? raw.project_owner_profile_id : raw.product_owner_profile_id;
  if (!uuid(owner)) return null;
  if (type === 'PRODUCTION_ORDER' && !text(raw.order_number)) return null;
  if (type === 'PRODUCTION_ORDER'
    && (typeof raw.priority !== 'string' || !['LOW','MEDIUM','HIGH','CRITICAL'].includes(raw.priority))) return null;
  return {
    entityType: type,
    id: raw.id,
    organizationId: actor.orgId,
    projectOwnerProfileId: owner,
    customerNameSnapshot: raw.customer_name_snapshot,
    productName: raw.product_name,
    workflowStatus: raw.workflow_status,
    version: raw.version as number,
    versionLabel: raw.version_label,
    submittedAt: raw.submitted_at,
    priority: type === 'PRODUCTION_ORDER' ? raw.priority as string : null,
    isUrgent: raw.is_urgent,
    orderNumber: type === 'PRODUCTION_ORDER' ? raw.order_number as string : null,
  };
}

export function buildWosLiveInbox(input: {
  readonly actor: WosApiActor;
  readonly productionRows: readonly unknown[];
  readonly samplingRows: readonly unknown[];
  readonly activeOwnerProfileIds: readonly string[];
}): WosInboxProjection {
  if (!Array.isArray(input.productionRows)
    || !Array.isArray(input.samplingRows)
    || input.productionRows.length > WOS_INBOX_LIMIT_PER_TYPE
    || input.samplingRows.length > WOS_INBOX_LIMIT_PER_TYPE) {
    return { ok: false, code: 'LIMIT_EXCEEDED' };
  }
  const owners = new Set(input.activeOwnerProfileIds);
  const items: WosInboxItem[] = [];
  const seen = new Set<string>();
  for (const [type, rows] of [
    ['PRODUCTION_ORDER', input.productionRows],
    ['SAMPLING_REQUEST', input.samplingRows],
  ] as const) {
    for (const row of rows) {
      const item = mapInboxRow(type, row, input.actor);
      if (!item || !owners.has(item.projectOwnerProfileId)) {
        return { ok: false, code: 'UNTRUSTED_DB_ROW' };
      }
      const key = type + ':' + item.id;
      if (seen.has(key)) return { ok: false, code: 'DUPLICATE_SOURCE' };
      seen.add(key);
      items.push(item);
    }
  }
  items.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)
    || a.entityType.localeCompare(b.entityType) || a.id.localeCompare(b.id));
  return { ok: true, items };
}

export function buildWosInboxDetail(input: {
  readonly item: WosInboxItem;
  readonly transaction: WosInboxTransactionEvidence;
  readonly production: WosInboxProductionRecord;
  readonly resources: readonly WosP2ResourceRow[];
  readonly blockers: readonly WosP2BlockerRow[];
  readonly baselines: readonly WosP2BaselineRow[];
  readonly history: readonly WosInboxHistoryRecord[];
  readonly images: readonly WosInboxReferenceImageRecord[];
  readonly confirmations: readonly WosInboxConfirmationRecord[];
}): WosInboxDetailProjection {
  const { item, transaction, production } = input;
  const batches = [input.resources, input.blockers, input.baselines, input.history, input.images, input.confirmations];
  if (batches.some(batch => !Array.isArray(batch) || batch.length >= WOS_INBOX_DETAIL_LIMIT)) {
    return { ok: false, code: 'LIMIT_EXCEEDED' };
  }
  if (item.entityType !== 'PRODUCTION_ORDER'
    || production.id !== item.id
    || production.organization_id !== item.organizationId
    || production.workflow_status !== item.workflowStatus
    || production.version !== item.version
    || production.version_label !== item.versionLabel
    || !text(production.order_number)
    || !Number.isSafeInteger(production.current_batch_quantity)
    || production.current_batch_quantity < 1
    || !uuid(transaction.inboxId)
    || !uuid(transaction.submissionReceiptId)
    || transaction.originalWorkflowStatus !== 'SUBMITTED'
    || !Number.isSafeInteger(transaction.sourceRevision)
    || transaction.sourceRevision < 1
    || !text(transaction.sourceVersionLabel)
    || transaction.sourceRevision + 1 > item.version) {
    return { ok: false, code: 'TRANSACTION_MISMATCH' };
  }
  for (const row of input.history) {
    if (row.organization_id !== item.organizationId
      || row.entity_type !== 'PRODUCTION_ORDER'
      || row.entity_id !== item.id) {
      return { ok: false, code: 'UNTRUSTED_DB_ROW' };
    }
  }
  for (const row of input.images) {
    if (row.organization_id !== item.organizationId
      || row.entity_type !== 'PRODUCTION_ORDER'
      || row.entity_id !== item.id) {
      return { ok: false, code: 'UNTRUSTED_DB_ROW' };
    }
  }
  const readiness = evaluateWosP2Readiness({
    versionLabel: item.versionLabel,
    currentBatchQuantity: production.current_batch_quantity,
    resources: input.resources,
    blockers: input.blockers,
    baselines: input.baselines,
    readVerified: true,
  });
  const handoff = evaluateWosP2HandoffTimeline({
    history: input.history,
    currentStatus: item.workflowStatus,
    currentVersion: item.version,
    readVerified: true,
  });
  return {
    ok: true,
    detail: {
      item,
      transaction,
      production,
      resources: input.resources,
      blockers: input.blockers,
      baselines: input.baselines,
      history: input.history,
      images: input.images,
      confirmations: input.confirmations,
      readiness,
      handoff,
      canStart: false,
      source: 'SUPABASE_RLS',
    },
  };
}

export function classifyWosInboxImages(
  images: readonly WosInboxReferenceImageRecord[],
  item: WosInboxItem,
): {
  readonly current: readonly WosInboxReferenceImageRecord[];
  readonly historical: readonly WosInboxReferenceImageRecord[];
} {
  const current = images.filter(image =>
    image.version_label === item.versionLabel
    && image.image_status === 'READY'
    && image.superseded_at === null);
  const currentIds = new Set(current.map(image => image.id));
  return {
    current,
    historical: images.filter(image => !currentIds.has(image.id)),
  };
}
