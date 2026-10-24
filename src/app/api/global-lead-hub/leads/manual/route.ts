import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  GlhMutationError,
  createGlhProductionManualLead,
} from '@/lib/global-lead-hub/mutations';
import { resolveGlhAccessContext } from '@/lib/global-lead-hub/server';
import { glhProductionManualIntakeSchema } from '@/lib/global-lead-hub/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const MAX_BYTES = 16 * 1024;

function result(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

/** Dedicated audited human-intake path: never enable the old test/dev RPC in Production. */
export async function POST(request: NextRequest) {
  const access = await resolveGlhAccessContext();
  if (!access.ok) {
    return access.code === 'UNAUTHENTICATED'
      ? result({ ok: false, code: 'UNAUTHENTICATED', error: 'Sign in required' }, 401)
      : result({ ok: false, code: 'FORBIDDEN', error: 'Access denied' }, 403);
  }

  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return result({ ok: false, code: 'INVALID_INPUT', error: 'JSON body required' }, 415);
  }
  const declaredSize = Number(request.headers.get('content-length') || '0');
  if (!Number.isFinite(declaredSize) || declaredSize > MAX_BYTES) {
    return result({ ok: false, code: 'INVALID_INPUT', error: 'Request too large' }, 413);
  }

  let input: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
      return result({ ok: false, code: 'INVALID_INPUT', error: 'Request too large' }, 413);
    }
    input = JSON.parse(text);
  } catch {
    return result({ ok: false, code: 'INVALID_INPUT', error: 'Invalid JSON' }, 400);
  }

  const parsed = glhProductionManualIntakeSchema.safeParse(input);
  if (!parsed.success) {
    return result({ ok: false, code: 'INVALID_INPUT', error: 'Check lead data and contact method' }, 400);
  }
  // SQL repeats all permission rules against auth.uid(), actor org and active owner.
  // A normal session-bound client is mandatory; never use service-role to create leads.
  const client = await createClient();
  if (!client) return result({ ok: false, code: 'DATABASE_UNAVAILABLE', error: 'Database unavailable' }, 503);

  try {
    const data = await createGlhProductionManualLead(client, parsed.data);
    const replay = data.idempotentReplay === true;
    return result({ ok: true, data }, replay ? 200 : 201);
  } catch (error) {
    if (error instanceof GlhMutationError) {
      return result({ ok: false, code: error.code, error: error.message }, error.status);
    }
    return result({ ok: false, code: 'MUTATION_FAILED', error: 'Lead not saved; please retry' }, 500);
  }
}
