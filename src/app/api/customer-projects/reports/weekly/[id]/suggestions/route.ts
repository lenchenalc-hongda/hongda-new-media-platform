import { NextRequest, NextResponse } from 'next/server';
import { uuidSchema } from '@/lib/customer-projects/schemas';
import { resolveReportNarrativeSession } from '@/lib/customer-projects/report-narrative-route';
import {
  WeeklySuggestionServiceError,
  generateWeeklySuggestions,
  listWeeklySuggestions,
} from '@/lib/customer-projects/weekly-report-suggestions-server';

export const dynamic = 'force-dynamic';

function jsonError(
  message: string,
  status: number,
  code = 'INVALID_REQUEST',
) {
  return NextResponse.json(
    { ok: false, code, message, data: null },
    { status },
  );
}

function errorResponse(error: unknown) {
  if (error instanceof WeeklySuggestionServiceError) {
    return jsonError(error.message, error.status, error.code);
  }
  return jsonError('周报建议操作失败，请稍后重试。', 500, 'INTERNAL_ERROR');
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const reportId = uuidSchema.safeParse(params.id);
  if (!reportId.success) return jsonError('请求参数无效', 400);

  const context = await resolveReportNarrativeSession();
  if (!context.ok) return context.response;

  try {
    const suggestions = await listWeeklySuggestions(
      context.session,
      context.profile,
      reportId.data,
    );
    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: { suggestions },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const reportId = uuidSchema.safeParse(params.id);
  if (!reportId.success) return jsonError('请求参数无效', 400);

  const context = await resolveReportNarrativeSession();
  if (!context.ok) return context.response;

  try {
    const suggestions = await generateWeeklySuggestions(
      context.session,
      context.profile,
      reportId.data,
    );
    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: { suggestions },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
