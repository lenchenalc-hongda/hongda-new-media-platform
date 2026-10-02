'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import type { WorkbenchSnapshot } from '@/lib/customer-projects/read-models';
import {
  WAITING_ON_LABELS,
  WORKBENCH_PRIORITY_LABELS,
  WORKBENCH_REASON_LABELS,
  WORK_ITEM_TYPE_LABELS,
  formatBusinessDateTime,
  priorityClassTone,
} from '@/lib/customer-projects/presentation';

function SectionCard({
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

function WorkbenchLoading() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map(index => (
        <div key={index} className="h-20 animate-pulse rounded-lg bg-gray-100" />
      ))}
    </div>
  );
}

export default function CustomerProjectsPage() {
  const [snapshot, setSnapshot] = useState<WorkbenchSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadWorkbench() {
      setLoading(true);
      try {
        const response = await fetch('/api/customer-projects/workbench', {
          cache: 'no-store',
        });
        const body = await response.json().catch(() => null);

        if (!active) return;

        if (response.ok && body?.ok === true && body.data) {
          setSnapshot(body.data as WorkbenchSnapshot);
          setError('');
        } else if (response.status === 401) {
          setError('登录状态已失效，请重新登录。');
          setSnapshot(null);
        } else if (response.status === 403) {
          setError('你当前没有客户项目中心的访问权限。');
          setSnapshot(null);
        } else if (response.status === 409) {
          setError(typeof body?.error === 'string' ? body.error : '今日工作数据量异常，请联系管理员。');
          setSnapshot(null);
        } else {
          setError('今日工作加载失败，请稍后重试。');
          setSnapshot(null);
        }
      } catch {
        if (active) {
          setError('今日工作加载失败，请稍后重试。');
          setSnapshot(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadWorkbench();
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppLayout>
      <PageHeader
        title="我的工作台"
        description="先看今天真正需要推进的客户和项目；记录一次，后续下一步、提醒和报告都从已确认事实生成。"
      />

      <div className="space-y-5">
        <SectionCard
          title="正式提醒"
          description="只来自已经确认的任务到期或等待检查时间；AI 建议不会在这里被算成逾期。"
        >
          {loading ? (
            <WorkbenchLoading />
          ) : error ? (
            <EmptyState title={error} />
          ) : snapshot && snapshot.summary.formalReminderCount > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-xs text-red-600">已逾期</p>
                <p className="mt-1 text-2xl font-semibold text-red-700">{snapshot.summary.reminderOverdueCount}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs text-amber-700">今天已到时间</p>
                <p className="mt-1 text-2xl font-semibold text-amber-800">
                  {snapshot.summary.formalReminderCount - snapshot.summary.reminderOverdueCount}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs text-gray-500">正式提醒总数</p>
                <p className="mt-1 text-2xl font-semibold text-gray-800">{snapshot.summary.formalReminderCount}</p>
              </div>
            </div>
          ) : (
            <EmptyState
              title="当前没有已经到时间的正式提醒"
              description="未到时间的工作继续保留在任务/等待状态中，不会被提前标成逾期。"
            />
          )}
        </SectionCard>

        <SectionCard
          title="今日工作"
          description="按客户承诺、今天到期、项目补齐和老客户回访排序，不需要再手工抄一份今日计划。"
        >
          {loading ? (
            <WorkbenchLoading />
          ) : error ? (
            <EmptyState title={error} description="页面不会用模拟数据代替正式业务数据。" />
          ) : !snapshot || snapshot.queue.length === 0 ? (
            <EmptyState
              title="今天暂时没有到期工作"
              description="未到期的下一步会继续保留，到检查时间后自动进入这里。"
            />
          ) : (
            <div className="space-y-3">
              {snapshot.queue.map(item => {
                const reminder = snapshot.reminders.find(candidate =>
                  candidate.source === 'work_item'
                    ? candidate.sourceId === item.id
                    : item.source === 'waiting_check' && candidate.sourceId === item.projectId,
                );
                const content = (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={"rounded-full border px-2 py-0.5 text-[11px] font-medium " + priorityClassTone(item.priorityClass)}>
                          {item.priorityClass} · {WORKBENCH_PRIORITY_LABELS[item.priorityClass]}
                        </span>
                        <span className="text-xs text-gray-500">{WORKBENCH_REASON_LABELS[item.reason]}</span>
                        {item.workItemType && (
                          <span className="text-xs text-gray-400">{WORK_ITEM_TYPE_LABELS[item.workItemType]}</span>
                        )}
                        {reminder && (
                          <span className={
                            "rounded-full px-2 py-0.5 text-[11px] font-medium "
                            + (reminder.state === 'overdue'
                              ? 'bg-red-50 text-red-700'
                              : 'bg-amber-50 text-amber-700')
                          }>
                            {reminder.state === 'overdue' ? '已逾期' : '已到时间'}
                          </span>
                        )}
                        {reminder?.blocked && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                            受阻但未自动延期
                          </span>
                        )}
                      </div>
                      <p className="mt-2 truncate text-sm font-medium text-gray-800">{item.title}</p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        {item.customerDisplayName && <span>客户：{item.customerDisplayName}</span>}
                        {item.projectStage && <span>阶段：{item.projectStage}</span>}
                        {item.dueAt && <span>时间：{formatBusinessDateTime(item.dueAt)}</span>}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {item.projectId ? (
                        <span className="text-xs font-medium text-cyan-700">打开项目 →</span>
                      ) : item.customerReferenceId ? (
                        <span className="text-xs font-medium text-cyan-700">打开客户 →</span>
                      ) : (
                        <span className="text-xs text-gray-400">客户级任务</span>
                      )}
                    </div>
                  </div>
                );

                return item.projectId ? (
                  <Link
                    key={item.id}
                    href={"/customer-projects/projects/" + item.projectId}
                    className="block rounded-lg border border-gray-200 p-4 no-underline transition hover:border-cyan-300 hover:bg-cyan-50/30"
                  >
                    {content}
                  </Link>
                ) : item.customerReferenceId ? (
                  <Link
                    key={item.id}
                    href={"/customer-projects/customers/" + item.customerReferenceId}
                    className="block rounded-lg border border-gray-200 p-4 no-underline transition hover:border-cyan-300 hover:bg-cyan-50/30"
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={item.id} className="rounded-lg border border-gray-200 p-4">
                    {content}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="快速记录"
          description="从具体项目进入后，用一次确认记录“发生了什么 + 下一步/等待”，不会要求你再写一份日报。"
        >
          {snapshot && snapshot.quickProjects.length > 0 ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-cyan-50 p-4">
                <p className="text-sm font-medium text-gray-800">客户突然有新进展，也不用等它进入今日待办</p>
                <p className="mt-1 text-xs text-gray-500">下面是最近更新的活跃项目，仅用于快速进入记录，不代表它们今天已到期或更紧急。</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {snapshot.quickProjects.map(project => (
                  <Link
                    key={project.projectId}
                    href={"/customer-projects/projects/" + project.projectId}
                    className="rounded-lg border border-gray-200 p-3 no-underline transition hover:border-cyan-300 hover:bg-cyan-50/30"
                  >
                    <p className="truncate text-sm font-medium text-gray-800">{project.title}</p>
                    <p className="mt-1 truncate text-xs text-gray-500">{project.customerDisplayName || '未显示客户名称'}</p>
                    <p className="mt-2 text-[11px] text-gray-400">阶段：{project.stage}</p>
                    <p className="mt-2 text-xs font-medium text-cyan-700">记录进展 →</p>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="暂无可快速记录的活跃项目"
              description="出现具体商业机会并建立项目后，可从这里进入记录。"
            />
          )}
        </SectionCard>

        <SectionCard
          title="需要关注"
          description="这里只显示需要处理的异常，不用逐个项目重复汇报。"
        >
          {loading ? (
            <WorkbenchLoading />
          ) : snapshot && snapshot.attention.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {snapshot.attention.map(item => (
                <div key={item.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{item.title}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {item.reason === 'blocked_work'
                        ? '当前工作受阻'
                        : item.reason === 'missing_next_step'
                          ? '活跃项目缺少下一步/检查状态'
                          : '高风险项目'}
                      {item.customerDisplayName ? " · " + item.customerDisplayName : ''}
                    </p>
                  </div>
                  {item.projectId && (
                    <Link
                      href={"/customer-projects/projects/" + item.projectId}
                      className="text-xs font-medium text-cyan-700 no-underline hover:underline"
                    >
                      查看项目
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="当前没有需要额外处理的异常"
              description="系统只提醒受阻、缺下一步和高风险等需要行动的项目。"
            />
          )}
        </SectionCard>

        <SectionCard
          title="等待 / 检查"
          description="等待客户、内部、品质、供应商等时，只保留一个检查时间，不另外制造重复提醒任务。"
        >
          {loading ? (
            <WorkbenchLoading />
          ) : snapshot && snapshot.waiting.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {snapshot.waiting.map(item => (
                <Link
                  key={item.projectId}
                  href={"/customer-projects/projects/" + item.projectId}
                  className="rounded-lg border border-gray-200 p-4 no-underline hover:border-cyan-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{item.title}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        等待：{WAITING_ON_LABELS[item.waitingOn]}
                        {item.customerDisplayName ? " · " + item.customerDisplayName : ''}
                      </p>
                    </div>
                    {item.due && (
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                        需要检查
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-gray-500">检查时间：{formatBusinessDateTime(item.nextCheckAt)}</p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="当前没有等待中的项目" />
          )}
        </SectionCard>

        <SectionCard
          title="今天的业务摘要"
          description="数字直接来自今天的工作队列和项目状态，不要求员工重新填写。"
        >
          {snapshot ? (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['今日事项', snapshot.summary.queueCount],
                ['优先处理', snapshot.summary.p0Count],
                ['已逾期', snapshot.summary.overdueCount],
                ['受阻', snapshot.summary.blockedCount],
                ['等待中', snapshot.summary.waitingCount],
                ['缺下一步', snapshot.summary.missingNextStepCount],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg bg-gray-50 p-3">
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold text-gray-800">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-gray-400">正式数据加载后自动生成。</p>
          )}
        </SectionCard>
      </div>
    </AppLayout>
  );
}
