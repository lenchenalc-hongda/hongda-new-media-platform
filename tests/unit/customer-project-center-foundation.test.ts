import fs from 'node:fs';
import {
  canAccessPage,
  getPageSlugFromRoute,
  getRouteFromPage,
  type AuthUser,
} from '../../src/lib/auth/roles';
import {
  PORTAL_GROUPS,
  WORKSPACE_PORTAL_STYLES,
  getPortalForPath,
  getVisiblePortalGroups,
  isPortalItemEnabled,
} from '../../src/lib/constants/navigation';
import { FEATURES, parseFeatureFlag } from '../../src/lib/features';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + msg);
  }
}

function user(role: AuthUser['role']): AuthUser {
  return {
    id: role,
    full_name: role,
    email: role + '@example.com',
    role,
    org_id: 'org-1',
  };
}

function canSeeSalesPortal(
  customerProjectCenterEnabled: boolean,
  role: AuthUser['role'],
): boolean {
  return getVisiblePortalGroups({
    projectReviewCenterEnabled: true,
    customerProjectCenterEnabled,
    canAccessCustomerProjectCenter: canAccessPage(user(role), 'customer_project_center'),
  }).some(group => group.id === 'sales');
}

console.log('\n=== Customer Project Center Foundation ===');

assert(getPortalForPath('/customer-projects') === 'sales', 'customer project root maps to sales portal');
assert(
  getPortalForPath('/customer-projects/projects') === 'sales',
  'customer project child route maps to sales portal',
);

assert(
  getPageSlugFromRoute('/customer-projects') === 'customer_project_center',
  'customer project root page slug',
);
assert(
  getPageSlugFromRoute('/customer-projects/projects') === 'customer_project_center',
  'customer project child page slug',
);
assert(
  getPageSlugFromRoute('/customer-projects/settings') === 'customer_project_center_settings',
  'customer project settings page slug',
);

assert(canAccessPage(user('admin'), 'customer_project_center'), 'admin can access customer project center');
assert(canAccessPage(user('manager'), 'customer_project_center'), 'manager can access customer project center');
assert(canAccessPage(user('sales'), 'customer_project_center'), 'sales can access customer project center');
assert(!canAccessPage(user('operator'), 'customer_project_center'), 'operator cannot access customer project center');
assert(!canAccessPage(user('viewer'), 'customer_project_center'), 'viewer cannot access customer project center');
assert(canAccessPage(user('admin'), 'customer_project_center_settings'), 'admin can access settings');
assert(
  !canAccessPage(user('manager'), 'customer_project_center_settings')
  && !canAccessPage(user('sales'), 'customer_project_center_settings'),
  'only admin can access customer project settings',
);

assert(!canSeeSalesPortal(false, 'admin'), 'feature off hides sales portal from admin');
assert(canSeeSalesPortal(true, 'admin'), 'feature on shows sales portal to admin');
assert(canSeeSalesPortal(true, 'manager'), 'feature on shows sales portal to manager');
assert(canSeeSalesPortal(true, 'sales'), 'feature on shows sales portal to sales');
assert(!canSeeSalesPortal(true, 'operator'), 'feature on hides sales portal from operator');
assert(!canSeeSalesPortal(true, 'viewer'), 'feature on hides sales portal from viewer');

assert(
  getRouteFromPage('customer_project_center') === '/customer-projects',
  'customer project route mapping',
);
assert(
  getRouteFromPage('customer_project_center_settings') === '/customer-projects/settings',
  'customer project settings route mapping',
);

const salesPortal = PORTAL_GROUPS.find(group => group.id === 'sales');
assert(!!salesPortal, 'sales portal exists');
assert(salesPortal?.label === '客户项目', 'sales portal label');
assert(salesPortal?.icon === '🤝', 'sales portal icon');
assert(salesPortal?.color === 'cyan', 'sales portal color');

const enabledItems = salesPortal?.items.filter(item => !item.disabled).map(item => item.path) ?? [];
assert(
  JSON.stringify(enabledItems) === JSON.stringify(['/customer-projects']),
  'only my workbench is enabled in batch 1',
);
for (const path of [
  '/customer-projects/customers',
  '/customer-projects/projects',
  '/customer-projects/tasks',
  '/customer-projects/daily',
  '/customer-projects/weekly',
  '/customer-projects/team',
  '/customer-projects/settings',
]) {
  assert(
    salesPortal?.items.find(item => item.path === path)?.disabled === true,
    `disabled portal item: ${path}`,
  );
  assert(
    !isPortalItemEnabled(salesPortal!.items.find(item => item.path === path)!),
    `disabled portal item is not link-enabled: ${path}`,
  );
}

assert(
  WORKSPACE_PORTAL_STYLES.cyan?.gradient === 'from-cyan-500 to-cyan-600',
  'workspace home has cyan gradient',
);
assert(
  WORKSPACE_PORTAL_STYLES.cyan?.background === 'bg-cyan-50 border-cyan-200',
  'workspace home has cyan background',
);
assert(
  WORKSPACE_PORTAL_STYLES.cyan?.button === 'text-cyan-700 bg-cyan-100 hover:bg-cyan-200',
  'workspace home has cyan button',
);

assert(parseFeatureFlag('true') === true, 'customer flag true parsing');
assert(parseFeatureFlag('1') === true, 'customer flag 1 parsing');
assert(parseFeatureFlag('false') === false, 'customer flag false parsing');
assert(parseFeatureFlag(undefined) === false, 'customer flag missing defaults false');
assert(
  FEATURES.CUSTOMER_PROJECT_CENTER === 'customer_project_center',
  'customer project feature constant',
);

const middlewareSource = fs.readFileSync('src/middleware.ts', 'utf8');
assert(
  middlewareSource.includes("pathname.startsWith('/customer-projects')")
  && middlewareSource.includes('客户项目中心尚未开放'),
  'middleware gates customer project center',
);

const pageSource = fs.readFileSync('src/app/customer-projects/page.tsx', 'utf8');
for (const text of [
  '每天推进客户与项目，减少重复记录，让下一步更清楚。',
  '当前尚未接入项目任务数据。',
  '快速记录',
  '即将开放',
  '暂无可展示的项目异常。',
  '业务数据接入后自动生成，不要求员工重复填写日报。',
]) {
  assert(pageSource.includes(text), 'foundation page contains: ' + text);
}
assert(
  !/(成交20万|今天8个客户|3个逾期)/.test(pageSource),
  'foundation page contains no mock business metrics',
);
assert(
  pageSource.includes("from '@/components/ui/EmptyState'")
  && !pageSource.includes('ReviewCenterEmpty'),
  'foundation page uses generic EmptyState instead of Review Center UI',
);

const workspaceHomeSource = fs.readFileSync('src/app/workspace-home/page.tsx', 'utf8');
assert(
  workspaceHomeSource.includes('getVisiblePortalGroups({')
  && workspaceHomeSource.includes('canAccessCustomerProjectCenter'),
  'workspace home uses shared feature and role visibility',
);
assert(
  workspaceHomeSource.includes('!isPortalItemEnabled(item)')
  && workspaceHomeSource.includes('aria-disabled="true"'),
  'workspace home renders disabled portal items without links',
);

const envExample = fs.readFileSync('.env.example', 'utf8');
assert(
  envExample.includes('NEXT_PUBLIC_FEATURE_CUSTOMER_PROJECT_CENTER=false'),
  'feature flag documented with default false',
);

const architectureDoc = fs.readFileSync(
  'docs/customer-project-center/ARCHITECTURE_BASELINE.md',
  'utf8',
);
assert(architectureDoc.includes('Lead ≠ Customer'), 'architecture baseline lead/customer boundary');
assert(architectureDoc.includes('SEC-LEGACY-008'), 'architecture baseline legacy security backlog');

console.log(`Customer Project Center foundation tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
