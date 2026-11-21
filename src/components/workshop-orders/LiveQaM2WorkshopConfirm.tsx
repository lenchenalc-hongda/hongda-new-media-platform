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
  office_post_order_version: number | null;
  workshop_proof_set_digest: string | null;
};

export default function LiveQaM2WorkshopConfirm({
  orderId, organizationId, versionLabel, expectedVersion, onSuccess,
}: {
  orderId: string;
  organizationId: string;
  versionLabel: string;
  expectedVersion: number;
  onSuccess: () => void;
}) {
  const enabled = process.env.NEXT_PUBLIC_WOS_P2_QA_M2_ENABLED === 'true';
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('车间使用独立账号核对同一四类图片证明集合');
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const db = createClient();
      if (!db) throw new Error('QA_SUPABASE_NOT_CONFIGURED');
      const result = await db.from('wos_visual_baselines')
        .select('id,office_proof_set_digest,office_post_order_version,workshop_proof_set_digest')
        .eq('organization_id', organizationId)
        .eq('entity_type', 'PRODUCTION_ORDER').eq('entity_id', orderId)
        .eq('version_label', versionLabel).eq('status', 'CURRENT')
        .is('superseded_at', null).maybeSingle();
      if (result.error) throw new Error('QA_M2_BASELINE_READ_FAILED');
      setBaseline((result.data as Baseline | null) ?? null);
    } catch {
      setBaseline(null);
      setMessage('QA_M2_BASELINE_READ_FAILED');
    }
  }, [enabled, orderId, organizationId, versionLabel]);

  useEffect(() => { void load(); }, [load, expectedVersion]);

  async function confirm() {
    if (!enabled || sending || !baseline
      || !baseline.office_proof_set_digest
      || baseline.office_post_order_version !== expectedVersion) return;
    const intent = {
      orderId,
      expectedVersion,
      action: 'BASELINE_WORKSHOP_CONFIRM',
      payload: {
        productionVersionLabel: versionLabel,
        note: note.trim(),
        baselineId: baseline.id,
      },
    };
    const fingerprint = JSON.stringify(intent);
    const requestId = pending.current?.fingerprint === fingerprint
      ? pending.current.requestId : crypto.randomUUID();
    const request = parseWosP2M2Action({ ...intent, requestId });
    if (!request) {
      setMessage('QA_M2_INPUT_INVALID');
      return;
    }
    pending.current = { fingerprint, requestId };
    setSending(true);
    setMessage('正在提交车间独立签认...');
    try {
      const response = await fetch('/api/workshop-orders/p2/m2', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
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
        data?: { requestId?: string; version?: number; canStart?: boolean };
      } = await response.json();
      if (!response.ok || !result.ok
        || !['QA_P2_M2_ACTION_APPLIED', 'QA_P2_M2_REPLAY_VERIFIED'].includes(result.code ?? '')
        || result.data?.requestId !== requestId
        || result.data?.version !== expectedVersion + 1
        || result.data?.canStart !== false) {
        setMessage('QA_M2_WORKSHOP_NOT_VERIFIED:' + (result.code ?? 'UNKNOWN'));
        return;
      }
      pending.current = null;
      setMessage('车间已用不同账号签认同一 proof-set；仍禁止自动开工。');
      await load();
      onSuccess();
    } catch {
      setMessage('QA_M2_WORKSHOP_NETWORK_UNVERIFIED');
    } finally {
      setSending(false);
    }
  }

  if (!enabled) return null;
  const ready = !!baseline?.office_proof_set_digest
    && baseline.office_post_order_version === expectedVersion
    && !baseline.workshop_proof_set_digest;
  return (
    <section className="rounded border border-indigo-300 bg-indigo-50 p-3"
      aria-label="车间四类图片独立签认">
      <h5 className="text-xs font-semibold text-indigo-950">四类图片 proof-set 车间独立签认</h5>
      <p className="mt-1 text-xs text-indigo-900">
        基准：{baseline?.id ?? '未建立'} · Office：
        {baseline?.office_proof_set_digest ? '已签认' : '未签认'} ·
        Workshop：{baseline?.workshop_proof_set_digest ? '已签认' : '未签认'}
      </p>
      <label className="mt-2 block text-xs font-medium text-indigo-950">
        签认依据（10–500 字）
        <textarea value={note} rows={2} maxLength={500} disabled={sending}
          onChange={event => { setNote(event.target.value); pending.current = null; }}
          className="mt-1 w-full rounded border border-indigo-300 bg-white p-2" />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={sending || !ready} onClick={() => void confirm()}
          className="rounded bg-indigo-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">
          车间签认同一 proof-set
        </button>
        <button type="button" disabled={sending} onClick={() => void load()}
          className="rounded border border-indigo-400 bg-white px-3 py-2 text-xs">
          刷新签认状态
        </button>
      </div>
      {!ready && <p className="mt-2 text-xs text-amber-900">
        等待办公室签认，或当前订单版本已变化，不能签认旧图片集合。
      </p>}
      {message && <p role="status" className="mt-2 text-xs text-indigo-950">{message}</p>}
    </section>
  );
}
