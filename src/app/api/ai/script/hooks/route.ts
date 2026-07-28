import { NextRequest, NextResponse } from 'next/server';
import { getLLMAdapter } from '@/lib/ai/providers/adapter';
import { resolveAccountGenerationContext, buildPersonaContextForTask } from '@/lib/ai/account-resolver';
import { generateHookCandidates as templateHooks } from '@/lib/ai/hook-generator';
import { scoreAndRankHooks } from '@/lib/ai/hook-scoring';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform, productOrProcess, customerPain, material, knowledgeCards, recentScripts, angle } = body;

    if (!customerPain && !productOrProcess && !angle) {
      return NextResponse.json({ error: '至少需要提供 customerPain、productOrProcess 或 angle' }, { status: 400 });
    }

    // 1. Try persona V2 with adapter
    try {
      const resolved = resolveAccountGenerationContext({
        account_id: body.account_id,
        account_version: body.account_version,
        legacy_account: body.account,
        platform, product_or_process: productOrProcess, customer_pain: customerPain,
      });
      const personaCtx = buildPersonaContextForTask(resolved, 'hooks');
      const adapter = await getLLMAdapter();

      const result = await adapter.generateHooks({
        account: resolved.account,
        productOrProcess, customerPain, material, angle,
        knowledgeCards, recentScripts,
        personaContext: personaCtx,
      });

      if (result.hooks && result.hooks.length >= 3) {
        const scorableHooks = result.hooks.map(function(h: any) { return { ...h, score: 80, scoreDetail: [], similarityToRecentScripts: [] }; });
        const scored = scoreAndRankHooks(scorableHooks, { pain: customerPain || angle?.customerPain, product: productOrProcess });
        return NextResponse.json({
          hooks: scored.results, top3: scored.top3, top5: scored.top5,
          total: result.hooks.length, method: 'ai',
          personaVersion: resolved.resolved_account_version,
        });
      }
    } catch (e: any) {
      console.warn('[Hooks API] V2 failed, falling back to templates:', e.message);
    }

    // 2. Fallback to template-based hooks
    const result = await templateHooks({ account: body.account, platform, productOrProcess, customerPain, material, knowledgeCards, recentScripts, angle });
    const scorableHooks = result.hooks.map(function(h: any) { return { ...h, score: 80, scoreDetail: [], similarityToRecentScripts: [] }; });
        const scored = scoreAndRankHooks(scorableHooks, { pain: customerPain || angle?.customerPain, product: productOrProcess });
    return NextResponse.json({ hooks: scored.results, top3: scored.top3, top5: scored.top5, total: result.hooks.length, method: result.method });
  } catch (err: any) {
    console.error('[Hooks API] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
