import fs from 'node:fs';
import {
  CUSTOMER_PROJECT_APP_ROLES,
  CUSTOMER_PROJECT_DOMAIN_ACTIONS,
  CUSTOMER_PROJECT_DOMAIN_RESOURCES,
  canAccessCustomerProjectDomain,
  canMutateCustomerReference,
  type CustomerProjectResourceRelation,
} from '../../src/lib/customer-projects/domain';
import {
  canAccessPage,
  getPageSlugFromRoute,
  type AuthUser,
  type PageSlug,
} from '../../src/lib/auth/roles';
import {
  getVisiblePortalGroups,
} from '../../src/lib/constants/navigation';
import {
  expectedVersionSchema,
} from '../../src/lib/customer-projects/schemas';
import {
  mapCpcRpcResult,
} from '../../src/lib/customer-projects/api';
import {
  CPC_INTEGRATION_DOMAIN_IDS,
  CPC_INTEGRATION_REGISTRY,
  PHASE_11_REPOSITORY_READINESS,
  canReadIntegrationStatus,
  getCpcIntegrationRegistryEntry,
  summariseCpcIntegrationStatuses,
} from '../../src/lib/customer-projects/integration-registry';
import {
  createExternalWorkshopReadAdapter,
} from '../../src/lib/customer-projects/external-workshop-contracts';
import {
  readCpcIntegrationStatus,
} from '../../src/lib/customer-projects/integration-status-server';
import {
  OLD_CUSTOMER_CADENCE_DAYS,
  buildOldCustomerRecommendation,
} from '../../src/lib/customer-projects/old-customer-proactive';
import {
  buildWorkbenchSnapshot,
} from '../../src/lib/customer-projects/read-models';
import {
  knownMetricValue,
} from '../../src/lib/customer-projects/reports';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

function read(path: string): string {
  return fs.readFileSync(path, 'utf8');
}

function walkFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = dir + '/' + entry.name;
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

function functionBlock(sql: string, name: string): string {
  const marker = 'CREATE OR REPLACE FUNCTION public.' + name;
  const start = sql.indexOf(marker);
  if (start < 0) return '';
  const bodyStart = sql.indexOf('AS $$', start);
  const end = sql.indexOf('\n$$;', bodyStart);
  if (bodyStart < 0 || end < 0) return '';
  return sql.slice(start, end + 4);
}

function user(role: AuthUser['role']): AuthUser {
  return {
    id: 'profile-' + role,
    full_name: role,
    email: role + '@example.test',
    role,
    org_id: 'org-pilot',
  };
}

function relations(
  ...values: CustomerProjectResourceRelation[]
): CustomerProjectResourceRelation[] {
  return values;
}

console.log('\n=== Customer Project Center Phase 12 QA and Pilot Readiness ===');

// ---------------------------------------------------------------------------
// Five-role route and resource matrix
// ---------------------------------------------------------------------------

const routeExpectations: Array<{
  role: AuthUser['role'];
  page: PageSlug;
  allowed: boolean;
}> = [
  { role: 'admin', page: 'customer_project_center', allowed: true },
  { role: 'admin', page: 'customer_project_center_team', allowed: true },
  { role: 'admin', page: 'customer_project_center_settings', allowed: true },
  { role: 'manager', page: 'customer_project_center', allowed: true },
  { role: 'manager', page: 'customer_project_center_team', allowed: true },
  { role: 'manager', page: 'customer_project_center_settings', allowed: false },
  { role: 'sales', page: 'customer_project_center', allowed: true },
  { role: 'sales', page: 'customer_project_center_team', allowed: false },
  { role: 'sales', page: 'customer_project_center_settings', allowed: false },
  { role: 'operator', page: 'customer_project_center', allowed: false },
  { role: 'operator', page: 'customer_project_center_team', allowed: false },
  { role: 'operator', page: 'customer_project_center_settings', allowed: false },
  { role: 'viewer', page: 'customer_project_center', allowed: false },
  { role: 'viewer', page: 'customer_project_center_team', allowed: false },
  { role: 'viewer', page: 'customer_project_center_settings', allowed: false },
];

for (const expectation of routeExpectations) {
  assert(
    canAccessPage(user(expectation.role), expectation.page) === expectation.allowed,
    'role route access: ' + expectation.role + '/' + expectation.page,
  );
}

assert(
  getPageSlugFromRoute('/customer-projects') === 'customer_project_center'
    && getPageSlugFromRoute('/customer-projects/team') === 'customer_project_center_team'
    && getPageSlugFromRoute('/customer-projects/settings') === 'customer_project_center_settings',
  'all CPC routes resolve before the shared portal page slug',
);

const forgedSalesNavigation = getVisiblePortalGroups({
  projectReviewCenterEnabled: true,
  customerProjectCenterEnabled: true,
  canAccessCustomerProjectCenter: true,
  canAccessCustomerProjectTeam: true,
  canAccessCustomerProjectSettings: true,
});
const forgedSalesItems = forgedSalesNavigation
  .find(group => group.id === 'sales')
  ?.items ?? [];
assert(
  forgedSalesItems.some(item => item.path === '/customer-projects/team')
    && forgedSalesItems.some(item => item.path === '/customer-projects/settings'),
  'role matrix test can construct visible navigation flags',
);
assert(
  !canAccessPage(user('sales'), 'customer_project_center_team')
    && !canAccessPage(user('sales'), 'customer_project_center_settings'),
  'visible navigation is not treated as authorization',
);

for (const appRole of CUSTOMER_PROJECT_APP_ROLES) {
  assert(
    !canAccessCustomerProjectDomain({
      appRole,
      sameOrg: false,
      relations: relations('none'),
      resource: 'project',
      action: 'read',
    }),
    appRole + ' cross-org project read denied',
  );
}

for (const appRole of ['operator', 'viewer'] as const) {
  for (const resource of CUSTOMER_PROJECT_DOMAIN_RESOURCES) {
    for (const action of CUSTOMER_PROJECT_DOMAIN_ACTIONS) {
      assert(
        !canAccessCustomerProjectDomain({
          appRole,
          sameOrg: true,
          relations: relations('none'),
          resource,
          action,
        }),
        appRole + ' has no CPC domain access: ' + resource + '/' + action,
      );
    }
  }
}

assert(
  !canAccessCustomerProjectDomain({
    appRole: 'sales',
    sameOrg: true,
    relations: relations('unrelated'),
    resource: 'project',
    action: 'read',
  }),
  'unrelated sales resource denied',
);
assert(
  canAccessCustomerProjectDomain({
    appRole: 'sales',
    sameOrg: true,
    relations: relations('owner'),
    resource: 'project',
    action: 'update',
  }),
  'sales project owner can update owned project',
);
assert(
  !canAccessCustomerProjectDomain({
    appRole: 'sales',
    sameOrg: true,
    relations: relations('collaborator'),
    resource: 'project',
    action: 'update',
  }),
  'sales collaborator cannot change project core fields',
);
assert(
  canAccessCustomerProjectDomain({
    appRole: 'sales',
    sameOrg: true,
    relations: relations('collaborator'),
    resource: 'work_item',
    action: 'create',
  })
    && canAccessCustomerProjectDomain({
      appRole: 'sales',
      sameOrg: true,
      relations: relations('assignee'),
      resource: 'work_item',
      action: 'update',
    }),
  'sales collaborator/assignee work-item scope is explicit',
);
assert(
  !canAccessCustomerProjectDomain({
    appRole: 'sales',
    sameOrg: true,
    relations: relations('collaborator'),
    resource: 'ai_draft',
    action: 'accept',
  })
    && canAccessCustomerProjectDomain({
      appRole: 'sales',
      sameOrg: true,
      relations: relations('owner'),
      resource: 'ai_draft',
      action: 'accept',
    }),
  'AI draft acceptance is relation-authorized',
);
assert(
  !canAccessCustomerProjectDomain({
    appRole: 'admin',
    sameOrg: true,
    relations: relations('none'),
    resource: 'project_event',
    action: 'update',
  })
    && !canAccessCustomerProjectDomain({
      appRole: 'admin',
      sameOrg: true,
      relations: relations('none'),
      resource: 'report',
      action: 'update',
      reportStatus: 'submitted',
    }),
  'admin cannot bypass append-only events or submitted reports',
);
assert(
  canMutateCustomerReference({
    appRole: 'manager',
    sameOrg: true,
    relations: relations('none'),
    intent: 'map_to_canonical',
  })
    && !canMutateCustomerReference({
      appRole: 'sales',
      sameOrg: true,
      relations: relations('creator'),
      intent: 'map_to_canonical',
    }),
  'canonical customer mapping remains manager/admin authority',
);

const middleware = read('src/middleware.ts');
assert(
  middleware.includes('getPageSlugFromRoute(pathname)')
    && middleware.includes('canAccessPage(authUser, pageSlug)')
    && middleware.includes("pathname.startsWith('/customer-projects')"),
  'middleware performs direct CPC page authorization and feature gating',
);
assert(
  middleware.includes('SELF_AUTHENTICATED_API_PREFIXES')
    && middleware.includes("'/api/customer-projects'")
    && middleware.includes('SELF_AUTHENTICATED_API_PREFIXES.some'),
  'CPC API requests avoid duplicate middleware profile resolution',
);

const cpcApiRoutes = walkFiles('src/app/api/customer-projects')
  .filter(path => path.endsWith('/route.ts'));
assert(cpcApiRoutes.length > 0, 'CPC API route inventory is non-empty');
for (const routePath of cpcApiRoutes) {
  const source = read(routePath);
  assert(
    source.includes('resolveCpcProfile')
      || source.includes('runCpcMutation')
      || source.includes('resolveReportNarrativeSession')
      || source.includes('readTeamBoardSnapshot'),
    routePath + ' self-authenticates before CPC data access',
  );
}

const workbenchRoute = read('src/app/api/customer-projects/workbench/route.ts');
const projectsRoute = read('src/app/api/customer-projects/projects/route.ts');
assert(
  workbenchRoute.includes('const [projectsResult, workItemsResult] = await Promise.all(['),
  'Workbench performs independent project/work-item reads concurrently',
);
assert(
  projectsRoute.includes('const [workItems, customers, owners] = await Promise.all([')
    && projectsRoute.includes(".rpc('cpc_project_owner_names'"),
  'Project list performs work-item, customer, and authorized owner-name reads concurrently',
);

const detailRoutes = [
  'src/app/api/customer-projects/projects/[id]/route.ts',
  'src/app/api/customer-projects/customers/[id]/route.ts',
];
for (const routePath of detailRoutes) {
  const source = read(routePath);
  assert(
    source.includes('resolveCpcProfile')
      && source.includes(".eq('org_id', profile.orgId)"),
    routePath + ' resolves trusted profile and scopes reads by organization',
  );
}

// ---------------------------------------------------------------------------
// Stale version, duplicate, replay, and concurrency contracts
// ---------------------------------------------------------------------------

for (const code of [
  'VERSION_CONFLICT',
  'DUPLICATE_REFERENCE',
  'DUPLICATE_FOLLOW_UP',
  'REPORT_ALREADY_SUBMITTED',
  'REPORT_DRAFT_EXISTS',
]) {
  assert(
    mapCpcRpcResult('RECORD_PROGRESS', {
      data: { ok: false, code },
    }).status === 409,
    code + ' maps to conflict without a partial success',
  );
}
assert(
  !expectedVersionSchema.safeParse(0).success
    && expectedVersionSchema.safeParse(1).success,
  'expected version is a positive integer',
);

const phase5bSql = read(
  'supabase/migrations/20261002024500_customer_project_center_phase5b_mutation_rpcs.sql',
);
const phase5dSql = read(
  'supabase/migrations/20261002033500_customer_project_center_phase5d_progress_waiting_event.sql',
);
const phase5fSql = read(
  'supabase/migrations/20261002050000_customer_project_center_phase5f_customer_followup.sql',
);
const phase6bSql = read(
  'supabase/migrations/20261002065000_customer_project_center_phase6b_reschedule_rpc.sql',
);
const phase6cSql = read(
  'supabase/migrations/20261002073000_customer_project_center_phase6c_ai_drafts.sql',
);
const phase7aSql = read(
  'supabase/migrations/20261002090000_customer_project_center_phase7a_reports.sql',
);
const phase12ProjectReplaySql = read(
  'supabase/migrations/20261007020000_customer_project_center_project_create_replay_guard.sql',
);

const versionedMutationBlocks = [
  ['cpc_record_progress', functionBlock(phase5dSql, 'cpc_record_progress')],
  ['cpc_set_waiting_state', functionBlock(phase5bSql, 'cpc_set_waiting_state')],
  ['cpc_transition_work_item', functionBlock(phase5bSql, 'cpc_transition_work_item')],
  ['cpc_reschedule_work_item', functionBlock(phase6bSql, 'cpc_reschedule_work_item')],
  ['cpc_accept_ai_draft', functionBlock(phase6cSql, 'cpc_accept_ai_draft')],
  ['cpc_submit_report', functionBlock(phase7aSql, 'cpc_submit_report')],
  ['cpc_create_report_correction', functionBlock(phase7aSql, 'cpc_create_report_correction')],
] as const;

for (const [name, block] of versionedMutationBlocks) {
  assert(
    block.includes('p_expected_version')
      && block.includes('VERSION_CONFLICT')
      && block.includes('FOR UPDATE'),
    name + ' is row-locked and expected-version protected',
  );
}

assert(
  functionBlock(
    phase5bSql,
    'cpc_create_provisional_customer_reference',
  ).includes('DUPLICATE_REFERENCE'),
  'duplicate provisional customer reference is explicitly rejected',
);
assert(
  functionBlock(phase5fSql, 'cpc_record_customer_follow_up')
    .includes('DUPLICATE_FOLLOW_UP')
    && phase5fSql.includes('FOR UPDATE'),
  'concurrent customer follow-up attempts cannot create a duplicate open follow-up',
);
assert(
  phase7aSql.includes('uq_cpc_report_revision')
    && phase7aSql.includes('uq_cpc_report_active_draft')
    && phase7aSql.includes('REPORT_DRAFT_EXISTS'),
  'report revision/draft uniqueness and duplicate correction guard exist',
);
assert(
  functionBlock(phase6cSql, 'cpc_accept_ai_draft')
    .includes("v_draft.status <> 'draft'"),
  'accepted/replayed AI draft cannot be formalized twice',
);

const projectCreateReplayBlock = functionBlock(
  phase12ProjectReplaySql,
  'cpc_create_project',
);
assert(
  phase12ProjectReplaySql.includes('uq_cpc_project_created_request_replay')
    && phase12ProjectReplaySql.includes("action = 'PROJECT_CREATED'")
    && phase12ProjectReplaySql.includes('request_id IS NOT NULL'),
  'project creation has a database-level replay uniqueness guard',
);
assert(
  projectCreateReplayBlock.includes('p_request_id IS NOT NULL')
    && projectCreateReplayBlock.includes("al.action = 'PROJECT_CREATED'")
    && projectCreateReplayBlock.includes('al.request_id = p_request_id')
    && projectCreateReplayBlock.includes('v_replay_project_id')
    && projectCreateReplayBlock.includes('WHEN unique_violation THEN'),
  'replayed/concurrent project creation returns the original formal result',
);

// ---------------------------------------------------------------------------
// UNKNOWN semantics and old-customer policy
// ---------------------------------------------------------------------------

assert(
  OLD_CUSTOMER_CADENCE_DAYS.A === 30
    && OLD_CUSTOMER_CADENCE_DAYS.B === 60
    && OLD_CUSTOMER_CADENCE_DAYS.C === 90,
  'approved old-customer cadence remains 30/60/90 suggestions',
);
const unknownRecommendation = buildOldCustomerRecommendation({
  now: new Date('2026-10-06T00:00:00.000Z'),
  customer: {
    id: 'customer-unknown',
    reference_kind: 'canonical',
    status: 'active',
  },
  projects: [],
  workItems: [],
  events: [],
});
assert(
  unknownRecommendation.segment === 'UNKNOWN'
    && unknownRecommendation.cadenceDays === null
    && unknownRecommendation.overdue === false
    && unknownRecommendation.countsAsKpi === false
    && unknownRecommendation.formalWorkItemId === null,
  'missing old-customer evidence remains UNKNOWN and is not a KPI',
);

assert(
  getCpcIntegrationRegistryEntry('customer_master').status === 'external_contract_pending'
    && getCpcIntegrationRegistryEntry('customer_ownership').status === 'external_contract_pending'
    && getCpcIntegrationRegistryEntry('receipt_payment').status === 'external_contract_pending'
    && getCpcIntegrationRegistryEntry('orders').status === 'current_artifact_only'
    && getCpcIntegrationRegistryEntry('quotations').status === 'current_artifact_only'
    && getCpcIntegrationRegistryEntry('leads').status === 'unknown',
  'external customer/ownership/payment/order/quotation/lead facts stay non-fabricated',
);
assert(
  getCpcIntegrationRegistryEntry('customer_master').writeCapability === 'external_authority_only'
    && getCpcIntegrationRegistryEntry('customer_ownership').writeCapability === 'external_authority_only'
    && getCpcIntegrationRegistryEntry('receipt_payment').writeCapability === 'external_authority_only'
    && getCpcIntegrationRegistryEntry('review_center').writeCapability === 'internal_read_only'
    && getCpcIntegrationRegistryEntry('knowledge').writeCapability === 'internal_read_only',
  'external SoT and internal reuse write boundaries remain read-only',
);
assert(
  CPC_INTEGRATION_REGISTRY.length === CPC_INTEGRATION_DOMAIN_IDS.length
    && CPC_INTEGRATION_REGISTRY.every(entry => entry.freshness.lastSyncedAt === null),
  'registry covers every Phase 11 domain without fabricating a sync time',
);
const integrationSummary = summariseCpcIntegrationStatuses();
assert(
  integrationSummary.connected === 0
    && integrationSummary.unknown === 1
    && integrationSummary.external_contract_pending === 3,
  'integration summary reports pending and unknown availability',
);
assert(
  canReadIntegrationStatus('admin')
    && !canReadIntegrationStatus('manager')
    && !canReadIntegrationStatus('sales')
    && !canReadIntegrationStatus('operator')
    && !canReadIntegrationStatus('viewer'),
  'integration status remains admin-only',
);

const deniedIntegrationStatus = await readCpcIntegrationStatus(
  {},
  { id: 'profile-manager', orgId: 'org-pilot', role: 'manager' },
);
assert(
  !deniedIntegrationStatus.ok && deniedIntegrationStatus.status === 403,
  'server integration-status helper fails closed for manager',
);

const externalAdapter = createExternalWorkshopReadAdapter();
const externalCustomer = await externalAdapter.readCustomerByStableId({
  externalCustomerId: 'PILOT-NONPROD-CUSTOMER',
});
const externalOwnership = await externalAdapter.readCustomerOwnershipByStableCustomerId({
  externalCustomerId: 'PILOT-NONPROD-CUSTOMER',
});
const externalReceipt = await externalAdapter.readReceiptByStableId({
  externalReceiptId: 'PILOT-NONPROD-RECEIPT',
});
const externalEmployee = await externalAdapter.resolveProfileByExternalEmployeeId({
  externalEmployeeId: 'PILOT-NONPROD-EMPLOYEE',
  orgId: 'org-pilot',
});
assert(
  !externalCustomer.ok
    && externalCustomer.code === 'EXTERNAL_CONTRACT_PENDING'
    && !externalOwnership.ok
    && externalOwnership.code === 'EXTERNAL_CONTRACT_PENDING'
    && !externalReceipt.ok
    && externalReceipt.code === 'EXTERNAL_CONTRACT_PENDING'
    && !externalEmployee.ok
    && externalEmployee.code === 'EXTERNAL_CONTRACT_PENDING',
  'all pending external reads return pending/unknown rather than values',
);
assert(
  knownMetricValue(
    { orderConfirmedCount: { state: 'unknown', reason: 'not integrated' } },
    'orderConfirmedCount',
  ) === null
    && knownMetricValue(
      { orderConfirmedCount: { state: 'known', value: 0 } },
      'orderConfirmedCount',
    ) === 0,
  'UNKNOWN metric is distinct from a confirmed zero',
);
assert(
  PHASE_11_REPOSITORY_READINESS.phase12InternalUiQaReady === true
    && PHASE_11_REPOSITORY_READINESS.fullLiveIntegrationReady === false,
  'Phase 12 repository QA readiness is distinct from live integration',
);

// ---------------------------------------------------------------------------
// Empty, partial, loading, denied, and mobile-critical UI states
// ---------------------------------------------------------------------------

const emptySnapshot = buildWorkbenchSnapshot({
  now: new Date('2026-10-06T02:00:00.000Z'),
  projects: [],
  workItems: [],
  customers: [],
});
assert(
  emptySnapshot.queue.length === 0
    && emptySnapshot.reminders.length === 0
    && emptySnapshot.summary.queueCount === 0
    && emptySnapshot.summary.formalReminderCount === 0,
  'empty Workbench snapshot is explicit and does not synthesize work',
);

const prioritySnapshot = buildWorkbenchSnapshot({
  now: new Date('2026-10-06T02:00:00.000Z'),
  projects: [{
    id: 'project-priority',
    customer_reference_id: 'customer-priority',
    title: 'Synthetic priority Project',
    project_type: 'transfer_film',
    status: 'active',
    stage: 'qualification',
    waiting_on: 'none',
    next_check_at: null,
    risk_level: null,
    priority: 'high',
    owner_profile_id: 'profile-sales',
    version: 1,
    updated_at: '2026-10-06T00:00:00.000Z',
  }],
  workItems: [{
    id: 'work-priority',
    customer_reference_id: 'customer-priority',
    project_id: 'project-priority',
    work_item_type: 'CUSTOMER_COMMITMENT',
    title: 'Synthetic customer commitment',
    assignee_profile_id: 'profile-sales',
    due_at: '2026-10-05T02:00:00.000Z',
    status: 'pending',
    priority: 'critical',
    blocked_reason: null,
    version: 1,
    updated_at: '2026-10-06T00:00:00.000Z',
  }],
  customers: [{
    id: 'customer-priority',
    display_name_snapshot: 'PILOT-NONPROD Customer',
  }],
});
assert(
  prioritySnapshot.queue.some(item =>
    item.id === 'work-priority'
    && item.priorityClass === 'P0'
    && item.reason === 'customer_commitment_due',
  ),
  'Workbench priority queue uses confirmed due work rather than activity count',
);

const loadingStateFiles = [
  'src/app/customer-projects/reports/page.tsx',
  'src/app/customer-projects/customers/[id]/page.tsx',
  'src/app/customer-projects/projects/[id]/page.tsx',
  'src/components/customer-projects/IntegrationStatusPanel.tsx',
];
for (const pagePath of loadingStateFiles) {
  const source = read(pagePath);
  assert(
    source.includes('loading')
      && source.includes('401')
      && source.includes('403')
      && (
        source.includes('EmptyState')
        || source.includes('snapshot')
        || source.includes('集成状态')
      ),
    pagePath + ' covers loading, authentication, denied, and empty/error states',
  );
}

const authPerfTiming = read('src/lib/auth/performance.ts');
const currentUserAuth = read('src/lib/auth/current-user.ts');
assert(
  authPerfTiming.includes("console.info('[auth-perf]'")
    && authPerfTiming.includes('totalMs')
    && authPerfTiming.includes("'middleware-cpc' | 'server-readonly'")
    && !authPerfTiming.includes('email')
    && !authPerfTiming.includes('userId')
    && !authPerfTiming.includes('profileId')
    && !authPerfTiming.includes('orgId'),
  'auth performance logs contain timing/outcome only and no identity fields',
);
assert(
  middleware.includes("scope: 'middleware-cpc'")
    && middleware.includes("pathname.startsWith('/customer-projects')")
    && currentUserAuth.includes("scope: 'server-readonly'")
    && currentUserAuth.includes('logAuthPerformance'),
  'CPC middleware and server read-only authentication are independently timed',
);

const perfTiming = read('src/lib/customer-projects/performance.ts');
const serverReadsWithTiming = read('src/lib/customer-projects/server-reads.ts');
assert(
  perfTiming.includes("console.info('[cpc-perf]'")
    && perfTiming.includes('totalMs')
    && perfTiming.includes('stages')
    && perfTiming.includes('counts')
    && !perfTiming.includes('customerName')
    && !perfTiming.includes('customerId')
    && !perfTiming.includes('projectId'),
  'CPC server timing logs are structured and do not include business identifiers',
);
for (const view of ['workbench', 'projects', 'customers', 'tasks']) {
  assert(
    serverReadsWithTiming.includes("createCpcReadTiming('" + view + "')"),
    'CPC server-first read is instrumented: ' + view,
  );
}
assert(
  serverReadsWithTiming.includes("timing.mark('auth'")
    && serverReadsWithTiming.includes("timing.mark('primary'")
    && serverReadsWithTiming.includes("timing.mark('relations'")
    && serverReadsWithTiming.includes("timing.finish('ok'"),
  'CPC timing separates auth, primary, relation and total read cost',
);

const workbenchServerPage = read('src/app/customer-projects/page.tsx');
const projectsServerPage = read('src/app/customer-projects/projects/page.tsx');
const workbenchClient = read('src/app/customer-projects/WorkbenchClient.tsx');
const projectsClient = read('src/app/customer-projects/projects/ProjectsClient.tsx');
const serverReads = read('src/lib/customer-projects/server-reads.ts');
assert(
  !workbenchServerPage.includes("'use client'")
    && workbenchServerPage.includes('readWorkbenchSnapshot')
    && workbenchServerPage.includes('initialSnapshot'),
  'Workbench renders confirmed initial data on the server before hydration',
);
assert(
  !projectsServerPage.includes("'use client'")
    && projectsServerPage.includes('readProjectList')
    && projectsServerPage.includes('initialProjects'),
  'Project list renders confirmed initial data on the server before hydration',
);
assert(
  workbenchClient.includes('initialSnapshot')
    && workbenchClient.includes('if (workbenchRefreshKey === 0) return;')
    && projectsClient.includes('initialProjects')
    && !projectsClient.includes("fetch('/api/customer-projects/projects'"),
  'CPC primary navigation no longer waits for an initial client-side data fetch',
);
assert(
  serverReads.includes("import 'server-only'")
    && serverReads.includes('resolveCpcProfile')
    && serverReads.includes(".eq('org_id', profile.orgId)"),
  'Server-first reads preserve trusted profile resolution and organization scoping',
);

const reportsPage = read('src/app/customer-projects/reports/page.tsx');
const teamPage = read('src/app/customer-projects/team/TeamClient.tsx');
const teamServerPage = read('src/app/customer-projects/team/page.tsx');
const teamServerRead = read('src/lib/customer-projects/team-board-server.ts');
const integrationPanel = read(
  'src/components/customer-projects/IntegrationStatusPanel.tsx',
);
assert(
  reportsPage.includes("value ?? '未知'")
    && reportsPage.includes('缺少日报覆盖时显示未知')
    && teamPage.includes("return { value: '未知'")
    && integrationPanel.includes("unknown: '未知'"),
  'partial and UNKNOWN data states remain visibly unknown',
);

assert(
  !teamServerPage.includes("'use client'")
    && teamServerPage.includes('readTeamBoardSnapshot')
    && teamServerPage.includes('snapshot={result.ok ? result.data : null}')
    && teamServerRead.includes("createCpcReadTiming('team')")
    && teamServerRead.includes('resolveCpcProfile')
    && teamServerRead.includes('canAccessTeamBoard')
    && !teamPage.includes("fetch('/api/customer-projects/team'"),
  'Team Board renders server-first while preserving trusted authorization and timing',
);

const customersServerPage = read('src/app/customer-projects/customers/page.tsx');
const tasksServerPage = read('src/app/customer-projects/tasks/page.tsx');
const customersClient = read('src/app/customer-projects/customers/CustomersClient.tsx');
const tasksClient = read('src/app/customer-projects/tasks/TasksClient.tsx');
assert(
  !customersServerPage.includes("'use client'")
    && customersServerPage.includes('readCustomerList')
    && customersServerPage.includes('initialCustomers')
    && customersClient.includes('initialCustomers')
    && !customersClient.includes("fetch('/api/customer-projects/customers'"),
  'Customer list renders confirmed initial data on the server before hydration',
);
assert(
  !tasksServerPage.includes("'use client'")
    && tasksServerPage.includes('readTaskList')
    && tasksServerPage.includes('initialTasks')
    && tasksClient.includes('initialTasks')
    && tasksClient.includes("fetch('/api/customer-projects/tasks'")
    && !tasksClient.includes('void loadTasks(true);'),
  'Task list renders initial data server-first and keeps refresh API only for mutations',
);

const mobileCriticalFiles = [
  'src/app/customer-projects/WorkbenchClient.tsx',
  'src/app/customer-projects/customers/[id]/page.tsx',
  'src/app/customer-projects/projects/[id]/page.tsx',
  'src/app/customer-projects/tasks/TasksClient.tsx',
  'src/app/customer-projects/projects/new/page.tsx',
];
for (const pagePath of mobileCriticalFiles) {
  const source = read(pagePath);
  assert(
    source.includes('grid-cols-1')
      && (
        source.includes('sm:')
        || source.includes('md:')
        || source.includes('lg:')
      )
      && !source.includes('<table'),
    pagePath + ' keeps the critical mobile flow stacked and non-tabular',
  );
}

// ---------------------------------------------------------------------------
// No activity ranking or raw message/click/count KPI
// ---------------------------------------------------------------------------

const noRankingSources = [
  read('src/lib/customer-projects/team-board.ts'),
  read('src/lib/customer-projects/read-models.ts'),
  read('src/lib/customer-projects/customer-read-models.ts'),
  read('src/lib/customer-projects/reports.ts'),
  teamPage,
];
for (const forbidden of [
  'message_count',
  'click_count',
  'messageCount',
  'clickCount',
  '排名',
  '评分',
  '绩效',
]) {
  assert(
    noRankingSources.every(source => !source.includes(forbidden)),
    'no activity ranking surface: ' + forbidden,
  );
}
assert(
  noRankingSources[0].includes('ranking: false')
    && noRankingSources[0].includes('scoring: false')
    && noRankingSources[0].includes("ordering: 'display_name_only'"),
  'Team Board explicitly disables ranking/scoring and orders by display name',
);

// ---------------------------------------------------------------------------
// Durable matrices, pilot artifacts, triage artifact, and CI chain
// ---------------------------------------------------------------------------

const pilotDoc = read(
  'docs/customer-project-center/PHASE_12_QA_PILOT_READINESS.md',
);
for (const text of [
  'PILOT_REPOSITORY_READY = YES',
  'PILOT_PASS = NO',
  'Five-role acceptance matrix',
  'Durable E2E acceptance matrix',
  'two to three',
  'Pilot entry criteria',
  'Seeded non-production data rules',
  'Pilot scenario script',
  'Evidence template',
  'Blocker and severity rules',
  'Rollback and stop conditions',
  'Feedback questions',
  'Human sign-off',
  'P12-ROLE-01',
  'P12-AUTH-01',
  'P12-AUTH-02',
  'P12-FLOW-01',
  'P12-FLOW-02',
  'P12-FLOW-03',
  'P12-FLOW-04',
  'P12-FLOW-05',
  'P12-FLOW-06',
  'P12-REPORT-01',
  'P12-REVIEW-01',
  'P12-TEAM-01',
  'P12-OLD-01',
  'P12-INTEGRATION-01',
  'P12-CONC-01',
  'P12-REPLAY-01',
  'P12-CONC-02',
  'P12-UNKNOWN-01',
  'P12-UI-01',
  'P12-MOBILE-01',
  'P12-RANK-01',
]) {
  assert(pilotDoc.includes(text), 'pilot readiness document covers: ' + text);
}

const triageDoc = read(
  'docs/customer-project-center/PILOT_DEFECT_TRIAGE_TEMPLATE.md',
);
for (const text of [
  'Repository defect',
  'Business-policy decision',
  'Production or integration gate',
  'Training or usability feedback',
  'PILOT-YYYY-NNN',
  'FIX_REQUIRED / NEEDS_DECISION / GATE_PENDING / TRAINING_ONLY / DUPLICATE / NOT_A_DEFECT',
  'No triage record may mark `PILOT_PASS = YES`',
]) {
  assert(triageDoc.includes(text), 'defect triage template covers: ' + text);
}

const foundationTest = read(
  'tests/unit/customer-project-center-foundation.test.ts',
);
assert(
  foundationTest.includes(
    "import './customer-project-center-phase12-qa.test'",
  ),
  'Phase 12 tests are wired into the existing CI foundation step',
);

console.log(
  'Phase 12 QA and pilot-readiness tests: '
    + passed
    + ' passed, '
    + failed
    + ' failed',
);
if (failed > 0) process.exit(1);
