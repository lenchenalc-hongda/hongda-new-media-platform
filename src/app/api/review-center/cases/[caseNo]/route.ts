import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireCaseReadUser } from '@/lib/review-center/case-route-auth';
import { toCaseRouteErrorResponse } from '@/lib/review-center/case-route-errors';
import { caseNoSchema } from '@/lib/review-center/case-schemas';
import { callCasePublicDetail } from '@/lib/review-center/case-rpc';

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
