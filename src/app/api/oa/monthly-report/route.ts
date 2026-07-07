import { NextRequest, NextResponse } from 'next/server';
import { MOCK_MONTHLY_REPORT } from '@/lib/constants/oa-phase3';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { month } = body;
  const report = MOCK_MONTHLY_REPORT;
  return NextResponse.json({
    ...report,
    month: month || report.month,
    generatedAt: new Date().toISOString(),
  });
}
