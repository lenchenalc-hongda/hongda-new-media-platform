import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCpcProfile } from '@/lib/customer-projects/api';
import { uuidSchema } from '@/lib/customer-projects/schemas';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function eventDto(row: any) {
  const payload = row && typeof row.payload === 'object' && row.payload !== null
    ? row.payload as Record<string, unknown>
    : {};

  const evidenceReference = typeof payload.evidence_reference === 'string'
    ? payload.evidence_reference
    : null;

  const reasonKeys = [
    'reason',
    'pause_reason',
    'reopen_reason',
    'loss_reason',
    'cancellation_reason',
  ];

  let reason: string | null = null;
  for (const key of reasonKeys) {
    if (typeof payload[key] === 'string' && String(payload[key]).trim()) {
      reason = String(payload[key]);
      break;
    }
  }

  return {
    id: row.id,
    eventType: row.event_type,
    eventCategory: row.event_category,
    occurredAt: row.occurred_at,
    source: row.source,
    rawInput: typeof row.raw_input === 'string' ? row.raw_input : null,
    evidenceReference,
    reason,
  };
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
    const projectResult = await supabase
      .from('cpc_projects')
      .select('id,customer_reference_id,title,objective_summary,project_type,status,stage,waiting_on,next_check_at,risk_level,priority,expected_amount_minor,currency,expected_close_date,version,updated_at')
      .eq('org_id', profile.orgId)
      .eq('id', parsedId.data)
      .maybeSingle();

    if (projectResult.error) throw new Error('project read failed');
    if (!projectResult.data) return jsonError('项目不存在或不可见', 404);

    const project = projectResult.data as any;

    const [customerResult, workItemsResult, eventsResult] = await Promise.all([
      supabase
        .from('cpc_customer_references')
        .select('id,reference_kind,display_name_snapshot,status,external_source,external_customer_id')
        .eq('org_id', profile.orgId)
        .eq('id', project.customer_reference_id)
        .maybeSingle(),
      supabase
        .from('cpc_work_items')
        .select('id,work_item_type,title,due_at,status,priority,blocked_reason,version,updated_at')
        .eq('org_id', profile.orgId)
        .eq('project_id', project.id)
        .order('updated_at', { ascending: false })
        .limit(100),
      supabase
        .from('cpc_project_events')
        .select('id,event_type,event_category,occurred_at,source,raw_input,payload')
        .eq('org_id', profile.orgId)
        .eq('project_id', project.id)
        .order('event_seq', { ascending: false })
        .limit(50),
    ]);

    if (customerResult.error || workItemsResult.error || eventsResult.error) {
      throw new Error('project relation read failed');
    }

    const customer = customerResult.data as any;
    const workItems = (workItemsResult.data ?? []) as any[];
    const events = (eventsResult.data ?? []) as any[];

    const openNextAction = workItems.find(item =>
      item.work_item_type === 'NEXT_ACTION'
      && ['pending', 'in_progress', 'blocked'].includes(item.status),
    ) ?? null;

    return NextResponse.json({
      ok: true,
      code: 'OK',
      message: 'success',
      data: {
        project: {
          id: project.id,
          title: project.title,
          objectiveSummary: project.objective_summary,
          projectType: project.project_type,
          status: project.status,
          stage: project.stage,
          waitingOn: project.waiting_on,
          nextCheckAt: project.next_check_at,
          riskLevel: project.risk_level,
          priority: project.priority,
          expectedAmountMinor: project.expected_amount_minor,
          currency: project.currency,
          expectedCloseDate: project.expected_close_date,
          version: project.version,
          updatedAt: project.updated_at,
        },
        customer: customer ? {
          id: customer.id,
          referenceKind: customer.reference_kind,
          displayName: customer.display_name_snapshot,
          status: customer.status,
          externalSource: customer.reference_kind === 'canonical'
            ? customer.external_source
            : null,
          externalCustomerId: customer.reference_kind === 'canonical'
            ? customer.external_customer_id
            : null,
        } : null,
        nextAction: openNextAction ? {
          id: openNextAction.id,
          title: openNextAction.title,
          dueAt: openNextAction.due_at,
          status: openNextAction.status,
          priority: openNextAction.priority,
          blockedReason: openNextAction.blocked_reason,
          version: openNextAction.version,
        } : null,
        workItems: workItems.map(item => ({
          id: item.id,
          workItemType: item.work_item_type,
          title: item.title,
          dueAt: item.due_at,
          status: item.status,
          priority: item.priority,
          blockedReason: item.blocked_reason,
          version: item.version,
          updatedAt: item.updated_at,
        })),
        events: events.map(eventDto),
      },
    });
  } catch {
    return jsonError('项目详情加载失败，请稍后重试。', 500);
  }
}
