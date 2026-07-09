// POST /api/oa/generate-monthly-plan
// Auto-generates a monthly article plan using the monthly planner engine

import { NextRequest, NextResponse } from 'next/server';
import { generateMonthlyPlan } from '@/lib/oa/monthly-planner';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { month, year, targetCount, brandFocus, knowledgeCards } = body;

    const currentMonth = month || new Date().getMonth() + 1;
    const currentYear = year || new Date().getFullYear();

    const plan = generateMonthlyPlan({
      month: currentMonth,
      year: currentYear,
      targetCount: targetCount || 6,
      brandFocus: brandFocus || [],
      knowledgeCards: knowledgeCards || [],
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
