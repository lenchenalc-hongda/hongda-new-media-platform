'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import {
  DAILY_REPORT_METRIC_LABELS,
  DAILY_REPORT_METRIC_ORDER,
  knownMetricValue,
  type DailyReportListItem,
} from '@/lib/customer-projects/reports';
import { formatBusinessDateTime } from '@/lib/customer-projects/presentation';

function shanghaiBusinessDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const map = new Map(parts.map(part => [part.type, part.value]));
  return map.get('year') + '-' + map.get('month') + '-' + map.get('day');
}

function statusTone(status: DailyReportListItem['status']): string {
  return status === 'submitted'
    ? 'bg-emerald-50 text-emerald-700'
    : 'bg-amber-50 text-amber-700';
}

export default function CustomerProjectReportsPage() {
  const [reports, setReports] = useState<DailyReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [correctionId, setCorrectionId] = useState<string | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');

  const today = useMemo(() => shanghaiBusinessDate(), []);
  const todayDraft = reports.find(report =>
    report.periodStart === today && report.status === 'draft',
  );
  const todaySubmitted = reports.some(report =>
    report.periodStart === today && report.status === 'submitted',
  );

  async function loadReports(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch('/api/customer-projects/reports', {
        cache: 'no-store',
      });
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true && Array.isArray(body?.data?.reports)) {
        setReports(body.data.reports as DailyReportListItem[]);
        setError('');
      } else if (response.status === 401) {
        setError('登录状态已失效，请重新登录。');
      } else if (response.status === 403) {
        setError('你没有权限查看日报。');
      } else {
        setError('日报加载失败，请稍后重试。');
      }
    } catch {
      setError('日报加载失败，请稍后重试。');
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    void loadReports(true);
  }, []);

  async function generateToday() {
    if (workingId) return;
    setWorkingId('generate');
    setError('');

    try {
      const response = await fetch('/api/customer-projects/reports/daily/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessDate: today }),
      });
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true) {
        await loadReports(false);
        return;
      }

      if (response.status === 409) {
        setError(typeof body?.message === 'string'
          ? body.message
          : '今天的日报已经提交，如需修改请创建更正版。');
      } else if (response.status === 422 || response.status === 400) {
        setError(typeof body?.message === 'string'
          ? body.message
          : '日报日期或数据状态无效。');
      } else {
        setError('生成日报失败，请稍后重试。');
      }
    } catch {
      setError('生成日报失败，请稍后重试。');
    } finally {
      setWorkingId(null);
    }
  }

  async function submitReport(report: DailyReportListItem) {
    if (workingId) return;
    setWorkingId(report.id);
    setError('');

    try {
      const response = await fetch(
        '/api/customer-projects/reports/' + encodeURIComponent(report.id) + '/submit',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedVersion: report.version }),
        },
      );
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true) {
        await loadReports(false);
        return;
      }

      if (response.status === 409) {
        setError(typeof body?.message === 'string'
          ? body.message
          : '日报状态已经变化，请刷新后重试。');
        await loadReports(false);
      } else {
        setError('提交日报失败，请稍后重试。');
      }
    } catch {
      setError('提交日报失败，请稍后重试。');
    } finally {
      setWorkingId(null);
    }
  }

  async function createCorrection(report: DailyReportListItem) {
    if (workingId) return;
    if (!correctionReason.trim()) {
      setError('创建更正版必须填写原因。');
      return;
    }

    setWorkingId(report.id);
    setError('');

    try {
      const response = await fetch(
        '/api/customer-projects/reports/' + encodeURIComponent(report.id) + '/correction',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedVersion: report.version,
            reason: correctionReason.trim(),
          }),
        },
      );
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true) {
        setCorrectionId(null);
        setCorrectionReason('');
        await loadReports(false);
        return;
      }

      if (response.status === 409) {
        setError(typeof body?.message === 'string'
          ? body.message
          : '该日报已经有更正草稿，或版本已经变化。');
        await loadReports(false);
      } else {
        setError('创建更正版失败，请稍后重试。');
      }
    } catch {
      setError('创建更正版失败，请稍后重试。');
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="我的报告"
          description="日报数字从已确认业务事实派生。员工只做异常校正与提交确认，不重复抄写项目进展。"
        />

        <div className="flex items-center gap-2 border-b border-gray-200">
          <button
            type="button"
            className="border-b-2 border-cyan-600 px-4 py-2 text-sm font-medium text-cyan-700"
          >
            日报
          </button>
          <button
            type="button"
            disabled
            title="Phase 8 开放"
            className="cursor-not-allowed px-4 py-2 text-sm text-gray-300"
          >
            周报 · 后续开放
          </button>
        </div>

        <section className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">今天：{today}</p>
              <p className="mt-1 text-xs leading-5 text-gray-600">
                先在项目/任务里修正事实，再刷新草稿。日报不会让你重新逐项目填写一次。
              </p>
            </div>

            {!todaySubmitted && (
              <button
                type="button"
                onClick={() => void generateToday()}
                disabled={workingId !== null}
                className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {workingId === 'generate'
                  ? '正在生成...'
                  : todayDraft
                    ? '刷新今日草稿'
                    : '生成今日日报'}
              </button>
            )}
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            正在加载日报...
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            title="还没有日报"
            description="生成今日草稿后，系统会从已确认的项目事件、任务和承诺中自动汇总数字。"
          />
        ) : (
          <div className="space-y-4">
            {reports.map(report => (
              <article
                key={report.id}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-gray-800">
                        {report.periodStart} 日报
                      </h2>
                      <span className={
                        "rounded-full px-2 py-0.5 text-xs font-medium "
                        + statusTone(report.status)
                      }>
                        {report.status === 'submitted' ? '已提交' : '草稿'}
                      </span>
                      <span className="text-xs text-gray-400">
                        Revision {report.revisionNo}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                      <span>指标版本：v{report.metricsSchemaVersion}</span>
                      <span>Event cursor：{report.sourceEventSeq ?? '-'}</span>
                      <span>Audit cursor：{report.sourceAuditSeq ?? '-'}</span>
                      {report.submittedAt && (
                        <span>提交：{formatBusinessDateTime(report.submittedAt)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {report.status === 'draft' ? (
                      <>
                        {report.periodStart === today && (
                          <button
                            type="button"
                            onClick={() => void generateToday()}
                            disabled={workingId !== null}
                            className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-700"
                          >
                            刷新数字
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void submitReport(report)}
                          disabled={workingId !== null}
                          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
                        >
                          {workingId === report.id ? '处理中...' : '确认并提交'}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setCorrectionId(report.id);
                          setCorrectionReason('');
                          setError('');
                        }}
                        disabled={workingId !== null}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600"
                      >
                        创建更正版
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {DAILY_REPORT_METRIC_ORDER.map(key => {
                    const value = knownMetricValue(report.deterministicMetrics, key);
                    return (
                      <div
                        key={key}
                        className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                      >
                        <p className="text-[11px] leading-4 text-gray-500">
                          {DAILY_REPORT_METRIC_LABELS[key] ?? key}
                        </p>
                        <p className="mt-1 text-xl font-semibold text-gray-800">
                          {value ?? '未知'}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-medium text-gray-600">摘要</p>
                  {report.narrative ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                      {report.narrative}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-gray-400">
                      Phase 7A 先锁定可靠数字；AI 摘要将在 Phase 7B 接入，并且仍需员工确认。
                    </p>
                  )}
                </div>

                {report.unknowns.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-medium text-amber-800">需要确认的信息</p>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs text-amber-700">
                      {JSON.stringify(report.unknowns, null, 2)}
                    </pre>
                  </div>
                )}

                {correctionId === report.id && report.status === 'submitted' && (
                  <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <p className="text-xs font-medium text-blue-800">创建更正版</p>
                    <p className="mt-1 text-xs leading-5 text-blue-700">
                      原提交版本不会被修改。系统会基于已确认事实重新生成一个新的草稿 revision。
                    </p>
                    <input
                      value={correctionReason}
                      onChange={event => setCorrectionReason(event.target.value)}
                      placeholder="更正原因，例如：补录了下午客户确认记录"
                      className="mt-3 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
                    />
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCorrectionId(null);
                          setCorrectionReason('');
                        }}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => void createCorrection(report)}
                        disabled={workingId !== null}
                        className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        创建新 Revision
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-800">日报数字边界</h2>
          <p className="mt-2 text-xs leading-6 text-gray-500">
            当前只统计 CPC 已确认且能重建的业务事实。订单/回款等外部权威数据尚未完成集成时，
            不会被当成 0；消息数、记录数、点击数和 AI 草稿数也不会作为员工绩效指标。
          </p>
        </section>
      </div>
    </AppLayout>
  );
}
