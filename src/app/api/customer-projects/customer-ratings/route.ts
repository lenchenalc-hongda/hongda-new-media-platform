import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { resolveCpcProfile } from '@/lib/customer-projects/api';
import { uuidSchema } from '@/lib/customer-projects/schemas';
import {
  calculatePotentialRating,
  customerSalesStrategy,
  publishedPotentialGrade,
  type PotentialRatingScores,
} from '@/lib/customer-projects/customer-potential-rating';

export const dynamic = 'force-dynamic';

const MAX_RATING_CUSTOMERS = 500;
const scoresSchema = z.object({
  purchase_scope: z.number().int().min(0).max(5),
  process_fit: z.number().int().min(0).max(5),
  project_evidence: z.number().int().min(0).max(5),
  decision_access: z.number().int().min(0).max(5),
  repeat_value: z.number().int().min(0).max(5),
}).strict();

const saveSchema = z.object({
  customerReferenceId: uuidSchema,
  scores: scoresSchema,
  evidenceSummary: z.string().max(3000),
  expectedVersion: z.number().int().min(1).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.evidenceSummary.trim().length < 20) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidenceSummary'],
      message: '评级生效前，请填写至少20字的客户事实依据',
    });
  }
});

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

function rpcReply(result: any) {
  if (result.error) return fail('客户评级保存失败，请刷新后重试', 500);
  const value = result.data;
  if (value?.ok === true && value.code === 'OK') {
    return NextResponse.json({ ok: true, data: value.data });
  }
  const code = value?.code;
  return fail(
    code === 'VERSION_CONFLICT' ? '此客户评级已被其他人更新，请刷新后重试'
      : code === 'FORBIDDEN' ? '仅客户负责人或该客户的项目负责人可保存潜力评级'
        : code === 'INVALID_TRANSITION' ? '当前评级状态不能进行此操作'
          : code === 'NOT_FOUND' ? '客户评级不存在'
            : '请检查评分和证明材料是否完整',
    code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404
      : code === 'VERSION_CONFLICT' || code === 'INVALID_TRANSITION' ? 409 : 422,
  );
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  if (!supabase) return fail('数据库不可用', 503);
  const auth = await resolveCpcProfile(supabase);
  if (!auth.ok) return fail(auth.message, auth.status);

  const customerIdParam = req.nextUrl.searchParams.get('customerId');
  const parsedId = customerIdParam ? uuidSchema.safeParse(customerIdParam) : null;
  if (parsedId && !parsedId.success) return fail('客户编号无效', 400);

  const { profile } = auth;

  try {
    let customerQuery = supabase.from('cpc_customer_references')
      .select('id,reference_kind,external_customer_id')
      .eq('org_id', profile.orgId)
      .in('status', ['active', 'pending_review'])
      .limit(MAX_RATING_CUSTOMERS);
    if (parsedId?.success) customerQuery = customerQuery.eq('id', parsedId.data);
    const customersResult = await customerQuery;
    if (customersResult.error) throw new Error('customer visibility lookup failed');
    const customers = (customersResult.data ?? []) as Array<{
      id: string;
      reference_kind: string;
      external_customer_id: string | null;
    }>;
    if (parsedId?.success && customers.length === 0) return fail('客户不存在或不可见', 404);
    if (customers.length >= MAX_RATING_CUSTOMERS) return fail('客户超过查询上限，请缩小范围', 409);
    if (customers.length === 0) {
      return NextResponse.json({
        ok: true,
        data: { summaries: [], detail: null },
      });
    }

    const ids = customers.map(row => row.id);
    const [assessmentResult, ownerResult, workspaceResult, ratingAccessResult] = await Promise.all([
      supabase.from('cpc_customer_potential_assessments')
        .select('id,customer_reference_id,assessor_profile_id,scores,assessment_score,evidence_summary,opportunity_summary,estimated_annual_opportunity_cny_yuan,next_action,next_check_on,status,published_grade,published_score,published_at,review_note,reviewed_at,version,updated_at')
        .eq('org_id', profile.orgId)
        .in('customer_reference_id', ids)
        .limit(MAX_RATING_CUSTOMERS),
      supabase.rpc('cpc_customer_maintenance_owners', { p_customer_ids: ids }),
      supabase.from('cpc_customer_workspaces')
        .select('customer_reference_id,customer_note,note_version,note_updated_at,opportunity_summary,estimated_annual_opportunity_cny_yuan,next_action,next_check_on,plan_version,plan_updated_at')
        .eq('org_id', profile.orgId)
        .in('customer_reference_id', ids)
        .limit(MAX_RATING_CUSTOMERS),
      supabase.rpc('cpc_customer_self_rating_access', { p_customer_ids: ids }),
    ]);

    if (assessmentResult.error || ownerResult.error || workspaceResult.error || ratingAccessResult.error) {
      // No silent N fallback if the migration is missing: it would misstate data.
      return fail('客户评级服务尚未完成数据库初始化，请联系管理员', 503);
    }

    const ratingByCustomer = new Map<string, any>(
      (assessmentResult.data ?? []).map((row: any) => [row.customer_reference_id, row]),
    );
    const ownerByCustomer = new Map<string, any>(
      (ownerResult.data ?? []).map((row: any) => [row.customer_reference_id, row]),
    );
    const workspaceByCustomer = new Map<string, any>(
      (workspaceResult.data ?? []).map((row: any) => [row.customer_reference_id, row]),
    );
    const ratingAccessByCustomer = new Map<string, any>(
      (ratingAccessResult.data ?? []).map((row: any) => [row.customer_reference_id, row]),
    );

    const summaries = customers.map(customer => {
      const rating = ratingByCustomer.get(customer.id) ?? null;
      const owner = ownerByCustomer.get(customer.id) ?? null;
      const workspace = workspaceByCustomer.get(customer.id) ?? null;
      const ratingAccess = ratingAccessByCustomer.get(customer.id) ?? null;
      const actualGrade = 'N' as const;
      const potentialGrade = publishedPotentialGrade({ publishedGrade: rating?.published_grade });
      return {
        customerReferenceId: customer.id,
        actualGrade,
        actualEvidenceState: 'ungraded' as const,
        actualExplanation: '财务权威回款尚未完成只读接入，不能以0元代替未知数据',
        potentialGrade,
        potentialStatus: rating?.status ?? 'ungraded',
        potentialScore: rating?.published_score ?? null,
        pendingScore: rating?.assessment_score ?? null,
        maintenanceOwnerProfileId: owner?.owner_profile_id ?? null,
        maintenanceOwnerName: owner?.owner_name ?? null,
        canAssess: owner?.can_assess === true,
        canRate: ratingAccess?.can_rate === true,
        lastRaterName: ratingAccess?.last_rater_name ?? null,
        isMaintenanceOwner: owner?.owner_profile_id === profile.id,
        customerNotePreview: workspace?.customer_note ? String(workspace.customer_note).slice(0, 140) : null,
        nextAction: workspace?.next_action || null,
        nextCheckOn: workspace?.next_check_on ?? null,
        strategy: customerSalesStrategy(actualGrade, potentialGrade),
      };
    });

    let detail: Record<string, unknown> | null = null;
    if (parsedId?.success) {
      const rating = ratingByCustomer.get(parsedId.data) ?? null;
      detail = rating ? {
        id: rating.id,
        scores: rating.scores as PotentialRatingScores,
        assessmentScore: rating.assessment_score,
        assessmentGrade: calculatePotentialRating(rating.scores as PotentialRatingScores).grade,
        evidenceSummary: rating.evidence_summary,
        status: rating.status,
        publishedGrade: rating.published_grade,
        publishedScore: rating.published_score,
        publishedAt: rating.published_at,
        reviewNote: rating.review_note,
        reviewedAt: rating.reviewed_at,
        lastRaterName: ratingAccessByCustomer.get(parsedId.data)?.last_rater_name ?? null,
        version: rating.version,
        updatedAt: rating.updated_at,
      } : null;
    }

    const rawWorkspace = parsedId?.success
      ? workspaceByCustomer.get(parsedId.data) ?? null
      : null;
    const workspace = parsedId?.success ? {
      customerNote: rawWorkspace?.customer_note ?? '',
      noteVersion: rawWorkspace?.note_version ?? 0,
      noteUpdatedAt: rawWorkspace?.note_updated_at ?? null,
      opportunitySummary: rawWorkspace?.opportunity_summary ?? '',
      estimatedAnnualOpportunityCnyYuan: rawWorkspace?.estimated_annual_opportunity_cny_yuan ?? null,
      nextAction: rawWorkspace?.next_action ?? '',
      nextCheckOn: rawWorkspace?.next_check_on ?? null,
      planVersion: rawWorkspace?.plan_version ?? 0,
      planUpdatedAt: rawWorkspace?.plan_updated_at ?? null,
    } : null;

    return NextResponse.json({
      ok: true,
      data: {
        summaries,
        detail,
        workspace,
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return fail('客户评级加载失败，请稍后重试', 500);
  }
}

export async function POST(req: NextRequest) {
  const body = saveSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail('评分或事实依据不完整，请检查全部五项指标', 422);
  const supabase = await createClient();
  if (!supabase) return fail('数据库不可用', 503);
  const auth = await resolveCpcProfile(supabase);
  if (!auth.ok) return fail(auth.message, auth.status);
  const input = body.data;
  const result = await supabase.rpc('cpc_save_customer_potential_rating', {
    p_customer_reference_id: input.customerReferenceId,
    p_scores: input.scores,
    p_evidence_summary: input.evidenceSummary,
    // Compatibility signature: the RPC no longer modifies commercial plan fields.
    p_opportunity_summary: '',
    p_estimated_annual_opportunity_cny_yuan: null,
    p_next_action: '',
    p_next_check_on: null,
    p_submit: true,
    p_expected_version: input.expectedVersion,
    p_request_id: crypto.randomUUID(),
  });
  return rpcReply(result);
}
