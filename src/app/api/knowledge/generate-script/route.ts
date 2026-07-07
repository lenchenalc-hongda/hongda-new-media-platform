// POST /api/knowledge/generate-script
// Generate a script outline from a knowledge card

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  cardId: z.string(),
  cardTitle: z.string(),
  cardCategory: z.string(),
  coreConclusion: z.string().optional(),
  mediaExpression: z.string().optional(),
  targetAccount: z.string().optional(),
  platform: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { cardTitle, coreConclusion, mediaExpression } = parsed.data;

    // Mock: generate script from knowledge card
    const script = {
      title: cardTitle + '：一次说清楚',
      hook: cardTitle + '，你知道怎么判断吗？',
      core_point: coreConclusion || cardTitle + '的判断逻辑不复杂',
      script_body: mediaExpression || coreConclusion || cardTitle + '的核心是理解材质和工艺的匹配关系。接下来给你讲清楚。',
      word_count: 120,
      duration: '30秒',
      source_card: cardTitle,
    };

    return NextResponse.json({ script, sourceCard: cardTitle });
  } catch (err: any) {
    console.error('[knowledge/generate-script] Error:', err.message);
    return NextResponse.json({ error: 'Failed to generate script' }, { status: 500 });
  }
}
