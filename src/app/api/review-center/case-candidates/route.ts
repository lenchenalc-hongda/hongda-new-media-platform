import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireCaseReadUser } from '@/lib/review-center/case-route-auth';
import { toCaseRouteErrorResponse } from '@/lib/review-center/case-route-errors';
import { parseCaseCandidateQuery } from '@/lib/review-center/case-schemas';
import { callCaseCandidates } from '@/lib/review-center/case-rpc';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireCaseReadUser(req);
    const parsed = parseCaseCandidateQuery(new URL(req.url).searchParams);
    if (!parsed.ok) {
      return NextResponse.json({ error: '请求参数无效' }, { status: 400 });
    }
    const supabase = await createClient();
    if (!supabase) return toCaseRouteErrorResponse(new Error('supabase unavailable'), { route: 'case-candidates' });
    const result = await callCaseCandidates(supabase, parsed.data);
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return toCaseRouteErrorResponse(err, { route: 'case-candidates' });
  }
}
