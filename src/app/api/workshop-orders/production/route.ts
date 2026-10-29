import type { NextRequest } from 'next/server';
import { rejectUnsafeWosOfficePost } from '@/lib/workshop-orders/api-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Production orders remain a distinct endpoint. Never silently create a DRAFT
// when the caller asked for an auditable SUBMITTED production order.
export async function POST(req: NextRequest) {
  return rejectUnsafeWosOfficePost(req, 'PRODUCTION_ORDER');
}
