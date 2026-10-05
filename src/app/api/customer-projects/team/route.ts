import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCpcProfile } from '@/lib/customer-projects/api';
import {
  buildTeamBoardSnapshot,
  canAccessTeamBoard,
  type TeamBoardCustomerRow,
  type TeamBoardEventRow,
  type TeamBoardProfileRow,
  type TeamBoardProjectRow,
  type TeamBoardReportRow,
  type TeamBoardWorkItemRow,
} from '@/lib/customer-projects/team-board';
import type { ProjectCreationAuditRow } from '@/lib/customer-projects/old-customer-proactive';

export const dynamic = 'force-dynamic';

const MAX_PROJECT_ROWS = 500;
const MAX_WORK_ITEM_ROWS = 1000;
const MAX_CUSTOMER_ROWS = 1000;
const MAX_PROFILE_ROWS = 500;
const MAX_REPORT_ROWS = 500;
const MAX_EVENT_ROWS = 1000;
const MAX_PROJECT_CREATION_AUDIT_ROWS = 1000;

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
  if (!canAccessTeamBoard(profile.role)) {
    return jsonError('无权访问团队看板', 403);
  }

  try {
    const [
      projectsResult,
      workItemsResult,
      customersResult,
      profilesResult,
      reportsResult,
      outcomeEventsResult,
      relationshipEventsResult,
      projectCreationAuditResult,
    ] = await Promise.all([
      supabase
        .from('cpc_projects')
        .select('id,org_id,customer_reference_id,title,project_type,status,stage,waiting_on,next_check_at,risk_level,priority,owner_profile_id,updated_at')
        .eq('org_id', profile.orgId)
        .order('updated_at', { ascending: false })
        .range(0, MAX_PROJECT_ROWS - 1),
      supabase
        .from('cpc_work_items')
        .select('id,org_id,customer_reference_id,project_id,work_item_type,title,assignee_profile_id,created_by_profile_id,due_at,status,priority,blocked_reason,updated_at')
        .eq('org_id', profile.orgId)
        .in('status', ['pending', 'in_progress', 'blocked'])
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .range(0, MAX_WORK_ITEM_ROWS - 1),
      supabase
        .from('cpc_customer_references')
        .select('id,org_id,reference_kind,display_name_snapshot,status,updated_at')
        .eq('org_id', profile.orgId)
        .order('updated_at', { ascending: false })
        .range(0, MAX_CUSTOMER_ROWS - 1),
      supabase
        .from('profiles')
        .select('id,org_id,full_name,department,role,is_active')
        .eq('org_id', profile.orgId)
        .in('role', ['admin', 'manager', 'sales'])
        .order('full_name', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .range(0, MAX_PROFILE_ROWS - 1),
      supabase
        .from('cpc_reports')
        .select('id,org_id,subject_profile_id,period_type,period_start,status,submitted_at,version,updated_at')
        .eq('org_id', profile.orgId)
        .eq('period_type', 'weekly')
        .eq('status', 'submitted')
        .order('period_start', { ascending: false })
        .order('version', { ascending: false })
        .range(0, MAX_REPORT_ROWS - 1),
      supabase
        .from('cpc_project_events')
        .select('id,org_id,project_id,customer_reference_id,event_type,occurred_at,payload')
        .eq('org_id', profile.orgId)
        .in('event_type', [
          'EFFECTIVE_PROGRESS_RECORDED',
          'ORDER_CONFIRMED',
          'PROJECT_WON',
        ])
        .order('event_seq', { ascending: false })
        .range(0, MAX_EVENT_ROWS - 1),
      supabase
        .from('cpc_project_events')
        .select('id,org_id,project_id,customer_reference_id,event_type,occurred_at,payload')
        .eq('org_id', profile.orgId)
        .in('event_type', [
          'CONTACT_LOGGED',
          'CUSTOMER_RESPONSE_RECEIVED',
        ])
        .order('event_seq', { ascending: false })
        .range(0, MAX_EVENT_ROWS - 1),
      supabase
        .from('cpc_audit_log')
        .select('id,audit_seq,org_id,entity_type,entity_id,action,request_id,metadata,recorded_at')
        .eq('org_id', profile.orgId)
        .eq('entity_type', 'PROJECT')
        .eq('action', 'PROJECT_CREATED')
        .order('audit_seq', { ascending: false })
        .range(0, MAX_PROJECT_CREATION_AUDIT_ROWS - 1),
    ]);

    if (
      projectsResult.error
      || workItemsResult.error
      || customersResult.error
      || profilesResult.error
      || reportsResult.error
      || outcomeEventsResult.error
      || relationshipEventsResult.error
      || projectCreationAuditResult.error
    ) {
      throw new Error('team board read failed');
    }

    if (
      (projectsResult.data?.length ?? 0) >= MAX_PROJECT_ROWS
      || (workItemsResult.data?.length ?? 0) >= MAX_WORK_ITEM_ROWS
      || (customersResult.data?.length ?? 0) >= MAX_CUSTOMER_ROWS
      || (profilesResult.data?.length ?? 0) >= MAX_PROFILE_ROWS
      || (reportsResult.data?.length ?? 0) >= MAX_REPORT_ROWS
      || (outcomeEventsResult.data?.length ?? 0) >= MAX_EVENT_ROWS
      || (relationshipEventsResult.data?.length ?? 0) >= MAX_EVENT_ROWS
      || (projectCreationAuditResult.data?.length ?? 0)
        >= MAX_PROJECT_CREATION_AUDIT_ROWS
    ) {
      return jsonError('团队看板数据量超出当前安全上限，请联系管理员处理。', 409);
    }

    const snapshot = buildTeamBoardSnapshot({
      now: new Date(),
      orgId: profile.orgId,
      projects: (projectsResult.data ?? []) as TeamBoardProjectRow[],
      workItems: (workItemsResult.data ?? []) as TeamBoardWorkItemRow[],
      customers: (customersResult.data ?? []) as TeamBoardCustomerRow[],
      profiles: (profilesResult.data ?? []) as TeamBoardProfileRow[],
      reports: (reportsResult.data ?? []) as TeamBoardReportRow[],
      events: [
        ...((outcomeEventsResult.data ?? []) as TeamBoardEventRow[]),
        ...((relationshipEventsResult.data ?? []) as TeamBoardEventRow[]),
      ],
      projectCreationAudits: (
        projectCreationAuditResult.data ?? []
      ) as ProjectCreationAuditRow[],
    });

    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: snapshot,
    });
  } catch {
    return jsonError('团队看板加载失败，请稍后重试。', 500);
  }
}
