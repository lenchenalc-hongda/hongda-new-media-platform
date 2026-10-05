import fs from 'node:fs';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

console.log('\n=== Customer Project Center Phase 9 Surface Contract ===');

const api = fs.readFileSync(
  'src/app/api/customer-projects/team/route.ts',
  'utf8',
);
const page = fs.readFileSync(
  'src/app/customer-projects/team/page.tsx',
  'utf8',
);
const model = fs.readFileSync(
  'src/lib/customer-projects/team-board.ts',
  'utf8',
);
const roles = fs.readFileSync('src/lib/auth/roles.ts', 'utf8');
const navigation = fs.readFileSync('src/lib/constants/navigation.ts', 'utf8');
const rootLayout = fs.readFileSync('src/app/layout.tsx', 'utf8');
const roleProvider = fs.readFileSync(
  'src/components/layout/RoleProvider.tsx',
  'utf8',
);
const sidebar = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
const workspaceHome = fs.readFileSync('src/app/workspace-home/page.tsx', 'utf8');

assert(
  roles.includes("'customer_project_center_team'")
    && roles.includes("customer_project_center_team: { roles: ['admin', 'manager']")
    && roles.includes("customer_project_center_team: '/customer-projects/team'"),
  'Team Board has a manager/admin-only page slug and route mapping',
);
assert(
  roles.includes("if (route === '/customer-projects/team') return 'customer_project_center_team'"),
  'Team Board route resolves before the shared CPC page slug',
);
assert(
  navigation.includes('canAccessCustomerProjectTeam')
    && navigation.includes("item.path !== '/customer-projects/team'")
    && navigation.includes('{ ...item, disabled: false }'),
  'Team Board navigation is hidden from sales and enabled only for authorized roles',
);
assert(
  rootLayout.includes("'customer_project_center_team'")
    && roleProvider.includes('canAccessCustomerProjectTeam')
    && sidebar.includes('canAccessCustomerProjectTeam')
    && workspaceHome.includes('canAccessCustomerProjectTeam'),
  'server role context reaches both sidebar and workspace navigation',
);

assert(
  api.includes('resolveCpcProfile')
    && api.includes('canAccessTeamBoard(profile.role)')
    && api.includes("jsonError('无权访问团队看板', 403)"),
  'Team Board API enforces manager/admin authorization server-side',
);
assert(
  (api.match(/\.eq\('org_id', profile\.orgId\)/g)?.length ?? 0) >= 6,
  'every Team Board CPC/profile read is same-org scoped',
);
assert(
  api.includes('.range(0, MAX_PROJECT_ROWS - 1)')
    && api.includes('.range(0, MAX_WORK_ITEM_ROWS - 1)')
    && api.includes('.range(0, MAX_CUSTOMER_ROWS - 1)')
    && api.includes('.range(0, MAX_PROFILE_ROWS - 1)')
    && api.includes('.range(0, MAX_REPORT_ROWS - 1)')
    && api.includes('.range(0, MAX_EVENT_ROWS - 1)'),
  'Team Board reads are bounded to explicit row limits',
);
assert(
  !api.includes('createAdminSupabaseClient')
    && !api.includes('SUPABASE_SERVICE_ROLE')
    && !api.includes('service_role'),
  'Team Board API does not bypass RLS with a privileged browser/server read',
);
for (const mutation of [
  'export async function POST',
  'export async function PUT',
  'export async function PATCH',
  'export async function DELETE',
  '.insert(',
  '.update(',
  '.delete(',
  '.upsert(',
  '.rpc(',
]) {
  assert(!api.includes(mutation), 'Team Board API has no mutation path: ' + mutation);
}

assert(
  page.includes("fetch('/api/customer-projects/team'")
    && page.includes('id="management-decisions"')
    && page.includes('id="commitment-exceptions"')
    && page.includes('id="project-exceptions"')
    && page.includes('id="team-support"')
    && page.includes('id="old-customer-coverage"')
    && page.includes('id="business-progress"'),
  'Team Board page exposes all six required sections',
);
assert(
  page.indexOf('id="management-decisions"')
    < page.indexOf('id="commitment-exceptions"')
    && page.indexOf('id="commitment-exceptions"')
    < page.indexOf('id="project-exceptions"')
    && page.indexOf('id="project-exceptions"')
    < page.indexOf('id="team-support"')
    && page.indexOf('id="team-support"')
    < page.indexOf('id="old-customer-coverage"')
    && page.indexOf('id="old-customer-coverage"')
    < page.indexOf('id="business-progress"'),
  'Team Board page keeps the frozen first-screen section order',
);
for (const forbidden of [
  'localStorage',
  'site_data',
  '/api/data',
  '.from(',
  '.rpc(',
  'createAdminSupabaseClient',
]) {
  assert(!page.includes(forbidden), 'Team Board client avoids direct/legacy data path: ' + forbidden);
}
for (const prohibited of ['排名', '评分', '绩效', '态度', 'message_count', 'click_count']) {
  assert(!page.includes(prohibited), 'Team Board page has no prohibited inference UI: ' + prohibited);
}

assert(
  model.includes("source: 'cpc_work_items'")
    && model.includes("source: 'cpc_projects'")
    && model.includes("'management_decisions'")
    && model.includes("'commitment_exceptions'")
    && model.includes("'project_exceptions'"),
  'Team Board read model exposes formal WorkItem/Project truth in frozen order',
);
assert(
  model.includes('ranking: false')
    && model.includes('scoring: false')
    && model.includes("ordering: 'display_name_only'"),
  'Team Board read model explicitly excludes ranking and scoring',
);
assert(
  model.includes("state: 'unknown'")
    && model.includes('外部订单、报价、回款与财务权威源尚未集成')
    && model.includes('不按 0 处理'),
  'Team Board read model preserves UNKNOWN external semantics',
);
assert(
  model.includes('phase10PolicyApplied: true')
    && model.includes('coverageRate')
    && model.includes('conversionRate')
    && model.includes('buildOldCustomerRecommendations')
    && model.includes('buildPhase10SourceCategoryReport'),
  'old-customer section delegates Phase 10 policy to the shared deterministic model',
);
assert(
  model.includes('stale_project_evaluation')
    && model.includes('尚未批准确定性 stale threshold'),
  'stale project evaluation remains unavailable until policy approval',
);
assert(
  !model.includes("work_item_type === 'AI_DRAFT'")
    && !model.includes('localStorage')
    && !model.includes('site_data')
    && !model.includes('/api/data'),
  'Team Board read model uses only confirmed CPC facts and no legacy source',
);

console.log('Phase 9 surface tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);

// Phase 10 surface coverage is executed through the existing Phase 9 CI step.
await import('./customer-project-center-phase10-surfaces.test');
