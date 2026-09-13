'use client';
import { useEffect, useRef, useState } from 'react';
import {
  parseAuditPageResponse,
  type AuditLogDTO,
  type AuditPageInfo,
} from '@/lib/review-center/audit';
import {
  AuditSectionController,
  INITIAL_AUDIT_SECTION_STATE,
  auditErrorMessage,
  canViewManagementAudit,
  formatAuditEvent,
  formatAuditTimestamp,
  formatAuditVersion,
  type AuditPageFetchResult,
  type AuditSectionState,
} from '@/lib/review-center/audit-presentation';

export default function AuditSection({
  reviewId,
  currentRole,
}: {
  reviewId: string;
  currentRole: string | null;
}) {
  const [view, setView] = useState<AuditSectionState>({
    ...INITIAL_AUDIT_SECTION_STATE,
  });
  const controllerRef = useRef<AuditSectionController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new AuditSectionController({
      fetchPage: async (input): Promise<AuditPageFetchResult> => {
        const response = await fetch(
          `/api/review-center/reviews/${encodeURIComponent(input.reviewId)}/audit-logs?limit=${input.limit}&offset=${input.offset}`,
        );
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        return parseAuditPageResponse(body, response.status);
      },
      onStateChange: next => setView(next),
    });
  }

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.start(reviewId);
    return () => controller.invalidate();
  }, [reviewId]);

  if (!canViewManagementAudit(currentRole)) return null;

  const controller = controllerRef.current;

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-6">
      <button
        type="button"
        onClick={() => controller?.toggleExpanded()}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={view.expanded}
      >
        <span>
          <span className="font-medium text-gray-800">管理日志</span>
          <span className="mt-1 block text-sm text-gray-400">
            记录关键数据修改与版本变化，仅管理人员可见
          </span>
        </span>
        <span className="text-sm text-gray-400">{view.expanded ? '收起' : '展开'}</span>
      </button>

      {view.expanded && view.status === 'loading' && (
        <p className="py-8 text-center text-sm text-gray-500">正在加载管理日志…</p>
      )}

      {view.expanded && view.status === 'error' && (
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-600">{auditErrorMessage(view.initialErrorStatus ?? 500)}</p>
          <button
            type="button"
            onClick={() => controller?.retryInitial()}
            className="mt-3 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            重新加载
          </button>
        </div>
      )}

      {view.expanded && view.status === 'ready' && view.items.length === 0 && (
        <div className="mt-4 py-8 text-center">
          <p className="text-sm text-gray-600">暂无管理日志</p>
        </div>
      )}

      {view.expanded && view.status === 'ready' && view.items.length > 0 && (
        <>
          <ol className="mt-4 divide-y divide-gray-100">
            {view.items.map((item: AuditLogDTO) => {
              const event = formatAuditEvent(item);
              return (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-gray-800">{event.actorLabel}</span>
                    {event.actorRoleLabel && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                        {event.actorRoleLabel}
                      </span>
                    )}
                    {event.actorStateLabel && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400">
                        {event.actorStateLabel}
                      </span>
                    )}
                    <span className="text-sm text-gray-600">{event.title}</span>
                  </div>
                  {event.summaryItems.length > 0 && (
                    <p className="mt-1 text-sm text-gray-500">
                      {event.summaryItems.join(' · ')}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    {formatAuditVersion(item.versionBefore, item.versionAfter)}
                    {item.createdAt ? ` · ${formatAuditTimestamp(item.createdAt)}` : ''}
                  </p>
                </li>
              );
            })}
          </ol>
          {view.pageInfo?.hasMore && (
            <div className="mt-5">
              {view.loadMoreError && (
                <p className="mb-2 text-sm text-gray-500">更多日志加载失败，请重试。</p>
              )}
              <button
                type="button"
                onClick={() => controller?.loadMore()}
                disabled={view.loadMoreInFlight}
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {view.loadMoreInFlight ? '加载中…' : '加载更多'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
