import fs from 'node:fs';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

console.log('\n=== Customer Project Center Phase 5E E2E Surface Contract ===');

const projectsApi = fs.readFileSync(
  'src/app/api/customer-projects/projects/route.ts',
  'utf8',
);
const customerRefsApi = fs.readFileSync(
  'src/app/api/customer-projects/customer-references/route.ts',
  'utf8',
);
const tasksApi = fs.readFileSync(
  'src/app/api/customer-projects/tasks/route.ts',
  'utf8',
);
const projectsPage = fs.readFileSync(
  'src/app/customer-projects/projects/page.tsx',
  'utf8',
);
const newProjectPage = fs.readFileSync(
  'src/app/customer-projects/projects/new/page.tsx',
  'utf8',
);
const tasksPage = fs.readFileSync(
  'src/app/customer-projects/tasks/page.tsx',
  'utf8',
);
const projectDetail = fs.readFileSync(
  'src/app/customer-projects/projects/[id]/page.tsx',
  'utf8',
);
const lifecycleSection = fs.readFileSync(
  'src/app/customer-projects/projects/[id]/lifecycle-section.tsx',
  'utf8',
);
const navigation = fs.readFileSync(
  'src/lib/constants/navigation.ts',
  'utf8',
);

assert(
  projectsApi.includes('resolveCpcProfile')
    && projectsApi.includes(".from('cpc_projects')")
    && projectsApi.includes(".from('cpc_work_items')")
    && projectsApi.includes(".from('cpc_customer_references')"),
  'Projects API resolves profile and composes Project/customer/next-action read model',
);
assert(
  projectsApi.includes('isOwnedByMe: project.ownerProfileId === profile.id')
    && !projectsApi.includes('ownerProfileId: project.ownerProfileId'),
  'Projects API exposes self-ownership boolean instead of owner profile identifier',
);
assert(
  !projectsApi.includes('service_role')
    && !projectsApi.includes('SUPABASE_SERVICE_ROLE'),
  'Projects API does not bypass RLS with service role',
);

assert(
  customerRefsApi.includes(".from('cpc_customer_references')")
    && customerRefsApi.includes(".in('status', ['active', 'pending_review'])"),
  'customer selector uses formal CPC CustomerReference store',
);
assert(
  !customerRefsApi.includes('external_owner_reference')
    && !customerRefsApi.includes('UPDATE')
    && !customerRefsApi.includes('.update('),
  'customer selector does not expose/rewrite ownership source truth',
);

assert(
  tasksApi.includes(".eq('assignee_profile_id', profile.id)"),
  'My Tasks API is personal assigned-work view',
);
assert(
  tasksApi.includes("from('cpc_projects')")
    && tasksApi.includes("from('cpc_customer_references')"),
  'My Tasks hydrates Project/customer context without duplicating SoT',
);

assert(
  projectsPage.includes("fetch('/api/customer-projects/projects'")
    && projectsPage.includes('我负责的')
    && projectsPage.includes('等待中')
    && projectsPage.includes('需要处理')
    && projectsPage.includes('新建项目'),
  'Projects page supports work-oriented filters and creation entry',
);
assert(
  projectsPage.includes('project.isOwnedByMe')
    && !projectsPage.includes('external_owner_reference'),
  'Projects page does not invent CPC customer ownership',
);

assert(
  newProjectPage.includes("'/api/customer-projects/customer-references?q='")
    && newProjectPage.includes("'/api/customer-projects/customers/provisional'")
    && newProjectPage.includes("'/api/customer-projects/projects'"),
  'Project creation reuses CustomerReference selector and controlled create APIs',
);
assert(
  newProjectPage.includes('只在出现具体商业机会时建项目')
    && newProjectPage.includes('普通老客户回访不需要创建假项目'),
  'Project creation preserves Customer vs Project trigger boundary',
);
assert(
  newProjectPage.includes('PROJECT_STAGE_OPTIONS[projectType]')
    && newProjectPage.includes('复购/重复订单可直接进入真实有效的后续阶段'),
  'Project creation supports controlled repeat/reorder fast path',
);
assert(
  newProjectPage.includes('第一步动作')
    && newProjectPage.includes('当前正在等待')
    && newProjectPage.includes('nextCheckAt'),
  'new active Project requires initial NEXT_ACTION or waiting/check',
);
assert(
  newProjectPage.includes('临时客户项目不能直接标记成交') === false,
  'Project creation does not pretend provisional customer is canonical',
);

assert(
  tasksPage.includes("fetch('/api/customer-projects/tasks'")
    && tasksPage.includes("'/transition'"),
  'My Tasks reads task API and writes only through transition API',
);
assert(
  tasksPage.includes('activeNextActionNeedsProjectFlow')
    && tasksPage.includes('完成或取消必须同时确定新的下一步/等待状态'),
  'active Project NEXT_ACTION cannot be directly closed from My Tasks',
);
assert(
  tasksPage.includes('标记受阻')
    && tasksPage.includes('受阻/取消必须填写原因'),
  'blocked/cancelled task transitions require explicit reason in UI',
);

assert(
  projectDetail.includes("from './lifecycle-section'")
    && projectDetail.includes('<ProjectLifecycleSection'),
  'Project Detail exposes lifecycle control as a secondary section',
);
assert(
  lifecycleSection.includes('PROJECT_LIFECYCLE_TRANSITIONS[status]')
    && lifecycleSection.includes("'/transition'"),
  'lifecycle UI uses frozen transition map and controlled transition endpoint',
);
assert(
  lifecycleSection.includes("target === 'won'")
    && lifecycleSection.includes("customerReferenceKind !== 'canonical'")
    && lifecycleSection.includes('人工确认的订单证据'),
  'won UI preserves canonical-customer and order-evidence gate',
);
assert(
  lifecycleSection.includes("target === 'active'")
    && lifecycleSection.includes('reopenNextActionTitle')
    && lifecycleSection.includes('reopenWaitingOn')
    && lifecycleSection.includes('reopenNextCheckAt'),
  'reopen UI re-establishes NEXT_ACTION or waiting/check',
);
assert(
  projectDetail.includes("project.status === 'paused'")
    && projectDetail.includes('项目已暂停 · 下次检查'),
  'paused Project is not mislabeled as missing next step',
);

for (const source of [
  projectsPage,
  newProjectPage,
  tasksPage,
  lifecycleSection,
]) {
  for (const forbidden of ['localStorage', 'site_data', '/api/data', '.from(', '.rpc(']) {
    assert(!source.includes(forbidden), 'client UI avoids direct/legacy data path: ' + forbidden);
  }
}

assert(
  navigation.includes("{ label: '项目', path: '/customer-projects/projects', icon: '📁' }")
    && navigation.includes("{ label: '我的任务', path: '/customer-projects/tasks', icon: '✅' }"),
  'Projects and My Tasks navigation are enabled',
);
assert(
  navigation.includes("{ label: '客户', path: '/customer-projects/customers', icon: '👥' }")
    && navigation.includes("{ label: '我的报告', path: '/customer-projects/reports', icon: '📝' }"),
  'Customers remain enabled and My Reports advances to enabled in Phase 7A',
);

console.log('Phase 5E surface tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
