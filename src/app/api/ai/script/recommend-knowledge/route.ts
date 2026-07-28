import { NextRequest, NextResponse } from 'next/server';
import { getLLMAdapter, KnowledgeRecommendationResponseSchema } from '@/lib/ai/providers/adapter';
import { resolveAccountGenerationContext, buildPersonaContextForTask } from '@/lib/ai/account-resolver';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform } = body;

    const resolved = resolveAccountGenerationContext({
      account_id: body.account_id, account_version: body.account_version, legacy_account: body.account,
      platform, product_or_process: body.productOrProcess, customer_pain: body.customerPain,
    });
    const personaCtx = buildPersonaContextForTask(resolved, 'recommend-knowledge');
    const adapter = await getLLMAdapter();

    var result = await adapter.generateStructuredTask({
      task: 'recommend-knowledge',
      personaContext: personaCtx,
      account: resolved.account,
      productOrProcess: body.productOrProcess,
      customerPain: body.customerPain,
      material: body.material,
    });

    var validated = KnowledgeRecommendationResponseSchema.safeParse(result);
    if (!validated.success) {
      var fallback = { recommendations: [{ id: 'f1', title: '热转印基础判断逻辑', relevance: '高', usage: '脚本/文章', requires_confirmation: false }] };
      return NextResponse.json({ recommendations: fallback.recommendations, total: 1, personaVersion: resolved.resolved_account_version });
    }

    return NextResponse.json({
      recommendations: validated.data.recommendations,
      total: validated.data.recommendations.length,
      personaVersion: resolved.resolved_account_version,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
