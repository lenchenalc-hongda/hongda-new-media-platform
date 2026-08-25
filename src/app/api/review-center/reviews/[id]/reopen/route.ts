import { NextRequest } from 'next/server';
import { runLifecycleCommand } from '@/lib/review-center/lifecycle-api';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return runLifecycleCommand(req, params, 'REOPEN');
}
