import type { GlhAdAttributionDashboard as Dashboard } from '@/lib/global-lead-hub/ad-attribution';

export default function AdAttributionDashboard({ dashboard }: { dashboard: Dashboard }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Metric label="Accessible leads" value={dashboard.summary.totalLeads} />
        <Metric label="Attributed" value={dashboard.summary.attributedLeads} />
        <Metric label="Unattributed" value={dashboard.summary.unattributedLeads} />
        <Metric label="Coverage" value={`${dashboard.summary.attributionRate}%`} />
        <Metric label="Qualified" value={dashboard.summary.qualifiedLeads} />
        <Metric label="Won" value={dashboard.summary.wonLeads} />
      </div>
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-sm font-semibold text-gray-900">Source and creative quality</h2><p className="mt-1 text-xs text-gray-500">Existing GLH identifiers only; missing provider facts stay explicitly unattributed.</p></div>
          <span className="rounded bg-gray-100 px-2 py-1 text-[11px] text-gray-600">{dashboard.scope === 'ORGANIZATION' ? 'Organization scope' : 'My accessible records'}</span>
        </div>
        {dashboard.groups.length === 0 ? <p className="mt-4 text-sm text-gray-500">No accessible leads yet.</p> : (
          <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs">
            <thead className="text-gray-500"><tr><th className="py-2">Source</th><th>Reference</th><th>Leads</th><th>Qualified</th><th>A/B</th><th>Quotation+</th><th>Sample+</th><th>Won</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{dashboard.groups.map(group => (
              <tr key={group.key}><td className="py-2 font-medium text-gray-800">{group.sourcePlatform}</td><td className="max-w-48 truncate" title={group.label}>{group.label}</td><td>{group.leads}</td><td>{group.qualified} ({group.qualificationRate}%)</td><td>{group.highPriority}</td><td>{group.quotation}</td><td>{group.sample}</td><td>{group.won} ({group.winRate}%)</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <div className="grid gap-3 lg:grid-cols-3"><Breakdown title="Country" rows={dashboard.country} /><Breakdown title="Product" rows={dashboard.product} /><Breakdown title="Requirement" rows={dashboard.requirement} /></div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-3"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-xl font-semibold text-gray-900">{value}</p></div>;
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ value: string; leads: number }> }) {
  return <section className="rounded-lg border border-gray-200 bg-white p-4"><h2 className="text-sm font-semibold text-gray-900">{title}</h2><ul className="mt-3 space-y-2 text-xs">{rows.slice(0, 8).map(row => <li key={row.value} className="flex justify-between gap-3"><span className="truncate text-gray-700">{row.value}</span><span className="font-medium text-gray-900">{row.leads}</span></li>)}{rows.length === 0 && <li className="text-gray-500">No data.</li>}</ul></section>;
}
