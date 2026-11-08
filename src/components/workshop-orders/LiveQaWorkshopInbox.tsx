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
        </article>
      ))}
    </section>
  );
}
