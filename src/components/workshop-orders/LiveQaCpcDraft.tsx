'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { NormalizedProductionOrderDraft } from '@/lib/workshop-orders/office-entry';

type Customer = { id: string; name: string; status: string };
type Project = { id: string; customerId: string; name: string; ownerProfileId: string };
type OptionsResponse = {
  ok: boolean;
  code: string;
  data?: { customers: Customer[]; projects: Project[] };
};
type Saved = {
  orderId: string; orderNumber: string; version: number;
  persisted: boolean; submitted: boolean; editable: boolean;
};

export default function LiveQaCpcDraft({
  draft, valid,
}: { draft: NormalizedProductionOrderDraft; valid: boolean }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState<Saved | null>(null);
  const orderNumber = useRef<string | null>(null);
  const eligibleProjects = useMemo(
    () => projects.filter(project => project.customerId === customerId),
    [projects, customerId],
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/workshop-orders/production/cpc-drafts', {
          credentials: 'same-origin', cache: 'no-store',
        });
        const body: OptionsResponse = await response.json();
        if (!response.ok || !body.ok || body.code !== 'CPC_OPTIONS_VERIFIED'
          || !Array.isArray(body.data?.customers) || !Array.isArray(body.data.projects)) {
          throw new Error('CPC_OPTIONS_UNAVAILABLE');
        }
        if (active) {
          setCustomers(body.data.customers);
          setProjects(body.data.projects);
          setLoading(false);
        }
      } catch {
        if (active) { setNotice('QA_CPC_OPTIONS_UNAVAILABLE'); setLoading(false); }
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  async function saveDraft() {
    if (busy || saved) return;
    if (!valid || !customerId || !projectId
      || !eligibleProjects.some(project => project.id === projectId)) {
      setNotice('QA_CPC_REQUIRED_FIELDS_MISSING');
      return;
    }
    if (!orderNumber.current) orderNumber.current = 'QA-CPC-NONPROD-' + crypto.randomUUID();
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/workshop-orders/production/cpc-drafts', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId, projectId,
          orderNumber: orderNumber.current,
          productName: draft.productName,
          productMaterial: draft.productMaterial,
          requestedQuantity: draft.requestedQuantity,
          currentBatchQuantity: draft.currentBatchQuantity,
          priority: draft.priority,
          versionLabel: draft.versionLabel,
          plannedShipDate: draft.plannedShipDate,
          surfaceTreatment: draft.surfaceTreatment,
          patternScope: draft.patternScope,
          seamTolerance: draft.seamTolerance,
          positionReference: draft.positionReference,
          customerAcceptanceStandard: draft.customerAcceptanceStandard,
          packagingMethod: draft.packagingMethod,
          cartonQuantity: draft.cartonQuantity,
          labelMarkingRule: draft.labelMarkingRule,
          isUrgent: draft.isUrgent,
          splitDelivery: draft.splitDelivery,
        }),
      });
      const body: { ok?: boolean; code?: string; data?: Saved } =
        await response.json().catch(() => ({}));
      if (!response.ok || !body.ok
        || !['QA_CPC_DRAFT_SAVED', 'QA_CPC_DRAFT_REPLAY_VERIFIED'].includes(body.code ?? '')
        || !body.data?.persisted || body.data?.submitted !== false
        || body.data?.orderNumber !== orderNumber.current
        || body.data?.version !== 1 || !body.data.orderId) {
        setNotice('QA_CPC_DRAFT_' + (body.code?.match(/^[A-Z_]{3,40}$/) ? body.code : 'UNVERIFIED'));
        return;
      }
      setSaved(body.data);
      setNotice('QA_CPC_DRAFT_SAVED_TO_DATABASE');
    } catch {
      setNotice('QA_CPC_DRAFT_RESPONSE_UNCERTAIN_RETRY_SAME_NUMBER');
    } finally {
      setBusy(false);
    }
  }

  const selectedCustomer = customers.find(customer => customer.id === customerId);
  return (
    <section aria-label="CPC 关联非生产云端草稿" className="space-y-3 rounded-lg border-2 border-indigo-300 bg-indigo-50 p-4">
      <h2 className="text-sm font-semibold text-indigo-950">CPC 客户 / 项目关联 · QA 云端草稿</h2>
      <p className="text-xs leading-5 text-indigo-900">
        当前功能只在隔离 QA 环境创建 DRAFT，使用本账号 CPC 可见客户、项目和实际负责人。
        客户或项目名称不能由页面自行伪造。草稿不会提交车间、更不会开工。
        已保存草稿后修改仍需要独立修订 RPC，本阶段没有授予 UPDATE 权限。
      </p>
      {loading ? (
        <p role="status" className="text-xs text-indigo-800">正在读取当前账号可访问的 CPC 客户和项目...</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium text-indigo-950">
            选择 CPC 客户
            <select aria-label="选择 CPC 客户" value={customerId}
              disabled={busy || !!saved} onChange={e => { setCustomerId(e.target.value); setProjectId(''); }}
              className="min-h-11 w-full rounded border border-gray-300 bg-white p-2">
              <option value="">请选择客户</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-indigo-950">
            关联 CPC 项目
            <select aria-label="关联 CPC 项目" value={projectId}
              disabled={busy || !!saved || !customerId}
              onChange={e => setProjectId(e.target.value)}
              className="min-h-11 w-full rounded border border-gray-300 bg-white p-2">
              <option value="">请选择同一客户的活动项目</option>
              {eligibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
      )}
      {selectedCustomer?.status === 'pending_review' && (
        <p className="text-xs text-amber-800">该 QA 客户仍处于待核实状态；只允许保存草稿，不允许视为正式确认订单。</p>
      )}
      <button type="button" onClick={() => { void saveDraft(); }}
        disabled={loading || busy || !!saved || !valid || !customerId || !projectId}
        className="min-h-11 rounded bg-indigo-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
        {busy ? '正在校验并写入 QA 数据库...' : '保存 CPC 关联 QA 草稿'}
      </button>
      {!valid && <p className="text-xs text-amber-800">请先填写上方必填生产资料；当前基础数据库不允许用伪造数量或产品名称保存空白草稿。</p>}
      {saved && (
        <p role="status" className="break-all text-xs text-green-900">
          数据库已保存：{saved.orderNumber}（订单 ID：{saved.orderId}，版本：{saved.version}）。
          当前状态 DRAFT，未进入车间。编辑后再次提交暂未开放。
        </p>
      )}
      {notice && <p role="status" className="text-xs text-indigo-900">{notice}</p>}
    </section>
  );
}
