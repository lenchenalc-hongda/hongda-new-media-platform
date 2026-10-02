import type {
  ProjectLifecycleStatus,
  ProjectPriority,
  ProjectType,
  WaitingOn,
  WorkItemPriority,
  WorkItemStatus,
  WorkItemType,
} from './domain';

export type WorkbenchPriorityClass = 'P0' | 'P1' | 'P2' | 'P3';

export interface WorkbenchProjectRow {
  id: string;
  customer_reference_id: string;
  title: string;
  project_type: ProjectType;
  status: ProjectLifecycleStatus;
  stage: string;
  waiting_on: WaitingOn;
  next_check_at: string | null;
  risk_level: 'low' | 'medium' | 'high' | null;
  priority: ProjectPriority;
  owner_profile_id: string;
  version: number;
  updated_at: string;
}

export interface WorkbenchWorkItemRow {
  id: string;
  customer_reference_id: string | null;
  project_id: string | null;
  work_item_type: WorkItemType;
  title: string;
  assignee_profile_id: string;
  due_at: string | null;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  blocked_reason: string | null;
  version: number;
  updated_at: string;
}

export interface WorkbenchCustomerRow {
  id: string;
  display_name_snapshot: string;
}

export interface WorkbenchQueueItem {
  id: string;
  source: 'work_item' | 'waiting_check' | 'project_exception';
  priorityClass: WorkbenchPriorityClass;
  title: string;
  customerReferenceId: string | null;
  customerDisplayName: string | null;
  projectId: string | null;
  dueAt: string | null;
  workItemType: WorkItemType | null;
  workItemStatus: WorkItemStatus | null;
  projectStage: string | null;
  projectPriority: ProjectPriority | null;
  reason:
    | 'customer_commitment_due'
    | 'management_decision_due'
    | 'critical_blocker'
    | 'next_action_due'
    | 'waiting_check_due'
    | 'missing_next_step'
    | 'relationship_follow_up_due';
}

export interface WorkbenchAttentionItem {
  id: string;
  source: 'work_item' | 'project';
  title: string;
  projectId: string | null;
  customerReferenceId: string | null;
  customerDisplayName: string | null;
  reason: 'blocked_work' | 'missing_next_step' | 'high_risk_project';
  dueAt: string | null;
}

export interface WorkbenchWaitingItem {
  projectId: string;
  title: string;
  customerReferenceId: string;
  customerDisplayName: string | null;
  waitingOn: Exclude<WaitingOn, 'none'>;
  nextCheckAt: string;
  due: boolean;
}

export interface WorkbenchSnapshot {
  businessDate: string;
  generatedAt: string;
  queue: WorkbenchQueueItem[];
  attention: WorkbenchAttentionItem[];
  waiting: WorkbenchWaitingItem[];
  summary: {
    queueCount: number;
    p0Count: number;
    overdueCount: number;
    blockedCount: number;
    waitingCount: number;
    missingNextStepCount: number;
  };
}

const PRIORITY_WEIGHT: Record<ProjectPriority | WorkItemPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const CLASS_WEIGHT: Record<WorkbenchPriorityClass, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

function toMs(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function getShanghaiDateParts(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = new Map(parts.map(part => [part.type, part.value]));
  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
  };
}

export function getShanghaiBusinessWindow(now: Date): {
  businessDate: string;
  startMs: number;
  endMs: number;
} {
  const { year, month, day } = getShanghaiDateParts(now);
  const startMs = Date.UTC(year, month - 1, day, -8, 0, 0, 0);
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return {
    businessDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    startMs,
    endMs,
  };
}

function isOpenWorkItem(item: WorkbenchWorkItemRow): boolean {
  return item.status === 'pending'
    || item.status === 'in_progress'
    || item.status === 'blocked';
}

function isDueByEndOfBusinessDay(dueAt: string | null, endMs: number): boolean {
  const ms = toMs(dueAt);
  return Number.isFinite(ms) && ms < endMs;
}

function isOverdue(dueAt: string | null, nowMs: number): boolean {
  const ms = toMs(dueAt);
  return Number.isFinite(ms) && ms < nowMs;
}

function customerName(
  customerReferenceId: string | null,
  names: Map<string, string>,
): string | null {
  return customerReferenceId ? names.get(customerReferenceId) ?? null : null;
}

export function buildWorkbenchSnapshot(input: {
  now: Date;
  projects: WorkbenchProjectRow[];
  workItems: WorkbenchWorkItemRow[];
  customers: WorkbenchCustomerRow[];
}): WorkbenchSnapshot {
  const { now, projects, workItems, customers } = input;
  const nowMs = now.getTime();
  const { businessDate, endMs } = getShanghaiBusinessWindow(now);
  const customerNames = new Map(customers.map(row => [row.id, row.display_name_snapshot]));
  const projectById = new Map(projects.map(project => [project.id, project]));

  const queue: WorkbenchQueueItem[] = [];
  const attention: WorkbenchAttentionItem[] = [];
  const waiting: WorkbenchWaitingItem[] = [];

  const openNextActionByProject = new Set(
    workItems
      .filter(item =>
        item.project_id
        && item.work_item_type === 'NEXT_ACTION'
        && isOpenWorkItem(item),
      )
      .map(item => item.project_id as string),
  );

  for (const item of workItems) {
    if (!isOpenWorkItem(item)) continue;
    const project = item.project_id ? projectById.get(item.project_id) ?? null : null;
    const customerReferenceId = item.customer_reference_id
      ?? project?.customer_reference_id
      ?? null;
    const displayName = customerName(customerReferenceId, customerNames);
    const due = isDueByEndOfBusinessDay(item.due_at, endMs);

    if (
      item.work_item_type === 'CUSTOMER_COMMITMENT'
      && due
    ) {
      queue.push({
        id: item.id,
        source: 'work_item',
        priorityClass: 'P0',
        title: item.title,
        customerReferenceId,
        customerDisplayName: displayName,
        projectId: item.project_id,
        dueAt: item.due_at,
        workItemType: item.work_item_type,
        workItemStatus: item.status,
        projectStage: project?.stage ?? null,
        projectPriority: project?.priority ?? null,
        reason: 'customer_commitment_due',
      });
    } else if (
      item.work_item_type === 'MANAGEMENT_DECISION'
      && due
      && item.priority === 'critical'
    ) {
      queue.push({
        id: item.id,
        source: 'work_item',
        priorityClass: 'P0',
        title: item.title,
        customerReferenceId,
        customerDisplayName: displayName,
        projectId: item.project_id,
        dueAt: item.due_at,
        workItemType: item.work_item_type,
        workItemStatus: item.status,
        projectStage: project?.stage ?? null,
        projectPriority: project?.priority ?? null,
        reason: 'management_decision_due',
      });
    } else if (
      item.work_item_type === 'MANAGEMENT_DECISION'
      && due
    ) {
      queue.push({
        id: item.id,
        source: 'work_item',
        priorityClass: 'P1',
        title: item.title,
        customerReferenceId,
        customerDisplayName: displayName,
        projectId: item.project_id,
        dueAt: item.due_at,
        workItemType: item.work_item_type,
        workItemStatus: item.status,
        projectStage: project?.stage ?? null,
        projectPriority: project?.priority ?? null,
        reason: 'management_decision_due',
      });
    } else if (item.status === 'blocked' && item.priority === 'critical') {
      queue.push({
        id: item.id,
        source: 'work_item',
        priorityClass: 'P0',
        title: item.title,
        customerReferenceId,
        customerDisplayName: displayName,
        projectId: item.project_id,
        dueAt: item.due_at,
        workItemType: item.work_item_type,
        workItemStatus: item.status,
        projectStage: project?.stage ?? null,
        projectPriority: project?.priority ?? null,
        reason: 'critical_blocker',
      });
    } else if (item.work_item_type === 'NEXT_ACTION' && due) {
      queue.push({
        id: item.id,
        source: 'work_item',
        priorityClass: 'P1',
        title: item.title,
        customerReferenceId,
        customerDisplayName: displayName,
        projectId: item.project_id,
        dueAt: item.due_at,
        workItemType: item.work_item_type,
        workItemStatus: item.status,
        projectStage: project?.stage ?? null,
        projectPriority: project?.priority ?? null,
        reason: 'next_action_due',
      });
    } else if (
      item.work_item_type === 'FOLLOW_UP'
      && item.project_id === null
      && due
    ) {
      queue.push({
        id: item.id,
        source: 'work_item',
        priorityClass: 'P3',
        title: item.title,
        customerReferenceId,
        customerDisplayName: displayName,
        projectId: null,
        dueAt: item.due_at,
        workItemType: item.work_item_type,
        workItemStatus: item.status,
        projectStage: null,
        projectPriority: null,
        reason: 'relationship_follow_up_due',
      });
    }

    if (item.status === 'blocked') {
      attention.push({
        id: item.id,
        source: 'work_item',
        title: item.title,
        projectId: item.project_id,
        customerReferenceId,
        customerDisplayName: displayName,
        reason: 'blocked_work',
        dueAt: item.due_at,
      });
    }
  }

  for (const project of projects) {
    if (project.status !== 'active') continue;

    if (project.waiting_on !== 'none' && project.next_check_at) {
      const due = isDueByEndOfBusinessDay(project.next_check_at, endMs);
      waiting.push({
        projectId: project.id,
        title: project.title,
        customerReferenceId: project.customer_reference_id,
        customerDisplayName: customerName(project.customer_reference_id, customerNames),
        waitingOn: project.waiting_on,
        nextCheckAt: project.next_check_at,
        due,
      });

      if (due) {
        queue.push({
          id: `waiting:${project.id}`,
          source: 'waiting_check',
          priorityClass: 'P1',
          title: project.title,
          customerReferenceId: project.customer_reference_id,
          customerDisplayName: customerName(project.customer_reference_id, customerNames),
          projectId: project.id,
          dueAt: project.next_check_at,
          workItemType: null,
          workItemStatus: null,
          projectStage: project.stage,
          projectPriority: project.priority,
          reason: 'waiting_check_due',
        });
      }
    }

    const hasValidWaiting = project.waiting_on !== 'none' && !!project.next_check_at;
    const hasOpenNextAction = openNextActionByProject.has(project.id);
    if (!hasValidWaiting && !hasOpenNextAction) {
      const item: WorkbenchQueueItem = {
        id: `missing-next:${project.id}`,
        source: 'project_exception',
        priorityClass: 'P2',
        title: project.title,
        customerReferenceId: project.customer_reference_id,
        customerDisplayName: customerName(project.customer_reference_id, customerNames),
        projectId: project.id,
        dueAt: null,
        workItemType: null,
        workItemStatus: null,
        projectStage: project.stage,
        projectPriority: project.priority,
        reason: 'missing_next_step',
      };
      queue.push(item);
      attention.push({
        id: project.id,
        source: 'project',
        title: project.title,
        projectId: project.id,
        customerReferenceId: project.customer_reference_id,
        customerDisplayName: customerName(project.customer_reference_id, customerNames),
        reason: 'missing_next_step',
        dueAt: null,
      });
    }

    if (project.risk_level === 'high') {
      attention.push({
        id: `risk:${project.id}`,
        source: 'project',
        title: project.title,
        projectId: project.id,
        customerReferenceId: project.customer_reference_id,
        customerDisplayName: customerName(project.customer_reference_id, customerNames),
        reason: 'high_risk_project',
        dueAt: project.next_check_at,
      });
    }
  }

  queue.sort((a, b) => {
    const classDiff = CLASS_WEIGHT[a.priorityClass] - CLASS_WEIGHT[b.priorityClass];
    if (classDiff !== 0) return classDiff;
    const dueDiff = toMs(a.dueAt) - toMs(b.dueAt);
    if (dueDiff !== 0) return dueDiff;
    const aPriority = a.projectPriority ? PRIORITY_WEIGHT[a.projectPriority] : 9;
    const bPriority = b.projectPriority ? PRIORITY_WEIGHT[b.projectPriority] : 9;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.id.localeCompare(b.id);
  });

  waiting.sort((a, b) => toMs(a.nextCheckAt) - toMs(b.nextCheckAt));
  attention.sort((a, b) => toMs(a.dueAt) - toMs(b.dueAt) || a.id.localeCompare(b.id));

  return {
    businessDate,
    generatedAt: now.toISOString(),
    queue,
    attention,
    waiting,
    summary: {
      queueCount: queue.length,
      p0Count: queue.filter(item => item.priorityClass === 'P0').length,
      overdueCount: queue.filter(item => isOverdue(item.dueAt, nowMs)).length,
      blockedCount: workItems.filter(item => item.status === 'blocked').length,
      waitingCount: waiting.length,
      missingNextStepCount: queue.filter(item => item.reason === 'missing_next_step').length,
    },
  };
}
