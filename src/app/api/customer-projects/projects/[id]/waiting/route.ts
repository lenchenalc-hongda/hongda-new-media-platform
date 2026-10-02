import { NextRequest } from 'next/server';
import { runCpcMutation } from '@/lib/customer-projects/api';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return runCpcMutation(req, params, 'SET_WAITING');
}
