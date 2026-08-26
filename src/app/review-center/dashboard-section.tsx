'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type {
  DashboardRange,
  DashboardSnapshot,
  DistributionBucket,
} from '@/lib/review-center/dashboard';
import {
  DashboardClientError,
  fetchDashboardSnapshot,
} from '@/lib/review-center/dashboard-client';
import {
  DASHBOARD_RANGE_LABELS,
  dashboardDistributionPercentage,
  formatDashboardAttentionReasonLabel,
  formatDashboardOwnerDisplayName,
  formatDashboardRangeLabel,
  formatDashboardRefreshTime,
  formatDashboardRiskLabel,
  formatDashboardStatusLabel,
  formatDashboardTypeLabel,
  getAttentionCountLabels,
  getDashboardMetricDefinition,
  getPeriodKpiLabels,
} from '@/lib/review-center/dashboard-presentation';

const RANGE_OPTIONS: Array<{ value: DashboardRange; label: string }> = [
  { value: 'THIS_MONTH', label: DASHBOARD_RANGE_LABELS.THIS_MONTH },
  { value: 'LAST_30_DAYS', label: DASHBOARD_RANGE_LABELS.LAST_30_DAYS },
  { value: 'ALL', label: DASHBOARD_RANGE_LABELS.ALL },
];

type LoadStatus = 'loading' | 'ready' | 'error';
type ErrorKind = 'general' | 'forbidden' | 'unauthorized';

export default function DashboardSection() {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [loadedRange, setLoadedRange] = useState<DashboardRange>('THIS_MONTH');
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (range: DashboardRange) => {
    const requestId = ++generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');
    setErrorKind(null);

    try {
      const next = await fetchDashboardSnapshot(range, { signal: controller.signal });
      if (requestId !== generationRef.current) return;
      setData(next);
      setLoadedRange(next.period.range);
      setStatus('ready');
      setRefreshedAt(formatDashboardRefreshTime(new Date()));
    } catch (error) {
      if (requestId !== generationRef.current) return;
      if (error instanceof DashboardClientError && error.status === 401) {
        setData(null);
        setErrorKind('unauthorized');
      } else if (error instanceof DashboardClientError && error.status === 403) {
        setData(null);
        setErrorKind('forbidden');
      } else {
        setErrorKind('general');
      }
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load('THIS_MONTH');
    return () => {
      generationRef.current += 1;
      abortRef.current?.abort();
    };
  }, [load]);

  function handleRefresh() {
    void load(data?.period.range ?? loadedRange);
  }

  const displayRange = data?.period.range ?? loadedRange;
  const periodLabels = getPeriodKpiLabels(displayRange);
  const errorMessage = errorKind === 'unauthorized'
    ? '登录状态已失效，请重新登录。'
    : errorKind === 'forbidden'
      ? '无权查看管理概览'
      : '管理概览加载失败，请重试';

  return (
    <section className="mt-8" aria-label="管理概览">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">管理概览</h2>
          <p className="text-sm text-gray-500 mt-1">复盘风险、改善行动和当前需要关注事项</p>
        </div>
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

      {status === 'error' && !data && (
        <div className="bg-white border border-red-200 rounded-lg p-6">
          <p className="text-red-700 font-medium">{errorMessage}</p>
          <button type="button" className="btn-secondary mt-3" onClick={() => void load(displayRange)}>
            重试
          </button>
        </div>
      )}

      {status === 'loading' && !data && <DashboardSkeleton />}

      {status === 'error' && data && errorKind === 'general' && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {data && (
        <>
          <div className="mb-8">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="font-semibold text-gray-800">当前状态</h3>
                <p className="text-xs text-gray-400 mt-0.5">不受时间范围影响</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              <KpiCard
                label="当前开放复盘"
                value={data.current.openReviews}
                description={getDashboardMetricDefinition('openReviews')}
              />
              <KpiCard
                label="当前高风险复盘"
                value={data.current.highRiskReviews}
                description={getDashboardMetricDefinition('highRiskReviews')}
                accent="red"
              />
              <KpiCard
                label="未闭环改善行动"
                value={data.current.openActions}
                description={getDashboardMetricDefinition('openActions')}
              />
              <KpiCard
                label="逾期改善行动"
                value={data.current.overdueActions}
                description={getDashboardMetricDefinition('overdueActions')}
                accent="amber"
              />
              <KpiCard
                label="待验证改善行动"
                value={data.current.pendingVerificationActions}
                description={getDashboardMetricDefinition('pendingVerificationActions')}
              />
            </div>
          </div>

          <div className="mb-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="font-semibold text-gray-800">期间概览</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  当前口径：{formatDashboardRangeLabel(displayRange)}
                  {status === 'loading' ? ' · 刷新中...' : ''}
                </p>
              </div>
              <div className="flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
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
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <KpiCard
                label={periodLabels.created}
                value={data.period.reviewsCreated}
                description={getDashboardMetricDefinition('reviewsCreated')}
              />
              <KpiCard
                label={periodLabels.closed}
                value={data.period.reviewsClosedUnique}
                description={getDashboardMetricDefinition('reviewsClosedUnique')}
              />
              <KpiCard
                label={periodLabels.verified}
                value={data.period.actionsVerified}
                description={getDashboardMetricDefinition('actionsVerified')}
              />
            </div>
          </div>

          <div className="mb-8 bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-800">需要关注</h3>
                <p className="text-xs text-gray-400 mt-0.5">优先显示高风险、逾期和待验证事项</p>
              </div>
              <span className="text-xs text-gray-500">共 {data.attention.total} 项</span>
            </div>

            {data.attention.items.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">当前没有需要重点关注的复盘</p>
            ) : (
              <div className="mt-3 divide-y divide-gray-100">
                {data.attention.items.map(item => (
                  <Link
                    key={item.reviewId}
                    href={`/review-center/reviews/${encodeURIComponent(item.reviewId)}`}
                    className="flex flex-col md:flex-row md:items-center gap-3 py-3 no-underline hover:bg-gray-50 -mx-3 px-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">{item.reviewNo}</span>
                        <span className="text-xs text-gray-400">
                          {formatDashboardStatusLabel(item.status)}
                          {' · '}
                          {formatDashboardRiskLabel(item.riskLevel)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1 break-words">{item.title}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        负责人 {formatDashboardOwnerDisplayName(item.ownerDisplayName)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {item.attentionReasons.map(reason => (
                        <span
                          key={reason}
                          className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700"
                        >
                          {formatDashboardAttentionReasonLabel(reason)}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                      {getAttentionCountLabels(item).map(label => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                    <span className="text-gray-400">›</span>
                  </Link>
                ))}
              </div>
            )}

            {data.attention.total > data.attention.items.length && (
              <p className="mt-3 text-xs text-gray-500">
                当前显示优先级最高的前10项，共{data.attention.total}项
              </p>
            )}
          </div>

          <div className="mb-4">
            <h3 className="font-semibold text-gray-800 mb-1">当前分布</h3>
            <p className="text-xs text-gray-400 mb-3">当前状态分布，不随期间筛选变化</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DistributionCard
                title="风险分布"
                buckets={data.distributions.risk}
                labelFormatter={formatDashboardRiskLabel}
              />
              <DistributionCard
                title="类型分布"
                buckets={data.distributions.type}
                labelFormatter={formatDashboardTypeLabel}
              />
              <DistributionCard
                title="状态分布"
                buckets={data.distributions.status}
                labelFormatter={formatDashboardStatusLabel}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function KpiCard({
  label,
  value,
  description,
  accent,
}: {
  label: string;
  value: number;
  description: string;
  accent?: 'red' | 'amber';
}) {
  const accentClass = accent === 'red'
    ? 'border-l-4 border-l-red-400'
    : accent === 'amber'
      ? 'border-l-4 border-l-amber-400'
      : '';
  const valueClass = accent === 'red'
    ? 'text-red-700'
    : accent === 'amber'
      ? 'text-amber-700'
      : 'text-gray-900';
  return (
    <div className={`card ${accentClass}`}>
      <p className={`text-2xl font-semibold ${valueClass}`}>{value}</p>
      <p className="mt-1 text-sm font-medium text-gray-700">{label}</p>
      <p className="mt-1 text-xs text-gray-400">{description}</p>
    </div>
  );
}

function DistributionCard({
  title,
  buckets,
  labelFormatter,
}: {
  title: string;
  buckets: DistributionBucket[];
  labelFormatter: (key: string) => string;
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  return (
    <div className="card">
      <h4 className="font-semibold text-gray-800 mb-1">{title}</h4>
      <p className="text-xs text-gray-400 mb-3">当前状态分布，不随期间筛选变化</p>
      {total === 0 ? (
        <p className="text-sm text-gray-500">暂无复盘数据。</p>
      ) : (
        <div className="space-y-2">
          {buckets.map(bucket => {
            const percentage = dashboardDistributionPercentage(bucket.count, total);
            return (
              <div key={bucket.key} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-xs text-gray-600">
                  {labelFormatter(bucket.key)}
                </span>
                <div className="h-2 flex-1 rounded bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs text-gray-500">{bucket.count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="card animate-pulse">
            <div className="h-8 w-16 rounded bg-gray-200" />
            <div className="mt-3 h-4 w-28 rounded bg-gray-200" />
            <div className="mt-2 h-3 w-36 rounded bg-gray-100" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="card animate-pulse">
            <div className="h-8 w-16 rounded bg-gray-200" />
            <div className="mt-3 h-4 w-32 rounded bg-gray-200" />
            <div className="mt-2 h-3 w-40 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
