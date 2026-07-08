// POST /api/ai/generate-script-draft
// 根据策略生成具体脚本草稿

import { NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai/service';
import { GENERATE_DRAFT_PROMPT } from '@/lib/ai/prompts';
import { generateShortVideoScript, generateScriptStrategy } from '@/lib/ai/script-pipeline';
import { scoreScript } from '@/lib/ai/script-scoring';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { strategy, account, duration, template, knowledgeCards, useAI } = body;

    if (useAI) {
      // Use OpenAI for draft generation
      const result = await callAI(GENERATE_DRAFT_PROMPT(
        strategy,
        account || {},
        template || '标准口播',
      ));
      return NextResponse.json({ ...result, mock: false });
    }

    // Use rule-based draft generation
    const durationStr = duration || '30';
    const scriptStrategy = strategy || generateScriptStrategy({
      account,
      topic: body.topic,
      customerPain: body.customer_pain,
      productOrProcess: body.product_or_process,
    });

    const result = generateShortVideoScript({
      account,
      strategy: scriptStrategy,
      video_length: durationStr,
    });

    const scoreResult = scoreScript(result.script, durationStr);

    return NextResponse.json({
      ...result,
      score: scoreResult,
      mock: true,
    });
  } catch (err: any) {
    console.error('[generate-script-draft] Error:', err.message);
    return NextResponse.json({ error: 'Failed to generate draft' }, { status: 500 });
  }
}
