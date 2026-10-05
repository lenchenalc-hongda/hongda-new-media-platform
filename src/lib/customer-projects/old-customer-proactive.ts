import type { MetricValue } from './domain';

export const OLD_CUSTOMER_SEGMENTS = ['A', 'B', 'C', 'UNKNOWN'] as const;
export type OldCustomerSegment = (typeof OLD_CUSTOMER_SEGMENTS)[number];

export type OldCustomerRecommendationState =
  | 'not_due'
  | 'due'
  | 'suppressed_active_project'
  | 'suppressed_open_follow_up'
  | 'needs_baseline'
  | 'evidence_unknown';

export const OLD_CUSTOMER_CADENCE_DAYS: Record<
  Exclude<OldCustomerSegment, 'UNKNOWN'>,
  30 | 60 | 90
> = {
  A: 30,
  B: 60,
  C: 90,
};

export interface ProactiveCustomerRow {
  id: string;
  reference_kind: 'canonical' | 'provisional';
  status: string;
}

export interface ProactiveProjectRow {
  id: string;
  customer_reference_id: string;
  status: 'active' | 'paused' | 'won' | 'lost' | 'cancelled';
}

export interface ProactiveWorkItemRow {
  id: string;
  customer_reference_id: string | null;
  project_id: string | null;
  work_item_type: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
}

export interface ProactiveEventRow {
  id: string;
  customer_reference_id: string | null;
  project_id: string | null;
  event_type: string;
  occurred_at: string;
  payload?: Record<string, unknown> | null;
}

export interface OldCustomerRecommendation {
  customerReferenceId: string;
  segment: OldCustomerSegment;
  cadenceDays: 30 | 60 | 90 | null;
  segmentBasis: string;
  lastConfirmedRelationshipAt: string | null;
  lastTrustedTransactionAt: string | null;
  lastTrustedRelationshipOrTransactionAt: string | null;
  state: OldCustomerRecommendationState;
  nextSuggestedFollowUpAt: string | null;
  suppressionReason: string | null;
  recommendationOnly: true;
  overdue: false;
  countsAsKpi: false;
  formalWorkItemId: null;
  canArrangeFollowUp: boolean;
  evidence: {
    keyCustomerSignal: MetricValue<boolean>;
    transactionHistory: MetricValue<{
      latestEventId: string;
      latestEventType: string;
      latestOccurredAt: string;
    }>;
    relationshipBaseline: MetricValue<{
      latestEventId: string;
      latestEventType: string;
      latestOccurredAt: string;
    }>;
  };
}

export interface OldCustomerReactivationFacts {
  eligibleKnownCustomerCount: number;
  dueRecommendationCount: number;
  openCustomerFollowUpCount: number;
  confirmedRelationshipFollowUpCount: number;
  explicitFollowUpToProjectConversionCount: number;
}

export interface Phase10SourceCategoryReport {
  new_media_lead: MetricValue<OldCustomerReactivationFacts>;
  proactive_outbound: MetricValue<OldCustomerReactivationFacts>;
  old_customer_reactivation: MetricValue<OldCustomerReactivationFacts>;
}

export const RELATIONSHIP_EVENT_TYPES = [
  'CONTACT_LOGGED',
  'CUSTOMER_RESPONSE_RECEIVED',
] as const;

export const TRUSTED_TRANSACTION_EVENT_TYPES = [
  'ORDER_CONFIRMED',
  'PROJECT_WON',
] as const;

export const RELATIONSHIP_CONVERSION_SOURCE_KEY =
  'relationship_conversion_source_event_id';
export const RELATIONSHIP_FOLLOW_UP_MARKER_KEY = 'relationship_follow_up';

export interface TrustedProjectConversionProvenance {
  auditId: string;
  projectId: string;
  customerReferenceId: string;
  sourceFollowUpEventId: string;
  recordedAt: string;
}

export interface ProjectCreationAuditRow {
  id: string;
  org_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  request_id: string | null;
  metadata?: Record<string, unknown> | null;
  recorded_at: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const A_SEGMENT_WINDOW_MS = 365 * DAY_MS;
const OPEN_WORK_ITEM_STATUSES = new Set(['pending', 'in_progress', 'blocked']);
const RELATIONSHIP_EVENT_SET = new Set<string>(RELATIONSHIP_EVENT_TYPES);
const TRUSTED_TRANSACTION_EVENT_SET = new Set<string>(
  TRUSTED_TRANSACTION_EVENT_TYPES,
);

function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const valueMs = new Date(value).getTime();
  return Number.isFinite(valueMs) ? valueMs : null;
}

function isRelationshipEvent(event: ProactiveEventRow): boolean {
  return event.project_id === null
    && RELATIONSHIP_EVENT_SET.has(event.event_type);
}

function isConfirmedRelationshipFollowUpEvent(
  event: ProactiveEventRow,
): boolean {
  return isRelationshipEvent(event)
    && event.payload?.[RELATIONSHIP_FOLLOW_UP_MARKER_KEY] === true;
}

function isTrustedTransactionEvent(event: ProactiveEventRow): boolean {
  return event.project_id !== null
    && TRUSTED_TRANSACTION_EVENT_SET.has(event.event_type);
}

export function trustedProjectConversionProvenanceFromAudit(
  row: ProjectCreationAuditRow,
): TrustedProjectConversionProvenance | null {
  if (
    row.entity_type !== 'PROJECT'
    || row.action !== 'PROJECT_CREATED'
    || typeof row.id !== 'string'
    || row.id.length === 0
    || typeof row.entity_id !== 'string'
    || row.entity_id.length === 0
    || typeof row.request_id !== 'string'
    || row.request_id.length === 0
    || typeof row.recorded_at !== 'string'
    || row.recorded_at.length === 0
  ) {
    return null;
  }

  const metadata: Record<string, unknown> = row.metadata
    && typeof row.metadata === 'object'
    && !Array.isArray(row.metadata)
    ? row.metadata
    : {};
  const customerReferenceId = metadata.customer_reference_id;
  if (
    typeof customerReferenceId !== 'string'
    || customerReferenceId.length === 0
  ) {
    return null;
  }

  return {
    auditId: row.id,
    projectId: row.entity_id,
    customerReferenceId,
    sourceFollowUpEventId: row.request_id,
    recordedAt: row.recorded_at,
  };
}

function latestEvent(
  events: ProactiveEventRow[],
  predicate: (event: ProactiveEventRow) => boolean,
): ProactiveEventRow | null {
  let latest: ProactiveEventRow | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;

  for (const event of events) {
    if (!predicate(event)) continue;
    const eventMs = timestampMs(event.occurred_at);
    if (eventMs === null || eventMs < latestMs) continue;
    latest = event;
    latestMs = eventMs;
  }

  return latest;
}

function latestTimestamp(
  left: string | null,
  right: string | null,
): string | null {
  const leftMs = timestampMs(left);
  const rightMs = timestampMs(right);
  if (leftMs === null) return rightMs === null ? null : right;
  if (rightMs === null) return left;
  return leftMs >= rightMs ? left : right;
}

function suggestAt(baselineAt: string | null, cadenceDays: number | null): string | null {
  const baselineMs = timestampMs(baselineAt);
  if (baselineMs === null || cadenceDays === null) return null;
  return new Date(baselineMs + cadenceDays * DAY_MS).toISOString();
}

function evidenceUnknown<T>(reason: string): MetricValue<T> {
  return { state: 'unknown', reason };
}

function evidenceKnown<T>(value: T): MetricValue<T> {
  return { state: 'known', value };
}

export function buildOldCustomerRecommendation(input: {
  now: Date;
  customer: ProactiveCustomerRow;
  projects: ProactiveProjectRow[];
  workItems: ProactiveWorkItemRow[];
  events: ProactiveEventRow[];
}): OldCustomerRecommendation {
  const { now, customer } = input;
  const customerProjects = input.projects.filter(
    project => project.customer_reference_id === customer.id,
  );
  const customerEvents = input.events.filter(
    event => event.customer_reference_id === customer.id,
  );
  const customerWorkItems = input.workItems.filter(
    item => item.customer_reference_id === customer.id,
  );

  const latestTransaction = latestEvent(customerEvents, isTrustedTransactionEvent);
  const latestRelationship = latestEvent(customerEvents, isRelationshipEvent);
  const transactionAt = latestTransaction?.occurred_at ?? null;
  const relationshipAt = latestRelationship?.occurred_at ?? null;
  const transactionMs = timestampMs(transactionAt);

  const activeProject = customerProjects.some(project => project.status === 'active');
  const openCustomerFollowUp = customerWorkItems.some(item => (
    item.project_id === null
    && item.work_item_type === 'FOLLOW_UP'
    && OPEN_WORK_ITEM_STATUSES.has(item.status)
  ));

  const eligible = customer.reference_kind === 'canonical'
    && customer.status === 'active';

  let segment: OldCustomerSegment = 'UNKNOWN';
  let cadenceDays: 30 | 60 | 90 | null = null;
  let segmentBasis = '缺少可确认的老客户关系或交易证据，保持 UNKNOWN。';

  if (!eligible) {
    segmentBasis = customer.reference_kind === 'provisional'
      ? '临时客户不进入老客户周期；正式客户映射前保持 UNKNOWN。'
      : '只有 active 的正式客户引用可进入老客户周期。';
  } else if (
    latestTransaction
    && transactionMs !== null
    && now.getTime() - transactionMs <= A_SEGMENT_WINDOW_MS
  ) {
    segment = 'A';
    cadenceDays = OLD_CUSTOMER_CADENCE_DAYS.A;
    segmentBasis = latestTransaction.event_type === 'ORDER_CONFIRMED'
      ? '365 天内存在已确认订单事件。'
      : '365 天内存在 PROJECT_WON 生命周期事件。';
  } else if (latestTransaction && transactionMs !== null) {
    segment = 'B';
    cadenceDays = OLD_CUSTOMER_CADENCE_DAYS.B;
    segmentBasis = latestTransaction.event_type === 'ORDER_CONFIRMED'
      ? '存在较早期的已确认订单事件，且没有 365 天内交易证据。'
      : '存在较早期的 PROJECT_WON 事件，且没有 365 天内交易证据。';
  } else if (latestRelationship) {
    segment = 'C';
    cadenceDays = OLD_CUSTOMER_CADENCE_DAYS.C;
    segmentBasis = '未确认近期或历史交易；使用已确认的客户级关系互动作为周期基线。';
  }

  const cadenceBaseline = segment === 'C'
    ? relationshipAt
    : latestTimestamp(transactionAt, relationshipAt);
  const nextSuggestedFollowUpAt = suggestAt(cadenceBaseline, cadenceDays);

  let state: OldCustomerRecommendationState;
  let suppressionReason: string | null = null;

  if (!eligible) {
    state = 'evidence_unknown';
  } else if (activeProject) {
    state = 'suppressed_active_project';
    suppressionReason = '客户已有 active Project；不重复生成老客户建议。';
  } else if (openCustomerFollowUp) {
    state = 'suppressed_open_follow_up';
    suppressionReason = '客户已有开放的 customer-level FOLLOW_UP；不重复生成建议。';
  } else if (segment === 'UNKNOWN' || !cadenceBaseline) {
    state = 'needs_baseline';
    suppressionReason = '缺少已确认的关系或交易基线，不标记到期。';
  } else if (nextSuggestedFollowUpAt && now.getTime() >= new Date(nextSuggestedFollowUpAt).getTime()) {
    state = 'due';
  } else {
    state = 'not_due';
  }

  const canArrangeFollowUp = eligible
    && !activeProject
    && !openCustomerFollowUp
    && (state === 'due' || state === 'not_due');

  return {
    customerReferenceId: customer.id,
    segment,
    cadenceDays,
    segmentBasis,
    lastConfirmedRelationshipAt: relationshipAt,
    lastTrustedTransactionAt: transactionAt,
    lastTrustedRelationshipOrTransactionAt: cadenceBaseline,
    state,
    nextSuggestedFollowUpAt,
    suppressionReason,
    recommendationOnly: true,
    overdue: false,
    countsAsKpi: false,
    formalWorkItemId: null,
    canArrangeFollowUp,
    evidence: {
      keyCustomerSignal: evidenceUnknown(
        '当前没有已批准的权威关键客户标记；不从名称、金额、互动量或自由文本推断。',
      ),
      transactionHistory: latestTransaction
        ? evidenceKnown({
            latestEventId: latestTransaction.id,
            latestEventType: latestTransaction.event_type,
            latestOccurredAt: latestTransaction.occurred_at,
          })
        : evidenceUnknown(
            '当前 CPC 没有可确认的交易事件；缺失交易证据保持 UNKNOWN，不代表没有历史交易。',
          ),
      relationshipBaseline: latestRelationship
        ? evidenceKnown({
            latestEventId: latestRelationship.id,
            latestEventType: latestRelationship.event_type,
            latestOccurredAt: latestRelationship.occurred_at,
          })
        : evidenceUnknown(
            '没有已确认的 customer-level CONTACT_LOGGED / CUSTOMER_RESPONSE_RECEIVED 基线。',
          ),
    },
  };
}

export function buildOldCustomerRecommendations(input: {
  now: Date;
  customers: ProactiveCustomerRow[];
  projects: ProactiveProjectRow[];
  workItems: ProactiveWorkItemRow[];
  events: ProactiveEventRow[];
}): OldCustomerRecommendation[] {
  return input.customers.map(customer => buildOldCustomerRecommendation({
    now: input.now,
    customer,
    projects: input.projects,
    workItems: input.workItems,
    events: input.events,
  }));
}

export function countExplicitFollowUpToProjectConversions(
  events: ProactiveEventRow[],
  trustedProvenance: TrustedProjectConversionProvenance[] = [],
): number {
  const eventsById = new Map(events.map(event => [event.id, event]));
  const convertedSourceEventIds = new Set<string>();

  for (const provenance of trustedProvenance) {
    const sourceEventId = provenance.sourceFollowUpEventId;
    if (!sourceEventId || !provenance.projectId) continue;

    const sourceEvent = eventsById.get(sourceEventId);
    if (!sourceEvent || !isConfirmedRelationshipFollowUpEvent(sourceEvent)) {
      continue;
    }
    if (sourceEvent.customer_reference_id !== provenance.customerReferenceId) {
      continue;
    }

    const sourceAtMs = timestampMs(sourceEvent.occurred_at);
    const recordedAtMs = timestampMs(provenance.recordedAt);
    if (
      sourceAtMs === null
      || recordedAtMs === null
      || sourceAtMs > recordedAtMs
    ) {
      continue;
    }

    convertedSourceEventIds.add(sourceEventId);
  }

  return convertedSourceEventIds.size;
}

export function buildPhase10SourceCategoryReport(input: {
  recommendations: OldCustomerRecommendation[];
  workItems: ProactiveWorkItemRow[];
  events: ProactiveEventRow[];
  trustedProjectConversions?: TrustedProjectConversionProvenance[];
}): Phase10SourceCategoryReport {
  const oldCustomerFacts: OldCustomerReactivationFacts = {
    eligibleKnownCustomerCount: input.recommendations.filter(
      recommendation => recommendation.segment !== 'UNKNOWN',
    ).length,
    dueRecommendationCount: input.recommendations.filter(
      recommendation => recommendation.state === 'due',
    ).length,
    openCustomerFollowUpCount: input.workItems.filter(item => (
      item.project_id === null
      && item.work_item_type === 'FOLLOW_UP'
      && OPEN_WORK_ITEM_STATUSES.has(item.status)
    )).length,
    confirmedRelationshipFollowUpCount: input.events.filter(
      isConfirmedRelationshipFollowUpEvent,
    ).length,
    explicitFollowUpToProjectConversionCount:
      countExplicitFollowUpToProjectConversions(
        input.events,
        input.trustedProjectConversions,
      ),
  };

  const externalUnknown = evidenceUnknown<OldCustomerReactivationFacts>(
    'Phase 11 前没有已批准的 new_media_lead 权威来源分类映射；不从自由文本或通用来源字符串推断。',
  );
  const outboundUnknown = evidenceUnknown<OldCustomerReactivationFacts>(
    'Phase 11 前没有已批准的 proactive_outbound 权威来源分类映射；不从自由文本或通用来源字符串推断。',
  );

  return {
    new_media_lead: externalUnknown,
    proactive_outbound: outboundUnknown,
    old_customer_reactivation: evidenceKnown(oldCustomerFacts),
  };
}
