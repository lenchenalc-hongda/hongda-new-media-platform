import { NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai/service';
import { LEAD_SCORE_PROMPT } from '@/lib/ai/prompts';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { lead } = body;
  if (!lead) return NextResponse.json({ error: 'Missing lead' }, { status: 400 });
  const result = await callAI(LEAD_SCORE_PROMPT(lead));
  return NextResponse.json(result);
}
