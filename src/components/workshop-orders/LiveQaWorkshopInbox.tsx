'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { WosInboxItem } from '@/lib/workshop-orders/api-contract';

interface ApiResponse {
  ok: boolean;
  code: string;
  data?: { items?: WosInboxItem[]; count?: number; source?: string } | null;
}

export default function LiveQaWorkshopInbox() {
  const [items, setItems] = useState<WosInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [lastFetchedAt, setLastFetchedAt] = useState('');
  const [imageLinks, setImageLinks] = useState<Record<string,string>>({});
  const [imageStatus, setImageStatus] = useState<Record<string,string>>({});
  const [expanded, setExpanded] = useState<Record<string,boolean>>({});
  const [details, setDetails] = useState<Record<string,Record<string,unknown>>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string,string>>({});
  const [imageVersions, setImageVersions] = useState<Record<string,Array<{id:string;category:string;version_label:string;image_status:string;file_name:string;storage_path:string;uploaded_at:string}>>>({});
  const objectUrls = useRef<Map<string,string>>(new Map());

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/workshop-orders/inbox', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const result: ApiResponse = await response.json();
      if (!response.ok || !result?.ok || result.code !== 'OK'
          || result.data?.source !== 'SUPABASE_RLS'
          || !Array.isArray(result.data.items)
          || result.data.count !== result.data.items.length) {
        setMessage('QA_INBOX_HTTP_' + (result?.code || 'UNVERIFIED'));
        setItems([]);
        return;
      }
      setItems(result.data.items);
      setLastFetchedAt(new Date().toLocaleString('zh-CN'));
    } catch {
      setItems([]);
      setMessage('QA_INBOX_FETCH_UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const registry = objectUrls.current;
    return () => { for (const url of registry.values()) URL.revokeObjectURL(url); registry.clear(); };
  }, [refresh]);

  async function showDetails(item: WosInboxItem) {
    if (expanded[item.id]) {
      setExpanded(prev => ({ ...prev, [item.id]: false }));
      return;
    }
    if (item.entityType !== 'PRODUCTION_ORDER') return;
    setDetailErrors(prev => ({ ...prev, [item.id]: '' }));
    try {
      const client = createClient();
      if (!client) throw new Error('QA_DATABASE_UNAVAILABLE');
      const [order, tasks, images] = await Promise.all([
        client.from('wos_production_orders')
          .select('id,organization_id,order_number,workflow_status,version,version_label,customer_name_snapshot,project_name_snapshot,product_name,product_material,requested_quantity,current_batch_quantity,planned_ship_date,priority,surface_treatment,pattern_scope,seam_tolerance,position_reference,customer_acceptance_standard,packaging_method,carton_quantity,label_marking_rule,submitted_at')
          .eq('id', item.id).eq('organization_id', item.organizationId).maybeSingle(),
        client.from('wos_workshop_inbox')
          .select('id,order_id,organization_id,source_revision,source_version_label,submission_id')
          .eq('order_id', item.id).eq('organization_id', item.organizationId).limit(2),
        client.from('wos_reference_images')
          .select('id,category,version_label,image_status,file_name,storage_path,uploaded_at')
          .eq('entity_type','PRODUCTION_ORDER').eq('entity_id',item.id)
          .eq('organization_id',item.organizationId)
          .order('uploaded_at',{ ascending:false }).limit(100),
      ]);
      const task=tasks.data?.[0];
      if (order.error || tasks.error || images.error || !order.data
        || order.data.workflow_status !== 'SUBMITTED'
        || order.data.id !== item.id || order.data.organization_id !== item.organizationId
        || order.data.version !== item.version || order.data.version_label !== item.versionLabel
        || tasks.data?.length !== 1 || (task?.source_revision ?? -100) + 1 !== item.version
        || task?.source_version_label !== item.versionLabel) {
        throw new Error('QA_ORDER_TRANSACTION_DETAILS_UNVERIFIED');
      }
      setDetails(prev => ({ ...prev, [item.id]: order.data as Record<string,unknown> }));
      setImageVersions(prev => ({ ...prev, [item.id]: images.data ?? [] }));
      setExpanded(prev => ({ ...prev, [item.id]: true }));
    } catch {
      setDetailErrors(prev => ({ ...prev, [item.id]: 'QA_ORDER_DETAILS_DENIED_OR_UNVERIFIED' }));
    }
  }

  async function openImage(item: WosInboxItem) {
    if (item.entityType !== 'PRODUCTION_ORDER' || imageStatus[item.id] === 'LOADING') return;
    setImageStatus(current => ({ ...current, [item.id]: 'LOADING' }));
    try {
      const client = createClient();
      if (!client) throw new Error('QA_NOT_CONFIGURED');
      const listing = await client.from('wos_reference_images')
        .select('storage_path,file_name')
        .eq('entity_type', 'PRODUCTION_ORDER')
        .eq('entity_id', item.id)
        .eq('storage_bucket', 'wos-private')
        .eq('image_status', 'READY')
        .limit(1).maybeSingle();
      const image = listing.data;
      if (listing.error || !image?.storage_path
          || !image.storage_path.startsWith('organizations/' + item.organizationId + '/'))
        throw new Error('QA_IMAGE_NOT_REGISTERED_OR_DENIED');
      const downloaded = await client.storage.from('wos-private').download(image.storage_path);
      if (downloaded.error || !downloaded.data || downloaded.data.size === 0)
        throw new Error('QA_PRIVATE_BINARY_READ_DENIED');
      const old = objectUrls.current.get(item.id);
      if (old) URL.revokeObjectURL(old);
      const url = URL.createObjectURL(downloaded.data);
      objectUrls.current.set(item.id, url);
      setImageLinks(current => ({ ...current, [item.id]: url }));
      setImageStatus(current => ({ ...current, [item.id]: 'READY' }));
    } catch {
      setImageStatus(current => ({ ...current, [item.id]: 'QA_PRIVATE_IMAGE_UNAVAILABLE' }));
    }
  }

  return (
    <section className="space-y-4">
      <header className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h2 className="text-sm font-semibold text-blue-950">QA Preview · 车间真实 Inbox</h2>
        <p className="mt-1 text-xs leading-5 text-blue-800">
          本页通过当前账号的 Supabase JWT 和 HTTP GET 读取真实、组织及角色受限的车间任务。
          点击“刷新真实车间任务”可在切换到 Operator 登录后核对刚刚提交的订单。
          不提供生产开工或排期按钮。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => { void refresh(); }} disabled={loading}
            className="min-h-11 rounded-md bg-blue-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {loading ? '读取中...' : '刷新真实车间任务'}
          </button>
          <p className="text-xs text-blue-900" role="status">
            {lastFetchedAt ? '上次查询：' + lastFetchedAt : '尚未读取'}
          </p>
          <Link href="/workshop-orders/production/new"
            className="text-xs font-medium text-blue-900 underline">
            返回 QA 生产下单
          </Link>
        </div>
        {message && <p role="alert" className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700">
          {message}。请确认使用 Operator/Admin 测试账号，且未处于正式站。
        </p>}
      </header>

      {!loading && !message && (
        <p className="text-xs text-gray-600">真实受限任务数量：<strong>{items.length}</strong></p>
      )}
      {!loading && !message && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
          暂无该账号可读取的已提交任务。不会显示虚构的生产单。
        </div>
      )}

      {items.map(item => (
        <article key={item.entityType + ':' + item.id} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-gray-500">
                {item.entityType === 'PRODUCTION_ORDER' ? '生产订单' : '打样申请'} · {item.orderNumber || item.id}
              </p>
              <h3 className="mt-1 text-sm font-semibold text-gray-900">{item.productName}</h3>
              <p className="mt-1 text-xs text-gray-600">
                {item.customerNameSnapshot} · {item.versionLabel} · {item.priority || '无优先级'}
              </p>
            </div>
            <span className="rounded-full border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-950">
              {item.workflowStatus}
            </span>
          </div>
          <p className="mt-2 break-all text-[11px] text-gray-500">
            订单 ID：{item.id} · 已提交于 {new Date(item.submittedAt).toLocaleString('zh-CN')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {item.entityType === 'PRODUCTION_ORDER' && (
              <button type="button" onClick={() => { void showDetails(item); }}
                className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800">
                {expanded[item.id] ? '收起生产要求' : '查看真实生产要求与图片版本'}
              </button>
            )}
            {item.entityType === 'PRODUCTION_ORDER' && (
              <button type="button" onClick={() => { void openImage(item); }}
                disabled={imageStatus[item.id] === 'LOADING'}
                className="min-h-11 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-800 disabled:opacity-50">
                {imageStatus[item.id] === 'LOADING' ? '验证私有图片中...' : '用当前车间身份读取私有图片'}
              </button>
            )}
            {imageLinks[item.id] && (
              <a href={imageLinks[item.id]} target="_blank" rel="noopener noreferrer"
                className="text-xs font-semibold text-blue-900 underline">打开已验证的私有图片</a>
            )}
            {imageStatus[item.id]?.startsWith('QA_') && (
              <span role="alert" className="text-xs text-red-700">{imageStatus[item.id]}</span>
            )}
          </div>
          {detailErrors[item.id] && <p role="alert" className="mt-2 text-xs text-red-700">{detailErrors[item.id]}</p>}
          {expanded[item.id] && details[item.id] && (
            <section className="mt-4 space-y-3 border-t pt-3" aria-label="订单生产详情">
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                {([
                  ['客户', 'customer_name_snapshot'], ['关联项目', 'project_name_snapshot'],
                  ['产品', 'product_name'], ['材质', 'product_material'],
                  ['订单数量', 'requested_quantity'], ['本批数量', 'current_batch_quantity'],
                  ['交货日期', 'planned_ship_date'], ['工艺与表面处理', 'surface_treatment'],
                  ['图案范围', 'pattern_scope'], ['接缝要求', 'seam_tolerance'],
                  ['印刷位置', 'position_reference'], ['客户验收标准', 'customer_acceptance_standard'],
                  ['包装方式', 'packaging_method'], ['每箱数量', 'carton_quantity'],
                  ['标签要求', 'label_marking_rule'], ['生产资料版本', 'version_label'],
                ] as const).map(([label, field]) => (
                  <div key={field} className="rounded border border-gray-100 p-2">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="mt-1 break-words font-medium text-gray-900">{String(details[item.id][field] ?? '未填写')}</dd>
                  </div>
                ))}
              </dl>
              <h4 className="text-xs font-semibold">参考图片与历史版本（仅展示元数据，图片下载仍受 Storage RLS 控制）</h4>
              <ul className="space-y-1 text-xs">
                {(imageVersions[item.id] ?? []).map(img => (
                  <li key={img.id} className="rounded bg-gray-50 p-2">
                    {img.category} · {img.version_label} · {img.image_status} · {img.file_name}
                    {img.version_label === item.versionLabel && img.image_status === 'READY'
                      ? ' · 当前订单版本（不代表已完成签样确认）' : ' · 历史或非就绪记录'}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      ))}
    </section>
  );
}
