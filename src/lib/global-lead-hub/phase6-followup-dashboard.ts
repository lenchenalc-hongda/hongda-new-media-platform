import type { GlhAccessContext } from './access';
import {
  getGlhDueBucket,
  isOpenGlhWorkStatus,
  type GlhContactRow,
  type GlhDueBucket,
  type GlhFollowupRow,
  type GlhLeadRow,
  type GlhProfileRow,
  type GlhTaskRow,
} from './read-model';

export type GlhFollowupBucket = Exclude<GlhDueBucket, 'NONE'> | 'DORMANT';

export interface GlhFollowupDashboardItem {
  id: string;
  kind: 'TASK' | 'FOLLOWUP';
  bucket: GlhFollowupBucket;
  leadId: string;
  contactName: string;
  assigneeProfileId: string;
  assigneeName: string;
  title: string;
  type: string;
  dueAt: string | null;
  lifecycle: GlhLeadRow['lifecycle_state'];
  grade: GlhLeadRow['priority_grade'];
}

export interface GlhManagerDashboard {
  scope: 'ORGANIZATION' | 'MY_ACCESSIBLE_RECORDS';
  managerView: boolean;
  generatedAt: string;
  summary: {
    totalLeads: number;
    activeLeads: number;
    waitingForHuman: number;
    dueToday: number;
    overdue: number;
    upcoming: number;
    dormant: number;
  };
  work: Record<GlhFollowupBucket, GlhFollowupDashboardItem[]>;
  workload: Array<{
    profileId: string;
    profileName: string;
    open: number;
    overdue: number;
  }>;
  lifecycle: Record<string, number>;
  grades: Record<'A' | 'B' | 'C' | 'D' | 'UNSCORED', number>;
  conversion: {
    quotation: number;
    sample: number;
    won: number;
    quotationRate: number;
    sampleRate: number;
    wonRate: number;
  };
}

function percentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function bucketForWork(input: {
  type: string;
  lifecycle: GlhLeadRow['lifecycle_state'];
  dueAt: string | null;
  now: Date;
}): GlhFollowupBucket | null {
  if (input.type === 'DORMANT_REVIVAL' || input.lifecycle === 'DORMANT') return 'DORMANT';
  const bucket = getGlhDueBucket(input.dueAt, input.now);
  return bucket === 'NONE' ? null : bucket;
}

export function buildGlhFollowupDashboard(input: {
  context: GlhAccessContext;
  leads: GlhLeadRow[];
  contacts: GlhContactRow[];
  profiles: GlhProfileRow[];
  tasks: GlhTaskRow[];
  followups: GlhFollowupRow[];
  now?: Date;
}): GlhManagerDashboard {
  const now = input.now ?? new Date();
  const managerView = input.context.role === 'ADMIN' || input.context.role === 'MANAGER';

  // RLS remains authoritative for collaborator visibility. This additional
  // boundary prevents cross-organization aggregation from mixed input rows.
  const leads = input.leads.filter(lead => lead.org_id === input.context.organizationId);
  const leadMap = new Map(leads.map(lead => [lead.id, lead]));
  const contacts = new Map(
    input.contacts
      .filter(contact => contact.org_id === input.context.organizationId)
      .map(contact => [contact.id, contact]),
  );
  const profiles = new Map(
    input.profiles
      .filter(profile => profile.org_id === input.context.organizationId)
      .map(profile => [profile.id, profile]),
  );

  const work: GlhManagerDashboard['work'] = {
    TODAY: [],
    OVERDUE: [],
    UPCOMING: [],
    DORMANT: [],
  };

  const addWork = (row: {
    id: string;
    kind: 'TASK' | 'FOLLOWUP';
    leadId: string;
    assigneeProfileId: string;
    title: string;
    type: string;
    dueAt: string | null;
    status: string;
  }) => {
    if (!isOpenGlhWorkStatus(row.status)) return;
    const lead = leadMap.get(row.leadId);
    if (!lead) return;
    const bucket = bucketForWork({
      type: row.type,
      lifecycle: lead.lifecycle_state,
      dueAt: row.dueAt,
      now,
    });
    if (!bucket) return;
    const contact = contacts.get(lead.contact_id);
    const assignee = profiles.get(row.assigneeProfileId);
    work[bucket].push({
      id: row.id,
      kind: row.kind,
      bucket,
      leadId: lead.id,
      contactName: contact?.display_name || contact?.company_name || 'Unnamed lead',
      assigneeProfileId: row.assigneeProfileId,
      assigneeName: assignee?.full_name || row.assigneeProfileId,
      title: row.title,
      type: row.type,
      dueAt: row.dueAt,
      lifecycle: lead.lifecycle_state,
      grade: lead.priority_grade,
    });
  };

  input.tasks
    .filter(row => row.org_id === input.context.organizationId)
    .forEach(row => addWork({
      id: row.id,
      kind: 'TASK',
      leadId: row.lead_id,
      assigneeProfileId: row.assignee_profile_id,
      title: row.title,
      type: row.task_type,
      dueAt: row.due_at,
      status: row.status,
    }));
  input.followups
    .filter(row => row.org_id === input.context.organizationId)
    .forEach(row => addWork({
      id: row.id,
      kind: 'FOLLOWUP',
      leadId: row.lead_id,
      assigneeProfileId: row.assigned_profile_id,
      title: row.next_action,
      type: row.followup_type,
      dueAt: row.due_at,
      status: row.status,
    }));

  for (const rows of Object.values(work)) {
    rows.sort((left, right) => {
      const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return leftDue - rightDue || left.id.localeCompare(right.id);
    });
  }

  const workloadMap = new Map<string, { profileName: string; open: number; overdue: number }>();
  for (const item of Object.values(work).flat()) {
    const current = workloadMap.get(item.assigneeProfileId) ?? {
      profileName: item.assigneeName,
      open: 0,
      overdue: 0,
    };
    current.open++;
    if (item.bucket === 'OVERDUE') current.overdue++;
    workloadMap.set(item.assigneeProfileId, current);
  }

  const lifecycle: Record<string, number> = {};
  const grades: GlhManagerDashboard['grades'] = { A: 0, B: 0, C: 0, D: 0, UNSCORED: 0 };
  for (const lead of leads) {
    lifecycle[lead.lifecycle_state] = (lifecycle[lead.lifecycle_state] ?? 0) + 1;
    grades[lead.priority_grade ?? 'UNSCORED']++;
  }

  const quotation = leads.filter(lead =>
    ['QUOTATION', 'SAMPLE', 'NEGOTIATION', 'WON'].includes(lead.lifecycle_state),
  ).length;
  const sample = leads.filter(lead =>
    ['SAMPLE', 'NEGOTIATION', 'WON'].includes(lead.lifecycle_state),
  ).length;
  const won = lifecycle.WON ?? 0;

  return {
    scope: managerView ? 'ORGANIZATION' : 'MY_ACCESSIBLE_RECORDS',
    managerView,
    generatedAt: now.toISOString(),
    summary: {
      totalLeads: leads.length,
      activeLeads: leads.filter(lead =>
        !['WON', 'LOST', 'INVALID'].includes(lead.lifecycle_state),
      ).length,
      waitingForHuman: leads.filter(lead =>
        lead.lifecycle_state === 'READY_FOR_HUMAN'
        || lead.conversation_mode === 'HANDOFF_PENDING',
      ).length,
      dueToday: work.TODAY.length,
      overdue: work.OVERDUE.length,
      upcoming: work.UPCOMING.length,
      dormant: work.DORMANT.length,
    },
    work,
    workload: [...workloadMap.entries()]
      .map(([profileId, value]) => ({ profileId, ...value }))
      .sort((left, right) => right.overdue - left.overdue || right.open - left.open),
    lifecycle,
    grades,
    conversion: {
      quotation,
      sample,
      won,
      quotationRate: percentage(quotation, leads.length),
      sampleRate: percentage(sample, leads.length),
      wonRate: percentage(won, leads.length),
    },
  };
}
