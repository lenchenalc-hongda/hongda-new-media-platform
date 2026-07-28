import { NextRequest, NextResponse } from 'next/server';
import { getLLMAdapter } from '@/lib/ai/providers/adapter';
import { resolveAccountGenerationContext, buildPersonaContextForTask } from '@/lib/ai/account-resolver';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform } = body;

    // Resolve account (required)
    const resolved = resolveAccountGenerationContext({
      account_id: body.account_id,
      account_version: body.account_version,
      legacy_account: body.account,
      platform,
      product_or_process: body.productOrProcess,
      customer_pain: body.customerPain,
    });
    const personaCtx = buildPersonaContextForTask(resolved, 'suggest-products');
    const adapter = await getLLMAdapter();

    // Use adapter angles method for product suggestion
    const result = await adapter.generateAngles({
      account: resolved.account,
      productOrProcess: body.productOrProcess,
      customerPain: body.customerPain,
      material: body.material,
      personaContext: personaCtx,
    });

    const suggestions = (result.angles || []).slice(0, 8).map((a: any) => ({
      title: a.title,
      reason: a.whyItWorks || a.customerPain || '',
      contentType: a.angleType || 'knowledge',
      riskLevel: a.riskLevel || '低',
    }));

    return NextResponse.json({
      suggestions,
      total: suggestions.length,
      personaVersion: resolved.resolved_account_version,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
