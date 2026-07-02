import { NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai/service';
import { VIRAL_TEARDOWN_PROMPT } from '@/lib/ai/prompts';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await callAI(VIRAL_TEARDOWN_PROMPT(body));
  return NextResponse.json(result);
}
