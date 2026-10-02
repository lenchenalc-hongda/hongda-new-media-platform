import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCpcProfile } from '@/lib/customer-projects/api';
import {
  buildTaskList,
  type ListCustomerRow,
  type ListProjectRow,
  type ListWorkItemRow,
} from '@/lib/customer-projects/list-read-models';

export const dynamic = 'force-dynamic';

const MAX_TASK_ROWS = 500;

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
    const workItemsResult = await supabase
      .from('cpc_work_items')
      .select('id,customer_reference_id,project_id,work_item_type,title,due_at,status,priority,blocked_reason,version,updated_at')
      .eq('org_id', profile.orgId)
      .eq('assignee_profile_id', profile.id)
      .order('updated_at', { ascending: false })
      .range(0, MAX_TASK_ROWS - 1);

    if (workItemsResult.error) throw new Error('task read failed');

    const workItems = (workItemsResult.data ?? []) as ListWorkItemRow[];
    if (workItems.length >= MAX_TASK_ROWS) {
      return jsonError('任务数量超出当前安全上限，请使用后续筛选能力。', 409);
    }

    const projectIds = Array.from(new Set(
      workItems
        .map(item => item.project_id)
        .filter((value): value is string => typeof value === 'string'),
    ));

    let projects: ListProjectRow[] = [];
    if (projectIds.length > 0) {
      const projectsResult = await supabase
        .from('cpc_projects')
        .select('id,customer_reference_id,title,project_type,status,stage,waiting_on,next_check_at,risk_level,priority,owner_profile_id,version,updated_at')
        .eq('org_id', profile.orgId)
        .in('id', projectIds);

      if (projectsResult.error) throw new Error('project read failed');
      projects = (projectsResult.data ?? []) as ListProjectRow[];
    }

    const customerIds = Array.from(new Set(
      workItems
        .map(item => item.customer_reference_id)
        .concat(projects.map(project => project.customer_reference_id))
        .filter((value): value is string => typeof value === 'string'),
    ));

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
        tasks: buildTaskList({ workItems, projects, customers }),
      },
    });
  } catch {
    return jsonError('我的任务加载失败，请稍后重试。', 500);
  }
}
