'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  evaluateWosP2Readiness,
  type WosP2ReadinessResult,
  type WosP2ResourceRow,
  type WosP2BlockerRow,
  type WosP2BaselineRow,
} from '@/lib/workshop-orders/p2-qa-readiness';

type Props = {
  orderId: string;
  organizationId: string;
  versionLabel: string;
  currentBatchQuantity: number;
};

type ReadState = { result: WosP2ReadinessResult; lastRead: string };
export default function LiveQaWorkshopReadiness({
  orderId, organizationId, versionLabel, currentBatchQuantity,
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
      const [resources, blockers, baselines, confirmations] = await Promise.all([
        db.from('wos_resource_readiness')
          .select('organization_id,entity_id,entity_type,resource_type,status,version_label,quantity_expected,quantity_arrived,confirmed_by_profile_id,confirmed_at,note')
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
          .select('organization_id,entity_id,entity_type,confirmation_type,decision,confirmed_at')
          .eq('organization_id',organizationId).eq('entity_id',orderId)
          .eq('entity_type','PRODUCTION_ORDER').limit(100),
      ]);
      const batches = [resources, blockers, baselines, confirmations];
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
      setReadState({ result, lastRead: new Date().toLocaleString('zh-CN') });
    } catch {
      // Never render a stale green readiness result on RLS/network failure.
      setReadState(null);
      setError('QA_READINESS_UNVERIFIED_OR_DENIED');
    } finally {
      setLoading(false);
    }
  }, [orderId, organizationId, versionLabel, currentBatchQuantity]);

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
          <div className="grid gap-2 sm:grid-cols-2">
            {readState.result.materials.map(row => (
              <div key={row.code} className="rounded border border-amber-200 bg-white p-3">
                <p className="text-xs font-semibold">{row.title} · {row.ready ? '已核实' : '未齐套'}</p>
                <p className="mt-1 text-xs text-gray-600">{row.status} · {row.message}</p>
              </div>
            ))}
          </div>
          {readState.result.issues.length > 0 && (
            <section className="rounded border border-red-200 bg-white p-3">
              <h5 className="text-xs font-semibold text-red-900">当前阻断项</h5>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-red-900">
                {readState.result.issues.map((value,idx) => <li key={idx}>{value}</li>)}
              </ul>
            </section>
          )}
          <p role="status" className="rounded border border-amber-400 bg-white p-3 text-xs font-medium text-amber-950">
            {readState.result.materialsVerified ? '物料资料可提交人工齐套审核；尚未放行开工。' : '资料或物料尚未核实，禁止开工。'}
          </p>
        </>
      )}
      {!readState && !error && <p role="status" className="text-xs text-amber-900">正在读取真实车间齐套记录...</p>}
      <p className="text-xs font-medium text-amber-900">
        当前仅提供受限数据核对。车间接单、退回资料、填写到货和确认开工的写入功能，
        必须通过独立审核并安装最小权限 QA 事务 RPC 后才能启用；本页面不会伪造已保存操作。
      </p>
    </section>
  );
}
