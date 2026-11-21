'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  parseWosP2M2Action,
  type WosP2M2Action,
} from '@/lib/workshop-orders/p2-m2-contract';

type Baseline = {
  id: string;
  office_proof_set_digest: string | null;
  workshop_proof_set_digest: string | null;
  office_post_order_version: number | null;
  workshop_post_order_version: number | null;
};

export default function LiveQaFinalReadiness({
  orderId,
  organizationId,
  versionLabel,
  expectedVersion,
  currentBatchQuantity,
  onSuccess,
}: {
  orderId: string;
  organizationId: string;
  versionLabel: string;
  expectedVersion: number;
  currentBatchQuantity: number;
  onSuccess: () => void;
}) {
  const enabled = process.env.NEXT_PUBLIC_WOS_P2_QA_M2_ENABLED === 'true';
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [checked, setChecked] = useState([false, false, false, false]);
  const [expectedQty, setExpectedQty] = useState(String(currentBatchQuantity));
  const [arrivedQty, setArrivedQty] = useState(String(currentBatchQuantity));
  const [note, setNote] = useState('四类物料与当前 proof-set 已完成最终实物核对');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const db = createClient();
      if (!db) throw new Error('QA_SUPABASE_NOT_CONFIGURED');
      const result = await db.from('wos_visual_baselines')
        .select('id,office_proof_set_digest,workshop_proof_set_digest,office_post_order_version,workshop_post_order_version')
        .eq('organization_id', organizationId)
        .eq('entity_type', 'PRODUCTION_ORDER').eq('entity_id', orderId)
        .eq('version_label', versionLabel).eq('status', 'CURRENT')
        .is('superseded_at', null).maybeSingle();
      if (result.error) throw new Error('QA_FINAL_BASELINE_READ_FAILED');
      setBaseline((result.data as Baseline | null) ?? null);
    } catch {
      setBaseline(null);
      setMessage('QA_FINAL_BASELINE_READ_FAILED');
    }
  }, [enabled, orderId, organizationId, versionLabel]);

  useEffect(() => { void load(); }, [load, expectedVersion]);

  async function submit() {
    if (!enabled || sending || !baseline || !checked.every(Boolean)) return;
    const now = new Date().toISOString();
    const intent = {
      orderId,
      expectedVersion,
      action: 'FINAL_READINESS_CONFIRM',
      payload: {
        productionVersionLabel: versionLabel,
        note: note.trim(),
        baselineId: baseline.id,
        physicalCheckAttested: true,
        filmArrivedAt: now,
        fixtureArrivedAt: now,
        incomingArrivedAt: now,
        signedSampleArrivedAt: now,
        quantityExpected: Number(expectedQty),
        quantityArrived: Number(arrivedQty),
      },
    } as const;
    const fingerprint = JSON.stringify(intent);
    const requestId = pending.current?.fingerprint === fingerprint
      ? pending.current.requestId : crypto.randomUUID();
    const request = parseWosP2M2Action({ ...intent, requestId });
    if (!request) {
      setMessage('QA_FINAL_INPUT_INVALID');
      return;
    }
    pending.current = { fingerprint, requestId };
    setSending(true);
    setMessage('正在提交单订单最终齐套事务...');
    try {
      const response = await fetch('/api/workshop-orders/p2/m2', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'x-wos-p2-m2': '1',
          Accept: 'application/json',
        },
        body: JSON.stringify(request satisfies WosP2M2Action),
      });
      const result: {
        ok?: boolean;
        code?: string;
        data?: {
          requestId?: string;
          version?: number;
          workflowStatus?: string;
          canStart?: boolean;
        };
      } = await response.json();
      if (!response.ok || !result.ok
        || !['QA_P2_M2_ACTION_APPLIED', 'QA_P2_M2_REPLAY_VERIFIED'].includes(result.code ?? '')
        || result.data?.requestId !== requestId
        || result.data?.version !== expectedVersion + 1
        || result.data?.workflowStatus !== 'READINESS_CHECK'
        || result.data?.canStart !== false) {
        setMessage('QA_FINAL_NOT_VERIFIED:' + (result.code ?? 'UNKNOWN'));
        return;
      }
      pending.current = null;
      setMessage('四类物料最终状态已由同一原子事务持久化。');
      onSuccess();
    } catch {
      setMessage('QA_FINAL_NETWORK_RESULT_UNVERIFIED');
    } finally {
      setSending(false);
    }
  }

  if (!enabled) return null;
  const unsigned = !baseline?.office_proof_set_digest || !baseline?.workshop_proof_set_digest
    || baseline.office_post_order_version === null
    || baseline.workshop_post_order_version !== expectedVersion;
  const labels = ['花膜版本已核实', '夹具适配已核实', '来料数量已核实', '签样已核实'];

  return (
    <section className="rounded border border-emerald-300 bg-emerald-50 p-3"
      aria-label="四类物料最终齐套事务">
      <h5 className="text-xs font-semibold text-emerald-950">四类物料最终齐套（单事务）</h5>
      <p className="mt-1 text-xs text-emerald-900">
        当前基准：{baseline?.id ?? '未建立'} · Office：
        {baseline?.office_proof_set_digest ? '已签认' : '未签认'} · Workshop：
        {baseline?.workshop_proof_set_digest ? '已签认' : '未签认'}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {labels.map((label, index) => (
          <label key={label} className="flex items-center gap-2 rounded bg-white p-2 text-xs">
            <input type="checkbox" checked={checked[index]} disabled={sending || unsigned}
              onChange={event => {
                const next = [...checked];
                next[index] = event.target.checked;
                setChecked(next);
                pending.current = null;
              }} />
            {label}
          </label>
        ))}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-medium">
          来料应到数量
          <input type="number" min="1" step="1" value={expectedQty} disabled={sending || unsigned}
            onChange={event => { setExpectedQty(event.target.value); pending.current = null; }}
            className="mt-1 w-full rounded border p-2" />
        </label>
        <label className="text-xs font-medium">
          来料实到数量
          <input type="number" min="1" step="1" value={arrivedQty} disabled={sending || unsigned}
            onChange={event => { setArrivedQty(event.target.value); pending.current = null; }}
            className="mt-1 w-full rounded border p-2" />
        </label>
      </div>
      <label className="mt-2 block text-xs font-medium">
        最终核对依据（10–500 字）
        <textarea rows={2} maxLength={500} value={note} disabled={sending || unsigned}
          onChange={event => { setNote(event.target.value); pending.current = null; }}
          className="mt-1 w-full rounded border p-2" />
      </label>
      <button type="button" disabled={sending || unsigned || !checked.every(Boolean)}
        onClick={() => void submit()}
        className="mt-2 rounded bg-emerald-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">
        最终确认四类物料并进入 READINESS_CHECK
      </button>
      {unsigned && <p className="mt-2 text-xs text-amber-900">
        必须由 Office 和独立 Workshop 账号签认当前版本后才可执行最终齐套事务。
      </p>}
      {message && <p role="status" className="mt-2 text-xs text-emerald-950">{message}</p>}
      <p className="mt-2 text-xs font-semibold text-red-800">本操作不包含开工权限，结果保持 canStart=false。</p>
    </section>
  );
}
