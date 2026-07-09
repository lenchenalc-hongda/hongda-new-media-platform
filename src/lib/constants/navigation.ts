// ===== Portal Navigation Structure =====

export interface PortalNavItem {
  label: string;
  path: string;
  icon: string;
}

export interface PortalGroup {
  id: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  items: PortalNavItem[];
}

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

export function getPortalForPath(path: string): string {
  if (path.startsWith('/dashboard') || path.startsWith('/accounts') || path.startsWith('/topics') ||
      path.startsWith('/scripts') || path.startsWith('/teardowns') || path.startsWith('/calendar') ||
      path.startsWith('/posts') || path.startsWith('/leads') || path.startsWith('/reports')) return 'media';
  if (path.startsWith('/oa')) return 'official';
  if (path.startsWith('/knowledge')) return 'knowledge';
  if (path.startsWith('/settings')) return 'admin';
  return 'media';
}
