import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  GlhMutationError,
  createGlhTaskOrFollowup,
} from '@/lib/global-lead-hub/mutations';
import {
  loadGlhMyTasks,
  resolveGlhAccessContext,
} from '@/lib/global-lead-hub/server';
import { glhTaskOrFollowupSchema } from '@/lib/global-lead-hub/validation';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ ok: false, error: message, code: code ?? null }, { status });
}

export async function GET() {
  const access = await resolveGlhAccessContext();
  if (!access.ok) {
    return access.code === 'UNAUTHENTICATED'
      ? jsonError('Authentication required', 401, access.code)
      : jsonError('Access denied', 403, access.code);
  }

  const tasks = await loadGlhMyTasks(access.context);
  if (!tasks.ok) {
    return jsonError(
      tasks.message,
      tasks.code === 'LIMIT_EXCEEDED' ? 409 : 500,
      tasks.code,
    );
  }
  return NextResponse.json({ ok: true, data: { tasks: tasks.data } });
}

export async function POST(request: NextRequest) {
  const access = await resolveGlhAccessContext();
  if (!access.ok) {
    return access.code === 'UNAUTHENTICATED'
      ? jsonError('Authentication required', 401, access.code)
      : jsonError('Access denied', 403, access.code);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON', 400, 'INVALID_JSON');
  }

  const parsed = glhTaskOrFollowupSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('Task or follow-up values are invalid', 400, 'INVALID_INPUT');
  }

  const client = await createClient();
  if (!client) return jsonError('Database unavailable', 500, 'DATABASE_UNAVAILABLE');

  try {
    const data = await createGlhTaskOrFollowup(client, parsed.data);
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    if (error instanceof GlhMutationError) {
      return jsonError(error.message, error.status, error.code);
    }
    return jsonError('The task/follow-up boundary failed closed', 500, 'MUTATION_FAILED');
  }
}
