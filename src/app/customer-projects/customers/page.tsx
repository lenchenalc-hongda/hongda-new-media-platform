'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import type { WorkItemPriority, WorkItemStatus } from '@/lib/customer-projects/domain';
import { formatBusinessDateTime } from '@/lib/customer-projects/presentation';

interface CustomerListItem {
  id: string;
  referenceKind: 'canonical' | 'provisional';
  displayName: string;
  status: string;
  sourceLabel: string | null;
  externalOwnerReference: string | null;
  activeProjectCount: number;
  hasActiveProject: boolean;
  nextFollowUp: {
    id: string;
    title: string;
    dueAt: string | null;
    status: WorkItemStatus;
    priority: WorkItemPriority;
    blockedReason: string | null;
    version: number;
    isAssignedToMe: boolean;
    dueByBusinessEnd: boolean;
  } | null;
  lastInteraction: {
    id: string;
    eventType: string;
    occurredAt: string;
    summary: string | null;
  } | null;
  updatedAt: string;
}

type FilterKey = 'all' | 'due_follow_up' | 'assigned_follow_up' | 'active_project';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: '全部可见客户' },
  { key: 'due_follow_up', label: '待我回访' },
  { key: 'assigned_follow_up', label: '已安排给我' },
  { key: 'active_project', label: '有活跃项目' },
];

function eventLabel(eventType: string): string {
  if (eventType === 'CUSTOMER_RESPONSE_RECEIVED') return '收到客户反馈';
  if (eventType === 'CONTACT_LOGGED') return '客户联系记录';
  return eventType;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch('/api/customer-projects/customers', {
          cache: 'no-store',
        });
        const body = await response.json().catch(() => null);

        if (!active) return;

        if (response.ok && body?.ok === true && Array.isArray(body?.data?.customers)) {
          setCustomers(body.data.customers as CustomerListItem[]);
          setError('');
        } else if (response.status === 401) {
          setError('登录状态已失效，请重新登录。');
        } else if (response.status === 403) {
          setError('你没有权限查看客户关系页面。');
        } else if (response.status === 409) {
          setError(typeof body?.error === 'string' ? body.error : '客户关系数据量超出当前安全上限。');
        } else {
          setError('客户列表加载失败，请稍后重试。');
        }
      } catch {
        if (active) setError('客户列表加载失败，请稍后重试。');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const visibleCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return customers.filter(customer => {
      if (
        filter === 'due_follow_up'
        && !(
          customer.nextFollowUp?.isAssignedToMe
          && customer.nextFollowUp.dueByBusinessEnd
        )
      ) return false;

      if (
        filter === 'assigned_follow_up'
        && !customer.nextFollowUp?.isAssignedToMe
      ) return false;

      if (filter === 'active_project' && !customer.hasActiveProject) return false;

      if (!query) return true;

      return [
        customer.displayName,
        customer.sourceLabel ?? '',
        customer.externalOwnerReference ?? '',
        customer.nextFollowUp?.title ?? '',
        customer.lastInteraction?.summary ?? '',
      ].some(value => value.toLowerCase().includes(query));
    });
  }, [customers, filter, search]);

  const dueCount = customers.filter(customer =>
    customer.nextFollowUp?.isAssignedToMe
    && customer.nextFollowUp.dueByBusinessEnd,
  ).length;
  const assignedCount = customers.filter(customer => customer.nextFollowUp?.isAssignedToMe).length;
  const activeProjectCount = customers.filter(customer => customer.hasActiveProject).length;

  return (
    <AppLayout>
      <PageHeader
        title="客户"
        description="客户是长期关系；普通回访停留在客户层，只有出现具体商业机会才创建项目。"
      />

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            ['待我回访', dueCount],
            ['已安排给我', assignedCount],
            ['有活跃项目', activeProjectCount],
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
              placeholder="搜索客户、外部来源、回访或最近互动"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm lg:w-96"
            />
          </div>
          <p className="mt-3 text-xs text-gray-400">
            这里没有“我的客户”筛选。客户归属继续以外部权威来源为准，CPC 只显示已验证引用。
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(index => (
              <div key={index} className="h-32 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : error ? (
          <EmptyState title={error} />
        ) : visibleCustomers.length === 0 ? (
          <EmptyState
            title="当前筛选下没有客户"
            description={customers.length === 0
              ? '当前权限下还没有可见 CustomerReference。'
              : '可以切换筛选或搜索其他客户。'}
          />
        ) : (
          <div className="space-y-3">
            {visibleCustomers.map(customer => (
              <Link
                key={customer.id}
                href={"/customer-projects/customers/" + customer.id}
                className="block rounded-lg border border-gray-200 bg-white p-4 no-underline transition hover:border-cyan-300 hover:shadow-sm"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold text-gray-800">
                        {customer.displayName}
                      </h2>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                        {customer.referenceKind === 'canonical' ? '正式客户' : '临时客户'}
                      </span>
                      {customer.activeProjectCount > 0 && (
                        <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700">
                          活跃项目 {customer.activeProjectCount}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      {customer.sourceLabel && <span>来源：{customer.sourceLabel}</span>}
                      {customer.externalOwnerReference && (
                        <span>外部归属引用：{customer.externalOwnerReference}</span>
                      )}
                      <span>更新：{formatBusinessDateTime(customer.updatedAt)}</span>
                    </div>

                    {customer.lastInteraction && (
                      <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
                        <p className="text-[11px] font-medium text-gray-500">
                          最近互动 · {eventLabel(customer.lastInteraction.eventType)}
                          {' · '}
                          {formatBusinessDateTime(customer.lastInteraction.occurredAt)}
                        </p>
                        {customer.lastInteraction.summary && (
                          <p className="mt-1 line-clamp-2 text-xs text-gray-700">
                            {customer.lastInteraction.summary}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="xl:w-[400px]">
                    {customer.nextFollowUp ? (
                      <div className={
                        'rounded-lg border px-3 py-2 '
                        + (customer.nextFollowUp.isAssignedToMe && customer.nextFollowUp.dueByBusinessEnd
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-gray-200 bg-gray-50')
                      }>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-medium text-gray-800">
                            下一次回访：{customer.nextFollowUp.title}
                          </p>
                          {customer.nextFollowUp.isAssignedToMe && (
                            <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-cyan-700">
                              分配给我
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">
                          {customer.nextFollowUp.dueAt
                            ? formatBusinessDateTime(customer.nextFollowUp.dueAt)
                            : '未设置时间'}
                        </p>
                        {customer.nextFollowUp.blockedReason && (
                          <p className="mt-1 text-[11px] text-red-600">
                            受阻：{customer.nextFollowUp.blockedReason}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                        当前没有已安排的客户级回访。系统不会自动发明回访周期。
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
