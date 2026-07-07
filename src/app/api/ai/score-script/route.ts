// POST /api/ai/score-script
// Returns a penalty-first short-video scorecard for a given script.
// No OpenAI key needed — scoring is rule-based.

import { NextRequest, NextResponse } from 'next/server';
import { scoreScript, ScriptScoreResult } from '@/lib/ai/script-scoring';
import { ScriptScoreInputSchema, ScriptScoreOutputSchema } from '@/lib/ai/schemas';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ScriptScoreInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { script, duration } = parsed.data;
    const result: ScriptScoreResult = scoreScript(script, duration);

    const output = ScriptScoreOutputSchema.parse(result);
    return NextResponse.json(output);
  } catch (err: any) {
    console.error('[score-script] Error:', err.message);
    return NextResponse.json({ error: 'Failed to score script' }, { status: 500 });
  }
}
