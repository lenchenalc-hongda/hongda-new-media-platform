// POST /api/ai/generate-script
// [DEPRECATED] Use POST /api/ai/script/pipeline instead.
// This wrapper maps the legacy payload to the canonical pipeline.

import { NextRequest, NextResponse } from 'next/server';
import { runCanonicalPipeline } from '@/lib/ai/script-pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await runCanonicalPipeline({
      account: body.account || {},
      topic: body.topic || body.title || '',
      customerPain: body.customer_pain || body.customerPain || '',
      productOrProcess: body.product_or_process || body.productOrProcess || '',
      material: body.material || '',
      knowledgeCards: body.knowledge_cards || body.knowledgeCards || [],
      durationSeconds: (body.duration || body.video_length || '30') as '15' | '30' | '60',
      video_length: body.video_length || body.duration || '30',
      selectedAngleId: body.selected_angle_id || body.selectedAngleId || null,
      selectedHookId: body.selected_hook_id || body.selectedHookId || null,
    });
    return NextResponse.json({ ...result, legacy: true }, { headers: { 'x-api-deprecated': 'true', 'x-api-deprecated-reason': 'Use POST /api/ai/script/pipeline instead' } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
