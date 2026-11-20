'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import LiveQaWorkshopActions from './LiveQaWorkshopActions';
import LiveQaWorkshopM2 from './LiveQaWorkshopM2';
import {
  evaluateWosP2Readiness,
  type WosP2ReadinessResult,
  type WosP2ResourceRow,
  type WosP2BlockerRow,
  type WosP2BaselineRow,
} from '@/lib/workshop-orders/p2-qa-readiness';
import {
  evaluateWosP2HandoffTimeline,
  type WosP2HandoffResult,
  type WosP2HandoffHistory,
} from '@/lib/workshop-orders/p2-handoff-timeline';

type Props = {
  orderId: string;
  organizationId: string;
  versionLabel: string;
  currentBatchQuantity: number;
  expectedVersion: number;
  workflowStatus: string;
  onAfterAction: () => void;
};

type ReadState = {
  result: WosP2ReadinessResult;
  handoff: WosP2HandoffResult;
  lastRead: string;
  confirmations: Array<{
    confirmation_type:string; decision:string; profile_id:string;
    role_snapshot:string; note:string|null; confirmed_at:string;
  }>;
  history: Array<{
    previous_status:string|null; next_status:string; actor_profile_id:string;
    actor_role:string; reason_code:string; note:string|null; created_at:string;
  }>;
};
export default function LiveQaWorkshopReadiness({
  orderId, organizationId, versionLabel, currentBatchQuantity,
  expectedVersion, workflowStatus, onAfterAction,
}: Props) {
  const [readState, setReadState] = useState<ReadState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);

  const fetchActualReadiness = useCallback(async () => {
    setLoading(true);
    setError('');
    setReadState(null);
    try {
      const db = createClient();
      if (!db) throw new Error('QA_SUPABASE_NOT_CONFIGURED');
      // All records must be fetched using the current Operator/Admin session,
      // organization RLS, exact order id and entity type. No service role key.
      const [resources, blockers, baselines, confirmations, history] = await Promise.all([
        db.from('wos_resource_readiness')
          .select('organization_id,entity_id,entity_type,resource_type,status,version_label,quantity_expected,quantity_arrived,expected_at,arrived_at,confirmed_by_profile_id,confirmed_at,note')
          .eq('organization_id',organizationId).eq('entity_id',orderId)
          .eq('entity_type','PRODUCTION_ORDER').limit(100),
        db.from('wos_blockers')
          .select('organization_id,entity_id,entity_type,blocker_code,description,status')
          .eq('organization_id',organizationId).eq('entity_id',orderId)
          .eq('entity_type','PRODUCTION_ORDER').limit(100),
        db.from('wos_visual_baselines')
          .select('organization_id,entity_id,entity_type,version_label,status,office_confirmed_at,workshop_confirmed_at')
          .eq('organization_id',organizationId).eq('entity_id',orderId)
          .eq('entity_type','PRODUCTION_ORDER').limit(100),
        db.from('wos_confirmations')
          .select('organization_id,entity_id,entity_type,confirmation_type,decision,profile_id,role_snapshot,note,confirmed_at')
          .eq('organization_id',organizationId).eq('entity_id',orderId)
          .eq('entity_type','PRODUCTION_ORDER').limit(100),
        db.from('wos_status_history')
          .select('organization_id,entity_id,entity_type,previous_status,next_status,actor_profile_id,actor_role,reason_code,note,created_at')
          .eq('organization_id',organizationId).eq('entity_id',orderId)
          .eq('entity_type','PRODUCTION_ORDER')
          .order('created_at',{ ascending:false }).limit(100),
      ]);
      const batches = [resources, blockers, baselines, confirmations, history];
      if (batches.some(row => row.error || !Array.isArray(row.data) || (row.data?.length ?? 100) >= 100)) {
        throw new Error('QA_READINESS_RLS_READ_FAILED_OR_TRUNCATED');
      }
      // Distinct Supabase table projections have different row shapes.
      // Check their common scope fields without coalescing into a false
      // homogeneous array or weakening any RLS scope condition.
      for (const batch of batches) {
        for (const row of batch.data ?? []) {
          if (row.organization_id !== organizationId ||
              row.entity_id !== orderId ||
              row.entity_type !== 'PRODUCTION_ORDER') {
            throw new Error('QA_READINESS_SCOPE_MISMATCH');
          }
        }
      }
      const result = evaluateWosP2Readiness({
        versionLabel, currentBatchQuantity,
        resources: resources.data as WosP2ResourceRow[],
        blockers: blockers.data as WosP2BlockerRow[],
        baselines: baselines.data as WosP2BaselineRow[],
        readVerified: true,
      });
      const handoff = evaluateWosP2HandoffTimeline({
        history: history.data as WosP2HandoffHistory[],
        currentStatus: workflowStatus,
        currentVersion: expectedVersion,
        readVerified: true,
      });
      setReadState({
        result, handoff, lastRead: new Date().toLocaleString('zh-CN'),
        confirmations: (confirmations.data ?? []).map(row => ({
          confirmation_type:row.confirmation_type,
          decision:row.decision,
          profile_id:row.profile_id,
          role_snapshot:row.role_snapshot,
          note:row.note,
          confirmed_at:row.confirmed_at,
        })),
        history:(history.data ?? []).map(row => ({
          previous_status:row.previous_status,
          next_status:row.next_status,
          actor_profile_id:row.actor_profile_id,
          actor_role:row.actor_role,
          reason_code:row.reason_code,
          note:row.note,
          created_at:row.created_at,
        })),
      });
    } catch {
      // Never render a stale green readiness result on RLS/network failure.
      setReadState(null);
      setError('QA_READINESS_UNVERIFIED_OR_DENIED');
    } finally {
      setLoading(false);
    }
  }, [orderId, organizationId, versionLabel, currentBatchQuantity, expectedVersion, workflowStatus]);

  useEffect(() => {
    void fetchActualReadiness();
  }, [fetchActualReadiness, reloadVersion]);

  return (
    <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3"
      aria-label="真实 QA 物料齐套与接单核对">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-amber-950">车间接单与物料齐套核对（真实 QA 只读）</h4>
          <p className="mt-1 text-xs text-amber-900">
            仅使用当前账号经 RLS 授权的物料、签样基准和阻断记录。
            未登记、版本不一致或查询失败一律视为未齐套。
          </p>
        </div>
        <button type="button" disabled={loading}
          className="rounded border border-amber-400 bg-white px-3 py-2 text-xs text-amber-950 disabled:opacity-50"
          onClick={() => setReloadVersion(value => value + 1)}>
          {loading ? '正在核对...' : '刷新真实物料状态'}
        </button>
      </div>
      {error && <p role="alert" className="rounded bg-red-100 p-2 text-xs text-red-900">{error}。不能接单、排期或开工。</p>}
      {readState && (
        <>
          <p className="text-xs text-amber-900">
            最后核对：{readState.lastRead} · 来源：{readState.result.source}
          </p>
          <section aria-label="办公室与车间交接进度" className="rounded border border-amber-200 bg-white p-3">
            <h5 className="text-xs font-semibold text-gray-900">
              办公室 → 车间交接进度（真实 QA 状态历史）
            </h5>
            <p className="mt-1 text-xs text-gray-700">
              当前版本 v{expectedVersion} · 当前状态：{workflowStatus} ·
              来源：QA_RLS_STATUS_HISTORY_ONLY。
              本进度只核对状态历史，不等同于独立回执验收或开工授权。
            </p>
            <ol className="mt-2 grid gap-2 sm:grid-cols-2">
              {readState.handoff.steps.map(stage => (
                <li key={stage.code} className="rounded border border-gray-200 px-3 py-2 text-xs">
                  <span className={stage.verifiedByHistory ? 'font-semibold text-emerald-800' : 'font-semibold text-amber-950'}>
                    {stage.verifiedByHistory ? '历史已匹配' : '历史待核验'} · {stage.label}
                  </span>
                  {stage.recordedAt && <span className="mt-1 block text-gray-600">{stage.recordedAt}</span>}
                </li>
              ))}
            </ol>
            <p role="status" className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-950">
              {readState.handoff.historySequenceVerified
                ? '六项交接状态历史匹配完成；不代表物料齐套或车间开工放行。'
                : '交接历史证据不完整或与订单版本不匹配；本页不作完成判定。'}
            </p>
            <p className="mt-2 text-xs text-gray-700">{readState.handoff.nextAction}</p>
          </section>
          <div className="grid gap-2 sm:grid-cols-2">
            {readState.result.materials.map(row => (
              <div key={row.code} className="rounded border border-amber-200 bg-white p-3">
                <p className="text-xs font-semibold">{row.title} · {row.ready ? '已核实' : '未齐套'}</p>
                <p className="mt-1 text-xs text-gray-600">{row.status} · {row.message}</p>
                {row.evidence ? (
                  <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 border-t pt-2 text-xs text-gray-700">
                    <dt>物料版本</dt><dd>{row.evidence.versionLabel ?? '未登记'}</dd>
                    <dt>预计到位</dt><dd>{row.evidence.expectedAt ?? '未登记'}</dd>
                    <dt>实际到位</dt><dd>{row.evidence.arrivedAt ?? '未登记'}</dd>
                    {row.code === 'INCOMING_MATERIAL' && (
                      <>
                        <dt>应到 / 实到</dt><dd>{row.evidence.quantityExpected ?? '未知'} / {row.evidence.quantityArrived ?? '未知'}</dd>
                        <dt>本批数量缺口</dt><dd>{row.evidence.quantityShortfall ?? '未核实'}</dd>
                      </>
                    )}
                    <dt>核对人员</dt><dd>{row.evidence.confirmedBy ? '已有人员记录' : '未登记'}</dd>
                    <dt>核对时间</dt><dd>{row.evidence.confirmedAt ?? '未登记'}</dd>
                    <dt>异常说明</dt><dd>{row.evidence.note ?? '无补充说明'}</dd>
                  </dl>
                ) : (
                  <p className="mt-2 text-xs text-amber-900">无有效物料记录，不得按默认值视为齐套。</p>
                )}
              </div>
            ))}
          </div>
          <section className="rounded border border-amber-300 bg-white p-3" aria-label="当前生产图片基准与办公室车间双重核对">
            <h5 className="text-xs font-semibold">当前图片 / 签样基准（只读证据）</h5>
            <div className="mt-2 grid gap-1 text-xs text-gray-700 sm:grid-cols-2">
              <p>CURRENT 基准记录：{readState.result.visualBaseline.currentCount}</p>
              <p>基准版本：{readState.result.visualBaseline.versionLabel ?? '未登记'}</p>
              <p>当前生产版本匹配：{readState.result.visualBaseline.currentVersionMatched ? '记录匹配' : '未核实'}</p>
              <p>办公室签认：{readState.result.visualBaseline.officeConfirmed ? '时间已登记' : '未登记'}</p>
              <p>车间签认：{readState.result.visualBaseline.workshopConfirmed ? '时间已登记' : '未登记'}</p>
            </div>
            <p className="mt-2 text-xs text-amber-900">
              时间戳与版本标签不等于独立人员签名、私有图片 SHA-256 完整性证明或实物签样核验；
              后续必须通过受审核的独立证据链及人工放行。
            </p>
          </section>
          {readState.result.issues.length > 0 && (
            <section className="rounded border border-red-200 bg-white p-3">
              <h5 className="text-xs font-semibold text-red-900">当前阻断项</h5>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-red-900">
                {readState.result.issues.map((value,idx) => <li key={idx}>{value}</li>)}
              </ul>
            </section>
          )}
          <p role="status" className="rounded border border-amber-400 bg-white p-3 text-xs font-medium text-amber-950">
            {readState.result.materialsVerified && readState.handoff.historySequenceVerified
              ? '物料与当前订单的交接历史均已匹配，仅可提交人工齐套审核；尚未放行开工。'
              : '物料、签样或当前事务版本交接证明未全部核实，禁止排期放行或开工。'}
          </p>
          {readState.history.length > 0 && (
            <section className="rounded border border-amber-200 bg-white p-3">
              <h5 className="text-xs font-semibold">真实订单状态历史（操作人与时间）</h5>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                {readState.history.slice(0,20).map((h,i) => <li key={i}>
                  {h.previous_status ?? '无'} → {h.next_status} · {h.reason_code} ·
                  {h.actor_role} / {h.actor_profile_id} · {h.created_at} · {h.note ?? '无备注'}
                </li>)}
              </ul>
            </section>
          )}
          {readState.confirmations.length > 0 && (
            <section className="rounded border border-amber-200 bg-white p-3">
              <h5 className="text-xs font-semibold">真实车间确认与退回操作记录</h5>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                {readState.confirmations.map((c,i) => <li key={i}>
                  {c.confirmation_type} · {c.decision} · {c.role_snapshot} ·
                  {c.profile_id} · {c.confirmed_at} · {c.note ?? '无备注'}
                </li>)}
              </ul>
            </section>
          )}
        </>
      )}
      {!readState && !error && <p role="status" className="text-xs text-amber-900">正在读取真实车间齐套记录...</p>}
      <LiveQaWorkshopActions
        orderId={orderId}
        expectedVersion={expectedVersion}
        workflowStatus={workflowStatus}
        onSuccess={onAfterAction}
      />
      <LiveQaWorkshopM2
        orderId={orderId}
        organizationId={organizationId}
        productionVersionLabel={versionLabel}
        expectedVersion={expectedVersion}
        onSuccess={onAfterAction}
      />
      <p className="text-xs font-medium text-amber-900">
        在 QA SQL 与权限单独审核安装前，操作按钮保持关闭。
        确认开工不属于本阶段授权，本页面不会伪造已保存操作。
      </p>
    </section>
  );
}
