import { redirect } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import LeadTable from '@/components/global-lead-hub/LeadTable';
import {
  loadGlhTodayDashboard,
  resolveGlhAccessContext,
} from '@/lib/global-lead-hub/server';

export const dynamic = 'force-dynamic';

export default async function GlobalLeadHubPage() {
  const access = await resolveGlhAccessContext();

  if (!access.ok) {
    if (access.code === 'UNAUTHENTICATED') {
      redirect('/login?redirect=%2Fglobal-lead-hub');
    }
    redirect('/dashboard?error=global_lead_hub_access_denied');
  }

  const dashboard = await loadGlhTodayDashboard(access.context);

  return (
    <AppLayout>
      <PageHeader
        title="Global Lead Hub"
        description="Today's actionable human work, organization-scoped and provider-independent."
        actions={(
          <div className="flex gap-2">
            <Link
              href="/global-lead-hub/leads"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Lead library
            </Link>
            <Link
              href="/global-lead-hub/tasks"
              className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800"
            >
              My tasks
            </Link>
          </div>
        )}
      />

      <nav aria-label="Global Lead Hub sections" className="mb-4 flex gap-3 text-xs">
        <Link href="/global-lead-hub" className="font-semibold text-gray-900">Today</Link>
        <Link href="/global-lead-hub/leads" className="text-gray-500 hover:text-gray-900">Leads</Link>
        <Link href="/global-lead-hub/tasks" className="text-gray-500 hover:text-gray-900">My Tasks</Link>
      </nav>

      {!dashboard.ok ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5">
          <h2 className="text-sm font-semibold text-red-800">Today view unavailable</h2>
          <p className="mt-1 text-sm text-red-700">
            {dashboard.code === 'LIMIT_EXCEEDED'
              ? 'The accessible lead set exceeds the current safe display limit.'
              : 'The server could not load the organization-scoped read model. No provider call was attempted.'}
          </p>
        </div>
      ) : (
        <>
          <section aria-label="Today action counts" className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
            <Count label="New leads" value={dashboard.data.summary.newLeads} href="/global-lead-hub/leads?lifecycle=NEW" />
            <Count label="Waiting for human" value={dashboard.data.summary.waitingForHuman} href="/global-lead-hub/leads?lifecycle=READY_FOR_HUMAN" />
            <Count label="Due today" value={dashboard.data.summary.dueToday} href="/global-lead-hub/tasks" />
            <Count label="Newly qualified" value={dashboard.data.summary.newlyQualified} href="/global-lead-hub/leads" />
            <Count label="Quotation" value={dashboard.data.summary.quotationFollowups} href="/global-lead-hub/leads?lifecycle=QUOTATION" />
            <Count label="Sample" value={dashboard.data.summary.sampleFollowups} href="/global-lead-hub/leads?lifecycle=SAMPLE" />
            <Count label="Overdue" value={dashboard.data.summary.overdue} href="/global-lead-hub/leads?due=OVERDUE" />
            <Count label="Dormant" value={dashboard.data.summary.dormant} href="/global-lead-hub/leads?lifecycle=DORMANT" />
          </section>

          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">My priority customers</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Sorted by grade, handoff urgency, score, and next follow-up.
                </p>
              </div>
              <Link href="/global-lead-hub/leads" className="text-xs font-medium text-blue-700">
                View all
              </Link>
            </div>
            <LeadTable
              leads={dashboard.data.priorityCustomers}
              emptyTitle="No priority customers yet"
              emptyDescription="Accessible leads will appear here as their qualification and follow-up data is recorded."
            />
          </section>
        </>
      )}
    </AppLayout>
  );
}

function Count({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-gray-200 bg-white p-3 transition hover:border-gray-300 hover:shadow-sm"
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
    </Link>
  );
}
