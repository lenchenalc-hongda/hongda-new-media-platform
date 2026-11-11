import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { resolveCpcProfile } from '@/lib/customer-projects/api';
import {
  buildProjectReminderSnapshot,
  PROJECT_PROGRESS_EVENT_TYPES,
  type ProjectReminderSnapshot,
  type ReminderEventRow,
  type ReminderProfileRow,
  type ReminderProjectRow,
  type ReminderWorkItemRow,
} from '@/lib/customer-projects/project-reminder-center';

const MAX_PROJECT_ROWS = 500;
const MAX_WORK_ROWS = 1000;
const MAX_EVENT_ROWS = 2000;
const MAX_PROFILE_ROWS = 100;

export type ProjectReminderReadResult =
  | { ok: true; data: ProjectReminderSnapshot; isManagement: boolean }
  | { ok: false; status: number; message: string };

/**
 * Login-scoped read-only snapshot. All business rows go through the caller's
 * existing Supabase RLS. No service role and no scheduler/delivery credentials.
 */
export async function readProjectReminderSnapshot(): Promise<ProjectReminderReadResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, status: 500, message: '数据库不可用' };

  const profileResult = await resolveCpcProfile(supabase);
  if (!profileResult.ok) {
    return { ok: false, status: profileResult.status, message: profileResult.message };
  }
  const profile = profileResult.profile;

  try {
    const projectsResult = await supabase
      .from('cpc_projects')
      .select('id,title,owner_profile_id,status,waiting_on,next_check_at,created_at')
      .eq('org_id', profile.orgId)
      .order('created_at', { ascending: false })
      .range(0, MAX_PROJECT_ROWS - 1);
    if (projectsResult.error) throw new Error('projects read failed');
    const projects = (projectsResult.data ?? []) as ReminderProjectRow[];
    if (projects.length >= MAX_PROJECT_ROWS) {
      return { ok: false, status: 409, message: '项目数据超过提醒分析上限，请联系管理员。' };
    }

    const projectIds = projects.filter(project => project.status === 'active')
      .map(project => project.id);

    const [workResult, eventsResult, profilesResult] = await Promise.all([
      projectIds.length === 0 ? Promise.resolve({ data: [], error: null }) :
        supabase.from('cpc_work_items')
          .select('id,project_id,title,work_item_type,status,due_at')
          .eq('org_id', profile.orgId)
          .in('project_id', projectIds)
          .in('status', ['pending', 'in_progress', 'blocked'])
          .range(0, MAX_WORK_ROWS - 1),
      projectIds.length === 0 ? Promise.resolve({ data: [], error: null }) :
        supabase.from('cpc_project_events')
          .select('project_id,event_type,occurred_at')
          .eq('org_id', profile.orgId)
          .in('project_id', projectIds)
          .in('event_type', [...PROJECT_PROGRESS_EVENT_TYPES])
          .order('event_seq', { ascending: false })
          .range(0, MAX_EVENT_ROWS - 1),
      supabase.from('profiles')
        .select('id,full_name,created_at,role,is_active')
        .eq('org_id', profile.orgId)
        .in('role', ['admin', 'manager', 'sales'])
        .eq('is_active', true)
        .range(0, MAX_PROFILE_ROWS - 1),
    ]);

    if (workResult.error || eventsResult.error || profilesResult.error) {
      throw new Error('reminder data read failed');
    }
    if ((workResult.data?.length ?? 0) >= MAX_WORK_ROWS
      || (eventsResult.data?.length ?? 0) >= MAX_EVENT_ROWS
      || (profilesResult.data?.length ?? 0) >= MAX_PROFILE_ROWS) {
      return { ok: false, status: 409, message: '提醒数据超过安全上限，已停止计算以避免漏报。' };
    }

    const result = buildProjectReminderSnapshot({
      now: new Date(),
      projects,
      workItems: (workResult.data ?? []) as ReminderWorkItemRow[],
      events: (eventsResult.data ?? []) as ReminderEventRow[],
      profiles: (profilesResult.data ?? []) as ReminderProfileRow[],
    });

    return { ok: true, data: result, isManagement: profile.role === 'admin' || profile.role === 'manager' };
  } catch {
    return { ok: false, status: 500, message: '项目推进提醒加载失败，请稍后重试。' };
  }
}
