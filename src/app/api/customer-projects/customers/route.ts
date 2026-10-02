import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCpcProfile } from '@/lib/customer-projects/api';
import {
  buildCustomerList,
  type CustomerEventRow,
  type CustomerFollowUpRow,
  type CustomerProjectRow,
  type CustomerReferenceRow,
} from '@/lib/customer-projects/customer-read-models';

export const dynamic = 'force-dynamic';

const MAX_CUSTOMERS = 500;
const MAX_RELATION_ROWS = 2000;

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
    const customersResult = await supabase
      .from('cpc_customer_references')
      .select('id,reference_kind,display_name_snapshot,status,external_source,external_customer_id,external_owner_reference,provisional_source_reference,updated_at')
      .eq('org_id', profile.orgId)
      .in('status', ['active', 'pending_review'])
      .order('updated_at', { ascending: false })
      .range(0, MAX_CUSTOMERS - 1);

    if (customersResult.error) throw new Error('customer read failed');

    const customers = (customersResult.data ?? []) as CustomerReferenceRow[];
    if (customers.length >= MAX_CUSTOMERS) {
      return jsonError('客户数量超出当前安全上限，请使用后续筛选能力。', 409);
    }

    const customerIds = customers.map(customer => customer.id);
    if (customerIds.length === 0) {
      return NextResponse.json({
        ok: true,
        code: 'OK',
        message: 'success',
        data: { customers: [] },
      });
    }

    const [projectsResult, followUpsResult, eventsResult] = await Promise.all([
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
        .select('id,customer_reference_id,project_id,event_type,occurred_at,raw_input')
        .eq('org_id', profile.orgId)
        .in('customer_reference_id', customerIds)
        .is('project_id', null)
        .in('event_type', ['CONTACT_LOGGED', 'CUSTOMER_RESPONSE_RECEIVED'])
        .order('event_seq', { ascending: false })
        .limit(MAX_RELATION_ROWS),
    ]);

    if (projectsResult.error || followUpsResult.error || eventsResult.error) {
      throw new Error('customer relation read failed');
    }

    const projects = (projectsResult.data ?? []) as CustomerProjectRow[];
    const followUps = (followUpsResult.data ?? []) as CustomerFollowUpRow[];
    const events = (eventsResult.data ?? []) as CustomerEventRow[];

    if (
      projects.length >= MAX_RELATION_ROWS
      || followUps.length >= MAX_RELATION_ROWS
      || events.length >= MAX_RELATION_ROWS
    ) {
      return jsonError('客户关系数据量超出当前安全上限，请使用后续筛选能力。', 409);
    }

    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: {
        customers: buildCustomerList({
          now: new Date(),
          actorProfileId: profile.id,
          customers,
          projects,
          followUps,
          events,
        }),
      },
    });
  } catch {
    return jsonError('客户列表加载失败，请稍后重试。', 500);
  }
}
