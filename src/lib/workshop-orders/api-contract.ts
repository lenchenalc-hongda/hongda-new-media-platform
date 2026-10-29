import { z } from 'zod';
import { PRODUCTION_TRANSITIONS, SAMPLING_TRANSITIONS, type WosEntityType } from './domain';

// Phase 5C: read-only, organization-scoped API contracts. No database writes
// are permitted until a reviewed atomic submission RPC and audit gate exist.
export const WOS_INBOX_LIMIT_PER_TYPE = 200;
export const WOS_API_INPUT_LIMIT_CHARS = 32768;
export const WOS_READ_ROLES = ['admin', 'manager', 'sales', 'workshop', 'technician'] as const;
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

export type WosInboxProjection =
  | { readonly ok: true; readonly items: readonly WosInboxItem[] }
  | { readonly ok: false; readonly code: 'UNTRUSTED_DB_ROW' | 'LIMIT_EXCEEDED' | 'DUPLICATE_SOURCE' };

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
