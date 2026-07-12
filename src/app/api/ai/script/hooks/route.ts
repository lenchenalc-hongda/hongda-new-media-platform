import { NextRequest, NextResponse } from 'next/server';
import { generateHookCandidates } from '@/lib/ai/hook-generator';
import { scoreAndRankHooks } from '@/lib/ai/hook-scoring';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      account, platform, productOrProcess, customerPain, material,
      knowledgeCards, recentScripts, angle,
    } = body;

    if (!customerPain && !productOrProcess && !angle) {
      return NextResponse.json(
        { error: '至少需要提供 customerPain、productOrProcess 或 angle' },
        { status: 400 }
      );
    }

    // 1. Generate 20 hook candidates
    const result = await generateHookCandidates({
      account,
      platform,
      productOrProcess,
      customerPain,
      material,
      knowledgeCards,
      recentScripts,
      angle,
    });

    // 2. Score and rank all hooks
    const scored = scoreAndRankHooks(result.hooks, {
      pain: customerPain || angle?.customerPain,
      product: productOrProcess,
    });

    return NextResponse.json({
      hooks: scored.results,
      top3: scored.top3,
      top5: scored.top5,
      total: result.hooks.length,
      method: result.method,
    });
  } catch (err: any) {
    console.error('[Hooks API] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
