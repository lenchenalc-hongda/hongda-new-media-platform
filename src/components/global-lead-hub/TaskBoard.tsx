'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { GlhTaskBoardItem } from '@/lib/global-lead-hub/read-model';

type TaskFilter = 'OPEN' | 'TODAY' | 'OVERDUE' | 'UPCOMING' | 'DONE';

const FILTERS: Array<{ key: TaskFilter; label: string }> = [
  { key: 'OPEN', label: 'Open' },
  { key: 'TODAY', label: 'Today' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'UPCOMING', label: 'Upcoming' },
  { key: 'DONE', label: 'Completed' },
];

function isOpen(status: string): boolean {
  return status === 'OPEN' || status === 'IN_PROGRESS' || status === 'OVERDUE';
}

function formatDue(value: string | null): string {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No due date';
  return date.toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TaskBoard({ items }: { items: GlhTaskBoardItem[] }) {
  const [filter, setFilter] = useState<TaskFilter>('OPEN');
  const [kind, setKind] = useState<'ALL' | 'TASK' | 'FOLLOWUP'>('ALL');

  const visible = useMemo(() => items.filter(item => {
    if (kind !== 'ALL' && item.kind !== kind) return false;
    if (filter === 'OPEN') return isOpen(item.status);
    if (filter === 'DONE') return item.status === 'DONE';
    return isOpen(item.status) && item.dueBucket === filter;
  }), [filter, items, kind]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Task due filters">
          {FILTERS.map(item => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={filter === item.key}
              onClick={() => setFilter(item.key)}
              className={
                'rounded-md px-3 py-1.5 text-xs font-medium transition '
                + (filter === item.key
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100')
              }
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="task-kind" className="text-xs font-medium text-gray-500">Type</label>
          <select
            id="task-kind"
            value={kind}
            onChange={event => setKind(event.target.value as typeof kind)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs"
          >
            <option value="ALL">All work</option>
            <option value="TASK">Tasks</option>
            <option value="FOLLOWUP">Follow-ups</option>
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">No work matches this view</p>
          <p className="mt-1 text-xs text-gray-500">
            Tasks and follow-ups appear only for leads you can access.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {visible.map(item => (
            <article key={`${item.kind}-${item.id}`} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{item.title}</p>
                  <Link
                    href={`/global-lead-hub/leads/${encodeURIComponent(item.leadId)}`}
                    className="mt-1 block truncate text-xs text-blue-700 hover:text-blue-900"
                  >
                    {item.contactName || item.companyName || item.leadId}
                  </Link>
                </div>
                <span className="shrink-0 rounded bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600">
                  {item.kind === 'FOLLOWUP' ? 'Follow-up' : 'Task'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">
                  {item.type.replaceAll('_', ' ')}
                </span>
                <span className={
                  'rounded px-2 py-1 '
                  + (item.dueBucket === 'OVERDUE'
                    ? 'bg-red-50 text-red-700'
                    : item.dueBucket === 'TODAY'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-gray-100 text-gray-600')
                }>
                  {item.dueBucket === 'NONE' ? 'Unscheduled' : item.dueBucket}
                </span>
                <span className="rounded bg-gray-100 px-2 py-1 text-gray-600">
                  {item.status.replaceAll('_', ' ')}
                </span>
              </div>
              <p className="mt-3 text-xs text-gray-500">{formatDue(item.dueAt)}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
