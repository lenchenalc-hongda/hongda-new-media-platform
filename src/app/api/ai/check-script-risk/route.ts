// POST /api/ai/check-script-risk
// [DEPRECATED] Risk checking is now part of the canonical pipeline.
// This wrapper keeps the legacy interface working.

import { NextRequest, NextResponse } from 'next/server';
import { checkScriptRisk, removeAiTone } from '@/lib/ai/script-pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { script, knowledgeCards } = body;
    if (!script) return NextResponse.json({ error: 'Missing script' }, { status: 400, headers: { 'x-api-deprecated': 'true', 'x-api-deprecated-reason': 'Use POST /api/ai/script/pipeline instead' } });

    const riskResult = checkScriptRisk(script, knowledgeCards);
    const polished = removeAiTone(script);
    const hadForbidden = polished !== script;

    return NextResponse.json({ ...riskResult, hadForbiddenExpressions: hadForbidden }, { headers: { 'x-api-deprecated': 'true', 'x-api-deprecated-reason': 'Use POST /api/ai/script/pipeline instead' } });
  } catch (err: any) {
    console.error('[check-script-risk] Error:', err.message);
    return NextResponse.json({ error: 'Failed to check risk' }, { status: 500, headers: { 'x-api-deprecated': 'true', 'x-api-deprecated-reason': 'Use POST /api/ai/script/pipeline instead' } });
  }
}
