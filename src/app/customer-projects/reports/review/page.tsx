'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { useCanReviewDailyReports } from '@/components/layout/RoleProvider';
import {
  reportMetricLabels,
  reportMetricOrder,
  type DerivedReportPeriod,
} from '@/lib/customer-projects/reports';
import type { SubmittedReportReviewItem } from '@/lib/customer-projects/report-review';
import type { MetricValue } from '@/lib/customer-projects/domain';
import { formatBusinessDateTime } from '@/lib/customer-projects/presentation';

function metricDisplay(metric: MetricValue<number> | undefined): {
  value: string;
  reason: string | null;
} {
  if (!metric) return { value: '未知', reason: '快照未提供此指标' };
  if (metric.state === 'known') {
    return { value: String(metric.value), reason: null };
  }
  return { value: '未知', reason: metric.reason };
}

export default function CustomerProjectReportReviewPage() {
  const canReviewReports = useCanReviewDailyReports();
  const [period, setPeriod] = useState<DerivedReportPeriod>('daily');
  const [reports, setReports] = useState<SubmittedReportReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('period');
    if (requested === 'weekly') setPeriod('weekly');
    if (requested === 'daily') setPeriod('daily');
  }, []);

  useEffect(() => {
    let active = true;

    async function loadReports() {
      if (!canReviewReports) {
        setReports([]);
        setError('你当前没有报告审阅权限。');
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const endpoint = period === 'weekly'
          ? '/api/customer-projects/reports/review/weekly'
          : '/api/customer-projects/reports/review';
        const response = await fetch(endpoint, { cache: 'no-store' });
        const body = await response.json().catch(() => null);
        if (!active) return;

        if (
          response.ok
          && body?.ok === true
          && Array.isArray(body?.data?.reports)
        ) {
          setReports(body.data.reports as SubmittedReportReviewItem[]);
          setError('');
        } else if (response.status === 401) {
          setReports([]);
          setError('登录状态已失效，请重新登录。');
        } else if (response.status === 403) {
          setReports([]);
          setError('你当前没有报告审阅权限。');
        } else {
          setReports([]);
          setError('报告审阅加载失败，请稍后重试。');
        }
      } catch {
        if (active) {
          setReports([]);
          setError('报告审阅加载失败，请稍后重试。');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadReports();
    return () => {
      active = false;
    };
  }, [canReviewReports, period]);

  const periodName = period === 'weekly' ? '周报' : '日报';

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="报告审阅"
          description={`只读查看同组织已提交的${periodName}版本。数字、未知状态和来源游标均以提交快照为准。`}
          actions={(
            <Link
              href="/customer-projects/reports"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 no-underline"
            >
              返回我的报告
            </Link>
          )}
        />

        <div className="flex items-center gap-2 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setPeriod('daily')}
            className={
              period === 'daily'
                ? 'border-b-2 border-cyan-600 px-4 py-2 text-sm font-medium text-cyan-700'
                : 'px-4 py-2 text-sm text-gray-500'
            }
          >
            日报
          </button>
          <button
            type="button"
            onClick={() => setPeriod('weekly')}
            className={
              period === 'weekly'
                ? 'border-b-2 border-cyan-600 px-4 py-2 text-sm font-medium text-cyan-700'
                : 'px-4 py-2 text-sm text-gray-500'
            }
          >
            周报
          </button>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700">
          管理审阅只读。不能代替员工编辑、提交、更正或接受 AI 摘要与工作建议。
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            正在加载已提交{periodName}...
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            title={`还没有可审阅的已提交${periodName}`}
            description={`仅展示同组织的已提交${periodName}，草稿不会出现在这里。`}
          />
        ) : (
          <div className="space-y-4">
            {reports.map(report => {
              const metricOrder = reportMetricOrder(report.periodType);
              const metricLabels = reportMetricLabels(report.periodType);

              return (
              <article
                key={report.id}
                className="rounded-lg border border-gray-200 bg-white p-5"
              >
                <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-gray-800">
                        {report.periodStart}
                        {report.periodType === 'weekly'
                          ? ` 至 ${report.periodEnd} · `
                          : ' · '}
                        {report.subject.displayName}
                      </h2>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        已提交
                      </span>
                      <span className="text-xs text-gray-400">
                        Revision {report.revisionNo}
                      </span>
                      {report.supersedesReportId && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                          更正版
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                      {report.subject.department && (
                        <span>部门：{report.subject.department}</span>
                      )}
                      <span>
                        员工状态：
                        {report.subject.isActive === false
                          ? '已停用'
                          : report.subject.isActive === true
                            ? '有效'
                            : '未知'}
                      </span>
                      <span>提交：{formatBusinessDateTime(report.submittedAt)}</span>
                      <span>指标版本：v{report.metricsSchemaVersion}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {metricOrder.map(key => {
                    const display = metricDisplay(report.deterministicMetrics[key]);
                    return (
                      <div
                        key={key}
                        className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                      >
                        <p className="text-[11px] leading-4 text-gray-500">
                          {metricLabels[key] ?? key}
                        </p>
                        <p className="mt-1 text-xl font-semibold text-gray-800">
                          {display.value}
                        </p>
                        {display.reason && (
                          <p className="mt-1 text-[10px] leading-4 text-amber-700">
                            {display.reason}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <details className="mt-4 rounded-lg border border-gray-200 bg-gray-50">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700">
                    查看摘要、来源与未知项
                  </summary>
                  <div className="space-y-4 border-t border-gray-200 px-4 py-4">
                    <div>
                      <p className="text-xs font-medium text-gray-600">正式摘要</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                        {report.narrative || '员工尚未接受正式摘要。'}
                      </p>
                    </div>

                    <div className="grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
                      <p>Event cursor：{report.sourceEventSeq ?? '-'}</p>
                      <p>Audit cursor：{report.sourceAuditSeq ?? '-'}</p>
                      <p>报告版本：{report.version}</p>
                      <p>
                        更正来源：
                        {report.supersedesReportId
                          ? report.supersedesReportId
                          : '无'}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-gray-600">未知项与覆盖</p>
                      {report.unknowns.length > 0 ? (
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-5 text-amber-700">
                          {JSON.stringify(report.unknowns, null, 2)}
                        </pre>
                      ) : (
                        <p className="mt-2 text-xs text-gray-400">无显式未知项</p>
                      )}
                    </div>
                  </div>
                </details>
              </article>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
