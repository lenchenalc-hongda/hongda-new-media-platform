import { NextResponse } from 'next/server';
import { MOCK_ANALYTICS } from '@/lib/constants/oa-phase3';

export async function GET() {
  return NextResponse.json(MOCK_ANALYTICS);
}
