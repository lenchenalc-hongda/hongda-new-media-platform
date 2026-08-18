'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ReviewCenterEmpty from '@/components/review-center/ReviewCenterEmpty';
import { reviewStatusLabel, riskLevelLabel, formatReviewDateTime, formatReviewDate } from '@/lib/review-center/formatters';
import type { ReviewDetail } from '@/lib/review-center/types';

export default function ReviewDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/review-center/reviews/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setReview(data);
      })
      .catch(() => setError('复盘详情加载失败'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <AppLayout>
        <PageHeader title="复盘详情" description="加载中..." />
      </AppLayout>
    );
  }

  if (!review || error) {
    return (
      <AppLayout>
        <PageHeader title="复盘详情" description="无法读取复盘" />
        <ReviewCenterEmpty title={error || '复盘不存在或不可见'} action={{ label: '返回列表', href: '/review-center/reviews' }} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader title={review.title} description={`${review.review_no} · ${review.review_type} 类 · ${reviewStatusLabel(review.status)}`} />

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-5">
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><dt className="text-gray-400 text-xs">复盘编号</dt><dd className="mt-1">{review.review_no}</dd></div>
          <div><dt className="text-gray-400 text-xs">状态</dt><dd className="mt-1">{reviewStatusLabel(review.status)}</dd></div>
          <div><dt className="text-gray-400 text-xs">风险</dt><dd className="mt-1">{riskLevelLabel(review.risk_level)}</dd></div>
          <div><dt className="text-gray-400 text-xs">客户</dt><dd className="mt-1">{review.customer_name || '-'}</dd></div>
          <div><dt className="text-gray-400 text-xs">订单号</dt><dd className="mt-1">{review.order_no || '-'}</dd></div>
          <div><dt className="text-gray-400 text-xs">项目</dt><dd className="mt-1">{review.project_name || '-'}</dd></div>
          <div><dt className="text-gray-400 text-xs">产品</dt><dd className="mt-1">{review.product_name || '-'}</dd></div>
          <div><dt className="text-gray-400 text-xs">工艺</dt><dd className="mt-1">{review.process_name || '-'}</dd></div>
          <div><dt className="text-gray-400 text-xs">发生日期</dt><dd className="mt-1">{formatReviewDate(review.occurred_at)}</dd></div>
          <div><dt className="text-gray-400 text-xs">发生时间</dt><dd className="mt-1">{formatReviewDateTime(review.occurred_at)}</dd></div>
          <div><dt className="text-gray-400 text-xs">创建时间</dt><dd className="mt-1">{formatReviewDateTime(review.created_at)}</dd></div>
        </dl>

        <div className="mt-5 space-y-3">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-1">问题描述</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{review.description || '未填写'}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-1">影响摘要</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{review.impact_summary || '未填写'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card"><h3 className="font-medium text-gray-800 mb-2">专项复盘内容</h3><p className="text-sm text-gray-400">下一阶段配置</p></div>
        <div className="card"><h3 className="font-medium text-gray-800 mb-2">项目成员</h3><p className="text-sm text-gray-400">{review.members.length > 0 ? `${review.members.length} 位成员` : '下一阶段配置'}</p></div>
        <div className="card"><h3 className="font-medium text-gray-800 mb-2">改善行动</h3><p className="text-sm text-gray-400">下一阶段配置</p></div>
      </div>
    </AppLayout>
  );
}
