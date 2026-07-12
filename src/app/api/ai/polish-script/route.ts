// POST /api/ai/polish-script
// [DEPRECATED] Use rewriteToSpokenScript via the canonical pipeline.

import { NextRequest, NextResponse } from 'next/server';
import { rewriteToSpokenScript } from '@/lib/ai/rewrite-to-spoken-script';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { script, duration } = body;
    if (!script) return NextResponse.json({ error: 'Missing script' }, { status: 400 });

    const result = rewriteToSpokenScript({
      script,
      duration: duration || '30',
      hook: body.hook || '',
    });

    return NextResponse.json({
      polishedScript: result.script,
      changes: result.changes,
      wordCount: result.wordCount,
      lineCount: result.lineCount,
    }, { headers: { 'x-api-deprecated': 'true', 'x-api-deprecated-reason': 'Use POST /api/ai/script/pipeline instead' } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
