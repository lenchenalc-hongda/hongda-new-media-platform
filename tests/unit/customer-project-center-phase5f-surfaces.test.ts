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

console.log('\n=== Customer Project Center Phase 5F Surface Contract ===');

const customersApi = fs.readFileSync(
  'src/app/api/customer-projects/customers/route.ts',
  'utf8',
);
const customerDetailApi = fs.readFileSync(
  'src/app/api/customer-projects/customers/[id]/route.ts',
  'utf8',
);
const customerFollowUpRoute = fs.readFileSync(
  'src/app/api/customer-projects/customers/[id]/follow-up/route.ts',
  'utf8',
);
const customersPage = fs.readFileSync(
  'src/app/customer-projects/customers/page.tsx',
  'utf8',
);
const customerDetailPage = fs.readFileSync(
  'src/app/customer-projects/customers/[id]/page.tsx',
  'utf8',
);
const newProjectPage = fs.readFileSync(
  'src/app/customer-projects/projects/new/page.tsx',
  'utf8',
);
const workbenchPage = fs.readFileSync(
  'src/app/customer-projects/page.tsx',
  'utf8',
);
const tasksPage = fs.readFileSync(
  'src/app/customer-projects/tasks/page.tsx',
  'utf8',
);
const navigation = fs.readFileSync(
  'src/lib/constants/navigation.ts',
  'utf8',
);

assert(
  customersApi.includes('resolveCpcProfile')
    && customersApi.includes(".from('cpc_customer_references')")
    && customersApi.includes(".from('cpc_projects')")
    && customersApi.includes(".from('cpc_work_items')")
    && customersApi.includes(".from('cpc_project_events')"),
  'Customer list API composes relationship view from formal CPC sources',
);
assert(
  customersApi.includes(".is('project_id', null)")
    && customersApi.includes(".eq('work_item_type', 'FOLLOW_UP')"),
  'Customer list reads only customer-level follow-up tasks',
);
assert(
  !customersApi.includes('service_role')
    && !customersApi.includes('SUPABASE_SERVICE_ROLE'),
  'Customer list respects session/RLS instead of service-role bypass',
);

assert(
  customerDetailApi.includes("supabase.rpc('cpc_can_follow_customer'")
    && customerDetailApi.includes('canRecordFollowUp: canFollowResult.data === true'),
  'Customer detail separates follow-up write authority from customer read visibility',
);
assert(
  customerDetailApi.includes('externalOwnerReference')
    && !customerDetailApi.includes('.update('),
  'Customer detail displays external ownership reference without rewriting it',
);
assert(
  customerDetailApi.includes('promotionContext')
    && customerDetailApi.includes('latestEvent?.raw_input'),
  'Customer detail exposes recent confirmed context for Project promotion',
);

assert(
  customerFollowUpRoute.includes("runCpcMutation(req, params, 'RECORD_CUSTOMER_FOLLOW_UP')"),
  'Customer follow-up route delegates to shared controlled mutation layer',
);
assert(
  !customerFollowUpRoute.includes('.from(')
    && !customerFollowUpRoute.includes('.rpc('),
  'Customer follow-up route does not duplicate table/RPC rules',
);

assert(
  customersPage.includes('待我回访')
    && customersPage.includes('已安排给我')
    && customersPage.includes('有活跃项目'),
  'Customer list supports approved relationship-work filters',
);
assert(
  !customersPage.includes("key: 'mine'")
    && customersPage.includes('这里没有“我的客户”筛选'),
  'Customer list does not invent CPC customer ownership',
);
assert(
  customersPage.includes('外部归属引用')
    && customersPage.includes('CPC 只显示已验证引用'),
  'Customer list treats external owner as a reference, not local truth',
);

assert(
  customerDetailPage.includes('记录客户回访')
    && customerDetailPage.includes('普通老客户维护留在客户层')
    && customerDetailPage.includes('形成具体机会，创建项目'),
  'Customer detail keeps relationship follow-up separate from concrete Project promotion',
);
assert(
  customerDetailPage.includes("'/follow-up'")
    && customerDetailPage.includes('currentFollowUpId')
    && customerDetailPage.includes('nextFollowUpTitle')
    && customerDetailPage.includes('nextFollowUpDueAt'),
  'one customer follow-up confirmation can complete current and schedule next action',
);
assert(
  customerDetailPage.includes('当前只有查看权限')
    && customerDetailPage.includes('canRecordFollowUp'),
  'Customer detail visibly respects stricter follow-up write authority',
);
assert(
  customerDetailPage.includes('不能替对方结束/替换该任务')
    && customerDetailPage.includes('canClose'),
  'Customer detail cannot silently close another salesperson follow-up',
);
assert(
  customerDetailPage.includes('系统不会在没有批准规则的情况下自动生成老客户回访周期')
    && !customerDetailPage.includes('每30天自动')
    && !customerDetailPage.includes('每60天自动'),
  'Phase 5F does not invent an old-customer cadence policy',
);

assert(
  newProjectPage.includes('useSearchParams')
    && newProjectPage.includes("searchParams.get('customerReferenceId')")
    && newProjectPage.includes("searchParams.get('contextEventId')"),
  'Project creation accepts Customer context from Customer Detail',
);
assert(
  newProjectPage.includes('promotionContext?.eventId')
    && newProjectPage.includes('setObjectiveSummary')
    && newProjectPage.includes('已带入最近一次已确认的客户回访摘要'),
  'confirmed customer follow-up context carries into Project creation without duplicate typing',
);

assert(
  workbenchPage.includes('href={"/customer-projects/customers/" + item.customerReferenceId}')
    && workbenchPage.includes('打开客户 →'),
  'Workbench P3 customer-level work drills into Customer Detail',
);
assert(
  tasksPage.includes('customerFollowUpNeedsCustomerFlow')
    && tasksPage.includes('任务页不会静默完成回访')
    && tasksPage.includes('href={"/customer-projects/customers/" + task.customerReferenceId}'),
  'My Tasks routes FOLLOW_UP completion through Customer Detail result capture',
);

for (const source of [
  customersPage,
  customerDetailPage,
  newProjectPage,
]) {
  for (const forbidden of ['localStorage', 'site_data', '/api/data', '.from(', '.rpc(']) {
    assert(!source.includes(forbidden), 'Customer client UI avoids direct/legacy data path: ' + forbidden);
  }
}

assert(
  navigation.includes("{ label: '客户', path: '/customer-projects/customers', icon: '👥' }")
    && !navigation.includes("{ label: '客户', path: '/customer-projects/customers', icon: '👥', disabled: true }"),
  'Customers navigation is enabled in Phase 5F',
);

console.log('Phase 5F surface tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
