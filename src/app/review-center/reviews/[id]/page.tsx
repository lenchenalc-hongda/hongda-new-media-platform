'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ReviewCenterEmpty from '@/components/review-center/ReviewCenterEmpty';
import { reviewStatusLabel, riskLevelLabel, formatReviewDateTime, formatReviewDate } from '@/lib/review-center/formatters';
import { applyLifecycleSuccessToDetail, type LifecycleSuccessData } from '@/lib/review-center/lifecycle-presentation';
import type { ReviewDetail } from '@/lib/review-center/types';
import TimelineSection from './timeline-section';
import LifecycleSection from './lifecycle-section';
import ActionSection from './action-section';

export default function ReviewDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [me, setMe] = useState<{ role: string | null; profile_id: string | null } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);
  const requestIdRef = useRef(0);

  const reloadAuthority = useCallback(async (showLoading: boolean) => {
    if (!id) return;
    const requestId = ++requestIdRef.current;
    if (showLoading) setLoading(true);
    try {
      const [meResponse, detailResponse] = await Promise.all([
        fetch('/api/review-center/me'),
        fetch(`/api/review-center/reviews/${encodeURIComponent(id)}`),
      ]);
      if (requestId !== requestIdRef.current) return;
      const [meData, detailData] = await Promise.all([
        meResponse.json().catch(() => null),
        detailResponse.json().catch(() => null),
      ]);
      if (requestId !== requestIdRef.current) return;
      if (meResponse.ok && meData && !meData.error) {
        setMe({
          role: typeof meData.role === 'string' ? meData.role : null,
          profile_id: typeof meData.profile_id === 'string' ? meData.profile_id : null,
        });
      } else {
        setMe(null);
      }
      if (detailResponse.ok && detailData && !detailData.error) {
        setReview(detailData);
        setError('');
      } else if (detailResponse.status === 401) {
        setError('未登录或登录已过期');
        setReview(null);
      } else if (detailResponse.status === 403) {
        setError('你没有权限访问此复盘');
        setReview(null);
      } else if (detailResponse.status === 404) {
        setError('复盘不存在或不可见');
        setReview(null);
      } else {
        setError('复盘详情加载失败');
        setReview(null);
      }
    } catch {
      if (requestId === requestIdRef.current) {
        setError('复盘详情加载失败');
        setReview(null);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reloadAuthority(true);
  }, [reloadAuthority]);

  const handleLifecycleSuccess = useCallback((data: LifecycleSuccessData) => {
    setReview(prev => prev ? applyLifecycleSuccessToDetail(prev, data) : prev);
  }, []);

  const handleAuthorityRefresh = useCallback(() => {
    setTimelineRefreshKey(key => key + 1);
    void reloadAuthority(false);
  }, [reloadAuthority]);

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card"><h3 className="font-medium text-gray-800 mb-2">专项复盘内容</h3><p className="text-sm text-gray-400">下一阶段配置</p></div>
        <div className="card"><h3 className="font-medium text-gray-800 mb-2">项目成员</h3><p className="text-sm text-gray-400">{review.members.length > 0 ? `${review.members.length} 位成员` : '下一阶段配置'}</p></div>
      </div>

      <ActionSection
        reviewId={id ?? ''}
        reviewStatus={review.status}
        reviewOwnerProfileId={review.owner_id}
        reviewPmoProfileId={review.pmo_id}
        currentProfileId={me?.profile_id ?? null}
        currentRole={me?.role ?? null}
      />

      <LifecycleSection
        reviewId={id ?? ''}
        status={review.status}
        version={review.version}
        ownerId={review.owner_id}
        pmoId={review.pmo_id}
        currentProfileId={me?.profile_id ?? null}
        currentRole={me?.role ?? null}
        editHref={`/review-center/reviews/${id}/edit`}
        submittedAt={review.submitted_at ?? null}
        closedAt={review.closed_at}
        onLifecycleSuccess={handleLifecycleSuccess}
        onAuthorityRefresh={handleAuthorityRefresh}
      />

      <div className="mt-5">
        <TimelineSection reviewId={id ?? ''} refreshKey={timelineRefreshKey} />
      </div>
    </AppLayout>
  );
}
