import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUserReadOnlyCached } from '@/lib/auth/current-user';
import { resolveCpcProfile, type CpcProfile } from '@/lib/customer-projects/api';
import { createCpcReadTiming } from '@/lib/customer-projects/performance';
import {
  buildWorkbenchSnapshot,
  type WorkbenchCustomerRow,
  type WorkbenchProjectRow,
  type WorkbenchSnapshot,
  type WorkbenchWorkItemRow,
} from '@/lib/customer-projects/read-models';
import {
  buildProjectList,
  buildTaskList,
  type ListCustomerRow,
  type ListProjectRow,
  type ListWorkItemRow,
  type ProjectListItem,
  type TaskListItem,
} from '@/lib/customer-projects/list-read-models';
import {
  buildCustomerList,
  type CustomerEventRow,
  type CustomerFollowUpRow,
  type CustomerListItem,
  type CustomerProjectRow,
  type CustomerReferenceRow,
} from '@/lib/customer-projects/customer-read-models';

const MAX_PERSONAL_ROWS = 500;
const MAX_PROJECT_ROWS = 500;
const MAX_CUSTOMERS = 500;
const MAX_RELATION_ROWS = 2000;
const MAX_TASK_ROWS = 500;

type ServerReadResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

export type ProjectListPageItem = ProjectListItem & {
  isOwnedByMe: boolean;
};

async function resolveServerReadContext(): Promise<
  | { ok: true; supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>; profile: CpcProfile }
  | { ok: false; status: number; message: string }
> {
  const [supabase, user] = await Promise.all([
    createClient(),
    getCurrentUserReadOnlyCached(),
  ]);

  if (!supabase) {
    return { ok: false, status: 500, message: '数据库不可用' };
  }

  if (!user) {
    return { ok: false, status: 401, message: '未登录或无权限' };
  }

  if (!['admin', 'manager', 'sales'].includes(user.role)) {
    return { ok: false, status: 403, message: '无权使用客户项目中心' };
  }

  if (
    user.authSource === 'supabase'
    && typeof user.profileId === 'string'
    && user.profileId.length > 0
    && typeof user.orgId === 'string'
    && user.orgId.length > 0
  ) {
    return {
      ok: true,
      supabase,
      profile: {
        id: user.profileId,
        orgId: user.orgId,
        role: user.role as CpcProfile['role'],
      },
    };
  }

  // Preserve development/test compatibility for non-Supabase identity sources.
  const fallback = await resolveCpcProfile(supabase);
  if (!fallback.ok) return fallback;

  return {
    ok: true,
    supabase,
    profile: fallback.profile,
  };
}

export async function readWorkbenchSnapshot(): Promise<ServerReadResult<WorkbenchSnapshot>> {
  const timing = createCpcReadTiming('workbench');
  const authStartedAt = Date.now();
  const context = await resolveServerReadContext();
  timing.mark('auth', authStartedAt);
  if (!context.ok) {
    timing.finish(
      context.status === 401
        ? 'unauthorized'
        : context.status === 403
          ? 'forbidden'
          : 'db_unavailable',
    );
    return context;
  }
  const { supabase, profile } = context;

  try {
    const primaryStartedAt = Date.now();
    const [projectsResult, workItemsResult] = await Promise.all([
      supabase
        .from('cpc_projects')
        .select('id,customer_reference_id,title,project_type,status,stage,waiting_on,next_check_at,risk_level,priority,owner_profile_id,version,updated_at')
        .eq('org_id', profile.orgId)
        .eq('owner_profile_id', profile.id)
        .order('updated_at', { ascending: false })
        .range(0, MAX_PERSONAL_ROWS - 1),
      supabase
        .from('cpc_work_items')
        .select('id,customer_reference_id,project_id,work_item_type,title,assignee_profile_id,due_at,status,priority,blocked_reason,version,updated_at')
        .eq('org_id', profile.orgId)
        .eq('assignee_profile_id', profile.id)
        .in('status', ['pending', 'in_progress', 'blocked'])
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .range(0, MAX_PERSONAL_ROWS - 1),
    ]);

    timing.mark('primary', primaryStartedAt);
    if (projectsResult.error) throw new Error('project read failed');
    if (workItemsResult.error) throw new Error('work item read failed');

    const projects = (projectsResult.data ?? []) as WorkbenchProjectRow[];
    const workItems = (workItemsResult.data ?? []) as WorkbenchWorkItemRow[];

    if (projects.length >= MAX_PERSONAL_ROWS || workItems.length >= MAX_PERSONAL_ROWS) {
      timing.finish('limit', { projects: projects.length, workItems: workItems.length });
      return {
        ok: false,
        status: 409,
        message: '今日工作数据量超出安全上限，请联系管理员处理。',
      };
    }

    const customerIds = Array.from(new Set([
      ...projects.map(row => row.customer_reference_id),
      ...workItems
        .map(row => row.customer_reference_id)
        .filter((value): value is string => typeof value === 'string'),
    ]));

    const relationsStartedAt = Date.now();
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
    timing.mark('relations', relationsStartedAt);

    const data = buildWorkbenchSnapshot({
        now: new Date(),
        projects,
        workItems,
        customers,
      });
    timing.finish('ok', {
      projects: projects.length,
      workItems: workItems.length,
      customers: customers.length,
    });
    return { ok: true, data };
  } catch {
    timing.finish('error');
    return { ok: false, status: 500, message: '今日工作加载失败，请稍后重试。' };
  }
}

export async function readProjectList(): Promise<ServerReadResult<ProjectListPageItem[]>> {
  const timing = createCpcReadTiming('projects');
  const authStartedAt = Date.now();
  const context = await resolveServerReadContext();
  timing.mark('auth', authStartedAt);
  if (!context.ok) {
    timing.finish(
      context.status === 401
        ? 'unauthorized'
        : context.status === 403
          ? 'forbidden'
          : 'db_unavailable',
    );
    return context;
  }
  const { supabase, profile } = context;

  try {
    const primaryStartedAt = Date.now();
    const projectsResult = await supabase
      .from('cpc_projects')
      .select('id,customer_reference_id,title,project_type,status,stage,waiting_on,next_check_at,risk_level,priority,owner_profile_id,version,updated_at')
      .eq('org_id', profile.orgId)
      .order('updated_at', { ascending: false })
      .range(0, MAX_PROJECT_ROWS - 1);

    timing.mark('primary', primaryStartedAt);
    if (projectsResult.error) throw new Error('project read failed');

    const projects = (projectsResult.data ?? []) as ListProjectRow[];
    if (projects.length >= MAX_PROJECT_ROWS) {
      timing.finish('limit', { projects: projects.length });
      return {
        ok: false,
        status: 409,
        message: '项目数量超出当前安全上限，请使用后续筛选能力。',
      };
    }

    const projectIds = projects.map(project => project.id);
    const customerIds = Array.from(new Set(projects.map(project => project.customer_reference_id)));

    const relationsStartedAt = Date.now();
    const [workItems, customers] = await Promise.all([
      (async (): Promise<ListWorkItemRow[]> => {
        if (projectIds.length === 0) return [];

        const workItemsResult = await supabase
          .from('cpc_work_items')
          .select('id,customer_reference_id,project_id,work_item_type,title,due_at,status,priority,blocked_reason,version,updated_at')
          .eq('org_id', profile.orgId)
          .in('project_id', projectIds)
          .in('status', ['pending', 'in_progress', 'blocked'])
          .order('updated_at', { ascending: false })
          .limit(1000);

        if (workItemsResult.error) throw new Error('work item read failed');
        return (workItemsResult.data ?? []) as ListWorkItemRow[];
      })(),
      (async (): Promise<ListCustomerRow[]> => {
        if (customerIds.length === 0) return [];

        const customersResult = await supabase
          .from('cpc_customer_references')
          .select('id,display_name_snapshot')
          .eq('org_id', profile.orgId)
          .in('id', customerIds);

        if (customersResult.error) throw new Error('customer read failed');
        return (customersResult.data ?? []) as ListCustomerRow[];
      })(),
    ]);

    timing.mark('relations', relationsStartedAt);
    const list = buildProjectList({ projects, workItems, customers }).map(project => ({
      ...project,
      isOwnedByMe: project.ownerProfileId === profile.id,
    }));

    timing.finish('ok', {
      projects: projects.length,
      workItems: workItems.length,
      customers: customers.length,
    });
    return { ok: true, data: list };
  } catch {
    timing.finish('error');
    return { ok: false, status: 500, message: '项目列表加载失败，请稍后重试。' };
  }
}


export async function readCustomerList(): Promise<ServerReadResult<CustomerListItem[]>> {
  const timing = createCpcReadTiming('customers');
  const authStartedAt = Date.now();
  const context = await resolveServerReadContext();
  timing.mark('auth', authStartedAt);
  if (!context.ok) {
    timing.finish(
      context.status === 401
        ? 'unauthorized'
        : context.status === 403
          ? 'forbidden'
          : 'db_unavailable',
    );
    return context;
  }
  const { supabase, profile } = context;

  try {
    const primaryStartedAt = Date.now();
    const customersResult = await supabase
      .from('cpc_customer_references')
      .select('id,reference_kind,display_name_snapshot,status,external_source,external_customer_id,external_owner_reference,provisional_source_reference,updated_at')
      .eq('org_id', profile.orgId)
      .in('status', ['active', 'pending_review'])
      .order('updated_at', { ascending: false })
      .range(0, MAX_CUSTOMERS - 1);

    timing.mark('primary', primaryStartedAt);
    if (customersResult.error) throw new Error('customer read failed');

    const customers = (customersResult.data ?? []) as CustomerReferenceRow[];
    if (customers.length >= MAX_CUSTOMERS) {
      timing.finish('limit', { customers: customers.length });
      return {
        ok: false,
        status: 409,
        message: '客户数量超出当前安全上限，请使用后续筛选能力。',
      };
    }
    if (customers.length === 0) {
      timing.finish('ok', { customers: 0 });
      return { ok: true, data: [] };
    }

    const customerIds = customers.map(customer => customer.id);
    const relationsStartedAt = Date.now();
    const [
      projectsResult,
      followUpsResult,
      relationshipEventsResult,
      transactionEventsResult,
    ] = await Promise.all([
      supabase
        .from('cpc_projects')
        .select('id,customer_reference_id,title,project_type,status,stage,waiting_on,next_check_at,risk_level,priority,updated_at')
        .eq('org_id', profile.orgId)
        .in('customer_reference_id', customerIds)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(MAX_RELATION_ROWS),
      supabase
        .from('cpc_work_items')
        .select('id,customer_reference_id,project_id,work_item_type,title,assignee_profile_id,due_at,status,priority,blocked_reason,version,updated_at')
        .eq('org_id', profile.orgId)
        .in('customer_reference_id', customerIds)
        .is('project_id', null)
        .eq('work_item_type', 'FOLLOW_UP')
        .in('status', ['pending', 'in_progress', 'blocked'])
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(MAX_RELATION_ROWS),
      supabase
        .from('cpc_project_events')
        .select('id,customer_reference_id,project_id,event_type,occurred_at,raw_input,payload')
        .eq('org_id', profile.orgId)
        .in('customer_reference_id', customerIds)
        .is('project_id', null)
        .in('event_type', ['CONTACT_LOGGED', 'CUSTOMER_RESPONSE_RECEIVED'])
        .order('event_seq', { ascending: false })
        .limit(MAX_RELATION_ROWS),
      supabase
        .from('cpc_project_events')
        .select('id,customer_reference_id,project_id,event_type,occurred_at,raw_input,payload')
        .eq('org_id', profile.orgId)
        .in('customer_reference_id', customerIds)
        .in('event_type', ['ORDER_CONFIRMED', 'PROJECT_WON'])
        .order('event_seq', { ascending: false })
        .limit(MAX_RELATION_ROWS),
    ]);

    if (
      projectsResult.error
      || followUpsResult.error
      || relationshipEventsResult.error
      || transactionEventsResult.error
    ) {
      throw new Error('customer relation read failed');
    }

    const projects = (projectsResult.data ?? []) as CustomerProjectRow[];
    const followUps = (followUpsResult.data ?? []) as CustomerFollowUpRow[];
    const relationshipEvents = (relationshipEventsResult.data ?? []) as CustomerEventRow[];
    const transactionEvents = (transactionEventsResult.data ?? []) as CustomerEventRow[];
    timing.mark('relations', relationsStartedAt);

    if (
      projects.length >= MAX_RELATION_ROWS
      || followUps.length >= MAX_RELATION_ROWS
      || relationshipEvents.length >= MAX_RELATION_ROWS
      || transactionEvents.length >= MAX_RELATION_ROWS
    ) {
      timing.finish('limit', {
        customers: customers.length,
        projects: projects.length,
        followUps: followUps.length,
        relationshipEvents: relationshipEvents.length,
        transactionEvents: transactionEvents.length,
      });
      return {
        ok: false,
        status: 409,
        message: '客户关系数据量超出当前安全上限，请使用后续筛选能力。',
      };
    }

    const data = buildCustomerList({
        now: new Date(),
        actorProfileId: profile.id,
        customers,
        projects,
        followUps,
        events: [...relationshipEvents, ...transactionEvents],
      });
    timing.finish('ok', {
      customers: customers.length,
      projects: projects.length,
      followUps: followUps.length,
      relationshipEvents: relationshipEvents.length,
      transactionEvents: transactionEvents.length,
    });
    return { ok: true, data };
  } catch {
    timing.finish('error');
    return { ok: false, status: 500, message: '客户列表加载失败，请稍后重试。' };
  }
}

export async function readTaskList(): Promise<ServerReadResult<TaskListItem[]>> {
  const timing = createCpcReadTiming('tasks');
  const authStartedAt = Date.now();
  const context = await resolveServerReadContext();
  timing.mark('auth', authStartedAt);
  if (!context.ok) {
    timing.finish(
      context.status === 401
        ? 'unauthorized'
        : context.status === 403
          ? 'forbidden'
          : 'db_unavailable',
    );
    return context;
  }
  const { supabase, profile } = context;

  try {
    const primaryStartedAt = Date.now();
    const workItemsResult = await supabase
      .from('cpc_work_items')
      .select('id,customer_reference_id,project_id,work_item_type,title,due_at,status,priority,blocked_reason,version,updated_at')
      .eq('org_id', profile.orgId)
      .eq('assignee_profile_id', profile.id)
      .order('updated_at', { ascending: false })
      .range(0, MAX_TASK_ROWS - 1);

    timing.mark('primary', primaryStartedAt);
    if (workItemsResult.error) throw new Error('task read failed');

    const workItems = (workItemsResult.data ?? []) as ListWorkItemRow[];
    if (workItems.length >= MAX_TASK_ROWS) {
      timing.finish('limit', { workItems: workItems.length });
      return {
        ok: false,
        status: 409,
        message: '任务数量超出当前安全上限，请使用后续筛选能力。',
      };
    }

    const projectIds = Array.from(new Set(
      workItems
        .map(item => item.project_id)
        .filter((value): value is string => typeof value === 'string'),
    ));

    const relationsStartedAt = Date.now();
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

    timing.mark('relations', relationsStartedAt);
    const data = buildTaskList({ workItems, projects, customers });
    timing.finish('ok', {
      workItems: workItems.length,
      projects: projects.length,
      customers: customers.length,
    });
    return { ok: true, data };
  } catch {
    timing.finish('error');
    return { ok: false, status: 500, message: '我的任务加载失败，请稍后重试。' };
  }
}
