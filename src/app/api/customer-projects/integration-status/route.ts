import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCpcProfile } from '@/lib/customer-projects/api';
import { readCpcIntegrationStatus } from '@/lib/customer-projects/integration-status-server';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  if (!supabase) return jsonError('数据库不可用', 500);

  const profileResult = await resolveCpcProfile(supabase);
  if (!profileResult.ok) {
    return jsonError(profileResult.message, profileResult.status);
  }

  const statusResult = await readCpcIntegrationStatus(
    supabase,
    profileResult.profile,
  );
  if (!statusResult.ok) {
    return jsonError(statusResult.message, statusResult.status);
  }

  return NextResponse.json({
    ok: true,
    code: 'OK',
    message: 'success',
    data: statusResult.snapshot,
  });
}
