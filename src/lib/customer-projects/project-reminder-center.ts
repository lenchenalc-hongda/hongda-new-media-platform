import { getShanghaiBusinessWindow } from './read-models';
import { projectEventCountsAsEffectiveProgress, type ProjectEventType } from './domain';

// Read-only recommendations until owner approves delivery channels and cadence.
// No new WorkItems, status mutations, employee scores, or notification sends.
export const PROJECT_REMINDER_POLICY_V1 = {
  dueSoonHours: 48,
  staleProjectDays: 7,
  focusProjectDays: 14,
  noNewProjectDays: 14,
  focusNewProjectDays: 30,
} as const;

export const PROJECT_PROGRESS_EVENT_TYPES = [
  'EFFECTIVE_PROGRESS_RECORDED',
  'QUOTE_SENT',
  'SAMPLE_SENT',
  'CUSTOMER_CONFIRMED',
  'COMMERCIAL_CONFIRMED',
  'ORDER_CONFIRMED',
  'PROJECT_WON',
] as const;
type Category = 'formal_due' | 'project_attention' | 'development_gap';
type Severity = 'urgent' | 'attention' | 'upcoming';

export interface ReminderProjectRow {
  id: string;
  title: string;
  owner_profile_id: string;
  status: string;
  waiting_on: string;
  next_check_at: string | null;
  created_at: string;
}
export interface ReminderWorkItemRow {
  id: string;
  project_id: string | null;
  title: string;
  work_item_type: string;
  status: string;
  due_at: string | null;
}
export interface ReminderEventRow {
  project_id: string | null;
  event_type: string;
  occurred_at: string;
}
export interface ReminderProfileRow {
  id: string;
  full_name: string | null;
  created_at: string;
  role: string;
  is_active: boolean;
}
export interface ProjectReminderItem {
  id: string;
  category: Category;
  kind: 'work_due' | 'waiting_check' | 'stale_project' | 'missing_next_step' | 'missing_check_time' | 'new_project_gap';
  severity: Severity;
  title: string;
  detail: string;
  ownerName: string;
  ownerKey: string;
  projectId: string | null;
  effectiveAt: string | null;
  days: number | null;
}
export interface ProjectReminderSnapshot {
  generatedAt: string;
  readOnly: true;
  deliveryEnabled: false;
  policy: typeof PROJECT_REMINDER_POLICY_V1;
  items: ProjectReminderItem[];
  summary: {
    formalDue: number;
    formalOverdue: number;
    upcomingFormal: number;
    projectAttention: number;
    developmentGaps: number;
    total: number;
  };
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const OPEN_STATUSES = new Set(['pending', 'in_progress', 'blocked']);
const FORMAL_WORK_TYPES = new Set([
  'NEXT_ACTION', 'CUSTOMER_COMMITMENT', 'INTERNAL_COLLABORATION', 'MANAGEMENT_DECISION',
]);
const PROGRESS_TYPES = new Set<string>(PROJECT_PROGRESS_EVENT_TYPES);
const SEVERITY_ORDER: Record<Severity, number> = {
  urgent: 0, attention: 1, upcoming: 2,
};

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}
function daysSince(nowMs: number, lastMs: number): number {
  return Math.max(0, Math.floor((nowMs - lastMs) / DAY_MS));
}
function dueSeverity(dueMs: number, shanghaiStartMs: number, shanghaiEndMs: number): Severity {
  if (dueMs < shanghaiStartMs) return 'urgent';
  if (dueMs < shanghaiEndMs) return 'attention';
  return 'upcoming';
}
function dueLabel(dueMs: number, shanghaiStartMs: number, shanghaiEndMs: number): string {
  if (dueMs < shanghaiStartMs) return '已逾期';
  if (dueMs < shanghaiEndMs) return '今天到期';
  return '48小时内到期';
}

/**
 * All inputs MUST already be restricted by the signed-in CPC user's RLS.
 * There is no database access or outbound delivery from this projection.
 */
export function buildProjectReminderSnapshot(input: {
  now: Date;
  projects: ReminderProjectRow[];
  workItems: ReminderWorkItemRow[];
  events: ReminderEventRow[];
  profiles: ReminderProfileRow[];
}): ProjectReminderSnapshot {
  const nowMs = input.now.getTime();
  const { startMs, endMs } = getShanghaiBusinessWindow(input.now);
  const visible = input.projects.filter(project => project.status === 'active');
  const projectById = new Map(visible.map(project => [project.id, project]));
  const profileById = new Map(input.profiles.map(person => [person.id, person]));
  const allOwnerIds = Array.from(new Set([
    ...input.projects.map(project => project.owner_profile_id),
    ...input.profiles.filter(p => p.role === 'sales' && p.is_active).map(p => p.id),
  ])).sort();
  // Opaque per-response keys; never send employee profile UUIDs to the browser.
  const ownerKeyById = new Map(allOwnerIds.map((id, index) => [id, 'person-' + (index + 1)]));
  const personName = (id: string): string =>
    profileById.get(id)?.full_name?.trim() || '姓名待确认';
  const keyOf = (id: string): string => ownerKeyById.get(id) || 'unknown';
  const items: ProjectReminderItem[] = [];
  const seen = new Set<string>();
  function add(item: ProjectReminderItem): void {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  }

  const lastProgressByProject = new Map<string, number>();
  for (const event of input.events) {
    if (!event.project_id || !projectById.has(event.project_id)) continue;
    if (!PROGRESS_TYPES.has(event.event_type)) continue;
    if (!projectEventCountsAsEffectiveProgress(event.event_type as ProjectEventType)) continue;
    const ms = timestamp(event.occurred_at);
    if (ms === null || ms > nowMs) continue;
    const prior = lastProgressByProject.get(event.project_id) ?? 0;
    if (ms > prior) lastProgressByProject.set(event.project_id, ms);
  }

  const openNextStep = new Set<string>();
  for (const work of input.workItems) {
    if (!work.project_id || !projectById.has(work.project_id)) continue;
    if (!OPEN_STATUSES.has(work.status)) continue;
    if (work.work_item_type === 'NEXT_ACTION') openNextStep.add(work.project_id);
    if (!FORMAL_WORK_TYPES.has(work.work_item_type)) continue;
    const dueMs = timestamp(work.due_at);
    if (dueMs === null || dueMs > nowMs + PROJECT_REMINDER_POLICY_V1.dueSoonHours * HOUR_MS) continue;
    const project = projectById.get(work.project_id);
    if (!project) continue;
    add({
      id: 'work:' + work.id + ':' + work.due_at,
      kind: 'work_due', category: 'formal_due',
      severity: dueSeverity(dueMs, startMs, endMs),
      title: work.title,
      detail: (work.work_item_type === 'CUSTOMER_COMMITMENT' ? '客户承诺 · ' : '正式任务 · ')
        + dueLabel(dueMs, startMs, endMs),
      ownerName: personName(project.owner_profile_id),
      ownerKey: keyOf(project.owner_profile_id),
      projectId: project.id,
      effectiveAt: work.due_at,
      days: dueMs < startMs ? daysSince(nowMs, dueMs) : null,
    });
  }

  for (const project of visible) {
    const name = personName(project.owner_profile_id);
    const ownerKey = keyOf(project.owner_profile_id);
    const checkMs = timestamp(project.next_check_at);
    const isWaiting = project.waiting_on !== 'none';

    if (isWaiting && checkMs !== null
      && checkMs <= nowMs + PROJECT_REMINDER_POLICY_V1.dueSoonHours * HOUR_MS) {
      add({
        id: 'check:' + project.id + ':' + project.next_check_at,
        kind: 'waiting_check', category: 'formal_due',
        severity: dueSeverity(checkMs, startMs, endMs),
        title: project.title,
        detail: '等待检查 · ' + dueLabel(checkMs, startMs, endMs),
        ownerName: name, ownerKey, projectId: project.id,
        effectiveAt: project.next_check_at, days: null,
      });
    }

    if (isWaiting && !project.next_check_at) {
      add({
        id: 'missing-check:' + project.id,
        kind: 'missing_check_time', category: 'project_attention', severity: 'attention',
        title: project.title,
        detail: '项目正在等待，但未设置下一次检查时间',
        ownerName: name, ownerKey, projectId: project.id, effectiveAt: null, days: null,
      });
    }
    if (!isWaiting && !openNextStep.has(project.id)) {
      add({
        id: 'missing-next:' + project.id,
        kind: 'missing_next_step', category: 'project_attention', severity: 'attention',
        title: project.title,
        detail: '进行中项目缺少正式的下一步行动',
        ownerName: name, ownerKey, projectId: project.id, effectiveAt: null, days: null,
      });
    }

    // A legitimate future waiting/check time isn't project inactivity.
    // When its check is already due, formal due reminders take priority.
    if (isWaiting && checkMs !== null) continue;
    const baseline = Math.max(
      lastProgressByProject.get(project.id) ?? 0,
      timestamp(project.created_at) ?? nowMs,
    );
    const idleDays = daysSince(nowMs, Math.min(baseline, nowMs));
    if (idleDays >= PROJECT_REMINDER_POLICY_V1.staleProjectDays) {
      add({
        id: 'stale:' + project.id,
        kind: 'stale_project', category: 'project_attention',
        severity: idleDays >= PROJECT_REMINDER_POLICY_V1.focusProjectDays ? 'urgent' : 'attention',
        title: project.title,
        detail: '连续 ' + idleDays + ' 天没有可核实的实质推进记录，建议核对实际进展',
        ownerName: name, ownerKey, projectId: project.id,
        effectiveAt: new Date(baseline).toISOString(), days: idleDays,
      });
    }
  }

  // Only known, active sales profiles from the authenticated, scoped read.
  // "No new projects" is a coaching signal, not an overdue obligation or KPI.
  for (const person of input.profiles) {
    if (!person.is_active || person.role !== 'sales') continue;
    const date = timestamp(person.created_at);
    if (date === null) continue;
    const newProjectAt = input.projects
      .filter(p => p.owner_profile_id === person.id && p.status !== 'cancelled')
      .reduce((max, p) => Math.max(max, timestamp(p.created_at) ?? 0), date);
    const gapDays = daysSince(nowMs, Math.min(newProjectAt, nowMs));
    if (gapDays < PROJECT_REMINDER_POLICY_V1.noNewProjectDays) continue;
    add({
      id: 'new-project-gap:' + keyOf(person.id),
      kind: 'new_project_gap', category: 'development_gap',
      severity: gapDays >= PROJECT_REMINDER_POLICY_V1.focusNewProjectDays ? 'attention' : 'upcoming',
      title: personName(person.id) + ' · 新项目开发空窗',
      detail: '最近 ' + gapDays + ' 天没有新增有效项目记录；建议核对线索、跟进与立项情况',
      ownerName: personName(person.id), ownerKey: keyOf(person.id),
      projectId: null, effectiveAt: new Date(newProjectAt).toISOString(), days: gapDays,
    });
  }

  items.sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    || (timestamp(a.effectiveAt) ?? Number.POSITIVE_INFINITY)
       - (timestamp(b.effectiveAt) ?? Number.POSITIVE_INFINITY)
    || a.id.localeCompare(b.id));

  const formalDue = items.filter(item => item.category === 'formal_due');
  return {
    generatedAt: input.now.toISOString(),
    readOnly: true,
    deliveryEnabled: false,
    policy: PROJECT_REMINDER_POLICY_V1,
    items,
    summary: {
      formalDue: formalDue.length,
      formalOverdue: formalDue.filter(item => item.severity === 'urgent').length,
      upcomingFormal: formalDue.filter(item => item.severity === 'upcoming').length,
      projectAttention: items.filter(item => item.category === 'project_attention').length,
      developmentGaps: items.filter(item => item.category === 'development_gap').length,
      total: items.length,
    },
  };
}
