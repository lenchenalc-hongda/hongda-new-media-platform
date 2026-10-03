import { NextRequest, NextResponse } from 'next/server';
import { uuidSchema } from '@/lib/customer-projects/schemas';
import { generateReportNarrative } from '@/lib/customer-projects/report-narrative-server';
import {
  reportNarrativeErrorResponse,
  reportNarrativeJsonError,
  resolveReportNarrativeSession,
} from '@/lib/customer-projects/report-narrative-route';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const reportId = uuidSchema.safeParse(params.id);
  if (!reportId.success) {
    return reportNarrativeJsonError('请求参数无效', 400);
  }

  const context = await resolveReportNarrativeSession();
  if (!context.ok) return context.response;

  try {
    const state = await generateReportNarrative(
      context.session,
      context.profile,
      reportId.data,
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
