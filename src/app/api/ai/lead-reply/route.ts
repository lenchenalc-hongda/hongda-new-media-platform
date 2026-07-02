import { NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai/service';
import { LEAD_REPLY_PROMPT } from '@/lib/ai/prompts';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { lead, customer_message, account_style } = body;
  if (!lead || !customer_message) return NextResponse.json({ error: 'Missing lead or message' }, { status: 400 });
  const result = await callAI(LEAD_REPLY_PROMPT(lead, customer_message, account_style || ''));
  return NextResponse.json(result);
}
