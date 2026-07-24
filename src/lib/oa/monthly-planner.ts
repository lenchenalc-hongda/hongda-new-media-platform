// ===== 月度文章计划引擎 (V2 — 基于业务目标 + 来源卡) =====
import { getFestivalsInMonth, FestivalRule } from './festival-rules';
import type { OASourceCard } from './types';

// ===== Types =====

export interface ArticlePlan {
  id: string;
  suggestedDate: string;
  articleType: 'knowledge' | 'faq' | 'case' | 'technical_guide' | 'brand_story' | 'sales_enablement' | 'festival' | 'solarterm';
  title: string;
  summary: string;
  sourceType: 'festival' | 'knowledge_card' | 'source_card' | 'company_promo';
  sourceId: string;
  festivalName?: string;
  sourceCardIds?: string[];
  targetAudience?: string;
  businessGoal?: string;
  suggestedTemplateId?: string;
  suggestedCTA?: string;
}

export interface MonthlyPlan {
  month: number;
  year: number;
  totalCount: number;
  articles: ArticlePlan[];
  festivals: FestivalRule[];
  coverage: Record<string, number>;
  monthlyFocus?: string;
  businessGoal?: string;
  targetAudience?: string;
  requiredArticleMix?: Record<string, number>;
}

export interface PlannerInput {
  month: number;
  year: number;
  targetCount?: number;
  brandFocus?: string[];
  knowledgeCards?: any[];
  sourceCards?: OASourceCard[];
  monthlyFocus?: string;
  businessGoal?: string;
  targetAudience?: string;
  requiredArticleMix?: Record<string, number>;
}

// ===== Helpers =====

const CARD_TYPE_TO_ARTICLE_TYPE: Record<string, string> = {
  knowledge: 'technical_guide', faq: 'faq', case: 'case_study',
  equipment: 'technical_guide', brand: 'brand_story',
};

const ARTICLE_TYPE_TO_TEMPLATE: Record<string, string> = {
  technical_guide: 'technical_checklist', faq_answer: 'faq_answer',
  case_study: 'case_study', brand_story: 'brand_story',
  sales_enablement: 'sales_enablement', machine_selection: 'machine_selection',
};

const BUSINESS_GOAL_MIXES: Record<string, Record<string, number>> = {
  brand_building: { brand_story: 2, case_study: 1, festival: 2 },
  lead_generation: { sales_enablement: 2, machine_selection: 2, festival: 1 },
  customer_education: { technical_guide: 2, faq: 2, festival: 1 },
  case_showcase: { case_study: 2, technical_guide: 2, festival: 1 },
};

const BUSINESS_GOAL_LABELS: Record<string, string> = {
  brand_building: '品牌建设', lead_generation: '销售线索',
  customer_education: '客户教育', case_showcase: '案例展示',
};

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ===== Main generator =====

export function generateMonthlyPlan(input: PlannerInput): MonthlyPlan {
  const {
    month, year, targetCount = 6,
    sourceCards = [], businessGoal,
    monthlyFocus, targetAudience, requiredArticleMix,
  } = input;

  const festivals = getFestivalsInMonth(month);

  // 1. Festival articles (light brand, don't force craft content)
  const festivalArticles: ArticlePlan[] = festivals.map((f, i) => ({
    id: `plan_fest_${month}_${i}`,
    suggestedDate: `${year}-${f.date}`,
    articleType: f.type === 'solarterm' ? 'solarterm' as const : 'festival' as const,
    title: f.titleTemplates[0] || f.name + '文案',
    summary: f.name + (businessGoal ? '｜' + (BUSINESS_GOAL_LABELS[businessGoal] || businessGoal) : ''),
    sourceType: 'festival',
    sourceId: f.name,
    festivalName: f.name,
    targetAudience: targetAudience || '',
    businessGoal: businessGoal || '',
    suggestedTemplateId: 'faq_answer',
    suggestedCTA: '关注宏达印业，获取更多行业资讯',
  }));

  // 2. Determine article mix
  let mix: Record<string, number>;
  if (requiredArticleMix) {
    mix = requiredArticleMix;
  } else if (businessGoal && BUSINESS_GOAL_MIXES[businessGoal]) {
    mix = { ...BUSINESS_GOAL_MIXES[businessGoal] };
  } else {
    mix = { technical_guide: 2, festival: 1, brand_story: 1, case_study: 1 };
  }

  // 3. Business articles from source cards
  const articles: ArticlePlan[] = [...festivalArticles];
  const usedCardIds = new Set<string>();

  Object.entries(mix).forEach(([atype, count]) => {
    if (atype === 'festival' || atype === 'solarterm') return;
    for (let i = 0; i < count; i++) {
      // Find matching source card
      const candidates = sourceCards.filter(c =>
        !usedCardIds.has(c.id) &&
        c.outboundAllowed &&
        CARD_TYPE_TO_ARTICLE_TYPE[c.type] === atype
      );
      const card = candidates[0] || null;

      const day = 3 + (articles.length * 3) % 25;
      const plan: ArticlePlan = {
        id: `plan_${atype}_${month}_${i}`,
        suggestedDate: formatDate(year, month, Math.min(day, 28)),
        articleType: atype as any,
        title: card ? card.title + '深度解读' : `${atype}内容规划`,
        summary: card ? card.coreConclusion.slice(0, 60) : (businessGoal ? '围绕' + (BUSINESS_GOAL_LABELS[businessGoal] || businessGoal) + '目标的内容' : '内容规划'),
        sourceType: 'source_card',
        sourceId: card?.id || `auto_${atype}_${i}`,
        sourceCardIds: card ? [card.id] : [],
        targetAudience: targetAudience || card?.targetAudience || '',
        businessGoal: businessGoal || '',
        suggestedTemplateId: ARTICLE_TYPE_TO_TEMPLATE[atype] || 'technical_checklist',
        suggestedCTA: card?.suggestedCTA || '发产品信息，免费获取方案评估',
      };
      if (card) usedCardIds.add(card.id);
      articles.push(plan);
    }
  });

  // Fill remaining slots
  while (articles.length < targetCount) {
    articles.push({
      id: `plan_fill_${month}_${articles.length}`,
      suggestedDate: formatDate(year, month, 5 + articles.length * 2),
      articleType: 'knowledge',
      title: `内容规划补充 #${articles.length + 1}`,
      summary: '自动填充内容',
      sourceType: 'company_promo',
      sourceId: 'auto_fill',
      targetAudience: targetAudience || '',
      businessGoal: businessGoal || '',
      suggestedTemplateId: 'technical_checklist',
      suggestedCTA: '联系我们获取更多信息',
    });
  }

  // Sort by date
  articles.sort((a, b) => a.suggestedDate.localeCompare(b.suggestedDate));

  // Coverage
  const coverage: Record<string, number> = {};
  articles.forEach(a => { coverage[a.articleType] = (coverage[a.articleType] || 0) + 1; });

  return {
    month, year, totalCount: articles.length, articles, festivals, coverage,
    monthlyFocus, businessGoal, targetAudience, requiredArticleMix: mix,
  };
}
