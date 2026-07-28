import { NextRequest, NextResponse } from 'next/server';
import { getLLMAdapter, ProductSuggestionResponseSchema } from '@/lib/ai/providers/adapter';
import { resolveAccountGenerationContext, buildPersonaContextForTask, buildPersonaResponseHeaders } from '@/lib/ai/account-resolver';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform } = body;

    const resolved = resolveAccountGenerationContext({
      account_id: body.account_id, account_version: body.account_version, legacy_account: body.account,
      platform, product_or_process: body.productOrProcess, customer_pain: body.customerPain,
    });
    const personaCtx = buildPersonaContextForTask(resolved, 'suggest-products');
    const adapter = await getLLMAdapter();

    var result = await adapter.generateStructuredTask({
      task: 'suggest-products',
      personaContext: personaCtx,
      account: resolved.account,
      productOrProcess: body.productOrProcess,
      customerPain: body.customerPain,
      material: body.material,
    });

    // Validate with Zod
    var validated = ProductSuggestionResponseSchema.safeParse(result);
    if (!validated.success) {
      var fallback = { suggestions: [{ id: 'f1', name: body.productOrProcess || '热转印工艺', reason: '根据客户需求推荐', suitable_for: body.customerPain || '有类似需求的客户', caution: '' }] };
      return NextResponse.json({ suggestions: fallback.suggestions, total: 1, personaVersion: resolved.resolved_account_version });
    }

    var personaHeaders = buildPersonaResponseHeaders(resolved);
    return NextResponse.json({
      suggestions: validated.data.suggestions,
      total: validated.data.suggestions.length,
      personaVersion: resolved.resolved_account_version,
    }, { headers: personaHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
