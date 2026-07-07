import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  articleId: z.string(),
  experimentType: z.enum(['title', 'summary', 'cover']).default('title'),
  variantA: z.string(),
  variantB: z.string(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const exp = {
    id: 'exp_' + Date.now(),
    articleId: parsed.data.articleId,
    experimentType: parsed.data.experimentType,
    variantA: parsed.data.variantA,
    variantB: parsed.data.variantB,
    metricType: 'read_count',
    winnerVariant: null,
    status: 'running',
    createdAt: new Date().toISOString(),
    mockResult: {
      variantA_reads: Math.floor(Math.random() * 200) + 100,
      variantB_reads: Math.floor(Math.random() * 200) + 100,
    },
  };

  return NextResponse.json({
    experiment: exp,
    message: `A/B 实验已创建：${parsed.data.experimentType} 对比`,
    note: 'Mock 模式：结果数据为模拟，配置真实公众号后自动切换',
  });
}
