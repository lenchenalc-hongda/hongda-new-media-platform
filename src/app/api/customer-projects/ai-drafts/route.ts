import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCpcProfile, runCpcMutation } from '@/lib/customer-projects/api';
import {
  parseAiWorkItemProposal,
  type AiSuggestionListItem,
} from '@/lib/customer-projects/ai-drafts';

export const dynamic = 'force-dynamic';

const MAX_DRAFT_ROWS = 100;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  if (!supabase) return jsonError('数据库不可用', 500);

  const profileResult = await resolveCpcProfile(supabase);
  if (!profileResult.ok) {
    return jsonError(profileResult.message, profileResult.status);
  }
  const profile = profileResult.profile;

  try {
    const draftResult = await supabase
      .from('cpc_ai_drafts')
      .select('id,customer_reference_id,project_id,proposal_type,raw_input,structured_proposal,status,created_by_profile_id,expires_at,version,created_at')
      .eq('org_id', profile.orgId)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .range(0, MAX_DRAFT_ROWS - 1);

    if (draftResult.error) throw new Error('ai draft read failed');

    const nowMs = Date.now();
    const rows = (draftResult.data ?? []).filter((row: any) => {
      if (!row.expires_at) return true;
      const expiresMs = new Date(row.expires_at).getTime();
      return Number.isFinite(expiresMs) && expiresMs > nowMs;
    });

    if ((draftResult.data ?? []).length >= MAX_DRAFT_ROWS) {
      return jsonError('AI 建议数量超出当前安全上限，请先处理已有建议。', 409);
    }

    const projectIds = Array.from(new Set(
      rows
        .map((row: any) => row.project_id)
        .filter((value: unknown): value is string => typeof value === 'string'),
    ));
    const customerIds = Array.from(new Set(
      rows
        .map((row: any) => row.customer_reference_id)
        .filter((value: unknown): value is string => typeof value === 'string'),
    ));

    const projectMap = new Map<string, any>();
    if (projectIds.length > 0) {
      const projectsResult = await supabase
        .from('cpc_projects')
        .select('id,title,owner_profile_id,customer_reference_id')
        .eq('org_id', profile.orgId)
        .in('id', projectIds);
      if (projectsResult.error) throw new Error('ai draft project read failed');
      for (const project of projectsResult.data ?? []) {
        projectMap.set(project.id, project);
      }
    }

    const allCustomerIds = new Set(customerIds);
    for (const project of projectMap.values()) {
      if (typeof project.customer_reference_id === 'string') {
        allCustomerIds.add(project.customer_reference_id);
      }
    }

    const customerMap = new Map<string, string>();
    if (allCustomerIds.size > 0) {
      const customersResult = await supabase
        .from('cpc_customer_references')
        .select('id,display_name_snapshot')
        .eq('org_id', profile.orgId)
        .in('id', Array.from(allCustomerIds));
      if (customersResult.error) throw new Error('ai draft customer read failed');
      for (const customer of customersResult.data ?? []) {
        customerMap.set(customer.id, customer.display_name_snapshot);
      }
    }

    const suggestions: AiSuggestionListItem[] = [];

    for (const row of rows as any[]) {
      if (row.proposal_type !== 'WORK_ITEM') continue;

      const proposal = parseAiWorkItemProposal(row.structured_proposal);
      if (!proposal) continue;

      const project = row.project_id ? projectMap.get(row.project_id) ?? null : null;
      const customerReferenceId =
        typeof row.customer_reference_id === 'string'
          ? row.customer_reference_id
          : typeof project?.customer_reference_id === 'string'
            ? project.customer_reference_id
            : null;

      const canReview =
        profile.role === 'admin'
        || profile.role === 'manager'
        || row.created_by_profile_id === profile.id
        || project?.owner_profile_id === profile.id;

      suggestions.push({
        id: row.id,
        proposalType: 'WORK_ITEM',
        rawInput: row.raw_input,
        proposal,
        customerReferenceId,
        customerDisplayName: customerReferenceId
          ? customerMap.get(customerReferenceId) ?? null
          : null,
        projectId: typeof row.project_id === 'string' ? row.project_id : null,
        projectTitle: project?.title ?? null,
        version: row.version,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        canReview,
      });
    }

    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: { suggestions },
    });
  } catch {
    return jsonError('AI 建议加载失败，请稍后重试。', 500);
  }
}

export async function POST(req: NextRequest) {
  return runCpcMutation(req, {}, 'CREATE_AI_WORK_ITEM_DRAFT');
}
