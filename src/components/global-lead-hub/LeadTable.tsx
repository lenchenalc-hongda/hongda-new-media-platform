import Link from 'next/link';
import type { GlhLeadListItem } from '@/lib/global-lead-hub/read-model';

function gradeClass(grade: GlhLeadListItem['grade']): string {
  if (grade === 'A') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (grade === 'B') return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (grade === 'C') return 'bg-sky-50 text-sky-700 ring-sky-200';
  if (grade === 'D') return 'bg-slate-100 text-slate-600 ring-slate-200';
  return 'bg-gray-50 text-gray-500 ring-gray-200';
}

function lifecycleClass(lifecycle: GlhLeadListItem['lifecycle']): string {
  if (lifecycle === 'READY_FOR_HUMAN') {
    return 'bg-orange-50 text-orange-700';
  }
  if (lifecycle === 'QUOTATION' || lifecycle === 'SAMPLE' || lifecycle === 'NEGOTIATION') {
    return 'bg-indigo-50 text-indigo-700';
  }
  if (lifecycle === 'WON') return 'bg-emerald-50 text-emerald-700';
  if (lifecycle === 'LOST' || lifecycle === 'INVALID') return 'bg-gray-100 text-gray-600';
  if (lifecycle === 'DORMANT') return 'bg-stone-100 text-stone-600';
  return 'bg-blue-50 text-blue-700';
}

function dueLabel(item: GlhLeadListItem): string {
  if (!item.nextDueAt) return 'No follow-up';
  const date = new Date(item.nextDueAt);
  if (Number.isNaN(date.getTime())) return 'No follow-up';
  const prefix = item.dueBucket === 'OVERDUE'
    ? 'Overdue'
    : item.dueBucket === 'TODAY'
      ? 'Today'
      : 'Upcoming';
  return `${prefix} ${date.toLocaleDateString('en-CA')}`;
}

export default function LeadTable({
  leads,
  emptyTitle = 'No leads in this view',
  emptyDescription = 'Adjust the filters or create a test lead in an allowed environment.',
}: {
  leads: GlhLeadListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (leads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-gray-700">{emptyTitle}</p>
        <p className="mt-1 text-xs text-gray-500">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <caption className="sr-only">Global Lead Hub lead list</caption>
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Customer</th>
              <th scope="col" className="px-3 py-3 font-medium">Grade</th>
              <th scope="col" className="px-3 py-3 font-medium">Lifecycle</th>
              <th scope="col" className="px-3 py-3 font-medium">Owner</th>
              <th scope="col" className="px-3 py-3 font-medium">Requirement</th>
              <th scope="col" className="px-3 py-3 font-medium">Next follow-up</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map(lead => (
              <tr key={lead.id} className="hover:bg-gray-50">
                <td className="max-w-[260px] px-4 py-3">
                  <Link
                    href={`/global-lead-hub/leads/${encodeURIComponent(lead.id)}`}
                    className="font-medium text-gray-900 hover:text-blue-700"
                  >
                    {lead.contactName}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {helpCompanyLine(lead)}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex min-w-7 justify-center rounded px-2 py-1 text-xs font-semibold ring-1 ring-inset ${gradeClass(lead.grade)}`}
                    aria-label={lead.grade ? `Grade ${lead.grade}` : 'Ungraded'}
                  >
                    {lead.grade ?? '-'}
                  </span>
                  <p className="mt-1 text-[11px] text-gray-400">
                    {lead.score}/100 · {lead.completeness}%
                  </p>
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${lifecycleClass(lead.lifecycle)}`}>
                    {lead.lifecycle.replaceAll('_', ' ')}
                  </span>
                  <p className="mt-1 text-[11px] text-gray-400">
                    {lead.conversationMode.replaceAll('_', ' ')}
                  </p>
                </td>
                <td className="px-3 py-3 text-gray-700">
                  {lead.ownerName || lead.ownerProfileId || 'Unassigned'}
                </td>
                <td className="px-3 py-3 text-gray-700">
                  {lead.requirementType?.replaceAll('_', ' ') || 'Unclear'}
                </td>
                <td className="px-3 py-3">
                  <span className={lead.dueBucket === 'OVERDUE' ? 'font-medium text-red-700' : 'text-gray-700'}>
                    {dueLabel(lead)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/global-lead-hub/leads/${encodeURIComponent(lead.id)}`}
                    className="text-xs font-medium text-blue-700 hover:text-blue-900"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function helpCompanyLine(lead: GlhLeadListItem): string {
  return [
    lead.companyName,
    lead.country,
    lead.source.replaceAll('_', ' '),
  ].filter(Boolean).join(' · ') || 'No company or country supplied';
}
