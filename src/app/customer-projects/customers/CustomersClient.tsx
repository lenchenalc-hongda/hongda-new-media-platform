'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { CustomerRatingBadge, CustomerRatingLegend } from '@/components/customer-projects/CustomerRatingBadge';
import type { CustomerRatingGrade } from '@/components/customer-projects/customer-rating-colors';
import type { WorkItemPriority, WorkItemStatus } from '@/lib/customer-projects/domain';
import type { OldCustomerRecommendation } from '@/lib/customer-projects/old-customer-proactive';
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
  recommendation: OldCustomerRecommendation;
  updatedAt: string;
}

interface CustomerRatingSummary {
  customerReferenceId: string;
  actualGrade: CustomerRatingGrade;
  potentialGrade: CustomerRatingGrade;
  potentialStatus: string;
  potentialScore: number | null;
  lastRaterName: string | null;
  maintenanceOwnerName: string | null;
  isMaintenanceOwner: boolean;
  nextAction: string | null;
  nextCheckOn: string | null;
  customerNotePreview: string | null;
}

type FilterKey =
  | 'all'
  | 'due_follow_up'
  | 'assigned_follow_up'
  | 'due_recommendation'
  | 'active_project'
  | 'high_potential'
  | 'unrated_potential'
  | 'my_verified_customers'
  | 'rating_action_due';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: '全部可见客户' },
  { key: 'due_follow_up', label: '待我回访' },
  { key: 'assigned_follow_up', label: '已安排给我' },
  { key: 'due_recommendation', label: '到建议周期' },
  { key: 'active_project', label: '有活跃项目' },
  { key: 'high_potential', label: '高潜力客户' },
  { key: 'unrated_potential', label: '潜力未评级' },
  { key: 'my_verified_customers', label: '我负责的客户' },
  { key: 'rating_action_due', label: '开发动作待检查' },
];

function eventLabel(eventType: string): string {
  if (eventType === 'CUSTOMER_RESPONSE_RECEIVED') return '收到客户反馈';
  if (eventType === 'CONTACT_LOGGED') return '客户联系记录';
  return eventType;
}

function recommendationStateLabel(state: OldCustomerRecommendation['state']): string {
  if (state === 'due') return '到建议周期';
  if (state === 'not_due') return '未到建议周期';
  if (state === 'suppressed_active_project') return '已有项目，暂停建议';
  if (state === 'suppressed_open_follow_up') return '已有正式回访';
  if (state === 'needs_baseline') return '缺少关系基线';
  return '证据未知';
}

function recommendationTone(state: OldCustomerRecommendation['state']): string {
  if (state === 'due') return 'border-amber-200 bg-amber-50';
  if (state === 'not_due') return 'border-cyan-200 bg-cyan-50';
  return 'border-gray-200 bg-gray-50';
}

export default function CustomersClient({
  initialCustomers,
  initialError,
}: {
  initialCustomers: CustomerListItem[];
  initialError: string;
}) {
  const [customers] = useState<CustomerListItem[]>(initialCustomers);
  const loading = false;
  const error = initialError;
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [ratings, setRatings] = useState<Map<string, CustomerRatingSummary>>(new Map());
  const [ratingLoadError, setRatingLoadError] = useState('');
  const shanghaiToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await fetch('/api/customer-projects/customer-ratings', { cache: 'no-store' });
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.ok) throw new Error(json?.message || '客户评级查询失败');
        if (!live) return;
        setRatings(new Map((json.data.summaries as CustomerRatingSummary[])
          .map(row => [row.customerReferenceId, row])));
        setRatingLoadError('');
      } catch (cause) {
        if (!live) return;
        setRatingLoadError(cause instanceof Error ? cause.message : '评级服务暂不可用');
      }
    })();
    return () => { live = false; };
  }, []);


  const visibleCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return customers.filter(customer => {
      const rating = ratings.get(customer.id);
      if (filter === 'high_potential' && !['SS', 'S', 'A'].includes(rating?.potentialGrade ?? 'N')) return false;
      if (filter === 'unrated_potential' && (rating?.potentialGrade ?? 'N') !== 'N') return false;
      if (filter === 'my_verified_customers' && rating?.isMaintenanceOwner !== true) return false;
      if (filter === 'rating_action_due' && !(rating?.nextCheckOn && rating.nextCheckOn <= shanghaiToday)) return false;
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

      if (
        filter === 'due_recommendation'
        && customer.recommendation.state !== 'due'
      ) return false;

      if (filter === 'active_project' && !customer.hasActiveProject) return false;

      if (!query) return true;

      return [
        customer.displayName,
        customer.sourceLabel ?? '',
        customer.externalOwnerReference ?? '',
        customer.nextFollowUp?.title ?? '',
        customer.lastInteraction?.summary ?? '',
        customer.recommendation.segmentBasis,
        rating?.maintenanceOwnerName ?? '',
        rating?.potentialGrade ?? '',
      ].some(value => value.toLowerCase().includes(query));
    });
  }, [customers, filter, search, ratings, shanghaiToday]);

  const dueCount = customers.filter(customer =>
    customer.nextFollowUp?.isAssignedToMe
    && customer.nextFollowUp.dueByBusinessEnd,
  ).length;
  const assignedCount = customers.filter(customer => customer.nextFollowUp?.isAssignedToMe).length;
  const recommendationDueCount = customers.filter(
    customer => customer.recommendation.state === 'due',
  ).length;
  const activeProjectCount = customers.filter(customer => customer.hasActiveProject).length;
  const highPotentialCount = [...ratings.values()].filter(row => ['SS', 'S', 'A'].includes(row.potentialGrade)).length;
  const unratedPotentialCount = [...ratings.values()].filter(row => row.potentialGrade === 'N').length;
  const actionDueCount = [...ratings.values()].filter(row => row.nextCheckOn && row.nextCheckOn <= shanghaiToday).length;

  return (
    <AppLayout>
      <PageHeader
        title="客户"
        description="客户是长期关系；普通回访停留在客户层，只有出现具体商业机会才创建项目。"
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['待我回访', dueCount],
            ['已安排给我', assignedCount],
            ['到建议周期', recommendationDueCount],
            ['有活跃项目', activeProjectCount],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="mt-1 text-lg font-semibold text-gray-800">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ['高潜力客户', highPotentialCount],
            ['潜力尚未评级', unratedPotentialCount],
            ['开发动作到期检查', actionDueCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-gray-200 bg-white p-3">
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
            “我负责的客户”来自已验证的外部客户池归属映射；评级无法替代财务回款及客户主数据。
          </p>
          {ratingLoadError && (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              评级服务未就绪：{ratingLoadError}。原有客户与回访功能保持可用。
            </p>
          )}
          <div className="mt-3">
            <CustomerRatingLegend />
          </div>
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
                href={
                  "/customer-projects/customers/"
                  + customer.id
                  + (customer.recommendation.canArrangeFollowUp
                    ? '#old-customer-recommendation'
                    : '')
                }
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
                      {ratings.has(customer.id) && (
                        <>
                          <CustomerRatingBadge axis="actual" grade={ratings.get(customer.id)!.actualGrade} />
                          <CustomerRatingBadge axis="potential" grade={ratings.get(customer.id)!.potentialGrade} />

                        </>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      {customer.sourceLabel && <span>来源：{customer.sourceLabel}</span>}
                      {ratings.get(customer.id)?.maintenanceOwnerName ? (
                        <span>维护人：{ratings.get(customer.id)?.maintenanceOwnerName}</span>
                      ) : customer.externalOwnerReference ? (
                        <span>外部归属引用：{customer.externalOwnerReference}（待确认映射）</span>
                      ) : null}
                      {ratings.get(customer.id)?.lastRaterName && ratings.get(customer.id)?.potentialGrade !== 'N' && (
                        <span>潜力评分人：{ratings.get(customer.id)?.lastRaterName}</span>
                      )}
                      <span>更新：{formatBusinessDateTime(customer.updatedAt)}</span>
                    </div>

                    {ratings.get(customer.id)?.nextAction && (
                      <div className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs text-slate-700">
                        <span className="font-medium">下一步开发动作：</span>
                        {ratings.get(customer.id)?.nextAction}
                        {ratings.get(customer.id)?.nextCheckOn && (
                          <span className="ml-2 text-slate-500">{ratings.get(customer.id)?.nextCheckOn}</span>
                        )}
                      </div>
                    )}
                    {ratings.get(customer.id)?.customerNotePreview && (
                      <div className="mt-2 line-clamp-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <span className="font-semibold text-slate-700">客户备注：</span>
                        {ratings.get(customer.id)?.customerNotePreview}
                      </div>
                    )}
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
                    {customer.recommendation.segment !== 'UNKNOWN' && (
                      <div
                        className={
                        'mb-2 rounded-lg border px-3 py-2 '
                        + recommendationTone(customer.recommendation.state)
                        }
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-gray-700">
                            {customer.recommendation.segment} 类 · 每 {customer.recommendation.cadenceDays} 天建议
                          </span>
                          <span className="text-[11px] font-medium text-gray-700">
                            {recommendationStateLabel(customer.recommendation.state)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-4 text-gray-600">
                          {customer.recommendation.segmentBasis}
                        </p>
                        {customer.recommendation.nextSuggestedFollowUpAt && (
                          <p className="mt-1 text-[11px] text-gray-500">
                            建议日期：
                            {formatBusinessDateTime(customer.recommendation.nextSuggestedFollowUpAt)}
                          </p>
                        )}
                        {customer.recommendation.suppressionReason && (
                          <p className="mt-1 text-[11px] text-gray-500">
                            {customer.recommendation.suppressionReason}
                          </p>
                        )}
                        {customer.recommendation.canArrangeFollowUp && (
                          <p className="mt-2 text-[11px] font-medium text-cyan-700">
                            安排回访 →
                          </p>
                        )}
                      </div>
                    )}
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
                        当前没有已安排的客户级回访。建议只有由员工确认后才会成为正式任务。
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
