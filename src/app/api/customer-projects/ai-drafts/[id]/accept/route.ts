import { NextRequest, NextResponse } from 'next/server';
import { runCpcMutation } from '@/lib/customer-projects/api';
import { resolveReportNarrativeSession } from '@/lib/customer-projects/report-narrative-route';
import { uuidSchema } from '@/lib/customer-projects/schemas';
import {
  WeeklySuggestionServiceError,
  assertWeeklySuggestionAcceptable,
} from '@/lib/customer-projects/weekly-report-suggestions-server';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!uuidSchema.safeParse(params.id).success) {
    return NextResponse.json(
      { ok: false, code: 'INVALID_INPUT', message: '请求参数无效', data: null },
      { status: 400 },
    );
  }

  const context = await resolveReportNarrativeSession();
  if (!context.ok) return context.response;

  try {
    await assertWeeklySuggestionAcceptable(
      context.session,
      context.profile,
      params.id,
    );
  } catch (error) {
    if (error instanceof WeeklySuggestionServiceError) {
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
        message: 'AI 建议校验失败，请稍后重试。',
        data: null,
      },
      { status: 500 },
    );
  }

  return runCpcMutation(req, params, 'ACCEPT_AI_DRAFT');
}
