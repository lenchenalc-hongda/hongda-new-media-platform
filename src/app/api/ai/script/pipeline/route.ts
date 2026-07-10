// POST /api/ai/script/pipeline
// Full pipeline: normalize → retrieve → generateAngles → generateHooks → generateDraft → local rules → score → return

import { NextRequest, NextResponse } from 'next/server';
import { runPipeline, splitBroadTopic, generateScriptStrategy, retrieveKnowledgeForScript } from '@/lib/ai/script-pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { account, topic, customerPain, productOrProcess, material, knowledgeCards, video_length, pipelineConfig } = body;

    if (!topic && !customerPain && !productOrProcess) {
      return NextResponse.json({ error: '需要至少提供 topic、customerPain 或 productOrProcess' }, { status: 400 });
    }

    const result = await runPipeline({
      account,
      topic: topic || customerPain,
      customerPain,
      productOrProcess,
      material,
      knowledgeCards,
      video_length: video_length || '30',
      pipelineConfig: { useAI: true, ...pipelineConfig },
    });

    return NextResponse.json({
      ...result,
      mock: result.aiUsed ? false : true,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Pipeline failed', details: err.message }, { status: 500 });
  }
}
