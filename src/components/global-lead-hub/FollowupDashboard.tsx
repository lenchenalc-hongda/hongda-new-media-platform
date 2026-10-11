import Link from 'next/link';
import type {
  GlhFollowupBucket,
  GlhManagerDashboard,
} from '@/lib/global-lead-hub/phase6-followup-dashboard';

const BUCKETS: Array<{ key: GlhFollowupBucket; label: string }> = [
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'TODAY', label: 'Due today' },
  { key: 'UPCOMING', label: 'Upcoming' },
  { key: 'DORMANT', label: 'Dormant revival' },
];

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

export default function FollowupDashboard({ dashboard }: { dashboard: GlhManagerDashboard }) {
  const summary = dashboard.summary;
  const cards = [
    ['Accessible leads', summary.totalLeads],
    ['Active leads', summary.activeLeads],
    ['Waiting for human', summary.waitingForHuman],
    ['Due today', summary.dueToday],
    ['Overdue', summary.overdue],
    ['Dormant', summary.dormant],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
        {dashboard.managerView
          ? 'Organization view. All counts remain restricted to your authenticated organization.'
          : 'Personal view. Counts include only records already visible through your GLH access policy.'}
        {' '}This workspace remains available when AI is offline.
      </div>

      <section aria-label="Follow-up summary" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-900">Follow-up queues</h2>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {BUCKETS.map(bucket => (
            <article key={bucket.key} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">{bucket.label}</h3>
                <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
                  {dashboard.work[bucket.key].length}
                </span>
              </div>
              {dashboard.work[bucket.key].length === 0 ? (
                <p className="mt-4 text-xs text-gray-500">No accessible work in this queue.</p>
              ) : (
                <ul className="mt-3 divide-y divide-gray-100">
                  {dashboard.work[bucket.key].slice(0, 8).map(item => (
                    <li key={`${item.kind}-${item.id}`} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/global-lead-hub/leads/${encodeURIComponent(item.leadId)}`}
                            className="block truncate text-xs font-semibold text-blue-700"
                          >
                            {item.contactName}
                          </Link>
                          <p className="mt-1 truncate text-xs text-gray-700">{item.title}</p>
                        </div>
                        <span className="shrink-0 text-[11px] text-gray-500">{item.assigneeName}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-500">{formatDue(item.dueAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <article className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Simple conversion view</h2>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Metric label="Quotation+" value={dashboard.conversion.quotation} rate={dashboard.conversion.quotationRate} />
            <Metric label="Sample+" value={dashboard.conversion.sample} rate={dashboard.conversion.sampleRate} />
            <Metric label="Won" value={dashboard.conversion.won} rate={dashboard.conversion.wonRate} />
          </div>
        </article>

        <article className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Grade distribution</h2>
          <div className="mt-4 grid grid-cols-5 gap-2 text-center">
            {Object.entries(dashboard.grades).map(([grade, count]) => (
              <div key={grade} className="rounded bg-gray-50 px-2 py-3">
                <p className="text-xs text-gray-500">{grade}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{count}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      {dashboard.managerView && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Team workload</h2>
          {dashboard.workload.length === 0 ? (
            <p className="mt-3 text-xs text-gray-500">No open assigned work.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-gray-500">
                  <tr><th className="py-2">Assignee</th><th>Open</th><th>Overdue</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dashboard.workload.map(row => (
                    <tr key={row.profileId}>
                      <td className="py-2 font-medium text-gray-800">{row.profileName}</td>
                      <td>{row.open}</td>
                      <td>{row.overdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Metric({ label, value, rate }: { label: string; value: number; rate: number }) {
  return (
    <div className="rounded bg-gray-50 px-3 py-4 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-500">{rate}% of accessible leads</p>
    </div>
  );
}
