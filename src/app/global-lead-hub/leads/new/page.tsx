import Link from 'next/link';
import { redirect } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import LeadForm from '@/components/global-lead-hub/LeadForm';
import {
  loadGlhAssignableProfiles,
  resolveGlhAccessContext,
} from '@/lib/global-lead-hub/server';
import { getGlhManualCreationGuard } from '@/lib/global-lead-hub/validation';

export const dynamic = 'force-dynamic';

export default async function GlobalLeadHubNewLeadPage() {
  const access = await resolveGlhAccessContext();
  if (!access.ok) {
    if (access.code === 'UNAUTHENTICATED') {
      redirect('/login?redirect=%2Fglobal-lead-hub%2Fleads%2Fnew');
    }
    redirect('/dashboard?error=global_lead_hub_access_denied');
  }

  const guard = getGlhManualCreationGuard();
  const profiles = guard.allowed
    ? await loadGlhAssignableProfiles(access.context)
    : { ok: true as const, data: [] };
  const assignableProfiles = profiles.ok ? profiles.data : [];

  return (
    <AppLayout>
      <PageHeader
        title="Create Test Lead"
        description="Manual creation is a guarded test/dev path backed by the real GLH schema."
      />

      <nav aria-label="Global Lead Hub sections" className="mb-4 flex gap-3 text-xs">
        <Link href="/global-lead-hub" className="text-gray-500 hover:text-gray-900">Today</Link>
        <Link href="/global-lead-hub/leads" className="text-gray-500 hover:text-gray-900">Leads</Link>
        <Link href="/global-lead-hub/tasks" className="text-gray-500 hover:text-gray-900">My Tasks</Link>
      </nav>

      {!guard.allowed ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-sm font-semibold text-amber-900">Manual creation is disabled</h2>
          <p className="mt-2 max-w-2xl text-sm text-amber-800">
            This route fails closed unless the server and database identify a non-Production
            test/dev environment and both explicit guard values match. No browser storage or
            generic data API is used as a fallback.
          </p>
          <Link
            href="/global-lead-hub/leads"
            className="mt-4 inline-flex rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-900"
          >
            Return to lead library
          </Link>
        </div>
      ) : (
        <LeadForm assignableProfiles={assignableProfiles} />
      )}
    </AppLayout>
  );
}
