import type {
  ProjectLifecycleStatus,
  ProjectPriority,
  ProjectType,
  RiskLevel,
  WaitingOn,
  WorkItemPriority,
  WorkItemStatus,
  WorkItemType,
} from './domain';

export interface ListProjectRow {
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
  owner_profile_id: string;
  version: number;
  updated_at: string;
}

export interface ListWorkItemRow {
  id: string;
  customer_reference_id: string | null;
  project_id: string | null;
  work_item_type: WorkItemType;
  title: string;
  due_at: string | null;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  blocked_reason: string | null;
  version: number;
  updated_at: string;
}

export interface ListCustomerRow {
  id: string;
  display_name_snapshot: string;
}

export interface ProjectListItem {
  id: string;
  customerReferenceId: string;
  customerDisplayName: string | null;
  title: string;
  projectType: ProjectType;
  status: ProjectLifecycleStatus;
  stage: string;
  waitingOn: WaitingOn;
  nextCheckAt: string | null;
  riskLevel: RiskLevel | null;
  priority: ProjectPriority;
  ownerProfileId: string;
  version: number;
  updatedAt: string;
  nextAction: {
    id: string;
    title: string;
    dueAt: string | null;
    status: WorkItemStatus;
    priority: WorkItemPriority;
    blockedReason: string | null;
    version: number;
  } | null;
  needsAction: boolean;
  blocked: boolean;
}

export interface TaskListItem {
  id: string;
  workItemType: WorkItemType;
  title: string;
  dueAt: string | null;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  blockedReason: string | null;
  version: number;
  updatedAt: string;
  customerReferenceId: string | null;
  customerDisplayName: string | null;
  project: {
    id: string;
    title: string;
    status: ProjectLifecycleStatus;
    waitingOn: WaitingOn;
    priority: ProjectPriority;
  } | null;
}

function customerName(
  id: string | null,
  names: Map<string, string>,
): string | null {
  return id ? names.get(id) ?? null : null;
}

export function buildProjectList(input: {
  projects: ListProjectRow[];
  workItems: ListWorkItemRow[];
  customers: ListCustomerRow[];
}): ProjectListItem[] {
  const names = new Map(input.customers.map(row => [row.id, row.display_name_snapshot]));

  const workByProject = new Map<string, ListWorkItemRow[]>();
  for (const item of input.workItems) {
    if (!item.project_id) continue;
    const list = workByProject.get(item.project_id) ?? [];
    list.push(item);
    workByProject.set(item.project_id, list);
  }

  return input.projects.map(project => {
    const projectWork = workByProject.get(project.id) ?? [];
    const open = projectWork.filter(item =>
      item.status === 'pending'
      || item.status === 'in_progress'
      || item.status === 'blocked',
    );
    const nextAction = open.find(item => item.work_item_type === 'NEXT_ACTION') ?? null;
    const blocked = open.some(item => item.status === 'blocked');
    const hasWaiting = project.waiting_on !== 'none' && !!project.next_check_at;

    return {
      id: project.id,
      customerReferenceId: project.customer_reference_id,
      customerDisplayName: customerName(project.customer_reference_id, names),
      title: project.title,
      projectType: project.project_type,
      status: project.status,
      stage: project.stage,
      waitingOn: project.waiting_on,
      nextCheckAt: project.next_check_at,
      riskLevel: project.risk_level,
      priority: project.priority,
      ownerProfileId: project.owner_profile_id,
      version: project.version,
      updatedAt: project.updated_at,
      nextAction: nextAction ? {
        id: nextAction.id,
        title: nextAction.title,
        dueAt: nextAction.due_at,
        status: nextAction.status,
        priority: nextAction.priority,
        blockedReason: nextAction.blocked_reason,
        version: nextAction.version,
      } : null,
      needsAction: project.status === 'active' && !hasWaiting && !nextAction,
      blocked,
    };
  });
}

export function buildTaskList(input: {
  workItems: ListWorkItemRow[];
  projects: ListProjectRow[];
  customers: ListCustomerRow[];
}): TaskListItem[] {
  const names = new Map(input.customers.map(row => [row.id, row.display_name_snapshot]));
  const projects = new Map(input.projects.map(row => [row.id, row]));

  return input.workItems.map(item => {
    const project = item.project_id ? projects.get(item.project_id) ?? null : null;
    const customerReferenceId = item.customer_reference_id
      ?? project?.customer_reference_id
      ?? null;

    return {
      id: item.id,
      workItemType: item.work_item_type,
      title: item.title,
      dueAt: item.due_at,
      status: item.status,
      priority: item.priority,
      blockedReason: item.blocked_reason,
      version: item.version,
      updatedAt: item.updated_at,
      customerReferenceId,
      customerDisplayName: customerName(customerReferenceId, names),
      project: project ? {
        id: project.id,
        title: project.title,
        status: project.status,
        waitingOn: project.waiting_on,
        priority: project.priority,
      } : null,
    };
  });
}
