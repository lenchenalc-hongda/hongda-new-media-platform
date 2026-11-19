'use client';

import { type ReactNode, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import {
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  RISK_LEVEL_LABELS,
  WAITING_ON_LABELS,
  WORK_ITEM_STATUS_LABELS,
  WORK_ITEM_TYPE_LABELS,
  formatBusinessDateTime,
  projectPriorityTone,
  projectStageLabel,
} from '@/lib/customer-projects/presentation';
import type {
  TeamBoardCommitmentException,
  TeamBoardDecisionItem,
  TeamBoardDueState,
  TeamBoardPortfolioIdentityState,
  TeamBoardPortfolioTask,
  TeamBoardProjectException,
  TeamBoardProjectPortfolioRow,
  TeamBoardProjectPortfolioLifecycleFilter,
  TeamBoardProjectPortfolioRiskFilter,
  TeamMemberSupportContext,
  TeamBoardSnapshot,
} from '@/lib/customer-projects/team-board';
import {
  TEAM_PROJECT_PORTFOLIO_LIFECYCLE_FILTERS,
  selectTeamProjectPortfolioView,
} from '@/lib/customer-projects/team-board';

const PROJECT_STATE_ORDER = ['active', 'paused', 'won', 'lost', 'cancelled'] as const;

function Section({
  id,
  title,
  description,
  count,
  children,
}: {
  id: string;
  title: string;
  description: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section id={id} className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
        {typeof count === 'number' && (
          <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
            {count} 项
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  reason,
}: {
  label: string;
  value: string | number;
  reason?: string | null;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-800">{value}</p>
      {reason && <p className="mt-1 text-[11px] leading-4 text-amber-700">{reason}</p>}
    </div>
  );
}

function sourceCategoryMetric(
  metric: TeamBoardSnapshot['oldCustomerCoverage']['sourceCategories'][
    keyof TeamBoardSnapshot['oldCustomerCoverage']['sourceCategories']
  ],
): { value: string | number; reason?: string | null } {
  if (metric.state === 'unknown') {
    return { value: '未知', reason: metric.reason };
  }
  const conversion = metric.value.explicitFollowUpToProjectConversion;
  if (conversion.state === 'unknown') {
    return { value: '未知', reason: conversion.reason };
  }
  return {
    value: conversion.value,
    reason: '仅统计已显式记录“回访事件 -> Project”来源的转化。',
  };
}

function workPriorityTone(priority: string): string {
  if (priority === 'critical') return 'bg-red-50 text-red-700';
  if (priority === 'high') return 'bg-amber-50 text-amber-700';
  if (priority === 'medium') return 'bg-blue-50 text-blue-700';
  return 'bg-gray-100 text-gray-600';
}

function dueStateLabel(state: TeamBoardDueState): string {
  if (state === 'overdue') return '已逾期';
  if (state === 'due_now') return '今天到期';
  if (state === 'scheduled') return '未到期';
  return '未设时间';
}

function dueStateTone(state: TeamBoardDueState): string {
  if (state === 'overdue') return 'bg-red-50 text-red-700';
  if (state === 'due_now') return 'bg-amber-50 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

function WorkContext({
  customer,
  project,
}: {
  customer: TeamBoardDecisionItem['customer'];
  project: TeamBoardDecisionItem['project'];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
      {customer && <span>客户：{customer.displayName}</span>}
      {project && <span>项目：{project.title}</span>}
    </div>
  );
}

function DecisionCard({ item }: { item: TeamBoardDecisionItem }) {
  return (
    <article className="rounded-lg border border-red-200 bg-red-50/30 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
              管理决策
            </span>
            <span className={'rounded-full px-2 py-0.5 text-[11px] font-medium ' + workPriorityTone(item.priority)}>
              {PROJECT_PRIORITY_LABELS[item.priority]}
            </span>
            <span className={'rounded-full px-2 py-0.5 text-[11px] ' + dueStateTone(item.dueState)}>
              {dueStateLabel(item.dueState)}
            </span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-500">
              {WORK_ITEM_STATUS_LABELS[item.status]}
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-gray-800">{item.title}</h3>
          <WorkContext customer={item.customer} project={item.project} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>截止：{formatBusinessDateTime(item.dueAt)}</span>
            <span>负责人：{item.assignee?.displayName ?? '未知'}</span>
            <span>创建人：{item.creator?.displayName ?? '未知'}</span>
          </div>
          {item.blockedReason && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              受阻原因：{item.blockedReason}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {item.project && (
            <Link
              href={'/customer-projects/projects/' + item.project.id}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 no-underline"
            >
              查看项目
            </Link>
          )}
          {item.customer && (
            <Link
              href={'/customer-projects/customers/' + item.customer.id}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 no-underline"
            >
              查看客户
            </Link>
          )}
          <Link
            href="/customer-projects/tasks"
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 no-underline"
          >
            查看任务
          </Link>
        </div>
      </div>
    </article>
  );
}

function CommitmentCard({ item }: { item: TeamBoardCommitmentException }) {
  return (
    <article className="rounded-lg border border-amber-200 bg-amber-50/30 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              客户承诺
            </span>
            <span className={'rounded-full px-2 py-0.5 text-[11px] ' + dueStateTone(item.dueState)}>
              {dueStateLabel(item.dueState)}
            </span>
            <span className={'rounded-full px-2 py-0.5 text-[11px] ' + workPriorityTone(item.priority)}>
              {PROJECT_PRIORITY_LABELS[item.priority]}
            </span>
            {item.blocked && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-700">
                受阻但未自动延期
              </span>
            )}
          </div>
          <h3 className="mt-2 text-sm font-semibold text-gray-800">{item.title}</h3>
          <WorkContext customer={item.customer} project={item.project} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>承诺时间：{formatBusinessDateTime(item.dueAt)}</span>
            <span>负责人：{item.assignee?.displayName ?? '未知'}</span>
          </div>
          {item.blockedReason && (
            <p className="mt-2 text-xs text-amber-800">受阻原因：{item.blockedReason}</p>
          )}
        </div>
        {item.project && (
          <Link
            href={'/customer-projects/projects/' + item.project.id}
            className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 no-underline"
          >
            查看项目
          </Link>
        )}
      </div>
    </article>
  );
}

const PROJECT_EXCEPTION_LABELS: Record<
  TeamBoardProjectException['reasons'][number],
  string
> = {
  overdue_next_action: '下一步已逾期',
  blocked_next_action: '下一步受阻',
  waiting_check_due: '等待检查已到期',
  missing_next_action: '缺少下一步 / 等待状态',
  high_risk_project: '项目标记高风险',
};

function ProjectExceptionCard({ item }: { item: TeamBoardProjectException }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {item.reasons.map(reason => (
              <span
                key={reason}
                className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700"
              >
                {PROJECT_EXCEPTION_LABELS[reason]}
              </span>
            ))}
            <span className={'rounded-full px-2 py-0.5 text-[11px] ' + projectPriorityTone(item.priority)}>
              {PROJECT_PRIORITY_LABELS[item.priority]}
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-gray-800">{item.title}</h3>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>客户：{item.customer?.displayName ?? '未显示客户名称'}</span>
            <span>负责人：{item.owner?.displayName ?? '未知'}</span>
            <span>阶段：{projectStageLabel(item.projectType, item.stage)}</span>
            {item.riskLevel && <span>风险：{RISK_LEVEL_LABELS[item.riskLevel]}</span>}
          </div>
          {item.nextAction && (
            <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <p className="font-medium">下一步：{item.nextAction.title}</p>
              <p className="mt-1">
                {formatBusinessDateTime(item.nextAction.dueAt)}
                {' · '}
                {WORK_ITEM_STATUS_LABELS[item.nextAction.status]}
              </p>
              {item.nextAction.blockedReason && (
                <p className="mt-1 text-amber-700">受阻原因：{item.nextAction.blockedReason}</p>
              )}
            </div>
          )}
          {item.waiting && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              等待 {WAITING_ON_LABELS[item.waiting.waitingOn]}
              {' · '}
              检查 {formatBusinessDateTime(item.waiting.nextCheckAt)}
            </div>
          )}
        </div>
        <Link
          href={'/customer-projects/projects/' + item.projectId}
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 no-underline"
        >
          查看项目
        </Link>
      </div>
    </article>
  );
}

function MemberCard({ member }: { member: TeamMemberSupportContext }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{member.displayName}</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {member.department || '未设置部门'}
            {' · '}
            {member.role}
          </p>
        </div>
        {member.weeklyReportContext && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
            已提交周报 {member.weeklyReportContext.periodStart}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {[
          ['开放工作', member.openWorkItemCount],
          ['受阻', member.blockedWorkItemCount],
          ['已到期', member.overdueWorkItemCount],
          ['推进中项目', member.activeProjectCount],
          ['等待检查', member.waitingProjectCount],
          ['管理决策', member.managementDecisionCount],
          ['内部协作', member.internalCollaborationCount],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] text-gray-500">{label}</p>
            <p className="mt-0.5 text-base font-semibold text-gray-800">{value}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function portfolioIdentityLabel(
  identity: TeamBoardPortfolioTask['assignee'],
  state: TeamBoardPortfolioIdentityState,
): string {
  if (!identity) return '负责人资料不可用';
  return identity.displayName + (state === 'inactive' ? '（已停用）' : '');
}

function portfolioDueLabel(task: TeamBoardPortfolioTask): string {
  if (!task.dueStateKnown) return '截止时间未知';
  if (task.dueState === 'no_due') return '未设截止时间';
  return dueStateLabel(task.dueState)
    + ' · '
    + formatBusinessDateTime(task.dueAt);
}

function portfolioDueTone(task: TeamBoardPortfolioTask): string {
  if (!task.dueStateKnown) return 'bg-amber-50 text-amber-700';
  if (task.dueState === 'overdue') return 'bg-red-50 text-red-700';
  if (task.dueState === 'due_now') return 'bg-amber-50 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

function PortfolioTaskLine({ task }: { task: TeamBoardPortfolioTask }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs font-medium text-gray-700">{task.title}</p>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
          {WORK_ITEM_TYPE_LABELS[task.workItemType]}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
          {WORK_ITEM_STATUS_LABELS[task.status]}
        </span>
        {task.blocked && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
            受阻
          </span>
        )}
        <span className={'rounded-full px-2 py-0.5 text-[11px] ' + portfolioDueTone(task)}>
          {portfolioDueLabel(task)}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">
        执行人：{portfolioIdentityLabel(task.assignee, task.assigneeState)}
        {' · '}
        优先级：{PROJECT_PRIORITY_LABELS[task.priority]}
      </p>
      {task.blockedReason && (
        <p className="mt-1 text-[11px] text-red-700">受阻原因：{task.blockedReason}</p>
      )}
    </div>
  );
}

function ProjectPortfolioCard({ project }: { project: TeamBoardProjectPortfolioRow }) {
  const additionalWork = project.workItems.filter(
    item => item.id !== project.nextAction?.id,
  );

  return (
    <article className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={'/customer-projects/projects/' + project.id}
              className="text-sm font-semibold text-gray-800 no-underline hover:text-blue-700"
            >
              {project.title}
            </Link>
            <span className={'rounded-full px-2 py-0.5 text-[11px] ' + projectPriorityTone(project.priority)}>
              {PROJECT_PRIORITY_LABELS[project.priority]}
            </span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600">
              {PROJECT_STATUS_LABELS[project.status]}
            </span>
            {project.riskLevel && (
              <span
                className={
                  'rounded-full px-2 py-0.5 text-[11px] '
                  + (project.riskLevel === 'high'
                    ? 'bg-red-50 text-red-700'
                    : project.riskLevel === 'medium'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-blue-50 text-blue-700')
                }
              >
                {RISK_LEVEL_LABELS[project.riskLevel]}
              </span>
            )}
            {!project.riskLevel && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                风险未标记
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>负责人：{portfolioIdentityLabel(project.owner, project.ownerState)}</span>
            <span>阶段：{projectStageLabel(project.projectType, project.stage)}</span>
            <span>更新：{formatBusinessDateTime(project.updatedAt)}</span>
            {project.customer ? (
              <Link
                href={'/customer-projects/customers/' + project.customer.id}
                className="text-gray-600 no-underline hover:text-blue-700"
              >
                客户：{project.customer.displayName}
              </Link>
            ) : (
              <span className="text-amber-700">客户资料不可用</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-white px-2 py-0.5 text-gray-600">
              开放工作 {project.openWorkItemCount}
            </span>
            <span
              className={
                'rounded-full px-2 py-0.5 '
                + (project.overdueWorkItemCount > 0
                  ? 'bg-red-50 font-medium text-red-700'
                  : 'bg-white text-gray-600')
              }
            >
              逾期 {project.overdueWorkItemCount}
            </span>
            <span
              className={
                'rounded-full px-2 py-0.5 '
                + (project.blockedWorkItemCount > 0
                  ? 'bg-red-50 font-medium text-red-700'
                  : 'bg-white text-gray-600')
              }
            >
              受阻 {project.blockedWorkItemCount}
            </span>
            {project.waitingOn !== 'none' && (
              <span
                className={
                  'rounded-full px-2 py-0.5 '
                  + (project.nextCheckDue
                    ? 'bg-red-50 font-medium text-red-700'
                    : 'bg-amber-50 text-amber-700')
                }
              >
                等待{WAITING_ON_LABELS[project.waitingOn]}
                {' · '}
                {project.nextCheckAt && project.nextCheckDue !== null
                  ? '检查 ' + formatBusinessDateTime(project.nextCheckAt)
                  : '检查时间未知'}
                {project.nextCheckDue ? ' · 已到期' : ''}
              </span>
            )}
            {project.waitingOn === 'none' && (
              <span className="rounded-full bg-white px-2 py-0.5 text-gray-500">
                当前无等待检查
              </span>
            )}
          </div>
        </div>
        <Link
          href={'/customer-projects/projects/' + project.id}
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 no-underline"
        >
          查看项目
        </Link>
      </div>

      <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-[11px] font-medium text-gray-500">下一步 / NEXT_ACTION</p>
        {project.nextAction ? (
          <div className="mt-2">
            <PortfolioTaskLine task={project.nextAction} />
          </div>
        ) : (
          <p
            className={
              'mt-1 text-xs '
              + (project.status === 'active' ? 'text-red-700' : 'text-gray-500')
            }
          >
            {project.status === 'active'
              ? '缺少开放下一步'
              : '当前状态无开放下一步'}
          </p>
        )}
      </div>

      {additionalWork.length > 0 && (
        <details className="mt-2 rounded-lg border border-gray-200 bg-white">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-600">
            其他当前工作 {additionalWork.length}
          </summary>
          <div className="space-y-2 border-t border-gray-200 p-3">
            {additionalWork.map(task => (
              <PortfolioTaskLine key={task.id} task={task} />
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

function PersonPortfolioCard({
  person,
}: {
  person: ReturnType<typeof selectTeamProjectPortfolioView>['people'][number];
}) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{person.displayName}</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {person.department || '未设置部门'}
            {' · '}
            {person.state === 'unavailable' ? '负责人资料不可用' : person.role}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
            当前项目 {person.projectCount}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
            当前工作 {person.openWorkItemCount}
          </span>
        </div>
      </div>
      {person.projects.length === 0 ? (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-3 text-xs text-gray-500">
          当前筛选下没有由本人负责的项目；该成员仍保留在团队列表中。
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {person.projects.map(project => (
            <ProjectPortfolioCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </article>
  );
}

export default function TeamClient({
  snapshot,
  error,
}: {
  snapshot: TeamBoardSnapshot | null;
  error: string;
}) {
  const [portfolioTab, setPortfolioTab] = useState<'person' | 'project'>('person');
  const [portfolioQuery, setPortfolioQuery] = useState('');
  const [employeeKey, setEmployeeKey] = useState('all');
  const [portfolioLifecycle, setPortfolioLifecycle] =
    useState<TeamBoardProjectPortfolioLifecycleFilter>('active');
  const [portfolioRisk, setPortfolioRisk] =
    useState<TeamBoardProjectPortfolioRiskFilter>('all');
  const portfolioView = snapshot
    ? selectTeamProjectPortfolioView(snapshot.projectPortfolio, {
        query: portfolioQuery,
        employeeKey,
        lifecycle: portfolioLifecycle,
        risk: portfolioRisk,
      })
    : { projects: [], people: [] };

  return (
    <AppLayout>
      <PageHeader
        title="团队看板"
        description="管理层异常与支持视图：只读呈现已确认事实，不用于人员比较，也不推断缺失的外部经营数据。"
      />

      {error ? (
        <EmptyState title={error} />
      ) : !snapshot ? (
        <EmptyState title="团队看板暂无可显示数据" />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Metric label="管理决策" value={snapshot.summary.managementDecisionCount} />
            <Metric label="承诺例外" value={snapshot.summary.commitmentExceptionCount} />
            <Metric label="项目例外" value={snapshot.summary.projectExceptionCount} />
            <Metric label="推进中项目" value={snapshot.summary.activeProjectCount} />
            <Metric label="开放正式工作" value={snapshot.summary.openWorkItemCount} />
          </div>

          <Section
            id="management-decisions"
            title="1. 管理决策"
            description="来自正式 MANAGEMENT_DECISION WorkItem 的开放事项，优先显示已逾期和今天到期。"
            count={snapshot.managementDecisions.length}
          >
            {snapshot.managementDecisions.length === 0 ? (
              <EmptyState title="当前没有开放的管理决策" />
            ) : (
              <div className="space-y-3">
                {snapshot.managementDecisions.map(item => (
                  <DecisionCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </Section>

          <Section
            id="commitment-exceptions"
            title="2. 客户承诺 / 交付关键例外"
            description="只使用正式 CUSTOMER_COMMITMENT 的确认时间；未批准 due-soon 窗口，因此只显示今天到期和已逾期。"
            count={snapshot.commitmentExceptions.length}
          >
            {snapshot.commitmentExceptions.length === 0 ? (
              <EmptyState
                title="当前没有到期的客户承诺例外"
                description="未来承诺仍保留在正式任务中，不会提前标为逾期。"
              />
            ) : (
              <div className="space-y-3">
                {snapshot.commitmentExceptions.map(item => (
                  <CommitmentCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </Section>

          <Section
            id="project-exceptions"
            title="3. 项目例外"
            description="来自正式项目、NEXT_ACTION 和 waiting/check 字段；未批准 stale 阈值，因此不推断停滞。"
            count={snapshot.projectExceptions.length}
          >
            {snapshot.projectExceptions.length === 0 ? (
              <EmptyState title="当前没有确定性项目例外" />
            ) : (
              <div className="space-y-3">
                {snapshot.projectExceptions.map(item => (
                  <ProjectExceptionCard key={item.projectId} item={item} />
                ))}
              </div>
            )}
          </Section>

          <Section
            id="team-support"
            title="4. 团队项目组合"
            description="按人员或项目双向查看真实负责人、当前工作与等待检查；不推断个人评价、SLA、自动进度或项目完成度。"
            count={
              portfolioTab === 'person'
                ? portfolioView.people.length
                : portfolioView.projects.length
            }
          >
            <div
              className="flex flex-wrap gap-2"
              role="tablist"
              aria-label="团队项目组合视图"
            >
              <button
                type="button"
                role="tab"
                aria-selected={portfolioTab === 'person'}
                onClick={() => setPortfolioTab('person')}
                className={
                  'rounded-lg px-3 py-1.5 text-sm '
                  + (portfolioTab === 'person'
                    ? 'bg-gray-800 font-medium text-white'
                    : 'border border-gray-300 bg-white text-gray-600')
                }
              >
                按人员
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={portfolioTab === 'project'}
                onClick={() => setPortfolioTab('project')}
                className={
                  'rounded-lg px-3 py-1.5 text-sm '
                  + (portfolioTab === 'project'
                    ? 'bg-gray-800 font-medium text-white'
                    : 'border border-gray-300 bg-white text-gray-600')
                }
              >
                按项目
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs text-gray-600">
                搜索
                <input
                  type="search"
                  value={portfolioQuery}
                  onChange={event => setPortfolioQuery(event.target.value)}
                  placeholder="负责人、项目或客户名称"
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
                />
              </label>
              <label className="text-xs text-gray-600">
                员工
                <select
                  value={employeeKey}
                  onChange={event => setEmployeeKey(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
                >
                  <option value="all">全部员工</option>
                  {snapshot.projectPortfolio.people.map(person => (
                    <option key={person.key} value={person.key}>
                      {person.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-600">
                项目状态
                <select
                  value={portfolioLifecycle}
                  onChange={event => setPortfolioLifecycle(
                    event.target.value as TeamBoardProjectPortfolioLifecycleFilter,
                  )}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
                >
                  {TEAM_PROJECT_PORTFOLIO_LIFECYCLE_FILTERS.map(status => (
                    <option key={status} value={status}>
                      {status === 'all' ? '全部状态' : PROJECT_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-600">
                风险
                <select
                  value={portfolioRisk}
                  onChange={event => setPortfolioRisk(
                    event.target.value as TeamBoardProjectPortfolioRiskFilter,
                  )}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
                >
                  <option value="all">全部风险</option>
                  <option value="high">高风险</option>
                  <option value="medium">中风险</option>
                  <option value="low">低风险</option>
                  <option value="unknown">未标记风险</option>
                </select>
              </label>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-500">
                默认显示推进中项目；暂停、赢单、流失与取消可通过状态筛选查看。
                当前结果：{portfolioView.projects.length} 个项目。
              </p>
              {(portfolioQuery || employeeKey !== 'all' || portfolioLifecycle !== 'active' || portfolioRisk !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setPortfolioQuery('');
                    setEmployeeKey('all');
                    setPortfolioLifecycle('active');
                    setPortfolioRisk('all');
                  }}
                  className="text-xs text-blue-700"
                >
                  重置筛选
                </button>
              )}
            </div>

            {portfolioTab === 'person' && portfolioView.people.length > 0 ? (
              <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                {portfolioView.people.map(person => (
                  <PersonPortfolioCard key={person.key} person={person} />
                ))}
              </div>
            ) : portfolioTab === 'project' && portfolioView.projects.length > 0 ? (
              <div className="mt-3 space-y-3">
                {portfolioView.projects.map(project => (
                  <ProjectPortfolioCard key={project.id} project={project} />
                ))}
              </div>
            ) : (
              <div className="mt-3">
                <EmptyState
                  title={
                    snapshot.projectPortfolio.projects.length === 0
                      ? '同组织暂无正式项目'
                      : '当前筛选下没有匹配项目'
                  }
                  description={
                    snapshot.projectPortfolio.projects.length === 0
                      ? '零项目状态不代表员工表现或经营结果；可继续查看下方团队支持上下文。'
                      : '可调整员工、生命周期、风险或搜索条件。团队成员在无匹配项目时仍会保留。'
                  }
                />
              </div>
            )}

            <details className="mt-4 rounded-lg border border-gray-200 bg-gray-50">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-600">
                展开人员支持计数（辅助上下文，不用于人员比较）
              </summary>
              <div className="grid grid-cols-1 gap-3 border-t border-gray-200 p-3 xl:grid-cols-2">
                {snapshot.teamSupport.members.length === 0 ? (
                  <EmptyState title="当前没有可显示的同组织团队支持上下文" />
                ) : (
                  snapshot.teamSupport.members.map(member => (
                    <MemberCard key={member.profileId} member={member} />
                  ))
                )}
              </div>
            </details>
          </Section>

          <Section
            id="old-customer-coverage"
            title="5. 老客户覆盖 / 转化"
            description="Phase 10 使用已确认 CPC 事实计算 A/B/C 建议；建议不进入逾期或人员工作队列，接受后才形成正式 FOLLOW_UP。"
          >
            <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
              {snapshot.oldCustomerCoverage.reason}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Metric
                label="正式客户引用"
                value={snapshot.oldCustomerCoverage.confirmedFacts.canonicalCustomerCount}
              />
              <Metric
                label="有推进中项目客户"
                value={snapshot.oldCustomerCoverage.confirmedFacts.customersWithActiveProjectCount}
              />
              <Metric
                label="可评估老客户"
                value={snapshot.oldCustomerCoverage.recommendations.eligibleKnownCustomerCount}
              />
              <Metric
                label="到建议周期"
                value={snapshot.oldCustomerCoverage.recommendations.dueRecommendationCount}
                reason="建议不是逾期任务。"
              />
              <Metric
                label="正式开放回访"
                value={snapshot.oldCustomerCoverage.confirmedFacts.openCustomerFollowUpCount}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Metric
                label="因项目暂停建议"
                value={snapshot.oldCustomerCoverage.recommendations.suppressedActiveProjectCount}
              />
              <Metric
                label="因回访暂停建议"
                value={snapshot.oldCustomerCoverage.recommendations.suppressedOpenFollowUpCount}
              />
              <Metric
                label="缺少关系基线"
                value={snapshot.oldCustomerCoverage.recommendations.needsBaselineCount}
              />
              <Metric
                label="证据未知"
                value={snapshot.oldCustomerCoverage.recommendations.evidenceUnknownCount}
              />
              <Metric
                label="已到期正式回访"
                value={snapshot.oldCustomerCoverage.confirmedFacts.dueCustomerFollowUpCount}
              />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Metric
                label="新媒线索"
                {...sourceCategoryMetric(
                  snapshot.oldCustomerCoverage.sourceCategories.new_media_lead,
                )}
              />
              <Metric
                label="主动外呼"
                {...sourceCategoryMetric(
                  snapshot.oldCustomerCoverage.sourceCategories.proactive_outbound,
                )}
              />
              <Metric
                label="老客户显式转化"
                {...sourceCategoryMetric(
                  snapshot.oldCustomerCoverage.sourceCategories.old_customer_reactivation,
                )}
              />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Metric
                label="覆盖率"
                value={
                  snapshot.oldCustomerCoverage.coverageRate.state === 'known'
                    ? Math.round(snapshot.oldCustomerCoverage.coverageRate.value * 100) + '%'
                    : '未知'
                }
                reason={
                  snapshot.oldCustomerCoverage.coverageRate.state === 'known'
                    ? '正式开放回访 / 可评估老客户。'
                    : snapshot.oldCustomerCoverage.coverageRate.reason
                }
              />
              <Metric
                label="转化率"
                value="未知"
                reason={snapshot.oldCustomerCoverage.conversionRate.reason}
              />
              <Metric
                label="确认关系回访事实"
                value={
                  snapshot.oldCustomerCoverage.sourceCategories.old_customer_reactivation.state === 'known'
                    ? snapshot.oldCustomerCoverage.sourceCategories.old_customer_reactivation.value.confirmedRelationshipFollowUpCount
                    : '未知'
                }
              />
            </div>
          </Section>

          <Section
            id="business-progress"
            title="6. 业务进展 / 结果"
            description="项目状态和正式项目事件来自 CPC 确认事实；外部订单、报价、回款和财务详情保持未知。"
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {PROJECT_STATE_ORDER.map(status => (
                <Metric
                  key={status}
                  label={PROJECT_STATUS_LABELS[status]}
                  value={snapshot.businessProgress.projectStateCounts[status]}
                />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label="等待检查项目"
                value={snapshot.businessProgress.activeWaitingProjectCount}
              />
              <Metric
                label="高风险推进中项目"
                value={snapshot.businessProgress.highRiskActiveProjectCount}
              />
              <Metric
                label="已提交周报版本"
                value={snapshot.businessProgress.submittedWeeklyReportCount}
              />
              <Metric
                label="有效推进事件"
                value={snapshot.businessProgress.confirmedOutcomeEvents.meaningfulProgressCount}
              />
              <Metric
                label="订单确认事件"
                value={snapshot.businessProgress.confirmedOutcomeEvents.orderConfirmedCount}
              />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Metric
                label="订单价值"
                value="未知"
                reason={snapshot.businessProgress.externalSources.orderValue.reason}
              />
              <Metric
                label="报价接受"
                value="未知"
                reason={snapshot.businessProgress.externalSources.quoteAcceptance.reason}
              />
              <Metric
                label="回款 / 财务"
                value="未知"
                reason={snapshot.businessProgress.externalSources.payment.reason}
              />
            </div>
          </Section>

          <details className="rounded-lg border border-gray-200 bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700">
              查看未知项与数据边界
            </summary>
            <div className="space-y-2 border-t border-gray-200 px-4 py-4">
              {snapshot.unknowns.map(unknown => (
                <div key={unknown.key} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span className="font-medium">{unknown.key}</span>
                  {' · '}
                  {unknown.reason}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </AppLayout>
  );
}
