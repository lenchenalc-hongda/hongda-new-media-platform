// POST /api/ai/generate-script-pipeline
// 端到端脚本流水线：输入 → 拆分 → 策略 → 草稿 → 评分 → 输出
// 同时返回 15s / 30s / 60s 变体

import { NextRequest, NextResponse } from 'next/server';
import { runPipeline, removeAiTone, PipelineResult } from '@/lib/ai/script-pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      account,
      topic,
      customerPain,
      productOrProcess,
      material,
      knowledgeCards,
      video_length: videoLength,
    } = body;

    if (!topic && !customerPain && !productOrProcess) {
      return NextResponse.json({ error: '需要至少提供 topic、customerPain 或 productOrProcess' }, { status: 400 });
    }

    // Run the full pipeline
    const result: PipelineResult = runPipeline({
      account,
      topic: topic || customerPain,
      customerPain,
      productOrProcess,
      material,
      knowledgeCards,
      video_length: videoLength || '30',
    });

    // Apply AI tone removal to all variants
    const cleanedVariants = result.variants.map(v => ({
      ...v,
      script: removeAiTone(v.script),
    }));

    // Clean the best variant too
    const cleanedBest = result.bestVariant ? {
      ...result.bestVariant,
      script: removeAiTone(result.bestVariant.script),
    } : null;

    return NextResponse.json({
      ...result,
      variants: cleanedVariants,
      bestVariant: cleanedBest,
      mock: true,
    });
  } catch (err: any) {
    console.error('[generate-script-pipeline] Error:', err.message);
    return NextResponse.json({ error: 'Pipeline failed', details: err.message }, { status: 500 });
  }
}
