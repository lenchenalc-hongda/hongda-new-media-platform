import type {
  GlhConversationMode,
  GlhLifecycleState,
  GlhPriorityGrade,
} from './domain';

export const GLH_LEAD_DUE_FILTERS = ['TODAY', 'OVERDUE', 'UPCOMING'] as const;
export type GlhLeadDueFilter = (typeof GLH_LEAD_DUE_FILTERS)[number];
export type GlhDueBucket = GlhLeadDueFilter | 'NONE';

export const GLH_REQUIREMENT_TYPES = [
  'FILM',
  'PROCESSING',
  'MACHINE',
  'PROCESS_CONSULT',
  'UNCLEAR',
] as const;
export type GlhRequirementType = (typeof GLH_REQUIREMENT_TYPES)[number];

export const GLH_SOURCE_PLATFORMS = [
  'WHATSAPP',
  'FACEBOOK',
  'INSTAGRAM',
  'UNKNOWN',
] as const;
export type GlhSourcePlatform = (typeof GLH_SOURCE_PLATFORMS)[number];

export interface GlhLeadListFilters {
  country?: string;
  source?: GlhSourcePlatform;
  requirement?: GlhRequirementType;
  grade?: GlhPriorityGrade;
  lifecycle?: GlhLifecycleState;
  ownerProfileId?: string;
  due?: GlhLeadDueFilter;
  adCreative?: string;
  search?: string;
}

export interface GlhLeadRow {
  id: string;
  org_id: string;
  contact_id: string;
  owner_profile_id: string | null;
  lifecycle_state: GlhLifecycleState;
  conversation_mode: GlhConversationMode;
  priority_grade: GlhPriorityGrade | null;
  score: number;
  completeness: number;
  source_platform: GlhSourcePlatform;
  campaign_id: string | null;
  creative_id: string | null;
  referral_identifier: string | null;
  last_message_at: string | null;
  next_follow_up_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface GlhContactRow {
  id: string;
  org_id: string;
  display_name: string | null;
  company_name: string | null;
  country_code: string | null;
  normalized_whatsapp: string | null;
  normalized_email: string | null;
  source_platform: GlhSourcePlatform;
}

export interface GlhLeadProfileRow {
  lead_id: string;
  org_id: string;
  customer_company_name: string | null;
  country_code: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  social_identifier: string | null;
  product: string | null;
  material: string | null;
  product_media_references: unknown[] | null;
  dimensions: string | null;
  quantity: string | null;
  artwork_reference: string | null;
  printing_area: string | null;
  requirement_type: GlhRequirementType | null;
  current_printing_process: string | null;
  pain_points: string | null;
  test_requirements: string | null;
  sample_availability: string | null;
  purchase_timeline: string | null;
  machine_capacity_requirements: string | null;
  automation_requirements: string | null;
  machine_plus_process_solution_required: boolean | null;
  extracted_facts: Record<string, unknown> | null;
  ai_summary: string | null;
}

export interface GlhProfileRow {
  id: string;
  org_id: string;
  full_name: string | null;
  role: string | null;
  is_active: boolean | null;
}

export interface GlhAssignmentRow {
  id: string;
  org_id: string;
  lead_id: string;
  assignee_profile_id: string;
  assignment_type: 'PRIMARY' | 'COLLABORATOR';
  assigned_by_profile_id: string;
  status: 'ACTIVE' | 'ENDED' | 'REVOKED';
  reason: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface GlhTaskRow {
  id: string;
  org_id: string;
  lead_id: string;
  assignee_profile_id: string;
  task_type: string;
  title: string;
  due_at: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  source: 'HUMAN' | 'AI_SUGGESTION' | 'SYSTEM';
  created_by_profile_id: string | null;
  completed_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface GlhFollowupRow {
  id: string;
  org_id: string;
  lead_id: string;
  assigned_profile_id: string;
  followup_type: string;
  next_action: string;
  due_at: string;
  status: 'OPEN' | 'DONE' | 'CANCELLED' | 'OVERDUE';
  last_contact_at: string | null;
  completed_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface GlhLeadScoreRow {
  id: string;
  org_id: string;
  lead_id: string;
  score: number;
  grade: GlhPriorityGrade;
  score_source: 'AI' | 'HUMAN' | 'SYSTEM';
  components: Record<string, unknown>;
  prompt_version: string | null;
  created_by_profile_id: string | null;
  created_at: string;
}

export interface GlhAuditEventRow {
  id: string;
  audit_seq: number;
  org_id: string;
  lead_id: string | null;
  actor_profile_id: string | null;
  actor_kind: 'HUMAN' | 'AI' | 'SYSTEM';
  event_type: string;
  entity_type: string;
  entity_id: string;
  previous_state: string | null;
  next_state: string | null;
  reason: string | null;
  context: Record<string, unknown>;
  created_at: string;
}

export interface GlhActivityEventRow {
  id: string;
  event_seq: number;
  org_id: string;
  lead_id: string;
  actor_profile_id: string | null;
  actor_kind: 'HUMAN' | 'AI' | 'SYSTEM';
  activity_type: 'LEAD_CREATED' | 'TASK_CREATED' | 'FOLLOWUP_CREATED';
  entity_type: string;
  entity_id: string;
  context: Record<string, unknown>;
  created_at: string;
}

export interface GlhMessageRow {
  id: string;
  org_id: string;
  conversation_id: string;
  lead_id: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'SYSTEM';
  actor_type: 'AI' | 'HUMAN' | 'CUSTOMER' | 'SYSTEM';
  actor_profile_id: string | null;
  message_text: string | null;
  media_metadata: Record<string, unknown> | null;
  provider_timestamp: string | null;
  delivery_status: string;
  created_at: string;
}

export interface GlhConversationRow {
  id: string;
  org_id: string;
  lead_id: string;
  contact_id: string;
  channel_account_id: string;
  external_conversation_id: string;
  conversation_mode: GlhConversationMode;
  conversation_status: 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
  assigned_profile_id: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GlhLeadListItem {
  id: string;
  organizationId: string;
  contactId: string;
  contactName: string;
  companyName: string | null;
  country: string | null;
  ownerProfileId: string | null;
  ownerName: string | null;
  lifecycle: GlhLifecycleState;
  conversationMode: GlhConversationMode;
  grade: GlhPriorityGrade | null;
  score: number;
  completeness: number;
  source: GlhSourcePlatform;
  requirementType: GlhRequirementType | null;
  adCreativeReference: string | null;
  nextFollowupAt: string | null;
  nextDueAt: string | null;
  dueBucket: GlhDueBucket;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface GlhTaskBoardItem {
  id: string;
  kind: 'TASK' | 'FOLLOWUP';
  leadId: string;
  assigneeProfileId: string;
  type: string;
  title: string;
  dueAt: string | null;
  status: string;
  source: string;
  version: number;
  updatedAt: string;
  contactName: string | null;
  companyName: string | null;
  lifecycle: GlhLifecycleState | null;
  dueBucket: GlhDueBucket;
}

export interface GlhTodaySummary {
  newLeads: number;
  waitingForHuman: number;
  dueToday: number;
  newlyQualified: number;
  quotationFollowups: number;
  sampleFollowups: number;
  overdue: number;
  dormant: number;
}

export interface GlhTodayDashboard {
  summary: GlhTodaySummary;
  priorityCustomers: GlhLeadListItem[];
}

export interface GlhLeadDetailView {
  listItem: GlhLeadListItem;
  contact: GlhContactRow;
  profile: GlhLeadProfileRow | null;
  conversations: GlhConversationRow[];
  messages: GlhMessageRow[];
  assignments: Array<GlhAssignmentRow & {
    assigneeName: string | null;
    assignedByName: string | null;
  }>;
  tasks: GlhTaskRow[];
  followups: GlhFollowupRow[];
  scores: GlhLeadScoreRow[];
  auditEvents: GlhAuditEventRow[];
  activityEvents: GlhActivityEventRow[];
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function dayKey(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function getGlhDueBucket(
  dueAt: string | null | undefined,
  now: Date = new Date(),
): GlhDueBucket {
  if (!dueAt) return 'NONE';
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return 'NONE';

  const dueDay = dayKey(due);
  const today = dayKey(now);
  if (!dueDay || !today) return 'NONE';
  if (dueDay === today) return 'TODAY';
  return due.getTime() < now.getTime() ? 'OVERDUE' : 'UPCOMING';
}

export function isOpenGlhWorkStatus(status: string): boolean {
  return status === 'OPEN' || status === 'IN_PROGRESS' || status === 'OVERDUE';
}

function nextOpenWorkDue(input: {
  leadId: string;
  tasks: GlhTaskRow[];
  followups: GlhFollowupRow[];
}): string | null {
  const dates = [
    ...input.tasks
      .filter(task => task.lead_id === input.leadId && isOpenGlhWorkStatus(task.status))
      .map(task => task.due_at),
    ...input.followups
      .filter(followup => followup.lead_id === input.leadId && isOpenGlhWorkStatus(followup.status))
      .map(followup => followup.due_at),
  ].filter((value): value is string => Boolean(value));

  dates.sort((left, right) => new Date(left).getTime() - new Date(right).getTime());
  return dates[0] ?? null;
}

export function buildGlhLeadList(input: {
  leads: GlhLeadRow[];
  contacts: GlhContactRow[];
  leadProfiles: GlhLeadProfileRow[];
  profiles: GlhProfileRow[];
  tasks: GlhTaskRow[];
  followups: GlhFollowupRow[];
  filters?: GlhLeadListFilters;
  now?: Date;
}): GlhLeadListItem[] {
  const now = input.now ?? new Date();
  const contacts = new Map(input.contacts.map(row => [row.id, row]));
  const leadProfiles = new Map(input.leadProfiles.map(row => [row.lead_id, row]));
  const profiles = new Map(input.profiles.map(row => [row.id, row]));
  const filters = input.filters ?? {};
  const search = normalize(filters.search);

  return input.leads
    .map(lead => {
      const contact = contacts.get(lead.contact_id) ?? null;
      const profile = leadProfiles.get(lead.id) ?? null;
      const nextDueAt = nextOpenWorkDue({
        leadId: lead.id,
        tasks: input.tasks,
        followups: input.followups,
      }) ?? lead.next_follow_up_at;
      const owner = lead.owner_profile_id
        ? profiles.get(lead.owner_profile_id) ?? null
        : null;

      const item: GlhLeadListItem = {
        id: lead.id,
        organizationId: lead.org_id,
        contactId: lead.contact_id,
        contactName: contact?.display_name?.trim()
          || profile?.customer_company_name?.trim()
          || 'Unnamed lead',
        companyName: contact?.company_name?.trim()
          || profile?.customer_company_name?.trim()
          || null,
        country: contact?.country_code?.trim()
          || profile?.country_code?.trim()
          || null,
        ownerProfileId: lead.owner_profile_id,
        ownerName: owner?.full_name?.trim() || null,
        lifecycle: lead.lifecycle_state,
        conversationMode: lead.conversation_mode,
        grade: lead.priority_grade,
        score: lead.score,
        completeness: lead.completeness,
        source: lead.source_platform,
        requirementType: profile?.requirement_type ?? null,
        adCreativeReference: lead.creative_id
          || lead.referral_identifier
          || lead.campaign_id
          || null,
        nextFollowupAt: lead.next_follow_up_at,
        nextDueAt,
        dueBucket: getGlhDueBucket(nextDueAt, now),
        version: lead.version,
        createdAt: lead.created_at,
        updatedAt: lead.updated_at,
      };
      return item;
    })
    .filter(item => {
      if (filters.country && normalize(item.country) !== normalize(filters.country)) return false;
      if (filters.source && item.source !== filters.source) return false;
      if (filters.requirement && item.requirementType !== filters.requirement) return false;
      if (filters.grade && item.grade !== filters.grade) return false;
      if (filters.lifecycle && item.lifecycle !== filters.lifecycle) return false;
      if (filters.ownerProfileId && item.ownerProfileId !== filters.ownerProfileId) return false;
      if (filters.due && item.dueBucket !== filters.due) return false;
      if (filters.adCreative) {
        const ad = normalize(item.adCreativeReference);
        if (!ad.includes(normalize(filters.adCreative))) return false;
      }
      if (!search) return true;
      return [
        item.contactName,
        item.companyName ?? '',
        item.country ?? '',
        item.ownerName ?? '',
        item.id,
      ].some(value => normalize(value).includes(search));
    })
    .sort((left, right) => {
      const leftOpen = !['WON', 'LOST', 'INVALID'].includes(left.lifecycle);
      const rightOpen = !['WON', 'LOST', 'INVALID'].includes(right.lifecycle);
      if (leftOpen !== rightOpen) return leftOpen ? -1 : 1;
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
}

function leadPriority(item: GlhLeadListItem): number {
  let score = item.grade === 'A' ? 0 : item.grade === 'B' ? 10 : item.grade === 'C' ? 20 : 30;
  if (item.dueBucket === 'OVERDUE') score -= 8;
  if (item.dueBucket === 'TODAY') score -= 4;
  if (item.lifecycle === 'READY_FOR_HUMAN' || item.conversationMode === 'HANDOFF_PENDING') {
    score -= 6;
  }
  score -= Math.round(item.score / 10);
  return score;
}

function wasRecentlyUpdated(value: string, now: Date, days: number): boolean {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return now.getTime() - timestamp <= days * 24 * 60 * 60 * 1000;
}

export function buildGlhTodayDashboard(input: {
  leads: GlhLeadRow[];
  contacts: GlhContactRow[];
  leadProfiles: GlhLeadProfileRow[];
  profiles: GlhProfileRow[];
  tasks: GlhTaskRow[];
  followups: GlhFollowupRow[];
  now?: Date;
}): GlhTodayDashboard {
  const now = input.now ?? new Date();
  const items = buildGlhLeadList({ ...input, now });
  const visibleLeadIds = new Set(items.map(item => item.id));
  const openTasks = input.tasks.filter(task =>
    visibleLeadIds.has(task.lead_id) && isOpenGlhWorkStatus(task.status),
  );
  const openFollowups = input.followups.filter(followup =>
    visibleLeadIds.has(followup.lead_id) && isOpenGlhWorkStatus(followup.status),
  );

  const quotationLeadIds = new Set([
    ...items.filter(item => item.lifecycle === 'QUOTATION').map(item => item.id),
    ...openTasks.filter(row => row.task_type === 'QUOTATION').map(row => row.lead_id),
    ...openFollowups.filter(row => row.followup_type === 'QUOTATION').map(row => row.lead_id),
  ]);
  const sampleLeadIds = new Set([
    ...items.filter(item => item.lifecycle === 'SAMPLE').map(item => item.id),
    ...openTasks.filter(row => row.task_type === 'SAMPLE').map(row => row.lead_id),
    ...openFollowups.filter(row => row.followup_type === 'SAMPLE').map(row => row.lead_id),
  ]);

  const summary: GlhTodaySummary = {
    newLeads: items.filter(item => item.lifecycle === 'NEW').length,
    waitingForHuman: items.filter(item =>
      item.lifecycle === 'READY_FOR_HUMAN'
      || item.conversationMode === 'HANDOFF_PENDING',
    ).length,
    dueToday: items.filter(item => item.dueBucket === 'TODAY').length,
    newlyQualified: items.filter(item =>
      item.grade !== null
      && ['READY_FOR_HUMAN', 'HUMAN_FOLLOWING'].includes(item.lifecycle)
      && wasRecentlyUpdated(item.updatedAt, now, 7),
    ).length,
    quotationFollowups: quotationLeadIds.size,
    sampleFollowups: sampleLeadIds.size,
    overdue: items.filter(item => item.dueBucket === 'OVERDUE').length,
    dormant: items.filter(item => item.lifecycle === 'DORMANT').length,
  };

  const priorityCustomers = items
    .filter(item => !['WON', 'LOST', 'INVALID'].includes(item.lifecycle))
    .sort((left, right) => {
      const priority = leadPriority(left) - leadPriority(right);
      if (priority !== 0) return priority;
      const leftDue = left.nextDueAt ? new Date(left.nextDueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDue = right.nextDueAt ? new Date(right.nextDueAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (leftDue !== rightDue) return leftDue - rightDue;
      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, 12);

  return { summary, priorityCustomers };
}

export function buildGlhTaskBoard(input: {
  tasks: GlhTaskRow[];
  followups: GlhFollowupRow[];
  leads: GlhLeadRow[];
  contacts: GlhContactRow[];
  now?: Date;
}): GlhTaskBoardItem[] {
  const now = input.now ?? new Date();
  const leads = new Map(input.leads.map(row => [row.id, row]));
  const contacts = new Map(input.contacts.map(row => [row.id, row]));

  const taskItems: GlhTaskBoardItem[] = input.tasks.map(row => {
    const lead = leads.get(row.lead_id) ?? null;
    const contact = lead ? contacts.get(lead.contact_id) ?? null : null;
    return {
      id: row.id,
      kind: 'TASK',
      leadId: row.lead_id,
      assigneeProfileId: row.assignee_profile_id,
      type: row.task_type,
      title: row.title,
      dueAt: row.due_at,
      status: row.status,
      source: row.source,
      version: row.version,
      updatedAt: row.updated_at,
      contactName: contact?.display_name ?? null,
      companyName: contact?.company_name ?? null,
      lifecycle: lead?.lifecycle_state ?? null,
      dueBucket: getGlhDueBucket(row.due_at, now),
    };
  });

  const followupItems: GlhTaskBoardItem[] = input.followups.map(row => {
    const lead = leads.get(row.lead_id) ?? null;
    const contact = lead ? contacts.get(lead.contact_id) ?? null : null;
    return {
      id: row.id,
      kind: 'FOLLOWUP',
      leadId: row.lead_id,
      assigneeProfileId: row.assigned_profile_id,
      type: row.followup_type,
      title: row.next_action,
      dueAt: row.due_at,
      status: row.status,
      source: 'HUMAN',
      version: row.version,
      updatedAt: row.updated_at,
      contactName: contact?.display_name ?? null,
      companyName: contact?.company_name ?? null,
      lifecycle: lead?.lifecycle_state ?? null,
      dueBucket: getGlhDueBucket(row.due_at, now),
    };
  });

  return [...taskItems, ...followupItems].sort((left, right) => {
    const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    return leftDue - rightDue;
  });
}

export function buildGlhLeadDetailSummary(input: {
  lead: GlhLeadRow;
  contact: GlhContactRow;
  leadProfile: GlhLeadProfileRow | null;
  profiles: GlhProfileRow[];
  tasks: GlhTaskRow[];
  followups: GlhFollowupRow[];
  now?: Date;
}): GlhLeadListItem {
  return buildGlhLeadList({
    leads: [input.lead],
    contacts: [input.contact],
    leadProfiles: input.leadProfile ? [input.leadProfile] : [],
    profiles: input.profiles,
    tasks: input.tasks,
    followups: input.followups,
    now: input.now,
  })[0];
}

export function summarizeGlhAuditTimeline(input: {
  auditEvents: GlhAuditEventRow[];
  activityEvents: GlhActivityEventRow[];
}): Array<{
  id: string;
  kind: 'AUDIT' | 'ACTIVITY';
  eventType: string;
  actorProfileId: string | null;
  summary: string;
  createdAt: string;
}> {
  return [
    ...input.auditEvents.map(row => ({
      id: row.id,
      kind: 'AUDIT' as const,
      eventType: row.event_type,
      actorProfileId: row.actor_profile_id,
      summary: row.reason || `${row.previous_state ?? 'none'} -> ${row.next_state ?? 'none'}`,
      createdAt: row.created_at,
    })),
    ...input.activityEvents.map(row => ({
      id: row.id,
      kind: 'ACTIVITY' as const,
      eventType: row.activity_type,
      actorProfileId: row.actor_profile_id,
      summary: row.activity_type.replaceAll('_', ' '),
      createdAt: row.created_at,
    })),
  ].sort((left, right) =>
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}
