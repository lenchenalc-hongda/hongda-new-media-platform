import { NextRequest, NextResponse } from 'next/server';
import { semanticRetrieve, keywordRetrieve, canUseWebResearch, getWebResearchRules } from '@/lib/ai/retrieval';
import { getCurrentProviderName, isMockMode } from '@/lib/ai/providers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, scenario, limit, knowledgeCards } = body;
    if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    let results: any[] = []; let method = 'none';
    if (knowledgeCards && Array.isArray(knowledgeCards)) {
      results = keywordRetrieve(query, knowledgeCards, limit || 5);
      method = 'keyword';
    } else {
      const r = await semanticRetrieve({ query, limit: limit || 5 });
      results = r.results; method = r.method;
    }
    const webResearch = scenario ? canUseWebResearch(scenario) : false;
    const webRules = getWebResearchRules();
    return NextResponse.json({
      context: results, retrievalMethod: method, totalResults: results.length,
      provider: getCurrentProviderName(), mock: isMockMode(),
      webResearchAllowed: webResearch,
      webResearchRules: { allowed: webRules.allowedScenarios, forbidden: webRules.forbiddenScenarios, enabled: webRules.enabled },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
