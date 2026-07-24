// ===== 文章生成流水线 =====

import { OA_SOURCE_CARDS, getOASourceCardsByIds } from '@/lib/constants/oa-source-cards';
import {
  OASourceCard, OAArticleStrategy, OAArticleDraft, OABodyBlock,
  OAArticleType, OAArticleTemplate, GenerateArticleInput, GenerateArticleOutput,
} from './types';
import { getArticleTemplateById, getTemplatesForArticleType } from './article-templates';

// ===== Helpers =====

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function slugify(text: string): string {
  return text.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').slice(0, 40);
}

function now(): string { return new Date().toISOString(); }

// ===== Strategy generation =====

const ARTICLE_TYPE_MAP: Record<string, OAArticleType> = {
  'knowledge': 'technical_guide', 'faq': 'faq_answer', 'case': 'case_study',
  'product': 'machine_selection', 'equipment': 'machine_selection', 'brand': 'brand_story',
};

export function generateArticleStrategy(input: GenerateArticleInput): OAArticleStrategy {
  const cards = getOASourceCardsByIds(input.sourceCardIds);
  if (cards.length === 0) throw new Error('sourceCardIds 未找到对应卡片');

  const first = cards[0];
  const articleType = input.articleType || ARTICLE_TYPE_MAP[first.type] || 'technical_guide';
  const template = getTemplatesForArticleType(articleType)[0];

  // Build strategy content from source cards
  const customerPain = cards.map(c => c.customerPain).filter(Boolean).join('；') || first.coreConclusion.slice(0, 30);
  const targetAudience = input.targetAudience || first.targetAudience;
  const corePoint = first.coreConclusion;
  const risks = cards.flatMap(c => c.riskNotes).filter((r, i, a) => a.indexOf(r) === i);
  const cta = cards.find(c => c.suggestedCTA)?.suggestedCTA || '联系我们获取更多信息';
  const ctaType = cta.includes('寄样') ? 'send_sample'
    : cta.includes('发产品') ? 'ask_product_info'
    : cta.includes('预约') || cta.includes('到厂') ? 'book_demo'
    : cta.includes('联系销售') ? 'contact_sales' : 'save_article';

  const articleAngle = [pick(cards).keyPoints[0] || '', pick(cards).keyPoints[1] || ''].filter(Boolean).join('，');

  return {
    id: 'strat_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    topic: first.title + '：深度解读与实践指南',
    articleType,
    targetAudience,
    customerPain,
    corePoint,
    sourceCardIds: input.sourceCardIds,
    articleAngle,
    recommendedTemplateId: template?.id || 'technical_checklist',
    riskToAvoid: risks,
    ctaType,
    coverTitle: first.title.slice(0, 20),
    summary: '本文基于' + cards.map(c => c.title).join('、') + '等内容生成，为你讲清楚' + corePoint.slice(0, 40),
  };
}

// ===== Outline generation =====

export function generateArticleOutline(strategy: OAArticleStrategy, cards: OASourceCard[]): string[] {
  const template = getArticleTemplateById(strategy.recommendedTemplateId);
  const outline = template ? [...template.defaultOutline] : ['导语', '正文', '总结'];
  // Personalize outline with source card content
  const painPoint = cards.map(c => c.customerPain).filter(Boolean)[0] || strategy.customerPain;
  const solution = cards.map(c => c.coreConclusion).filter(Boolean)[0] || strategy.corePoint;
  return outline.map(line => line
    .replace('技术问题', strategy.topic.slice(0, 15))
    .replace('这个', painPoint ? '「' + painPoint.slice(0, 20) + '」' : '这个工艺')
    .replace('分析', '：' + solution.slice(0, 25))
  );
}

// ===== Draft generation (deterministic mock) =====

function generateBlocks(strategy: OAArticleStrategy, cards: OASourceCard[], template: OAArticleTemplate): OABodyBlock[] {
  const blocks: OABodyBlock[] = [];
  let idx = 0;

  // Title
  blocks.push({ id: `b${idx++}`, type: 'title', content: strategy.coverTitle + '：' + strategy.summary.slice(0, 30) });

  // Lead
  blocks.push({
    id: `b${idx++}`, type: 'lead',
    content: strategy.targetAudience + '，你是否遇到这样的问题：' + strategy.customerPain + '？这篇文章帮你分析清楚。',
  });

  // Headings + paragraphs from key points
  cards.forEach((card, ci) => {
    if (ci > 2) return; // max 3 cards
    card.keyPoints.slice(0, 3).forEach((kp, ki) => {
      blocks.push({ id: `b${idx++}`, type: 'heading', content: kp });
      blocks.push({
        id: `b${idx++}`, type: 'paragraph',
        content: kp + '。' + (card.coreConclusion.slice(0, 60)) + '根据宏达多年经验，' + (ki === 0 ? '这是判断的第一步。' : ki === 1 ? '这一点很多人会忽略。' : '确认这些后基本可以做出判断。'),
      });
    });

    // Risk notes as warning or tip
    if (card.riskNotes.length > 0 && ci === 0) {
      blocks.push({ id: `b${idx++}`, type: 'warning', content: '⚠️ ' + card.riskNotes[0] });
    }
  });

  // Quote from core conclusion
  if (cards[0]?.coreConclusion) {
    blocks.push({ id: `b${idx++}`, type: 'quote', content: cards[0].coreConclusion });
  }

  // Tip from applicable scenarios
  const scenarios = cards.flatMap(c => c.applicableScenarios).slice(0, 3);
  if (scenarios.length > 0) {
    blocks.push({
      id: `b${idx++}`, type: 'tip', content: '💡 适用场景',
      items: scenarios,
    });
  }

  // CTA
  const ctaText = strategy.ctaType === 'send_sample' ? '寄样测试，免费评估可行性'
    : strategy.ctaType === 'ask_product_info' ? '发产品图和材质，帮你判断工艺方案'
    : strategy.ctaType === 'book_demo' ? '预约到厂，看实际生产和案例'
    : strategy.ctaType === 'contact_sales' ? '联系销售，了解更多详情'
    : '收藏本文，方便需要时查看';
  blocks.push({ id: `b${idx++}`, type: 'cta', content: ctaText });

  return blocks;
}

function renderMarkdown(blocks: OABodyBlock[]): string {
  return blocks.map(b => {
    switch (b.type) {
      case 'title': return `# ${b.content}\n`;
      case 'lead': return `> ${b.content}\n`;
      case 'heading': return `## ${b.content}\n`;
      case 'paragraph': return `${b.content}\n`;
      case 'quote': return `> ${b.content}\n`;
      case 'warning': return `> ⚠️ ${b.content}\n`;
      case 'tip': return `${b.content}\n${b.items?.map(i => `- ${i}`).join('\n') || ''}\n`;
      case 'checklist': return `${b.content}\n${b.items?.map(i => `- [ ] ${i}`).join('\n') || ''}\n`;
      case 'case': return `**案例：** ${b.content}\n`;
      case 'cta': return `---\n> ${b.content}\n`;
      default: return `${b.content}\n`;
    }
  }).join('\n');
}

export function generateArticleDraft(
  strategy: OAArticleStrategy,
  cards: OASourceCard[],
  template?: OAArticleTemplate,
): OAArticleDraft {
  const tmpl = template || getArticleTemplateById(strategy.recommendedTemplateId) || getArticleTemplateById('technical_checklist')!;
  const outline = generateArticleOutline(strategy, cards);
  const blocks = generateBlocks(strategy, cards, tmpl);
  const bodyMarkdown = renderMarkdown(blocks);

  return {
    id: 'draft_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    strategyId: strategy.id,
    title: strategy.coverTitle + '：' + strategy.summary.slice(0, 25),
    coverTitle: strategy.coverTitle,
    summary: strategy.summary,
    outline,
    bodyBlocks: blocks,
    bodyMarkdown,
    templateId: tmpl.id,
    sourceCardIds: strategy.sourceCardIds,
    score: 70,
    riskLevel: 'low',
    status: 'draft',
    usage: 'wechat_publish',
    createdAt: now(),
    updatedAt: now(),
  };
}

// ===== Scoring =====

const FORBIDDEN_WORDS = ['全国最好', '绝对不掉', '完全一致', '闭眼选', '永不褪色', '行业第一', '最专业', '最便宜', '保证不掉', '保证能做', '零风险', '100%'];

export function scoreOAArticle(draft: OAArticleDraft): { score: number; riskLevel: 'low' | 'medium' | 'high'; notes: string[] } {
  const notes: string[] = [];
  let score = 80;

  // Check for forbidden words
  const violations = FORBIDDEN_WORDS.filter(w => draft.bodyMarkdown.includes(w));
  if (violations.length > 0) { score -= violations.length * 10; notes.push('发现禁止词：' + violations.join('、')); }

  // Check structure
  const hasHeading = draft.bodyBlocks.some(b => b.type === 'heading');
  const hasCTA = draft.bodyBlocks.some(b => b.type === 'cta');
  const hasLead = draft.bodyBlocks.some(b => b.type === 'lead');

  if (!hasHeading) { score -= 10; notes.push('缺少小标题'); }
  if (!hasCTA) { score -= 10; notes.push('缺少CTA引导'); }
  if (!hasLead) { score -= 5; notes.push('缺少导语段落'); }

  // Check content depth
  if (draft.bodyBlocks.length < 5) { score -= 10; notes.push('内容块偏少'); }
  if (draft.bodyMarkdown.length < 300) { score -= 5; notes.push('正文内容较短'); }

  // Check source card coverage
  const cardReferences = draft.sourceCardIds.length;
  if (cardReferences === 0) { score -= 10; notes.push('未引用任何来源卡'); }

  const riskLevel = score >= 70 ? 'low' : score >= 50 ? 'medium' : 'high';
  return { score: Math.max(0, Math.min(100, score)), riskLevel, notes };
}

// ===== HTML Rendering =====

export function renderOAArticleHtml(draft: OAArticleDraft, template?: OAArticleTemplate): string {
  const tmpl = template || getArticleTemplateById(draft.templateId || '');
  const mainColor = tmpl?.styleTokens?.mainColor || '#1e40af';
  const accentColor = tmpl?.styleTokens?.accentColor || '#dbeafe';

  const blocksHtml = draft.bodyBlocks.map(b => {
    switch (b.type) {
      case 'title':
        return `<h1 style="font-size:22px;font-weight:700;margin:20px 0 10px;line-height:1.5;color:#1a1a1a;">${b.content}</h1>`;
      case 'lead':
        return `<p style="font-size:15px;color:#555;margin:12px 0;padding:12px 16px;background:#f9f9f9;border-radius:8px;line-height:1.8;">${b.content}</p>`;
      case 'heading':
        return `<h2 style="font-size:17px;font-weight:600;margin:24px 0 12px;padding-left:12px;border-left:4px solid ${mainColor};color:#1a1a1a;">${b.content}</h2>`;
      case 'paragraph':
        return `<p style="font-size:15px;margin:10px 0;line-height:1.8;color:#333;">${b.content}</p>`;
      case 'quote':
        return `<blockquote style="border-left:4px solid ${mainColor};padding:12px 16px;margin:16px 0;background:${accentColor};font-size:15px;color:#1a1a1a;border-radius:0 8px 8px 0;">${b.content}</blockquote>`;
      case 'tip':
        return `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:14px;color:#166534;"><strong>${b.content}</strong>${b.items ? '<ul style="margin:8px 0 0 16px;padding:0;">' + b.items.map(i => `<li style="margin:4px 0;">${i}</li>`).join('') + '</ul>' : ''}</div>`;
      case 'warning':
        return `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:14px;color:#991b1b;">${b.content}</div>`;
      case 'checklist':
        return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:14px;"><strong>${b.content}</strong>${b.items ? '<ul style="margin:8px 0 0 16px;padding:0;">' + b.items.map(i => `<li style="margin:4px 0;list-style:none;">☐ ${i}</li>`).join('') + '</ul>' : ''}</div>`;
      case 'case':
        return `<div style="background:${accentColor};border-radius:8px;padding:16px;margin:16px 0;"><p style="font-size:14px;font-weight:600;color:${mainColor};margin:0 0 8px;">📌 客户案例</p><p style="font-size:15px;line-height:1.8;color:#333;margin:0;">${b.content}</p></div>`;
      case 'cta':
        return `<div style="background:${mainColor};color:white;border-radius:8px;padding:16px;margin:24px 0;text-align:center;font-size:15px;font-weight:500;line-height:1.6;">${b.content}</div>`;
      case 'image':
        return `<div style="background:#f3f4f6;border-radius:8px;height:200px;display:flex;align-items:center;justify-content:center;margin:16px 0;color:#9ca3af;font-size:14px;">📷 ${b.alt || '图片占位'}</div>`;
      default:
        return `<p style="margin:8px 0;font-size:15px;line-height:1.8;">${b.content}</p>`;
    }
  }).join('\n');

  return `<section style="max-width:680px;margin:0 auto;font-family:-apple-system,'Noto Sans SC','PingFang SC',sans-serif;padding:20px;line-height:1.8;color:#333;">
    ${blocksHtml}
    <div style="margin-top:30px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#aaa;text-align:center;">
      <p>宏达印业 · 热转印方案专家</p>
      <p style="margin-top:4px;font-size:11px;color:#ccc;">本文由宏达新媒体作战中台生成 · 参考自知识库</p>
    </div>
  </section>`;
}

// ===== Full pipeline =====

export function runArticlePipeline(input: GenerateArticleInput): GenerateArticleOutput {
  const cards = getOASourceCardsByIds(input.sourceCardIds);
  if (cards.length === 0) throw new Error('请至少选择一条内容来源卡');

  // Check outbound restriction
  const restricted = cards.filter(c => !c.outboundAllowed);
  if (restricted.length > 0 && input.usage === 'wechat_publish') {
    throw new Error('部分来源卡(' + restricted.map(c => c.title).join('、') + ')不允许对外发布，请重新选择或更改使用场景');
  }

  const strategy = generateArticleStrategy(input);
  const template = input.templateId ? getArticleTemplateById(input.templateId) : undefined;
  const draft = generateArticleDraft(strategy, cards, template);
  const score = scoreOAArticle(draft);

  return { strategy, draft, score };
}
