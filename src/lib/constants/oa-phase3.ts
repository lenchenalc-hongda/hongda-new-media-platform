import type { WechatArticle } from './types';

export interface MonthlyPlan {
  month: string;
  targetCount: number;
  suggestions: {
    week: number;
    title: string;
    article_type: string;
    knowledge_card_refs: string[];
    holiday_context?: string;
    reason: string;
  }[];
}

export interface MonthlyReport {
  month: string;
  publishedCount: number;
  onTimeRate: number;
  avgReadCount: number;
  avgShareCount: number;
  leadCount: number;
  topTitlePatterns: string[];
  topColumns: string[];
  topKnowledgeCards: { title: string; references: number }[];
  lowPerformanceReasons: string[];
  suggestions: string[];
}

export const MOCK_MONTHLY_PLAN: MonthlyPlan = {
  month: '2026-07',
  targetCount: 6,
  suggestions: [
    { week: 1, title: 'PE材质热转印完整指南', article_type: '知识解释类', knowledge_card_refs: ['kn10001', 'kn10002'], reason: '高价值知识卡，客户咨询最多的材质问题' },
    { week: 2, title: '热转印vs丝印vs水转印怎么选', article_type: '知识解释类', knowledge_card_refs: ['kn10003', 'kn10004'], reason: '上月表现好的栏目延续' },
    { week: 2, title: '为什么大客户选择宏达', article_type: '宣传信任类', knowledge_card_refs: ['kn10005'], reason: '品牌故事类内容线索转化率高' },
    { week: 3, title: '小暑节气｜热转印温度控制', article_type: '节日/节气类', knowledge_card_refs: ['kn10001'], holiday_context: '小暑', reason: '当月节气内容' },
    { week: 3, title: '客户问价格怎么回？标准流程', article_type: '知识解释类', knowledge_card_refs: ['kn10006', 'kn10007'], reason: 'FAQ高频问题，评论区高频出现' },
    { week: 4, title: '工厂实拍：花膜生产全流程', article_type: '宣传信任类', knowledge_card_refs: ['kn10008'], reason: '视频号内容改公众号，扩大内容利用率' },
  ],
};

export const MOCK_MONTHLY_REPORT: MonthlyReport = {
  month: '2026-06',
  publishedCount: 5,
  onTimeRate: 80,
  avgReadCount: 2350,
  avgShareCount: 128,
  leadCount: 12,
  topTitlePatterns: ['"XX怎么选" 类标题', '"为什么" 开头问题类', '"客户问XX" 场景类'],
  topColumns: ['工艺百科', '品牌故事'],
  topKnowledgeCards: [
    { title: 'PE材质热转印附着力', references: 3 },
    { title: '热转印vs丝印对比', references: 2 },
    { title: '客户问价格回复话术', references: 2 },
  ],
  lowPerformanceReasons: ['节日类内容阅读量偏低', '标题未包含具体产品关键词'],
  suggestions: ['增加"避坑"类内容占30%', '标题加入材质名称+数量关键词', '每篇文章前3段增加一个客户场景'],
};

export const MOCK_ANALYTICS = {
  totalArticles: 8,
  totalReads: 18700,
  totalShares: 1024,
  totalLikes: 356,
  totalMessages: 89,
  totalLeads: 42,
  columnRanking: [
    { column: '工艺百科', reads: 8200, leads: 18 },
    { column: '品牌故事', reads: 5600, leads: 14 },
    { column: '节气科普', reads: 3200, leads: 6 },
    { column: '客户案例', reads: 1700, leads: 4 },
  ],
  dailyReads: [
    { date: '06-01', count: 320 }, { date: '06-05', count: 580 },
    { date: '06-10', count: 420 }, { date: '06-15', count: 750 },
    { date: '06-20', count: 680 }, { date: '06-25', count: 510 },
    { date: '06-30', count: 890 },
  ],
};
