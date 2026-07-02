import { NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai/service';
import { POST_REVIEW_PROMPT } from '@/lib/ai/prompts';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { post, metrics, account, script } = body;
  if (!post || !metrics) return NextResponse.json({ error: 'Missing post or metrics' }, { status: 400 });
  const result = await callAI(POST_REVIEW_PROMPT(post, metrics, account || {}, script || null));
  return NextResponse.json(result);
}
