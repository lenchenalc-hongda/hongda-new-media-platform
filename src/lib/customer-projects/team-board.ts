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
import {
  buildOldCustomerRecommendations,
  buildPhase10SourceCategoryReport,
  type Phase10SourceCategoryReport,
} from './old-customer-proactive';
import { getShanghaiBusinessWindow } from './read-models';

export type TeamBoardRole = 'admin' | 'manager' | 'sales';
export type TeamBoardDueState = 'overdue' | 'due_now' | 'scheduled' | 'no_due';

export interface TeamBoardProjectRow {
  id: string;
  org_id: string;
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
  updated_at: string;
}

export interface TeamBoardWorkItemRow {
  id: string;
  org_id: string;
  customer_reference_id: string | null;
  project_id: string | null;
  work_item_type: WorkItemType;
  title: string;
  assignee_profile_id: string;
  created_by_profile_id: string;
  due_at: string | null;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  blocked_reason: string | null;
  updated_at: string;
}

export interface TeamBoardCustomerRow {
  id: string;
  org_id: string;
  reference_kind: 'canonical' | 'provisional';
  display_name_snapshot: string;
  status: string;
  updated_at: string;
}

export interface TeamBoardProfileRow {
  id: string;
  org_id: string;
  full_name: string | null;
  department: string | null;
  role: string;
  is_active: boolean;
}

export interface TeamBoardReportRow {
  id: string;
  org_id: string;
  subject_profile_id: string;
  period_type: 'weekly';
  period_start: string;
  status: 'submitted';
  submitted_at: string;
  version: number;
  updated_at: string;
}

export interface TeamBoardEventRow {
  id: string;
  org_id: string;
  project_id: string | null;
  customer_reference_id: string | null;
  event_type: string;
  occurred_at: string;
  payload?: Record<string, unknown> | null;
}

export interface TeamBoardIdentity {
  profileId: string;
  displayName: string;
  department: string | null;
}

export interface TeamBoardCustomerRef {
  id: string;
  displayName: string;
}

export interface TeamBoardProjectRef {
  id: string;
  title: string;
}

export interface TeamBoardDecisionItem {
  source: 'cpc_work_items';
  id: string;
  title: string;
  priority: WorkItemPriority;
  status: WorkItemStatus;
  blocked: boolean;
  blockedReason: string | null;
  dueAt: string | null;
  dueState: TeamBoardDueState;
  assignee: TeamBoardIdentity | null;
  creator: TeamBoardIdentity | null;
  customer: TeamBoardCustomerRef | null;
  project: TeamBoardProjectRef | null;
}

export interface TeamBoardCommitmentException {
  source: 'cpc_work_items';
  id: string;
  title: string;
  priority: WorkItemPriority;
  status: WorkItemStatus;
  blocked: boolean;
  blockedReason: string | null;
  dueAt: string;
  dueState: Extract<TeamBoardDueState, 'overdue' | 'due_now'>;
  assignee: TeamBoardIdentity | null;
  customer: TeamBoardCustomerRef | null;
  project: TeamBoardProjectRef | null;
}

export type TeamBoardProjectExceptionReason =
  | 'overdue_next_action'
  | 'blocked_next_action'
  | 'waiting_check_due'
  | 'missing_next_action'
  | 'high_risk_project';

export interface TeamBoardProjectException {
  source: 'cpc_projects';
  projectId: string;
  title: string;
  projectType: ProjectType;
  priority: ProjectPriority;
  stage: string;
  riskLevel: RiskLevel | null;
  customer: TeamBoardCustomerRef | null;
  owner: TeamBoardIdentity | null;
  reasons: TeamBoardProjectExceptionReason[];
  nextAction: {
    id: string;
    title: string;
    dueAt: string | null;
    status: WorkItemStatus;
    blockedReason: string | null;
  } | null;
  waiting: {
    waitingOn: Exclude<WaitingOn, 'none'>;
    nextCheckAt: string;
    due: boolean;
  } | null;
  relevantDueAt: string | null;
}

export interface TeamMemberSupportContext {
  profileId: string;
  displayName: string;
  department: string | null;
  role: string;
  openWorkItemCount: number;
  blockedWorkItemCount: number;
  overdueWorkItemCount: number;
  activeProjectCount: number;
  waitingProjectCount: number;
  managementDecisionCount: number;
  internalCollaborationCount: number;
  weeklyReportContext: {
    state: 'confirmed_submitted';
    periodStart: string;
    submittedAt: string;
  } | null;
}

export interface TeamBoardSnapshot {
  businessDate: string;
  generatedAt: string;
  readOnly: true;
  audience: 'manager_admin';
  sectionOrder: [
    'management_decisions',
    'commitment_exceptions',
    'project_exceptions',
    'team_support',
    'old_customer_coverage',
    'business_progress',
  ];
  managementDecisions: TeamBoardDecisionItem[];
  commitmentExceptions: TeamBoardCommitmentException[];
  projectExceptions: TeamBoardProjectException[];
  teamSupport: {
    ranking: false;
    scoring: false;
    ordering: 'display_name_only';
    members: TeamMemberSupportContext[];
  };
  oldCustomerCoverage: {
    state: 'evaluated';
    reason: string;
    phase10PolicyApplied: true;
    confirmedFacts: {
      canonicalCustomerCount: number;
      customersWithActiveProjectCount: number;
      openCustomerFollowUpCount: number;
      dueCustomerFollowUpCount: number;
    };
    recommendations: {
      eligibleKnownCustomerCount: number;
      dueRecommendationCount: number;
      suppressedActiveProjectCount: number;
      suppressedOpenFollowUpCount: number;
      needsBaselineCount: number;
      evidenceUnknownCount: number;
    };
    sourceCategories: Phase10SourceCategoryReport;
    coverageRate:
      | { state: 'known'; value: number }
      | { state: 'unknown'; reason: string };
    conversionRate: { state: 'unknown'; reason: string };
  };
  businessProgress: {
    projectStateCounts: Record<ProjectLifecycleStatus, number>;
    activeWaitingProjectCount: number;
    highRiskActiveProjectCount: number;
    submittedWeeklyReportCount: number;
    confirmedOutcomeEvents: {
      meaningfulProgressCount: number;
      orderConfirmedCount: number;
    };
    externalSources: {
      orderValue: { state: 'unknown'; reason: string };
      quoteAcceptance: { state: 'unknown'; reason: string };
      payment: { state: 'unknown'; reason: string };
      finance: { state: 'unknown'; reason: string };
    };
  };
  summary: {
    managementDecisionCount: number;
    commitmentExceptionCount: number;
    projectExceptionCount: number;
    teamMemberContextCount: number;
    activeProjectCount: number;
    openWorkItemCount: number;
  };
  unknowns: Array<{
    key: string;
    state: 'unknown';
    reason: string;
  }>;
}

const PRIORITY_WEIGHT: Record<WorkItemPriority | ProjectPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SECTION_ORDER: TeamBoardSnapshot['sectionOrder'] = [
  'management_decisions',
  'commitment_exceptions',
  'project_exceptions',
  'team_support',
  'old_customer_coverage',
  'business_progress',
];

function toMs(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function isOpenWorkItem(item: TeamBoardWorkItemRow): boolean {
  return item.status === 'pending'
    || item.status === 'in_progress'
    || item.status === 'blocked';
}

function dueState(
  dueAt: string | null,
  startMs: number,
  endMs: number,
): TeamBoardDueState {
  if (!dueAt) return 'no_due';
  const dueMs = toMs(dueAt);
  if (!Number.isFinite(dueMs)) return 'no_due';
  if (dueMs < startMs) return 'overdue';
  if (dueMs < endMs) return 'due_now';
  return 'scheduled';
}

function profileIdentity(
  profileId: string | null,
  profiles: Map<string, TeamBoardProfileRow>,
): TeamBoardIdentity | null {
  if (!profileId) return null;
  const profile = profiles.get(profileId);
  if (!profile) return null;
  return {
    profileId: profile.id,
    displayName: profile.full_name?.trim() || '未命名用户',
    department: profile.department,
  };
}

function customerReference(
  customerId: string | null,
  customers: Map<string, TeamBoardCustomerRow>,
): TeamBoardCustomerRef | null {
  if (!customerId) return null;
  const customer = customers.get(customerId);
  if (!customer) return null;
  return {
    id: customer.id,
    displayName: customer.display_name_snapshot,
  };
}

function projectReference(
  projectId: string | null,
  projects: Map<string, TeamBoardProjectRow>,
): TeamBoardProjectRef | null {
  if (!projectId) return null;
  const project = projects.get(projectId);
  if (!project) return null;
  return {
    id: project.id,
    title: project.title,
  };
}

export function canAccessTeamBoard(
  role: string | null | undefined,
): boolean {
  return role === 'admin' || role === 'manager';
}

export function buildTeamBoardSnapshot(input: {
  now: Date;
  orgId: string;
  projects: TeamBoardProjectRow[];
  workItems: TeamBoardWorkItemRow[];
  customers: TeamBoardCustomerRow[];
  profiles: TeamBoardProfileRow[];
  reports: TeamBoardReportRow[];
  events: TeamBoardEventRow[];
}): TeamBoardSnapshot {
  const { businessDate, startMs, endMs } = getShanghaiBusinessWindow(input.now);
  const nowMs = input.now.getTime();

  const projects = input.projects.filter(row => row.org_id === input.orgId);
  const workItems = input.workItems.filter(row => row.org_id === input.orgId);
  const customers = input.customers.filter(row => row.org_id === input.orgId);
  const profiles = input.profiles.filter(row => row.org_id === input.orgId);
  const reports = input.reports.filter(row => (
    row.org_id === input.orgId
    && row.period_type === 'weekly'
    && row.status === 'submitted'
  ));
  const events = input.events.filter(row => row.org_id === input.orgId);

  const projectsById = new Map(projects.map(project => [project.id, project]));
  const customersById = new Map(customers.map(customer => [customer.id, customer]));
  const profilesById = new Map(profiles.map(profile => [profile.id, profile]));

  const managementDecisions = workItems
    .filter(item => (
      item.work_item_type === 'MANAGEMENT_DECISION'
      && isOpenWorkItem(item)
    ))
    .map((item): TeamBoardDecisionItem => {
      const project = item.project_id
        ? projectsById.get(item.project_id) ?? null
        : null;
      const customerId = item.customer_reference_id
        ?? project?.customer_reference_id
        ?? null;
      return {
        source: 'cpc_work_items',
        id: item.id,
        title: item.title,
        priority: item.priority,
        status: item.status,
        blocked: item.status === 'blocked',
        blockedReason: item.blocked_reason,
        dueAt: item.due_at,
        dueState: dueState(item.due_at, startMs, endMs),
        assignee: profileIdentity(item.assignee_profile_id, profilesById),
        creator: profileIdentity(item.created_by_profile_id, profilesById),
        customer: customerReference(customerId, customersById),
        project: projectReference(item.project_id, projectsById),
      };
    })
    .sort((left, right) => (
      toMs(left.dueAt) - toMs(right.dueAt)
      || PRIORITY_WEIGHT[left.priority] - PRIORITY_WEIGHT[right.priority]
      || left.id.localeCompare(right.id)
    ));

  const commitmentExceptions = workItems
    .filter(item => (
      item.work_item_type === 'CUSTOMER_COMMITMENT'
      && isOpenWorkItem(item)
      && !!item.due_at
      && toMs(item.due_at) <= nowMs
    ))
    .map((item): TeamBoardCommitmentException => {
      const project = item.project_id
        ? projectsById.get(item.project_id) ?? null
        : null;
      const customerId = item.customer_reference_id
        ?? project?.customer_reference_id
        ?? null;
      const state = dueState(item.due_at, startMs, endMs);
      return {
        source: 'cpc_work_items',
        id: item.id,
        title: item.title,
        priority: item.priority,
        status: item.status,
        blocked: item.status === 'blocked',
        blockedReason: item.blocked_reason,
        dueAt: item.due_at as string,
        dueState: state === 'overdue' ? 'overdue' : 'due_now',
        assignee: profileIdentity(item.assignee_profile_id, profilesById),
        customer: customerReference(customerId, customersById),
        project: projectReference(item.project_id, projectsById),
      };
    })
    .sort((left, right) => (
      toMs(left.dueAt) - toMs(right.dueAt)
      || left.id.localeCompare(right.id)
    ));

  const openNextActionByProject = new Map<string, TeamBoardWorkItemRow>();
  for (const item of workItems) {
    if (
      item.project_id
      && item.work_item_type === 'NEXT_ACTION'
      && isOpenWorkItem(item)
    ) {
      openNextActionByProject.set(item.project_id, item);
    }
  }

  const projectExceptions = projects
    .filter(project => project.status === 'active')
    .flatMap((project): TeamBoardProjectException[] => {
      const nextAction = openNextActionByProject.get(project.id) ?? null;
      const waiting = project.waiting_on !== 'none' && project.next_check_at
        ? {
            waitingOn: project.waiting_on as Exclude<WaitingOn, 'none'>,
            nextCheckAt: project.next_check_at,
            due: toMs(project.next_check_at) <= nowMs,
          }
        : null;
      const reasons: TeamBoardProjectExceptionReason[] = [];

      if (!waiting && !nextAction) reasons.push('missing_next_action');
      if (nextAction?.due_at && toMs(nextAction.due_at) <= nowMs) {
        reasons.push('overdue_next_action');
      }
      if (nextAction?.status === 'blocked') reasons.push('blocked_next_action');
      if (waiting?.due) reasons.push('waiting_check_due');
      if (project.risk_level === 'high') reasons.push('high_risk_project');

      if (reasons.length === 0) return [];

      const relevantDueAt = waiting?.due
        ? waiting.nextCheckAt
        : nextAction?.due_at ?? null;

      return [{
        source: 'cpc_projects',
        projectId: project.id,
        title: project.title,
        projectType: project.project_type,
        priority: project.priority,
        stage: project.stage,
        riskLevel: project.risk_level,
        customer: customerReference(project.customer_reference_id, customersById),
        owner: profileIdentity(project.owner_profile_id, profilesById),
        reasons,
        nextAction: nextAction ? {
          id: nextAction.id,
          title: nextAction.title,
          dueAt: nextAction.due_at,
          status: nextAction.status,
          blockedReason: nextAction.blocked_reason,
        } : null,
        waiting,
        relevantDueAt,
      }];
    })
    .sort((left, right) => (
      toMs(left.relevantDueAt) - toMs(right.relevantDueAt)
      || left.projectId.localeCompare(right.projectId)
    ));

  const reportByProfile = new Map<string, TeamBoardReportRow>();
  for (const report of reports) {
    const current = reportByProfile.get(report.subject_profile_id);
    if (
      !current
      || report.period_start > current.period_start
      || (
        report.period_start === current.period_start
        && report.version > current.version
      )
    ) {
      reportByProfile.set(report.subject_profile_id, report);
    }
  }

  const activeProjectsByOwner = new Map<string, number>();
  const waitingProjectsByOwner = new Map<string, number>();
  for (const project of projects) {
    if (project.status !== 'active') continue;
    activeProjectsByOwner.set(
      project.owner_profile_id,
      (activeProjectsByOwner.get(project.owner_profile_id) ?? 0) + 1,
    );
    if (project.waiting_on !== 'none' && project.next_check_at) {
      waitingProjectsByOwner.set(
        project.owner_profile_id,
        (waitingProjectsByOwner.get(project.owner_profile_id) ?? 0) + 1,
      );
    }
  }

  const openWorkByProfile = new Map<string, TeamBoardWorkItemRow[]>();
  for (const item of workItems) {
    if (!isOpenWorkItem(item)) continue;
    const rows = openWorkByProfile.get(item.assignee_profile_id) ?? [];
    rows.push(item);
    openWorkByProfile.set(item.assignee_profile_id, rows);
  }

  const teamSupportMembers = profiles
    .filter(profile => ['admin', 'manager', 'sales'].includes(profile.role))
    .map((profile): TeamMemberSupportContext => {
      const memberWorkItems = openWorkByProfile.get(profile.id) ?? [];
      const latestReport = reportByProfile.get(profile.id) ?? null;
      return {
        profileId: profile.id,
        displayName: profile.full_name?.trim() || '未命名用户',
        department: profile.department,
        role: profile.role,
        openWorkItemCount: memberWorkItems.length,
        blockedWorkItemCount: memberWorkItems.filter(item => item.status === 'blocked').length,
        overdueWorkItemCount: memberWorkItems.filter(item => (
          !!item.due_at && toMs(item.due_at) <= nowMs
        )).length,
        activeProjectCount: activeProjectsByOwner.get(profile.id) ?? 0,
        waitingProjectCount: waitingProjectsByOwner.get(profile.id) ?? 0,
        managementDecisionCount: memberWorkItems.filter(item => (
          item.work_item_type === 'MANAGEMENT_DECISION'
        )).length,
        internalCollaborationCount: memberWorkItems.filter(item => (
          item.work_item_type === 'INTERNAL_COLLABORATION'
        )).length,
        weeklyReportContext: latestReport ? {
          state: 'confirmed_submitted',
          periodStart: latestReport.period_start,
          submittedAt: latestReport.submitted_at,
        } : null,
      };
    })
    .sort((left, right) => (
      left.displayName.localeCompare(right.displayName, 'zh-CN')
      || left.profileId.localeCompare(right.profileId)
    ));

  const activeProjectCustomerIds = new Set(
    projects
      .filter(project => project.status === 'active')
      .map(project => project.customer_reference_id),
  );
  const openCustomerFollowUps = workItems.filter(item => (
    item.work_item_type === 'FOLLOW_UP'
    && item.project_id === null
    && item.customer_reference_id !== null
    && isOpenWorkItem(item)
  ));
  const dueCustomerFollowUps = openCustomerFollowUps.filter(item => (
    !!item.due_at && toMs(item.due_at) <= nowMs
  ));

  const projectStateCounts: Record<ProjectLifecycleStatus, number> = {
    active: 0,
    paused: 0,
    won: 0,
    lost: 0,
    cancelled: 0,
  };
  let activeWaitingProjectCount = 0;
  let highRiskActiveProjectCount = 0;
  for (const project of projects) {
    projectStateCounts[project.status] += 1;
    if (project.status === 'active' && project.waiting_on !== 'none' && project.next_check_at) {
      activeWaitingProjectCount += 1;
    }
    if (project.status === 'active' && project.risk_level === 'high') {
      highRiskActiveProjectCount += 1;
    }
  }

  const meaningfulProgressCount = events.filter(event => (
    event.event_type === 'EFFECTIVE_PROGRESS_RECORDED'
  )).length;
  const orderConfirmedCount = events.filter(event => (
    event.event_type === 'ORDER_CONFIRMED'
  )).length;

  const oldCustomerRecommendations = buildOldCustomerRecommendations({
    now: input.now,
    customers,
    projects,
    workItems,
    events,
  });
  const sourceCategories = buildPhase10SourceCategoryReport({
    recommendations: oldCustomerRecommendations,
    workItems,
    events,
  });
  const eligibleKnownCustomerIds = new Set(
    oldCustomerRecommendations
      .filter(recommendation => recommendation.segment !== 'UNKNOWN')
      .map(recommendation => recommendation.customerReferenceId),
  );
  const eligibleFollowUpCustomerIds = new Set(
    openCustomerFollowUps
      .map(item => item.customer_reference_id)
      .filter((customerId): customerId is string => (
        customerId !== null && eligibleKnownCustomerIds.has(customerId)
      )),
  );
  const coverageRate = eligibleKnownCustomerIds.size === 0
    ? {
        state: 'unknown' as const,
        reason: '当前没有可用于确定性老客户周期的 active 正式客户。',
      }
    : {
        state: 'known' as const,
        value: eligibleFollowUpCustomerIds.size / eligibleKnownCustomerIds.size,
      };
  const coverageReason = 'Phase 10 已按已确认 CPC 事实启用 A/B/C 老客户建议；建议不是逾期任务，接受后才进入正式回访。';
  const conversionUnknownReason = '历史转化是否具备显式回访到项目来源尚未补齐；只统计已记录显式 provenance 的转化数，不推断历史转化率。';
  const externalReason = '外部订单、报价、回款与财务权威源尚未集成；缺失数据保持 UNKNOWN，不按 0 处理。';

  return {
    businessDate,
    generatedAt: input.now.toISOString(),
    readOnly: true,
    audience: 'manager_admin',
    sectionOrder: SECTION_ORDER,
    managementDecisions,
    commitmentExceptions,
    projectExceptions,
    teamSupport: {
      ranking: false,
      scoring: false,
      ordering: 'display_name_only',
      members: teamSupportMembers,
    },
    oldCustomerCoverage: {
      state: 'evaluated',
      reason: coverageReason,
      phase10PolicyApplied: true,
      confirmedFacts: {
        canonicalCustomerCount: customers.filter(customer => (
          customer.reference_kind === 'canonical'
        )).length,
        customersWithActiveProjectCount: activeProjectCustomerIds.size,
        openCustomerFollowUpCount: openCustomerFollowUps.length,
        dueCustomerFollowUpCount: dueCustomerFollowUps.length,
      },
      recommendations: {
        eligibleKnownCustomerCount: eligibleKnownCustomerIds.size,
        dueRecommendationCount: oldCustomerRecommendations.filter(
          recommendation => recommendation.state === 'due',
        ).length,
        suppressedActiveProjectCount: oldCustomerRecommendations.filter(
          recommendation => recommendation.state === 'suppressed_active_project',
        ).length,
        suppressedOpenFollowUpCount: oldCustomerRecommendations.filter(
          recommendation => recommendation.state === 'suppressed_open_follow_up',
        ).length,
        needsBaselineCount: oldCustomerRecommendations.filter(
          recommendation => recommendation.state === 'needs_baseline',
        ).length,
        evidenceUnknownCount: oldCustomerRecommendations.filter(
          recommendation => recommendation.state === 'evidence_unknown',
        ).length,
      },
      sourceCategories,
      coverageRate,
      conversionRate: {
        state: 'unknown',
        reason: conversionUnknownReason,
      },
    },
    businessProgress: {
      projectStateCounts,
      activeWaitingProjectCount,
      highRiskActiveProjectCount,
      submittedWeeklyReportCount: reports.length,
      confirmedOutcomeEvents: {
        meaningfulProgressCount,
        orderConfirmedCount,
      },
      externalSources: {
        orderValue: { state: 'unknown', reason: externalReason },
        quoteAcceptance: { state: 'unknown', reason: externalReason },
        payment: { state: 'unknown', reason: externalReason },
        finance: { state: 'unknown', reason: externalReason },
      },
    },
    summary: {
      managementDecisionCount: managementDecisions.length,
      commitmentExceptionCount: commitmentExceptions.length,
      projectExceptionCount: projectExceptions.length,
      teamMemberContextCount: teamSupportMembers.length,
      activeProjectCount: projectStateCounts.active,
      openWorkItemCount: workItems.filter(isOpenWorkItem).length,
    },
    unknowns: [
      {
        key: 'stale_project_evaluation',
        state: 'unknown',
        reason: '尚未批准确定性 stale threshold；本页不推断停滞项目。',
      },
      {
        key: 'historical_customer_conversion_provenance',
        state: 'unknown',
        reason: conversionUnknownReason,
      },
      {
        key: 'external_order_quote_payment_finance',
        state: 'unknown',
        reason: externalReason,
      },
    ],
  };
}
