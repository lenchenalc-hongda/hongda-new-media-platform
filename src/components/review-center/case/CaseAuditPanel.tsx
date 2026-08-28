'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  appendAuditItems,
  canCommitAuditResponse,
  canReleaseAuditRequest,
  nextAuditOffset,
  planAuditRequest,
  shouldRefetchAuditPage1,
  type AuditInflightRequest,
  type AuditRequestKind,
} from '@/lib/review-center/case-audit';
import { fetchCaseAudit } from '@/lib/review-center/case-api-client';
import {
  caseAuditActionLabel,
  caseAuditVersionLabel,
  caseStatusLabel,
  formatCaseDateTime,
} from '@/lib/review-center/case-presentation';
import type { CaseAuditItem } from '@/lib/review-center/case-schemas';

const AUDIT_PAGE_SIZE = 30;

interface CaseAuditPanelProps {
  caseNo: string | undefined;
  currentCaseVersion: number;
  mutationInFlight: boolean;
}

function AuditItemRow({ item, index }: { item: CaseAuditItem; index: number }) {
  const summary = item.safeChangeSummary;
  const transition = summary.fromStatus !== null || summary.toStatus !== null
    ? `${caseStatusLabel(summary.fromStatus) || '未知状态'} → ${caseStatusLabel(summary.toStatus) || '未知状态'}`
    : null;

  return (
    <li className="rounded-md border border-gray-100 bg-gray-50/60 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-700">
              {caseAuditActionLabel(item.action)}
            </span>
            <span className="text-xs text-gray-500">{formatCaseDateTime(item.createdAt)}</span>
          </div>
          <div className="mt-1.5 text-sm text-gray-700">{item.actorDisplayName}</div>
        </div>
        <span className="text-sm font-medium text-gray-600">
          {caseAuditVersionLabel(item)}
        </span>
      </div>

      {summary.changedFields && summary.changedFields.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {summary.changedFields.map(field => (
            <span
              key={`${index}:${field}`}
              className="rounded bg-white px-1.5 py-0.5 text-[11px] text-gray-500 ring-1 ring-gray-200"
            >
              {field}
            </span>
          ))}
        </div>
      )}

      {(transition || summary.sourceReviewVersion !== null || summary.publishKind !== null) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          {transition && <span>{transition}</span>}
          {summary.sourceReviewVersion !== null && (
            <span>来源版本 v{summary.sourceReviewVersion}</span>
          )}
          {summary.publishKind !== null && <span>{summary.publishKind}</span>}
        </div>
      )}
    </li>
  );
}

export default function CaseAuditPanel({
  caseNo,
  currentCaseVersion,
  mutationInFlight,
}: CaseAuditPanelProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CaseAuditItem[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingPage1, setLoadingPage1] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadedForCaseVersion, setLoadedForCaseVersion] = useState<number | null>(null);

  const latestCaseVersionRef = useRef(currentCaseVersion);
  const previousCaseVersionRef = useRef(currentCaseVersion);
  const auditRequestSeqRef = useRef(0);
  const auditGenerationRef = useRef(0);
  const auditInFlightRef = useRef<AuditInflightRequest | null>(null);

  latestCaseVersionRef.current = currentCaseVersion;

  useEffect(() => {
    const previous = previousCaseVersionRef.current;
    if (previous === currentCaseVersion) return;
    previousCaseVersionRef.current = currentCaseVersion;
    auditGenerationRef.current += 1;
    const current = auditInFlightRef.current;
    if (current) {
      current.controller.abort();
      auditInFlightRef.current = null;
    }
  }, [currentCaseVersion]);

  useEffect(() => {
    return () => {
      auditGenerationRef.current += 1;
      auditInFlightRef.current?.controller.abort();
      auditInFlightRef.current = null;
    };
  }, []);

  const startAuditRequest = useCallback((
    kind: AuditRequestKind,
    offset: number,
  ): boolean => {
    if (!caseNo || mutationInFlight) return false;
    const current = auditInFlightRef.current;
    const plan = planAuditRequest(current?.kind ?? null, kind);
    if (plan === 'BLOCK') return false;
    if (plan === 'SUPERSEDE' && current) {
      auditGenerationRef.current += 1;
      current.controller.abort();
    }

    const capturedCaseVersion = latestCaseVersionRef.current;
    const capturedGeneration = auditGenerationRef.current;
    const requestId = ++auditRequestSeqRef.current;
    const controller = new AbortController();
    auditInFlightRef.current = {
      requestId,
      kind,
      controller,
    };
    if (kind === 'PAGE_1') setLoadingPage1(true);
    if (kind === 'REFRESH') setRefreshing(true);
    if (kind === 'LOAD_MORE') setLoadingMore(true);
    setErrorMessage('');

    void (async () => {
      try {
        if (!caseNo) return;
        const data = await fetchCaseAudit(caseNo, {
          limit: AUDIT_PAGE_SIZE,
          offset,
        }, { signal: controller.signal });
        if (!canCommitAuditResponse(
          capturedCaseVersion,
          latestCaseVersionRef.current,
          capturedGeneration,
          auditGenerationRef.current,
          requestId,
          auditInFlightRef.current?.requestId ?? null,
        )) {
          return;
        }
        setItems(prevItems => {
          if (kind === 'LOAD_MORE') {
            return appendAuditItems(prevItems, data.items);
          }
          return data.items;
        });
        setNextOffset(nextAuditOffset(data.offset, data.items.length));
        setHasMore(data.hasMore);
        setLoadedForCaseVersion(capturedCaseVersion);
        setErrorMessage('');
      } catch {
        if (controller.signal.aborted) return;
        setErrorMessage(kind === 'LOAD_MORE'
          ? '加载更多失败，请重试'
          : '操作记录加载失败，请稍后重试');
      } finally {
        if (canReleaseAuditRequest(
          auditInFlightRef.current?.requestId ?? null,
          requestId,
        )) {
          auditInFlightRef.current = null;
        }
        if (kind === 'PAGE_1') setLoadingPage1(false);
        if (kind === 'REFRESH') setRefreshing(false);
        if (kind === 'LOAD_MORE') setLoadingMore(false);
      }
    })();
    return true;
  }, [caseNo, mutationInFlight]);

  const toggleOpen = useCallback(() => {
    setOpen(prev => {
      const next = !prev;
      if (next && shouldRefetchAuditPage1(loadedForCaseVersion, currentCaseVersion, items)) {
        startAuditRequest('PAGE_1', 0);
      }
      return next;
    });
  }, [currentCaseVersion, items, loadedForCaseVersion, startAuditRequest]);

  const handleRefresh = useCallback(() => {
    startAuditRequest('REFRESH', 0);
  }, [startAuditRequest]);

  const handleLoadMore = useCallback(() => {
    startAuditRequest('LOAD_MORE', nextOffset);
  }, [nextOffset, startAuditRequest]);

  const stale = loadedForCaseVersion !== null && loadedForCaseVersion !== currentCaseVersion;
  const auditPending = auditInFlightRef.current !== null;
  const loadMoreDisabled = !open
    || mutationInFlight
    || !hasMore
    || stale
    || auditPending
    || loadingPage1
    || refreshing
    || loadingMore;

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <button
          type="button"
          className="font-medium text-gray-800"
          aria-expanded={open}
          aria-controls="case-audit-panel-content"
          onClick={toggleOpen}
        >
          操作记录
        </button>
        <span className="text-xs text-gray-400">记录案例整理、发布、隐藏、重新打开等关键操作。</span>
      </div>

      {open && (
        <div
          id="case-audit-panel-content"
          className="border-t border-gray-100 px-5 py-4"
          aria-busy={loadingPage1 || refreshing || loadingMore}
        >
          {stale && (
            <div className="mb-3 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              案例已有新的操作记录，请刷新查看。
            </div>
          )}

          {errorMessage && (
            <div role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          {loadingPage1 || refreshing ? (
            <div className="py-6 text-center text-sm text-gray-400">正在加载操作记录...</div>
          ) : items.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">暂无操作记录</div>
          ) : (
            <ul className="space-y-2">
              {items.map((item, index) => (
                <AuditItemRow key={`${index}:${item.action}:${item.versionAfter}`} item={item} index={index} />
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={mutationInFlight || auditPending || refreshing}
              onClick={handleRefresh}
            >
              {refreshing ? '刷新中...' : '刷新记录'}
            </button>
            {hasMore && (
              <button
                type="button"
                className="btn-secondary"
                disabled={loadMoreDisabled}
                onClick={handleLoadMore}
              >
                {loadingMore ? '加载中...' : '加载更多'}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
