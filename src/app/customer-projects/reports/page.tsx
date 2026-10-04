'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { useCanReviewDailyReports } from '@/components/layout/RoleProvider';
import {
  knownMetricValue,
  reportMetricLabels,
  reportMetricOrder,
  weeklyPeriodForBusinessDate,
  type DerivedReportListItem,
  type DerivedReportPeriod,
} from '@/lib/customer-projects/reports';
import type {
  ReportNarrativeStaleReason,
  ReportNarrativeState,
} from '@/lib/customer-projects/report-narrative';
import type { WeeklySuggestionProposalView } from '@/lib/customer-projects/weekly-report-suggestions';
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

function statusTone(status: DerivedReportListItem['status']): string {
  return status === 'submitted'
    ? 'bg-emerald-50 text-emerald-700'
    : 'bg-amber-50 text-amber-700';
}

function narrativeStaleLabel(
  reasons: ReportNarrativeStaleReason[],
  periodType: DerivedReportPeriod,
): string {
  const reportName = periodType === 'weekly' ? '周报' : '日报';
  if (reasons.includes('PROPOSAL_EXPIRED')) return 'AI 摘要已过期';
  if (reasons.includes('REPORT_NOT_DRAFT')) return `${reportName}已提交，不能继续审核`;
  if (reasons.includes('REPORT_VERSION_CHANGED')) return `${reportName}版本已变化`;
  if (reasons.includes('REPORT_BASIS_FINGERPRINT_CHANGED')) {
    return `${reportName}数字或未知项已变化`;
  }
  if (
    reasons.includes('SOURCE_EVENT_CURSOR_CHANGED')
    || reasons.includes('SOURCE_AUDIT_CURSOR_CHANGED')
  ) {
    return `${reportName}来源游标已变化`;
  }
  if (reasons.includes('METRICS_SCHEMA_CHANGED')) return '指标版本已变化';
  return '提案依据已经过期';
}

function suggestionStaleLabel(reasons: ReportNarrativeStaleReason[]): string {
  if (reasons.includes('REPORT_VERSION_CHANGED')) return '周报版本已变化';
  if (reasons.includes('REPORT_BASIS_FINGERPRINT_CHANGED')) {
    return '周报数字或未知项已变化';
  }
  if (
    reasons.includes('SOURCE_EVENT_CURSOR_CHANGED')
    || reasons.includes('SOURCE_AUDIT_CURSOR_CHANGED')
  ) {
    return '周报来源游标已变化';
  }
  return '建议依据已经过期';
}

export default function CustomerProjectReportsPage() {
  const canReviewReports = useCanReviewDailyReports();
  const [period, setPeriod] = useState<DerivedReportPeriod>('daily');
  const [reports, setReports] = useState<DerivedReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [correctionId, setCorrectionId] = useState<string | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [narrativeByReport, setNarrativeByReport] = useState<
    Record<string, ReportNarrativeState>
  >({});
  const [suggestionsByReport, setSuggestionsByReport] = useState<
    Record<string, WeeklySuggestionProposalView[]>
  >({});

  const today = useMemo(() => shanghaiBusinessDate(), []);
  const currentWeek = useMemo(
    () => weeklyPeriodForBusinessDate(today),
    [today],
  );
  const currentPeriodStart = period === 'weekly'
    ? currentWeek?.periodStart ?? today
    : today;
  const currentDraft = reports.find(report =>
    report.periodStart === currentPeriodStart && report.status === 'draft',
  );
  const currentSubmitted = reports.some(report =>
    report.periodStart === currentPeriodStart && report.status === 'submitted',
  );

  const latestRevisionByPeriod = useMemo(() => {
    const map = new Map<string, number>();
    for (const report of reports) {
      const key = report.periodStart + '/' + report.periodEnd;
      map.set(key, Math.max(map.get(key) ?? 0, report.revisionNo));
    }
    return map;
  }, [reports]);

  const draftPeriods = useMemo(
    () => new Set(
      reports
        .filter(report => report.status === 'draft')
        .map(report => report.periodStart + '/' + report.periodEnd),
    ),
    [reports],
  );

  async function loadNarrativeStates(nextReports: DerivedReportListItem[]) {
    const candidates = nextReports.filter(report =>
      report.status === 'draft' || report.narrative !== null,
    );

    const entries = await Promise.all(candidates.map(async report => {
      try {
        const response = await fetch(
          '/api/customer-projects/reports/'
            + encodeURIComponent(report.id)
            + '/narrative',
          { cache: 'no-store' },
        );
        const body = await response.json().catch(() => null);
        if (response.ok && body?.ok === true && body?.data) {
          return [report.id, body.data as ReportNarrativeState] as const;
        }
      } catch {
        return null;
      }
      return null;
    }));

    setNarrativeByReport(current => {
      const next: Record<string, ReportNarrativeState> = {};
      for (const report of nextReports) {
        if (report.status !== 'draft' && report.narrative === null) continue;
        const retained = current[report.id];
        if (retained) next[report.id] = retained;
      }
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      return next;
    });
  }

  async function loadSuggestions(report: DerivedReportListItem) {
    if (report.periodType !== 'weekly') return;
    try {
      const response = await fetch(
        '/api/customer-projects/reports/'
          + encodeURIComponent(report.id)
          + '/suggestions',
        { cache: 'no-store' },
      );
      const body = await response.json().catch(() => null);
      if (
        response.ok
        && body?.ok === true
        && Array.isArray(body?.data?.suggestions)
      ) {
        setSuggestionsByReport(current => ({
          ...current,
          [report.id]: body.data.suggestions as WeeklySuggestionProposalView[],
        }));
      }
    } catch {
      // Suggestions are contextual; report and narrative loading remain usable.
    }
  }

  async function loadReports(
    targetPeriod: DerivedReportPeriod,
    showLoading = true,
  ) {
    if (showLoading) setLoading(true);
    try {
      const endpoint = targetPeriod === 'weekly'
        ? '/api/customer-projects/reports/weekly'
        : '/api/customer-projects/reports';
      const response = await fetch(endpoint, { cache: 'no-store' });
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true && Array.isArray(body?.data?.reports)) {
        const nextReports = body.data.reports as DerivedReportListItem[];
        setReports(nextReports);
        await loadNarrativeStates(nextReports);
        if (targetPeriod === 'weekly') {
          await Promise.all(
            nextReports
              .filter(report => report.status === 'draft')
              .map(report => loadSuggestions(report)),
          );
        }
        setError('');
      } else if (response.status === 401) {
        setError('登录状态已失效，请重新登录。');
      } else if (response.status === 403) {
        setError('你没有权限查看报告。');
      } else {
        setError('报告加载失败，请稍后重试。');
      }
    } catch {
      setError('报告加载失败，请稍后重试。');
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  function applyNarrativeState(
    reportId: string,
    state: ReportNarrativeState,
  ) {
    setNarrativeByReport(current => ({
      ...current,
      [reportId]: state,
    }));
  }

  async function switchPeriod(nextPeriod: DerivedReportPeriod) {
    if (period === nextPeriod) return;
    setPeriod(nextPeriod);
    setReports([]);
    setError('');
    await loadReports(nextPeriod);
  }

  async function generateReport() {
    if (workingId) return;
    setWorkingId('generate');
    setError('');

    try {
      const endpoint = period === 'weekly'
        ? '/api/customer-projects/reports/weekly/generate'
        : '/api/customer-projects/reports/daily/generate';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          period === 'weekly'
            ? {
                businessDate: today,
                expectedVersion: currentDraft?.version ?? null,
              }
            : { businessDate: today },
        ),
      });
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true) {
        await loadReports(period, false);
        return;
      }

      if (response.status === 409) {
        setError(typeof body?.message === 'string'
          ? body.message
          : '当前周期已经提交，如需修改请创建更正版。');
        await loadReports(period, false);
      } else if (response.status === 422 || response.status === 400) {
        setError(typeof body?.message === 'string'
          ? body.message
          : '报告日期或数据状态无效。');
      } else {
        setError('生成报告失败，请稍后重试。');
      }
    } catch {
      setError('生成报告失败，请稍后重试。');
    } finally {
      setWorkingId(null);
    }
  }

  async function generateNarrative(
    report: DerivedReportListItem,
    regenerate = false,
  ) {
    const operationId = 'narrative-generate-' + report.id;
    if (workingId) return;
    setWorkingId(operationId);
    setError('');

    try {
      const endpoint = regenerate
        ? `/api/customer-projects/reports/${encodeURIComponent(report.id)}/narrative/regenerate`
        : `/api/customer-projects/reports/${encodeURIComponent(report.id)}/narrative`;
      const response = await fetch(endpoint, { method: 'POST' });
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true && body?.data) {
        applyNarrativeState(report.id, body.data as ReportNarrativeState);
        return;
      }

      setError(typeof body?.message === 'string'
        ? body.message
        : '生成 AI 摘要失败，请稍后重试。');
      if (response.status === 409) await loadReports(period, false);
    } catch {
      setError('生成 AI 摘要失败，请稍后重试。');
    } finally {
      setWorkingId(null);
    }
  }

  async function acceptNarrative(
    report: DerivedReportListItem,
    proposalId: string,
    proposalVersion: number,
  ) {
    const operationId = 'narrative-accept-' + report.id;
    if (workingId) return;
    setWorkingId(operationId);
    setError('');

    try {
      const response = await fetch(
        `/api/customer-projects/reports/${encodeURIComponent(report.id)}/narrative/accept`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            proposalId,
            expectedProposalVersion: proposalVersion,
            expectedReportVersion: report.version,
          }),
        },
      );
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true && body?.data) {
        applyNarrativeState(report.id, body.data as ReportNarrativeState);
        await loadReports(period, false);
        return;
      }

      setError(typeof body?.message === 'string'
        ? body.message
        : '接受 AI 摘要失败，请刷新后重试。');
      if (response.status === 409) await loadReports(period, false);
    } catch {
      setError('接受 AI 摘要失败，请刷新后重试。');
    } finally {
      setWorkingId(null);
    }
  }

  async function rejectNarrative(
    report: DerivedReportListItem,
    proposalId: string,
    proposalVersion: number,
  ) {
    const operationId = 'narrative-reject-' + report.id;
    if (workingId) return;
    setWorkingId(operationId);
    setError('');

    try {
      const response = await fetch(
        `/api/customer-projects/reports/${encodeURIComponent(report.id)}/narrative/reject`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            proposalId,
            expectedProposalVersion: proposalVersion,
          }),
        },
      );
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true && body?.data) {
        applyNarrativeState(report.id, body.data as ReportNarrativeState);
        return;
      }

      setError(typeof body?.message === 'string'
        ? body.message
        : '拒绝 AI 摘要失败，请刷新后重试。');
      if (response.status === 409) await loadReports(period, false);
    } catch {
      setError('拒绝 AI 摘要失败，请刷新后重试。');
    } finally {
      setWorkingId(null);
    }
  }

  async function generateSuggestions(report: DerivedReportListItem) {
    if (workingId) return;
    setWorkingId('suggestions-' + report.id);
    setError('');

    try {
      const response = await fetch(
        `/api/customer-projects/reports/${encodeURIComponent(report.id)}/suggestions`,
        { method: 'POST' },
      );
      const body = await response.json().catch(() => null);
      if (
        response.ok
        && body?.ok === true
        && Array.isArray(body?.data?.suggestions)
      ) {
        setSuggestionsByReport(current => ({
          ...current,
          [report.id]: body.data.suggestions as WeeklySuggestionProposalView[],
        }));
        return;
      }
      setError(typeof body?.message === 'string'
        ? body.message
        : '生成下一步建议失败，请稍后重试。');
    } catch {
      setError('生成下一步建议失败，请稍后重试。');
    } finally {
      setWorkingId(null);
    }
  }

  async function decideSuggestion(
    report: DerivedReportListItem,
    suggestion: WeeklySuggestionProposalView,
    decision: 'accept' | 'reject',
  ) {
    if (workingId) return;
    setWorkingId(decision + '-' + suggestion.id);
    setError('');

    try {
      const response = await fetch(
        `/api/customer-projects/ai-drafts/${encodeURIComponent(suggestion.id)}/${decision}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedVersion: suggestion.version,
            ...(decision === 'reject' ? { reason: null } : {}),
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok === true) {
        await loadSuggestions(report);
        if (decision === 'accept') {
          setError('');
        }
        return;
      }
      setError(typeof body?.message === 'string'
        ? body.message
        : decision === 'accept'
          ? '接受建议失败，请刷新后重试。'
          : '拒绝建议失败，请刷新后重试。');
      await loadSuggestions(report);
    } catch {
      setError('处理建议失败，请稍后重试。');
    } finally {
      setWorkingId(null);
    }
  }

  useEffect(() => {
    void loadReports(period, true);
  }, []);

  async function submitReport(report: DerivedReportListItem) {
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
        await loadReports(period, false);
        return;
      }

      if (response.status === 409) {
        setError(typeof body?.message === 'string'
          ? body.message
          : '报告状态已经变化，请刷新后重试。');
        await loadReports(period, false);
      } else {
        setError('提交报告失败，请稍后重试。');
      }
    } catch {
      setError('提交报告失败，请稍后重试。');
    } finally {
      setWorkingId(null);
    }
  }

  async function createCorrection(report: DerivedReportListItem) {
    if (workingId) return;
    if (!correctionReason.trim()) {
      setError('创建更正版必须填写原因。');
      return;
    }

    setWorkingId(report.id);
    setError('');

    try {
      const endpoint = report.periodType === 'weekly'
        ? '/api/customer-projects/reports/weekly/'
          + encodeURIComponent(report.id)
          + '/correction'
        : '/api/customer-projects/reports/'
          + encodeURIComponent(report.id)
          + '/correction';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: report.version,
          reason: correctionReason.trim(),
        }),
      });
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true) {
        setCorrectionId(null);
        setCorrectionReason('');
        await loadReports(period, false);
        return;
      }

      if (response.status === 409) {
        setError(typeof body?.message === 'string'
          ? body.message
          : '该周期已经有更正草稿，或版本已经变化。');
        await loadReports(period, false);
      } else {
        setError('创建更正版失败，请稍后重试。');
      }
    } catch {
      setError('创建更正版失败，请稍后重试。');
    } finally {
      setWorkingId(null);
    }
  }

  const periodName = period === 'weekly' ? '周报' : '日报';
  const currentPeriodLabel = period === 'weekly' && currentWeek
    ? `${currentWeek.periodStart} 至 ${currentWeek.periodEnd}`
    : today;

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="我的报告"
          description="日报数字从已确认业务事实派生，周报按上海业务时间汇总同一批确定性事实。员工只做异常校正与提交确认，不重复抄写项目进展。"
          actions={canReviewReports ? (
            <Link
              href={
                period === 'weekly'
                  ? '/customer-projects/reports/review?period=weekly'
                  : '/customer-projects/reports/review'
              }
              className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-700 no-underline"
            >
              审阅同组织已提交报告
            </Link>
          ) : undefined}
        />

        <div className="flex items-center gap-2 border-b border-gray-200">
          <button
            type="button"
            onClick={() => void switchPeriod('daily')}
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
            onClick={() => void switchPeriod('weekly')}
            className={
              period === 'weekly'
                ? 'border-b-2 border-cyan-600 px-4 py-2 text-sm font-medium text-cyan-700'
                : 'px-4 py-2 text-sm text-gray-500'
            }
          >
            周报
          </button>
        </div>

        <section className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">
                {period === 'weekly' ? '本周' : '今天'}：{currentPeriodLabel}
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-600">
                {period === 'weekly'
                  ? '周报按上海业务时间周一至周日汇总已确认日报快照；缺少日报覆盖时显示未知，不会按 0 处理。'
                  : '先在项目/任务里修正事实，再刷新草稿。日报不会让你重新逐项目填写一次。'}
              </p>
            </div>

            {!currentSubmitted && (
              <button
                type="button"
                onClick={() => void generateReport()}
                disabled={workingId !== null}
                className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {workingId === 'generate'
                  ? '正在生成...'
                  : period === 'weekly'
                    ? currentDraft
                      ? '刷新本周草稿'
                      : '生成本周周报'
                    : currentDraft
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
            正在加载{periodName}...
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            title={`还没有${periodName}`}
            description={period === 'weekly'
              ? '生成本周草稿后，系统会按日快照汇总；缺失日报会保留为未知并显示覆盖情况。'
              : '生成今日草稿后，系统会从已确认的项目事件、任务和承诺中自动汇总数字。'}
          />
        ) : (
          <div className="space-y-4">
            {reports.map(report => {
              const narrativeState = narrativeByReport[report.id];
              const pendingProposal = narrativeState?.pendingProposal ?? null;
              const acceptedNarrativeStale =
                narrativeState?.acceptedNarrativeStale ?? false;
              const periodKey = report.periodStart + '/' + report.periodEnd;
              const metricOrder = reportMetricOrder(report.periodType);
              const metricLabels = reportMetricLabels(report.periodType);
              const suggestions = suggestionsByReport[report.id] ?? [];

              return (
              <article
                key={report.id}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-gray-800">
                        {report.periodStart}
                        {report.periodType === 'weekly'
                          ? ` 至 ${report.periodEnd} 周报`
                          : ' 日报'}
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
                        {report.periodStart === currentPeriodStart && (
                          <button
                            type="button"
                            onClick={() => void generateReport()}
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
                    ) : report.revisionNo === latestRevisionByPeriod.get(periodKey)
                      && !draftPeriods.has(periodKey) ? (
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
                    ) : (
                      <span className="text-xs text-gray-400">
                        {draftPeriods.has(periodKey) ? '已有更正草稿' : '历史版本'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {metricOrder.map(key => {
                    const value = knownMetricValue(report.deterministicMetrics, key);
                    return (
                      <div
                        key={key}
                        className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                      >
                        <p className="text-[11px] leading-4 text-gray-500">
                          {metricLabels[key] ?? key}
                        </p>
                        <p className="mt-1 text-xl font-semibold text-gray-800">
                          {value ?? '未知'}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-gray-600">
                      正式{periodName}摘要
                    </p>
                    {acceptedNarrativeStale && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        摘要依据已过期
                      </span>
                    )}
                  </div>
                  {report.narrative ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                      {report.narrative}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-gray-400">
                      尚未接受 AI 摘要。确定性数字仍以快照为准。
                    </p>
                  )}
                  {acceptedNarrativeStale && (
                    <p className="mt-2 text-xs leading-5 text-amber-700">
                      AI 摘要接受后，确定性数字或来源版本发生了变化。旧摘要没有被覆盖，
                      需要重新生成并明确接受。
                    </p>
                  )}
                  {report.status === 'draft' && !pendingProposal && (
                    <button
                      type="button"
                      onClick={() => void generateNarrative(
                        report,
                        report.narrative !== null,
                      )}
                      disabled={workingId !== null}
                      className="mt-3 rounded-lg border border-cyan-200 bg-white px-3 py-1.5 text-xs font-medium text-cyan-700 disabled:opacity-50"
                    >
                      {workingId === 'narrative-generate-' + report.id
                        ? '正在生成 AI 摘要...'
                        : report.narrative
                          ? '重新生成 AI 摘要'
                          : '生成 AI 摘要'}
                    </button>
                  )}
                </div>

                {pendingProposal && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-amber-900">
                        待确认 AI 摘要（非正式）
                      </p>
                      <span className="text-[11px] text-amber-700">
                        AI Draft v{pendingProposal.version}
                      </span>
                    </div>
                    {pendingProposal.isStale && (
                      <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                        {narrativeStaleLabel(
                          pendingProposal.staleReasons,
                          report.periodType,
                        )}
                        。当前提案不能接受，请重新生成并复核。
                      </p>
                    )}
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">
                      {pendingProposal.narrative}
                    </p>
                    <p className="mt-2 text-[11px] leading-5 text-amber-700">
                      提供方：{pendingProposal.provider.provider}
                      {pendingProposal.provider.model
                        ? ' / ' + pendingProposal.provider.model
                        : ''}
                      。接受后只会写入摘要文字，不会改写报告数字或项目事实。
                    </p>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      {pendingProposal.isStale && (
                        <button
                          type="button"
                          onClick={() => void generateNarrative(report, true)}
                          disabled={workingId !== null}
                          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 disabled:opacity-50"
                        >
                          {workingId === 'narrative-generate-' + report.id
                            ? '正在重新生成...'
                            : '重新生成'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void rejectNarrative(
                          report,
                          pendingProposal.id,
                          pendingProposal.version,
                        )}
                        disabled={workingId !== null}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 disabled:opacity-50"
                      >
                        {workingId === 'narrative-reject-' + report.id
                          ? '正在拒绝...'
                          : '拒绝提案'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void acceptNarrative(
                          report,
                          pendingProposal.id,
                          pendingProposal.version,
                        )}
                        disabled={workingId !== null || !pendingProposal.canAccept}
                        className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {workingId === 'narrative-accept-' + report.id
                          ? '正在接受...'
                          : '接受为正式摘要'}
                      </button>
                    </div>
                  </div>
                )}

                {report.periodType === 'weekly' && report.status === 'draft' && (
                  <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-blue-900">
                          下周工作建议（AI，非正式）
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-blue-700">
                          每条建议来自已确认任务或项目状态；接受后仍通过正式任务创建规则落库。
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void generateSuggestions(report)}
                        disabled={workingId !== null}
                        className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-800 disabled:opacity-50"
                      >
                        {workingId === 'suggestions-' + report.id
                          ? '正在生成建议...'
                          : suggestions.length > 0
                            ? '重新生成建议'
                            : '生成下一步建议'}
                      </button>
                    </div>

                    {suggestions.length === 0 ? (
                      <p className="mt-3 text-xs text-blue-700">
                        暂无由当前已确认事实支持的下一步建议。
                      </p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {suggestions.map(suggestion => (
                          <div
                            key={suggestion.id}
                            className="rounded-lg border border-blue-100 bg-white p-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-gray-800">
                                  {suggestion.proposal.title}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-gray-600">
                                  {suggestion.proposal.rationale}
                                </p>
                              </div>
                              <span className={
                                suggestion.status === 'accepted'
                                  ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700'
                                  : suggestion.status === 'draft' && !suggestion.isStale
                                    ? 'rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700'
                                    : 'rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600'
                              }>
                                {suggestion.status === 'draft'
                                  ? suggestion.isStale
                                    ? '依据已过期'
                                    : '待确认'
                                  : suggestion.status === 'accepted'
                                    ? '已接受'
                                    : suggestion.status === 'rejected'
                                      ? '已拒绝'
                                      : '已过期'}
                              </span>
                            </div>
                            <p className="mt-2 text-[11px] leading-5 text-gray-500">
                              接受后创建：
                              {suggestion.proposal.workItemType === 'NEXT_ACTION'
                                ? '下一步任务'
                                : '客户回访任务'}
                              。依据周报版本 v{suggestion.proposal.weeklyBasis.reportVersion}
                              ，Event cursor：
                              {suggestion.proposal.weeklyBasis.sourceEventSeq ?? '-'}
                              ，Audit cursor：
                              {suggestion.proposal.weeklyBasis.sourceAuditSeq ?? '-'}。
                            </p>
                            {suggestion.isStale && suggestion.status === 'draft' && (
                              <p className="mt-2 text-xs leading-5 text-red-700">
                                {suggestionStaleLabel(suggestion.staleReasons)}
                                。旧建议不能接受，请重新生成。
                              </p>
                            )}
                            {suggestion.status === 'draft' && (
                              <div className="mt-3 flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => void decideSuggestion(
                                    report,
                                    suggestion,
                                    'reject',
                                  )}
                                  disabled={workingId !== null}
                                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 disabled:opacity-50"
                                >
                                  {workingId === 'reject-' + suggestion.id
                                    ? '正在拒绝...'
                                    : '拒绝建议'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void decideSuggestion(
                                    report,
                                    suggestion,
                                    'accept',
                                  )}
                                  disabled={workingId !== null || !suggestion.canAccept}
                                  className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {workingId === 'accept-' + suggestion.id
                                    ? '正在接受...'
                                    : '接受并创建任务'}
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {report.unknowns.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-medium text-amber-800">
                      需要确认的信息与覆盖来源
                    </p>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-amber-700">
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
              );
            })}
          </div>
        )}

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-800">
            {periodName}数字边界
          </h2>
          <p className="mt-2 text-xs leading-6 text-gray-500">
            当前只统计 CPC 已确认且能重建的业务事实。订单/回款等外部权威数据尚未完成集成时，
            不会被当成 0；消息数、记录数、点击数和 AI 草稿数也不会作为员工绩效指标。
            {period === 'weekly'
              ? ' 周报按上海业务时间周一至周日汇总，缺失日报覆盖会保持未知并列出缺口。'
              : ''}
          </p>
        </section>
      </div>
    </AppLayout>
  );
}
