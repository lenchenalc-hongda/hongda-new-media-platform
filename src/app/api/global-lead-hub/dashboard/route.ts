import { NextResponse } from 'next/server';
import {
  loadGlhFollowupDashboard,
  resolveGlhAccessContext,
} from '@/lib/global-lead-hub/server';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

export async function GET() {
  const access = await resolveGlhAccessContext();
  if (!access.ok) {
    return access.code === 'UNAUTHENTICATED'
      ? jsonError('Authentication required', 401, access.code)
      : jsonError('Access denied', 403, access.code);
  }

  const dashboard = await loadGlhFollowupDashboard(access.context);
  if (!dashboard.ok) {
    return jsonError(
      dashboard.message,
      dashboard.code === 'LIMIT_EXCEEDED' ? 409 : 500,
      dashboard.code,
    );
  }

  return NextResponse.json({ ok: true, data: dashboard.data });
}
