// POST /api/ai/generate-script-strategy
// [DEPRECATED] Strategy is now generated inside the canonical pipeline.
// This wrapper returns the strategy from the canonical pipeline result.

import { NextRequest, NextResponse } from 'next/server';
import { generateScriptStrategy } from '@/lib/ai/script-pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const strategy = generateScriptStrategy({
      account: body.account || {},
      topic: body.topic || body.customerPain || '',
      customerPain: body.customerPain || '',
      productOrProcess: body.productOrProcess || body.product_or_process || '',
      material: body.material || '',
      knowledgeCards: body.knowledgeCards || body.knowledge_cards || [],
    });
    return NextResponse.json({ strategy }, { headers: { 'x-api-deprecated': 'true', 'x-api-deprecated-reason': 'Use POST /api/ai/script/pipeline instead' } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
