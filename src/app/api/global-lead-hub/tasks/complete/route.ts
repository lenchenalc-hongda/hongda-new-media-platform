import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { finishGlhManualWork, GlhMutationError } from '@/lib/global-lead-hub/mutations';
import { resolveGlhAccessContext } from '@/lib/global-lead-hub/server';
import { glhManualWorkCompletionSchema } from '@/lib/global-lead-hub/validation';

export const dynamic = 'force-dynamic';

function response(value: Record<string, unknown>, status = 200) {
  return NextResponse.json(value, {
    status, headers: { 'Cache-Control': 'private, no-store' },
  });
}

/** Mark assigned human task/follow-up done, with SQL permission and version check. */
export async function POST(request: NextRequest) {
  const access = await resolveGlhAccessContext();
  if (!access.ok) {
    return response({ ok: false, code: access.code }, access.code === 'UNAUTHENTICATED' ? 401 : 403);
  }
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return response({ ok: false, code: 'INVALID_JSON' }, 400); }
  const parsed = glhManualWorkCompletionSchema.safeParse(raw);
  if (!parsed.success) return response({ ok: false, code: 'INVALID_INPUT' }, 400);

  const client = await createClient();
  if (!client) return response({ ok: false, code: 'DATABASE_UNAVAILABLE' }, 503);
  try {
    const data = await finishGlhManualWork(client, parsed.data);
    return response({ ok: true, data });
  } catch (error) {
    if (error instanceof GlhMutationError) {
      return response({ ok: false, code: error.code, error: error.message }, error.status);
    }
    return response({ ok: false, code: 'MUTATION_FAILED' }, 503);
  }
}
