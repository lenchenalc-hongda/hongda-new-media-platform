export interface TimelineRow {
  id: string;
  event_type: string;
  actor_profile_id: string | null;
  payload: unknown;
  version: number;
  created_at: string;
}

export interface TimelineActorDirectoryItem {
  profile_id: string;
  display_name: string;
  role: string;
  is_active: boolean;
}

export interface TimelineActorDTO {
  displayName: string;
  role: string | null;
  isActive: boolean | null;
}

export interface TimelineItemDTO {
  id: string;
  eventType: string;
  actor: TimelineActorDTO;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface TimelinePageInfo {
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export type TimelinePaginationResult =
  | { ok: true; data: { limit: number; offset: number } }
  | { ok: false };

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

const MEMBER_ROLES = new Set([
  'TECH_PROCESS',
  'DESIGN_PLATE',
  'PRODUCTION',
  'QUALITY',
  'EXPERT_REVIEWER',
  'OTHER',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function normalizeMemberRole(value: unknown): string | null {
  return typeof value === 'string' && MEMBER_ROLES.has(value) ? value : null;
}

function objectChanged(value: unknown): boolean {
  return isObject(value);
}

export function parseTimelinePagination(
  searchParams: URLSearchParams,
): TimelinePaginationResult {
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

export function sanitizeTimelineDetails(
  eventType: string,
  payload: unknown,
): Record<string, unknown> {
  const source = isObject(payload) ? payload : {};

  if (eventType === 'REVIEW_CREATED') {
    return {
      reviewNo: typeof source.review_no === 'string' ? source.review_no : null,
      reviewType: typeof source.review_type === 'string' ? source.review_type : null,
      title: typeof source.title === 'string' ? source.title : null,
    };
  }

  if (eventType === 'REVIEW_UPDATED') {
    const diff = isObject(source.changes) ? source.changes : source;
    return {
      changedFields: REVIEW_UPDATED_FIELDS.filter(field =>
        Object.prototype.hasOwnProperty.call(diff, field),
      ),
    };
  }

  if (eventType === 'TYPE_DETAILS_SAVED') {
    const diff = isObject(source.changes) ? source.changes : source;
    return {
      reviewType: typeof diff.review_type === 'string' ? diff.review_type : null,
      created: typeof diff.created === 'boolean' ? diff.created : null,
      changedFields: TYPE_DETAILS_FIELDS.filter(field =>
        Object.prototype.hasOwnProperty.call(diff, field),
      ),
    };
  }

  if (eventType === 'ASSIGNMENT_UPDATED') {
    return {
      ownerChanged: objectChanged(source.owner_id),
      pmoChanged: objectChanged(source.pmo_id),
    };
  }

  if (eventType === 'MEMBER_ADDED') {
    return {
      memberRole: normalizeMemberRole(source.member_role),
      isPrimary: typeof source.is_primary === 'boolean' ? source.is_primary : null,
    };
  }

  if (eventType === 'MEMBER_REMOVED') {
    return {
      memberRole: normalizeMemberRole(source.member_role),
      wasPrimary: typeof source.is_primary === 'boolean' ? source.is_primary : null,
    };
  }

  if (eventType === 'MEMBER_PRIMARY_SET') {
    return {
      memberRole: normalizeMemberRole(source.member_role),
      hadPreviousPrimary:
        source.previous_primary_id !== null
        && source.previous_primary_id !== undefined
        || source.previous_primary_profile_id !== null
        && source.previous_primary_profile_id !== undefined,
    };
  }

  if (eventType === 'REVIEW_SUBMITTED') {
    return {};
  }

  if (eventType === 'REVIEW_CLOSED') {
    return {};
  }

  if (eventType === 'REVIEW_REOPENED') {
    if (source.from_status === 'submitted') {
      return { fromStatus: 'submitted' };
    }
    if (source.from_status === 'closed') {
      const rawReason = source.reason;
      const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
      const details: Record<string, unknown> = { fromStatus: 'closed' };
      if (reason.length >= 1 && reason.length <= 1000) {
        details.reason = reason;
      }
      return details;
    }
    return {};
  }

  return {};
}

export function resolveTimelineActor(
  actorProfileId: string | null | undefined,
  directoryItems: TimelineActorDirectoryItem[],
): TimelineActorDTO {
  if (actorProfileId === null || actorProfileId === undefined) {
    return { displayName: '系统操作', role: null, isActive: null };
  }
  const item = directoryItems.find(entry => entry.profile_id === actorProfileId);
  if (!item) {
    return { displayName: '历史操作人', role: null, isActive: null };
  }
  return {
    displayName: item.display_name,
    role: item.role,
    isActive: item.is_active,
  };
}

export function buildTimelineDTO(
  row: TimelineRow,
  actorDirectory: TimelineActorDirectoryItem[],
): TimelineItemDTO {
  return {
    id: row.id,
    eventType: row.event_type,
    actor: resolveTimelineActor(row.actor_profile_id, actorDirectory),
    details: sanitizeTimelineDetails(row.event_type, row.payload),
    createdAt: row.created_at,
  };
}

export function buildTimelinePageInfo(
  limit: number,
  offset: number,
  returnedCount: number,
  hasMore: boolean,
): TimelinePageInfo {
  return {
    limit,
    offset,
    hasMore,
    nextOffset: hasMore ? offset + returnedCount : null,
  };
}
