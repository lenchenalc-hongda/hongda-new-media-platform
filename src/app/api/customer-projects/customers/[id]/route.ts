import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCpcProfile } from '@/lib/customer-projects/api';
import { uuidSchema } from '@/lib/customer-projects/schemas';
import { buildOldCustomerRecommendation } from '@/lib/customer-projects/old-customer-proactive';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function toMs(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const parsedId = uuidSchema.safeParse(params.id);
  if (!parsedId.success) return jsonError('请求参数无效', 400);

  const supabase = await createClient();
  if (!supabase) return jsonError('数据库不可用', 500);

  const profileResult = await resolveCpcProfile(supabase);
  if (!profileResult.ok) {
    return jsonError(profileResult.message, profileResult.status);
  }
  const profile = profileResult.profile;

  try {
    const customerResult = await supabase
      .from('cpc_customer_references')
      .select('id,reference_kind,display_name_snapshot,status,external_source,external_customer_id,external_owner_reference,provisional_source_reference,source_synced_at,updated_at')
      .eq('org_id', profile.orgId)
      .eq('id', parsedId.data)
      .maybeSingle();

    if (customerResult.error) throw new Error('customer read failed');
    if (!customerResult.data) return jsonError('客户不存在或不可见', 404);

    const customer = customerResult.data as any;

    const [
      projectsResult,
      followUpsResult,
      relationshipEventsResult,
      transactionEventsResult,
      canFollowResult,
    ] = await Promise.all([
      supabase
        .from('cpc_projects')
        .select('id,customer_reference_id,title,project_type,status,stage,waiting_on,next_check_at,risk_level,priority,owner_profile_id,updated_at')
        .eq('org_id', profile.orgId)
        .eq('customer_reference_id', parsedId.data)
        .order('updated_at', { ascending: false })
        .limit(30),
      supabase
        .from('cpc_work_items')
        .select('id,customer_reference_id,project_id,work_item_type,title,assignee_profile_id,due_at,status,priority,blocked_reason,version,updated_at')
        .eq('org_id', profile.orgId)
        .eq('customer_reference_id', parsedId.data)
        .is('project_id', null)
        .eq('work_item_type', 'FOLLOW_UP')
        .order('updated_at', { ascending: false })
        .limit(50),
      supabase
        .from('cpc_project_events')
        .select('id,customer_reference_id,project_id,event_type,occurred_at,raw_input,payload')
        .eq('org_id', profile.orgId)
        .eq('customer_reference_id', parsedId.data)
        .is('project_id', null)
        .in('event_type', ['CONTACT_LOGGED', 'CUSTOMER_RESPONSE_RECEIVED'])
        .order('event_seq', { ascending: false })
        .limit(50),
      supabase
        .from('cpc_project_events')
        .select('id,customer_reference_id,project_id,event_type,occurred_at,raw_input,payload')
        .eq('org_id', profile.orgId)
        .eq('customer_reference_id', parsedId.data)
        .in('event_type', ['ORDER_CONFIRMED', 'PROJECT_WON'])
        .order('event_seq', { ascending: false })
        .limit(50),
      supabase.rpc('cpc_can_follow_customer', {
        p_customer_reference_id: parsedId.data,
        p_org_id: profile.orgId,
      }),
    ]);

    if (
      projectsResult.error
      || followUpsResult.error
      || relationshipEventsResult.error
      || transactionEventsResult.error
      || canFollowResult.error
    ) {
      throw new Error('customer detail relation read failed');
    }

    const projects = (projectsResult.data ?? []) as any[];
    const followUps = (followUpsResult.data ?? []) as any[];
    const relationshipEvents = (relationshipEventsResult.data ?? []) as any[];
    const events = [
      ...relationshipEvents,
      ...((transactionEventsResult.data ?? []) as any[]),
    ];

    const openFollowUps = followUps
      .filter(item => ['pending', 'in_progress', 'blocked'].includes(item.status))
      .sort((a, b) => {
        const assignmentDiff =
          Number(b.assignee_profile_id === profile.id)
          - Number(a.assignee_profile_id === profile.id);
        if (assignmentDiff !== 0) return assignmentDiff;
        const dueDiff = toMs(a.due_at) - toMs(b.due_at);
        if (dueDiff !== 0) return dueDiff;
        return String(a.id).localeCompare(String(b.id));
      });

    const currentFollowUp = openFollowUps[0] ?? null;
    const latestEvent = relationshipEvents
      .sort((left, right) => toMs(right.occurred_at) - toMs(left.occurred_at))[0] ?? null;
    const recommendation = buildOldCustomerRecommendation({
      now: new Date(),
      customer,
      projects,
      workItems: followUps,
      events,
    });

    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: {
        customer: {
          id: customer.id,
          referenceKind: customer.reference_kind,
          displayName: customer.display_name_snapshot,
          status: customer.status,
          sourceLabel: customer.reference_kind === 'canonical'
            ? customer.external_source
            : customer.provisional_source_reference,
          externalCustomerId: customer.reference_kind === 'canonical'
            ? customer.external_customer_id
            : null,
          externalOwnerReference: customer.reference_kind === 'canonical'
            ? customer.external_owner_reference
            : null,
          sourceSyncedAt: customer.reference_kind === 'canonical'
            ? customer.source_synced_at
            : null,
          updatedAt: customer.updated_at,
          canRecordFollowUp: canFollowResult.data === true,
        },
        relationshipRecommendation: recommendation,
        currentFollowUp: currentFollowUp ? {
          id: currentFollowUp.id,
          title: currentFollowUp.title,
          dueAt: currentFollowUp.due_at,
          status: currentFollowUp.status,
          priority: currentFollowUp.priority,
          blockedReason: currentFollowUp.blocked_reason,
          version: currentFollowUp.version,
          isAssignedToMe: currentFollowUp.assignee_profile_id === profile.id,
          canClose: profile.role === 'admin'
            || profile.role === 'manager'
            || currentFollowUp.assignee_profile_id === profile.id,
        } : null,
        projects: projects.map(project => ({
          id: project.id,
          title: project.title,
          projectType: project.project_type,
          status: project.status,
          stage: project.stage,
          waitingOn: project.waiting_on,
          nextCheckAt: project.next_check_at,
          riskLevel: project.risk_level,
          priority: project.priority,
          isOwnedByMe: project.owner_profile_id === profile.id,
          updatedAt: project.updated_at,
        })),
        events: relationshipEvents.map(event => ({
          id: event.id,
          eventType: event.event_type,
          occurredAt: event.occurred_at,
          summary: event.raw_input,
        })),
        promotionContext: latestEvent?.raw_input ? {
          eventId: latestEvent.id,
          summary: latestEvent.raw_input,
          occurredAt: latestEvent.occurred_at,
        } : null,
      },
    });
  } catch {
    return jsonError('客户详情加载失败，请稍后重试。', 500);
  }
}
