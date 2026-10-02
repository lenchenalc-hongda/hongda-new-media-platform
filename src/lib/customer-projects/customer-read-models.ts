import type {
  ProjectLifecycleStatus,
  ProjectPriority,
  ProjectType,
  RiskLevel,
  WaitingOn,
  WorkItemPriority,
  WorkItemStatus,
} from './domain';
import { getShanghaiBusinessWindow } from './read-models';

export interface CustomerReferenceRow {
  id: string;
  reference_kind: 'canonical' | 'provisional';
  display_name_snapshot: string;
  status: string;
  external_source: string | null;
  external_customer_id: string | null;
  external_owner_reference: string | null;
  provisional_source_reference: string | null;
  updated_at: string;
}

export interface CustomerProjectRow {
  id: string;
  customer_reference_id: string;
  title: string;
  project_type: ProjectType;
  status: ProjectLifecycleStatus;
  stage: string;
  waiting_on: WaitingOn;
  next_check_at: string | null;
  risk_level: RiskLevel | null;
  priority: ProjectPriority;
  updated_at: string;
}

export interface CustomerFollowUpRow {
  id: string;
  customer_reference_id: string | null;
  project_id: string | null;
  work_item_type: 'FOLLOW_UP';
  title: string;
  assignee_profile_id: string;
  due_at: string | null;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  blocked_reason: string | null;
  version: number;
  updated_at: string;
}

export interface CustomerEventRow {
  id: string;
  customer_reference_id: string | null;
  project_id: string | null;
  event_type: string;
  occurred_at: string;
  raw_input: string | null;
}

export interface CustomerListItem {
  id: string;
  referenceKind: 'canonical' | 'provisional';
  displayName: string;
  status: string;
  sourceLabel: string | null;
  externalOwnerReference: string | null;
  activeProjectCount: number;
  hasActiveProject: boolean;
  nextFollowUp: {
    id: string;
    title: string;
    dueAt: string | null;
    status: WorkItemStatus;
    priority: WorkItemPriority;
    blockedReason: string | null;
    version: number;
    isAssignedToMe: boolean;
    dueByBusinessEnd: boolean;
  } | null;
  lastInteraction: {
    id: string;
    eventType: string;
    occurredAt: string;
    summary: string | null;
  } | null;
  updatedAt: string;
}

function toMs(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function isOpen(status: WorkItemStatus): boolean {
  return status === 'pending' || status === 'in_progress' || status === 'blocked';
}

export function buildCustomerList(input: {
  now: Date;
  actorProfileId: string;
  customers: CustomerReferenceRow[];
  projects: CustomerProjectRow[];
  followUps: CustomerFollowUpRow[];
  events: CustomerEventRow[];
}): CustomerListItem[] {
  const { endMs } = getShanghaiBusinessWindow(input.now);

  const projectsByCustomer = new Map<string, CustomerProjectRow[]>();
  for (const project of input.projects) {
    const list = projectsByCustomer.get(project.customer_reference_id) ?? [];
    list.push(project);
    projectsByCustomer.set(project.customer_reference_id, list);
  }

  const followUpsByCustomer = new Map<string, CustomerFollowUpRow[]>();
  for (const followUp of input.followUps) {
    if (!followUp.customer_reference_id || followUp.project_id !== null) continue;
    if (followUp.work_item_type !== 'FOLLOW_UP' || !isOpen(followUp.status)) continue;
    const list = followUpsByCustomer.get(followUp.customer_reference_id) ?? [];
    list.push(followUp);
    followUpsByCustomer.set(followUp.customer_reference_id, list);
  }

  const latestEventByCustomer = new Map<string, CustomerEventRow>();
  for (const event of input.events) {
    if (!event.customer_reference_id || event.project_id !== null) continue;
    const existing = latestEventByCustomer.get(event.customer_reference_id);
    if (!existing || toMs(event.occurred_at) > toMs(existing.occurred_at)) {
      latestEventByCustomer.set(event.customer_reference_id, event);
    }
  }

  return input.customers.map(customer => {
    const projects = projectsByCustomer.get(customer.id) ?? [];
    const activeProjectCount = projects.filter(project => project.status === 'active').length;

    const openFollowUps = [...(followUpsByCustomer.get(customer.id) ?? [])]
      .sort((a, b) => {
        const assignmentDiff =
          Number(b.assignee_profile_id === input.actorProfileId)
          - Number(a.assignee_profile_id === input.actorProfileId);
        if (assignmentDiff !== 0) return assignmentDiff;
        const dueDiff = toMs(a.due_at) - toMs(b.due_at);
        if (dueDiff !== 0) return dueDiff;
        return a.id.localeCompare(b.id);
      });

    const next = openFollowUps[0] ?? null;
    const latestEvent = latestEventByCustomer.get(customer.id) ?? null;

    return {
      id: customer.id,
      referenceKind: customer.reference_kind,
      displayName: customer.display_name_snapshot,
      status: customer.status,
      sourceLabel: customer.reference_kind === 'canonical'
        ? customer.external_source
        : customer.provisional_source_reference,
      externalOwnerReference: customer.reference_kind === 'canonical'
        ? customer.external_owner_reference
        : null,
      activeProjectCount,
      hasActiveProject: activeProjectCount > 0,
      nextFollowUp: next ? {
        id: next.id,
        title: next.title,
        dueAt: next.due_at,
        status: next.status,
        priority: next.priority,
        blockedReason: next.blocked_reason,
        version: next.version,
        isAssignedToMe: next.assignee_profile_id === input.actorProfileId,
        dueByBusinessEnd:
          next.due_at !== null
          && toMs(next.due_at) < endMs,
      } : null,
      lastInteraction: latestEvent ? {
        id: latestEvent.id,
        eventType: latestEvent.event_type,
        occurredAt: latestEvent.occurred_at,
        summary: latestEvent.raw_input,
      } : null,
      updatedAt: customer.updated_at,
    };
  });
}
