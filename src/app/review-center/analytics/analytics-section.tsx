'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AnalyticsMonthBucket,
  AnalyticsRange,
  AnalyticsSnapshot,
} from '@/lib/review-center/analytics';
import {
  AnalyticsClientError,
  fetchAnalyticsSnapshot,
} from '@/lib/review-center/analytics-client';
import {
  ANALYTICS_RANGE_LABELS,
  analyticsBarPercent,
  formatAnalyticsCycleSampleCount,
  formatAnalyticsDays,
  formatAnalyticsInvalidCycleDisclosure,
  formatAnalyticsMonthLabel,
  formatAnalyticsRangeLabel,
  getActionFlowModuleCopy,
  getAnalyticsDataCompletenessCopy,
  getCycleModuleCopy,
  getReviewFlowModuleCopy,
  hasAnalyticsData,
} from '@/lib/review-center/analytics-presentation';

const RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: 'LAST_6_MONTHS', label: ANALYTICS_RANGE_LABELS.LAST_6_MONTHS },
  { value: 'LAST_12_MONTHS', label: ANALYTICS_RANGE_LABELS.LAST_12_MONTHS },
  { value: 'THIS_YEAR', label: ANALYTICS_RANGE_LABELS.THIS_YEAR },
];

type LoadStatus = 'loading' | 'ready' | 'error';
type ErrorKind = 'general' | 'forbidden' | 'unauthorized';

export default function AnalyticsSection() {
  const [data, setData] = useState<AnalyticsSnapshot | null>(null);
  const [loadedRange, setLoadedRange] = useState<AnalyticsRange>('LAST_6_MONTHS');
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (range: AnalyticsRange) => {
    const requestId = ++generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');
    setErrorKind(null);

    try {
      const next = await fetchAnalyticsSnapshot(range, { signal: controller.signal });
      if (requestId !== generationRef.current) return;
      setData(next);
      setLoadedRange(next.range);
      setStatus('ready');
      setRefreshedAt(formatRefreshTime(new Date()));
    } catch (error) {
      if (requestId !== generationRef.current) return;
      if (error instanceof AnalyticsClientError && error.status === 401) {
        setData(null);
        setErrorKind('unauthorized');
      } else if (error instanceof AnalyticsClientError && error.status === 403) {
        setData(null);
        setErrorKind('forbidden');
      } else {
        setErrorKind('general');
      }
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load('LAST_6_MONTHS');
    return () => {
      generationRef.current += 1;
      abortRef.current?.abort();
    };
  }, [load]);

  function handleRefresh() {
    void load(data?.range ?? loadedRange);
  }

  const displayRange = data?.range ?? loadedRange;
  const errorMessage = errorKind === 'unauthorized'
    ? '登录状态已失效，请重新登录。'
    : errorKind === 'forbidden'
      ? '无权查看分析数据'
      : '分析数据加载失败，请重试';

  return (
    <section className="mt-8" aria-label="分析中心">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          {refreshedAt && <span className="text-xs text-gray-400">{refreshedAt}</span>}
          <button
            type="button"
            className="btn-secondary"
            disabled={status === 'loading'}
            onClick={handleRefresh}
          >
            刷新
          </button>
        </div>
      </div>

      <div className="flex rounded-md border border-gray-200 bg-gray-50 p-0.5 mb-6 w-fit">
        {RANGE_OPTIONS.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => void load(option.value)}
            className={`px-3 py-1.5 text-sm rounded ${
              displayRange === option.value
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {status === 'error' && !data && (
        <div className="bg-white border border-red-200 rounded-lg p-6">
          <p className="text-red-700 font-medium">{errorMessage}</p>
          <button type="button" className="btn-secondary mt-3" onClick={() => void load(displayRange)}>
            重试
          </button>
        </div>
      )}

      {status === 'loading' && !data && <AnalyticsSkeleton />}

      {status === 'error' && data && errorKind === 'general' && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {data && (
        <>
          <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {getAnalyticsDataCompletenessCopy()}
          </div>

          {!hasAnalyticsData(data) ? (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
              <p className="text-gray-600 font-medium">该期间暂无分析数据</p>
            </div>
          ) : (
            <div className="space-y-6">
              <ReviewFlowModule snapshot={data} />
              <ActionFlowModule snapshot={data} />
              <CycleModule snapshot={data} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ReviewFlowModule({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const copy = getReviewFlowModuleCopy();
  const max = Math.max(
    0,
    ...snapshot.buckets.map(bucket => Math.max(bucket.reviewsCreated, bucket.reviewsClosedUnique)),
  );
  const hasData = snapshot.summary.reviewsCreatedTotal > 0
    || snapshot.summary.reviewsClosedUniqueInRange > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="font-semibold text-gray-800">{copy.title}</h3>
      <p className="text-sm text-gray-500 mt-1">{copy.description}</p>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700">
        <span>期间新建复盘：{snapshot.summary.reviewsCreatedTotal}</span>
        <span>期间关闭过的复盘：{snapshot.summary.reviewsClosedUniqueInRange}</span>
      </div>
      <p className="mt-2 text-xs text-gray-500">{copy.closeDefinition}</p>
      <p className="mt-1 text-xs text-gray-400">{copy.crossBucketNote}</p>

      {!hasData ? (
        <p className="mt-4 text-sm text-gray-500">该期间暂无复盘流转数据</p>
      ) : (
        <div className="mt-4 space-y-3">
          {snapshot.buckets.map(bucket => (
            <div key={bucket.period} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-gray-600">
                {formatAnalyticsMonthLabel(bucket.period)}
              </span>
              <div className="flex-1 space-y-1">
                <SeriesBar
                  label={copy.createdLabel}
                  value={bucket.reviewsCreated}
                  max={max}
                />
                <SeriesBar
                  label={copy.closedLabel}
                  value={bucket.reviewsClosedUnique}
                  max={max}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionFlowModule({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const copy = getActionFlowModuleCopy();
  const max = Math.max(
    0,
    ...snapshot.buckets.map(bucket => Math.max(bucket.actionsCreated, bucket.actionsVerified)),
  );
  const hasData = snapshot.summary.actionsCreatedTotal > 0
    || snapshot.summary.actionsVerifiedTotal > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="font-semibold text-gray-800">{copy.title}</h3>
      <p className="text-sm text-gray-500 mt-1">{copy.description}</p>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700">
        <span>期间新建改善行动：{snapshot.summary.actionsCreatedTotal}</span>
        <span>期间验证通过：{snapshot.summary.actionsVerifiedTotal}</span>
      </div>
      <p className="mt-2 text-xs text-gray-500">{copy.verifiedDefinition}</p>

      {!hasData ? (
        <p className="mt-4 text-sm text-gray-500">暂无改善行动趋势数据</p>
      ) : (
        <div className="mt-4 space-y-3">
          {snapshot.buckets.map(bucket => (
            <div key={bucket.period} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-gray-600">
                {formatAnalyticsMonthLabel(bucket.period)}
              </span>
              <div className="flex-1 space-y-1">
                <SeriesBar
                  label={copy.createdLabel}
                  value={bucket.actionsCreated}
                  max={max}
                />
                <SeriesBar
                  label={copy.verifiedLabel}
                  value={bucket.actionsVerified}
                  max={max}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CycleModule({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const copy = getCycleModuleCopy();
  const max = Math.max(
    0,
    ...snapshot.buckets.map(bucket => bucket.verificationMedianDays ?? 0),
  );
  const summaryMedian = snapshot.summary.verificationMedianDays;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="font-semibold text-gray-800">{copy.title}</h3>
      <p className="text-sm text-gray-500 mt-1">{copy.description}</p>
      <p className="mt-2 text-xs text-gray-500">{copy.elapsedDefinition}</p>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700">
        <span>
          期间验证周期中位数：
          {summaryMedian === null ? '暂无有效样本' : formatAnalyticsDays(summaryMedian)}
        </span>
        <span>{formatAnalyticsCycleSampleCount(snapshot.summary.verificationCycleSampleCount)}</span>
      </div>

      {snapshot.summary.verificationCycleSampleCount === 0 ? (
        <p className="mt-4 text-sm text-gray-500">暂无有效验证周期数据</p>
      ) : (
        <div className="mt-4 space-y-2">
          {snapshot.buckets.map(bucket => {
            const median = bucket.verificationMedianDays;
            const percent = analyticsBarPercent(median ?? 0, max);
            return (
              <div key={bucket.period} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-xs text-gray-600">
                  {formatAnalyticsMonthLabel(bucket.period)}
                </span>
                <span className="w-20 shrink-0 text-right text-sm text-gray-700">
                  {median === null ? '—' : formatAnalyticsDays(median)}
                </span>
                <div className="h-2 flex-1 rounded bg-gray-100 overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${percent}%` }} />
                </div>
                <span className="w-28 shrink-0 text-right text-xs text-gray-500">
                  {bucket.verificationCycleSampleCount > 0
                    ? formatAnalyticsCycleSampleCount(bucket.verificationCycleSampleCount)
                    : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {snapshot.summary.invalidCycleRowsExcluded > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          {formatAnalyticsInvalidCycleDisclosure(snapshot.summary.invalidCycleRowsExcluded)}
        </p>
      )}
    </div>
  );
}

function SeriesBar({ label, value, max }: { label: string; value: number; max: number }) {
  const percent = analyticsBarPercent(value, max);
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-xs text-gray-600">{label}</span>
      <div className="h-2 flex-1 rounded bg-gray-100 overflow-hidden">
        <div className="h-full bg-blue-500" style={{ width: `${percent}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-xs text-gray-600">{value}</span>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="card animate-pulse">
          <div className="h-5 w-40 rounded bg-gray-200" />
          <div className="mt-3 h-4 w-72 rounded bg-gray-100" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 4 }, (_, row) => (
              <div key={row} className="flex items-center gap-2">
                <div className="h-3 w-20 rounded bg-gray-100" />
                <div className="h-3 flex-1 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRefreshTime(value: Date): string {
  const time = value.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `最后刷新 ${time}`;
}
