import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isoDateSchema } from '@/lib/customer-projects/schemas';
import {
  WeeklyReportServiceError,
  generateWeeklyReportDraft,
} from '@/lib/customer-projects/weekly-reports-server';
import { resolveReportNarrativeSession } from '@/lib/customer-projects/report-narrative-route';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  businessDate: isoDateSchema,
  expectedVersion: z.number().int().min(1).nullable().optional(),
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
      message: '生成周报失败，请稍后重试。',
      data: null,
    },
    { status: 500 },
  );
}

export async function POST(req: NextRequest) {
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
      { ok: false, code: 'INVALID_INPUT', message: '周报日期无效', data: null },
      { status: 400 },
    );
  }

  const context = await resolveReportNarrativeSession();
  if (!context.ok) return context.response;

  try {
    const data = await generateWeeklyReportDraft(
      context.session,
      context.profile,
      parsed.data.businessDate,
      parsed.data.expectedVersion ?? null,
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
