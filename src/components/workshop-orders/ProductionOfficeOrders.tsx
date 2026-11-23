'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchWosV1,
  isWosV1VerifiedOperation,
} from '@/lib/workshop-orders/production-app-client';

interface OfficeOrder {
  readonly id: string;
  readonly order_number: string;
  readonly customer_name_snapshot: string;
  readonly project_name_snapshot: string | null;
  readonly product_name: string;
  readonly product_material: string;
  readonly requested_quantity: number;
  readonly current_batch_quantity: number;
  readonly customer_acceptance_standard: string | null;
  readonly position_reference: string | null;
  readonly version: number;
  readonly version_label: string;
  readonly workflow_status: string;
  readonly updated_at: string;
}

interface OfficeDetail {
  readonly order: OfficeOrder;
  readonly returnReasons: readonly {
    readonly reason: string;
    readonly openedAt: string;
  }[];
  readonly images: readonly {
    readonly category: string;
    readonly image_status: string;
    readonly version_label: string;
  }[];
  readonly currentPrivateProofState: 'UNVERIFIED';
  readonly canStart: false;
}

type PatchField = 'productName' | 'productMaterial' | 'requestedQuantity'
  | 'currentBatchQuantity' | 'customerAcceptanceStandard' | 'positionReference';

const correctionFields: readonly {
  readonly key: PatchField;
  readonly label: string;
  readonly numeric?: boolean;
}[] = [
  { key: 'productName', label: '产品名称' },
  { key: 'productMaterial', label: '产品材质' },
  { key: 'requestedQuantity', label: '订单总数量', numeric: true },
  { key: 'currentBatchQuantity', label: '本批生产数量', numeric: true },
  { key: 'customerAcceptanceStandard', label: '客户验收标准' },
  { key: 'positionReference', label: '印刷定位 / 位置说明' },
];

function valuesFor(order: OfficeOrder): Record<PatchField, string> {
  return {
    productName: order.product_name,
    productMaterial: order.product_material,
    requestedQuantity: String(order.requested_quantity),
    currentBatchQuantity: String(order.current_batch_quantity),
    customerAcceptanceStandard: order.customer_acceptance_standard ?? '',
    positionReference: order.position_reference ?? '',
  };
}

function CorrectionEditor({
  order,
  writeEnabled,
  onSaved,
}: {
  readonly order: OfficeOrder;
  readonly writeEnabled: boolean;
  readonly onSaved: () => void;
}) {
  const [values, setValues] = useState(() => valuesFor(order));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const requests = useRef(new Map<string, string>());

  async function submit(action: 'SAVE_CORRECTION' | 'RESUBMIT_ORDER'): Promise<void> {
    if (busy || !writeEnabled) return;
    const before = valuesFor(order);
    const patch: Record<string, string | number> = {};
    for (const field of correctionFields) {
      const next = values[field.key].trim();
      if (next !== before[field.key]) {
        patch[field.key] = field.numeric ? Number(next) : next;
      }
    }
    if (action === 'SAVE_CORRECTION' && Object.keys(patch).length === 0) {
      setMessage('至少修改六项资料中的一项后才能保存修订。');
      return;
    }
    const fingerprint = JSON.stringify({
      action, orderId: order.id, version: order.version, patch, reason: reason.trim(),
    });
    const requestId = requests.current.get(fingerprint) ?? crypto.randomUUID();
    requests.current.set(fingerprint, requestId);
    setBusy(true);
    setMessage('等待数据库事务回执。');
    try {
      const result = await fetchWosV1({
        method: 'POST',
        body: action === 'SAVE_CORRECTION'
          ? {
              operation: 'SAVE_CORRECTION',
              orderId: order.id,
              expectedVersion: order.version,
              requestId,
              reason: reason.trim(),
              patch,
            }
          : {
              operation: 'RESUBMIT_ORDER',
              orderId: order.id,
              expectedVersion: order.version,
              requestId,
              reason: reason.trim(),
            },
      });
      if (!isWosV1VerifiedOperation(result, action)) {
        setMessage('事务未确认：' + result.code
          + '。保持内容不变重试会复用请求 ID。');
        return;
      }
      requests.current.delete(fingerprint);
      setMessage(action === 'SAVE_CORRECTION'
        ? '修订版本已保存；请核对新版本后再重新提交。'
        : '当前修订已重新提交车间复核。');
      onSaved();
    } catch {
      setMessage('网络结果未知。保持内容不变重试会复用请求 ID。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-3 space-y-3 border-t border-amber-200 pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {correctionFields.map(field => (
          <label key={field.key} className="text-xs font-medium text-gray-800">
            {field.label}
            <input
              type={field.numeric ? 'number' : 'text'}
              min={field.numeric ? 1 : undefined}
              step={field.numeric ? 1 : undefined}
              value={values[field.key]}
              disabled={busy || !writeEnabled}
              onChange={event => {
                setValues(current => ({ ...current, [field.key]: event.target.value }));
                setMessage('');
              }}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-100"
            />
          </label>
        ))}
      </div>
      <label className="block text-xs font-medium text-gray-800">
        修订原因（10 至 500 字）
        <textarea
          rows={3}
          maxLength={500}
          value={reason}
          disabled={busy || !writeEnabled}
          onChange={event => { setReason(event.target.value); setMessage(''); }}
          className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm disabled:bg-gray-100"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !writeEnabled}
          onClick={() => { void submit('SAVE_CORRECTION'); }}
          className="min-h-11 rounded-md bg-blue-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
          保存六字段修订
        </button>
        <button type="button" disabled={busy || !writeEnabled}
          onClick={() => { void submit('RESUBMIT_ORDER'); }}
          className="min-h-11 rounded-md bg-emerald-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
          重新提交车间复核
        </button>
      </div>
      {message && <p role="status" className="text-xs text-amber-950">{message}</p>}
      <p className="text-xs text-amber-950">
        原始提交回执不会覆盖；重新提交不代表已解除退回原因，仍由车间核对当前新版本。
      </p>
    </section>
  );
}

export default function ProductionOfficeOrders() {
  const [items, setItems] = useState<readonly OfficeOrder[]>([]);
  const [details, setDetails] = useState<Record<string, OfficeDetail>>({});
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
    setNextCursor(null);
    setMessage('');
    setDetails({});
    try {
      const result = await fetchWosV1({
        method: 'GET',
        query: '?view=office',
        signal: controller.signal,
      });
      if (nextGeneration !== generation.current || controller.signal.aborted) return;
      const data = result.data && typeof result.data === 'object'
        ? result.data as Record<string, unknown>
        : null;
      if (!result.ok || result.code !== 'OK'
        || !Array.isArray(data?.items)
        || !Array.isArray(data.items)
        || !data.capabilities
        || typeof (data.capabilities as Record<string, unknown>).writeEnabled !== 'boolean') {
        setItems([]);
        setWriteEnabled(false);
        setMessage('正式订单读取失败或无权限，不能显示旧数据。');
        return;
      }
      setItems(data.items as OfficeOrder[]);
      setNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
      setWriteEnabled(Boolean(
        (data.capabilities as Record<string, unknown>).writeEnabled,
      ));
    } catch {
      if (!controller.signal.aborted && nextGeneration === generation.current) {
        setItems([]);
        setWriteEnabled(false);
        setMessage('正式订单网络读取失败，不能显示缓存。');
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
        query: '?view=office&cursor=' + encodeURIComponent(nextCursor),
      });
      if (requestGeneration !== generation.current) return;
      const data = result.data && typeof result.data === 'object'
        ? result.data as Record<string, unknown>
        : null;
      if (!result.ok || result.code !== 'OK' || !Array.isArray(data?.items)) {
        setMessage('下一页读取失败，未合并未经验证的数据。');
        return;
      }
      setItems(current => [
        ...current,
        ...(data.items as OfficeOrder[]).filter(candidate =>
          !current.some(row => row.id === candidate.id && row.version === candidate.version)),
      ]);
      setNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
    } catch {
      setMessage('下一页网络读取失败。');
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

  async function openDetail(order: OfficeOrder): Promise<void> {
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
        query: '?view=office&orderId=' + encodeURIComponent(order.id),
        signal: controller.signal,
      });
      if (controller.signal.aborted
        || detailGeneration.current.get(key) !== nextGeneration) return;
      const data = result.data && typeof result.data === 'object'
        ? result.data as Record<string, unknown>
        : null;
      const detail = data?.detail && typeof data.detail === 'object'
        ? data.detail as OfficeDetail
        : null;
      if (!result.ok || result.code !== 'OK' || !detail
        || detail.order.version !== order.version
        || detail.order.version_label !== order.version_label) {
        setMessage('详情版本不一致，拒绝显示旧缓存。');
        return;
      }
      setDetails(current => ({ ...current, [key]: detail }));
    } catch {
      if (!controller.signal.aborted
        && detailGeneration.current.get(key) === nextGeneration) {
        setMessage('详情读取失败，未显示缓存。');
      }
    } finally {
      if (detailAbort.current.get(key) === controller) {
        detailAbort.current.delete(key);
      }
    }
  }

  return (
    <section className="mb-6 space-y-4 rounded-lg border border-slate-300 bg-white p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-950">正式订单与退回待办</h2>
          <p className="mt-1 text-xs text-gray-600">
            读取当前组织订单、退回原因和新版本；修订与重新提交均以数据库当前版本为准。
          </p>
        </div>
        <button type="button" onClick={() => { void refresh(); }} disabled={loading}
          className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium disabled:opacity-50">
          {loading ? '读取中...' : '刷新正式订单'}
        </button>
      </header>
      {!writeEnabled && (
        <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          正式写入开关关闭。订单和退回原因可读取，修订与重提按钮保持禁用。
        </p>
      )}
      {message && <p role="alert" className="rounded-md bg-red-50 p-3 text-xs text-red-800">{message}</p>}
      {!loading && !message && items.length === 0 && (
        <p className="text-xs text-gray-600">当前组织没有活动正式订单。</p>
      )}
      <div className="space-y-3">
        {items.map(order => {
          const key = order.id + ':' + order.version;
          const detail = details[key];
          return (
            <article key={key} className="rounded-md border border-gray-200 p-3 text-xs">
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
                查看当前版本、退回原因与图片缺口
              </button>
              {detail && (
                <section className="mt-3 space-y-3">
                  {detail.returnReasons.length > 0 && (
                    <ul className="list-disc space-y-1 rounded-md bg-red-50 p-3 pl-6 text-red-900">
                      {detail.returnReasons.map((reason, index) => (
                        <li key={reason.openedAt + ':' + index}>
                          {reason.reason} · {reason.openedAt}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="rounded-md bg-slate-50 p-3 text-slate-800">
                    当前私有图片 Proof：{detail.currentPrivateProofState}；
                    当前图片记录 {detail.images.length} 条；canStart=false。
                  </p>
                  {order.workflow_status === 'NEEDS_INFORMATION' && (
                    <CorrectionEditor
                      order={order}
                      writeEnabled={writeEnabled}
                      onSaved={() => { void refresh(); }}
                    />
                  )}
                </section>
              )}
            </article>
          );
        })}
      </div>
      {nextCursor && (
        <button type="button" onClick={() => { void loadMore(); }} disabled={loading}
          className="min-h-11 rounded-md border border-gray-300 px-4 py-2 text-xs font-medium disabled:opacity-50">
          {loading ? '读取中...' : '加载更多正式订单'}
        </button>
      )}
    </section>
  );
}
