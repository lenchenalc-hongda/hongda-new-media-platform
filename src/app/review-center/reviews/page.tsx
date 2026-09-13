'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ReviewCenterEmpty from '@/components/review-center/ReviewCenterEmpty';
import { reviewStatusDisplayLabel, riskLevelLabel, formatReviewDateTime } from '@/lib/review-center/formatters';
import type { ReviewListItem, ReviewListResponse, ReviewStatus, ReviewType, RiskLevel } from '@/lib/review-center/types';

const STATUS_OPTIONS: ReviewStatus[] = [
  'draft', 'submitted', 'in_review', 'action_required', 'verifying', 'closed', 'archived', 'rejected', 'cancelled',
];

const TYPE_OPTIONS: ReviewType[] = ['A', 'B', 'C'];
const RISK_OPTIONS: RiskLevel[] = ['RED', 'YELLOW', 'GREEN'];

export default function ReviewListPage() {
  const [items, setItems] = useState<ReviewListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [status, setStatus] = useState('');
  const [reviewType, setReviewType] = useState('');
  const [risk, setRisk] = useState('');
  const [qInput, setQInput] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set('status', status);
    if (reviewType) params.set('review_type', reviewType);
    if (risk) params.set('risk_level', risk);
    if (appliedQ.trim()) params.set('q', appliedQ.trim());
    try {
      const res = await fetch(`/api/review-center/reviews?${params.toString()}`);
      const data: ReviewListResponse & { error?: string } = await res.json();
      if (!res.ok) {
        setError(data.error || '复盘列表加载失败');
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      setError('复盘列表加载失败');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, status, reviewType, risk, appliedQ]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/review-center/me')
      .then(res => res.json())
      .then(data => {
        if (typeof data.can_create_review === 'boolean') setCanCreate(data.can_create_review);
      })
      .catch(() => {});
  }, []);

  return (
    <AppLayout>
      <PageHeader title="全部复盘" description="集中管理所有项目复盘记录" />

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs text-gray-500 mb-1">状态</label>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="input-field">
            <option value="">全部状态</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{reviewStatusDisplayLabel(s)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">类型</label>
          <select value={reviewType} onChange={e => { setReviewType(e.target.value); setPage(1); }} className="input-field">
            <option value="">全部类型</option>
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t} 类</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">风险</label>
          <select value={risk} onChange={e => { setRisk(e.target.value); setPage(1); }} className="input-field">
            <option value="">全部风险</option>
            {RISK_OPTIONS.map(r => <option key={r} value={r}>{riskLevelLabel(r)}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-gray-500 mb-1">搜索</label>
          <div className="flex gap-2">
            <input
              value={qInput}
              onChange={e => setQInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setAppliedQ(qInput.trim()); setPage(1); } }}
              placeholder="编号 / 标题 / 客户 / 项目 / 产品"
              className="input-field flex-1"
            />
            <button type="button" onClick={() => { setAppliedQ(qInput.trim()); setPage(1); }} className="btn-secondary whitespace-nowrap">搜索</button>
          </div>
        </div>
        {canCreate && <Link href="/review-center/new" className="btn-primary whitespace-nowrap">新建复盘</Link>}
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="text-gray-500 py-10 text-center">加载中...</div>
      ) : items.length === 0 ? (
        <ReviewCenterEmpty
          title="暂无复盘记录"
          description="项目异常复盘提交后，将在这里集中管理。"
          action={canCreate ? { label: '新建复盘', href: '/review-center/new' } : undefined}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3 w-[150px]">编号</th>
                <th className="px-4 py-3 w-[220px]">标题</th>
                <th className="px-4 py-3 w-[70px]">类型</th>
                <th className="px-4 py-3 w-[140px]">客户</th>
                <th className="px-4 py-3 w-[180px]">项目/产品</th>
                <th className="px-4 py-3 w-[90px]">状态</th>
                <th className="px-4 py-3 w-[70px]">风险</th>
                <th className="px-4 py-3 w-[150px]">发生时间</th>
                <th className="px-4 py-3 w-[150px]">更新时间</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link href={`/review-center/reviews/${item.id}`} className="text-blue-600 no-underline">{item.review_no}</Link>
                  </td>
                  <td className="px-4 py-3 max-w-[220px] break-words">{item.title}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{item.review_type} 类</td>
                  <td className="px-4 py-3 max-w-[140px] break-words">{item.customer_name || '-'}</td>
                  <td className="px-4 py-3 max-w-[180px] break-words">{item.project_name || item.product_name || '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{reviewStatusDisplayLabel(item.status)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{riskLevelLabel(item.risk_level)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatReviewDateTime(item.occurred_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatReviewDateTime(item.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="px-4 py-3 flex items-center justify-between border-t border-gray-100">
            <span className="text-xs text-gray-500">共 {total} 条</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary">上一页</button>
              <button disabled={page * limit >= total} onClick={() => setPage(p => p + 1)} className="btn-secondary">下一页</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
