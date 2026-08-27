import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireCaseReadUser } from '@/lib/review-center/case-route-auth';
import { toCaseRouteErrorResponse } from '@/lib/review-center/case-route-errors';
import { caseNoSchema, caseUpdateRequestSchema } from '@/lib/review-center/case-schemas';
import { callCasePublicDetail, callCaseUpdateDraft } from '@/lib/review-center/case-rpc';
import { resolveAdminCaseId } from '@/lib/review-center/case-id-resolver';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { caseNo: string } },
) {
  try {
    await requireCaseReadUser(req);
    const parsed = caseNoSchema.safeParse(params.caseNo);
    if (!parsed.success) {
      return NextResponse.json({ error: '请求参数无效' }, { status: 400 });
    }
    const supabase = await createClient();
    if (!supabase) return toCaseRouteErrorResponse(new Error('supabase unavailable'), { route: 'case-detail' });
    const result = await callCasePublicDetail(supabase, parsed.data);
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return toCaseRouteErrorResponse(err, { route: 'case-detail' });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { caseNo: string } },
) {
  try {
    await requireCaseReadUser(req);
    const parsedCaseNo = caseNoSchema.safeParse(params.caseNo);
    if (!parsedCaseNo.success) {
      return NextResponse.json({ error: '请求参数无效' }, { status: 400 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: '请求参数无效' }, { status: 400 });
    }
    const parsed = caseUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: '请求参数无效' }, { status: 400 });
    }
    const supabase = await createClient();
    if (!supabase) return toCaseRouteErrorResponse(new Error('supabase unavailable'), { route: 'case-update' });
    const caseId = await resolveAdminCaseId(supabase, parsedCaseNo.data);
    const result = await callCaseUpdateDraft(supabase, caseId, parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return toCaseRouteErrorResponse(err, { route: 'case-update' });
  }
}
