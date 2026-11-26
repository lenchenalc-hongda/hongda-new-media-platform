import type { NextRequest } from 'next/server';
import { readWosM4ProofVerifier } from '@/lib/workshop-orders/m4-proof-verifier-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return readWosM4ProofVerifier(request);
}
