'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
import {
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  RISK_LEVEL_LABELS,
  WAITING_ON_LABELS,
  formatBusinessDateTime,
  projectPriorityTone,
  projectStageLabel,
} from '@/lib/customer-projects/presentation';

interface ProjectListItem {
  id: string;
  customerReferenceId: string;
  customerDisplayName: string | null;
  title: string;
  projectType: ProjectType;
  status: ProjectLifecycleStatus;
  stage: string;
  waitingOn: WaitingOn;
  nextCheckAt: string | null;
  riskLevel: RiskLevel | null;
  priority: ProjectPriority;
  version: number;
  updatedAt: string;
  nextAction: {
    id: string;
    title: string;
    dueAt: string | null;
    status: WorkItemStatus;
    priority: WorkItemPriority;
    blockedReason: string | null;
    version: number;
  } | null;
  needsAction: boolean;
  blocked: boolean;
  isOwnedByMe: boolean;
}

type FilterKey = 'mine' | 'active' | 'waiting' | 'needs_action' | 'recently_closed' | 'all';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'mine', label: '我负责的' },
  { key: 'active', label: '推进中' },
  { key: 'waiting', label: '等待中' },
  { key: 'needs_action', label: '需要处理' },
  { key: 'recently_closed', label: '已结束' },
  { key: 'all', label: '全部' },
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterKey>('mine');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch('/api/customer-projects/projects', { cache: 'no-store' });
        const body = await response.json().catch(() => null);

        if (!active) return;

        if (response.ok && body?.ok === true && Array.isArray(body?.data?.projects)) {
          setProjects(body.data.projects as ProjectListItem[]);
          setError('');
        } else if (response.status === 401) {
          setError('登录状态已失效，请重新登录。');
        } else if (response.status === 403) {
          setError('你没有权限查看项目。');
        } else if (response.status === 409) {
          setError(typeof body?.error === 'string' ? body.error : '项目数量超出当前安全上限。');
        } else {
          setError('项目列表加载失败，请稍后重试。');
        }
      } catch {
        if (active) setError('项目列表加载失败，请稍后重试。');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLowerCase();

    return projects.filter(project => {
      if (filter === 'mine' && !project.isOwnedByMe) return false;
      if (filter === 'active' && project.status !== 'active') return false;
      if (filter === 'waiting' && !(project.status === 'active' && project.waitingOn !== 'none')) return false;
      if (filter === 'needs_action' && !(project.needsAction || project.blocked || project.riskLevel === 'high')) return false;
      if (filter === 'recently_closed' && !['won', 'lost', 'cancelled'].includes(project.status)) return false;

      if (!query) return true;
      return [
        project.title,
        project.customerDisplayName ?? '',
        PROJECT_TYPE_LABELS[project.projectType],
        projectStageLabel(project.projectType, project.stage),
      ].some(value => value.toLowerCase().includes(query));
    });
  }, [filter, projects, search]);

  return (
    <AppLayout>
      <PageHeader
        title="项目"
        description="一个项目代表一个具体商业机会；先看正在推进、等待和需要处理的项目。"
        actions={
          <Link href="/customer-projects/projects/new" className="btn-primary no-underline">
            新建项目
          </Link>
        }
      />

      <div className="space-y-4">
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
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300')
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="搜索项目、客户、业务类型或阶段"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm lg:w-80"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(index => (
              <div key={index} className="h-28 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : error ? (
          <EmptyState title={error} />
        ) : visibleProjects.length === 0 ? (
          <EmptyState
            title="当前筛选下没有项目"
            description={projects.length === 0
              ? '出现具体商业机会后创建项目，不要为了客户回访虚构项目。'
              : '可以切换筛选条件或搜索其他项目。'}
          />
        ) : (
          <div className="space-y-3">
            {visibleProjects.map(project => (
              <Link
                key={project.id}
                href={"/customer-projects/projects/" + project.id}
                className="block rounded-lg border border-gray-200 bg-white p-4 no-underline transition hover:border-cyan-300 hover:shadow-sm"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold text-gray-800">{project.title}</h2>
                      <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700">
                        {PROJECT_STATUS_LABELS[project.status]}
                      </span>
                      <span className={"rounded-full px-2 py-0.5 text-[11px] font-medium " + projectPriorityTone(project.priority)}>
                        {PROJECT_PRIORITY_LABELS[project.priority]}
                      </span>
                      {project.riskLevel && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-700">
                          {RISK_LEVEL_LABELS[project.riskLevel]}
                        </span>
                      )}
                      {!project.isOwnedByMe && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                          非我负责
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>客户：{project.customerDisplayName || '未显示客户名称'}</span>
                      <span>类型：{PROJECT_TYPE_LABELS[project.projectType]}</span>
                      <span>阶段：{projectStageLabel(project.projectType, project.stage)}</span>
                      <span>更新：{formatBusinessDateTime(project.updatedAt)}</span>
                    </div>
                  </div>

                  <div className="min-w-0 xl:w-[420px]">
                    {project.status === 'active' && project.waitingOn !== 'none' ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="text-xs font-medium text-amber-800">
                          等待 {WAITING_ON_LABELS[project.waitingOn]}
                        </p>
                        <p className="mt-1 text-[11px] text-amber-700">
                          检查：{formatBusinessDateTime(project.nextCheckAt)}
                        </p>
                      </div>
                    ) : project.nextAction ? (
                      <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2">
                        <p className="truncate text-xs font-medium text-cyan-800">
                          下一步：{project.nextAction.title}
                        </p>
                        <p className="mt-1 text-[11px] text-cyan-700">
                          {project.nextAction.dueAt ? formatBusinessDateTime(project.nextAction.dueAt) : '未设到期'}
                        </p>
                      </div>
                    ) : project.needsAction ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                        活跃项目缺少下一步/检查状态
                      </div>
                    ) : (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                        当前没有开放中的下一步
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
