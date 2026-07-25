// ===== 公众号视觉主题系统 =====
export interface OATheme {
  id: string; name: string; description: string;
  primaryColor: string; secondaryColor: string; accentColor: string;
  textColor: string; mutedTextColor: string; backgroundColor: string;
  sectionTitleStyle: 'filled' | 'line' | 'icon' | 'card';
  dividerStyle: 'line' | 'pattern' | 'icon' | 'spacer';
  borderRadius: string; spacingScale: number;
  headerBg?: string; footerBg?: string; patternColor?: string;
  /** 固定页眉图片（公众号顶部品牌图） */
  headerImage?: string;
  /** 固定页脚二维码 */
  qrCode?: string;
}

export const OA_THEMES: OATheme[] = [
  {
    id: 'hongda_blue', name: '宏达工业蓝', description: '专业、稳重、工业感',
    primaryColor: '#1e40af', secondaryColor: '#3b82f6', accentColor: '#dbeafe',
    textColor: '#1a1a2e', mutedTextColor: '#6b7280', backgroundColor: '#ffffff',
    sectionTitleStyle: 'filled', dividerStyle: 'line', borderRadius: '8px', spacingScale: 4,
    headerBg: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)', patternColor: '#bfdbfe',
  headerImage: '/oa/header.png', qrCode: '/oa/header-qr.png',
  },
  {
    id: 'uv_tech', name: 'UV科技风', description: '现代、科技、简洁',
    primaryColor: '#0891b2', secondaryColor: '#06b6d4', accentColor: '#ecfeff',
    textColor: '#164e63', mutedTextColor: '#64748b', backgroundColor: '#f8fafc',
    sectionTitleStyle: 'card', dividerStyle: 'icon', borderRadius: '12px', spacingScale: 4,
    headerBg: 'linear-gradient(135deg, #0e7490 0%, #0891b2 100%)',
  headerImage: '/oa/header.png', qrCode: '/oa/header-qr.png',
  },
  {
    id: 'case_study', name: '案例复盘', description: '温暖、案例感、可信',
    primaryColor: '#7c3aed', secondaryColor: '#a855f7', accentColor: '#f3e8ff',
    textColor: '#2e1065', mutedTextColor: '#6b7280', backgroundColor: '#faf5ff',
    sectionTitleStyle: 'line', dividerStyle: 'pattern', borderRadius: '8px', spacingScale: 4,
    headerBg: 'linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)',
  headerImage: '/oa/header.png', qrCode: '/oa/header-qr.png',
  },
  {
    id: 'brand_story', name: '品牌故事', description: '大气、品牌力、高端',
    primaryColor: '#1e3a5f', secondaryColor: '#334155', accentColor: '#f0f5ff',
    textColor: '#0f172a', mutedTextColor: '#64748b', backgroundColor: '#ffffff',
    sectionTitleStyle: 'icon', dividerStyle: 'spacer', borderRadius: '4px', spacingScale: 5,
    headerBg: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
  headerImage: '/oa/header.png', qrCode: '/oa/header-qr.png',
  },
  {
    id: 'sales_forward', name: '销售简洁', description: '简洁、直接、行动导向',
    primaryColor: '#dc2626', secondaryColor: '#ef4444', accentColor: '#fee2e2',
    textColor: '#1a1a2e', mutedTextColor: '#6b7280', backgroundColor: '#ffffff',
    sectionTitleStyle: 'line', dividerStyle: 'line', borderRadius: '6px', spacingScale: 3,
  headerImage: '/oa/header.png', qrCode: '/oa/header-qr.png',
  },
  {
    id: 'festival_light', name: '节日轻品牌', description: '温暖、节日氛围、亲和',
    primaryColor: '#d97706', secondaryColor: '#f59e0b', accentColor: '#fef3c7',
    textColor: '#78350f', mutedTextColor: '#92400e', backgroundColor: '#fffbeb',
    sectionTitleStyle: 'filled', dividerStyle: 'pattern', borderRadius: '10px', spacingScale: 4,
    headerBg: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)', patternColor: '#fbbf24',
  headerImage: '/oa/header.png', qrCode: '/oa/header-qr.png',
  },
];
