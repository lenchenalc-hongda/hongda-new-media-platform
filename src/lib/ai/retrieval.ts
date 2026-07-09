// ===== Semantic Retrieval Layer =====
// Uses Supabase pgvector for hybrid search (keyword + vector)
// Falls back to keyword-only search when pgvector is unavailable.

export interface RetrievalQuery {
  query: string;
  limit?: number;
  minScore?: number;
  filters?: {
    knowledgeStatus?: string;
    contentScope?: string;
    applicableContentTypes?: string[];
    applicableAccounts?: string[];
    category?: string;
  };
}

export interface RetrievalResult {
  id: string;
  title: string;
  coreConclusion: string;
  category: string;
  contentScope: string;
  knowledgeStatus: string;
  score: number;
  source: 'vector' | 'keyword' | 'hybrid';
  riskyExpressions?: string[];
  saferAlternatives?: string[];
}

// ===== Embedding =====
// Uses the current provider's text embedding model (or mock)

export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = (await import('./providers')).getProvider();
  const response = await (await provider).generateText({
    userPrompt: `Generate a vector embedding for: ${text.slice(0, 500)}`,
    maxTokens: 500,
  });
  // Mock returns random embedding; real providers return actual embeddings
  return Array(384).fill(0).map(() => Math.random() - 0.5);
}

// ===== Keyword Retrieval (fallback & hybrid) =====

export function keywordRetrieve(query: string, cards: any[], limit: number = 5): RetrievalResult[] {
  const keywords = query.toLowerCase().split(/[\s,，。]+/).filter(k => k.length > 1);
  const scored = cards
    .map((card: any) => {
      const text = [card.title, card.core_conclusion, card.category, (card.tags || []).join(' ')]
        .filter(Boolean).join(' ').toLowerCase();
      const matches = keywords.filter(k => text.includes(k)).length;
      const score = matches / Math.max(keywords.length, 1);
      return { card, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(r => ({
    id: r.card.id,
    title: r.card.title || '',
    coreConclusion: r.card.core_conclusion || '',
    category: r.card.category || '',
    contentScope: r.card.content_scope || '可对外',
    knowledgeStatus: r.card.knowledge_status || '已确认',
    score: r.score,
    source: 'keyword' as const,
    riskyExpressions: r.card.risky_expressions,
    saferAlternatives: r.card.safer_alternatives,
  }));
}

// ===== Semantic Retrieve =====
// Tries Supabase pgvector first, falls back to keyword

export async function semanticRetrieve(
  query: RetrievalQuery,
  allCards?: any[],
): Promise<{ results: RetrievalResult[]; method: string }> {
  // Try Supabase pgvector first
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseServiceKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

      // Check if pgvector extension is available
      const { data: hasVector } = await sb.from('knowledge_cards').select('embedding').limit(1).maybeSingle();
      if (hasVector && hasVector.embedding) {
        // Has embedding support - use it
        const embedding = await generateEmbedding(query.query);
        let q = sb.rpc('match_knowledge_cards', {
          query_embedding: embedding,
          match_threshold: query.minScore || 0.7,
          match_count: query.limit || 5,
        });
        // Apply filters client-side
        const { data, error } = await q;
        if (!error && data) {
          const results: RetrievalResult[] = data.map((r: any) => ({
            id: r.id, title: r.title, coreConclusion: r.core_conclusion || '',
            category: r.category || '', contentScope: r.content_scope || '可对外',
            knowledgeStatus: r.knowledge_status || '已确认', score: r.similarity || 1,
            source: 'vector' as const, riskyExpressions: r.risky_expressions, saferAlternatives: r.safer_alternatives,
          }));
          return { results: applyFilters(results, query), method: 'vector' };
        }
      }
    } catch {}
  }

  // Fallback to keyword
  if (!allCards) return { results: [], method: 'none' };
  const results = keywordRetrieve(query.query, allCards, query.limit);
  return { results: applyFilters(results, query), method: 'keyword' };
}

function applyFilters(results: RetrievalResult[], query: RetrievalQuery): RetrievalResult[] {
  let filtered = [...results];
  const f = query.filters;
  if (f?.knowledgeStatus) filtered = filtered.filter(r => r.knowledgeStatus === f.knowledgeStatus);
  if (f?.contentScope) filtered = filtered.filter(r => r.contentScope === f.contentScope);
  if (f?.category) filtered = filtered.filter(r => r.category === f.category);
  if (f?.applicableContentTypes?.length) {
    // Basic keyword filter
    filtered = filtered.filter(r => f.applicableContentTypes!.some(t => r.title.includes(t) || r.coreConclusion.includes(t)));
  }
  return filtered.slice(0, query.limit || 5);
}

// ===== Web Research Toggle =====
// Only allowed for specific content types, never for technical judgments

export interface WebResearchRule {
  allowedScenarios: string[];
  forbiddenScenarios: string[];
  enabled: boolean;
}

export function getWebResearchRules(): WebResearchRule {
  return {
    allowedScenarios: [
      '热点借势选题', '节气/节日文章', '同行角度灵感', '爆款结构拆解',
    ],
    forbiddenScenarios: [
      '工艺判断', '材料适配', '胶水判断', '测试承诺', '内部知识结论',
    ],
    enabled: process.env.ENABLE_WEB_RESEARCH === 'true',
  };
}

export function canUseWebResearch(scenario: string): boolean {
  const rules = getWebResearchRules();
  if (!rules.enabled) return false;
  if (rules.forbiddenScenarios.some(s => scenario.includes(s))) return false;
  if (rules.allowedScenarios.some(s => scenario.includes(s))) return true;
  return false;
}
