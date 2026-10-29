import type { NextRequest } from 'next/server';
import { rejectUnsafeWosOfficePost } from '@/lib/workshop-orders/api-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Sampling requests remain independent from production orders. Actual writes
// need an RLS/atomic idempotent RPC and a separately authorized pilot.
export async function POST(req: NextRequest) {
  return rejectUnsafeWosOfficePost(req, 'SAMPLING_REQUEST');
}
