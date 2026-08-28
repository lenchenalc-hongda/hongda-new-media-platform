'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ReviewCenterEmpty from '@/components/review-center/ReviewCenterEmpty';
import type { CaseAdminDetail } from '@/lib/review-center/case-schemas';
import { CaseApiError, fetchCaseAdminDetail } from '@/lib/review-center/case-api-client';
import {
  canManageCaseRole,
  caseReviewTypeLabel,
  caseRiskBadgeClass,
  caseRiskLabel,
  caseStatusLabel,
} from '@/lib/review-center/case-presentation';

export default function CaseManageOverviewShell() {
  const params = useParams();
  const caseNo = Array.isArray(params.caseNo) ? params.caseNo[0] : params.caseNo;
  const [detail, setDetail] = useState<CaseAdminDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [meRole, setMeRole] = useState<string | null>(null);
  const [meReady, setMeReady] = useState(false);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!caseNo) {
      setErrorMessage('案例不存在或当前不可管理');
      setStatus('error');
      return;
    }
    const requestId = ++generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');
    setErrorMessage('');

    try {
      const data = await fetchCaseAdminDetail(caseNo, { signal: controller.signal });
      if (requestId !== generationRef.current) return;
      setDetail(data);
      setStatus('ready');
    } catch (error) {
      if (requestId !== generationRef.current) return;
      if (error instanceof CaseApiError && error.status === 401) {
        setErrorMessage('登录状态已失效，请重新登录。');
      } else if (error instanceof CaseApiError && error.status === 403) {
        setErrorMessage('无权限访问管理功能');
      } else if (error instanceof CaseApiError && error.status === 404) {
        setErrorMessage('案例不存在或当前不可管理');
      } else {
        setErrorMessage('案例管理信息加载失败，请稍后重试。');
      }
      setDetail(null);
      setStatus('error');
    } finally {
      if (requestId === generationRef.current) abortRef.current = null;
    }
  }, [caseNo]);

  useEffect(() => {
    let active = true;
    fetch('/api/review-center/me')
      .then(response => response.json().catch(() => null))
      .then(data => {
        if (!active) return;
        setMeRole(typeof data?.role === 'string' ? data.role : null);
        setMeReady(true);
      })
      .catch(() => {
        if (active) {
          setMeRole(null);
          setMeReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void load();
    return () => {
      generationRef.current += 1;
      abortRef.current?.abort();
    };
  }, [load]);

  const noPermission = (meReady && !canManageCaseRole(meRole))
    || (status === 'error' && errorMessage === '无权限访问管理功能');

  if (noPermission) {
    return (
      <AppLayout>
        <PageHeader title="案例管理概览" description="查看案例当前状态与基础信息。" />
        <ReviewCenterEmpty
          title="无权限访问管理功能"
          description="只有管理员或经理可以查看案例管理信息。"
          action={{ label: '返回案例中心', href: '/review-center/cases' }}
        />
      </AppLayout>
    );
  }

  if (status === 'loading' && !detail) {
    return (
      <AppLayout>
        <PageHeader title="案例管理概览" description="加载中..." />
        <div className="space-y-3" aria-busy="true" aria-label="案例管理信息加载中">
          <div className="h-32 animate-pulse rounded-lg border border-gray-100 bg-gray-50" />
          <div className="h-32 animate-pulse rounded-lg border border-gray-100 bg-gray-50" />
        </div>
      </AppLayout>
    );
  }

  if (status === 'error' || !detail) {
    return (
      <AppLayout>
        <PageHeader title="案例管理概览" description="无法读取案例管理信息" />
        <ReviewCenterEmpty
          title={errorMessage || '案例管理信息加载失败，请稍后重试。'}
          action={{ label: '返回案例中心', href: '/review-center/cases' }}
        />
        {status === 'error' && errorMessage !== '无权限访问管理功能' && (
          <div className="mt-4 text-center">
            <button type="button" className="btn-secondary" onClick={() => void load()}>
              重新加载
            </button>
          </div>
        )}
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader title="案例管理概览" description="查看案例当前状态与基础信息。" />

      <div className="mb-5 flex flex-wrap gap-3 text-sm">
        <Link href="/review-center/cases/candidates" className="text-blue-600 no-underline">
          返回待整理案例
        </Link>
        <span className="text-gray-300">|</span>
        <Link href="/review-center/cases" className="text-blue-600 no-underline">
          返回案例中心
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">{detail.title}</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs text-gray-400">案例编号</dt>
            <dd className="mt-1 text-gray-800">{detail.caseNo}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">状态</dt>
            <dd className="mt-1">
              <span className="badge-gray">{caseStatusLabel(detail.status)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">复盘类型</dt>
            <dd className="mt-1 text-gray-800">{caseReviewTypeLabel(detail.reviewTypeSnapshot)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">风险等级</dt>
            <dd className="mt-1">
              <span className={caseRiskBadgeClass(detail.riskSnapshot)}>
                {caseRiskLabel(detail.riskSnapshot)}
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </AppLayout>
  );
}
