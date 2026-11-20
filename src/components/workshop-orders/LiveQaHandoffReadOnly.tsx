'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { evaluateWosP2HandoffTimeline, type WosP2HandoffResult, type WosP2HandoffHistory } from '@/lib/workshop-orders/p2-handoff-timeline';
import { evaluateWosP2Readiness, type WosP2ReadinessResult, type WosP2ResourceRow, type WosP2BlockerRow, type WosP2BaselineRow } from '@/lib/workshop-orders/p2-qa-readiness';
import { isVerifiedP2QaReadActor, isScopedP2QaOrder } from '@/lib/workshop-orders/p2-qa-readonly-preview';

// One synthetic order only. The client never accepts an arbitrary order ID,
// organization ID or user-defined role from query strings or local storage.
const SYNTHETIC_ORDER_ID = '953d2204-3e65-4b75-b10e-c6e97f1bbb56';

type ReadOnlyState = {
  readonly kind: 'PASS';
  readonly status: string;
  readonly version: number;
  readonly handoff: WosP2HandoffResult;
  readonly readiness: WosP2ReadinessResult;
};
type ViewState = ReadOnlyState | { readonly kind: 'LOADING' } | { readonly kind: 'DENIED' };

export default function LiveQaHandoffReadOnly() {
  const [state, setState] = useState<ViewState>({ kind: 'LOADING' });

  useEffect(() => {
    let active = true;
    async function readFromCurrentSession() {
      try {
        const client = createClient();
        if (!client) throw new Error('QA_CLIENT_MISSING');
        const auth = await client.auth.getUser();
        if (auth.error || !auth.data.user) throw new Error('QA_AUTH_REQUIRED');
        const user = auth.data.user;

        const profileRows = await client.from('profiles')
          .select('id,user_id,org_id,role,is_active')
          .eq('user_id', user.id).eq('is_active', true).limit(2);
        if (profileRows.error || profileRows.data?.length !== 1 ||
            !isVerifiedP2QaReadActor(user.id, profileRows.data[0])) {
          throw new Error('QA_ROLE_NOT_AUTHORIZED');
        }
        const actor = profileRows.data[0];
        const organizationId = actor.org_id;

        const selectedOrder = await client.from('wos_production_orders')
          .select('id,organization_id,workflow_status,version,version_label,current_batch_quantity')
          .eq('id', SYNTHETIC_ORDER_ID)
          .eq('organization_id', organizationId)
          .maybeSingle();
        if (selectedOrder.error ||
            !isScopedP2QaOrder(selectedOrder.data, SYNTHETIC_ORDER_ID, organizationId)) {
          throw new Error('QA_ORDER_OUTSIDE_AUTHORIZED_SCOPE');
        }
        const order = selectedOrder.data;
        const filter = (query: any) => query
          .eq('organization_id',organizationId)
          .eq('entity_type','PRODUCTION_ORDER')
          .eq('entity_id',SYNTHETIC_ORDER_ID).limit(100);

        const [history, resources, blockers, baselines] = await Promise.all([
          filter(client.from('wos_status_history')
            .select('organization_id,entity_id,entity_type,previous_status,next_status,actor_role,reason_code,created_at'))
            .order('created_at',{ ascending:false }),
          filter(client.from('wos_resource_readiness')
            .select('organization_id,entity_id,entity_type,resource_type,status,version_label,quantity_expected,quantity_arrived,confirmed_by_profile_id,confirmed_at,note')),
          filter(client.from('wos_blockers')
            .select('organization_id,entity_id,entity_type,blocker_code,description,status')),
          filter(client.from('wos_visual_baselines')
            .select('organization_id,entity_id,entity_type,version_label,status,office_confirmed_at,workshop_confirmed_at')),
        ]);
        const batches = [history, resources, blockers, baselines];
        if (batches.some(batch => batch.error || !Array.isArray(batch.data) ||
            batch.data.length >= 100)) throw new Error('QA_RLS_READ_INCOMPLETE');
        for (const batch of batches) {
          for (const row of batch.data ?? []) {
            if (row.organization_id !== organizationId ||
                row.entity_id !== SYNTHETIC_ORDER_ID ||
                row.entity_type !== 'PRODUCTION_ORDER') {
              throw new Error('QA_RLS_ORGANIZATION_MISMATCH');
            }
          }
        }
        const handoff = evaluateWosP2HandoffTimeline({
          history: history.data as WosP2HandoffHistory[],
          currentStatus: order.workflow_status,
          currentVersion: order.version,
          readVerified: true,
        });
        const readiness = evaluateWosP2Readiness({
          versionLabel: order.version_label,
          currentBatchQuantity: order.current_batch_quantity,
          resources: resources.data as WosP2ResourceRow[],
          blockers: blockers.data as WosP2BlockerRow[],
          baselines: baselines.data as WosP2BaselineRow[],
          readVerified: true,
        });
        if (active) setState({
          kind:'PASS', status:order.workflow_status, version:order.version,
          handoff, readiness,
        });
      } catch {
        // Do not leak whether a foreign organization's order exists.
        if (active) setState({kind:'DENIED'});
      }
    }
    void readFromCurrentSession();
    return () => { active = false; };
  }, []);

  if (state.kind === 'LOADING') {
    return <p role="status" className="rounded border p-4 text-sm">只读查询中；未取得 QA RLS 结果前不显示任何订单。</p>;
  }
  if (state.kind === 'DENIED') {
    return <p role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-sm">
      QA_READONLY_DENIED_OR_UNVERIFIED：当前账号、角色、组织或真实订单数据未验证。
    </p>;
  }

  return (
    <section className="space-y-4" aria-label="WOS 订单交接只读验收结果">
      <header className="rounded border border-blue-300 bg-blue-50 p-4">
        <h2 className="text-sm font-semibold">固定合成订单 · 只读查看</h2>
        <p className="mt-2 text-xs">当前：{state.status} / v{state.version}。以下结果仅来自当前 Supabase 登录身份的组织 RLS 查询。</p>
        <p className="mt-2 text-xs font-semibold text-amber-900">
          只读预览：无提交、修改、接单、物料确认或生产开工权限。
        </p>
      </header>
      <section className="rounded border p-4" aria-label="办公室到车间六步交接">
        <h3 className="text-sm font-semibold">办公室 → 车间六步交接</h3>
        <p className="mt-2 text-xs">
          {state.handoff.historySequenceVerified ? '历史六步匹配；不代表物料齐套。' :
            '历史缺失、时间不一致或版本不匹配，交接尚不能验收。'}
        </p>
        <ol className="mt-3 grid gap-2 md:grid-cols-2">
          {state.handoff.steps.map(step => (
            <li key={step.code} className="rounded border p-2 text-xs">
              {step.verifiedByHistory ? '✓ 历史匹配' : '待核验'} · {step.label}
              {step.recordedAt && <span className="block text-gray-500">{step.recordedAt}</span>}
            </li>
          ))}
        </ol>
        <p role="status" className="mt-2 text-xs text-amber-900">{state.handoff.nextAction}</p>
      </section>
      <section className="rounded border p-4" aria-label="物料及签样缺口">
        <h3 className="text-sm font-semibold">物料与签样（不具备自动开工能力）</h3>
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {state.readiness.materials.map(material => (
            <li key={material.code} className="rounded border p-2 text-xs">
              <strong>{material.title}</strong> · {material.ready ? '记录符合核验条件' : '尚未齐套'}
              <p>{material.message}</p>
            </li>
          ))}
        </ul>
        {state.readiness.issues.map((issue,index) => (
          <p key={index} className="mt-2 text-xs text-red-800">{issue}</p>
        ))}
        <p className="mt-2 text-xs font-semibold">
          即使以上记录全部齐套，也必须经过独立的人工生产放行；本页面不能开工。
        </p>
      </section>
    </section>
  );
}
