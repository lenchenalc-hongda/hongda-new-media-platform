// POST /api/ai/check-script-risk
// 风险检查：承诺检测、禁止表达检测

import { NextRequest, NextResponse } from 'next/server';
import { checkScriptRisk, removeAiTone } from '@/lib/ai/script-pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { script, knowledgeCards } = body;

    if (!script) {
      return NextResponse.json({ error: '缺少 script 参数' }, { status: 400 });
    }

    const riskResult = checkScriptRisk(script, knowledgeCards);

    // Also check if script has forbidden expressions in polish
    const polished = removeAiTone(script);
    const hadForbidden = polished !== script;

    return NextResponse.json({
      ...riskResult,
      hadForbiddenExpressions: hadForbidden,
    });
  } catch (err: any) {
    console.error('[check-script-risk] Error:', err.message);
    return NextResponse.json({ error: 'Failed to check risk' }, { status: 500 });
  }
}
