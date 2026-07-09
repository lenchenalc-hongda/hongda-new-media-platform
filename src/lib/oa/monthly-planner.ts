// ===== 月度文章计划引擎 =====
import { getFestivalsInMonth, FestivalRule } from './festival-rules';

export interface ArticlePlan {
  id: string;
  suggestedDate: string;
  articleType: 'knowledge' | 'promo' | 'festival' | 'solarterm' | 'case' | 'faq';
  title: string;
  summary: string;
  sourceType: 'knowledge_card' | 'festival' | 'company_promo' | 'case_replay' | 'faq';
  sourceId: string;
  festivalName?: string;
}

export interface MonthlyPlan {
  month: number;
  year: number;
  totalCount: number;
  articles: ArticlePlan[];
  festivals: FestivalRule[];
  coverage: { knowledge: number; festival: number; promo: number; case: number };
}

interface PlannerInput {
  month: number;
  year: number;
  targetCount?: number;
  brandFocus?: string[];
  knowledgeCards?: any[];
}

export function generateMonthlyPlan(input: PlannerInput): MonthlyPlan {
  const { month, year, targetCount = 6, brandFocus = [], knowledgeCards = [] } = input;
  
  // 1. Get festivals in this month
  const festivals = getFestivalsInMonth(month);
  const festivalArticles: ArticlePlan[] = festivals.map((f, i) => ({
    id: `plan_fest_${month}_${i}`,
    suggestedDate: `${year}-${f.date}`,
    articleType: f.type === 'solarterm' ? 'solarterm' as const : 'festival' as const,
    title: f.titleTemplates[0],
    summary: `${f.name}相关行业内容`,
    sourceType: 'festival',
    sourceId: f.name,
    festivalName: f.name,
  }));

  // 2. Knowledge card articles
  const knowledgeArticles: ArticlePlan[] = (knowledgeCards || [])
    .filter((k: any) => k.knowledge_status === '已确认' || !k.knowledge_status)
    .slice(0, 2)
    .map((k: any, i: number) => ({
      id: `plan_know_${month}_${i}`,
      suggestedDate: `${year}-${String(month).padStart(2, '0')}-${10 + i * 3}`,
      articleType: k.category?.includes('FAQ') ? 'faq' as const : 'knowledge' as const,
      title: k.title || '知识分享',
      summary: k.core_conclusion?.slice(0, 60) || '',
      sourceType: 'knowledge_card',
      sourceId: k.id,
    }));

  // 3. Company promo articles
  const promoArticles: ArticlePlan[] = [
    {
      id: `plan_promo_${month}_1`,
      suggestedDate: `${year}-${String(month).padStart(2, '0')}-05`,
      articleType: 'promo',
      title: brandFocus.includes('技术') ? '宏达技术实力解析' : '宏达印业品质承诺',
      summary: '公司宣传与实力展示',
      sourceType: 'company_promo',
      sourceId: 'promo_1',
    },
    {
      id: `plan_promo_${month}_2`,
      suggestedDate: `${year}-${String(month).padStart(2, '0')}-20`,
      articleType: 'case',
      title: '客户案例｜热转印如何解决包装难题',
      summary: '真实客户案例解析',
      sourceType: 'case_replay',
      sourceId: 'case_1',
    },
  ];

  // 4. Assemble the plan
  let articles: ArticlePlan[] = [];

  // Insert festival articles at their specific dates
  festivalArticles.forEach(fa => articles.push(fa));

  // Fill remaining slots with knowledge + promo
  const otherArticles = [...knowledgeArticles, ...promoArticles];
  const existingDates = articles.map(a => a.suggestedDate);
  
  otherArticles.forEach(a => {
    if (!existingDates.includes(a.suggestedDate)) {
      articles.push(a);
    }
  });

  // Sort by date
  articles.sort((a, b) => a.suggestedDate.localeCompare(b.suggestedDate));

  // Limit to target count
  articles = articles.slice(0, targetCount);

  // If we have fewer articles than target, add FAQ/Fill articles
  while (articles.length < targetCount) {
    const idx = articles.length;
    articles.push({
      id: `plan_fill_${month}_${idx}`,
      suggestedDate: `${year}-${String(month).padStart(2, '0')}-${15 + idx * 2}`,
      articleType: 'faq',
      title: `客户常见问题第${idx + 1}期`,
      summary: '整理客户常见问题与解答',
      sourceType: 'faq',
      sourceId: `faq_fill_${idx}`,
    });
  }

  // Calculate coverage
  const coverage = {
    knowledge: articles.filter(a => a.sourceType === 'knowledge_card').length,
    festival: articles.filter(a => a.sourceType === 'festival').length,
    promo: articles.filter(a => a.sourceType === 'company_promo').length,
    case: articles.filter(a => a.sourceType === 'case_replay' || a.sourceType === 'faq').length,
  };

  return { month, year, totalCount: articles.length, articles, festivals, coverage };
}
