import { getCurrentUser } from '@/lib/auth/current-user';
import type { CurrentUser, Role } from '@/lib/auth/types';
import { normalizeRole } from '@/lib/auth/types';
import { createReadOnlySupabaseClient } from '@/lib/supabase/readonly';
import {
  evaluateGlhAccess,
  GlhAccessError,
  type GlhAccessContext,
  type GlhAccessDecision,
  type TrustedGlhBusinessIdentity,
} from './access';
import type {
  GlhActivityEventRow,
  GlhAssignmentRow,
  GlhAuditEventRow,
  GlhContactRow,
  GlhConversationRow,
  GlhFollowupRow,
  GlhLeadDetailView,
  GlhLeadListItem,
  GlhLeadListFilters,
  GlhLeadProfileRow,
  GlhLeadRow,
  GlhLeadScoreRow,
  GlhMessageRow,
  GlhProfileRow,
  GlhTaskBoardItem,
  GlhTaskRow,
  GlhTodayDashboard,
} from './read-model';
import {
  buildGlhLeadDetailSummary,
  buildGlhLeadList,
  buildGlhTaskBoard,
  buildGlhTodayDashboard,
} from './read-model';

const GLH_READ_LIMIT = 500;
const GLH_DETAIL_MESSAGE_LIMIT = 200;

export type GlhReadResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: 'DATABASE_UNAVAILABLE' | 'READ_FAILED' | 'LIMIT_EXCEEDED' | 'NOT_FOUND';
      message: string;
    };

export interface GlhAccessResolverDependencies {
  getCurrentUser: () => Promise<CurrentUser | null>;
  loadTrustedBusinessIdentity: (
    user: CurrentUser,
  ) => Promise<TrustedGlhBusinessIdentity | null>;
}

async function loadTrustedBusinessIdentity(
  user: CurrentUser,
): Promise<TrustedGlhBusinessIdentity | null> {
  if (user.authSource !== 'supabase') return null;

  const client = await createReadOnlySupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from('profiles')
    .select('id,user_id,org_id,role,is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return null;

  const rootRole = normalizeRole(data.role);
  return {
    authUserId: data.user_id,
    profileId: data.id,
    organizationId: data.org_id,
    rootRole,
    active: data.is_active === true,
  };
}

const defaultDependencies: GlhAccessResolverDependencies = {
  getCurrentUser,
  loadTrustedBusinessIdentity,
};

export async function resolveGlhAccessContext(
  dependencies: GlhAccessResolverDependencies = defaultDependencies,
): Promise<GlhAccessDecision> {
  const user = await dependencies.getCurrentUser();
  if (!user) return { ok: false, code: 'UNAUTHENTICATED' };

  let identity: TrustedGlhBusinessIdentity | null = null;
  if (user.authSource === 'supabase') {
    identity = await dependencies.loadTrustedBusinessIdentity(user);
  }

  return evaluateGlhAccess(user, identity);
}

export async function requireGlhAccessContext(
  dependencies: GlhAccessResolverDependencies = defaultDependencies,
): Promise<GlhAccessContext> {
  const decision = await resolveGlhAccessContext(dependencies);
  if (!decision.ok) {
    throw new GlhAccessError(
      decision.code,
      decision.code === 'UNAUTHENTICATED' ? 'Authentication required' : 'Access denied',
    );
  }
  return decision.context;
}

export function isTrustedGlhRole(value: Role | null): boolean {
  return value === 'admin' || value === 'manager' || value === 'sales';
}

function readFailure<T>(
  code: Extract<GlhReadResult<T>, { ok: false }>['code'],
  message: string,
): GlhReadResult<T> {
  return { ok: false, code, message };
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function asRows<T>(value: unknown): T[] {
  return (value ?? []) as T[];
}

function asRow<T>(value: unknown): T | null {
  return (value ?? null) as T | null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

interface GlhLeadReadInput {
  leads: GlhLeadRow[];
  contacts: GlhContactRow[];
  leadProfiles: GlhLeadProfileRow[];
  profiles: GlhProfileRow[];
  tasks: GlhTaskRow[];
  followups: GlhFollowupRow[];
}

async function loadGlhLeadReadInput(
  context: GlhAccessContext,
  filters: GlhLeadListFilters = {},
): Promise<GlhReadResult<GlhLeadReadInput>> {
  const client = await createReadOnlySupabaseClient();
  if (!client) {
    return readFailure('DATABASE_UNAVAILABLE', 'Global Lead Hub data is unavailable');
  }

  let query: any = client
    .from('glh_leads')
    .select(
      'id,org_id,contact_id,owner_profile_id,lifecycle_state,conversation_mode,'
      + 'priority_grade,score,completeness,source_platform,campaign_id,creative_id,'
      + 'referral_identifier,last_message_at,next_follow_up_at,version,created_at,updated_at',
    )
    .eq('org_id', context.organizationId);

  if (filters.lifecycle) query = query.eq('lifecycle_state', filters.lifecycle);
  if (filters.grade) query = query.eq('priority_grade', filters.grade);
  if (filters.ownerProfileId) query = query.eq('owner_profile_id', filters.ownerProfileId);
  if (filters.source) query = query.eq('source_platform', filters.source);

  const leadsResult = await query
    .order('updated_at', { ascending: false })
    .limit(GLH_READ_LIMIT);

  if (leadsResult.error) {
    return readFailure('READ_FAILED', 'Global Lead Hub leads could not be loaded');
  }

  const leads = asRows<GlhLeadRow>(leadsResult.data);
  if (leads.length >= GLH_READ_LIMIT) {
    return readFailure(
      'LIMIT_EXCEEDED',
      'Lead data exceeds the current safe display limit',
    );
  }
  if (leads.length === 0) {
    return {
      ok: true,
      data: { leads: [], contacts: [], leadProfiles: [], profiles: [], tasks: [], followups: [] },
    };
  }

  const leadIds = leads.map(lead => lead.id);
  const contactIds = uniqueIds(leads.map(lead => lead.contact_id));
  const ownerIds = uniqueIds(leads.map(lead => lead.owner_profile_id));

  const [
    contactsResult,
    leadProfilesResult,
    profilesResult,
    tasksResult,
    followupsResult,
  ] = await Promise.all([
    client
      .from('glh_contacts')
      .select(
        'id,org_id,display_name,company_name,country_code,normalized_whatsapp,'
        + 'normalized_email,source_platform',
      )
      .eq('org_id', context.organizationId)
      .in('id', contactIds),
    client
      .from('glh_lead_profiles')
      .select(
        'lead_id,org_id,customer_company_name,country_code,whatsapp,email,website,'
        + 'social_identifier,product,material,product_media_references,dimensions,'
        + 'quantity,artwork_reference,printing_area,requirement_type,'
        + 'current_printing_process,pain_points,test_requirements,sample_availability,'
        + 'purchase_timeline,machine_capacity_requirements,automation_requirements,'
        + 'machine_plus_process_solution_required,extracted_facts,ai_summary',
      )
      .eq('org_id', context.organizationId)
      .in('lead_id', leadIds),
    ownerIds.length > 0
      ? client
        .from('profiles')
        .select('id,org_id,full_name,role,is_active')
        .eq('org_id', context.organizationId)
        .in('id', ownerIds)
      : Promise.resolve({ data: [], error: null }),
    client
      .from('glh_tasks')
      .select(
        'id,org_id,lead_id,assignee_profile_id,task_type,title,due_at,status,source,'
        + 'created_by_profile_id,completed_at,version,created_at,updated_at',
      )
      .eq('org_id', context.organizationId)
      .in('lead_id', leadIds)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(GLH_READ_LIMIT),
    client
      .from('glh_followups')
      .select(
        'id,org_id,lead_id,assigned_profile_id,followup_type,next_action,due_at,status,'
        + 'last_contact_at,completed_at,version,created_at,updated_at',
      )
      .eq('org_id', context.organizationId)
      .in('lead_id', leadIds)
      .order('due_at', { ascending: true })
      .limit(GLH_READ_LIMIT),
  ]);

  if (
    contactsResult.error
    || leadProfilesResult.error
    || profilesResult.error
    || tasksResult.error
    || followupsResult.error
  ) {
    return readFailure('READ_FAILED', 'Global Lead Hub lead context could not be loaded');
  }

  return {
    ok: true,
    data: {
      leads,
      contacts: asRows<GlhContactRow>(contactsResult.data),
      leadProfiles: asRows<GlhLeadProfileRow>(leadProfilesResult.data),
      profiles: asRows<GlhProfileRow>(profilesResult.data),
      tasks: asRows<GlhTaskRow>(tasksResult.data),
      followups: asRows<GlhFollowupRow>(followupsResult.data),
    },
  };
}

export async function loadGlhLeads(
  context: GlhAccessContext,
  filters: GlhLeadListFilters = {},
): Promise<GlhReadResult<GlhLeadListItem[]>> {
  const input = await loadGlhLeadReadInput(context, filters);
  if (!input.ok) return input;
  return {
    ok: true,
    data: buildGlhLeadList({ ...input.data, filters, now: new Date() }),
  };
}

export async function loadGlhTodayDashboard(
  context: GlhAccessContext,
): Promise<GlhReadResult<GlhTodayDashboard>> {
  const input = await loadGlhLeadReadInput(context);
  if (!input.ok) return input;
  return {
    ok: true,
    data: buildGlhTodayDashboard({ ...input.data, now: new Date() }),
  };
}

export async function loadGlhLeadDetail(
  context: GlhAccessContext,
  leadId: string,
): Promise<GlhReadResult<GlhLeadDetailView>> {
  if (!isUuid(leadId)) {
    return readFailure('NOT_FOUND', 'The lead was not found in your accessible scope');
  }

  const client = await createReadOnlySupabaseClient();
  if (!client) {
    return readFailure('DATABASE_UNAVAILABLE', 'Global Lead Hub data is unavailable');
  }

  const leadResult = await client
    .from('glh_leads')
    .select(
      'id,org_id,contact_id,owner_profile_id,lifecycle_state,conversation_mode,'
      + 'priority_grade,score,completeness,source_platform,campaign_id,creative_id,'
      + 'referral_identifier,last_message_at,next_follow_up_at,version,created_at,updated_at',
    )
    .eq('org_id', context.organizationId)
    .eq('id', leadId)
    .maybeSingle();

  if (leadResult.error) {
    return readFailure('READ_FAILED', 'The lead could not be loaded');
  }
  if (!leadResult.data) {
    return readFailure('NOT_FOUND', 'The lead was not found in your accessible scope');
  }
  const lead = asRow<GlhLeadRow>(leadResult.data)!;

  const [
    contactResult,
    leadProfileResult,
    conversationsResult,
    messagesResult,
    assignmentsResult,
    tasksResult,
    followupsResult,
    scoresResult,
    auditResult,
    activityResult,
  ] = await Promise.all([
    client
      .from('glh_contacts')
      .select(
        'id,org_id,display_name,company_name,country_code,normalized_whatsapp,'
        + 'normalized_email,source_platform',
      )
      .eq('org_id', context.organizationId)
      .eq('id', lead.contact_id)
      .maybeSingle(),
    client
      .from('glh_lead_profiles')
      .select('*')
      .eq('org_id', context.organizationId)
      .eq('lead_id', lead.id)
      .maybeSingle(),
    client
      .from('glh_conversations')
      .select(
        'id,org_id,lead_id,contact_id,channel_account_id,external_conversation_id,'
        + 'conversation_mode,conversation_status,assigned_profile_id,last_message_at,'
        + 'created_at,updated_at',
      )
      .eq('org_id', context.organizationId)
      .eq('lead_id', lead.id)
      .order('updated_at', { ascending: false }),
    client
      .from('glh_messages')
      .select(
        'id,org_id,conversation_id,lead_id,direction,actor_type,actor_profile_id,'
        + 'message_text,media_metadata,provider_timestamp,delivery_status,created_at',
      )
      .eq('org_id', context.organizationId)
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(GLH_DETAIL_MESSAGE_LIMIT),
    client
      .from('glh_assignments')
      .select(
        'id,org_id,lead_id,assignee_profile_id,assignment_type,'
        + 'assigned_by_profile_id,status,reason,started_at,ended_at,created_at',
      )
      .eq('org_id', context.organizationId)
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false }),
    client
      .from('glh_tasks')
      .select(
        'id,org_id,lead_id,assignee_profile_id,task_type,title,due_at,status,source,'
        + 'created_by_profile_id,completed_at,version,created_at,updated_at',
      )
      .eq('org_id', context.organizationId)
      .eq('lead_id', lead.id)
      .order('due_at', { ascending: true, nullsFirst: false }),
    client
      .from('glh_followups')
      .select(
        'id,org_id,lead_id,assigned_profile_id,followup_type,next_action,due_at,status,'
        + 'last_contact_at,completed_at,version,created_at,updated_at',
      )
      .eq('org_id', context.organizationId)
      .eq('lead_id', lead.id)
      .order('due_at', { ascending: true }),
    client
      .from('glh_lead_scores')
      .select(
        'id,org_id,lead_id,score,grade,score_source,components,prompt_version,'
        + 'created_by_profile_id,created_at',
      )
      .eq('org_id', context.organizationId)
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false }),
    client
      .from('glh_audit_events')
      .select(
        'id,audit_seq,org_id,lead_id,actor_profile_id,actor_kind,event_type,'
        + 'entity_type,entity_id,previous_state,next_state,reason,context,created_at',
      )
      .eq('org_id', context.organizationId)
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(GLH_READ_LIMIT),
    client
      .from('glh_activity_events')
      .select(
        'id,event_seq,org_id,lead_id,actor_profile_id,actor_kind,activity_type,'
        + 'entity_type,entity_id,context,created_at',
      )
      .eq('org_id', context.organizationId)
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(GLH_READ_LIMIT),
  ]);

  if (
    contactResult.error
    || leadProfileResult.error
    || conversationsResult.error
    || messagesResult.error
    || assignmentsResult.error
    || tasksResult.error
    || followupsResult.error
    || scoresResult.error
    || auditResult.error
    || activityResult.error
    || !contactResult.data
  ) {
    return readFailure('READ_FAILED', 'The lead detail could not be loaded');
  }

  const assignments = asRows<GlhAssignmentRow>(assignmentsResult.data);
  const profileIds = uniqueIds([
    lead.owner_profile_id,
    ...assignments.flatMap(row => [
      row.assignee_profile_id,
      row.assigned_by_profile_id,
    ]),
    ...asRows<GlhTaskRow>(tasksResult.data).map(row => row.assignee_profile_id),
  ]);
  const profilesResult = profileIds.length > 0
    ? await client
      .from('profiles')
      .select('id,org_id,full_name,role,is_active')
      .eq('org_id', context.organizationId)
      .in('id', profileIds)
    : { data: [], error: null };

  if (profilesResult.error) {
    return readFailure('READ_FAILED', 'Lead owner context could not be loaded');
  }

  const profiles = asRows<GlhProfileRow>(profilesResult.data);
  const profileNames = new Map(profiles.map(row => [row.id, row.full_name]));
  const tasks = asRows<GlhTaskRow>(tasksResult.data);
  const followups = asRows<GlhFollowupRow>(followupsResult.data);
  const leadProfile = asRow<GlhLeadProfileRow>(leadProfileResult.data);

  return {
    ok: true,
    data: {
      listItem: buildGlhLeadDetailSummary({
        lead,
        contact: asRow<GlhContactRow>(contactResult.data)!,
        leadProfile,
        profiles,
        tasks,
        followups,
      }),
      contact: asRow<GlhContactRow>(contactResult.data)!,
      profile: leadProfile,
      conversations: asRows<GlhConversationRow>(conversationsResult.data),
      messages: asRows<GlhMessageRow>(messagesResult.data),
      assignments: assignments.map(row => ({
        ...row,
        assigneeName: profileNames.get(row.assignee_profile_id) ?? null,
        assignedByName: profileNames.get(row.assigned_by_profile_id) ?? null,
      })),
      tasks,
      followups,
      scores: asRows<GlhLeadScoreRow>(scoresResult.data),
      auditEvents: asRows<GlhAuditEventRow>(auditResult.data),
      activityEvents: asRows<GlhActivityEventRow>(activityResult.data),
    },
  };
}

export async function loadGlhMyTasks(
  context: GlhAccessContext,
): Promise<GlhReadResult<GlhTaskBoardItem[]>> {
  const client = await createReadOnlySupabaseClient();
  if (!client) {
    return readFailure('DATABASE_UNAVAILABLE', 'Global Lead Hub data is unavailable');
  }

  const [tasksResult, followupsResult] = await Promise.all([
    client
      .from('glh_tasks')
      .select(
        'id,org_id,lead_id,assignee_profile_id,task_type,title,due_at,status,source,'
        + 'created_by_profile_id,completed_at,version,created_at,updated_at',
      )
      .eq('org_id', context.organizationId)
      .eq('assignee_profile_id', context.actorProfileId)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(GLH_READ_LIMIT),
    client
      .from('glh_followups')
      .select(
        'id,org_id,lead_id,assigned_profile_id,followup_type,next_action,due_at,status,'
        + 'last_contact_at,completed_at,version,created_at,updated_at',
      )
      .eq('org_id', context.organizationId)
      .eq('assigned_profile_id', context.actorProfileId)
      .order('due_at', { ascending: true })
      .limit(GLH_READ_LIMIT),
  ]);

  if (tasksResult.error || followupsResult.error) {
    return readFailure('READ_FAILED', 'Global Lead Hub tasks could not be loaded');
  }

  const tasks = asRows<GlhTaskRow>(tasksResult.data);
  const followups = asRows<GlhFollowupRow>(followupsResult.data);
  const leadIds = uniqueIds([
    ...tasks.map(row => row.lead_id),
    ...followups.map(row => row.lead_id),
  ]);
  if (leadIds.length === 0) return { ok: true, data: [] };

  const leadsResult = await client
    .from('glh_leads')
    .select(
      'id,org_id,contact_id,owner_profile_id,lifecycle_state,conversation_mode,'
      + 'priority_grade,score,completeness,source_platform,campaign_id,creative_id,'
      + 'referral_identifier,last_message_at,next_follow_up_at,version,created_at,updated_at',
    )
    .eq('org_id', context.organizationId)
    .in('id', leadIds);

  if (leadsResult.error) {
    return readFailure('READ_FAILED', 'Global Lead Hub task leads could not be loaded');
  }

  const leads = asRows<GlhLeadRow>(leadsResult.data);
  const contactsResult = leads.length > 0
    ? await client
      .from('glh_contacts')
      .select(
        'id,org_id,display_name,company_name,country_code,normalized_whatsapp,'
        + 'normalized_email,source_platform',
      )
      .eq('org_id', context.organizationId)
      .in('id', uniqueIds(leads.map(row => row.contact_id)))
    : { data: [], error: null };

  if (contactsResult.error) {
    return readFailure('READ_FAILED', 'Global Lead Hub task contacts could not be loaded');
  }

  return {
    ok: true,
    data: buildGlhTaskBoard({
      tasks,
      followups,
      leads,
      contacts: asRows<GlhContactRow>(contactsResult.data),
    }),
  };
}

export async function loadGlhAssignableProfiles(
  context: GlhAccessContext,
): Promise<GlhReadResult<Array<{ id: string; name: string; role: string }>>> {
  if (context.role !== 'ADMIN' && context.role !== 'MANAGER') {
    return { ok: true, data: [] };
  }

  const client = await createReadOnlySupabaseClient();
  if (!client) {
    return readFailure('DATABASE_UNAVAILABLE', 'Global Lead Hub data is unavailable');
  }

  const result = await client
    .from('profiles')
    .select('id,org_id,full_name,role,is_active')
    .eq('org_id', context.organizationId)
    .eq('is_active', true)
    .in('role', ['admin', 'manager', 'sales'])
    .order('full_name', { ascending: true });

  if (result.error) {
    return readFailure('READ_FAILED', 'Assignable GLH profiles could not be loaded');
  }

  return {
    ok: true,
    data: asRows<GlhProfileRow>(result.data).map(row => ({
      id: row.id,
      name: row.full_name || row.id,
      role: row.role || 'unknown',
    })),
  };
}
