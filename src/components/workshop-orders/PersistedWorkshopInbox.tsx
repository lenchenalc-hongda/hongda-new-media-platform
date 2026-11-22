'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyWosInboxImages } from '@/lib/workshop-orders/api-contract';
import type {
  WosInboxItem,
  WosInboxReadDetail,
} from '@/lib/workshop-orders/api-contract';
import {
  canApplyWosInboxDetailResponse,
  emptyWosInboxEvidenceState,
  shouldApplyWosInboxListResponse,
  wosInboxDetailMatchesItem,
  wosInboxVersionIdentity,
  wosInboxVersionKey,
} from '@/lib/workshop-orders/persisted-inbox-state';
import OperatorWorkflowActions from './OperatorWorkflowActions';

interface ListResponse {
  readonly ok: boolean;
  readonly code: string;
  readonly data?: {
    readonly mode?: string;
    readonly source?: string;
    readonly items?: readonly WosInboxItem[];
    readonly count?: number;
    readonly capabilities?: {
      readonly canOperateWorkflow?: boolean;
      readonly workflowWriteEnabled?: boolean;
    };
  } | null;
}

interface DetailResponse {
  readonly ok: boolean;
  readonly code: string;
  readonly data?: {
    readonly mode?: string;
    readonly source?: string;
    readonly detail?: WosInboxReadDetail;
  } | null;
}

function entityLabel(item: WosInboxItem): string {
  return item.entityType === 'PRODUCTION_ORDER' ? '生产订单' : '打样申请';
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未填写';
  return String(value);
}

export default function PersistedWorkshopInbox() {
  const [items, setItems] = useState<readonly WosInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [lastFetchedAt, setLastFetchedAt] = useState('');
  const [details, setDetails] = useState<Record<string, WosInboxReadDetail>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [canOperateWorkflow, setCanOperateWorkflow] = useState(false);
  const [workflowWriteEnabled, setWorkflowWriteEnabled] = useState(false);
  const itemsRef = useRef<readonly WosInboxItem[]>([]);
  const listGenerationRef = useRef(0);
  const listAbortRef = useRef<AbortController | null>(null);
  const detailGenerationRef = useRef(new Map<string, number>());
  const detailAbortRef = useRef(new Map<string, AbortController>());

  const invalidateDetails = useCallback(() => {
    for (const controller of detailAbortRef.current.values()) controller.abort();
    detailAbortRef.current.clear();
    detailGenerationRef.current.clear();
    const empty = emptyWosInboxEvidenceState();
    setDetails(empty.details);
    setExpanded(empty.expanded);
    setDetailLoading(empty.loading);
    setDetailErrors(empty.errors);
  }, []);

  const refresh = useCallback(async () => {
    const generation = ++listGenerationRef.current;
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    invalidateDetails();
    itemsRef.current = [];
    setItems([]);
    setCanOperateWorkflow(false);
    setWorkflowWriteEnabled(false);
    setLoading(true);
    setMessage('');
    setLastFetchedAt('');
    try {
      const response = await fetch('/api/workshop-orders/inbox', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const result = await response.json() as ListResponse;
      if (!shouldApplyWosInboxListResponse({
        responseGeneration: generation,
        currentGeneration: listGenerationRef.current,
      })) return;
      if (!response.ok || !result.ok || result.code !== 'OK'
        || result.data?.mode !== 'LIVE_READ_ONLY'
        || result.data.source !== 'SUPABASE_RLS'
        || !Array.isArray(result.data.items)
        || result.data.count !== result.data.items.length
        || typeof result.data.capabilities?.canOperateWorkflow !== 'boolean'
        || typeof result.data.capabilities?.workflowWriteEnabled !== 'boolean') {
        itemsRef.current = [];
        setItems([]);
        setMessage('INBOX_READ_UNAVAILABLE_OR_UNVERIFIED');
        return;
      }
      itemsRef.current = result.data.items;
      setItems(result.data.items);
      setCanOperateWorkflow(result.data.capabilities.canOperateWorkflow);
      setWorkflowWriteEnabled(result.data.capabilities.workflowWriteEnabled);
      setLastFetchedAt(new Date().toLocaleString('zh-CN'));
    } catch (error) {
      if (!shouldApplyWosInboxListResponse({
        responseGeneration: generation,
        currentGeneration: listGenerationRef.current,
      }) || controller.signal.aborted
        || (error instanceof DOMException && error.name === 'AbortError')) return;
      itemsRef.current = [];
      setItems([]);
      setCanOperateWorkflow(false);
      setWorkflowWriteEnabled(false);
      setMessage('INBOX_READ_NETWORK_UNAVAILABLE');
    } finally {
      if (shouldApplyWosInboxListResponse({
        responseGeneration: generation,
        currentGeneration: listGenerationRef.current,
      })) {
        setLoading(false);
        if (listAbortRef.current === controller) listAbortRef.current = null;
      }
    }
  }, [invalidateDetails]);

  useEffect(() => {
    void refresh();
    return () => {
      listAbortRef.current?.abort();
      for (const controller of detailAbortRef.current.values()) controller.abort();
      detailAbortRef.current.clear();
    };
  }, [refresh]);

  async function toggleDetails(item: WosInboxItem) {
    if (item.entityType !== 'PRODUCTION_ORDER') return;
    const key = wosInboxVersionKey(wosInboxVersionIdentity(item));
    if (expanded[key]) {
      setExpanded(current => ({ ...current, [key]: false }));
      return;
    }
    const cached = details[key];
    if (cached && wosInboxDetailMatchesItem(cached, item)) {
      setExpanded(current => ({ ...current, [key]: true }));
      return;
    }
    if (cached) {
      setDetails(current => Object.fromEntries(
        Object.entries(current).filter(([candidate]) => candidate !== key),
      ) as Record<string, WosInboxReadDetail>);
    }
    const requestListGeneration = listGenerationRef.current;
    const requestDetailGeneration = (detailGenerationRef.current.get(key) ?? 0) + 1;
    detailGenerationRef.current.set(key, requestDetailGeneration);
    detailAbortRef.current.get(key)?.abort();
    const controller = new AbortController();
    detailAbortRef.current.set(key, controller);
    setDetailLoading(current => ({ ...current, [key]: true }));
    setDetailErrors(current => ({ ...current, [key]: '' }));
    try {
      const response = await fetch('/api/workshop-orders/inbox?orderId=' + encodeURIComponent(item.id), {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const result = await response.json() as DetailResponse;
      if (!shouldApplyWosInboxListResponse({
        responseGeneration: requestListGeneration,
        currentGeneration: listGenerationRef.current,
      }) || controller.signal.aborted) return;
      const detail = result.data?.detail;
      const currentItem = itemsRef.current.find(candidate =>
        candidate.entityType === item.entityType && candidate.id === item.id);
      const applicable = canApplyWosInboxDetailResponse({
        requestListGeneration,
        currentListGeneration: listGenerationRef.current,
        requestDetailGeneration,
        currentDetailGeneration: detailGenerationRef.current.get(key),
        expectedItem: item,
        currentItem,
        detail,
      });
      if (!response.ok || !result.ok || result.code !== 'OK'
        || result.data?.mode !== 'LIVE_READ_ONLY_DETAIL'
        || result.data.source !== 'SUPABASE_RLS'
        || !detail
        || !applicable) {
        if (requestListGeneration === listGenerationRef.current
          && requestDetailGeneration === detailGenerationRef.current.get(key)) {
          setDetails(current => Object.fromEntries(
            Object.entries(current).filter(([candidate]) => candidate !== key),
          ) as Record<string, WosInboxReadDetail>);
          setExpanded(current => ({ ...current, [key]: false }));
          setDetailErrors(current => ({
            ...current,
            [key]: 'INBOX_DETAIL_STALE_OR_VERSION_MISMATCH',
          }));
        }
        return;
      }
      setDetails(current => ({ ...current, [key]: detail }));
      setExpanded(current => ({ ...current, [key]: true }));
    } catch (error) {
      if (!shouldApplyWosInboxListResponse({
        responseGeneration: requestListGeneration,
        currentGeneration: listGenerationRef.current,
      }) || controller.signal.aborted
        || (error instanceof DOMException && error.name === 'AbortError')) return;
      setDetailErrors(current => ({
        ...current,
        [key]: 'INBOX_DETAIL_UNAVAILABLE_OR_UNVERIFIED',
      }));
    } finally {
      if (shouldApplyWosInboxListResponse({
        responseGeneration: requestListGeneration,
        currentGeneration: listGenerationRef.current,
      }) && requestDetailGeneration === detailGenerationRef.current.get(key)) {
        setDetailLoading(current => ({ ...current, [key]: false }));
      }
      if (detailAbortRef.current.get(key) === controller) detailAbortRef.current.delete(key);
    }
  }

  return (
    <section className="space-y-4" aria-label="真实持久化车间收件箱">
      <header className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-blue-950">真实持久化订单</h2>
            <p className="mt-1 text-xs leading-5 text-blue-900">
              当前列表通过登录身份、组织 RLS、服务器组织约束和 P1 提交回执校验读取。
              接单、退回与修订复核只在独立写入 Gate、角色和当前版本同时通过时开放。
            </p>
          </div>
          <button type="button" onClick={() => { void refresh(); }} disabled={loading}
            className="min-h-11 rounded-md border border-blue-300 bg-white px-3 py-2 text-xs font-medium text-blue-900 disabled:opacity-50">
            {loading ? '读取中...' : '刷新真实订单'}
          </button>
        </div>
        <p className="mt-3 text-xs text-blue-900" role="status">
          {lastFetchedAt ? '上次读取：' + lastFetchedAt : '正在读取当前组织订单'}
        </p>
      </header>

      {message && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {message}。系统不会退化为模拟订单或虚假空态。
        </p>
      )}

      {!loading && !message && (
        <p className="text-xs text-gray-600">
          当前账号可读取订单：<strong>{items.length}</strong>
        </p>
      )}

      {!loading && !message && items.length === 0 && (
        <section className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          <h3 className="text-sm font-semibold text-gray-900">当前组织没有已提交订单</h3>
          <p className="mt-2 text-xs text-gray-600">
            空列表来自已校验的 Supabase 查询结果，不使用本地模拟数据。
          </p>
        </section>
      )}

      <div className="space-y-4">
        {items.map(item => {
          const itemKey = wosInboxVersionKey(wosInboxVersionIdentity(item));
          const detail = details[itemKey];
          const imageSet = detail
            ? classifyWosInboxImages(detail.images, item)
            : { current: [], historical: [] };
          return (
            <article key={item.entityType + ':' + item.id}
              className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-500">
                    {entityLabel(item)} · {item.orderNumber || item.id}
                  </p>
                  <h3 className="mt-1 break-words text-base font-semibold text-gray-950">
                    {item.productName}
                  </h3>
                  <p className="mt-1 break-words text-xs text-gray-600">
                    {item.customerNameSnapshot}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-semibold text-blue-900">
                    {item.workflowStatus}
                  </span>
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-gray-700">
                    {item.versionLabel} / v{item.version}
                  </span>
                </div>
              </div>

              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded border border-gray-100 p-2">
                  <dt className="text-gray-500">提交时间</dt>
                  <dd className="mt-1 font-medium text-gray-900">
                    {new Date(item.submittedAt).toLocaleString('zh-CN')}
                  </dd>
                </div>
                <div className="rounded border border-gray-100 p-2">
                  <dt className="text-gray-500">优先级</dt>
                  <dd className="mt-1 font-medium text-gray-900">
                    {item.priority || '无'} {item.isUrgent ? '· 加急' : ''}
                  </dd>
                </div>
                <div className="rounded border border-gray-100 p-2">
                  <dt className="text-gray-500">订单类型</dt>
                  <dd className="mt-1 font-medium text-gray-900">{entityLabel(item)}</dd>
                </div>
                <div className="rounded border border-gray-100 p-2">
                  <dt className="text-gray-500">资料与齐套</dt>
                  <dd className="mt-1 font-medium text-gray-900">
                    {item.entityType === 'PRODUCTION_ORDER' ? '可展开只读核验' : '基础订单信息'}
                  </dd>
                </div>
              </dl>

              {item.entityType === 'PRODUCTION_ORDER' && (
                <button type="button" onClick={() => { void toggleDetails(item); }}
                  disabled={detailLoading[itemKey]}
                  className="mt-3 min-h-11 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-800 disabled:opacity-50">
                  {detailLoading[itemKey]
                    ? '读取当前资料中...'
                    : expanded[itemKey] ? '收起当前资料与齐套' : '展开当前资料与齐套'}
                </button>
              )}

              {detailErrors[itemKey] && (
                <p role="alert" className="mt-3 rounded bg-red-50 p-3 text-xs text-red-800">
                  {detailErrors[itemKey]}。不显示缓存或模拟详情。
                </p>
              )}

              {expanded[itemKey] && detail && wosInboxDetailMatchesItem(detail, item) && (
                <section className="mt-4 space-y-4 border-t pt-4" aria-label="订单只读资料与齐套详情">
                  <section className="rounded border border-blue-200 bg-blue-50 p-3">
                    <h4 className="text-xs font-semibold text-blue-950">当前版本与 P1 回执</h4>
                    <p className="mt-1 text-xs text-blue-900">
                      当前 {detail.item.workflowStatus} / {detail.item.versionLabel} / v{detail.item.version}。
                      原始 Inbox 状态固定为 {detail.transaction.originalWorkflowStatus}，
                      源修订 {detail.transaction.sourceRevision}，源版本 {detail.transaction.sourceVersionLabel}。
                    </p>
                    <p className="mt-1 break-all text-[11px] text-blue-800">
                      Inbox {detail.transaction.inboxId} · Receipt {detail.transaction.submissionReceiptId}
                    </p>
                  </section>

                  <section>
                    <h4 className="text-xs font-semibold text-gray-900">当前生产要求</h4>
                    <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
                      {([
                        ['关联项目', 'project_name_snapshot'],
                        ['材质', 'product_material'],
                        ['订单数量', 'requested_quantity'],
                        ['本批数量', 'current_batch_quantity'],
                        ['交货日期', 'planned_ship_date'],
                        ['表面处理', 'surface_treatment'],
                        ['图案范围', 'pattern_scope'],
                        ['接缝要求', 'seam_tolerance'],
                        ['印刷位置', 'position_reference'],
                        ['客户验收标准', 'customer_acceptance_standard'],
                        ['包装方式', 'packaging_method'],
                        ['每箱数量', 'carton_quantity'],
                        ['标签要求', 'label_marking_rule'],
                      ] as const).map(([label, field]) => (
                        <div key={field} className="rounded border border-gray-100 p-2">
                          <dt className="text-gray-500">{label}</dt>
                          <dd className="mt-1 break-words font-medium text-gray-900">
                            {display(detail.production[field])}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>

                  {detail.blockers.length > 0 && (
                    <section className="rounded border border-red-200 bg-red-50 p-3">
                      <h4 className="text-xs font-semibold text-red-950">退回原因与解除状态</h4>
                      <ul className="mt-2 space-y-1 text-xs text-red-900">
                        {detail.blockers.map((blocker, index) => (
                          <li key={blocker.blocker_code + ':' + index}>
                            {blocker.status === 'OPEN' ? '待处理' : '已解除'} ·
                            {' '}{blocker.description}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <section>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold text-gray-900">四类物料只读核验</h4>
                      <span className="text-xs text-amber-900">仅供核对，不代表允许开工</span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {detail.readiness.materials.map(material => (
                        <div key={material.code} className="rounded border border-gray-200 p-3 text-xs">
                          <p className="font-semibold text-gray-900">
                            {material.title} · {material.ready ? '记录符合核验条件' : '尚未通过'}
                          </p>
                          <p className="mt-1 text-gray-600">{material.message}</p>
                          {material.evidence && (
                            <p className="mt-1 text-gray-600">
                              版本 {material.evidence.versionLabel || '未登记'} ·
                              实到 {display(material.evidence.quantityArrived)} ·
                              核对时间 {material.evidence.confirmedAt || '未登记'}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded border border-amber-200 bg-amber-50 p-3">
                    <h4 className="text-xs font-semibold text-amber-950">图片签样基准</h4>
                    <p className="mt-1 text-xs text-amber-900">
                      CURRENT 基准 {detail.readiness.visualBaseline.currentCount} 条 ·
                      版本 {detail.readiness.visualBaseline.versionLabel || '未登记'} ·
                      当前版本匹配 {detail.readiness.visualBaseline.currentVersionMatched ? '是' : '否'} ·
                      Office {detail.readiness.visualBaseline.officeConfirmed ? '已登记' : '未登记'} ·
                      Workshop {detail.readiness.visualBaseline.workshopConfirmed ? '已登记' : '未登记'}。
                    </p>
                    <p className="mt-1 text-xs text-amber-800">
                      当前版本图片 {imageSet.current.length} 条；历史或非当前记录 {imageSet.historical.length} 条。
                      历史版本不会冒充当前基准。
                    </p>
                  </section>

                  <section>
                    <h4 className="text-xs font-semibold text-gray-900">当前版本交接校验</h4>
                    <p className={detail.handoff.historySequenceVerified
                      ? 'mt-1 text-xs font-medium text-emerald-800'
                      : 'mt-1 text-xs font-medium text-red-800'}>
                      {detail.handoff.historySequenceVerified ? '十条版本绑定历史连续通过' : '历史链未通过'}
                    </p>
                    <ol className="mt-2 grid gap-2 sm:grid-cols-2">
                      {detail.handoff.steps.map(step => (
                        <li key={step.code} className="rounded border border-gray-200 p-2 text-xs">
                          {step.verifiedByHistory ? '已匹配' : '未匹配'} · {step.label}
                          {step.recordedAt && <span className="mt-1 block text-gray-500">{step.recordedAt}</span>}
                        </li>
                      ))}
                    </ol>
                  </section>

                  <section>
                    <h4 className="text-xs font-semibold text-gray-900">状态历史</h4>
                    <ol className="mt-2 space-y-2">
                      {[...detail.history].reverse().map((history, index) => (
                        <li key={history.created_at + ':' + index}
                          className="rounded border border-gray-100 bg-gray-50 p-2 text-xs">
                          {history.previous_status || '无'} → {history.next_status} ·
                          {' '}{history.reason_code} · {history.actor_role} · {history.created_at}
                        </li>
                      ))}
                    </ol>
                  </section>

                  {detail.confirmations.length > 0 && (
                    <section>
                      <h4 className="text-xs font-semibold text-gray-900">确认记录</h4>
                      <ul className="mt-2 space-y-1 text-xs text-gray-700">
                        {detail.confirmations.map((confirmation, index) => (
                          <li key={confirmation.confirmed_at + ':' + index}>
                            {confirmation.confirmation_type} · {confirmation.decision} ·
                            {' '}{confirmation.role_snapshot} · {confirmation.confirmed_at}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <p role="status" className="rounded border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-900">
                    canStart=false。即使物料、图片基准和双签记录均通过，仍必须经过独立人工生产放行。
                  </p>

                  <OperatorWorkflowActions
                    item={item}
                    detail={detail}
                    canOperate={canOperateWorkflow}
                    writeEnabled={workflowWriteEnabled}
                    onSuccess={() => { void refresh(); }}
                  />
                </section>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
