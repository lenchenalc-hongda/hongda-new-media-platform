// POST /api/ai/generate-script-draft
// [DEPRECATED] Use POST /api/ai/script/pipeline instead.

import { NextRequest, NextResponse } from 'next/server';
import { runCanonicalPipeline } from '@/lib/ai/script-pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const strategy = body.strategy || {};
    const result = await runCanonicalPipeline({
      account: body.account || strategy.account || {},
      topic: strategy.topic || body.topic || '',
      customerPain: strategy.customerPain || body.customerPain || '',
      productOrProcess: body.productOrProcess || '',
      material: body.material || '',
      knowledgeCards: body.knowledgeCards || [],
      durationSeconds: (body.duration || body.video_length || '30') as '15' | '30' | '60',
      video_length: body.duration || body.video_length || '30',
    });
    return NextResponse.json(result, { headers: { 'x-api-deprecated': 'true', 'x-api-deprecated-reason': 'Use POST /api/ai/script/pipeline instead' } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
