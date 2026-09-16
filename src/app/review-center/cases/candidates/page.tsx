'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ReviewCenterEmpty from '@/components/review-center/ReviewCenterEmpty';
import CaseCreateDialog from '@/components/review-center/case/CaseCreateDialog';
import type { CaseCandidateItem, CaseMutationResult } from '@/lib/review-center/case-schemas';
import { CaseApiError, fetchCaseCandidates } from '@/lib/review-center/case-api-client';
import { getMaterialDisplayLabel } from '@/lib/review-center/material-labels';
import {
  canManageCaseRole,
  caseRiskBadgeClass,
  caseRiskLabel,
  caseReviewTypeLabel,
  caseStatusLabel,
  formatCaseDateTime,
} from '@/lib/review-center/case-presentation';

const PAGE_LIMIT = 30;

function MetadataSummaryTags({ candidate }: { candidate: CaseCandidateItem }) {
  const tags = candidate.metadataSummary.map(item => (
    item.metadataType === 'MATERIAL'
      ? getMaterialDisplayLabel(item.code, item.label || item.code)
      : item.label || item.code
  ));
  const visible = tags.slice(0, 3);
  const restCount = tags.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((label, index) => (
        <span key={`${candidate.sourceReviewId}:${index}`} className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-700">
          {label}
        </span>
      ))}
      {restCount > 0 && (
        <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-500">
          +{restCount}
        </span>
      )}
    </div>
  );
}

export default function CaseCandidatesPage() {
  const router = useRouter();
  const [items, setItems] = useState<CaseCandidateItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [qInput, setQInput] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [meRole, setMeRole] = useState<string | null>(null);
  const [meReady, setMeReady] = useState(false);
  const [createCandidate, setCreateCandidate] = useState<CaseCandidateItem | null>(null);
  const [pageBanner, setPageBanner] = useState('');
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (nextOffset: number, q: string) => {
    const requestId = ++generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');
    setErrorMessage('');

    try {
      const data = await fetchCaseCandidates(
        { q: q.trim() || null, limit: PAGE_LIMIT, offset: nextOffset },
        { signal: controller.signal },
      );
      if (requestId !== generationRef.current) return;
      setItems(data.items);
      setHasMore(data.hasMore);
      setOffset(data.offset);
      setStatus('ready');
    } catch (error) {
      if (requestId !== generationRef.current) return;
      if (error instanceof CaseApiError && error.status === 401) {
        setErrorMessage('登录状态已失效，请重新登录。');
      } else if (error instanceof CaseApiError && error.status === 403) {
        setErrorMessage('无权限访问管理功能');
      } else {
        setErrorMessage('待整理列表加载失败，请稍后重试。');
      }
      setItems([]);
      setHasMore(false);
      setStatus('error');
    } finally {
      if (requestId === generationRef.current) abortRef.current = null;
    }
  }, []);

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
    void load(0, '');
    return () => {
      generationRef.current += 1;
      abortRef.current?.abort();
    };
  }, [load]);

  function submitSearch() {
    setAppliedQ(qInput.trim());
    void load(0, qInput);
  }

  function refreshList() {
    setPageBanner('');
    void load(offset, appliedQ);
  }

  function goPrevious() {
    if (offset > 0) void load(offset - PAGE_LIMIT, appliedQ);
  }

  function goNext() {
    if (hasMore) void load(offset + PAGE_LIMIT, appliedQ);
  }

  function handleCreated(result: CaseMutationResult) {
    setCreateCandidate(null);
    router.push(`/review-center/cases/${encodeURIComponent(result.caseNo)}/manage`);
  }

  function handleClosedError(message: string) {
    setCreateCandidate(null);
    setPageBanner(message);
  }

  const loading = status === 'loading';
  const noPermission = meReady && !canManageCaseRole(meRole);

  return (
    <AppLayout>
      <PageHeader
        title="待整理案例"
        description="查看已关闭的项目复盘，并将有复用价值的内容整理为正式案例。"
      />

      {noPermission || (status === 'error' && errorMessage === '无权限访问管理功能') ? (
        <ReviewCenterEmpty
          title="无权限访问管理功能"
          description="只有管理员或经理可以整理案例。"
          action={{ label: '返回案例中心', href: '/review-center/cases' }}
        />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
            <div className="min-w-[240px] flex-1">
              <label htmlFor="candidate-search" className="mb-1 block text-xs text-gray-500">搜索</label>
              <div className="flex gap-2">
                <input
                  id="candidate-search"
                  aria-label="搜索已关闭复盘"
                  value={qInput}
                  onChange={event => setQInput(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') submitSearch();
                  }}
                  placeholder="复盘编号"
                  className="input-field flex-1"
                />
                <button type="button" className="btn-secondary whitespace-nowrap" onClick={submitSearch}>
                  搜索
                </button>
              </div>
            </div>
          </div>

          {pageBanner && (
            <div className="mb-4 rounded-md bg-yellow-50 p-4 text-sm text-yellow-800">
              <p>{pageBanner}</p>
              <button type="button" className="btn-secondary mt-3" onClick={refreshList}>
                刷新列表
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
              <p>{errorMessage}</p>
              <button
                type="button"
                className="btn-secondary mt-3"
                disabled={loading}
                onClick={() => void load(offset, appliedQ)}
              >
                重新加载
              </button>
            </div>
          )}

          {loading && items.length === 0 && !errorMessage ? (
            <div className="space-y-2" aria-busy="true" aria-label="待整理案例加载中">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="h-14 animate-pulse rounded-lg border border-gray-100 bg-gray-50" />
              ))}
            </div>
          ) : items.length === 0 && status === 'ready' ? (
            <ReviewCenterEmpty
              title="当前没有已关闭的复盘"
              description="已关闭复盘将在这里集中展示，供整理为案例。"
            />
          ) : items.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm" aria-busy={loading}>
                  <thead className="bg-gray-50 text-left text-gray-500">
                    <tr>
                      <th className="w-[170px] px-4 py-3">复盘编号</th>
                      <th className="w-[70px] px-4 py-3">类型</th>
                      <th className="w-[80px] px-4 py-3">风险</th>
                      <th className="w-[150px] px-4 py-3">发生时间</th>
                      <th className="px-4 py-3">分类摘要</th>
                      <th className="w-[180px] px-4 py-3">案例状态</th>
                      <th className="w-[130px] px-4 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(candidate => {
                      const existing = candidate.existingCase;
                      return (
                        <tr key={candidate.sourceReviewId} className="border-t border-gray-100 align-top hover:bg-gray-50">
                          <td className="whitespace-nowrap px-4 py-3">
                            <Link
                              href={`/review-center/reviews/${encodeURIComponent(candidate.sourceReviewId)}`}
                              className="text-blue-600 no-underline"
                            >
                              {candidate.reviewNo}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {caseReviewTypeLabel(candidate.reviewType)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={caseRiskBadgeClass(candidate.risk)}>
                              {caseRiskLabel(candidate.risk)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                            {formatCaseDateTime(candidate.occurredAt)}
                          </td>
                          <td className="px-4 py-3">
                            <MetadataSummaryTags candidate={candidate} />
                          </td>
                          <td className="px-4 py-3">
                            {existing ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Link
                                  href={`/review-center/cases/${encodeURIComponent(existing.caseNo)}/manage`}
                                  className="text-blue-600 no-underline"
                                >
                                  {existing.caseNo}
                                </Link>
                                <span className="badge-gray">{caseStatusLabel(existing.status)}</span>
                                {existing.isSourceChanged && (
                                  <span className="badge-yellow">来源已变化</span>
                                )}
                              </div>
                            ) : (
                              <span className="badge-gray">待整理</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {existing ? (
                              <Link
                                href={`/review-center/cases/${encodeURIComponent(existing.caseNo)}/manage`}
                                className="text-blue-600 no-underline"
                              >
                                管理案例
                              </Link>
                            ) : (
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={loading}
                                onClick={() => setCreateCandidate(candidate)}
                              >
                                整理为案例
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                <span className="text-xs text-gray-500">
                  {loading ? '加载中...' : `第 ${offset / PAGE_LIMIT + 1} 页`}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={offset === 0 || loading}
                    onClick={goPrevious}
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!hasMore || loading}
                    onClick={goNext}
                  >
                    下一页
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {createCandidate && (
        <CaseCreateDialog
          candidate={createCandidate}
          onClose={() => setCreateCandidate(null)}
          onCreated={handleCreated}
          onClosedError={handleClosedError}
        />
      )}
    </AppLayout>
  );
}
