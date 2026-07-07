import { NextRequest, NextResponse } from 'next/server';
import { MOCK_MONTHLY_PLAN } from '@/lib/constants/oa-phase3';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { month } = body;
  const plan = MOCK_MONTHLY_PLAN;
  plan.month = month || plan.month;
  return NextResponse.json({
    month: plan.month,
    targetCount: plan.targetCount,
    suggestions: plan.suggestions,
    count: plan.suggestions.length,
    message: `已生成 ${plan.month} 月 ${plan.suggestions.length} 篇内容建议`,
  });
}
