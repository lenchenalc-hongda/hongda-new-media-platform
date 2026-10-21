import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { changeGlhManualHumanStage, GlhMutationError } from '@/lib/global-lead-hub/mutations';
import { resolveGlhAccessContext } from '@/lib/global-lead-hub/server';
import { glhManualHumanStageSchema } from '@/lib/global-lead-hub/validation';

export const dynamic = 'force-dynamic';

function response(value: Record<string, unknown>, status = 200) {
  return NextResponse.json(value, {
    status, headers: { 'Cache-Control': 'private, no-store' },
  });
}

/** Human-only manual lead stage transition, never touches external source-of-truth. */
export async function POST(
  request: NextRequest,
  { params }: { params: { leadId: string } },
) {
  const access = await resolveGlhAccessContext();
  if (!access.ok) {
    return response({ ok: false, code: access.code }, access.code === 'UNAUTHENTICATED' ? 401 : 403);
  }
  const leadId = z.string().uuid().safeParse(params.leadId);
  if (!leadId.success) return response({ ok: false, code: 'INVALID_LEAD_ID' }, 400);

  let raw: unknown;
  try { raw = await request.json(); }
  catch { return response({ ok: false, code: 'INVALID_JSON' }, 400); }

  const parsed = glhManualHumanStageSchema.safeParse(raw);
  if (!parsed.success) return response({ ok: false, code: 'INVALID_INPUT' }, 400);
  const client = await createClient();
  if (!client) return response({ ok: false, code: 'DATABASE_UNAVAILABLE' }, 503);

  try {
    const data = await changeGlhManualHumanStage(client, leadId.data, parsed.data);
    return response({ ok: true, data });
  } catch (error) {
    if (error instanceof GlhMutationError) {
      return response({ ok: false, code: error.code, error: error.message }, error.status);
    }
    return response({ ok: false, code: 'MUTATION_FAILED' }, 503);
  }
}
