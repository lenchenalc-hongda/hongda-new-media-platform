import { NextRequest } from 'next/server';
import { runCpcMutation } from '@/lib/customer-projects/api';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return runCpcMutation(req, {}, 'CREATE_PROVISIONAL_CUSTOMER');
}
