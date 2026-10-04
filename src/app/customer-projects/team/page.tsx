'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
  formatBusinessDateTime,
  projectPriorityTone,
  projectStageLabel,
} from '@/lib/customer-projects/presentation';
import type {
  TeamBoardCommitmentException,
  TeamBoardDecisionItem,
  TeamBoardDueState,
  TeamBoardProjectException,
  TeamMemberSupportContext,
  TeamBoardSnapshot,
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

function LoadingState() {
  return (
    <div className="space-y-4">
      {[0, 1, 2, 3].map(index => (
        <div key={index} className="h-32 animate-pulse rounded-lg bg-gray-100" />
      ))}
    </div>
  );
}

export default function CustomerProjectTeamPage() {
  const [snapshot, setSnapshot] = useState<TeamBoardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch('/api/customer-projects/team', {
          cache: 'no-store',
        });
        const body = await response.json().catch(() => null);
        if (!active) return;

        if (response.ok && body?.ok === true && body.data) {
          setSnapshot(body.data as TeamBoardSnapshot);
          setError('');
        } else if (response.status === 401) {
          setSnapshot(null);
          setError('登录状态已失效，请重新登录。');
        } else if (response.status === 403) {
          setSnapshot(null);
          setError('你当前没有团队看板访问权限。');
        } else if (response.status === 409) {
          setSnapshot(null);
          setError(typeof body?.error === 'string'
            ? body.error
            : '团队看板数据量超出当前安全上限。');
        } else {
          setSnapshot(null);
          setError('团队看板加载失败，请稍后重试。');
        }
      } catch {
        if (active) {
          setSnapshot(null);
          setError('团队看板加载失败，请稍后重试。');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppLayout>
      <PageHeader
        title="团队看板"
        description="管理层异常与支持视图：只读呈现已确认事实，不用于人员比较，也不推断缺失的外部经营数据。"
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
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
            title="4. 团队支持 / 工作上下文"
            description="按姓名展示支持上下文，仅用于工作协调，不生成综合人员指标。"
            count={snapshot.teamSupport.members.length}
          >
            {snapshot.teamSupport.members.length === 0 ? (
              <EmptyState title="当前没有可显示的同组织团队上下文" />
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {snapshot.teamSupport.members.map(member => (
                  <MemberCard key={member.profileId} member={member} />
                ))}
              </div>
            )}
          </Section>

          <Section
            id="old-customer-coverage"
            title="5. 老客户覆盖 / 转化"
            description="Phase 9 只展示已有确认事实；Phase 10 政策未批准前不生成覆盖率、转化率或固定跟进周期。"
          >
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
                label="开放客户回访"
                value={snapshot.oldCustomerCoverage.confirmedFacts.openCustomerFollowUpCount}
              />
              <Metric
                label="已到期客户回访"
                value={snapshot.oldCustomerCoverage.confirmedFacts.dueCustomerFollowUpCount}
              />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Metric
                label="覆盖率"
                value="未知"
                reason={snapshot.oldCustomerCoverage.coverageRate.reason}
              />
              <Metric
                label="转化率"
                value="未知"
                reason={snapshot.oldCustomerCoverage.conversionRate.reason}
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
