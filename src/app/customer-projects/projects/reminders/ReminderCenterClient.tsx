'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import type {
  ProjectReminderItem,
  ProjectReminderSnapshot,
} from '@/lib/customer-projects/project-reminder-center';

type CategoryFilter = 'all' | ProjectReminderItem['category'];

const CATEGORIES: Array<{ key: CategoryFilter; label: string }> = [
  { key: 'all', label: '全部提醒' },
  { key: 'formal_due', label: '关键时间' },
  { key: 'project_attention', label: '项目推进' },
  { key: 'development_gap', label: '开发空窗' },
];

const LABELS: Record<ProjectReminderItem['kind'], string> = {
  work_due: '正式任务',
  waiting_check: '等待检查',
  stale_project: '推进记录空窗',
  missing_next_step: '缺少下一步',
  missing_check_time: '缺少检查时间',
  new_project_gap: '新项目开发建议',
};

const SEVERITY_LABELS: Record<ProjectReminderItem['severity'], string> = {
  urgent: '重点关注',
  attention: '需要处理',
  upcoming: '即将到期 / 建议',
};
const SEVERITY_TONES: Record<ProjectReminderItem['severity'], string> = {
  urgent: 'border-red-200 bg-red-50 text-red-700',
  attention: 'border-amber-200 bg-amber-50 text-amber-800',
  upcoming: 'border-blue-200 bg-blue-50 text-blue-700',
};

function beijingTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export default function ReminderCenterClient({
  initialSnapshot,
  initialError,
  isManagement,
}: {
  initialSnapshot: ProjectReminderSnapshot | null;
  initialError: string;
  isManagement: boolean;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [selectedOwnerKey, setSelectedOwnerKey] = useState('all');
  const [search, setSearch] = useState('');
  const snapshot = initialSnapshot;

  const ownerOptions = useMemo(() => {
    if (!snapshot || !isManagement) return [];
    const counts = new Map<string, { name: string; count: number }>();
    for (const item of snapshot.items) {
      const existing = counts.get(item.ownerKey);
      if (existing) existing.count += 1;
      else counts.set(item.ownerKey, { name: item.ownerName, count: 1 });
    }
    const result = Array.from(counts, ([key, value]) => ({ key, ...value }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.key.localeCompare(b.key));
    const nameCounts = new Map<string, number>();
    result.forEach(item => nameCounts.set(item.name, (nameCounts.get(item.name) ?? 0) + 1));
    const sameNameOrdinal = new Map<string, number>();
    return result.map(item => {
      const ordinal = (sameNameOrdinal.get(item.name) ?? 0) + 1;
      sameNameOrdinal.set(item.name, ordinal);
      return {
        ...item,
        label: (nameCounts.get(item.name) ?? 0) > 1
          ? item.name + '（同名人员 ' + ordinal + '）' : item.name,
      };
    });
  }, [snapshot, isManagement]);

  const filtered = useMemo(() => {
    if (!snapshot) return [];
    const q = search.trim().toLowerCase();
    return snapshot.items.filter(item => (
      (category === 'all' || item.category === category)
      && (selectedOwnerKey === 'all' || item.ownerKey === selectedOwnerKey)
      && (!q || [item.title, item.detail, item.ownerName]
        .some(value => value.toLowerCase().includes(q)))
    ));
  }, [snapshot, category, selectedOwnerKey, search]);

  return (
    <AppLayout>
      <PageHeader
        title="项目推进提醒"
        description="从已确认的工作节点和可核实的项目进展自动整理；提醒不等于员工绩效评价。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/customer-projects/projects" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 no-underline hover:bg-gray-50">
              返回项目
            </Link>
            <button type="button" className="btn-primary" onClick={() => router.refresh()}>
              刷新提醒
            </button>
          </div>
        }
      />

      <div className="space-y-4">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-900">当前阶段：站内提醒预览，不会主动发送消息</p>
          <p className="mt-1 text-xs leading-relaxed text-blue-800">
            仅在打开或刷新本页时基于现有资料计算，不自动创建任务、修改日期或发送企业微信、邮件、WhatsApp。
            正式到期与经营观察分别展示，避免将没有录入的进展误判为失职。
          </p>
        </div>

        {initialError ? (
          <EmptyState title={initialError} description="项目资料无法完整读取时，不显示可能遗漏的提醒结论。" />
        ) : !snapshot ? (
          <EmptyState title="暂时无法生成推进提醒" />
        ) : (
          <>
            {snapshot.developmentGapCoverage === 'unavailable' && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                当前账号的员工名单读取权限不足，开发空窗统计不可用；这不代表销售人员没有开发空窗。
              </p>
            )}
            {snapshot.developmentGapCoverage === 'self' && (
              <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                当前仅显示本人新项目开发建议，非全团队统计。
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                ['已逾期节点', snapshot.summary.formalOverdue],
                ['正式节点提醒', snapshot.summary.formalDue],
                ['即将到期', snapshot.summary.upcomingFormal],
                ['项目关注', snapshot.summary.projectAttention],
                ['开发空窗建议', snapshot.developmentGapCoverage === 'unavailable' ? '不可用' : snapshot.summary.developmentGaps],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                {CATEGORIES.map(item => (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => setCategory(item.key)}
                    className={
                      'rounded-lg border px-3 py-1.5 text-xs font-medium '
                      + (category === item.key
                        ? 'border-cyan-300 bg-cyan-50 text-cyan-800'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                {isManagement && ownerOptions.length > 0 && (
                  <select
                    aria-label="按提醒责任业务员筛选"
                    value={selectedOwnerKey}
                    onChange={event => setSelectedOwnerKey(event.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm sm:w-64"
                  >
                    <option value="all">全部业务员</option>
                    {ownerOptions.map(option => (
                      <option key={option.key} value={option.key}>
                        {option.label}（{option.count}）
                      </option>
                    ))}
                  </select>
                )}
                <input
                  aria-label="搜索提醒"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="搜索项目、负责人或提醒原因"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <p className="mt-2 text-xs text-gray-500" aria-live="polite">
                当前显示 {filtered.length} 条提醒
                {snapshot.generatedAt && ' · 计算于北京时间 ' + (beijingTime(snapshot.generatedAt) || '未知')}
              </p>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                title="当前条件下没有提醒"
                description="这不代表所有客户或项目都无需跟进；仅表示尚无符合已设规则且能被当前账号读取的记录。"
              />
            ) : (
              <div className="space-y-3">
                {filtered.map(item => (
                  <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{item.title}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {LABELS[item.kind]}
                      </span>
                      <span className={'rounded-md border px-2 py-0.5 text-xs font-medium ' + SEVERITY_TONES[item.severity]}>
                        {SEVERITY_LABELS[item.severity]}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-700">{item.detail}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>{item.kind === 'work_due' ? '任务执行人' : '业务负责人'}：{item.ownerName}</span>
                      {item.effectiveAt && <span>记录时间：{beijingTime(item.effectiveAt)}</span>}
                    </div>
                    <div className="mt-3">
                      {item.projectId ? (
                        <Link
                          href={'/customer-projects/projects/' + encodeURIComponent(item.projectId)}
                          className="text-sm font-medium text-cyan-700 hover:underline"
                        >
                          查看项目并推进 →
                        </Link>
                      ) : (
                        <Link href="/customer-projects/projects" className="text-sm font-medium text-cyan-700 hover:underline">
                          查看项目与新建入口 →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs leading-relaxed text-gray-500">
              当前暂定规则：提前48小时、实质进展空窗7/14天、新项目空窗14/30天。
              所有时间按北京时间展示；等待客户且已有未来检查时间的项目不会仅因等待而被标记为停滞。
              阈值及外部推送频率需要经业务确认后单独启用。
            </p>
          </>
        )}
      </div>
    </AppLayout>
  );
}
