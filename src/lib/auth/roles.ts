// ===== Role-Based Access Control =====

export type Role = 'admin' | 'manager' | 'operator' | 'sales' | 'viewer';
export type Action = 'create' | 'read' | 'update' | 'delete' | 'approve' | 'score' | 'export' | 'assign' | 'manage_users';
export type PageSlug =
  | 'dashboard' | 'accounts' | 'accounts_detail' | 'topics' | 'scripts'
  | 'teardowns' | 'calendar' | 'posts' | 'leads' | 'knowledge'
  | 'reports' | 'settings';

// ===== Page Access Matrix =====
// Each page defines which roles can access it, and optional sub-resource restrictions.

const PAGE_ACCESS: Record<PageSlug, { roles: Role[]; description: string; resourceOwned?: boolean }> = {
  dashboard:       { roles: ['admin', 'manager', 'operator', 'sales', 'viewer'], description: '全局战情盘' },
  accounts:        { roles: ['admin', 'manager', 'operator', 'viewer'], description: '账号矩阵' },
  accounts_detail: { roles: ['admin', 'manager', 'operator', 'viewer'], description: '账号详情' },
  topics:          { roles: ['admin', 'manager', 'operator', 'viewer'], description: '选题库' },
  scripts:         { roles: ['admin', 'manager', 'operator', 'viewer'], description: '脚本工厂' },
  teardowns:       { roles: ['admin', 'manager', 'operator', 'viewer'], description: '爆款拆解' },
  calendar:        { roles: ['admin', 'manager', 'operator', 'viewer'], description: '发布日历' },
  posts:           { roles: ['admin', 'manager', 'operator', 'viewer'], description: '数据复盘' },
  leads:           { roles: ['admin', 'manager', 'sales', 'viewer'], description: '线索中心', resourceOwned: true },
  knowledge:       { roles: ['admin', 'manager', 'operator', 'viewer'], description: '知识库' },
  reports:         { roles: ['admin', 'manager', 'viewer'], description: '报表' },
  settings:        { roles: ['admin'], description: '设置' },
};

// ===== Action Permission Matrix =====
const ACTION_PERMS: Record<Action, Role[]> = {
  create:       ['admin', 'operator'],
  read:         ['admin', 'manager', 'operator', 'sales', 'viewer'],
  update:       ['admin', 'manager', 'operator'],
  delete:       ['admin'],
  approve:      ['admin', 'manager'],
  score:        ['admin', 'manager', 'operator'],
  export:       ['admin', 'manager'],
  assign:       ['admin', 'manager'],
  manage_users: ['admin'],
};

// ===== User Interface =====
export interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  org_id: string;
  department?: string | null;
}

// ===== Check page access =====
export function canAccessPage(user: AuthUser, page: PageSlug): boolean {
  const access = PAGE_ACCESS[page];
  if (!access) return false;
  return access.roles.includes(user.role);
}

// ===== Check action permission =====
export function canPerformAction(user: AuthUser, action: Action): boolean {
  const perms = ACTION_PERMS[action];
  if (!perms) return false;
  return perms.includes(user.role);
}

// ===== Check resource-level access (leads owned by sales) =====
export function canAccessResource(user: AuthUser, page: PageSlug, resourceOwnerId?: string): boolean {
  // Admin and manager can see everything
  if (user.role === 'admin' || user.role === 'manager') return true;
  // Sales can only see their assigned resources
  if (user.role === 'sales') {
    if (page === 'leads') {
      return resourceOwnerId === undefined || resourceOwnerId === user.id;
    }
    return false;
  }
  return true;
}

// ===== Get accessible pages for user =====
export function getAccessiblePages(user: AuthUser): PageSlug[] {
  return (Object.entries(PAGE_ACCESS) as [PageSlug, typeof PAGE_ACCESS[PageSlug]][])
    .filter(([_, access]) => access.roles.includes(user.role))
    .map(([slug]) => slug);
}

// ===== Get route from page slug =====
export function getRouteFromPage(page: PageSlug): string {
  const routeMap: Record<PageSlug, string> = {
    dashboard: '/dashboard', accounts: '/accounts', accounts_detail: '/accounts/[id]',
    topics: '/topics', scripts: '/scripts', teardowns: '/teardowns',
    calendar: '/calendar', posts: '/posts', leads: '/leads',
    knowledge: '/knowledge', reports: '/reports', settings: '/settings',
  };
  return routeMap[page] || '/';
}

// ===== Route to page slug =====
export function getPageSlugFromRoute(pathname: string): PageSlug | null {
  const route = pathname.split('?')[0].split('#')[0];
  const map: Record<string, PageSlug> = {
    '/dashboard': 'dashboard', '/accounts': 'accounts',
    '/topics': 'topics', '/scripts': 'scripts',
    '/teardowns': 'teardowns', '/calendar': 'calendar',
    '/posts': 'posts', '/leads': 'leads',
    '/knowledge': 'knowledge', '/reports': 'reports',
    '/settings': 'settings',
  };
  // Handle detail pages
  if (route.startsWith('/accounts/') && route !== '/accounts') return 'accounts_detail';
  return map[route] || null;
}

// ===== Mock users for testing =====
export const MOCK_AUTH_USERS: AuthUser[] = [
  { id: 'u_admin', full_name: '管理员', email: 'admin@hongda.com', role: 'admin', org_id: 'org_001', department: '管理部' },
  { id: 'u_mgr', full_name: '许总', email: 'xuzong@hongda.com', role: 'manager', org_id: 'org_001', department: '新媒体部' },
  { id: 'u1', full_name: '小陈', email: 'xiaochen@hongda.com', role: 'operator', org_id: 'org_001', department: '新媒体部' },
  { id: 'u_sls', full_name: '销售小张', email: 'zhang@hongda.com', role: 'sales', org_id: 'org_001', department: '销售部' },
  { id: 'u_vwr', full_name: '观察员老王', email: 'wang@hongda.com', role: 'viewer', org_id: 'org_001', department: '外部' },
];

// ===== Get user by email for mock login =====
export function getMockUserByEmail(email: string): AuthUser | undefined {
  return MOCK_AUTH_USERS.find(u => u.email === email);
}

// ===== Serialize user to cookie-safe format =====
export function serializeUser(user: AuthUser): string {
  return encodeURIComponent(JSON.stringify({
    id: user.id, full_name: user.full_name, email: user.email,
    role: user.role, org_id: user.org_id,
  }));
}

// ===== Deserialize user from cookie =====
export function deserializeUser(cookieValue: string): AuthUser | null {
  try {
    return JSON.parse(decodeURIComponent(cookieValue));
  } catch {
    return null;
  }
}
