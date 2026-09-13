'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ReviewCenterEmpty from '@/components/review-center/ReviewCenterEmpty';
import MetadataChips from '@/components/review-center/MetadataChips';
import type { CasePublicDetail } from '@/lib/review-center/case-schemas';
import { CaseApiError, fetchCasePublicDetail } from '@/lib/review-center/case-api-client';
import {
  caseRiskBadgeClass,
  caseRiskLabel,
  caseReviewTypeLabel,
  formatCaseDate,
  formatCaseDateTime,
} from '@/lib/review-center/case-presentation';

export default function CasePublicDetailPage() {
  const params = useParams();
  const caseNo = Array.isArray(params.caseNo) ? params.caseNo[0] : params.caseNo;
  const [detail, setDetail] = useState<CasePublicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!caseNo) {
      setErrorMessage('案例不存在或当前不可查看');
      setLoading(false);
      return;
    }
    const requestId = ++generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setErrorMessage('');

    try {
      const data = await fetchCasePublicDetail(caseNo, { signal: controller.signal });
      if (requestId !== generationRef.current) return;
      setDetail(data);
      setLoading(false);
    } catch (error) {
      if (requestId !== generationRef.current) return;
      if (error instanceof CaseApiError && error.status === 401) {
        setErrorMessage('登录状态已失效，请重新登录。');
      } else if (error instanceof CaseApiError && error.status === 403) {
        setErrorMessage('没有权限访问此案例。');
      } else if (error instanceof CaseApiError && error.status === 404) {
        setErrorMessage('案例不存在或当前不可查看');
      } else {
        setErrorMessage('案例加载失败，请稍后重试。');
      }
      setDetail(null);
      setLoading(false);
    } finally {
      if (requestId === generationRef.current) abortRef.current = null;
    }
  }, [caseNo]);

  useEffect(() => {
    void load();
    return () => {
      generationRef.current += 1;
      abortRef.current?.abort();
    };
  }, [load]);

  if (loading) {
    return (
      <AppLayout>
        <PageHeader title="案例详情" description="加载中..." />
        <div className="space-y-3" aria-busy="true" aria-label="案例加载中">
          <div className="h-32 animate-pulse rounded-lg border border-gray-100 bg-gray-50" />
          <div className="h-48 animate-pulse rounded-lg border border-gray-100 bg-gray-50" />
          <div className="h-48 animate-pulse rounded-lg border border-gray-100 bg-gray-50" />
        </div>
      </AppLayout>
    );
  }

  if (!detail || errorMessage) {
    return (
      <AppLayout>
        <PageHeader title="案例详情" description="无法读取案例" />
        <ReviewCenterEmpty
          title={errorMessage || '案例不存在或当前不可查看'}
          action={{ label: '返回案例中心', href: '/review-center/cases' }}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title={detail.title}
        description={`${detail.caseNo} · ${caseReviewTypeLabel(detail.reviewType)} · ${caseRiskLabel(detail.risk)}`}
      />

      <div className="mb-5">
        <Link href="/review-center/cases" className="text-sm text-blue-600 no-underline">
          返回案例中心
        </Link>
      </div>

      <div className="mb-5 rounded-lg border border-gray-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs text-gray-400">案例编号</dt>
            <dd className="mt-1 text-gray-800">{detail.caseNo}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">复盘类型</dt>
            <dd className="mt-1 text-gray-800">{caseReviewTypeLabel(detail.reviewType)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">风险等级</dt>
            <dd className="mt-1">
              <span className={caseRiskBadgeClass(detail.risk)}>{caseRiskLabel(detail.risk)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">发生日期</dt>
            <dd className="mt-1 text-gray-800">{formatCaseDate(detail.occurredAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">发布时间</dt>
            <dd className="mt-1 text-gray-800">{formatCaseDateTime(detail.publishedAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="mb-5 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-3 font-medium text-gray-800">案例摘要</h2>
        <p className="text-sm whitespace-pre-wrap text-gray-700">{detail.summary || '-'}</p>
      </div>

      <div className="mb-5 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-3 font-medium text-gray-800">分类快照</h2>
        <MetadataChips metadata={detail.metadata} />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-3 font-medium text-gray-800">核心教训</h2>
          <p className="text-sm whitespace-pre-wrap text-gray-700">{detail.lessonSummary || '-'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-3 font-medium text-gray-800">预防措施</h2>
          <p className="text-sm whitespace-pre-wrap text-gray-700">{detail.preventionSummary || '-'}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-3 font-medium text-gray-800">适用说明</h2>
        <p className="text-sm whitespace-pre-wrap text-gray-700">
          {detail.applicabilityNotes || '暂无特别适用说明'}
        </p>
      </div>
    </AppLayout>
  );
}
