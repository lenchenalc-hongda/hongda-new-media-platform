import { NextRequest, NextResponse } from 'next/server';
import { readTeamBoardSnapshot } from '@/lib/customer-projects/team-board-server';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const result = await readTeamBoardSnapshot();

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    code: 'OK',
    message: 'success',
    data: result.data,
  });
}
