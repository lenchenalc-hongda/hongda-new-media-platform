import { NextRequest, NextResponse } from 'next/server';
import { runCpcMutation, resolveCpcProfile } from '@/lib/customer-projects/api';
import { createClient } from '@/lib/supabase/server';
import {
  buildProjectList,
  type ListCustomerRow,
  type ListProjectRow,
  type ListWorkItemRow,
} from '@/lib/customer-projects/list-read-models';

export const dynamic = 'force-dynamic';

const MAX_PROJECT_ROWS = 500;

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
    const projectsResult = await supabase
      .from('cpc_projects')
      .select('id,customer_reference_id,title,project_type,status,stage,waiting_on,next_check_at,risk_level,priority,owner_profile_id,version,updated_at')
      .eq('org_id', profile.orgId)
      .order('updated_at', { ascending: false })
      .range(0, MAX_PROJECT_ROWS - 1);

    if (projectsResult.error) throw new Error('project read failed');

    const projects = (projectsResult.data ?? []) as ListProjectRow[];
    if (projects.length >= MAX_PROJECT_ROWS) {
      return jsonError('项目数量超出当前安全上限，请使用后续筛选能力。', 409);
    }

    const projectIds = projects.map(project => project.id);
    const customerIds = Array.from(new Set(projects.map(project => project.customer_reference_id)));

    let workItems: ListWorkItemRow[] = [];
    if (projectIds.length > 0) {
      const workItemsResult = await supabase
        .from('cpc_work_items')
        .select('id,customer_reference_id,project_id,work_item_type,title,due_at,status,priority,blocked_reason,version,updated_at')
        .eq('org_id', profile.orgId)
        .in('project_id', projectIds)
        .in('status', ['pending', 'in_progress', 'blocked'])
        .order('updated_at', { ascending: false })
        .limit(1000);

      if (workItemsResult.error) throw new Error('work item read failed');
      workItems = (workItemsResult.data ?? []) as ListWorkItemRow[];
    }

    let customers: ListCustomerRow[] = [];
    if (customerIds.length > 0) {
      const customersResult = await supabase
        .from('cpc_customer_references')
        .select('id,display_name_snapshot')
        .eq('org_id', profile.orgId)
        .in('id', customerIds);

      if (customersResult.error) throw new Error('customer read failed');
      customers = (customersResult.data ?? []) as ListCustomerRow[];
    }

    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: {
        projects: buildProjectList({ projects, workItems, customers }),
      },
    });
  } catch {
    return jsonError('项目列表加载失败，请稍后重试。', 500);
  }
}

export async function POST(req: NextRequest) {
  return runCpcMutation(req, {}, 'CREATE_PROJECT');
}
