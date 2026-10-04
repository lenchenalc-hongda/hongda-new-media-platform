'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import type {
  ProjectLifecycleStatus,
  ProjectPriority,
  ProjectType,
  RiskLevel,
  WaitingOn,
  WorkItemPriority,
  WorkItemStatus,
} from '@/lib/customer-projects/domain';
import type { OldCustomerRecommendation } from '@/lib/customer-projects/old-customer-proactive';
import {
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  RISK_LEVEL_LABELS,
  WAITING_ON_LABELS,
  formatBusinessDateTime,
  projectPriorityTone,
  projectStageLabel,
  toIsoFromShanghaiDateTime,
} from '@/lib/customer-projects/presentation';

interface CustomerDetailDto {
  customer: {
    id: string;
    referenceKind: 'canonical' | 'provisional';
    displayName: string;
    status: string;
    sourceLabel: string | null;
    externalCustomerId: string | null;
    externalOwnerReference: string | null;
    sourceSyncedAt: string | null;
    updatedAt: string;
    canRecordFollowUp: boolean;
  };
  currentFollowUp: {
    id: string;
    title: string;
    dueAt: string | null;
    status: WorkItemStatus;
    priority: WorkItemPriority;
    blockedReason: string | null;
    version: number;
    isAssignedToMe: boolean;
    canClose: boolean;
  } | null;
  relationshipRecommendation: OldCustomerRecommendation;
  projects: Array<{
    id: string;
    title: string;
    projectType: ProjectType;
    status: ProjectLifecycleStatus;
    stage: string;
    waitingOn: WaitingOn;
    nextCheckAt: string | null;
    riskLevel: RiskLevel | null;
    priority: ProjectPriority;
    isOwnedByMe: boolean;
    updatedAt: string;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    occurredAt: string;
    summary: string | null;
  }>;
  promotionContext: {
    eventId: string;
    summary: string;
    occurredAt: string;
  } | null;
}

type FollowUpMode = 'keep' | 'complete' | 'next';

function eventLabel(eventType: string): string {
  if (eventType === 'CUSTOMER_RESPONSE_RECEIVED') return '收到客户反馈';
  if (eventType === 'CONTACT_LOGGED') return '客户联系记录';
  return eventType;
}

function recommendationStateLabel(state: OldCustomerRecommendation['state']): string {
  if (state === 'due') return '到建议周期';
  if (state === 'not_due') return '未到建议周期';
  if (state === 'suppressed_active_project') return '已有推进中项目';
  if (state === 'suppressed_open_follow_up') return '已有正式回访';
  if (state === 'needs_baseline') return '缺少关系基线';
  return '证据未知';
}

function shanghaiDateTimeInput(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value));
  const values = new Map(parts.map(part => [part.type, part.value]));
  return [
    values.get('year'),
    values.get('month'),
    values.get('day'),
  ].join('-') + 'T' + [values.get('hour'), values.get('minute')].join(':');
}

function defaultRelationshipDueAt(
  recommendation: OldCustomerRecommendation,
  now: Date,
): string {
  const suggestedMs = recommendation.nextSuggestedFollowUpAt
    ? new Date(recommendation.nextSuggestedFollowUpAt).getTime()
    : Number.NaN;
  const selected = Number.isFinite(suggestedMs) && suggestedMs > now.getTime()
    ? new Date(suggestedMs)
    : now;
  return shanghaiDateTimeInput(selected.toISOString());
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function CustomerDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [detail, setDetail] = useState<CustomerDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [eventType, setEventType] = useState<'CONTACT_LOGGED' | 'CUSTOMER_RESPONSE_RECEIVED'>('CONTACT_LOGGED');
  const [resultSummary, setResultSummary] = useState('');
  const [followUpMode, setFollowUpMode] = useState<FollowUpMode>('keep');
  const [nextTitle, setNextTitle] = useState('');
  const [nextDueAt, setNextDueAt] = useState('');
  const [nextPriority, setNextPriority] = useState<WorkItemPriority>('medium');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [scheduleDueAt, setScheduleDueAt] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleSuccess, setScheduleSuccess] = useState('');

  const loadCustomer = useCallback(async (showLoading = true) => {
    if (!id) return;
    if (showLoading) setLoading(true);

    try {
      const response = await fetch(
        '/api/customer-projects/customers/' + encodeURIComponent(id),
        { cache: 'no-store' },
      );
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true && body.data) {
        setDetail(body.data as CustomerDetailDto);
        setLoadError('');
      } else if (response.status === 401) {
        setLoadError('登录状态已失效，请重新登录。');
        setDetail(null);
      } else if (response.status === 403) {
        setLoadError('你没有权限查看这个客户。');
        setDetail(null);
      } else if (response.status === 404) {
        setLoadError('客户不存在或当前不可见。');
        setDetail(null);
      } else {
        setLoadError('客户详情加载失败，请稍后重试。');
        setDetail(null);
      }
    } catch {
      setLoadError('客户详情加载失败，请稍后重试。');
      setDetail(null);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadCustomer(true);
  }, [loadCustomer]);

  useEffect(() => {
    if (!detail?.currentFollowUp) {
      setFollowUpMode('keep');
      return;
    }
    if (!detail.currentFollowUp.canClose) {
      setFollowUpMode('keep');
    }
  }, [detail]);

  useEffect(() => {
    if (!detail?.relationshipRecommendation) return;
    setScheduleDueAt(defaultRelationshipDueAt(
      detail.relationshipRecommendation,
      new Date(),
    ));
  }, [detail]);

  const createProjectHref = useMemo(() => {
    if (!detail) return '/customer-projects/projects/new';
    const params = new URLSearchParams({
      customerReferenceId: detail.customer.id,
    });
    if (detail.promotionContext) {
      params.set('contextEventId', detail.promotionContext.eventId);
    }
    return '/customer-projects/projects/new?' + params.toString();
  }, [detail]);

  async function scheduleRelationshipFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !id || scheduling) return;

    const dueAt = toIsoFromShanghaiDateTime(scheduleDueAt);
    if (!dueAt) {
      setScheduleError('请设置明确的回访时间。');
      return;
    }

    setScheduling(true);
    setScheduleError('');
    setScheduleSuccess('');

    try {
      const response = await fetch(
        '/api/customer-projects/customers/'
          + encodeURIComponent(id)
          + '/relationship-follow-up',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: '客户关系回访',
            dueAt,
            priority: 'medium',
          }),
        },
      );
      const result = await response.json().catch(() => null);

      if (response.ok && result?.ok === true) {
        setScheduleSuccess('已按你的确认创建正式客户回访，并进入任务与提醒。');
        await loadCustomer(false);
        return;
      }

      if (response.status === 409) {
        setScheduleError(typeof result?.message === 'string'
          ? result.message
          : '客户已有开放回访任务，请刷新后处理现有任务。');
        await loadCustomer(false);
      } else if (response.status === 403) {
        setScheduleError('你当前没有为该客户安排正式回访的权限。');
      } else if (response.status === 422 || response.status === 400) {
        setScheduleError(typeof result?.message === 'string'
          ? result.message
          : '回访时间或内容无效。');
      } else {
        setScheduleError('正式回访创建失败，请稍后重试。');
      }
    } catch {
      setScheduleError('正式回访创建失败，请稍后重试。');
    } finally {
      setScheduling(false);
    }
  }

  async function submitFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !id || submitting) return;

    const summary = resultSummary.trim();
    if (!summary) {
      setSubmitError('请写清楚这次客户回访的实际结果。');
      return;
    }

    const body: Record<string, unknown> = {
      eventType,
      resultSummary: summary,
      nextFollowUpPriority: nextPriority,
    };

    if (
      (followUpMode === 'complete' || followUpMode === 'next')
      && detail.currentFollowUp?.canClose
    ) {
      body.currentFollowUpId = detail.currentFollowUp.id;
    }

    if (followUpMode === 'next') {
      if (detail.currentFollowUp && !detail.currentFollowUp.canClose) {
        setSubmitError('当前回访任务由其他人负责，不能在这里替换。你可以先记录本次互动并保留现有安排。');
        return;
      }
      if (!nextTitle.trim()) {
        setSubmitError('安排下一次回访时必须填写具体动作。');
        return;
      }
      const dueAt = toIsoFromShanghaiDateTime(nextDueAt);
      if (!dueAt) {
        setSubmitError('安排下一次回访时必须设置有效时间。');
        return;
      }
      body.nextFollowUpTitle = nextTitle.trim();
      body.nextFollowUpDueAt = dueAt;
    }

    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      const response = await fetch(
        '/api/customer-projects/customers/' + encodeURIComponent(id) + '/follow-up',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const result = await response.json().catch(() => null);

      if (response.ok && result?.ok === true) {
        setSubmitSuccess('已记录客户回访，并同步更新下一次关系动作。');
        setResultSummary('');
        setNextTitle('');
        setNextDueAt('');
        setFollowUpMode('keep');
        await loadCustomer(false);
        return;
      }

      if (response.status === 409) {
        setSubmitError(typeof result?.message === 'string'
          ? result.message
          : '客户回访状态已变化，请刷新后重试。');
        await loadCustomer(false);
      } else if (response.status === 422 || response.status === 400) {
        setSubmitError(typeof result?.message === 'string'
          ? result.message
          : '回访信息不完整，请检查后再提交。');
      } else if (response.status === 403) {
        setSubmitError('你当前只有查看权限，没有该客户的关系回访维护权。');
      } else {
        setSubmitError('客户回访记录失败，请稍后重试。');
      }
    } catch {
      setSubmitError('客户回访记录失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <PageHeader title="客户详情" description="正在读取客户关系..." />
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-72 animate-pulse rounded-lg bg-gray-100" />
        </div>
      </AppLayout>
    );
  }

  if (!detail || loadError) {
    return (
      <AppLayout>
        <PageHeader title="客户详情" description="无法读取客户" />
        <EmptyState
          title={loadError || '客户不存在或不可见'}
          description="客户项目中心不会创建第二套客户主数据来代替外部权威来源。"
          action={{
            label: '返回客户',
            onClick: () => {
              window.location.href = '/customer-projects/customers';
            },
          }}
        />
      </AppLayout>
    );
  }

  const {
    customer,
    currentFollowUp,
    relationshipRecommendation,
    projects,
    events,
  } = detail;

  return (
    <AppLayout>
      <PageHeader
        title={customer.displayName}
        description={
          (customer.referenceKind === 'canonical' ? '正式客户引用' : '临时客户引用')
          + (customer.sourceLabel ? ' · ' + customer.sourceLabel : '')
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={createProjectHref}
              className="btn-primary no-underline"
            >
              形成具体机会，创建项目
            </Link>
            <Link
              href="/customer-projects/customers"
              className="text-sm text-cyan-700 no-underline hover:underline"
            >
              ← 返回客户
            </Link>
          </div>
        }
      />

      <div className="space-y-5">
        <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs text-gray-400">客户引用状态</p>
              <p className="mt-1 text-sm font-medium text-gray-800">{customer.status}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">外部客户 ID</p>
              <p className="mt-1 break-all text-sm text-gray-700">{customer.externalCustomerId || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">外部归属引用</p>
              <p className="mt-1 break-all text-sm text-gray-700">{customer.externalOwnerReference || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">外部同步时间</p>
              <p className="mt-1 text-sm text-gray-700">{formatBusinessDateTime(customer.sourceSyncedAt)}</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-400">
            外部归属信息仅作引用展示，CPC 不在这里编辑客户归属。
          </p>
        </section>

        <Panel
          title="老客户 proactive建议"
          description="建议只依据已确认 CPC 事实，不推断关键客户、交易历史或来源分类；员工确认后才创建正式回访。"
        >
          <div
            id="old-customer-recommendation"
            className="rounded-lg border border-cyan-200 bg-cyan-50 p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-cyan-800">
                {relationshipRecommendation.segment} 类
                {relationshipRecommendation.cadenceDays
                  ? ' · 每 ' + relationshipRecommendation.cadenceDays + ' 天建议'
                  : ''}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-700">
                {recommendationStateLabel(relationshipRecommendation.state)}
              </span>
              <span className="text-[11px] text-gray-500">
                仅建议，不计为逾期、任务或人员 KPI
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-700">
              {relationshipRecommendation.segmentBasis}
            </p>
            <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-gray-500 sm:grid-cols-3">
              <span>
                最近关系互动：
                {formatBusinessDateTime(relationshipRecommendation.lastConfirmedRelationshipAt)}
              </span>
              <span>
                最近可信交易：
                {formatBusinessDateTime(relationshipRecommendation.lastTrustedTransactionAt)}
              </span>
              <span>
                下次建议日期：
                {formatBusinessDateTime(relationshipRecommendation.nextSuggestedFollowUpAt)}
              </span>
            </div>
            {relationshipRecommendation.suppressionReason && (
              <p className="mt-2 text-xs text-amber-700">
                {relationshipRecommendation.suppressionReason}
              </p>
            )}
          </div>

          {customer.canRecordFollowUp && relationshipRecommendation.canArrangeFollowUp ? (
            <form
              onSubmit={scheduleRelationshipFollowUp}
              className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  明确回访时间（东莞时间）
                </label>
                <input
                  type="datetime-local"
                  value={scheduleDueAt}
                  onChange={event => setScheduleDueAt(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  建议日期可作为默认值，最终时间由你确认。
                </p>
              </div>
              <button type="submit" className="btn-primary" disabled={scheduling}>
                {scheduling ? '正在安排...' : '安排回访'}
              </button>
            </form>
          ) : (
            <p className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
              当前状态不创建重复建议。出现具体商业机会时，仍可通过下方入口创建 Project。
            </p>
          )}

          {scheduleError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {scheduleError}
            </div>
          )}
          {scheduleSuccess && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {scheduleSuccess}
            </div>
          )}
        </Panel>

        <Panel
          title="下一次客户级回访"
          description="普通老客户维护留在客户层，不需要为了提醒自己而创建假项目。"
        >
          {currentFollowUp ? (
            <div className={
              'rounded-lg border p-4 '
              + (currentFollowUp.isAssignedToMe
                ? 'border-cyan-200 bg-cyan-50'
                : 'border-gray-200 bg-gray-50')
            }>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-gray-800">{currentFollowUp.title}</p>
                {currentFollowUp.isAssignedToMe && (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-cyan-700">
                    分配给我
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                时间：{currentFollowUp.dueAt ? formatBusinessDateTime(currentFollowUp.dueAt) : '未设置'}
              </p>
              {currentFollowUp.blockedReason && (
                <p className="mt-2 text-xs text-red-600">受阻：{currentFollowUp.blockedReason}</p>
              )}
              {!currentFollowUp.canClose && (
                <p className="mt-2 text-xs text-amber-700">
                  当前任务由其他人负责，你可以记录客户互动，但不能替对方结束/替换该任务。
                </p>
              )}
            </div>
          ) : (
            <EmptyState
              title="当前没有已安排的客户级回访"
              description="可根据上方已批准的 A/B/C 建议由员工明确安排；未确认建议不会自动生成任务。"
            />
          )}
        </Panel>

        <Panel
          title="记录客户回访"
          description="记录关系层面的实际结果；只有出现具体需求、订单或可执行机会时才升级为 Project。"
        >
          {!customer.canRecordFollowUp ? (
            <EmptyState
              title="当前只有查看权限"
              description="客户级回访维护权来自外部客户负责人映射、明确分配的客户回访任务，或自己创建的临时客户引用。"
            />
          ) : (
            <form onSubmit={submitFollowUp} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">这次互动类型</label>
                  <select
                    value={eventType}
                    onChange={event => setEventType(
                      event.target.value as 'CONTACT_LOGGED' | 'CUSTOMER_RESPONSE_RECEIVED',
                    )}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="CONTACT_LOGGED">主动联系 / 回访</option>
                    <option value="CUSTOMER_RESPONSE_RECEIVED">收到客户反馈</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">当前安排</label>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                    {currentFollowUp ? currentFollowUp.title : '暂无客户级回访任务'}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  实际结果 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={resultSummary}
                  onChange={event => setResultSummary(event.target.value)}
                  rows={4}
                  placeholder="例如：客户今年礼品杯项目预计 11 月启动，目前还没确定图稿，约两周后再联系。"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-gray-600">记录后怎么处理</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className={"cursor-pointer rounded-lg border p-3 " + (followUpMode === 'keep' ? 'border-cyan-400 bg-cyan-50' : 'border-gray-200')}>
                    <input
                      type="radio"
                      checked={followUpMode === 'keep'}
                      onChange={() => setFollowUpMode('keep')}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-800">保留当前安排</span>
                    <span className="mt-1 block pl-5 text-xs text-gray-500">只记录本次互动，不结束现有回访。</span>
                  </label>

                  <label className={
                    "rounded-lg border p-3 "
                    + (currentFollowUp?.canClose ? 'cursor-pointer' : 'cursor-not-allowed opacity-50')
                    + (followUpMode === 'complete' ? ' border-cyan-400 bg-cyan-50' : ' border-gray-200')
                  }>
                    <input
                      type="radio"
                      checked={followUpMode === 'complete'}
                      onChange={() => currentFollowUp?.canClose && setFollowUpMode('complete')}
                      disabled={!currentFollowUp?.canClose}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-800">完成当前回访</span>
                    <span className="mt-1 block pl-5 text-xs text-gray-500">完成后暂不设置下一次。</span>
                  </label>

                  <label className={
                    "rounded-lg border p-3 "
                    + (!currentFollowUp || currentFollowUp.canClose ? 'cursor-pointer' : 'cursor-not-allowed opacity-50')
                    + (followUpMode === 'next' ? ' border-cyan-400 bg-cyan-50' : ' border-gray-200')
                  }>
                    <input
                      type="radio"
                      checked={followUpMode === 'next'}
                      onChange={() => (!currentFollowUp || currentFollowUp.canClose) && setFollowUpMode('next')}
                      disabled={!!currentFollowUp && !currentFollowUp.canClose}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-800">安排下一次回访</span>
                    <span className="mt-1 block pl-5 text-xs text-gray-500">结束当前安排并创建下一次动作。</span>
                  </label>
                </div>
              </div>

              {followUpMode === 'next' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">下一次动作</label>
                    <input
                      value={nextTitle}
                      onChange={event => setNextTitle(event.target.value)}
                      placeholder="例如：两周后确认项目是否启动"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">时间（东莞时间）</label>
                    <input
                      type="datetime-local"
                      value={nextDueAt}
                      onChange={event => setNextDueAt(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">优先级</label>
                    <select
                      value={nextPriority}
                      onChange={event => setNextPriority(event.target.value as WorkItemPriority)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="low">低</option>
                      <option value="medium">中</option>
                      <option value="high">高</option>
                      <option value="critical">紧急</option>
                    </select>
                  </div>
                </div>
              )}

              {submitError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {submitError}
                </div>
              )}
              {submitSuccess && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {submitSuccess}
                </div>
              )}

              <div className="flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-400">
                  回访事实只记录一次，后续 Workbench / 报告直接复用。
                </p>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? '正在记录...' : '确认并记录回访'}
                </button>
              </div>
            </form>
          )}
        </Panel>

        <Panel
          title="活跃与近期项目"
          description="客户关系与具体商业机会分开；有机会时进入对应 Project 推进。"
        >
          {projects.length === 0 ? (
            <EmptyState
              title="当前没有可见项目"
              description="普通客户回访不需要创建 Project。"
            />
          ) : (
            <div className="space-y-3">
              {projects.map(project => (
                <Link
                  key={project.id}
                  href={"/customer-projects/projects/" + project.id}
                  className="block rounded-lg border border-gray-200 p-4 no-underline transition hover:border-cyan-300"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-gray-800">{project.title}</p>
                        <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] text-cyan-700">
                          {PROJECT_STATUS_LABELS[project.status]}
                        </span>
                        <span className={"rounded-full px-2 py-0.5 text-[11px] " + projectPriorityTone(project.priority)}>
                          {PROJECT_PRIORITY_LABELS[project.priority]}
                        </span>
                        {project.riskLevel && (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-700">
                            {RISK_LEVEL_LABELS[project.riskLevel]}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        {PROJECT_TYPE_LABELS[project.projectType]}
                        {' · '}
                        {projectStageLabel(project.projectType, project.stage)}
                        {!project.isOwnedByMe ? ' · 非我负责' : ''}
                      </p>
                    </div>
                    <div className="text-xs text-gray-500">
                      {project.status === 'active' && project.waitingOn !== 'none'
                        ? '等待 ' + WAITING_ON_LABELS[project.waitingOn] + ' · ' + formatBusinessDateTime(project.nextCheckAt)
                        : '更新 ' + formatBusinessDateTime(project.updatedAt)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="客户级互动历史"
          description="只记录有意义的关系变化，不要求把每条聊天都抄进系统。"
        >
          {events.length === 0 ? (
            <EmptyState title="暂无客户级互动记录" />
          ) : (
            <ol className="space-y-4">
              {events.map(item => (
                <li key={item.id} className="relative border-l-2 border-gray-200 pl-4">
                  <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-cyan-500" />
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium text-gray-800">{eventLabel(item.eventType)}</p>
                    <time className="text-xs text-gray-400">{formatBusinessDateTime(item.occurredAt)}</time>
                  </div>
                  {item.summary && (
                    <p className="mt-1 text-sm leading-6 text-gray-600">{item.summary}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </AppLayout>
  );
}
