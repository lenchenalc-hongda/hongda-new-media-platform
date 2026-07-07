import type { WechatTemplate, WechatArticle, ArticleBodyBlock, PublishJob } from './types';

export const MOCK_OA_TEMPLATES: WechatTemplate[] = [
  {
    id: 'tpl_001', name: '标准知识卡模板', article_type: '知识解释类',
    header_style: '标题+导语', body_style: '分段+小标题', cta_style: '底部CTA卡片',
    footer_style: '声明+引导关注', is_default: true,
    layout_json: { sections: ['header', 'lead', 'body', 'cta', 'footer'] },
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  },
  {
    id: 'tpl_002', name: '品牌故事模板', article_type: '宣传信任类',
    header_style: '大图+标题', body_style: '叙事体', cta_style: '内联CTA',
    footer_style: '品牌Slogan+二维码', is_default: false,
    layout_json: { sections: ['cover', 'story', 'body', 'cta', 'footer'] },
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  },
  {
    id: 'tpl_003', name: '节气问候模板', article_type: '节日/节气类',
    header_style: '节气海报+标题', body_style: '短段落', cta_style: '互动引导',
    footer_style: '节日祝福+活动信息', is_default: false,
    layout_json: { sections: ['poster', 'greeting', 'body', 'cta', 'footer'] },
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  },
];

const blocks1: ArticleBodyBlock[] = [
  { type: 'title', content: 'PE材质到底能不能做热转印？一次说清楚' },
  { type: 'subtitle', content: '很多客户问这个问题，今天就给你讲明白' },
  { type: 'paragraph', content: 'PE（聚乙烯）是包装行业最常用的塑料之一，化妆品瓶、日化瓶、食品容器很多都是PE材质。但PE表面能低，一直是热转印行业的老大难问题。' },
  { type: 'quote', content: '核心判断：PE能做热转印，但不是所有PE都能直接印。关键在于——表面处理。' },
  { type: 'paragraph', content: 'PE材料分HDPE（高密度）和LDPE（低密度）两种。HDPE硬度高、表面相对平整，热转印效果较好；LDPE偏软、表面能更低，需要更严格的前处理。' },
  { type: 'tip', content: '发产品图片给我们，免费帮您判断是否适合热转印，并寄打样板确认效果。' },
  { type: 'cta', content: '想了解您的产品能不能做热转印？添加客服微信，发产品图片和数量，免费评估。' },
];

const blocks2: ArticleBodyBlock[] = [
  { type: 'title', content: '19年热转印老厂，为什么客户持续选择我们？' },
  { type: 'subtitle', content: '不靠低价，靠的是把每一张花膜印对' },
  { type: 'paragraph', content: '从2007年第一台热转印机开始，宏达印业已经在这个行业走了19年。19年意味着什么？我们用三点来讲清楚。' },
  { type: 'paragraph', content: '第一，材质数据库。19年来我们测试过上千种材质，PE、PP、ABS、PET、PC、亚克力、不锈钢、玻璃——每种材质用什么胶水、什么温度、什么压力，都有完整的测试记录。' },
  { type: 'image', content: '', caption: '宏达车间实拍：热转印生产现场' },
  { type: 'paragraph', content: '第二，花膜一体化。我们不只做印刷，还做花膜生产。从设计、制版、打样到量产，全链条把控，减少中间环节的沟通损耗和质量风险。' },
  { type: 'cta', content: '想了解宏达能否为您的产品提供热转印方案？发产品图片和数量，我们免费评估出方案。' },
];

export const MOCK_OA_ARTICLES: WechatArticle[] = [
  {
    id: 'oa_001', title: 'PE材质到底能不能做热转印？一次说清楚',
    subtitle: '很多客户问这个问题，今天就给你讲明白', summary: 'PE材质热转印的完整技术分析',
    article_type: '知识解释类', column_name: '工艺百科',
    cover_asset_id: null, template_id: 'tpl_001',
    body_blocks: blocks1, body_markdown: blocks1.map(b => b.content).join('\n\n'),
    source_knowledge_card_ids: ['kn10001', 'kn10002'],
    holiday_tag: null, schedule_at: null,
    publish_status: 'draft', reviewer_id: null,
    risk_level: '低', risk_notes: [],
    word_count: 420, estimated_read_time: 3,
    created_by: 'u1', updated_by: null,
    created_at: '2026-07-06T10:00:00Z', updated_at: '2026-07-06T10:00:00Z',
  },
  {
    id: 'oa_002', title: '19年热转印老厂，为什么客户持续选择我们？',
    subtitle: '不靠低价，靠的是把每一张花膜印对', summary: '宏达印业品牌故事',
    article_type: '宣传信任类', column_name: '品牌故事',
    cover_asset_id: null, template_id: 'tpl_002',
    body_blocks: blocks2, body_markdown: blocks2.map(b => b.content).join('\n\n'),
    source_knowledge_card_ids: ['kn10003'],
    holiday_tag: null, schedule_at: '2026-07-10T08:00:00Z',
    publish_status: 'scheduled', reviewer_id: 'u4',
    risk_level: '低', risk_notes: [],
    word_count: 380, estimated_read_time: 3,
    created_by: 'u1', updated_by: null,
    created_at: '2026-07-05T14:00:00Z', updated_at: '2026-07-05T14:00:00Z',
  },
  {
    id: 'oa_003', title: '小暑节气｜热转印行业的"热度"是什么？',
    subtitle: '节气聊聊热转印的"热度"控制', summary: '小暑节气与热转印工艺温度科普',
    article_type: '节日/节气类', column_name: '节气科普',
    cover_asset_id: null, template_id: 'tpl_003',
    body_blocks: [
      { type: 'title', content: '小暑｜热转印的"热度"学问' },
      { type: 'paragraph', content: '小暑到，气温升高。今天借这个"热"字，聊聊热转印行业的热度控制。热转印的温度不是越高越好——温度高了，膜会烧焦；温度低了，印不牢。' },
      { type: 'paragraph', content: '不同材质需要的热转印温度完全不同：ABS约180°C，PP约160°C，PE需要先测表面能再定温。' },
      { type: 'cta', content: '您的产品用什么材质？发给我们免费测试最佳转印温度。' },
    ],
    body_markdown: null, source_knowledge_card_ids: ['kn10001'],
    holiday_tag: '小暑', schedule_at: null,
    publish_status: 'published_mock', reviewer_id: 'u4',
    risk_level: '低', risk_notes: [],
    word_count: 250, estimated_read_time: 2,
    created_by: 'u1', updated_by: null,
    created_at: '2026-07-04T09:00:00Z', updated_at: '2026-07-04T09:00:00Z',
  },
];

export const MOCK_PUBLISH_JOBS: PublishJob[] = [
  {
    id: 'pj_001', channel_type: 'wechat_oa', entity_type: 'article',
    entity_id: 'oa_003', schedule_at: '2026-07-04T09:00:00Z',
    job_status: 'success', retry_count: 0, mock_publish_id: 'mock_pub_001',
    last_error: null, created_at: '2026-07-04T09:00:00Z', updated_at: '2026-07-04T09:00:00Z',
  },
];
