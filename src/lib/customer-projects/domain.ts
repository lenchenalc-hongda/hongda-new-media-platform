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
  'draft',
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
  draft: ['active', 'cancelled'],
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

export const CUSTOMER_REFERENCE_STATUSES = [
  'active',
  'inactive',
  'pending_review',
] as const;

export type CustomerReferenceStatus = (typeof CUSTOMER_REFERENCE_STATUSES)[number];

export interface CustomerReference {
  id: string;
  org_id: string;
  external_source: string;
  external_customer_id: string;
  display_name_snapshot: string;
  external_owner_reference: string | null;
  source_synced_at: string;
  status: CustomerReferenceStatus;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  org_id: string;
  customer_reference_id: string;
  title: string;
  project_type: ProjectType;
  owner_profile_id: string;
  status: ProjectLifecycleStatus;
  stage: string | null;
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
  'STAGE_CHANGED',
  'PROJECT_PAUSED',
  'PROJECT_REOPENED',
  'PROJECT_WON',
  'PROJECT_LOST',
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
  actor_profile_id: string;
  source: ProjectEventSource;
  source_reference_id: string | null;
  raw_input: string | null;
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
  pending: ['in_progress', 'cancelled'],
  in_progress: ['blocked', 'completed', 'cancelled'],
  blocked: ['in_progress', 'cancelled'],
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
  'superseded',
] as const;

export type DerivedReportStatus = (typeof DERIVED_REPORT_STATUSES)[number];

export interface DerivedReportSnapshot {
  id: string;
  org_id: string;
  period: DerivedReportPeriod;
  period_start: string;
  period_end: string;
  timezone: string;
  status: DerivedReportStatus;
  deterministic_metrics: Record<string, MetricValue<number>>;
  ai_narrative: string | null;
  source_event_watermark: string | null;
  source_work_item_watermark: string | null;
  version: number;
  supersedes_report_id: string | null;
  submitted_by_profile_id: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export const BUSINESS_PROFILE_FK_FIELDS = [
  'owner_profile_id',
  'created_by_profile_id',
  'assignee_profile_id',
  'completed_by_profile_id',
  'cancelled_by_profile_id',
  'actor_profile_id',
  'added_by_profile_id',
  'accepted_by_profile_id',
  'rejected_by_profile_id',
  'submitted_by_profile_id',
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

export function buildCustomerReferenceIdentityKey(input: {
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
      return 'COMMERCIAL';
    case 'STAGE_CHANGED':
    case 'PROJECT_PAUSED':
    case 'PROJECT_REOPENED':
    case 'PROJECT_WON':
    case 'PROJECT_LOST':
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
    'STAGE_CHANGED',
    'PROJECT_WON',
    'PROJECT_LOST',
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

export function isWorkItemOverdue(
  workItem: Pick<WorkItem, 'due_at' | 'status'>,
  nowIso: string,
): boolean {
  if (!workItem.due_at) return false;
  if (workItem.status !== 'pending' && workItem.status !== 'in_progress') return false;
  return new Date(workItem.due_at).getTime() < new Date(nowIso).getTime();
}

export const CUSTOMER_PROJECT_DOMAIN_ROLES = [
  'admin',
  'manager',
  'sales_owner',
  'sales_collaborator',
  'unrelated_sales',
  'operator',
  'viewer',
] as const;

export type CustomerProjectDomainRole = (typeof CUSTOMER_PROJECT_DOMAIN_ROLES)[number];

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
  'delete',
  'accept',
  'submit',
  'manage',
] as const;

export type CustomerProjectDomainAction =
  (typeof CUSTOMER_PROJECT_DOMAIN_ACTIONS)[number];

export function canAccessCustomerProjectDomain(input: {
  role: CustomerProjectDomainRole;
  resource: CustomerProjectDomainResource;
  action: CustomerProjectDomainAction;
}): boolean {
  const { role, resource, action } = input;

  if (role === 'operator' || role === 'viewer' || role === 'unrelated_sales') {
    return false;
  }

  if (role === 'admin') return true;

  if (role === 'manager') {
    if (resource === 'settings') return action === 'read';
    if (resource === 'customer_reference' || resource === 'project') {
      return action === 'read' || action === 'create' || action === 'update';
    }
    if (resource === 'project_event') return action === 'read' || action === 'create';
    if (resource === 'work_item') {
      return action === 'read' || action === 'create' || action === 'update';
    }
    if (resource === 'ai_draft') {
      return action === 'read' || action === 'create' || action === 'accept';
    }
    if (resource === 'report') {
      return action === 'read' || action === 'create' || action === 'update' || action === 'submit';
    }
    return false;
  }

  if (role === 'sales_owner') {
    if (resource === 'settings') return false;
    if (action === 'delete' || action === 'manage') return false;
    if (resource === 'customer_reference') return action === 'read';
    if (resource === 'project') return action === 'read' || action === 'update';
    if (resource === 'project_event') return action === 'read' || action === 'create';
    if (resource === 'work_item') {
      return action === 'read' || action === 'create' || action === 'update';
    }
    if (resource === 'ai_draft') {
      return action === 'read' || action === 'create' || action === 'accept';
    }
    if (resource === 'report') {
      return action === 'read' || action === 'create' || action === 'update' || action === 'submit';
    }
    return false;
  }

  if (role === 'sales_collaborator') {
    if (resource === 'settings' || resource === 'customer_reference' || resource === 'project') {
      return action === 'read' && resource !== 'settings';
    }
    if (resource === 'project_event') return action === 'read' || action === 'create';
    if (resource === 'work_item') {
      return action === 'read' || action === 'create' || action === 'update';
    }
    return action === 'read' && resource === 'report';
  }

  return false;
}
