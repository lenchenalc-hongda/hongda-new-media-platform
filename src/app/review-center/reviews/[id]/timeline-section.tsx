'use client';
import { useEffect, useRef, useState } from 'react';
import type { TimelineItemDTO, TimelinePageInfo } from '@/lib/review-center/timeline';
import {
  INITIAL_TIMELINE_SECTION_STATE,
  TimelineSectionController,
  formatTimelineEvent,
  formatTimelineTimestamp,
  timelineErrorMessage,
  type TimelinePageFetchResult,
  type TimelineSectionState,
} from '@/lib/review-center/timeline-presentation';

export default function TimelineSection({
  reviewId,
  refreshKey = 0,
}: {
  reviewId: string;
  refreshKey?: number;
}) {
  const [view, setView] = useState<TimelineSectionState>(INITIAL_TIMELINE_SECTION_STATE);
  const controllerRef = useRef<TimelineSectionController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new TimelineSectionController({
      fetchPage: async (input): Promise<TimelinePageFetchResult> => {
        const response = await fetch(
          `/api/review-center/reviews/${encodeURIComponent(input.reviewId)}/timeline?limit=${input.limit}&offset=${input.offset}`,
        );
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        const payload =
          body && typeof body === 'object'
            ? (body as Record<string, unknown>)
            : null;
        const apiData =
          payload?.data && typeof payload.data === 'object'
            ? (payload.data as Record<string, unknown>)
            : null;
        const items = Array.isArray(apiData?.items)
          ? (apiData.items as TimelineItemDTO[])
          : undefined;
        const pageInfo =
          apiData?.pageInfo && typeof apiData.pageInfo === 'object'
            ? (apiData.pageInfo as TimelinePageInfo)
            : undefined;
        return {
          status: response.status,
          ok:
            response.ok
            && payload?.ok === true
            && Array.isArray(items)
            && Boolean(pageInfo),
          items,
          pageInfo,
        };
      },
      onStateChange: next => setView(next),
    });
  }

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.start(reviewId);
    return () => controller.invalidate();
  }, [reviewId, refreshKey]);

  const controller = controllerRef.current;

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="font-medium text-gray-800">项目动态</h2>
      <p className="mt-1 text-sm text-gray-400 mb-4">记录本复盘的重要创建、修改和人员调整。</p>

      {view.status === 'loading' && (
        <p className="py-8 text-center text-sm text-gray-500">正在加载项目动态…</p>
      )}

      {view.status === 'error' && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-600">
            {timelineErrorMessage(view.initialErrorStatus ?? 500)}
          </p>
          <button
            type="button"
            onClick={() => controller?.retryInitial()}
            className="mt-3 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            重新加载
          </button>
        </div>
      )}

      {view.status === 'ready' && view.items.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-600">暂无项目动态</p>
          <p className="mt-1 text-xs text-gray-400">后续的重要修改和人员调整会记录在这里。</p>
        </div>
      )}

      {view.status === 'ready' && view.items.length > 0 && (
        <>
          <ol className="relative ml-2 border-l border-gray-200">
            {view.items.map(item => {
              const event = formatTimelineEvent(item);
              return (
                <li key={item.id} className="relative pl-5 pb-5 last:pb-0">
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1.5 h-2 w-2 -translate-x-1/2 rounded-full bg-gray-300"
                  />
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
                    {formatTimelineTimestamp(item.createdAt)}
                  </p>
                </li>
              );
            })}
          </ol>
          {view.pageInfo?.hasMore && (
            <div className="mt-5">
              {view.loadMoreError && (
                <p className="mb-2 text-sm text-gray-500">更多动态加载失败，请重试。</p>
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
