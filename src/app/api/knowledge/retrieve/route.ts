import { NextRequest, NextResponse } from 'next/server';
import { semanticRetrieve, keywordRetrieve } from '@/lib/ai/retrieval';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, limit, filters, knowledgeCards } = body;
    if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    let results: any[] = []; let method = 'none';
    if (knowledgeCards && Array.isArray(knowledgeCards)) {
      results = keywordRetrieve(query, knowledgeCards, limit || 5);
      method = 'keyword';
    } else {
      const r = await semanticRetrieve({ query, limit: limit || 5, filters });
      results = r.results; method = r.method;
    }
    return NextResponse.json({ results, method, total: results.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
