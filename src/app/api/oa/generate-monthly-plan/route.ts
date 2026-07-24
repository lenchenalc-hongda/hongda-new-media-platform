import { NextRequest, NextResponse } from 'next/server';
import { generateMonthlyPlan } from '@/lib/oa/monthly-planner';
import { OA_SOURCE_CARDS } from '@/lib/constants/oa-source-cards';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { month, year, targetCount, businessGoal, monthlyFocus, targetAudience, requiredArticleMix } = body;

    const currentMonth = month || new Date().getMonth() + 1;
    const currentYear = year || new Date().getFullYear();

    const plan = generateMonthlyPlan({
      month: currentMonth,
      year: currentYear,
      targetCount: targetCount || 6,
      sourceCards: OA_SOURCE_CARDS.filter(c => c.outboundAllowed),
      businessGoal: businessGoal || 'customer_education',
      monthlyFocus,
      targetAudience,
      requiredArticleMix,
    });

    return NextResponse.json({
      ...plan,
      generated: true,
      mock: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
