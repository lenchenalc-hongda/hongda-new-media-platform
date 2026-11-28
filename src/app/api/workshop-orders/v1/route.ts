import type { NextRequest } from 'next/server';
import {
  createWosV1HandlerDependencies,
  handleWosV1Request,
} from '@/lib/workshop-orders/production-app-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const EXECUTION_TIMEOUT_MS = 20000;

async function handle(request: NextRequest): Promise<Response> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      createWosV1HandlerDependencies().then(dependencies =>
        handleWosV1Request(request, dependencies)),
      new Promise<Response>(resolve => {
        timeout = setTimeout(() => resolve(Response.json({
          ok: false,
          code: 'WOS_V1_EXECUTION_TIMEOUT',
          data: null,
        }, {
          status: 504,
          headers: { 'Cache-Control': 'no-store, private' },
        })), EXECUTION_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return Response.json({ ok: false, code: 'WOS_V1_APP_UNAVAILABLE', data: null }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store, private' },
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}
