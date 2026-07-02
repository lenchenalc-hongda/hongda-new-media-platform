import { NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai/service';
import { ACCOUNT_DIAGNOSIS_PROMPT } from '@/lib/ai/prompts';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { account, posts, reviews } = body;
  if (!account) return NextResponse.json({ error: 'Missing account' }, { status: 400 });
  const result = await callAI(ACCOUNT_DIAGNOSIS_PROMPT(account, posts || [], reviews || []));
  return NextResponse.json(result);
}
