import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  expectedVersionSchema,
  uuidSchema,
} from '@/lib/customer-projects/schemas';
import { acceptReportNarrative } from '@/lib/customer-projects/report-narrative-server';
import {
  reportNarrativeErrorResponse,
  reportNarrativeJsonError,
  resolveReportNarrativeSession,
} from '@/lib/customer-projects/report-narrative-route';

export const dynamic = 'force-dynamic';

const acceptSchema = z.object({
  proposalId: uuidSchema,
  expectedProposalVersion: expectedVersionSchema,
  expectedReportVersion: expectedVersionSchema,
}).strict();

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const reportId = uuidSchema.safeParse(params.id);
  if (!reportId.success) {
    return reportNarrativeJsonError('请求参数无效', 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reportNarrativeJsonError('请求体不是有效 JSON', 400);
  }

  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) {
    return reportNarrativeJsonError('提交内容无效', 400);
  }

  const context = await resolveReportNarrativeSession();
  if (!context.ok) return context.response;

  try {
    const state = await acceptReportNarrative(
      context.session,
      context.profile,
      reportId.data,
      parsed.data.proposalId,
      parsed.data.expectedProposalVersion,
      parsed.data.expectedReportVersion,
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
