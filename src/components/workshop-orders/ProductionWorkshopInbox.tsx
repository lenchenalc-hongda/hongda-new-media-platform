'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchWosV1,
  isWosV1VerifiedOperation,
} from '@/lib/workshop-orders/production-app-client';

interface OperatorOrder {
  readonly id: string;
  readonly order_number: string;
  readonly customer_name_snapshot: string;
  readonly project_name_snapshot: string | null;
  readonly product_name: string;
  readonly product_material: string;
  readonly requested_quantity: number;
  readonly current_batch_quantity: number;
  readonly priority: string;
  readonly is_urgent: boolean;
  readonly version: number;
  readonly version_label: string;
  readonly workflow_status: string;
  readonly updated_at: string;
}

interface OperatorDetail {
  readonly order: OperatorOrder;
  readonly blockers: readonly {
    readonly blocker_code: string;
    readonly blocker_category: string;
    readonly description: string;
    readonly status: string;
    readonly opened_at: string;
  }[];
  readonly returnReasons: readonly {
    readonly reason: string;
    readonly code: string;
    readonly openedAt: string;
  }[];
  readonly images: readonly {
    readonly category: string;
    readonly image_status: string;
    readonly version_label: string;
    readonly superseded_at: string | null;
  }[];
  readonly resources: readonly {
    readonly resource_type: string;
    readonly status: string;
    readonly version_label: string | null;
    readonly quantity_expected: number | null;
    readonly quantity_arrived: number | null;
  }[];
  readonly baselines: readonly {
    readonly id: string;
    readonly version_label: string;
    readonly status: string;
  }[];
  readonly history: readonly {
    readonly previous_status: string | null;
    readonly next_status: string;
    readonly reason_code: string;
    readonly created_at: string;
    readonly metadata: Record<string, unknown>;
  }[];
  readonly currentPrivateProofState: 'UNVERIFIED';
  readonly reviewReady: false;
  readonly canStart: false;
}

type Action =
  | { readonly action: 'ACCEPT'; readonly reason: string }
  | { readonly action: 'RETURN_FOR_INFORMATION'; readonly reason: string }
  | { readonly action: 'REVIEW_CORRECTION'; readonly reason: string };

function hasCurrentResubmission(detail: OperatorDetail): boolean {
  return detail.history.filter(row =>
    row.reason_code === 'P2_OFFICE_RESUBMIT_CORRECTION'
    && row.metadata?.newVersion === detail.order.version
    && row.metadata?.newVersionLabel === detail.order.version_label).length === 1;
}

function OperatorActions({
  order,
  detail,
  writeEnabled,
  onSuccess,
}: {
  readonly order: OperatorOrder;
  readonly detail: OperatorDetail;
  readonly writeEnabled: boolean;
  readonly onSuccess: () => void;
}) {
  const legal = (order.workflow_status === 'SUBMITTED'
    ? ['ACCEPT', 'RETURN_FOR_INFORMATION']
    : order.workflow_status === 'WORKSHOP_REVIEW'
      ? [
          ...(hasCurrentResubmission(detail) ? ['REVIEW_CORRECTION'] : []),
          'RETURN_FOR_INFORMATION',
        ]
      : []) as Action['action'][];
  const [selected, setSelected] = useState<Action['action']>(
    legal[0] ?? 'RETURN_FOR_INFORMATION',
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null);

  if (legal.length === 0) return null;

  async function submit(): Promise<void> {
    if (busy || !legal.includes(selected)) return;
    const fingerprint = JSON.stringify({
      orderId: order.id,
      version: order.version,
      action: selected,
      reason: reason.trim(),
    });
    const requestId = pending.current?.fingerprint === fingerprint
      ? pending.current.requestId
      : crypto.randomUUID();
    pending.current = { fingerprint, requestId };
    setBusy(true);
    setMessage('等待数据库版本与操作者回执。');
    try {
      const result = await fetchWosV1({
        method: 'POST',
        body: selected === 'REVIEW_CORRECTION'
          ? {
              operation: 'REVIEW_CORRECTION',
              orderId: order.id,
              expectedVersion: order.version,
              requestId,
              note: reason.trim(),
            }
          : {
              operation: 'OPERATOR_ACTION',
              orderId: order.id,
              expectedVersion: order.version,
              requestId,
              action: selected,
              reason: reason.trim(),
            },
      });
      if (!isWosV1VerifiedOperation(
        result,
        selected === 'REVIEW_CORRECTION'
          ? 'REVIEW_CORRECTION'
          : 'OPERATOR_ACTION',
      )) {
        setMessage('事务未通过：' + result.code
          + '。保持内容不变重试会复用请求 ID。');
        return;
      }
      pending.current = null;
      setMessage('数据库已确认当前版本操作，正在刷新订单。');
      onSuccess();
    } catch {
      setMessage('网络中断，结果未知。保持内容不变重试会复用请求 ID。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-3 space-y-3 border-t border-slate-200 pt-3">
      <div className="flex flex-wrap gap-2">
        {legal.map(action => (
          <button key={action} type="button"
            aria-pressed={selected === action}
            onClick={() => { setSelected(action); setReason(''); setMessage(''); }}
            className={selected === action
              ? 'rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white'
              : 'rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800'}>
            {action === 'ACCEPT' ? '接单'
              : action === 'RETURN_FOR_INFORMATION' ? '退回资料'
                : '复核当前修订'}
          </button>
        ))}
      </div>
      <label className="block text-xs font-medium text-gray-800">
        操作原因 / 核对说明（10 至 500 字）
        <textarea rows={3} maxLength={500} value={reason} disabled={busy || !writeEnabled}
          onChange={event => { setReason(event.target.value); setMessage(''); }}
          className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm disabled:bg-gray-100" />
      </label>
      <button type="button" disabled={busy || !writeEnabled || reason.trim().length < 10}
        onClick={() => { void submit(); }}
        className="min-h-11 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
        {busy ? '数据库事务处理中...' : '提交当前版本操作'}
      </button>
      {message && <p role="status" className="text-xs text-slate-800">{message}</p>}
      <p className="text-xs text-red-800">
        canStart=false。接单、退回或复核不会直接进入生产。
      </p>
    </section>
  );
}

export default function ProductionWorkshopInbox() {
  const [items, setItems] = useState<readonly OperatorOrder[]>([]);
  const [details, setDetails] = useState<Record<string, OperatorDetail>>({});
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const detailGeneration = useRef(new Map<string, number>());
  const detailAbort = useRef(new Map<string, AbortController>());

  const refresh = useCallback(async () => {
    const nextGeneration = ++generation.current;
    abort.current?.abort();
    for (const controller of detailAbort.current.values()) controller.abort();
    detailAbort.current.clear();
    detailGeneration.current.clear();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setDetails({});
    setNextCursor(null);
    setMessage('');
    try {
      const result = await fetchWosV1({
        method: 'GET',
        query: '?view=inbox',
        signal: controller.signal,
      });
      if (nextGeneration !== generation.current || controller.signal.aborted) return;
      const data = result.data && typeof result.data === 'object'
        ? result.data as Record<string, unknown>
        : null;
      const capabilities = data?.capabilities && typeof data.capabilities === 'object'
        ? data.capabilities as Record<string, unknown>
        : null;
      if (!result.ok || result.code !== 'OK' || !Array.isArray(data?.items)
        || typeof capabilities?.writeEnabled !== 'boolean') {
        setItems([]);
        setWriteEnabled(false);
        setMessage('正式 Inbox 读取失败或无权限，不能显示缓存。');
        return;
      }
      setItems(data.items as OperatorOrder[]);
      setNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
      setWriteEnabled(capabilities.writeEnabled);
    } catch {
      if (!controller.signal.aborted && nextGeneration === generation.current) {
        setItems([]);
        setWriteEnabled(false);
        setMessage('正式 Inbox 网络读取失败。');
      }
    } finally {
      if (nextGeneration === generation.current) setLoading(false);
    }
  }, []);

  async function loadMore(): Promise<void> {
    if (!nextCursor || loading) return;
    const requestGeneration = generation.current;
    setLoading(true);
    try {
      const result = await fetchWosV1({
        method: 'GET',
        query: '?view=inbox&cursor=' + encodeURIComponent(nextCursor),
      });
      if (requestGeneration !== generation.current) return;
      const data = result.data && typeof result.data === 'object'
        ? result.data as Record<string, unknown>
        : null;
      if (!result.ok || result.code !== 'OK' || !Array.isArray(data?.items)) {
        setMessage('下一页 Inbox 读取失败，未合并未经验证的数据。');
        return;
      }
      setItems(current => [
        ...current,
        ...(data.items as OperatorOrder[]).filter(candidate =>
          !current.some(row => row.id === candidate.id && row.version === candidate.version)),
      ]);
      setNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
    } catch {
      setMessage('下一页 Inbox 网络读取失败。');
    } finally {
      if (requestGeneration === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    return () => {
      abort.current?.abort();
      for (const controller of detailAbort.current.values()) controller.abort();
      detailAbort.current.clear();
    };
  }, [refresh]);

  async function openDetail(order: OperatorOrder): Promise<void> {
    const key = order.id + ':' + order.version;
    const nextGeneration = (detailGeneration.current.get(key) ?? 0) + 1;
    detailGeneration.current.set(key, nextGeneration);
    detailAbort.current.get(key)?.abort();
    const controller = new AbortController();
    detailAbort.current.set(key, controller);
    setMessage('');
    try {
      const result = await fetchWosV1({
        method: 'GET',
        query: '?view=inbox&orderId=' + encodeURIComponent(order.id),
        signal: controller.signal,
      });
      if (controller.signal.aborted
        || detailGeneration.current.get(key) !== nextGeneration) return;
      const data = result.data && typeof result.data === 'object'
        ? result.data as Record<string, unknown>
        : null;
      const detail = data?.detail && typeof data.detail === 'object'
        ? data.detail as OperatorDetail
        : null;
      if (!result.ok || result.code !== 'OK' || !detail
        || detail.order.version !== order.version
        || detail.order.version_label !== order.version_label) {
        setMessage('订单详情版本不一致，拒绝显示旧内容。');
        return;
      }
      setDetails(current => ({ ...current, [key]: detail }));
    } catch {
      if (!controller.signal.aborted
        && detailGeneration.current.get(key) === nextGeneration) {
        setMessage('订单详情读取失败，未显示缓存。');
      }
    } finally {
      if (detailAbort.current.get(key) === controller) {
        detailAbort.current.delete(key);
      }
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-300 bg-white p-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">正式车间 Inbox</h2>
          <p className="mt-1 text-xs leading-5 text-slate-700">
            从真实组织 RLS 与正式事务 RPC 读取订单；四类图片 Proof 未开放历史复验，因此保持 UNVERIFIED。
          </p>
        </div>
        <button type="button" onClick={() => { void refresh(); }} disabled={loading}
          className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium disabled:opacity-50">
          {loading ? '读取中...' : '刷新正式 Inbox'}
        </button>
      </header>
      {message && <p role="alert" className="rounded-md bg-red-50 p-3 text-xs text-red-800">{message}</p>}
      {!loading && !message && items.length === 0 && (
        <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-xs text-slate-600">
          当前组织没有活动正式订单。
        </p>
      )}
      <div className="space-y-3">
        {items.map(order => {
          const key = order.id + ':' + order.version;
          const detail = details[key];
          return (
            <article key={key} className="rounded-lg border border-gray-200 bg-white p-4 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-950">
                    {order.order_number} · {order.product_name}
                  </p>
                  <p className="mt-1 text-gray-600">
                    {order.customer_name_snapshot} · {order.version_label} / v{order.version}
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-800">
                  {order.workflow_status}
                </span>
              </div>
              <button type="button" onClick={() => { void openDetail(order); }}
                className="mt-3 min-h-11 rounded-md border border-gray-300 px-3 py-2 font-medium">
                展开当前版本、物料与签样缺口
              </button>
              {detail && (
                <section className="mt-3 space-y-3">
                  <section className="rounded-md bg-slate-50 p-3">
                    <p className="font-semibold text-slate-950">资料退回原因</p>
                    {detail.returnReasons.length === 0
                      ? <p className="mt-1 text-slate-700">当前没有合法 DOCUMENT 退回原因。</p>
                      : (
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-red-800">
                          {detail.returnReasons.map((reason, index) => (
                            <li key={reason.openedAt + ':' + index}>{reason.reason}</li>
                          ))}
                        </ul>
                      )}
                  </section>
                  <section className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md border border-gray-200 p-3">
                      <p className="font-semibold text-gray-950">已登记图片</p>
                      {detail.images.length === 0
                        ? <p className="mt-1 text-gray-600">0 / 4，当前无签样图片。</p>
                        : (
                          <ul className="mt-1 space-y-1 text-gray-700">
                            {detail.images.map((image, index) => (
                              <li key={image.category + ':' + index}>
                                {image.category} · {image.image_status} · {image.version_label}
                              </li>
                            ))}
                          </ul>
                        )}
                      <p className="mt-2 font-medium text-amber-800">
                        Proof：{detail.currentPrivateProofState} · reviewReady=false
                      </p>
                    </div>
                    <div className="rounded-md border border-gray-200 p-3">
                      <p className="font-semibold text-gray-950">物料与 CURRENT 基准</p>
                      <p className="mt-1 text-gray-700">
                        物料 {detail.resources.length} 类 ·
                        CURRENT baseline {detail.baselines.filter(base => base.status === 'CURRENT').length} 个
                      </p>
                      <ul className="mt-1 space-y-1 text-gray-700">
                        {detail.resources.map((resource, index) => (
                          <li key={resource.resource_type + ':' + index}>
                            {resource.resource_type} · {resource.status} ·
                            {' '}{resource.quantity_arrived ?? '-'} / {resource.quantity_expected ?? '-'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                  <p className="rounded-md bg-red-50 p-3 font-medium text-red-900">
                    canStart=false。历史 Proof 未复验，图片证据不会被视为当前有效。
                  </p>
                  <OperatorActions
                    order={order}
                    detail={detail}
                    writeEnabled={writeEnabled}
                    onSuccess={() => { void refresh(); }}
                  />
                </section>
              )}
            </article>
          );
        })}
      </div>
      {nextCursor && (
        <button type="button" onClick={() => { void loadMore(); }} disabled={loading}
          className="min-h-11 rounded-md border border-slate-300 px-4 py-2 text-xs font-medium disabled:opacity-50">
          {loading ? '读取中...' : '加载更多 Inbox 订单'}
        </button>
      )}
    </section>
  );
}
