'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ProjectLifecycleSection from './lifecycle-section';
import type {
  ProjectLifecycleStatus,
  ProjectPriority,
  ProjectType,
  RiskLevel,
  WaitingOn,
  WorkItemPriority,
  WorkItemStatus,
  WorkItemType,
} from '@/lib/customer-projects/domain';
import {
  CONSEQUENTIAL_PROGRESS_EVENTS,
  PROGRESS_EVENT_OPTIONS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_STAGE_OPTIONS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  RISK_LEVEL_LABELS,
  WAITING_ON_LABELS,
  WORK_ITEM_STATUS_LABELS,
  WORK_ITEM_TYPE_LABELS,
  formatBusinessDate,
  formatBusinessDateTime,
  projectPriorityTone,
  projectStageLabel,
  toIsoFromShanghaiDateTime,
  type ProgressEventType,
} from '@/lib/customer-projects/presentation';

interface ProjectDetailDto {
  project: {
    id: string;
    title: string;
    objectiveSummary: string;
    projectType: ProjectType;
    status: ProjectLifecycleStatus;
    stage: string;
    waitingOn: WaitingOn;
    nextCheckAt: string | null;
    riskLevel: RiskLevel | null;
    priority: ProjectPriority;
    expectedAmountMinor: number | null;
    currency: string | null;
    expectedCloseDate: string | null;
    version: number;
    updatedAt: string;
  };
  customer: {
    id: string;
    referenceKind: 'canonical' | 'provisional';
    displayName: string;
    status: string;
    externalSource: string | null;
    externalCustomerId: string | null;
  } | null;
  nextAction: {
    id: string;
    title: string;
    dueAt: string | null;
    status: WorkItemStatus;
    priority: WorkItemPriority;
    blockedReason: string | null;
    version: number;
  } | null;
  workItems: Array<{
    id: string;
    workItemType: WorkItemType;
    title: string;
    dueAt: string | null;
    status: WorkItemStatus;
    priority: WorkItemPriority;
    blockedReason: string | null;
    version: number;
    updatedAt: string;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    eventCategory: string;
    occurredAt: string;
    source: string;
    rawInput: string | null;
    evidenceReference: string | null;
    reason: string | null;
  }>;
}

type NextStepMode = 'keep' | 'new_action' | 'waiting';

const EVENT_LABELS = new Map<string, string>(
  PROGRESS_EVENT_OPTIONS.map(option => [option.value, option.label]),
);

const WAITING_OPTIONS = ([
  'customer',
  'internal',
  'supplier',
  'quality',
  'finance',
  'logistics',
  'other',
] as const).map(value => ({
  value,
  label: WAITING_ON_LABELS[value],
}));

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="mb-1 block text-xs font-medium text-gray-600">
      {children}{required ? <span className="ml-1 text-red-500">*</span> : null}
    </label>
  );
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

function eventLabel(eventType: string): string {
  return EVENT_LABELS.get(eventType) ?? eventType;
}

function formatAmount(minor: number | null, currency: string | null): string {
  if (minor === null || !currency) return '-';
  try {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency,
    }).format(minor / 100);
  } catch {
    return currency + ' ' + String(minor / 100);
  }
}

export default function CustomerProjectDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [detail, setDetail] = useState<ProjectDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [eventType, setEventType] = useState<ProgressEventType>('EFFECTIVE_PROGRESS_RECORDED');
  const [summary, setSummary] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [selectedStage, setSelectedStage] = useState('');
  const [nextStepMode, setNextStepMode] = useState<NextStepMode>('keep');
  const [nextActionTitle, setNextActionTitle] = useState('');
  const [nextActionDueAt, setNextActionDueAt] = useState('');
  const [waitingOn, setWaitingOn] = useState<Exclude<WaitingOn, 'none'>>('customer');
  const [nextCheckAt, setNextCheckAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  const loadProject = useCallback(async (showLoading = true) => {
    if (!id) return;
    if (showLoading) setLoading(true);

    try {
      const response = await fetch(
        '/api/customer-projects/projects/' + encodeURIComponent(id),
        { cache: 'no-store' },
      );
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true && body.data) {
        const nextDetail = body.data as ProjectDetailDto;
        setDetail(nextDetail);
        setSelectedStage(nextDetail.project.stage);
        setLoadError('');
      } else if (response.status === 401) {
        setLoadError('登录状态已失效，请重新登录。');
        setDetail(null);
      } else if (response.status === 403) {
        setLoadError('你没有权限查看这个项目。');
        setDetail(null);
      } else if (response.status === 404) {
        setLoadError('项目不存在或当前不可见。');
        setDetail(null);
      } else {
        setLoadError('项目详情加载失败，请稍后重试。');
        setDetail(null);
      }
    } catch {
      setLoadError('项目详情加载失败，请稍后重试。');
      setDetail(null);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadProject(true);
  }, [loadProject]);

  const requiresEvidence = CONSEQUENTIAL_PROGRESS_EVENTS.has(eventType);

  const currentNextStepText = useMemo(() => {
    if (!detail) return '';
    if (detail.project.status === 'paused') {
      return '项目已暂停 · 下次检查 ' + formatBusinessDateTime(detail.project.nextCheckAt);
    }
    if (detail.project.status !== 'active') {
      return '当前状态：' + PROJECT_STATUS_LABELS[detail.project.status];
    }
    if (detail.project.waitingOn !== 'none') {
      return '等待 ' + WAITING_ON_LABELS[detail.project.waitingOn]
        + ' · ' + formatBusinessDateTime(detail.project.nextCheckAt);
    }
    if (detail.nextAction) {
      return detail.nextAction.title
        + (detail.nextAction.dueAt
          ? ' · ' + formatBusinessDateTime(detail.nextAction.dueAt)
          : '');
    }
    return '活跃项目当前没有下一步/等待状态';
  }, [detail]);

  async function submitProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !id || submitting) return;

    const trimmedSummary = summary.trim();
    if (!trimmedSummary) {
      setSubmitError('请写清楚这次实际发生了什么。');
      return;
    }

    const evidence = evidenceReference.trim();
    if (requiresEvidence && !evidence) {
      setSubmitError('这个业务事实需要填写可追溯的证据，例如报价文件、客户确认消息或订单凭证。');
      return;
    }

    const payload: Record<string, unknown> = {};
    if (requiresEvidence) payload.evidence_reference = evidence;

    const requestBody: Record<string, unknown> = {
      expectedVersion: detail.project.version,
      eventType,
      rawInput: trimmedSummary,
      payload,
    };

    if (selectedStage && selectedStage !== detail.project.stage) {
      requestBody.newStage = selectedStage;
    }

    if (nextStepMode === 'new_action') {
      if (!nextActionTitle.trim()) {
        setSubmitError('设置新下一步时，请填写下一步动作。');
        return;
      }
      requestBody.nextActionTitle = nextActionTitle.trim();
      requestBody.nextActionDueAt = nextActionDueAt
        ? toIsoFromShanghaiDateTime(nextActionDueAt)
        : null;
      if (nextActionDueAt && !requestBody.nextActionDueAt) {
        setSubmitError('下一步时间格式无效。');
        return;
      }
    } else if (nextStepMode === 'waiting') {
      if (!nextCheckAt) {
        setSubmitError('进入等待状态时必须设置下一次检查时间。');
        return;
      }
      const checkAtIso = toIsoFromShanghaiDateTime(nextCheckAt);
      if (!checkAtIso) {
        setSubmitError('检查时间格式无效。');
        return;
      }
      requestBody.waitingOn = waitingOn;
      requestBody.nextCheckAt = checkAtIso;
    }

    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      const response = await fetch(
        '/api/customer-projects/projects/' + encodeURIComponent(id) + '/progress',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
      );
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true) {
        setSubmitSuccess('已记录这次推进，并同步刷新项目的下一步/等待状态。');
        setSummary('');
        setEvidenceReference('');
        setNextStepMode('keep');
        setNextActionTitle('');
        setNextActionDueAt('');
        setNextCheckAt('');
        await loadProject(false);
      } else if (response.status === 409) {
        setSubmitError(typeof body?.message === 'string'
          ? body.message
          : '项目刚刚被其他操作更新，请刷新后重试。');
        await loadProject(false);
      } else if (response.status === 422 || response.status === 400) {
        setSubmitError(typeof body?.message === 'string'
          ? body.message
          : '提交内容不完整，请检查后再确认。');
      } else if (response.status === 403) {
        setSubmitError('你没有权限更新这个项目。');
      } else {
        setSubmitError('记录失败，请稍后重试。');
      }
    } catch {
      setSubmitError('记录失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <PageHeader title="项目详情" description="正在读取项目..." />
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
        <PageHeader title="项目详情" description="无法读取项目" />
        <EmptyState
          title={loadError || '项目不存在或不可见'}
          description="客户项目中心不会用模拟项目替代正式业务数据。"
          action={{ label: '返回工作台', onClick: () => { window.location.href = '/customer-projects'; } }}
        />
      </AppLayout>
    );
  }

  const { project, customer, nextAction, workItems, events } = detail;

  return (
    <AppLayout>
      <PageHeader
        title={project.title}
        description={(customer?.displayName ?? '未关联客户') + ' · ' + PROJECT_TYPE_LABELS[project.projectType]}
        actions={
          <Link href="/customer-projects" className="text-sm text-cyan-700 no-underline hover:underline">
            ← 返回工作台
          </Link>
        }
      />

      <div className="space-y-5">
        <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700">
                  {PROJECT_STATUS_LABELS[project.status]}
                </span>
                <span className={"rounded-full px-2.5 py-1 text-xs font-medium " + projectPriorityTone(project.priority)}>
                  {PROJECT_PRIORITY_LABELS[project.priority]}优先级
                </span>
                {project.riskLevel && (
                  <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                    {RISK_LEVEL_LABELS[project.riskLevel]}
                  </span>
                )}
              </div>
              <p className="mt-4 text-sm leading-6 text-gray-700">{project.objectiveSummary}</p>
            </div>
            <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:min-w-[480px]">
              <div><dt className="text-xs text-gray-400">当前阶段</dt><dd className="mt-1 font-medium text-gray-700">{projectStageLabel(project.projectType, project.stage)}</dd></div>
              <div><dt className="text-xs text-gray-400">客户类型</dt><dd className="mt-1">{customer ? (customer.referenceKind === 'canonical' ? '正式客户' : '临时客户') : '未映射'}</dd></div>
              <div><dt className="text-xs text-gray-400">预期金额</dt><dd className="mt-1">{formatAmount(project.expectedAmountMinor, project.currency)}</dd></div>
              <div><dt className="text-xs text-gray-400">预计成交</dt><dd className="mt-1">{formatBusinessDate(project.expectedCloseDate)}</dd></div>
              <div><dt className="text-xs text-gray-400">项目版本</dt><dd className="mt-1">v{project.version}</dd></div>
              <div><dt className="text-xs text-gray-400">最近更新</dt><dd className="mt-1">{formatBusinessDateTime(project.updatedAt)}</dd></div>
            </dl>
          </div>
        </section>

        <Panel
          title="当前下一步"
          description="活跃项目始终应该有一个明确的下一步，或者一个等待对象 + 检查时间。"
        >
          <div className={project.status === 'paused'
            ? 'rounded-lg border border-amber-200 bg-amber-50 p-4'
            : project.status !== 'active'
              ? 'rounded-lg border border-gray-200 bg-gray-50 p-4'
              : project.waitingOn !== 'none'
                ? 'rounded-lg border border-amber-200 bg-amber-50 p-4'
                : nextAction
                  ? 'rounded-lg border border-cyan-200 bg-cyan-50 p-4'
                  : 'rounded-lg border border-red-200 bg-red-50 p-4'}
          >
            <p className="text-sm font-medium text-gray-800">{currentNextStepText}</p>
            {nextAction?.blockedReason && (
              <p className="mt-2 text-xs text-red-700">受阻原因：{nextAction.blockedReason}</p>
            )}
          </div>
        </Panel>

        <Panel
          title="记录有意义的进展"
          description="一次确认完成：发生了什么 → 关键证据 → 保留/更新下一步或进入等待。普通聊天不需要每条都登记。"
        >
          {project.status !== 'active' ? (
            <EmptyState
              title={"当前项目状态：" + PROJECT_STATUS_LABELS[project.status]}
              description="非活跃项目暂不从这里记录新的推进；项目生命周期操作会在后续受控界面接入。"
            />
          ) : (
            <form onSubmit={submitProgress} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel required>这次发生了什么类型的变化</FieldLabel>
                  <select
                    value={eventType}
                    onChange={event => setEventType(event.target.value as ProgressEventType)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  >
                    {PROGRESS_EVENT_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>更新后的项目阶段</FieldLabel>
                  <select
                    value={selectedStage || project.stage}
                    onChange={event => setSelectedStage(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  >
                    {PROJECT_STAGE_OPTIONS[project.projectType].map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-gray-400">
                    当前：{projectStageLabel(project.projectType, project.stage)}。可按真实业务位置直接选择有效阶段，后台仍会再次校验。
                  </p>
                </div>
              </div>

              <div>
                <FieldLabel required>实际发生了什么</FieldLabel>
                <textarea
                  value={summary}
                  onChange={event => setSummary(event.target.value)}
                  rows={4}
                  placeholder="例如：客户确认样品颜色OK，要求本周五前给正式报价。"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              {requiresEvidence && (
                <div>
                  <FieldLabel required>可追溯证据</FieldLabel>
                  <input
                    value={evidenceReference}
                    onChange={event => setEvidenceReference(event.target.value)}
                    placeholder="例如：企业微信报价文件 Q-2026-018 / 客户确认消息 / PO 编号"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">报价已发、样品已发、客户确认、商务确认、订单确认不能由 AI 自动认定。</p>
                </div>
              )}

              <div>
                <FieldLabel required>这次记录后，下一步怎么处理</FieldLabel>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {([
                    ['keep', '保留当前下一步', '当前安排仍然有效'],
                    ['new_action', '设置新下一步', '推进后产生新的动作'],
                    ['waiting', '进入等待', '下一步属于客户/内部/供应商等'],
                  ] as const).map(([value, label, desc]) => (
                    <label
                      key={value}
                      className={"cursor-pointer rounded-lg border p-3 " + (nextStepMode === value
                        ? 'border-cyan-400 bg-cyan-50'
                        : 'border-gray-200 bg-white')}
                    >
                      <input
                        type="radio"
                        name="next-step-mode"
                        value={value}
                        checked={nextStepMode === value}
                        onChange={() => setNextStepMode(value)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-800">{label}</span>
                      <span className="mt-1 block pl-5 text-xs text-gray-500">{desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              {nextStepMode === 'new_action' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel required>新的下一步动作</FieldLabel>
                    <input
                      value={nextActionTitle}
                      onChange={event => setNextActionTitle(event.target.value)}
                      placeholder="例如：周五前发送正式报价"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <FieldLabel>到期时间（东莞时间）</FieldLabel>
                    <input
                      type="datetime-local"
                      value={nextActionDueAt}
                      onChange={event => setNextActionDueAt(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}

              {nextStepMode === 'waiting' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel required>等待谁/哪个环节</FieldLabel>
                    <select
                      value={waitingOn}
                      onChange={event => setWaitingOn(event.target.value as Exclude<WaitingOn, 'none'>)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      {WAITING_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel required>下一次检查时间（东莞时间）</FieldLabel>
                    <input
                      type="datetime-local"
                      value={nextCheckAt}
                      onChange={event => setNextCheckAt(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
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
                <p className="text-xs text-gray-400">只有你点击确认后，才会写入正式项目事实。</p>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? '正在记录...' : '确认并记录进展'}
                </button>
              </div>
            </form>
          )}
        </Panel>

        <ProjectLifecycleSection
          projectId={project.id}
          status={project.status}
          version={project.version}
          customerReferenceKind={customer?.referenceKind ?? null}
          onChanged={() => loadProject(false)}
        />

        <Panel
          title="项目任务"
          description="这里只展示这个项目已经存在的任务；不会为了展示等待状态再制造一个重复任务。"
        >
          {workItems.length === 0 ? (
            <EmptyState title="这个项目暂无任务记录" />
          ) : (
            <div className="divide-y divide-gray-100">
              {workItems.slice(0, 20).map(item => (
                <div key={item.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-cyan-700">{WORK_ITEM_TYPE_LABELS[item.workItemType]}</span>
                      <span className="text-xs text-gray-400">{WORK_ITEM_STATUS_LABELS[item.status]}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-800">{item.title}</p>
                    {item.blockedReason && <p className="mt-1 text-xs text-red-600">受阻：{item.blockedReason}</p>}
                  </div>
                  <span className="text-xs text-gray-500">{item.dueAt ? formatBusinessDateTime(item.dueAt) : '未设到期'}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="已确认的项目历史"
          description="按时间查看有意义的业务变化；报价、订单等关键节点保留证据引用。"
        >
          {events.length === 0 ? (
            <EmptyState title="暂无项目历史" />
          ) : (
            <ol className="space-y-4">
              {events.map(item => (
                <li key={item.id} className="relative border-l-2 border-gray-200 pl-4">
                  <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-cyan-500" />
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium text-gray-800">{eventLabel(item.eventType)}</p>
                    <time className="text-xs text-gray-400">{formatBusinessDateTime(item.occurredAt)}</time>
                  </div>
                  {item.rawInput && <p className="mt-1 text-sm leading-6 text-gray-600">{item.rawInput}</p>}
                  {item.evidenceReference && (
                    <p className="mt-1 text-xs text-gray-500">证据：{item.evidenceReference}</p>
                  )}
                  {item.reason && <p className="mt-1 text-xs text-gray-500">原因：{item.reason}</p>}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </AppLayout>
  );
}
