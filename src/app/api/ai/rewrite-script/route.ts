import { NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai/service';
import { REWRITE_SCRIPT_PROMPT } from '@/lib/ai/prompts';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { script, rewrite_style } = body;
  if (!script) return NextResponse.json({ error: 'Missing script' }, { status: 400 });
  const result = await callAI(REWRITE_SCRIPT_PROMPT(script, rewrite_style || '更口语'));
  return NextResponse.json(result);
}
