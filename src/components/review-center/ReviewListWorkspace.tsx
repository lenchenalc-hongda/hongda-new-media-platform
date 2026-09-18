'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ReviewCenterEmpty from '@/components/review-center/ReviewCenterEmpty';
import {
  formatReviewDateTime,
  reviewStatusDisplayLabel,
  riskLevelLabel,
} from '@/lib/review-center/formatters';
import type {
  ReviewListItem,
  ReviewListResponse,
  ReviewStatus,
  ReviewType,
  RiskLevel,
} from '@/lib/review-center/types';

const STATUS_OPTIONS: ReviewStatus[] = [
  'draft',
  'submitted',
  'in_review',
  'action_required',
  'verifying',
  'closed',
  'archived',
  'rejected',
  'cancelled',
];

const TYPE_OPTIONS: ReviewType[] = ['A', 'B', 'C'];
const RISK_OPTIONS: RiskLevel[] = ['RED', 'YELLOW', 'GREEN'];

interface ReviewListWorkspaceProps {
  scope: 'all' | 'mine';
}

export default function ReviewListWorkspace({
  scope,
}: ReviewListWorkspaceProps) {
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
    if (scope === 'mine') params.set('scope', 'mine');
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
  }, [appliedQ, limit, page, reviewType, risk, scope, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch('/api/review-center/me')
      .then(res => res.json())
      .then(data => {
        if (typeof data.can_create_review === 'boolean') {
          setCanCreate(data.can_create_review);
        }
      })
      .catch(() => {});
  }, []);

  const mine = scope === 'mine';

  return (
    <AppLayout>
      <PageHeader
        title={mine ? '我的复盘' : '全部复盘'}
        description={mine ? '查看我创建、负责或参与的复盘' : '集中管理所有项目复盘记录'}
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-gray-500">状态</label>
          <select
            value={status}
            onChange={event => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="input-field"
          >
            <option value="">全部状态</option>
            {STATUS_OPTIONS.map(value => (
              <option key={value} value={value}>{reviewStatusDisplayLabel(value)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">类型</label>
          <select
            value={reviewType}
            onChange={event => {
              setReviewType(event.target.value);
              setPage(1);
            }}
            className="input-field"
          >
            <option value="">全部类型</option>
            {TYPE_OPTIONS.map(value => (
              <option key={value} value={value}>{value} 类</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">风险</label>
          <select
            value={risk}
            onChange={event => {
              setRisk(event.target.value);
              setPage(1);
            }}
            className="input-field"
          >
            <option value="">全部风险</option>
            {RISK_OPTIONS.map(value => (
              <option key={value} value={value}>{riskLevelLabel(value)}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs text-gray-500">搜索</label>
          <div className="flex gap-2">
            <input
              value={qInput}
              onChange={event => setQInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  setAppliedQ(qInput.trim());
                  setPage(1);
                }
              }}
              placeholder="编号 / 标题 / 客户 / 项目 / 产品"
              className="input-field flex-1"
            />
            <button
              type="button"
              onClick={() => {
                setAppliedQ(qInput.trim());
                setPage(1);
              }}
              className="btn-secondary whitespace-nowrap"
            >
              搜索
            </button>
          </div>
        </div>
        {canCreate && (
          <Link href="/review-center/new" className="btn-primary whitespace-nowrap">
            新建复盘
          </Link>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-gray-500">加载中...</div>
      ) : items.length === 0 ? (
        <ReviewCenterEmpty
          title="暂无复盘记录"
          description={mine
            ? '你创建、负责或参与的项目复盘将在这里集中管理。'
            : '项目异常复盘提交后，将在这里集中管理。'}
          action={canCreate ? { label: '新建复盘', href: '/review-center/new' } : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="w-[150px] px-4 py-3">编号</th>
                  <th className="w-[220px] px-4 py-3">标题</th>
                  <th className="w-[70px] px-4 py-3">类型</th>
                  <th className="w-[140px] px-4 py-3">客户</th>
                  <th className="w-[180px] px-4 py-3">项目/产品</th>
                  <th className="w-[90px] px-4 py-3">状态</th>
                  <th className="w-[70px] px-4 py-3">风险</th>
                  <th className="w-[150px] px-4 py-3">发生时间</th>
                  <th className="w-[150px] px-4 py-3">更新时间</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        href={`/review-center/reviews/${item.id}`}
                        className="text-blue-600 no-underline"
                      >
                        {item.review_no}
                      </Link>
                    </td>
                    <td className="max-w-[220px] break-words px-4 py-3">{item.title}</td>
                    <td className="whitespace-nowrap px-4 py-3">{item.review_type} 类</td>
                    <td className="max-w-[140px] break-words px-4 py-3">{item.customer_name || '-'}</td>
                    <td className="max-w-[180px] break-words px-4 py-3">
                      {item.project_name || item.product_name || '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{reviewStatusDisplayLabel(item.status)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{riskLevelLabel(item.risk_level)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatReviewDateTime(item.occurred_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatReviewDateTime(item.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <span className="text-xs text-gray-500">共 {total} 条</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(current => current - 1)}
                className="btn-secondary"
              >
                上一页
              </button>
              <button
                disabled={page * limit >= total}
                onClick={() => setPage(current => current + 1)}
                className="btn-secondary"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
