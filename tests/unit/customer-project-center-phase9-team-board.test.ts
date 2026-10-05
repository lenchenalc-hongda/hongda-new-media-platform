import {
  buildTeamBoardSnapshot,
  canAccessTeamBoard,
  type TeamBoardCustomerRow,
  type TeamBoardEventRow,
  type TeamBoardProfileRow,
  type TeamBoardProjectRow,
  type TeamBoardReportRow,
  type TeamBoardWorkItemRow,
} from '../../src/lib/customer-projects/team-board';
import {
  getVisiblePortalGroups,
} from '../../src/lib/constants/navigation';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

console.log('\n=== Customer Project Center Phase 9 Team Board Contract ===');

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_ORG_ID = '00000000-0000-0000-0000-000000000099';
const PROJECT_DUE = '00000000-0000-0000-0000-000000000010';
const PROJECT_WAITING = '00000000-0000-0000-0000-000000000011';
const PROJECT_MISSING = '00000000-0000-0000-0000-000000000012';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000020';
const PROFILE_A = '00000000-0000-0000-0000-000000000030';
const PROFILE_B = '00000000-0000-0000-0000-000000000031';

const projects: TeamBoardProjectRow[] = [
  {
    id: PROJECT_DUE,
    org_id: ORG_ID,
    customer_reference_id: CUSTOMER_ID,
    title: '逾期下一步项目',
    project_type: 'transfer_film',
    status: 'active',
    stage: 'quotation',
    waiting_on: 'none',
    next_check_at: null,
    risk_level: null,
    priority: 'high',
    owner_profile_id: PROFILE_A,
    updated_at: '2026-10-04T01:00:00.000Z',
  },
  {
    id: PROJECT_WAITING,
    org_id: ORG_ID,
    customer_reference_id: CUSTOMER_ID,
    title: '等待检查项目',
    project_type: 'uv',
    status: 'active',
    stage: 'customer_confirmation',
    waiting_on: 'customer',
    next_check_at: '2026-10-04T01:00:00.000Z',
    risk_level: 'high',
    priority: 'critical',
    owner_profile_id: PROFILE_B,
    updated_at: '2026-10-04T01:00:00.000Z',
  },
  {
    id: PROJECT_MISSING,
    org_id: ORG_ID,
    customer_reference_id: CUSTOMER_ID,
    title: '缺少下一步项目',
    project_type: 'equipment',
    status: 'active',
    stage: 'solution_definition',
    waiting_on: 'none',
    next_check_at: null,
    risk_level: null,
    priority: 'medium',
    owner_profile_id: PROFILE_A,
    updated_at: '2026-10-04T01:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000019',
    org_id: OTHER_ORG_ID,
    customer_reference_id: '00000000-0000-0000-0000-000000000029',
    title: '跨组织项目',
    project_type: 'other',
    status: 'active',
    stage: 'qualification',
    waiting_on: 'none',
    next_check_at: null,
    risk_level: null,
    priority: 'critical',
    owner_profile_id: '00000000-0000-0000-0000-000000000039',
    updated_at: '2026-10-04T01:00:00.000Z',
  },
];

const workItems: TeamBoardWorkItemRow[] = [
  {
    id: '00000000-0000-0000-0000-000000000040',
    org_id: ORG_ID,
    customer_reference_id: null,
    project_id: null,
    work_item_type: 'MANAGEMENT_DECISION',
    title: '确认交付优先级',
    assignee_profile_id: PROFILE_A,
    created_by_profile_id: PROFILE_B,
    due_at: '2026-10-04T01:00:00.000Z',
    status: 'pending',
    priority: 'critical',
    blocked_reason: null,
    updated_at: '2026-10-04T01:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000041',
    org_id: ORG_ID,
    customer_reference_id: CUSTOMER_ID,
    project_id: null,
    work_item_type: 'CUSTOMER_COMMITMENT',
    title: '回复客户交期',
    assignee_profile_id: PROFILE_A,
    created_by_profile_id: PROFILE_A,
    due_at: '2026-10-04T01:00:00.000Z',
    status: 'in_progress',
    priority: 'high',
    blocked_reason: null,
    updated_at: '2026-10-04T01:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000042',
    org_id: ORG_ID,
    customer_reference_id: CUSTOMER_ID,
    project_id: null,
    work_item_type: 'CUSTOMER_COMMITMENT',
    title: '未来客户承诺',
    assignee_profile_id: PROFILE_B,
    created_by_profile_id: PROFILE_B,
    due_at: '2026-10-05T01:00:00.000Z',
    status: 'pending',
    priority: 'high',
    blocked_reason: null,
    updated_at: '2026-10-04T01:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000043',
    org_id: ORG_ID,
    customer_reference_id: null,
    project_id: PROJECT_DUE,
    work_item_type: 'NEXT_ACTION',
    title: '发送正式报价',
    assignee_profile_id: PROFILE_A,
    created_by_profile_id: PROFILE_A,
    due_at: '2026-10-03T01:00:00.000Z',
    status: 'blocked',
    priority: 'high',
    blocked_reason: '等待成本确认',
    updated_at: '2026-10-04T01:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000044',
    org_id: ORG_ID,
    customer_reference_id: CUSTOMER_ID,
    project_id: null,
    work_item_type: 'FOLLOW_UP',
    title: '正式客户回访',
    assignee_profile_id: PROFILE_B,
    created_by_profile_id: PROFILE_A,
    due_at: '2026-10-04T01:00:00.000Z',
    status: 'pending',
    priority: 'medium',
    blocked_reason: null,
    updated_at: '2026-10-04T01:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000049',
    org_id: OTHER_ORG_ID,
    customer_reference_id: null,
    project_id: '00000000-0000-0000-0000-000000000019',
    work_item_type: 'MANAGEMENT_DECISION',
    title: '跨组织决策',
    assignee_profile_id: '00000000-0000-0000-0000-000000000039',
    created_by_profile_id: '00000000-0000-0000-0000-000000000039',
    due_at: '2026-10-04T01:00:00.000Z',
    status: 'pending',
    priority: 'critical',
    blocked_reason: null,
    updated_at: '2026-10-04T01:00:00.000Z',
  },
];

const customers: TeamBoardCustomerRow[] = [
  {
    id: CUSTOMER_ID,
    org_id: ORG_ID,
    reference_kind: 'canonical',
    display_name_snapshot: '测试客户',
    status: 'active',
    updated_at: '2026-10-04T01:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000029',
    org_id: OTHER_ORG_ID,
    reference_kind: 'canonical',
    display_name_snapshot: '跨组织客户',
    status: 'active',
    updated_at: '2026-10-04T01:00:00.000Z',
  },
];

const profiles: TeamBoardProfileRow[] = [
  {
    id: PROFILE_B,
    org_id: ORG_ID,
    full_name: 'B Member',
    department: 'Sales',
    role: 'sales',
    is_active: true,
  },
  {
    id: PROFILE_A,
    org_id: ORG_ID,
    full_name: 'A Manager',
    department: 'Management',
    role: 'manager',
    is_active: true,
  },
  {
    id: '00000000-0000-0000-0000-000000000039',
    org_id: OTHER_ORG_ID,
    full_name: 'Other Org',
    department: null,
    role: 'manager',
    is_active: true,
  },
];

const reports: TeamBoardReportRow[] = [
  {
    id: '00000000-0000-0000-0000-000000000050',
    org_id: ORG_ID,
    subject_profile_id: PROFILE_B,
    period_type: 'weekly',
    period_start: '2026-09-28',
    status: 'submitted',
    submitted_at: '2026-10-04T02:00:00.000Z',
    version: 2,
    updated_at: '2026-10-04T02:00:00.000Z',
  },
];

const events: TeamBoardEventRow[] = [
  {
    id: '00000000-0000-0000-0000-000000000060',
    org_id: ORG_ID,
    project_id: PROJECT_DUE,
    customer_reference_id: CUSTOMER_ID,
    event_type: 'EFFECTIVE_PROGRESS_RECORDED',
    occurred_at: '2026-10-04T01:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000061',
    org_id: OTHER_ORG_ID,
    project_id: '00000000-0000-0000-0000-000000000019',
    customer_reference_id: null,
    event_type: 'ORDER_CONFIRMED',
    occurred_at: '2026-10-04T01:00:00.000Z',
  },
];

const snapshot = buildTeamBoardSnapshot({
  now: new Date('2026-10-04T04:00:00.000Z'),
  orgId: ORG_ID,
  projects,
  workItems,
  customers,
  profiles,
  reports,
  events,
});

assert(canAccessTeamBoard('admin'), 'admin can access the Team Board contract');
assert(canAccessTeamBoard('manager'), 'manager can access the Team Board contract');
assert(!canAccessTeamBoard('sales'), 'sales cannot access Team Board contract');
assert(!canAccessTeamBoard('operator'), 'operator cannot access Team Board contract');
assert(!canAccessTeamBoard(null), 'missing role fails closed');

function visibleTeamItem(canAccessTeam: boolean) {
  return getVisiblePortalGroups({
    projectReviewCenterEnabled: true,
    customerProjectCenterEnabled: true,
    canAccessCustomerProjectCenter: true,
    canAccessCustomerProjectTeam: canAccessTeam,
  })
    .find(group => group.id === 'sales')
    ?.items.find(item => item.path === '/customer-projects/team') ?? null;
}

assert(
  visibleTeamItem(true)?.disabled === false,
  'manager/admin navigation exposes an enabled Team Board item',
);
assert(
  visibleTeamItem(false) === null,
  'sales navigation omits the Team Board item instead of disabling it',
);

assert(
  snapshot.sectionOrder[0] === 'management_decisions',
  'management decisions are the first Team Board section',
);
assert(
  snapshot.managementDecisions.length === 1
    && snapshot.managementDecisions[0].source === 'cpc_work_items'
    && snapshot.managementDecisions[0].id === workItems[0].id,
  'management decisions come only from open formal MANAGEMENT_DECISION rows',
);
assert(
  !snapshot.managementDecisions.some(item => item.title === '跨组织决策'),
  'cross-org management decisions fail closed',
);

assert(
  snapshot.commitmentExceptions.length === 1
    && snapshot.commitmentExceptions[0].dueState === 'due_now',
  'only due/overdue formal customer commitments become commitment exceptions',
);
assert(
  !snapshot.commitmentExceptions.some(item => item.title === '未来客户承诺'),
  'unapproved due-soon window does not turn future commitments into exceptions',
);

const dueProjectException = snapshot.projectExceptions.find(
  item => item.projectId === PROJECT_DUE,
);
assert(
  !!dueProjectException
    && dueProjectException.reasons.includes('overdue_next_action')
    && dueProjectException.reasons.includes('blocked_next_action'),
  'project exceptions use confirmed NEXT_ACTION due/status fields',
);
const waitingProjectException = snapshot.projectExceptions.find(
  item => item.projectId === PROJECT_WAITING,
);
assert(
  !!waitingProjectException
    && waitingProjectException.reasons.includes('waiting_check_due')
    && waitingProjectException.reasons.includes('high_risk_project'),
  'waiting/check and explicit risk facts are represented without a new threshold',
);
assert(
  snapshot.projectExceptions.some(item =>
    item.projectId === PROJECT_MISSING
    && item.reasons.includes('missing_next_action')),
  'active Project without NEXT_ACTION or valid waiting is a deterministic exception',
);
assert(
  !snapshot.projectExceptions.some(item => item.projectId.includes('0000000019')),
  'cross-org projects fail closed',
);
assert(
  snapshot.unknowns.some(item =>
    item.key === 'stale_project_evaluation'
    && item.reason.includes('stale threshold')),
  'stale project inference remains unknown until a threshold is approved',
);

assert(
  snapshot.teamSupport.ranking === false
    && snapshot.teamSupport.scoring === false
    && snapshot.teamSupport.ordering === 'display_name_only',
  'team support context has no ranking or synthetic score',
);
assert(
  snapshot.teamSupport.members.map(member => member.displayName).join('|')
    === 'A Manager|B Member',
  'team support context is ordered by display name only',
);
assert(
  snapshot.teamSupport.members.every(member =>
    !('score' in member)
    && !('rank' in member)
    && !('performance' in member)),
  'team support rows contain no score/rank/performance fields',
);

assert(
  snapshot.oldCustomerCoverage.state === 'evaluated'
    && snapshot.oldCustomerCoverage.phase10PolicyApplied === true
    && snapshot.oldCustomerCoverage.recommendations.dueRecommendationCount === 0
    && snapshot.oldCustomerCoverage.conversionRate.state === 'unknown'
    && snapshot.oldCustomerCoverage.conversionRate.reason
      .includes('atomic trusted conversion provenance is not yet implemented'),
  'old-customer coverage applies Phase 10 without inventing due work or conversion',
);
assert(
  snapshot.oldCustomerCoverage.confirmedFacts.canonicalCustomerCount === 1
    && snapshot.oldCustomerCoverage.confirmedFacts.openCustomerFollowUpCount === 1,
  'old-customer section exposes confirmed facts already in CPC',
);
assert(
  snapshot.oldCustomerCoverage.sourceCategories.old_customer_reactivation.state === 'known'
    && snapshot.oldCustomerCoverage.sourceCategories.old_customer_reactivation.value
      .explicitFollowUpToProjectConversion.state === 'unknown'
    && snapshot.oldCustomerCoverage.sourceCategories.new_media_lead.state === 'unknown'
    && snapshot.oldCustomerCoverage.sourceCategories.proactive_outbound.state === 'unknown',
  'Phase 10 source buckets stay separate with UNKNOWN conversion and external categories',
);
assert(
  snapshot.businessProgress.projectStateCounts.active === 3
    && snapshot.businessProgress.submittedWeeklyReportCount === 1
    && snapshot.businessProgress.confirmedOutcomeEvents.meaningfulProgressCount === 1
    && snapshot.businessProgress.confirmedOutcomeEvents.orderConfirmedCount === 0,
  'business progress uses same-org confirmed CPC facts only',
);
assert(
  snapshot.businessProgress.externalSources.orderValue.state === 'unknown'
    && snapshot.businessProgress.externalSources.quoteAcceptance.state === 'unknown'
    && snapshot.businessProgress.externalSources.payment.state === 'unknown'
    && snapshot.businessProgress.externalSources.finance.state === 'unknown',
  'missing external order/finance facts stay unknown rather than zero',
);
assert(
  snapshot.summary.managementDecisionCount === 1
    && snapshot.summary.commitmentExceptionCount === 1
    && snapshot.summary.projectExceptionCount === 3,
  'summary counts derive from confirmed exception projections',
);

const serialized = JSON.stringify(snapshot);
for (const forbidden of [
  'localStorage',
  'site_data',
  '/api/data',
  'message_count',
  'click_count',
  'attitude',
]) {
  assert(!serialized.includes(forbidden), 'Team Board snapshot avoids: ' + forbidden);
}

console.log('Phase 9 team board tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);

// Phase 10 contract coverage is executed through the existing Phase 9 CI step.
await import('./customer-project-center-phase10.test');
