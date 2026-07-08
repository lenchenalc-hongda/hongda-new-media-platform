// POST /api/ai/generate-script-strategy
// 生成脚本策略卡（策略先行）

import { NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai/service';
import { GENERATE_STRATEGY_PROMPT } from '@/lib/ai/prompts';
import { generateScriptStrategy } from '@/lib/ai/script-pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { account, topic, customerPain, productOrProcess, material, knowledgeCards, useAI } = body;

    if (useAI) {
      // Use OpenAI for strategy generation
      const result = await callAI(GENERATE_STRATEGY_PROMPT({
        account: account || {},
        product_or_process: productOrProcess,
        customer_pain: customerPain,
        material,
        target_audience: account?.target_audience,
        conversion_goal: account?.conversion_goal,
        knowledgeCards: knowledgeCards || [],
      }));
      return NextResponse.json({ ...result, mock: false });
    }

    // Use rule-based strategy generation (no API key needed)
    const strategy = generateScriptStrategy({
      account,
      topic: topic || customerPain,
      customerPain,
      productOrProcess,
      material,
      knowledgeCards,
    });

    return NextResponse.json({ ...strategy, mock: true });
  } catch (err: any) {
    console.error('[generate-script-strategy] Error:', err.message);
    return NextResponse.json({ error: 'Failed to generate strategy' }, { status: 500 });
  }
}
