import {
  resolveTimelineActor,
  type TimelineActorDirectoryItem,
} from './timeline';

export interface AuditRow {
  id: string;
  entity_type: string;
  action: string;
  actor_profile_id: string | null;
  changes: unknown;
  version_before: number | null;
  version_after: number;
  created_at: string;
}

export type AuditActorDirectoryItem = TimelineActorDirectoryItem;

export interface AuditActorDTO {
  displayName: string;
  role: string | null;
  isActive: boolean | null;
}

export interface AuditLogDTO {
  id: string;
  entityType: string;
  action: string;
  actor: AuditActorDTO;
  details: Record<string, unknown>;
  versionBefore: number | null;
  versionAfter: number;
  createdAt: string;
}

export interface AuditPageInfo {
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export type AuditPaginationResult =
  | { ok: true; data: { limit: number; offset: number } }
  | { ok: false };

export interface AuditPageFetchResult {
  status: number;
  ok: boolean;
  items?: AuditLogDTO[];
  pageInfo?: AuditPageInfo;
}

const REVIEW_UPDATED_FIELDS = [
  'title',
  'review_type',
  'occurred_at',
  'customer_name',
  'order_no',
  'project_name',
  'product_name',
  'process_name',
  'description',
  'impact_summary',
  'risk_level',
  'risk_reason',
] as const;

const TYPE_DETAILS_FIELDS = [
  'additional_notes',
  'pre_production_stage',
  'problem_found_stage',
  'order_loss_reason',
  'customer_trust_impact',
  'customer_notified',
  'abnormal_phase',
  'abnormal_phenomenon',
  'defect_rate',
  'defect_items',
  'delivery_impact',
  'onsite_records',
  'frontend_stage',
  'production_stage',
  'root_cause_summary',
  'responsibility',
  'improvement_advice',
] as const;

const ACTION_UPDATED_FIELDS = [
  'title',
  'description',
  'action_type',
  'owner_profile_id',
  'due_date',
] as const;

const MEMBER_ROLES = new Set([
  'TECH_PROCESS',
  'DESIGN_PLATE',
  'PRODUCTION',
  'QUALITY',
  'EXPERT_REVIEWER',
  'OTHER',
]);

const REVIEW_TYPES = new Set(['A', 'B', 'C']);
const RISK_LEVELS = new Set(['RED', 'YELLOW', 'GREEN']);
const ACTION_TYPES = new Set(['IMMEDIATE', 'CORRECTIVE', 'PREVENTIVE']);
const ACTION_STATUSES = new Set([
  'OPEN',
  'IN_PROGRESS',
  'PENDING_VERIFICATION',
  'VERIFIED',
  'CANCELLED',
]);

const REVIEW_ACTIONS = new Set([
  'REVIEW_CREATED',
  'REVIEW_UPDATED',
  'REVIEW_SUBMITTED',
  'REVIEW_CLOSED',
  'REVIEW_REOPENED',
]);

const TYPE_DETAILS_ACTIONS = new Set(['TYPE_DETAILS_SAVED']);

const MEMBER_ACTIONS = new Set([
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'MEMBER_PRIMARY_SET',
]);

const ASSIGNMENT_ACTIONS = new Set(['ASSIGNMENT_UPDATED']);

const ACTION_ACTIONS = new Set([
  'ACTION_CREATED',
  'ACTION_UPDATED',
  'ACTION_STARTED',
  'ACTION_SUBMITTED_FOR_VERIFICATION',
  'ACTION_VERIFIED',
  'ACTION_RETURNED',
  'ACTION_CANCELLED',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function sanitizeBoundedString(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > maxLength) return null;
  return trimmed;
}

function sanitizeEnum(value: unknown, allowed: Set<string>): string | null {
  return typeof value === 'string' && allowed.has(value) ? value : null;
}

function sanitizeBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function sanitizePositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

function sanitizeFiniteNumber(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return lengths[month - 1];
}

function sanitizeDateOnly(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return value;
}

function sanitizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return null;
  if (!Number.isFinite(Date.parse(trimmed))) return null;
  return trimmed;
}

function sanitizeVersion(value: unknown): number | null {
  return sanitizePositiveInt(value);
}

function sanitizeEnumPair(
  value: unknown,
  allowed: Set<string>,
): { before: string; after: string } | null {
  if (!isObject(value)) return null;
  const before = sanitizeEnum(value.before, allowed);
  const after = sanitizeEnum(value.after, allowed);
  if (before === null || after === null) return null;
  return { before, after };
}

function sanitizeBooleanPair(
  value: unknown,
): { before: boolean; after: boolean } | null {
  if (!isObject(value)) return null;
  const before = sanitizeBoolean(value.before);
  const after = sanitizeBoolean(value.after);
  if (before === null || after === null) return null;
  return { before, after };
}

function sanitizeNumberPair(
  value: unknown,
  min: number,
  max: number,
): { before: number; after: number } | null {
  if (!isObject(value)) return null;
  const before = sanitizeFiniteNumber(value.before, min, max);
  const after = sanitizeFiniteNumber(value.after, min, max);
  if (before === null || after === null) return null;
  return { before, after };
}

function sanitizeTimestampPair(
  value: unknown,
): { before: string; after: string } | null {
  if (!isObject(value)) return null;
  const before = sanitizeTimestamp(value.before);
  const after = sanitizeTimestamp(value.after);
  if (before === null || after === null) return null;
  return { before, after };
}

function sanitizeOptionalTimestampPair(
  value: unknown,
): { before: string | null; after: string } | null {
  if (!isObject(value)) return null;
  const before = sanitizeTimestamp(value.before);
  const after = sanitizeTimestamp(value.after);
  if (after === null) return null;
  return { before, after };
}

function sanitizeStatusPair(
  value: unknown,
  allowedBefore: Set<string>,
  allowedAfter: Set<string>,
): { before: string; after: string } | null {
  if (!isObject(value)) return null;
  const before = sanitizeEnum(value.before, allowedBefore);
  const after = sanitizeEnum(value.after, allowedAfter);
  if (before === null || after === null) return null;
  return { before, after };
}

function sanitizeReviewCreated(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  const reviewNo = sanitizeBoundedString(source.review_no, 50);
  if (reviewNo !== null) details.reviewNo = reviewNo;
  const reviewType = sanitizeEnum(source.review_type, REVIEW_TYPES);
  if (reviewType !== null) details.reviewType = reviewType;
  const title = sanitizeBoundedString(source.title, 200);
  if (title !== null) details.title = title;
  return details;
}

function sanitizeReviewUpdated(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const changedFields: string[] = [];
  const safeChanges: Record<string, unknown> = {};

  for (const field of REVIEW_UPDATED_FIELDS) {
    if (!hasOwn(source, field) || !isObject(source[field])) continue;
    changedFields.push(field);
    if (field === 'review_type') {
      const pair = sanitizeEnumPair(source[field], REVIEW_TYPES);
      if (pair !== null) safeChanges[field] = pair;
    } else if (field === 'risk_level') {
      const pair = sanitizeEnumPair(source[field], RISK_LEVELS);
      if (pair !== null) safeChanges[field] = pair;
    } else if (field === 'occurred_at') {
      const pair = sanitizeTimestampPair(source[field]);
      if (pair !== null) safeChanges[field] = pair;
    }
  }

  return { changedFields, safeChanges };
}

function sanitizeReviewLifecycle(
  source: Record<string, unknown>,
  before: Set<string>,
  after: string,
): Record<string, unknown> {
  const pair = sanitizeStatusPair(source.status, before, new Set([after]));
  return pair === null ? {} : { status: pair };
}

function sanitizeReviewReopened(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const pair = sanitizeStatusPair(
    source.status,
    new Set(['submitted', 'closed']),
    new Set(['draft']),
  );
  if (pair === null) return {};
  return { fromStatus: pair.before, status: pair };
}

function sanitizeTypeDetailsSaved(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const changedFields: string[] = [];
  const safeChanges: Record<string, unknown> = {};

  for (const field of TYPE_DETAILS_FIELDS) {
    if (!hasOwn(source, field) || !isObject(source[field])) continue;
    changedFields.push(field);
    if (field === 'customer_notified') {
      const pair = sanitizeBooleanPair(source[field]);
      if (pair !== null) safeChanges[field] = pair;
    } else if (field === 'defect_rate') {
      const pair = sanitizeNumberPair(source[field], 0, 100);
      if (pair !== null) safeChanges[field] = pair;
    }
  }

  return {
    created: sanitizeBoolean(source.created),
    reviewType: sanitizeEnum(source.review_type, REVIEW_TYPES),
    changedFields,
    safeChanges,
  };
}

function sanitizeMemberAdded(
  source: Record<string, unknown>,
): Record<string, unknown> {
  return {
    memberRole: sanitizeEnum(source.member_role, MEMBER_ROLES),
    isPrimary: sanitizeBoolean(source.is_primary),
  };
}

function sanitizeMemberPrimarySet(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const hadPreviousPrimary =
    source.previous_primary_id !== null
    && source.previous_primary_id !== undefined
    || source.previous_primary_profile_id !== null
    && source.previous_primary_profile_id !== undefined;
  return {
    memberRole: sanitizeEnum(source.member_role, MEMBER_ROLES),
    hadPreviousPrimary,
  };
}

function sanitizeAssignmentUpdated(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const changedFields: string[] = [];
  if (isObject(source.owner_id)) changedFields.push('owner_id');
  if (isObject(source.pmo_id)) changedFields.push('pmo_id');
  return { changedFields };
}

function sanitizeActionCreated(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  const sequence = sanitizePositiveInt(source.sequence);
  if (sequence !== null) details.sequence = sequence;
  const title = sanitizeBoundedString(source.title, 200);
  if (title !== null) details.title = title;
  const actionType = sanitizeEnum(source.action_type, ACTION_TYPES);
  if (actionType !== null) details.actionType = actionType;
  const dueDate = sanitizeDateOnly(source.due_date);
  if (dueDate !== null) details.dueDate = dueDate;
  const status = sanitizeEnum(source.status, ACTION_STATUSES);
  if (status !== null) details.status = status;
  return details;
}

function sanitizeActionUpdated(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const changedFields: string[] = [];
  const safeChanges: Record<string, unknown> = {};

  for (const field of ACTION_UPDATED_FIELDS) {
    if (!hasOwn(source, field) || !isObject(source[field])) continue;
    changedFields.push(field);
    if (field === 'action_type') {
      const pair = sanitizeEnumPair(source[field], ACTION_TYPES);
      if (pair !== null) safeChanges[field] = pair;
    } else if (field === 'due_date') {
      const pair = sanitizeDatePair(source[field]);
      if (pair !== null) safeChanges[field] = pair;
    }
  }

  return { changedFields, safeChanges };
}

function sanitizeDatePair(
  value: unknown,
): { before: string; after: string } | null {
  if (!isObject(value)) return null;
  const before = sanitizeDateOnly(value.before);
  const after = sanitizeDateOnly(value.after);
  if (before === null || after === null) return null;
  return { before, after };
}

function sanitizeActionStarted(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const pair = sanitizeStatusPair(
    source.status,
    new Set(['OPEN']),
    new Set(['IN_PROGRESS']),
  );
  return pair === null ? {} : { status: pair };
}

function sanitizeActionSubmitted(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  const pair = sanitizeStatusPair(
    source.status,
    new Set(['OPEN', 'IN_PROGRESS']),
    new Set(['PENDING_VERIFICATION']),
  );
  if (pair !== null) details.status = pair;
  const completedAt = sanitizeOptionalTimestampPair(source.completed_at);
  if (completedAt !== null) details.completedAt = completedAt;
  return details;
}

function sanitizeActionVerified(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  const pair = sanitizeStatusPair(
    source.status,
    new Set(['PENDING_VERIFICATION']),
    new Set(['VERIFIED']),
  );
  if (pair !== null) details.status = pair;
  const verifiedAt = sanitizeOptionalTimestampPair(source.verified_at);
  if (verifiedAt !== null) details.verifiedAt = verifiedAt;
  return details;
}

function sanitizeActionReturned(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  const pair = sanitizeStatusPair(
    source.status,
    new Set(['PENDING_VERIFICATION']),
    new Set(['IN_PROGRESS']),
  );
  if (pair !== null) details.status = pair;
  const completedAt = sanitizeOptionalTimestampPair(source.completed_at);
  if (completedAt !== null) details.completedAt = completedAt;
  const verifiedAt = sanitizeOptionalTimestampPair(source.verified_at);
  if (verifiedAt !== null) details.verifiedAt = verifiedAt;
  return details;
}

function sanitizeActionCancelled(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  const pair = sanitizeStatusPair(
    source.status,
    new Set(['OPEN', 'IN_PROGRESS', 'PENDING_VERIFICATION']),
    new Set(['CANCELLED']),
  );
  if (pair !== null) details.status = pair;
  const cancelledAt = sanitizeOptionalTimestampPair(source.cancelled_at);
  if (cancelledAt !== null) details.cancelledAt = cancelledAt;
  return details;
}

export function sanitizeAuditDetails(
  entityType: string,
  action: string,
  changes: unknown,
): Record<string, unknown> {
  if (!isObject(changes)) return {};
  const source = changes;

  if (entityType === 'REVIEW' && REVIEW_ACTIONS.has(action)) {
    if (action === 'REVIEW_CREATED') return sanitizeReviewCreated(source);
    if (action === 'REVIEW_UPDATED') return sanitizeReviewUpdated(source);
    if (action === 'REVIEW_SUBMITTED') {
      return sanitizeReviewLifecycle(source, new Set(['draft']), 'submitted');
    }
    if (action === 'REVIEW_CLOSED') {
      return sanitizeReviewLifecycle(source, new Set(['submitted']), 'closed');
    }
    if (action === 'REVIEW_REOPENED') return sanitizeReviewReopened(source);
  }

  if (entityType === 'TYPE_DETAILS' && TYPE_DETAILS_ACTIONS.has(action)) {
    return sanitizeTypeDetailsSaved(source);
  }

  if (entityType === 'MEMBER' && MEMBER_ACTIONS.has(action)) {
    if (action === 'MEMBER_PRIMARY_SET') return sanitizeMemberPrimarySet(source);
    return sanitizeMemberAdded(source);
  }

  if (entityType === 'ASSIGNMENT' && ASSIGNMENT_ACTIONS.has(action)) {
    return sanitizeAssignmentUpdated(source);
  }

  if (entityType === 'ACTION' && ACTION_ACTIONS.has(action)) {
    if (action === 'ACTION_CREATED') return sanitizeActionCreated(source);
    if (action === 'ACTION_UPDATED') return sanitizeActionUpdated(source);
    if (action === 'ACTION_STARTED') return sanitizeActionStarted(source);
    if (action === 'ACTION_SUBMITTED_FOR_VERIFICATION') {
      return sanitizeActionSubmitted(source);
    }
    if (action === 'ACTION_VERIFIED') return sanitizeActionVerified(source);
    if (action === 'ACTION_RETURNED') return sanitizeActionReturned(source);
    if (action === 'ACTION_CANCELLED') return sanitizeActionCancelled(source);
  }

  return {};
}

export function buildAuditDTO(
  row: AuditRow,
  actorDirectory: AuditActorDirectoryItem[],
): AuditLogDTO | null {
  const versionAfter = sanitizeVersion(row.version_after);
  if (versionAfter === null) return null;
  if (typeof row.id !== 'string' || row.id.trim() === '') return null;
  if (typeof row.created_at !== 'string' || row.created_at.trim() === '') {
    return null;
  }
  const entityType = typeof row.entity_type === 'string' ? row.entity_type : 'UNKNOWN';
  const action = typeof row.action === 'string' ? row.action : 'UNKNOWN';
  return {
    id: row.id,
    entityType,
    action,
    actor: resolveTimelineActor(row.actor_profile_id, actorDirectory),
    details: sanitizeAuditDetails(entityType, action, row.changes),
    versionBefore: sanitizeVersion(row.version_before) ?? null,
    versionAfter,
    createdAt: row.created_at,
  };
}

export function buildAuditPageInfo(
  limit: number,
  offset: number,
  returnedCount: number,
  hasMore: boolean,
): AuditPageInfo {
  return {
    limit,
    offset,
    hasMore,
    nextOffset: hasMore ? offset + returnedCount : null,
  };
}

function parseBoundedInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (raw === null) return fallback;
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < min || value > max) return null;
  return value;
}

export function parseAuditPagination(
  searchParams: URLSearchParams,
): AuditPaginationResult {
  if (searchParams.getAll('limit').length > 1 || searchParams.getAll('offset').length > 1) {
    return { ok: false };
  }
  const limit = parseBoundedInt(searchParams.get('limit'), 30, 1, 50);
  const offset = parseBoundedInt(
    searchParams.get('offset'),
    0,
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (limit === null || offset === null) return { ok: false };
  return { ok: true, data: { limit, offset } };
}

function isAuditActorDTO(value: unknown): value is AuditActorDTO {
  if (!isObject(value)) return false;
  return (
    typeof value.displayName === 'string'
    && (typeof value.role === 'string' || value.role === null)
    && (typeof value.isActive === 'boolean' || value.isActive === null)
  );
}

function isAuditLogDTO(value: unknown): value is AuditLogDTO {
  if (!isObject(value)) return false;
  const versionAfter = value.versionAfter;
  return (
    typeof value.id === 'string'
    && typeof value.entityType === 'string'
    && typeof value.action === 'string'
    && isAuditActorDTO(value.actor)
    && isObject(value.details)
    && (typeof value.versionBefore === 'number' || value.versionBefore === null)
    && typeof versionAfter === 'number'
    && Number.isInteger(versionAfter)
    && versionAfter >= 1
    && typeof value.createdAt === 'string'
  );
}

function isAuditPageInfo(value: unknown): value is AuditPageInfo {
  if (!isObject(value)) return false;
  const { limit, offset, hasMore, nextOffset } = value;
  return (
    typeof limit === 'number'
    && Number.isInteger(limit)
    && limit >= 1
    && typeof offset === 'number'
    && Number.isInteger(offset)
    && offset >= 0
    && typeof hasMore === 'boolean'
    && (typeof nextOffset === 'number' || nextOffset === null)
  );
}

export function parseAuditPageResponse(
  body: unknown,
  status: number,
): AuditPageFetchResult {
  if (!isObject(body) || body.ok !== true) return { status, ok: false };
  const data = body.data;
  if (!isObject(data) || !Array.isArray(data.logs)) return { status, ok: false };
  if (!isAuditPageInfo(data.pageInfo)) return { status, ok: false };
  for (const log of data.logs) {
    if (!isAuditLogDTO(log)) return { status, ok: false };
  }
  return {
    status,
    ok: status >= 200 && status < 300,
    items: data.logs as AuditLogDTO[],
    pageInfo: data.pageInfo,
  };
}
