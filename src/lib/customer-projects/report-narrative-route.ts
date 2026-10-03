// @server-only

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  resolveCpcProfile,
  type CpcProfile,
} from './api';
import { ReportNarrativeServiceError } from './report-narrative-server';

export function reportNarrativeJsonError(
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: 'INVALID_REQUEST',
      message,
      data: null,
    },
    { status },
  );
}

export function reportNarrativeErrorResponse(error: unknown): NextResponse {
  if (error instanceof ReportNarrativeServiceError) {
    return NextResponse.json(
      {
        ok: false,
        code: error.code,
        message: error.message,
        data: null,
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      code: 'INTERNAL_ERROR',
      message: 'AI 摘要操作失败，请稍后重试。',
      data: null,
    },
    { status: 500 },
  );
}

export async function resolveReportNarrativeSession(): Promise<
  | { ok: true; session: any; profile: CpcProfile }
  | { ok: false; response: NextResponse }
> {
  const session = await createClient();
  if (!session) {
    return {
      ok: false,
      response: reportNarrativeJsonError('数据库不可用', 500),
    };
  }

  const profileResult = await resolveCpcProfile(session);
  if (!profileResult.ok) {
    return {
      ok: false,
      response: reportNarrativeJsonError(
        profileResult.message,
        profileResult.status,
      ),
    };
  }

  return {
    ok: true,
    session,
    profile: profileResult.profile,
  };
}
