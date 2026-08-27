import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireCaseReadUser } from '@/lib/review-center/case-route-auth';
import { toCaseRouteErrorResponse } from '@/lib/review-center/case-route-errors';
import { caseNoSchema, parseCaseAuditQuery } from '@/lib/review-center/case-schemas';
import { callCaseAudit } from '@/lib/review-center/case-rpc';
import { resolveAdminCaseId } from '@/lib/review-center/case-id-resolver';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { caseNo: string } },
) {
  try {
    await requireCaseReadUser(req);
    const parsedNo = caseNoSchema.safeParse(params.caseNo);
    if (!parsedNo.success) {
      return NextResponse.json({ error: '请求参数无效' }, { status: 400 });
    }
    const parsedQuery = parseCaseAuditQuery(new URL(req.url).searchParams);
    if (!parsedQuery.ok) {
      return NextResponse.json({ error: '请求参数无效' }, { status: 400 });
    }
    const supabase = await createClient();
    if (!supabase) return toCaseRouteErrorResponse(new Error('supabase unavailable'), { route: 'case-audit' });
    const caseId = await resolveAdminCaseId(supabase, parsedNo.data);
    const result = await callCaseAudit(supabase, caseId, parsedQuery.data);
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return toCaseRouteErrorResponse(err, { route: 'case-audit' });
  }
}
