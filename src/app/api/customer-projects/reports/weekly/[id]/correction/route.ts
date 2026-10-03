import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { expectedVersionSchema, uuidSchema } from '@/lib/customer-projects/schemas';
import {
  WeeklyReportServiceError,
  createWeeklyReportCorrection,
} from '@/lib/customer-projects/weekly-reports-server';
import { resolveReportNarrativeSession } from '@/lib/customer-projects/report-narrative-route';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  expectedVersion: expectedVersionSchema,
  reason: z.string().trim().min(1).max(2000),
}).strict();

function errorResponse(error: unknown) {
  if (error instanceof WeeklyReportServiceError) {
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
      message: '创建周报更正版失败，请稍后重试。',
      data: null,
    },
    { status: 500 },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const reportId = uuidSchema.safeParse(params.id);
  if (!reportId.success) {
    return NextResponse.json(
      { ok: false, code: 'INVALID_INPUT', message: '请求参数无效', data: null },
      { status: 400 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: 'INVALID_INPUT', message: '请求体无效', data: null },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: 'INVALID_INPUT',
        message: '更正版本或原因无效',
        data: null,
      },
      { status: 400 },
    );
  }

  const context = await resolveReportNarrativeSession();
  if (!context.ok) return context.response;

  try {
    const data = await createWeeklyReportCorrection(
      context.session,
      context.profile,
      reportId.data,
      parsed.data.expectedVersion,
      parsed.data.reason,
    );
    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
