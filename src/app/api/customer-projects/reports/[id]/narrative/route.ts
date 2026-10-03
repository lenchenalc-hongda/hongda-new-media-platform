import { NextRequest, NextResponse } from 'next/server';
import { uuidSchema } from '@/lib/customer-projects/schemas';
import {
  generateReportNarrative,
  readReportNarrativeState,
} from '@/lib/customer-projects/report-narrative-server';
import {
  reportNarrativeErrorResponse,
  reportNarrativeJsonError,
  resolveReportNarrativeSession,
} from '@/lib/customer-projects/report-narrative-route';

export const dynamic = 'force-dynamic';

function validReportId(value: string): string | null {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const reportId = validReportId(params.id);
  if (!reportId) return reportNarrativeJsonError('请求参数无效', 400);

  const context = await resolveReportNarrativeSession();
  if (!context.ok) return context.response;

  try {
    const state = await readReportNarrativeState(
      context.session,
      context.profile,
      reportId,
    );
    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: state,
    });
  } catch (error) {
    return reportNarrativeErrorResponse(error);
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const reportId = validReportId(params.id);
  if (!reportId) return reportNarrativeJsonError('请求参数无效', 400);

  const context = await resolveReportNarrativeSession();
  if (!context.ok) return context.response;

  try {
    const state = await generateReportNarrative(
      context.session,
      context.profile,
      reportId,
    );
    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: state,
    });
  } catch (error) {
    return reportNarrativeErrorResponse(error);
  }
}
