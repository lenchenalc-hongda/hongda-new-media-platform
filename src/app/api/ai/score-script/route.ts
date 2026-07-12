// POST /api/ai/score-script
// [DEPRECATED] Scoring is now part of the canonical pipeline.
// This wrapper keeps the legacy interface working.

import { NextRequest, NextResponse } from 'next/server';
import { scoreScript } from '@/lib/ai/script-scoring';
import { ScriptScoreInputSchema } from '@/lib/ai/schemas';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ScriptScoreInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400, headers: { 'x-api-deprecated': 'true', 'x-api-deprecated-reason': 'Use POST /api/ai/script/pipeline instead' } });
    }
    const { script, duration } = parsed.data;
    const result = scoreScript(script, duration);
    return NextResponse.json(result, { headers: { 'x-api-deprecated': 'true', 'x-api-deprecated-reason': 'Use POST /api/ai/script/pipeline instead' } });
  } catch (err: any) {
    console.error('[score-script] Error:', err.message);
    return NextResponse.json({ error: 'Failed to score script' }, { status: 500, headers: { 'x-api-deprecated': 'true', 'x-api-deprecated-reason': 'Use POST /api/ai/script/pipeline instead' } });
  }
}
