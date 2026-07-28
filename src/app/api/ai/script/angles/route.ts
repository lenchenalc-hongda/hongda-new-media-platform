import { NextRequest, NextResponse } from 'next/server';
import { getLLMAdapter } from '@/lib/ai/providers/adapter';
import { resolveAccountGenerationContext, buildPersonaContextForTask } from '@/lib/ai/account-resolver';
import { generateAngles as templateAngles } from '@/lib/ai/angle-generator';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform, productOrProcess, customerPain, material, knowledgeCards, recentScripts } = body;

    if (!customerPain && !productOrProcess) {
      return NextResponse.json({ error: '需要至少提供 customerPain 或 productOrProcess' }, { status: 400 });
    }

    // 1. Try persona V2 with adapter
    try {
      const resolved = resolveAccountGenerationContext({
        account_id: body.account_id,
        account_version: body.account_version,
        legacy_account: body.account,
        platform, product_or_process: productOrProcess, customer_pain: customerPain,
      });
      const personaCtx = buildPersonaContextForTask(resolved, 'angles');
      const adapter = await getLLMAdapter();

      const result = await adapter.generateAngles({
        account: resolved.account,
        productOrProcess, customerPain, material,
        knowledgeCards, platform,
        personaContext: personaCtx,
      });

      if (result.angles && result.angles.length >= 3) {
        return NextResponse.json({
          angles: result.angles,
          total: result.angles.length, method: 'ai',
          personaVersion: resolved.resolved_account_version,
        });
      }
    } catch (e: any) {
      console.warn('[Angles API] V2 failed, falling back to templates:', e.message);
    }

    // 2. Fallback to template-based angles
    const result = await templateAngles({ account: body.account, platform, productOrProcess, customerPain, material, knowledgeCards, recentScripts });
    return NextResponse.json({ angles: result.angles, total: result.angles.length, method: result.method });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
