'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ReviewCenterEmpty from '@/components/review-center/ReviewCenterEmpty';
import {
  canHandleSubmittedReview,
} from '@/lib/review-center/lifecycle-presentation';
import { reviewStatusDisplayLabel, riskLevelLabel, formatReviewDateTime } from '@/lib/review-center/formatters';
import type { ReviewListItem, ReviewListResponse } from '@/lib/review-center/types';

export default function ApprovalsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [roleReady, setRoleReady] = useState(false);
  const [items, setItems] = useState<ReviewListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/review-center/me')
      .then(response => response.json())
      .then(data => {
        if (active) setRole(typeof data.role === 'string' ? data.role : null);
      })
      .catch(() => {
        if (active) setRole(null);
      })
      .finally(() => {
        if (active) setRoleReady(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!roleReady || !canHandleSubmittedReview(role)) return;
    let active = true;
    setLoading(true);
    setError('');
    fetch('/api/review-center/reviews?status=submitted&page=1&limit=50')
      .then(response => response.json())
      .then((data: ReviewListResponse & { error?: string }) => {
        if (!active) return;
        if (!Array.isArray(data.items)) {
          setItems([]);
          setTotal(0);
          setError(data.error || '待我审核加载失败');
          return;
        }
        setItems(data.items);
        setTotal(data.total || 0);
      })
      .catch(() => {
        if (active) {
          setItems([]);
          setTotal(0);
          setError('待我审核加载失败');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [role, roleReady]);

  return (
    <AppLayout>
      <PageHeader
        title="待我审核"
        description="当前你有权处理且状态为待确认的复盘"
      />

      {!roleReady ? (
        <div className="text-gray-500 py-10 text-center">加载中...</div>
      ) : !canHandleSubmittedReview(role) ? (
        <ReviewCenterEmpty
          title="无权限查看审核队列"
          description="当前账号没有关闭或退回复盘的处理权限。"
        />
      ) : error ? (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      ) : loading ? (
        <div className="text-gray-500 py-10 text-center">加载中...</div>
      ) : items.length === 0 ? (
        <ReviewCenterEmpty
          title="暂无待审核事项"
          description="当前没有需要你处理的审核事项。"
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-3 w-[150px]">编号</th>
                  <th className="px-4 py-3 w-[220px]">标题</th>
                  <th className="px-4 py-3 w-[70px]">类型</th>
                  <th className="px-4 py-3 w-[90px]">风险</th>
                  <th className="px-4 py-3 w-[90px]">状态</th>
                  <th className="px-4 py-3 w-[150px]">更新时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/review-center/reviews/${encodeURIComponent(item.id)}`} className="text-blue-600 no-underline">
                        {item.review_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3 max-w-[220px] break-words">{item.title}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{item.review_type} 类</td>
                    <td className="px-4 py-3 whitespace-nowrap">{riskLevelLabel(item.risk_level)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{reviewStatusDisplayLabel(item.status)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatReviewDateTime(item.updated_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/review-center/reviews/${encodeURIComponent(item.id)}`} className="btn-secondary btn-sm">
                        进入详情
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-xs text-gray-500 border-t border-gray-100">共 {total} 条待确认复盘</div>
        </div>
      )}
    </AppLayout>
  );
}
