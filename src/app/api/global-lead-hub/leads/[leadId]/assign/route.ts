import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  GlhMutationError,
  assignGlhLead,
} from '@/lib/global-lead-hub/mutations';
import { resolveGlhAccessContext } from '@/lib/global-lead-hub/server';
import { glhLeadAssignmentSchema } from '@/lib/global-lead-hub/validation';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ ok: false, error: message, code: code ?? null }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { leadId: string } },
) {
  const access = await resolveGlhAccessContext();
  if (!access.ok) {
    return access.code === 'UNAUTHENTICATED'
      ? jsonError('Authentication required', 401, access.code)
      : jsonError('Access denied', 403, access.code);
  }

  const leadId = z.string().uuid().safeParse(params.leadId);
  if (!leadId.success) return jsonError('Lead identifier is invalid', 400, 'INVALID_LEAD_ID');

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON', 400, 'INVALID_JSON');
  }

  const parsed = glhLeadAssignmentSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('Assignment values are invalid', 400, 'INVALID_INPUT');
  }

  const client = await createClient();
  if (!client) return jsonError('Database unavailable', 500, 'DATABASE_UNAVAILABLE');

  try {
    const data = await assignGlhLead(client, access.context, leadId.data, parsed.data);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof GlhMutationError) {
      return jsonError(error.message, error.status, error.code);
    }
    return jsonError('The assignment boundary failed closed', 500, 'MUTATION_FAILED');
  }
}
