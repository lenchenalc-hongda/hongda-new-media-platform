// ===== 公众号文章模板体系 =====
// 8套内容逻辑模板，提供文章结构和风格指导
import { OAArticleTemplate } from './types';

export const ARTICLE_TEMPLATES: OAArticleTemplate[] = [
  // 1. 技术清单型
  {
    id: 'technical_checklist',
    name: '技术清单型',
    description: '列出需要检查的关键项，适合工艺科普和选购指南类文章',
    suitableArticleTypes: ['technical_guide', 'process_sop'],
    requiredBlocks: ['title', 'lead', 'heading', 'paragraph', 'cta'],
    defaultOutline: [
      '导语：为什么要关注这个技术问题',
      '判断一：第一项关键标准',
      '判断二：第二项关键标准',
      '判断三：第三项关键标准',
      '总结：宏达建议',
    ],
    styleTokens: { mainColor: '#1e40af', accentColor: '#dbeafe', introEmoji: '📋' },
    ctaSuggestions: ['发产品信息，我帮你做对应项评估', '联系销售获取完整技术清单'],
    riskReminders: ['技术类内容引用具体数据时应注明来源', '不要做出绝对承诺'],
  },
  // 2. FAQ解答型
  {
    id: 'faq_answer',
    name: 'FAQ解答型',
    description: '针对客户常见问题进行解答，适合售前咨询场景',
    suitableArticleTypes: ['faq_answer', 'troubleshooting'],
    requiredBlocks: ['title', 'lead', 'heading', 'paragraph', 'quote', 'cta'],
    defaultOutline: [
      '问题引入：这个问题的背景',
      '原因分析：为什么会出现这个问题',
      '解决方案：具体怎么做',
      '注意事项：哪些情况不适用',
    ],
    styleTokens: { mainColor: '#047857', accentColor: '#d1fae5', introEmoji: '❓' },
    ctaSuggestions: ['发产品图片，帮你快速诊断', '还有疑问？联系客服一对一解答'],
    riskReminders: ['不要承诺"肯定能解决"', '复杂问题建议寄样测试'],
  },
  // 3. 工艺避坑型
  {
    id: 'process_risk',
    name: '工艺避坑型',
    description: '指出工艺中常见的错误和风险，帮助客户避免踩坑',
    suitableArticleTypes: ['process_sop', 'troubleshooting'],
    requiredBlocks: ['title', 'lead', 'heading', 'warning', 'paragraph', 'tip', 'cta'],
    defaultOutline: [
      '常见误区：很多人以为这样做是对的',
      '风险一：第一个容易被忽略的坑',
      '风险二：第二个常见错误',
      '风险三：第三个实操陷阱',
      '正确做法：宏达建议的操作流程',
    ],
    styleTokens: { mainColor: '#dc2626', accentColor: '#fee2e2', introEmoji: '⚠️' },
    ctaSuggestions: ['寄样测试，帮你验证工艺可行性', '发产品图，提前排查风险'],
    riskReminders: ['不要渲染恐吓性内容', '风险说明后一定要给解决方案'],
  },
  // 4. 设备选型型
  {
    id: 'machine_selection',
    name: '设备选型型',
    description: '指导客户如何选择合适的设备，适合售前技术咨询',
    suitableArticleTypes: ['machine_selection'],
    requiredBlocks: ['title', 'lead', 'heading', 'paragraph', 'checklist', 'tip', 'cta'],
    defaultOutline: [
      '开头：客户买设备的真实顾虑',
      '判断一：不要只看价格和参数',
      '判断二：看产品、产能、人员匹配',
      '判断三：看培训、调试和售后保障',
      '宏达建议',
    ],
    styleTokens: { mainColor: '#2563eb', accentColor: '#eff6ff', introEmoji: '🔧' },
    ctaSuggestions: ['预约到厂看实际打印效果', '发应用场景，帮你推荐合适机型'],
    riskReminders: ['不要贬低竞品', '参数对比需客观'],
  },
  // 5. 案例复盘型
  {
    id: 'case_study',
    name: '案例复盘型',
    description: '讲述真实客户案例和解决方案，展示宏达实力',
    suitableArticleTypes: ['case_study', 'brand_story'],
    requiredBlocks: ['title', 'lead', 'heading', 'paragraph', 'case', 'cta'],
    defaultOutline: [
      '开头：客户遇到的真实问题',
      '挑战：为什么这个问题很难',
      '分析：我们如何找到方案',
      '执行：方案落地的过程',
      '结果：最终效果和数据',
    ],
    styleTokens: { mainColor: '#7c3aed', accentColor: '#f3e8ff', introEmoji: '📖' },
    ctaSuggestions: ['你也有类似问题？发产品图帮你评估', '看更多宏达客户案例'],
    riskReminders: ['案例需得到客户授权', '数据需真实可查'],
  },
  // 6. 现场排查型
  {
    id: 'troubleshooting',
    name: '现场问题排查型',
    description: '模拟技术顾问现场分析和排查问题的过程',
    suitableArticleTypes: ['troubleshooting', 'faq_answer'],
    requiredBlocks: ['title', 'lead', 'heading', 'paragraph', 'checklist', 'warning', 'tip', 'cta'],
    defaultOutline: [
      '现场描述：客户遇到的具体问题',
      '第一步：先排查什么',
      '第二步：逐项确认什么',
      '第三步：判断问题根源',
      '解决方案和后续建议',
    ],
    styleTokens: { mainColor: '#d97706', accentColor: '#fef3c7', introEmoji: '🔍' },
    ctaSuggestions: ['发产品描述，帮你一步步排查', '寄样到厂，让技术顾问直接诊断'],
    riskReminders: ['最终方案需通过实际测试确认'],
  },
  // 7. 品牌故事型
  {
    id: 'brand_story',
    name: '品牌历史型',
    description: '讲述宏达发展历程和品牌理念，建立客户信任',
    suitableArticleTypes: ['brand_story'],
    requiredBlocks: ['title', 'lead', 'heading', 'paragraph', 'cta'],
    defaultOutline: [
      '开头：一个契机',
      '历程：从花膜加工到设备+材料+工艺一体化',
      '积累：40年做了什么',
      '理念：为什么要做设备+解决方案',
      '现在：能为你做什么',
    ],
    styleTokens: { mainColor: '#1e40af', accentColor: '#f0f5ff', introEmoji: '🏢' },
    ctaSuggestions: ['到厂参观，看宏达的实际生产和案例', '联系销售，了解宏达能为你的项目做什么'],
    riskReminders: ['品牌宣传需实事求是', '不要夸大公司规模或业绩'],
  },
  // 8. 销售转发型
  {
    id: 'sales_enablement',
    name: '销售转发型',
    description: '可直接转发给客户的内容，帮助销售做客户教育',
    suitableArticleTypes: ['sales_enablement', 'technical_guide', 'faq_answer'],
    requiredBlocks: ['title', 'lead', 'heading', 'paragraph', 'quote', 'cta'],
    defaultOutline: [
      '开头：客户最关心的问题',
      '核心观点：一句话说清楚结论',
      '论据一：第一个事实依据',
      '论据二：第二个事实依据',
      '建议：具体怎么做',
      'CTA：自然引导',
    ],
    styleTokens: { mainColor: '#0891b2', accentColor: '#ecfeff', introEmoji: '📱' },
    ctaSuggestions: ['发产品信息给您，宏达帮您免费评估', '转发给有同样需求的朋友'],
    riskReminders: ['不过度承诺', '适合转发的内容要保持中立专业'],
  },
];

export function getArticleTemplateById(id: string): OAArticleTemplate | undefined {
  return ARTICLE_TEMPLATES.find(t => t.id === id);
}

export function getTemplatesForArticleType(type: string): OAArticleTemplate[] {
  return ARTICLE_TEMPLATES.filter(t => t.suitableArticleTypes.includes(type as any));
}
