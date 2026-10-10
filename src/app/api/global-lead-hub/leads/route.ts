import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  GlhMutationError,
  createGlhManualTestLead,
} from '@/lib/global-lead-hub/mutations';
import {
  loadGlhLeads,
  resolveGlhAccessContext,
} from '@/lib/global-lead-hub/server';
import {
  getGlhManualCreationGuard,
  glhManualLeadCreateSchema,
  parseGlhLeadListFilters,
} from '@/lib/global-lead-hub/validation';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ ok: false, error: message, code: code ?? null }, { status });
}

function accessError(code: 'UNAUTHENTICATED' | 'FORBIDDEN') {
  return code === 'UNAUTHENTICATED'
    ? jsonError('Authentication required', 401, code)
    : jsonError('Access denied', 403, code);
}

export async function GET(request: NextRequest) {
  const access = await resolveGlhAccessContext();
  if (!access.ok) return accessError(access.code);

  const filters = parseGlhLeadListFilters(request.nextUrl.searchParams);
  const leads = await loadGlhLeads(access.context, filters);
  if (!leads.ok) {
    const status = leads.code === 'LIMIT_EXCEEDED' ? 409 : 500;
    return jsonError(leads.message, status, leads.code);
  }

  return NextResponse.json({
    ok: true,
    data: { leads: leads.data },
  });
}

export async function POST(request: NextRequest) {
  const access = await resolveGlhAccessContext();
  if (!access.ok) return accessError(access.code);

  const guard = getGlhManualCreationGuard();
  if (!guard.allowed) {
    return jsonError(
      'Manual test/dev lead creation is disabled',
      403,
      'MANUAL_CREATION_DISABLED',
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON', 400, 'INVALID_JSON');
  }

  const parsed = glhManualLeadCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('Submitted values are invalid', 400, 'INVALID_INPUT');
  }

  const client = await createClient();
  if (!client) return jsonError('Database unavailable', 500, 'DATABASE_UNAVAILABLE');

  try {
    const data = await createGlhManualTestLead(
      client,
      parsed.data,
      guard.guard,
    );
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    if (error instanceof GlhMutationError) {
      return jsonError(error.message, error.status, error.code);
    }
    return jsonError('The lead creation boundary failed closed', 500, 'MUTATION_FAILED');
  }
}
