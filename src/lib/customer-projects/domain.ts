// Customer Project Center domain contracts.
// This module is intentionally free of persistence and environment access.

export const PROJECT_TYPES = [
  'transfer_film',
  'transfer_processing',
  'equipment',
  'uv',
  'other',
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_LIFECYCLE_STATUSES = [
  'active',
  'paused',
  'won',
  'lost',
  'cancelled',
] as const;

export type ProjectLifecycleStatus = (typeof PROJECT_LIFECYCLE_STATUSES)[number];

export const PROJECT_LIFECYCLE_TRANSITIONS: Record<
  ProjectLifecycleStatus,
  readonly ProjectLifecycleStatus[]
> = {
  active: ['paused', 'won', 'lost', 'cancelled'],
  paused: ['active', 'lost', 'cancelled'],
  won: [],
  lost: ['active', 'cancelled'],
  cancelled: [],
};

export const WAITING_ON_VALUES = [
  'none',
  'customer',
  'internal',
  'supplier',
  'quality',
  'finance',
  'logistics',
  'other',
] as const;

export type WaitingOn = (typeof WAITING_ON_VALUES)[number];

export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const PROJECT_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];

export const CUSTOMER_REFERENCE_KINDS = ['canonical', 'provisional'] as const;
export type CustomerReferenceKind = (typeof CUSTOMER_REFERENCE_KINDS)[number];

export const CANONICAL_CUSTOMER_REFERENCE_STATUSES = ['active', 'inactive'] as const;
export type CanonicalCustomerReferenceStatus =
  (typeof CANONICAL_CUSTOMER_REFERENCE_STATUSES)[number];

export interface CanonicalCustomerReference {
  id: string;
  org_id: string;
  reference_kind: 'canonical';
  external_source: string;
  external_customer_id: string;
  display_name_snapshot: string;
  external_owner_reference: string | null;
  source_synced_at: string;
  status: CanonicalCustomerReferenceStatus;
  created_at: string;
  updated_at: string;
}

export const PROVISIONAL_CUSTOMER_REFERENCE_STATUSES = [
  'pending_review',
  'mapped',
  'inactive',
] as const;

export type ProvisionalCustomerReferenceStatus =
  (typeof PROVISIONAL_CUSTOMER_REFERENCE_STATUSES)[number];

export interface ProvisionalCustomerReference {
  id: string;
  org_id: string;
  reference_kind: 'provisional';
  provisional_source_reference: string;
  display_name_snapshot: string;
  status: ProvisionalCustomerReferenceStatus;
  mapped_canonical_reference_id: string | null;
  created_by_profile_id: string;
  created_at: string;
  updated_at: string;
}

export type CustomerReference =
  | CanonicalCustomerReference
  | ProvisionalCustomerReference;

export interface Project {
  id: string;
  org_id: string;
  customer_reference_id: string;
  title: string;
  objective_summary: string;
  project_type: ProjectType;
  owner_profile_id: string;
  status: ProjectLifecycleStatus;
  stage: string;
  waiting_on: WaitingOn;
  next_action_summary: string | null;
  next_check_at: string | null;
  risk_level: RiskLevel | null;
  priority: ProjectPriority;
  expected_amount_minor: number | null;
  currency: string | null;
  expected_close_date: string | null;
  version: number;
  created_by_profile_id: string;
  created_at: string;
  updated_at: string;
}

export const PROJECT_COLLABORATOR_ROLES = [
  'technical',
  'design',
  'quality',
  'management',
  'support',
] as const;

export type ProjectCollaboratorRole = (typeof PROJECT_COLLABORATOR_ROLES)[number];

export interface ProjectCollaborator {
  id: string;
  org_id: string;
  project_id: string;
  profile_id: string;
  collaborator_role: ProjectCollaboratorRole;
  added_by_profile_id: string;
  created_at: string;
}

export const PROJECT_EVENT_TYPES = [
  'CONTACT_LOGGED',
  'EFFECTIVE_PROGRESS_RECORDED',
  'CUSTOMER_RESPONSE_RECEIVED',
  'WAITING_STARTED',
  'WAITING_RESOLVED',
  'QUOTE_SENT',
  'SAMPLE_SENT',
  'CUSTOMER_CONFIRMED',
  'COMMERCIAL_CONFIRMED',
  'ORDER_CONFIRMED',
  'STAGE_CHANGED',
  'PROJECT_PAUSED',
  'PROJECT_REOPENED',
  'PROJECT_WON',
  'PROJECT_LOST',
  'PROJECT_CANCELLED',
] as const;

export type ProjectEventType = (typeof PROJECT_EVENT_TYPES)[number];

export const PROJECT_EVENT_CATEGORIES = [
  'CONTACT',
  'PROGRESS',
  'WAIT',
  'COMMERCIAL',
  'LIFECYCLE',
] as const;

export type ProjectEventCategory = (typeof PROJECT_EVENT_CATEGORIES)[number];

export const PROJECT_EVENT_SOURCES = [
  'user',
  'accepted_ai_draft',
  'integration',
  'system',
] as const;

export type ProjectEventSource = (typeof PROJECT_EVENT_SOURCES)[number];

export interface ProjectEvent {
  id: string;
  org_id: string;
  customer_reference_id: string | null;
  project_id: string | null;
  event_type: ProjectEventType;
  event_category: ProjectEventCategory;
  occurred_at: string;
  recorded_at: string;
  actor_profile_id: string | null;
  source: ProjectEventSource;
  source_reference_id: string | null;
  raw_input: string | null;
  payload_schema_version: number;
  payload: Record<string, unknown>;
  correction_of_event_id: string | null;
}

export const WORK_ITEM_TYPES = [
  'NEXT_ACTION',
  'CUSTOMER_COMMITMENT',
  'INTERNAL_COLLABORATION',
  'FOLLOW_UP',
  'MANAGEMENT_DECISION',
] as const;

export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];

export const WORK_ITEM_STATUSES = [
  'pending',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
] as const;

export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const WORK_ITEM_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];

export const WORK_ITEM_TRANSITIONS: Record<
  WorkItemStatus,
  readonly WorkItemStatus[]
> = {
  pending: ['in_progress', 'blocked', 'completed', 'cancelled'],
  in_progress: ['blocked', 'completed', 'cancelled'],
  blocked: ['in_progress', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export interface WorkItem {
  id: string;
  org_id: string;
  customer_reference_id: string | null;
  project_id: string | null;
  work_item_type: WorkItemType;
  title: string;
  description: string | null;
  assignee_profile_id: string;
  created_by_profile_id: string;
  due_at: string | null;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  blocked_reason: string | null;
  completed_at: string | null;
  completed_by_profile_id: string | null;
  cancelled_at: string | null;
  cancelled_by_profile_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface WorkItemReschedule {
  id: string;
  org_id: string;
  work_item_id: string;
  from_due_at: string | null;
  to_due_at: string | null;
  reason: string;
  actor_profile_id: string;
  occurred_at: string;
  work_item_version: number;
}

export const AI_DRAFT_PROPOSAL_TYPES = [
  'PROJECT_EVENT',
  'WORK_ITEM',
  'PROJECT_FIELD_UPDATE',
  'CUSTOMER_REFERENCE',
  'REPORT_NARRATIVE',
] as const;

export type AIDraftProposalType = (typeof AI_DRAFT_PROPOSAL_TYPES)[number];

export const AI_DRAFT_STATUSES = [
  'draft',
  'accepted',
  'rejected',
  'expired',
] as const;

export type AIDraftStatus = (typeof AI_DRAFT_STATUSES)[number];

export const AI_DRAFT_TRANSITIONS: Record<
  AIDraftStatus,
  readonly AIDraftStatus[]
> = {
  draft: ['accepted', 'rejected', 'expired'],
  accepted: [],
  rejected: [],
  expired: [],
};

export interface AIDraft {
  id: string;
  org_id: string;
  raw_input: string;
  structured_proposal: unknown;
  proposal_type: AIDraftProposalType;
  customer_reference_id: string | null;
  project_id: string | null;
  confidence: number | null;
  status: AIDraftStatus;
  accepted_by_profile_id: string | null;
  accepted_at: string | null;
  rejected_by_profile_id: string | null;
  rejected_at: string | null;
  source_model: string | null;
  source_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export type MetricValue<T> =
  | { state: 'known'; value: T }
  | { state: 'unknown'; reason: string };

export const DERIVED_REPORT_PERIODS = ['daily', 'weekly'] as const;
export type DerivedReportPeriod = (typeof DERIVED_REPORT_PERIODS)[number];

export const DERIVED_REPORT_STATUSES = [
  'draft',
  'submitted',
] as const;

export type DerivedReportStatus = (typeof DERIVED_REPORT_STATUSES)[number];

export const INGESTION_CURSOR_KINDS = [
  'recorded_at_id',
  'monotonic_sequence',
] as const;

export type IngestionCursor =
  | {
      cursor_kind: 'recorded_at_id';
      recorded_at: string;
      record_id: string;
    }
  | {
      cursor_kind: 'monotonic_sequence';
      sequence: number;
    };

export interface DerivedReportSnapshot {
  id: string;
  org_id: string;
  subject_profile_id: string;
  period: DerivedReportPeriod;
  period_start: string;
  period_end: string;
  timezone: string;
  status: DerivedReportStatus;
  deterministic_metrics: Record<string, MetricValue<number>>;
  ai_narrative: string | null;
  source_event_cursor: IngestionCursor | null;
  source_work_item_cursor: IngestionCursor | null;
  version: number;
  supersedes_report_id: string | null;
  submitted_by_profile_id: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export const REPORT_METRIC_SEMANTICS = {
  actionCountIsNotUniqueCustomerCount: true,
  actionCountIsNotUniqueProjectCount: true,
  quoteCountIsNotConfirmedOrderCount: true,
  expectedAmountIsNotConfirmedOrderOrPayment: true,
  mixedCurrenciesRequireApprovedFxPolicy: true,
  missingDataIsUnknownNotZeroOrNoWork: true,
} as const;

export const BUSINESS_PROFILE_FK_FIELDS = [
  'owner_profile_id',
  'created_by_profile_id',
  'assignee_profile_id',
  'completed_by_profile_id',
  'cancelled_by_profile_id',
  'actor_profile_id',
  'added_by_profile_id',
  'removed_by_profile_id',
  'mapped_by_profile_id',
  'accepted_by_profile_id',
  'rejected_by_profile_id',
  'submitted_by_profile_id',
  'subject_profile_id',
] as const;

export function isValidBusinessProfileForeignKey(fieldName: string): boolean {
  return /_profile_id$/.test(fieldName)
    && !fieldName.includes('auth_user')
    && !fieldName.includes('auth.users');
}

export function canTransitionProject(
  from: ProjectLifecycleStatus,
  to: ProjectLifecycleStatus,
): boolean {
  return PROJECT_LIFECYCLE_TRANSITIONS[from].includes(to);
}

export function canTransitionWorkItem(
  from: WorkItemStatus,
  to: WorkItemStatus,
): boolean {
  return WORK_ITEM_TRANSITIONS[from].includes(to);
}

export function canTransitionAIDraft(
  from: AIDraftStatus,
  to: AIDraftStatus,
): boolean {
  return AI_DRAFT_TRANSITIONS[from].includes(to);
}

export function buildCanonicalCustomerReferenceIdentityKey(input: {
  org_id: string;
  external_source: string;
  external_customer_id: string;
}): string {
  return JSON.stringify([
    input.org_id,
    input.external_source,
    input.external_customer_id,
  ]);
}

export function isValidProjectCollaboration(input: {
  ownerProfileId: string;
  collaborators: Array<Pick<ProjectCollaborator, 'profile_id' | 'collaborator_role'>>;
}): boolean {
  if (!input.ownerProfileId) return false;

  const profileIds = input.collaborators.map(collaborator => collaborator.profile_id);
  if (profileIds.some(profileId => profileId === input.ownerProfileId)) return false;
  if (new Set(profileIds).size !== profileIds.length) return false;

  return input.collaborators.every(collaborator =>
    PROJECT_COLLABORATOR_ROLES.includes(collaborator.collaborator_role),
  );
}

export function getProjectEventCategory(
  eventType: ProjectEventType,
): ProjectEventCategory {
  switch (eventType) {
    case 'CONTACT_LOGGED':
    case 'CUSTOMER_RESPONSE_RECEIVED':
      return 'CONTACT';
    case 'EFFECTIVE_PROGRESS_RECORDED':
      return 'PROGRESS';
    case 'WAITING_STARTED':
    case 'WAITING_RESOLVED':
      return 'WAIT';
    case 'QUOTE_SENT':
    case 'SAMPLE_SENT':
    case 'CUSTOMER_CONFIRMED':
    case 'COMMERCIAL_CONFIRMED':
    case 'ORDER_CONFIRMED':
      return 'COMMERCIAL';
    case 'STAGE_CHANGED':
    case 'PROJECT_PAUSED':
    case 'PROJECT_REOPENED':
    case 'PROJECT_WON':
    case 'PROJECT_LOST':
    case 'PROJECT_CANCELLED':
      return 'LIFECYCLE';
  }
}

export function projectEventCountsAsEffectiveProgress(
  eventType: ProjectEventType,
): boolean {
  return [
    'EFFECTIVE_PROGRESS_RECORDED',
    'QUOTE_SENT',
    'SAMPLE_SENT',
    'CUSTOMER_CONFIRMED',
    'COMMERCIAL_CONFIRMED',
    'ORDER_CONFIRMED',
    'PROJECT_WON',
  ].includes(eventType);
}

export function projectEventCountsAsMeaningfulChange(
  eventType: ProjectEventType,
): boolean {
  if (projectEventCountsAsEffectiveProgress(eventType)) return true;
  return [
    'WAITING_STARTED',
    'WAITING_RESOLVED',
    'STAGE_CHANGED',
    'PROJECT_PAUSED',
    'PROJECT_REOPENED',
    'PROJECT_LOST',
    'PROJECT_CANCELLED',
  ].includes(eventType);
}

export function isValidExpectedAmountCurrency(
  expectedAmountMinor: number | null,
  currency: string | null,
): boolean {
  if (expectedAmountMinor === null && currency === null) return true;
  if (expectedAmountMinor === null || currency === null) return false;
  return Number.isInteger(expectedAmountMinor)
    && expectedAmountMinor >= 0
    && /^[A-Z]{3}$/.test(currency);
}

export function canMarkProjectWon(
  customerReference: Pick<CustomerReference, 'reference_kind'>,
): boolean {
  return customerReference.reference_kind === 'canonical';
}

export function isWorkItemOverdue(
  workItem: Pick<WorkItem, 'due_at' | 'status'>,
  nowIso: string,
): boolean {
  if (!workItem.due_at) return false;
  if (workItem.status === 'completed' || workItem.status === 'cancelled') return false;
  return new Date(workItem.due_at).getTime() < new Date(nowIso).getTime();
}

export const CUSTOMER_PROJECT_APP_ROLES = [
  'admin',
  'manager',
  'sales',
  'operator',
  'viewer',
] as const;

export type CustomerProjectAppRole = (typeof CUSTOMER_PROJECT_APP_ROLES)[number];

export const CUSTOMER_PROJECT_RESOURCE_RELATIONS = [
  'owner',
  'collaborator',
  'assignee',
  'creator',
  'subject',
  'unrelated',
  'none',
] as const;

export type CustomerProjectResourceRelation =
  (typeof CUSTOMER_PROJECT_RESOURCE_RELATIONS)[number];

export const CUSTOMER_PROJECT_DOMAIN_RESOURCES = [
  'customer_reference',
  'project',
  'project_event',
  'work_item',
  'ai_draft',
  'report',
  'settings',
] as const;

export type CustomerProjectDomainResource =
  (typeof CUSTOMER_PROJECT_DOMAIN_RESOURCES)[number];

export const CUSTOMER_PROJECT_DOMAIN_ACTIONS = [
  'read',
  'create',
  'update',
  'accept',
  'reject',
  'expire',
  'submit',
  'manage',
] as const;

export type CustomerProjectDomainAction =
  (typeof CUSTOMER_PROJECT_DOMAIN_ACTIONS)[number];

export const CUSTOMER_REFERENCE_MUTATION_INTENTS = [
  'create_provisional',
  'update_provisional_details',
  'map_to_canonical',
  'update_canonical',
] as const;

export type CustomerReferenceMutationIntent =
  (typeof CUSTOMER_REFERENCE_MUTATION_INTENTS)[number];

function hasRelation(
  relations: readonly CustomerProjectResourceRelation[],
  allowed: readonly CustomerProjectResourceRelation[],
): boolean {
  return relations.some(relation => allowed.includes(relation));
}

export function canAccessCustomerProjectDomain(input: {
  appRole: CustomerProjectAppRole;
  sameOrg: boolean;
  relations: readonly CustomerProjectResourceRelation[];
  resource: CustomerProjectDomainResource;
  action: CustomerProjectDomainAction;
  reportStatus?: DerivedReportStatus;
  customerReferenceKind?: CustomerReferenceKind;
}): boolean {
  const {
    appRole,
    sameOrg,
    relations,
    resource,
    action,
    reportStatus,
    customerReferenceKind,
  } = input;

  if (!sameOrg) return false;
  if (appRole === 'operator' || appRole === 'viewer') {
    return false;
  }
  if (appRole === 'sales' && relations.includes('unrelated')) return false;

  if (resource === 'settings') {
    if (appRole === 'admin') return action === 'read' || action === 'manage';
    if (appRole === 'manager') return action === 'read';
    return false;
  }

  if (resource === 'project_event') {
    if (action !== 'read' && action !== 'create') return false;
    return appRole === 'admin'
      || appRole === 'manager'
      || hasRelation(relations, ['owner', 'collaborator', 'assignee', 'creator']);
  }

  if (resource === 'report') {
    const isReportSubject = relations.includes('subject');
    const isManager = appRole === 'admin' || appRole === 'manager';

    if (action === 'read' || action === 'create') {
      return isManager || isReportSubject;
    }
    if (action === 'update' || action === 'submit') {
      return reportStatus === 'draft' && (isManager || isReportSubject);
    }
    return false;
  }

  if (resource === 'ai_draft') {
    if (action === 'read' || action === 'create') {
      return appRole === 'admin'
        || appRole === 'manager'
        || hasRelation(relations, ['owner', 'collaborator', 'creator']);
    }
    if (action === 'accept' || action === 'reject') {
      return appRole === 'admin'
        || appRole === 'manager'
        || hasRelation(relations, ['owner', 'creator']);
    }
    if (action === 'expire') return appRole === 'admin' || appRole === 'manager';
    return false;
  }

  if (resource === 'work_item') {
    if (action === 'read') {
      return appRole === 'admin'
        || appRole === 'manager'
        || hasRelation(relations, ['owner', 'collaborator', 'assignee', 'creator']);
    }
    if (action === 'create') {
      return appRole === 'admin'
        || appRole === 'manager'
        || hasRelation(relations, ['owner', 'collaborator', 'creator']);
    }
    if (action === 'update') {
      return appRole === 'admin'
        || appRole === 'manager'
        || hasRelation(relations, ['owner', 'collaborator', 'assignee']);
    }
    return false;
  }

  if (resource === 'project') {
    if (action === 'create') {
      return appRole === 'admin'
        || appRole === 'manager'
        || (appRole === 'sales' && relations.includes('none'));
    }
    if (action === 'read') {
      return appRole === 'admin'
        || appRole === 'manager'
        || hasRelation(relations, ['owner', 'collaborator', 'assignee', 'creator']);
    }
    if (action === 'update') {
      return appRole === 'admin'
        || appRole === 'manager'
        || hasRelation(relations, ['owner']);
    }
    return false;
  }

  if (resource === 'customer_reference') {
    if (action === 'read') {
      return appRole === 'admin'
        || appRole === 'manager'
        || hasRelation(relations, ['owner', 'collaborator', 'assignee', 'creator']);
    }
    if (action === 'create' || action === 'update') {
      if (
        appRole === 'sales'
        && action === 'create'
        && customerReferenceKind === 'provisional'
      ) return relations.includes('none');
      return appRole === 'admin' || appRole === 'manager';
    }
    return false;
  }

  return false;
}

export function canMutateCustomerReference(input: {
  appRole: CustomerProjectAppRole;
  sameOrg: boolean;
  relations: readonly CustomerProjectResourceRelation[];
  intent: CustomerReferenceMutationIntent;
}): boolean {
  const { appRole, sameOrg, relations, intent } = input;

  if (!sameOrg) return false;
  if (appRole === 'operator' || appRole === 'viewer') return false;
  if (appRole === 'admin' || appRole === 'manager') return true;
  if (appRole !== 'sales' || relations.includes('unrelated')) return false;

  if (intent === 'create_provisional') return relations.includes('none');
  if (intent === 'update_provisional_details') {
    return hasRelation(relations, ['creator']);
  }
  return false;
}
