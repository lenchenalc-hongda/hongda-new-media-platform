import { NextRequest, NextResponse } from 'next/server';
import { getLLMAdapter, PainSuggestionResponseSchema } from '@/lib/ai/providers/adapter';
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
    const personaCtx = buildPersonaContextForTask(resolved, 'suggest-pains');
    const adapter = await getLLMAdapter();

    var result = await adapter.generateStructuredTask({
      task: 'suggest-pains',
      personaContext: personaCtx,
      account: resolved.account,
      productOrProcess: body.productOrProcess,
      customerPain: body.customerPain,
      material: body.material,
    });

    var validated = PainSuggestionResponseSchema.safeParse(result);
    if (!validated.success) {
      var fallback = { suggestions: [{ id: 'f1', pain: '不确定工艺是否可行', customer_expression: body.customerPain || '不知道能不能做', why_relevant: '客户最初咨询的核心问题' }] };
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
