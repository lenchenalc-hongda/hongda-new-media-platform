// ===== Portal Navigation Structure =====

export interface PortalNavItem {
  label: string;
  path: string;
  icon: string;
  disabled?: boolean;
  matchExact?: boolean;
}

export interface PortalGroup {
  id: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  items: PortalNavItem[];
}

export interface PortalVisibilityOptions {
  projectReviewCenterEnabled: boolean;
  customerProjectCenterEnabled: boolean;
  canAccessCustomerProjectCenter: boolean;
}

export const WORKSPACE_PORTAL_STYLES: Record<
  string,
  { gradient: string; background: string; button: string }
> = {
  blue: {
    gradient: 'from-blue-500 to-blue-600',
    background: 'bg-blue-50 border-blue-200',
    button: 'text-blue-700 bg-blue-100 hover:bg-blue-200',
  },
  green: {
    gradient: 'from-emerald-500 to-emerald-600',
    background: 'bg-emerald-50 border-emerald-200',
    button: 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200',
  },
  purple: {
    gradient: 'from-purple-500 to-purple-600',
    background: 'bg-purple-50 border-purple-200',
    button: 'text-purple-700 bg-purple-100 hover:bg-purple-200',
  },
  gray: {
    gradient: 'from-gray-600 to-gray-700',
    background: 'bg-gray-50 border-gray-200',
    button: 'text-gray-700 bg-gray-200 hover:bg-gray-300',
  },
  orange: {
    gradient: 'from-orange-500 to-orange-600',
    background: 'bg-orange-50 border-orange-200',
    button: 'text-orange-700 bg-orange-100 hover:bg-orange-200',
  },
  cyan: {
    gradient: 'from-cyan-500 to-cyan-600',
    background: 'bg-cyan-50 border-cyan-200',
    button: 'text-cyan-700 bg-cyan-100 hover:bg-cyan-200',
  },
};

export const PORTAL_GROUPS: PortalGroup[] = [
  {
    id: 'media',
    label: '新媒体',
    description: '视频号与抖音内容运营',
    icon: '🎬',
    color: 'blue',
    items: [
      { label: '战情盘', path: '/dashboard', icon: '📊' },
      { label: '账号矩阵', path: '/accounts', icon: '👤' },
      { label: '选题库', path: '/topics', icon: '📋' },
      { label: '脚本工厂', path: '/scripts', icon: '✍️' },
      { label: '爆款拆解', path: '/teardowns', icon: '🔍' },
      { label: '发布日历', path: '/calendar', icon: '📅' },
      { label: '数据复盘', path: '/posts', icon: '📈' },
      { label: '线索中心', path: '/leads', icon: '🎯' },
      { label: '报表', path: '/reports', icon: '📄' },
    ],
  },
  {
    id: 'official',
    label: '公众号工厂',
    description: '微信公众号内容生产与管理',
    icon: '📢',
    color: 'green',
    items: [
      { label: '总览', path: '/oa', icon: '📊' },
      { label: '文章库', path: '/oa/articles', icon: '📄' },
      { label: '文章工厂', path: '/oa/article-factory', icon: '✏️' },
      { label: '模板中心', path: '/oa/templates', icon: '📐' },
      { label: '素材中心', path: '/oa/assets', icon: '🖼️' },
      { label: '排期日历', path: '/oa/calendar', icon: '📅' },
      { label: '发布队列', path: '/oa/publish-queue', icon: '📤' },
      { label: '数据分析', path: '/oa/analytics', icon: '📈' },
    ],
  },
  {
    id: 'knowledge',
    label: '知识库',
    description: '企业知识管理与复用',
    icon: '📚',
    color: 'purple',
    items: [
      { label: '知识卡', path: '/knowledge', icon: '📇' },
      { label: 'FAQ', path: '/knowledge/faq', icon: '❓' },
      { label: 'SOP', path: '/knowledge/sop', icon: '📋' },
      { label: '风险禁忌', path: '/knowledge/risk', icon: '⚠️' },
      { label: '智能问答', path: '/knowledge/qa', icon: '🤖' },
      { label: '引用统计', path: '/knowledge/stats', icon: '📊' },
    ],
  },
  {
    id: 'review',
    label: '项目复盘',
    description: '项目异常复盘、改善与闭环管理',
    icon: '🔧',
    color: 'orange',
    items: [
      { label: '全部复盘', path: '/review-center/reviews', icon: '📚' },
      { label: '新建复盘', path: '/review-center/new', icon: '➕' },
      { label: '我的复盘', path: '/review-center/reviews/mine', icon: '📋' },
      { label: '复盘首页', path: '/review-center', icon: '🏠', matchExact: true },
      { label: '待我审核', path: '/review-center/approvals', icon: '✅' },
      { label: '改善任务', path: '/review-center/actions', icon: '🛠️' },
      { label: '分析中心', path: '/review-center/analytics', icon: '📊' },
      { label: '案例中心', path: '/review-center/cases', icon: '💡' },
      { label: '下载中心', path: '/review-center/downloads', icon: '📥' },
      { label: '系统设置', path: '/review-center/settings', icon: '⚙️', disabled: true },
    ],
  },
  {
    id: 'sales',
    label: '客户项目',
    description: '客户、项目、跟进与销售工作管理',
    icon: '🤝',
    color: 'cyan',
    items: [
      { label: '我的工作台', path: '/customer-projects', icon: '🏠', matchExact: true },
      { label: '客户', path: '/customer-projects/customers', icon: '👥' },
      { label: '项目', path: '/customer-projects/projects', icon: '📁' },
      { label: '我的任务', path: '/customer-projects/tasks', icon: '✅' },
      { label: '我的报告', path: '/customer-projects/reports', icon: '📝', disabled: true },
      { label: '团队看板', path: '/customer-projects/team', icon: '📈', disabled: true },
      { label: '设置', path: '/customer-projects/settings', icon: '⚙️', disabled: true },
    ],
  },
  {
    id: 'admin',
    label: '管理',
    description: '系统配置与用户管理',
    icon: '⚙️',
    color: 'gray',
    items: [
      { label: '用户与角色', path: '/settings', icon: '👥' },
      { label: '集成中心', path: '/settings', icon: '🔗' },
      { label: '设置', path: '/settings', icon: '⚙️' },
      { label: 'CSV导入导出', path: '/settings', icon: '📥' },
      { label: '健康检查', path: '/settings', icon: '💊' },
      { label: '审计日志', path: '/settings', icon: '📝' },
    ],
  },
];

export const ALL_NAV_ITEMS = PORTAL_GROUPS.flatMap(g => g.items);
export const WORKSPACE_HOME = '/workspace-home';

export function getVisiblePortalGroups({
  projectReviewCenterEnabled,
  customerProjectCenterEnabled,
  canAccessCustomerProjectCenter,
}: PortalVisibilityOptions): PortalGroup[] {
  return PORTAL_GROUPS.filter(group => {
    if (group.id === 'review') return projectReviewCenterEnabled;
    if (group.id === 'sales') {
      return customerProjectCenterEnabled && canAccessCustomerProjectCenter;
    }
    return true;
  });
}

export function isPortalItemEnabled(item: PortalNavItem): boolean {
  return item.disabled !== true;
}

export function getActiveNavItemPath(
  pathname: string,
  items: PortalNavItem[],
): string | null {
  const candidates = items.filter(item => {
    if (item.disabled) return false;
    if (item.matchExact) return pathname === item.path;
    return pathname === item.path || pathname.startsWith(`${item.path}/`);
  });
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.path.length - a.path.length)[0].path;
}

export function getPortalForPath(path: string): string {
  if (path.startsWith('/dashboard') || path.startsWith('/accounts') || path.startsWith('/topics') ||
      path.startsWith('/scripts') || path.startsWith('/teardowns') || path.startsWith('/calendar') ||
      path.startsWith('/posts') || path.startsWith('/leads') || path.startsWith('/reports')) return 'media';
  if (path.startsWith('/oa')) return 'official';
  if (path.startsWith('/knowledge')) return 'knowledge';
  if (path.startsWith('/customer-projects')) return 'sales';
  if (path.startsWith('/settings')) return 'admin';
  if (path.startsWith('/review-center')) return 'review';
  return 'media';
}
