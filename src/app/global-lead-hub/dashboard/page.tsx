import Link from 'next/link';
import { redirect } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import FollowupDashboard from '@/components/global-lead-hub/FollowupDashboard';
import {
  loadGlhFollowupDashboard,
  resolveGlhAccessContext,
} from '@/lib/global-lead-hub/server';

export const dynamic = 'force-dynamic';

export default async function GlobalLeadHubDashboardPage() {
  const access = await resolveGlhAccessContext();
  if (!access.ok) {
    if (access.code === 'UNAUTHENTICATED') {
      redirect('/login?redirect=%2Fglobal-lead-hub%2Fdashboard');
    }
    redirect('/dashboard?error=global_lead_hub_access_denied');
  }

  const dashboard = await loadGlhFollowupDashboard(access.context);

  return (
    <AppLayout>
      <PageHeader
        title="Follow-up & Dashboard"
        description="Today, overdue and dormant work with simple policy-scoped conversion signals."
      />

      <nav aria-label="Global Lead Hub sections" className="mb-4 flex gap-3 text-xs">
        <Link href="/global-lead-hub" className="text-gray-500 hover:text-gray-900">Today</Link>
        <Link href="/global-lead-hub/inbox" className="text-gray-500 hover:text-gray-900">Inbox</Link>
        <Link href="/global-lead-hub/leads" className="text-gray-500 hover:text-gray-900">Leads</Link>
        <Link href="/global-lead-hub/tasks" className="text-gray-500 hover:text-gray-900">My Tasks</Link>
        <Link href="/global-lead-hub/dashboard" className="font-semibold text-gray-900">Dashboard</Link>
      </nav>

      {!dashboard.ok ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5">
          <h2 className="text-sm font-semibold text-red-800">Dashboard unavailable</h2>
          <p className="mt-1 text-sm text-red-700">
            The organization-scoped read model could not be loaded. Human work and original
            messages remain unchanged, and no provider call was attempted.
          </p>
        </div>
      ) : (
        <FollowupDashboard dashboard={dashboard.data} />
      )}
    </AppLayout>
  );
}
