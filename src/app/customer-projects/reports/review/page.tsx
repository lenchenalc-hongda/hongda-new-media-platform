'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { useCanReviewDailyReports } from '@/components/layout/RoleProvider';
import {
  DAILY_REPORT_METRIC_LABELS,
  DAILY_REPORT_METRIC_ORDER,
} from '@/lib/customer-projects/reports';
import type { SubmittedDailyReportReviewItem } from '@/lib/customer-projects/report-review';
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
  const canReviewDailyReports = useCanReviewDailyReports();
  const [reports, setReports] = useState<SubmittedDailyReportReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadReports() {
      if (!canReviewDailyReports) {
        setReports([]);
        setError('你当前没有日报审阅权限。');
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(
          '/api/customer-projects/reports/review',
          { cache: 'no-store' },
        );
        const body = await response.json().catch(() => null);
        if (!active) return;

        if (
          response.ok
          && body?.ok === true
          && Array.isArray(body?.data?.reports)
        ) {
          setReports(body.data.reports as SubmittedDailyReportReviewItem[]);
          setError('');
        } else if (response.status === 401) {
          setReports([]);
          setError('登录状态已失效，请重新登录。');
        } else if (response.status === 403) {
          setReports([]);
          setError('你当前没有日报审阅权限。');
        } else {
          setReports([]);
          setError('日报审阅加载失败，请稍后重试。');
        }
      } catch {
        if (active) {
          setReports([]);
          setError('日报审阅加载失败，请稍后重试。');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadReports();
    return () => {
      active = false;
    };
  }, [canReviewDailyReports]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="日报审阅"
          description="只读查看同组织已提交的日报版本。数字、未知状态和来源游标均以提交快照为准。"
          actions={(
            <Link
              href="/customer-projects/reports"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 no-underline"
            >
              返回我的报告
            </Link>
          )}
        />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            正在加载已提交日报...
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            title="还没有可审阅的已提交日报"
            description="仅展示同组织的已提交日报，草稿不会出现在这里。"
          />
        ) : (
          <div className="space-y-4">
            {reports.map(report => (
              <article
                key={report.id}
                className="rounded-lg border border-gray-200 bg-white p-5"
              >
                <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-gray-800">
                        {report.periodStart} · {report.subject.displayName}
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
                  {DAILY_REPORT_METRIC_ORDER.map(key => {
                    const display = metricDisplay(report.deterministicMetrics[key]);
                    return (
                      <div
                        key={key}
                        className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                      >
                        <p className="text-[11px] leading-4 text-gray-500">
                          {DAILY_REPORT_METRIC_LABELS[key] ?? key}
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
                      <p>日报版本：{report.version}</p>
                      <p>
                        更正来源：
                        {report.supersedesReportId
                          ? report.supersedesReportId
                          : '无'}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-gray-600">未知项</p>
                      {report.unknowns.length > 0 ? (
                        <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs leading-5 text-amber-700">
                          {JSON.stringify(report.unknowns, null, 2)}
                        </pre>
                      ) : (
                        <p className="mt-2 text-xs text-gray-400">无显式未知项</p>
                      )}
                    </div>
                  </div>
                </details>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
