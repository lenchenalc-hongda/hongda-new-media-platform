'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import type {
  ProjectLifecycleStatus,
  ProjectPriority,
  WaitingOn,
  WorkItemPriority,
  WorkItemStatus,
  WorkItemType,
} from '@/lib/customer-projects/domain';
import {
  PROJECT_STATUS_LABELS,
  WAITING_ON_LABELS,
  WORK_ITEM_STATUS_LABELS,
  WORK_ITEM_TYPE_LABELS,
  formatBusinessDateTime,
  toIsoFromShanghaiDateTime,
} from '@/lib/customer-projects/presentation';

interface TaskListItem {
  id: string;
  workItemType: WorkItemType;
  title: string;
  dueAt: string | null;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  blockedReason: string | null;
  version: number;
  updatedAt: string;
  customerReferenceId: string | null;
  customerDisplayName: string | null;
  project: {
    id: string;
    title: string;
    status: ProjectLifecycleStatus;
    waitingOn: WaitingOn;
    priority: ProjectPriority;
  } | null;
}

type FilterKey = 'open' | 'completed' | 'cancelled' | 'all';
type ReasonTransition = 'blocked' | 'cancelled';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'open', label: '未完成' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
  { key: 'all', label: '全部' },
];

function isOpen(status: WorkItemStatus): boolean {
  return status === 'pending' || status === 'in_progress' || status === 'blocked';
}

function priorityTone(priority: WorkItemPriority): string {
  if (priority === 'critical') return 'bg-red-50 text-red-700';
  if (priority === 'high') return 'bg-amber-50 text-amber-700';
  if (priority === 'medium') return 'bg-blue-50 text-blue-700';
  return 'bg-gray-100 text-gray-600';
}

export default function CustomerProjectTasksPage() {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterKey>('open');
  const [search, setSearch] = useState('');

  const [workingTaskId, setWorkingTaskId] = useState<string | null>(null);
  const [reasonTaskId, setReasonTaskId] = useState<string | null>(null);
  const [reasonTransition, setReasonTransition] = useState<ReasonTransition>('blocked');
  const [reason, setReason] = useState('');
  const [rescheduleTaskId, setRescheduleTaskId] = useState<string | null>(null);
  const [rescheduleDueAt, setRescheduleDueAt] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [actionError, setActionError] = useState('');

  async function loadTasks(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch('/api/customer-projects/tasks', { cache: 'no-store' });
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true && Array.isArray(body?.data?.tasks)) {
        setTasks(body.data.tasks as TaskListItem[]);
        setError('');
      } else if (response.status === 401) {
        setError('登录状态已失效，请重新登录。');
      } else if (response.status === 403) {
        setError('你没有权限查看任务。');
      } else if (response.status === 409) {
        setError(typeof body?.error === 'string' ? body.error : '任务数量超出当前安全上限。');
      } else {
        setError('我的任务加载失败，请稍后重试。');
      }
    } catch {
      setError('我的任务加载失败，请稍后重试。');
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks(true);
  }, []);

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tasks.filter(task => {
      if (filter === 'open' && !isOpen(task.status)) return false;
      if (filter === 'completed' && task.status !== 'completed') return false;
      if (filter === 'cancelled' && task.status !== 'cancelled') return false;

      if (!query) return true;
      return [
        task.title,
        task.customerDisplayName ?? '',
        task.project?.title ?? '',
        WORK_ITEM_TYPE_LABELS[task.workItemType],
      ].some(value => value.toLowerCase().includes(query));
    });
  }, [filter, search, tasks]);

  async function transitionTask(
    task: TaskListItem,
    toStatus: 'in_progress' | 'blocked' | 'completed' | 'cancelled',
    transitionReason?: string,
  ) {
    if (workingTaskId) return;

    setWorkingTaskId(task.id);
    setActionError('');

    try {
      const response = await fetch(
        '/api/customer-projects/work-items/' + encodeURIComponent(task.id) + '/transition',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedVersion: task.version,
            toStatus,
            reason: transitionReason?.trim() || null,
          }),
        },
      );
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true) {
        setReasonTaskId(null);
        setReason('');
        await loadTasks(false);
        return;
      }

      if (response.status === 409) {
        setActionError(typeof body?.message === 'string'
          ? body.message
          : '任务状态已经变化，请刷新后重试。');
        await loadTasks(false);
      } else if (response.status === 422 || response.status === 400) {
        setActionError(typeof body?.message === 'string'
          ? body.message
          : '当前状态不允许这样操作。');
      } else if (response.status === 403) {
        setActionError('你没有权限更新这个任务。');
      } else {
        setActionError('任务更新失败，请稍后重试。');
      }
    } catch {
      setActionError('任务更新失败，请稍后重试。');
    } finally {
      setWorkingTaskId(null);
    }
  }

  function beginReasonTransition(taskId: string, toStatus: ReasonTransition) {
    setRescheduleTaskId(null);
    setRescheduleDueAt('');
    setRescheduleReason('');
    setReasonTaskId(taskId);
    setReasonTransition(toStatus);
    setReason('');
    setActionError('');
  }

  function beginReschedule(taskId: string) {
    setReasonTaskId(null);
    setReason('');
    setRescheduleTaskId(taskId);
    setRescheduleDueAt('');
    setRescheduleReason('');
    setActionError('');
  }

  async function rescheduleTask(task: TaskListItem) {
    if (workingTaskId) return;

    const dueAt = toIsoFromShanghaiDateTime(rescheduleDueAt);
    if (!dueAt) {
      setActionError('改期必须设置有效的新时间。');
      return;
    }
    if (!rescheduleReason.trim()) {
      setActionError('改期必须填写原因。');
      return;
    }

    setWorkingTaskId(task.id);
    setActionError('');

    try {
      const response = await fetch(
        '/api/customer-projects/work-items/' + encodeURIComponent(task.id) + '/reschedule',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedVersion: task.version,
            toDueAt: dueAt,
            reason: rescheduleReason.trim(),
          }),
        },
      );
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true) {
        setRescheduleTaskId(null);
        setRescheduleDueAt('');
        setRescheduleReason('');
        await loadTasks(false);
        return;
      }

      if (response.status === 409) {
        setActionError(typeof body?.message === 'string'
          ? body.message
          : '任务版本已经变化，请刷新后重试。');
        await loadTasks(false);
      } else if (response.status === 422 || response.status === 400) {
        setActionError(typeof body?.message === 'string'
          ? body.message
          : '改期信息无效，请检查后再提交。');
      } else if (response.status === 403) {
        setActionError('你没有权限调整这个任务的时间。');
      } else {
        setActionError('任务改期失败，请稍后重试。');
      }
    } catch {
      setActionError('任务改期失败，请稍后重试。');
    } finally {
      setWorkingTaskId(null);
    }
  }

  const openCount = tasks.filter(task => isOpen(task.status)).length;
  const blockedCount = tasks.filter(task => task.status === 'blocked').length;
  const completedCount = tasks.filter(task => task.status === 'completed').length;

  return (
    <AppLayout>
      <PageHeader
        title="我的任务"
        description="这里用于查看未来工作、协作任务和历史；今天真正优先做什么仍以工作台为准。"
      />

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            ['未完成', openCount],
            ['受阻', blockedCount],
            ['已完成', completedCount],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="mt-1 text-lg font-semibold text-gray-800">{value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition '
                    + (filter === item.key
                      ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                      : 'border-gray-200 bg-white text-gray-500')
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>

            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="搜索任务、客户或项目"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm lg:w-80"
            />
          </div>
        </div>

        {actionError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(index => (
              <div key={index} className="h-28 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : error ? (
          <EmptyState title={error} />
        ) : visibleTasks.length === 0 ? (
          <EmptyState
            title="当前筛选下没有任务"
            description="Workbench 仍是每日优先工作入口；这里保留未来任务和历史。"
          />
        ) : (
          <div className="space-y-3">
            {visibleTasks.map(task => {
              const activeNextActionNeedsProjectFlow =
                task.workItemType === 'NEXT_ACTION'
                && task.project?.status === 'active'
                && task.project.waitingOn === 'none';

              const customerFollowUpNeedsCustomerFlow =
                task.workItemType === 'FOLLOW_UP'
                && task.project === null
                && !!task.customerReferenceId;

              return (
                <article key={task.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-cyan-700">
                          {WORK_ITEM_TYPE_LABELS[task.workItemType]}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                          {WORK_ITEM_STATUS_LABELS[task.status]}
                        </span>
                        <span className={"rounded-full px-2 py-0.5 text-[11px] " + priorityTone(task.priority)}>
                          {task.priority}
                        </span>
                      </div>
                      <h2 className="mt-2 text-sm font-semibold text-gray-800">{task.title}</h2>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        {task.customerDisplayName && <span>客户：{task.customerDisplayName}</span>}
                        {task.project && (
                          <span>项目：{task.project.title} · {PROJECT_STATUS_LABELS[task.project.status]}</span>
                        )}
                        <span>到期：{task.dueAt ? formatBusinessDateTime(task.dueAt) : '未设置'}</span>
                      </div>

                      {task.blockedReason && (
                        <p className="mt-2 text-xs text-red-600">受阻原因：{task.blockedReason}</p>
                      )}

                      {activeNextActionNeedsProjectFlow && (
                        <p className="mt-2 text-xs text-amber-700">
                          当前是活跃项目的 NEXT_ACTION。完成或取消必须同时确定新的下一步/等待状态，不能在这里单独关闭。
                        </p>
                      )}

                      {customerFollowUpNeedsCustomerFlow && (
                        <p className="mt-2 text-xs text-cyan-700">
                          客户级回访完成时需要记录实际结果和下一次关系动作，请进入客户页确认；任务页不会静默完成回访。
                        </p>
                      )}
                    </div>

                    {isOpen(task.status) && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {task.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => void transitionTask(task, 'in_progress')}
                            disabled={workingTaskId === task.id}
                            className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-700"
                          >
                            开始处理
                          </button>
                        )}

                        {task.status === 'blocked' && (
                          <button
                            type="button"
                            onClick={() => void transitionTask(task, 'in_progress')}
                            disabled={workingTaskId === task.id}
                            className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-700"
                          >
                            继续处理
                          </button>
                        )}

                        {!activeNextActionNeedsProjectFlow && !customerFollowUpNeedsCustomerFlow && (
                          <button
                            type="button"
                            onClick={() => void transitionTask(task, 'completed')}
                            disabled={workingTaskId === task.id}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
                          >
                            完成
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => beginReschedule(task.id)}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700"
                        >
                          改期
                        </button>

                        {task.status !== 'blocked' && (
                          <button
                            type="button"
                            onClick={() => beginReasonTransition(task.id, 'blocked')}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700"
                          >
                            标记受阻
                          </button>
                        )}

                        {!activeNextActionNeedsProjectFlow && (
                          <button
                            type="button"
                            onClick={() => beginReasonTransition(task.id, 'cancelled')}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600"
                          >
                            取消
                          </button>
                        )}

                        {task.project ? (
                          <Link
                            href={"/customer-projects/projects/" + task.project.id}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 no-underline"
                          >
                            去项目
                          </Link>
                        ) : task.customerReferenceId ? (
                          <Link
                            href={"/customer-projects/customers/" + task.customerReferenceId}
                            className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-700 no-underline"
                          >
                            去客户
                          </Link>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {rescheduleTaskId === task.id && (
                    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="text-xs font-medium text-blue-800">调整任务时间</p>
                      <p className="mt-1 text-xs text-blue-700">
                        改期只更新正式任务的到期时间；旧时间和原因会保留在审计历史中。受阻状态不会因为改期自动清除。
                      </p>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            新时间（东莞时间）
                          </label>
                          <input
                            type="datetime-local"
                            value={rescheduleDueAt}
                            onChange={event => setRescheduleDueAt(event.target.value)}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">改期原因</label>
                          <input
                            value={rescheduleReason}
                            onChange={event => setRescheduleReason(event.target.value)}
                            placeholder="例如：客户确认项目推迟到下周"
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRescheduleTaskId(null);
                            setRescheduleDueAt('');
                            setRescheduleReason('');
                          }}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600"
                        >
                          返回
                        </button>
                        <button
                          type="button"
                          onClick={() => void rescheduleTask(task)}
                          disabled={workingTaskId === task.id}
                          className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white"
                        >
                          确认改期
                        </button>
                      </div>
                    </div>
                  )}

                  {reasonTaskId === task.id && (
                    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs font-medium text-gray-700">
                        {reasonTransition === 'blocked' ? '为什么受阻？' : '为什么取消？'}
                      </p>
                      <textarea
                        value={reason}
                        onChange={event => setReason(event.target.value)}
                        rows={2}
                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                        placeholder={reasonTransition === 'blocked'
                          ? '例如：等待客户提供最终图稿'
                          : '例如：客户取消该事项'}
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReasonTaskId(null);
                            setReason('');
                          }}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600"
                        >
                          返回
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!reason.trim()) {
                              setActionError('受阻/取消必须填写原因。');
                              return;
                            }
                            void transitionTask(task, reasonTransition, reason);
                          }}
                          disabled={workingTaskId === task.id}
                          className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white"
                        >
                          确认
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <p className="text-xs text-gray-400">
          等待/检查仍属于 Project 状态，不会为了任务列表再复制成第二条提醒任务。
        </p>
      </div>
    </AppLayout>
  );
}
