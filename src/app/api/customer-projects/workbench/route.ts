import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCpcProfile } from '@/lib/customer-projects/api';
import {
  buildWorkbenchSnapshot,
  type WorkbenchCustomerRow,
  type WorkbenchProjectRow,
  type WorkbenchWorkItemRow,
} from '@/lib/customer-projects/read-models';

export const dynamic = 'force-dynamic';

const MAX_PERSONAL_ROWS = 500;

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
      .eq('owner_profile_id', profile.id)
      .order('updated_at', { ascending: false })
      .range(0, MAX_PERSONAL_ROWS - 1);

    if (projectsResult.error) throw new Error('project read failed');

    const workItemsResult = await supabase
      .from('cpc_work_items')
      .select('id,customer_reference_id,project_id,work_item_type,title,assignee_profile_id,due_at,status,priority,blocked_reason,version,updated_at')
      .eq('org_id', profile.orgId)
      .eq('assignee_profile_id', profile.id)
      .in('status', ['pending', 'in_progress', 'blocked'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(0, MAX_PERSONAL_ROWS - 1);

    if (workItemsResult.error) throw new Error('work item read failed');

    const projects = (projectsResult.data ?? []) as WorkbenchProjectRow[];
    const workItems = (workItemsResult.data ?? []) as WorkbenchWorkItemRow[];

    if (projects.length >= MAX_PERSONAL_ROWS || workItems.length >= MAX_PERSONAL_ROWS) {
      return jsonError('今日工作数据量超出安全上限，请联系管理员处理。', 409);
    }

    const customerIds = Array.from(new Set([
      ...projects.map(row => row.customer_reference_id),
      ...workItems
        .map(row => row.customer_reference_id)
        .filter((value): value is string => typeof value === 'string'),
    ]));

    let customers: WorkbenchCustomerRow[] = [];
    if (customerIds.length > 0) {
      const customersResult = await supabase
        .from('cpc_customer_references')
        .select('id,display_name_snapshot')
        .eq('org_id', profile.orgId)
        .in('id', customerIds)
        .order('id', { ascending: true });

      if (customersResult.error) throw new Error('customer read failed');
      customers = (customersResult.data ?? []) as WorkbenchCustomerRow[];
    }

    const snapshot = buildWorkbenchSnapshot({
      now: new Date(),
      projects,
      workItems,
      customers,
    });

    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: snapshot,
    });
  } catch {
    return jsonError('今日工作加载失败，请稍后重试。', 500);
  }
}
