// POST /api/knowledge/generate-topic
// Generate topics from a knowledge card

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  cardId: z.string(),
  cardTitle: z.string(),
  cardCategory: z.string(),
  coreConclusion: z.string().optional(),
  targetAccounts: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { cardTitle, cardCategory, coreConclusion } = parsed.data;

    // Mock: generate topic ideas from the knowledge card
    const topics = [
      {
        title: cardTitle + '：3个关键判断点',
        content_type: cardCategory,
        customer_pain: '不清楚' + cardTitle + '的核心逻辑',
        core_point: coreConclusion || cardTitle + '的判断逻辑',
        why_user_watch: '看完就能判断' + cardTitle,
        source: '知识库',
      },
      {
        title: '客户必看：' + cardTitle + '避坑指南',
        content_type: cardCategory,
        customer_pain: '担心选错或踩坑',
        core_point: cardTitle + '的常见误区',
        why_user_watch: '避免踩坑',
        source: '知识库',
      },
      {
        title: '做了19年热转印，跟你聊聊' + cardTitle,
        content_type: cardCategory,
        customer_pain: '想了解' + cardTitle + '但不知道从哪问起',
        core_point: cardTitle + '的工厂实战经验',
        why_user_watch: '老板亲自讲，真实可靠',
        source: '知识库',
      },
    ];

    return NextResponse.json({ topics, sourceCard: cardTitle, count: topics.length });
  } catch (err: any) {
    console.error('[knowledge/generate-topic] Error:', err.message);
    return NextResponse.json({ error: 'Failed to generate topics' }, { status: 500 });
  }
}
