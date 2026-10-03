'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { formatBusinessDateTime } from '@/lib/customer-projects/presentation';

type MetricValue = { state: 'known'; value: number } | { state: 'unknown'; reason: string };

interface ReportRow {
  id: string;
  period_type: 'daily';
  period_start: string;
  period_end: string;
  revision_no: number;
  status: 'draft' | 'submitted';
  metrics_schema_version: number;
  deterministic_metrics: Record<string, MetricValue>;
  narrative: string | null;
  unknowns: unknown[];
  source_event_seq: number | null;
  source_audit_seq: number | null;
  supersedes_report_id: string | null;
  version: number;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DailyReportResponse {
  requestedDate: string;
  businessDate: string;
  currentReport: ReportRow | null;
  revisions: ReportRow[];
  recentSubmitted: Array<{
    id: string;
    period_start: string;
    revision_no: number;
    status: 'submitted';
    submitted_at: string | null;
    version: number;
  }>;
  liveMetrics: {
    period_date: string;
    timezone: string;
    metrics_schema_version: number;
    deterministic_metrics: Record<string, MetricValue>;
    unknowns: unknown[];
    source_event_seq: number | null;
    source_audit_seq: number | null;
  } | null;
}

const METRIC_LABELS: Record<string, string> = {
  effectiveProgressCount: '实质推进',
  meaningfulChangeCount: '重要业务变化',
  quoteSentCount: '正式报价已发送',
  customerConfirmedCount: '客户确认',
  orderConfirmedCount: '订单确认',
  nextActionCreatedCount: '新建下一步',
  nextActionCompletedCount: '完成下一步',
  workItemRescheduledCount: '任务改期',
  customerCommitmentDueCount: '今日到期客户承诺',
  customerCommitmentCompletedCount: '完成客户承诺',
  customerCommitmentOverdueOpenCount: '当前逾期客户承诺',
  internalCollaborationCompletedCount: '完成内部协作',
  customerFollowUpCompletedCount: '完成客户回访',
  activeProjectCount: '当前活跃项目',
  activeProjectMissingNextStepCount: '活跃项目缺下一步',
  waitingProjectCount: '等待/检查项目',
  blockedOpenWorkItemCount: '当前受阻任务',
  openManagementDecisionCount: '待管理决策',
  unresolvedAiDraftCount: '待确认 AI 建议',
};

const PRIMARY_METRICS = [
  'effectiveProgressCount',
  'meaningfulChangeCount',
  'nextActionCompletedCount',
  'customerCommitmentCompletedCount',
  'customerFollowUpCompletedCount',
  'quoteSentCount',
];

const EXCEPTION_METRICS = [
  'customerCommitmentOverdueOpenCount',
  'activeProjectMissingNextStepCount',
  'blockedOpenWorkItemCount',
  'openManagementDecisionCount',
  'unresolvedAiDraftCount',
];

function shanghaiToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function metricValue(metrics: Record<string, MetricValue> | null, key: string): string {
  const metric = metrics?.[key];
  if (!metric) return '-';
  return metric.state === 'known' ? String(metric.value) : '待确认';
}

export default function CustomerProjectReportsPage() {
  const [selectedDate, setSelectedDate] = useState(shanghaiToday());
  const [data, setData] = useState<DailyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [narrative, setNarrative] = useState('');

  async function load(date: string, showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(
        '/api/customer-projects/reports/daily?date=' + encodeURIComponent(date),
        { cache: 'no-store' },
      );
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true && body?.data) {
        setData(body.data as DailyReportResponse);
        setNarrative(body.data.currentReport?.narrative ?? '');
        setError('');
      } else if (response.status === 401) {
        setError('登录状态已失效，请重新登录。');
      } else if (response.status === 403) {
        setError('你没有权限查看日报。');
      } else {
        setError(typeof body?.error === 'string' ? body.error : '日报加载失败，请稍后重试。');
      }
    } catch {
      setError('日报加载失败，请稍后重试。');
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    void load(selectedDate, true);
  }, [selectedDate]);

  const isToday = data?.requestedDate === data?.businessDate;
  const current = data?.currentReport ?? null;
  const metrics = current?.deterministic_metrics ?? data?.liveMetrics?.deterministic_metrics ?? null;
  const isSubmitted = current?.status === 'submitted';

  const exceptionCount = useMemo(() => {
    if (!metrics) return 0;
    return EXCEPTION_METRICS.reduce((sum, key) => {
      const metric = metrics[key];
      return sum + (metric?.state === 'known' ? metric.value : 0);
    }, 0);
  }, [metrics]);

  async function refreshDraft() {
    if (!isToday || working) return;
    setWorking(true);
    setError('');
    try {
      const response = await fetch('/api/customer-projects/reports/daily', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          periodDate: selectedDate,
          narrative: narrative.trim() || null,
        }),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok === true) {
        await load(selectedDate, false);
      } else {
        setError(typeof body?.message === 'string'
          ? body.message
          : '日报生成失败，请稍后重试。');
      }
    } catch {
      setError('日报生成失败，请稍后重试。');
    } finally {
      setWorking(false);
    }
  }

  async function submitReport() {
    if (!current || current.status !== 'draft' || working) return;
    setWorking(true);
    setError('');
    try {
      const response = await fetch(
        '/api/customer-projects/reports/' + encodeURIComponent(current.id) + '/submit',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedVersion: current.version }),
        },
      );
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok === true) {
        await load(selectedDate, false);
      } else {
        setError(typeof body?.message === 'string'
          ? body.message
          : '日报提交失败，请稍后重试。');
      }
    } catch {
      setError('日报提交失败，请稍后重试。');
    } finally {
      setWorking(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader
        title="我的报告"
        description="日报由已确认业务事实自动生成；员工只核对异常并确认提交，不重复逐项目写日报。"
      />

      <div className="space-y-5">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">日报日期</label>
              <input
                type="date"
                value={selectedDate}
                max={data?.businessDate ?? shanghaiToday()}
                onChange={event => setSelectedDate(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="text-xs text-gray-500">
              {isToday
                ? '今天可生成/刷新并确认提交'
                : '历史日期只读取已保存快照，不用当前状态重新计算'}
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            正在生成日报视图...
          </div>
        ) : !metrics ? (
          <EmptyState
            title={isToday ? '今天还没有可用日报数据' : '这一天没有已保存的日报'}
            description={isToday
              ? '点击“生成/刷新日报”从已确认项目、任务与事件中生成。'
              : 'Phase 7A 不对历史日期做当前状态回算。'}
          />
        ) : (
          <>
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-800">当天自动摘要</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    数字来自已确认 CPC 事实；消息数、点击数、AI 草稿数量不会作为绩效分数。
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {current && (
                    <span className={
                      'rounded-full px-2 py-1 '
                      + (current.status === 'submitted'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700')
                    }>
                      {current.status === 'submitted' ? '已提交' : '草稿'}
                    </span>
                  )}
                  {current && <span className="text-gray-400">v{current.version}</span>}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {PRIMARY_METRICS.map(key => (
                  <div key={key} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-[11px] text-gray-500">{METRIC_LABELS[key]}</p>
                    <p className="mt-1 text-xl font-semibold text-gray-800">{metricValue(metrics, key)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-800">下班前异常检查</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    这些是需要确认的业务状态，不是员工评分。
                  </p>
                </div>
                <span className={
                  'rounded-full px-2 py-1 text-xs '
                  + (exceptionCount > 0
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-emerald-50 text-emerald-700')
                }>
                  {exceptionCount > 0 ? exceptionCount + ' 项待关注' : '无明显异常'}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                {EXCEPTION_METRICS.map(key => (
                  <div key={key} className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs text-gray-500">{METRIC_LABELS[key]}</p>
                    <p className="mt-1 text-lg font-semibold text-gray-800">{metricValue(metrics, key)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-base font-semibold text-gray-800">摘要</h2>
              <p className="mt-1 text-xs text-gray-500">
                Phase 7A 先保留可选摘要字段；数字不可手工改。后续 AI 摘要只能基于这些确定性事实生成。
              </p>

              <textarea
                value={narrative}
                onChange={event => setNarrative(event.target.value)}
                disabled={!isToday || isSubmitted}
                rows={4}
                placeholder="可留空；如果需要补充特殊情况，只写数字无法表达的背景。"
                className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500"
              />

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-gray-400">
                  {current?.submitted_at
                    ? '提交时间：' + formatBusinessDateTime(current.submitted_at)
                    : '提交后快照不可原地覆盖。'}
                </div>

                {isToday && !isSubmitted && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void refreshDraft()}
                      disabled={working}
                      className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-medium text-cyan-700"
                    >
                      {current ? '刷新日报' : '生成日报'}
                    </button>
                    {current?.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => void submitReport()}
                        disabled={working}
                        className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white"
                      >
                        确认提交
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {data && data.recentSubmitted.length > 0 && (
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-base font-semibold text-gray-800">最近已提交日报</h2>
            <div className="mt-3 divide-y divide-gray-100">
              {data.recentSubmitted.slice(0, 10).map(item => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setSelectedDate(item.period_start)}
                  className="flex w-full items-center justify-between py-2 text-left text-sm"
                >
                  <span className="text-gray-700">{item.period_start}</span>
                  <span className="text-xs text-gray-400">
                    已提交 · revision {item.revision_no}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
