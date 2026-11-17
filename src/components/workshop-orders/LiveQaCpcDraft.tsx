'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { NormalizedProductionOrderDraft } from '@/lib/workshop-orders/office-entry';

type Customer = { id: string; name: string; status: string };
type Project = { id: string; customerId: string; name: string; ownerProfileId: string };
type OptionsResponse = {
  ok: boolean;
  code: string;
  data?: { customers: Customer[]; projects: Project[]; actorProfileId: string };
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
  const [revisionReason, setRevisionReason] = useState('');
  const savedDraftSnapshot = useRef<NormalizedProductionOrderDraft | null>(null);
  const pendingRevision = useRef<{
    requestId: string;
    reason: string;
    patch: Record<string, string | number | boolean>;
    snapshot: NormalizedProductionOrderDraft;
  } | null>(null);
  const revisionEnabled = process.env.NEXT_PUBLIC_WOS_P1_QA_DRAFT_REVISION_ENABLED === 'true';
  const orderNumber = useRef<string | null>(null);
  const recoveryStorageKey = useRef<string | null>(null);
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
          || !Array.isArray(body.data?.customers) || !Array.isArray(body.data.projects)
          || !/^[0-9a-f-]{36}$/i.test(body.data.actorProfileId)) {
          throw new Error('CPC_OPTIONS_UNAVAILABLE');
        }
        if (active) {
          // The sole durable identifier used for a retry is a synthetic order
          // number. Never persist passwords, access tokens or customer details.
          const key = 'wos-p1-qa-cpc-draft:' + body.data.actorProfileId;
          recoveryStorageKey.current = key;
          try {
            const existingNumber = window.localStorage.getItem(key);
            if (existingNumber && /^QA-CPC-NONPROD-[0-9a-f-]{36}$/i.test(existingNumber)) {
              orderNumber.current = existingNumber;
              setNotice('QA_CPC_DRAFT_RETRY_SAME_NUMBER_AFTER_RELOAD');
            }
          } catch {
            setNotice('QA_CPC_RECOVERY_STORAGE_UNAVAILABLE');
          }
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
    if (!recoveryStorageKey.current) {
      setNotice('QA_CPC_IDENTITY_NOT_VERIFIED');
      return;
    }
    if (!orderNumber.current) orderNumber.current = 'QA-CPC-NONPROD-' + crypto.randomUUID();
    // Persist before HTTP. A database commit with a lost response must not
    // cause a different order number when the browser/tab is reopened.
    try {
      window.localStorage.setItem(recoveryStorageKey.current, orderNumber.current);
    } catch {
      setNotice('QA_CPC_RECOVERY_STORAGE_UNAVAILABLE');
      return;
    }
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
      savedDraftSnapshot.current = { ...draft };
      setNotice('QA_CPC_DRAFT_SAVED_TO_DATABASE');
    } catch {
      setNotice('QA_CPC_DRAFT_RESPONSE_UNCERTAIN_RETRY_SAME_NUMBER');
    } finally {
      setBusy(false);
    }
  }

  // This deliberately cannot run before separately authorized QA SQL and
  // a server-side feature flag. A local form edit is never reported as saved.
  async function reviseDraft() {
    if (!saved || !valid || !revisionEnabled || busy || !savedDraftSnapshot.current)
      return;
    if (draft.versionLabel !== savedDraftSnapshot.current.versionLabel) {
      setNotice('QA_DRAFT_IMAGE_BASELINE_VERSION_IMMUTABLE');
      return;
    }
    if (revisionReason.trim().length < 10 || revisionReason.trim().length > 500) {
      setNotice('QA_DRAFT_REVISION_REASON_REQUIRED');
      return;
    }
    const allowed = [
      'productName','productMaterial','requestedQuantity','currentBatchQuantity',
      'plannedShipDate','priority','isUrgent','splitDelivery',
      'surfaceTreatment','patternScope','seamTolerance','positionReference',
      'customerAcceptanceStandard','packagingMethod','cartonQuantity','labelMarkingRule',
    ] as const;
    if (!pendingRevision.current) {
      const patch: Record<string, string | number | boolean> = {};
      for (const key of allowed) {
        const next = draft[key];
        if (next !== savedDraftSnapshot.current[key]) {
          if (next === null || next === undefined) {
            setNotice('QA_DRAFT_NULL_CHANGE_NOT_SUPPORTED');
            return;
          }
          patch[key] = next;
        }
      }
      if (Object.keys(patch).length === 0) {
        setNotice('QA_DRAFT_NO_PRODUCTION_CHANGES');
        return;
      }
      pendingRevision.current = {
        requestId: crypto.randomUUID(),
        reason: revisionReason.trim(),
        patch, snapshot: { ...draft },
      };
    }
    setBusy(true);
    setNotice('QA_DRAFT_REVISION_SUBMITTING');
    try {
      const candidate = pendingRevision.current;
      const response = await fetch('/api/workshop-orders/production/cpc-drafts', {
        method: 'PATCH',
        credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: saved.orderId, expectedVersion: saved.version,
          requestId: candidate.requestId, reason: candidate.reason,
          patch: candidate.patch,
        }),
      });
      const body: { ok?: boolean; code?: string; data?: Saved } =
        await response.json().catch(() => ({}));
      if (!response.ok || !body.ok
        || !['QA_DRAFT_REVISION_COMMITTED','QA_DRAFT_REVISION_REPLAYED'].includes(body.code ?? '')
        || body.data?.orderId !== saved.orderId
        || body.data?.version !== saved.version + 1
        || body.data?.persisted !== true || body.data?.submitted !== false) {
        setNotice(body.code?.match(/^[A-Z_]{3,70}$/) ? body.code : 'QA_DRAFT_REVISION_UNVERIFIED');
        return;
      }
      savedDraftSnapshot.current = candidate.snapshot;
      pendingRevision.current = null;
      setSaved(body.data);
      setRevisionReason('');
      setNotice('QA_DRAFT_REVISION_COMMITTED_TO_DATABASE');
    } catch {
      // Do not generate another idempotency key: the HTTP response may be lost
      // after the database committed the revision.
      setNotice('QA_DRAFT_REVISION_RESPONSE_UNKNOWN_RETRY_SAME_REQUEST');
    } finally {
      setBusy(false);
    }
  }

  function newCpcDraft() {
    if (!saved || busy || !recoveryStorageKey.current) return;
    try {
      window.localStorage.removeItem(recoveryStorageKey.current);
    } catch {
      setNotice('QA_CPC_RECOVERY_STORAGE_UNAVAILABLE');
      return;
    }
    orderNumber.current = null;
    pendingRevision.current = null;
    savedDraftSnapshot.current = null;
    setSaved(null);
    setCustomerId('');
    setProjectId('');
    setNotice('QA_CPC_NEW_DRAFT_READY');
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
      {!loading && customers.length === 0 && (
        <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          当前登录账号所在组织没有可读取的 CPC 客户。QA 测试库内其他组织的客户不能跨组织选取；
          请在同一 QA 组织中通过现有授权 CPC 流程建立测试客户与项目，禁止绕过 RLS。
        </p>
      )}
      {!loading && customers.length > 0 && eligibleProjects.length === 0 && (
        <p role="status" className="text-xs text-amber-900">
          当前客户下没有本账号有权查看的活动项目，暂不能建立关联生产草稿。
        </p>
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
          当前状态 DRAFT，未进入车间。
        </p>
      )}
      {saved && (
        <button type="button" onClick={newCpcDraft}
          className="min-h-11 rounded border border-indigo-400 bg-white px-3 py-2 text-xs text-indigo-900">
          新建另一张 QA 草稿（不删除已保存订单）
        </button>
      )}
      {saved && !revisionEnabled && (
        <p className="text-xs text-amber-900">
          草稿修改功能已完成 API 和 SQL 候选设计，但尚未获得独立 QA 数据库安装授权。
          当前仅可查看已保存版本，不会把本地修改冒充云端保存。
        </p>
      )}
      {saved && revisionEnabled && (
        <div className="space-y-2 rounded border border-indigo-300 bg-white p-3">
          <p className="text-xs text-indigo-900">
            修改上方生产资料后填写修订原因。订单编号、CPC 关联、负责人及签样版本不可通过该入口改变；
            服务器将校验原版本并记录修改历史。
          </p>
          <label className="block space-y-1 text-xs font-medium">
            修订原因（至少 10 字符）
            <textarea aria-label="草稿修订原因" value={revisionReason}
              onChange={event => setRevisionReason(event.target.value)}
              disabled={busy} maxLength={500} rows={2}
              className="w-full rounded border border-gray-300 p-2"/>
          </label>
          <button type="button" disabled={busy || !valid}
            onClick={() => { void reviseDraft(); }}
            className="min-h-11 rounded bg-indigo-800 px-4 py-2 text-sm text-white disabled:opacity-40">
            {busy ? '版本修订核验中...' : '保存草稿修订（数据库 CAS）'}
          </button>
        </div>
      )}
      {notice && <p role="status" className="text-xs text-indigo-900">{notice}</p>}
    </section>
  );
}
