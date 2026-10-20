'use client';

import { useEffect, useState } from 'react';
import type { CommercialDocumentDraft } from '@/lib/commercial-documents/template';

interface ArchiveRow {
  id: string;
  document_no: string;
  version: number;
  buyer_name: string;
  salesperson_name: string;
  project_name: string;
  document_date: string;
  currency: string;
  amount_minor: number;
  archived_at: string;
}

interface ArchiveDetail extends ArchiveRow { snapshot: CommercialDocumentDraft; }

export default function QuotationArchiveList({
  onReuse,
}: { onReuse: (draft: CommercialDocumentDraft, archiveId: string) => void }) {
  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/commercial-documents/archives?q=' + encodeURIComponent(search) + '&page=' + page, { cache: 'no-store' })
      .then(async result => {
        const data = await result.json();
        if (!result.ok || !data.ok) throw new Error(data.message || '无法查询报价档案');
        if (!cancelled) {
          setRows(data.rows || []);
          setTotal(data.total || 0);
          setMessage('');
        }
      })
      .catch(error => {
        if (!cancelled) { setMessage(error.message || '读取失败'); setRows([]); }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, search, refresh]);

  async function openPdf(id: string) {
    try {
      const response = await fetch('/api/commercial-documents/archives/' + id + '?download=pdf', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.ok || typeof result.url !== 'string') throw new Error(result.message || '无法下载 PDF');
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error) { setMessage(error instanceof Error ? error.message : '下载失败'); }
  }

  async function reuse(id: string) {
    if (!window.confirm('以该版本制作新的报价版本？原有档案不会被覆盖。')) return;
    try {
      const response = await fetch('/api/commercial-documents/archives/' + id, { cache: 'no-store' });
      const result: { ok?: boolean; archive?: ArchiveDetail; message?: string } = await response.json();
      if (!response.ok || !result.ok || !result.archive?.snapshot) throw new Error(result.message || '读取报价版本失败');
      onReuse(result.archive.snapshot, id);
    } catch (error) { setMessage(error instanceof Error ? error.message : '载入失败'); }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3" aria-label="历史报价档案">
      <div className="flex gap-2 items-center justify-between flex-wrap">
        <div>
          <h2 className="font-bold text-gray-900">历史报价档案</h2>
          <p className="text-xs text-gray-500">历史版本只读保存；业务员可查看自己的记录，管理员和经理可查看本组织记录。</p>
        </div>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setRefresh(x => x + 1)}>刷新</button>
      </div>
      <form className="flex gap-2" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}>
        <input aria-label="搜索报价编号、客户或项目" className="w-full min-w-0 text-sm" value={query}
          onChange={event => setQuery(event.target.value)} placeholder="搜索报价编号、客户名称或项目名称" />
        <button type="submit" className="btn-primary btn-sm whitespace-nowrap">搜索</button>
      </form>
      {message && <p role="alert" className="text-xs text-red-700">{message}</p>}
      {loading ? <p className="text-xs text-gray-500">正在加载…</p>
        : rows.length === 0 ? <p className="text-xs text-gray-500">暂无匹配档案。</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-gray-700">
              <thead><tr className="border-b bg-gray-50 text-left">
                <th className="p-2">报价编号 / 版本</th><th className="p-2">客户 / 项目</th>
                <th className="p-2">日期 / 业务员</th><th className="p-2 text-right">金额</th><th className="p-2">操作</th>
              </tr></thead>
              <tbody>{rows.map(row => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="p-2"><div className="font-medium">{row.document_no}</div><div className="text-gray-500">V{row.version}</div></td>
                  <td className="p-2"><div>{row.buyer_name}</div><div className="text-gray-500">{row.project_name}</div></td>
                  <td className="p-2"><div>{row.document_date}</div><div className="text-gray-500">{row.salesperson_name}</div></td>
                  <td className="p-2 text-right whitespace-nowrap">{new Intl.NumberFormat('zh-CN',{style:'currency',currency:row.currency}).format(row.amount_minor / 100)}</td>
                  <td className="p-2 whitespace-nowrap">
                    <button type="button" className="text-blue-700 mr-3" onClick={() => openPdf(row.id)}>下载PDF</button>
                    <button type="button" className="text-blue-700" onClick={() => reuse(row.id)}>复制新版</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      <div className="flex items-center gap-3 justify-end text-xs text-gray-600">
        <span>共 {total} 条</span>
        <button type="button" className="text-blue-700 disabled:text-gray-400" disabled={page <= 1}
          onClick={() => setPage(n => Math.max(1,n-1))}>上一页</button>
        <span>第 {page} 页</span>
        <button type="button" className="text-blue-700 disabled:text-gray-400" disabled={page * 20 >= total}
          onClick={() => setPage(n => n+1)}>下一页</button>
      </div>
    </section>
  );
}
