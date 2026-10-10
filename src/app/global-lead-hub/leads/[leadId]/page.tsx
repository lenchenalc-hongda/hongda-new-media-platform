import Link from 'next/link';
import { redirect } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import LeadDetail from '@/components/global-lead-hub/LeadDetail';
import {
  loadGlhAssignableProfiles,
  loadGlhLeadDetail,
  resolveGlhAccessContext,
} from '@/lib/global-lead-hub/server';

export const dynamic = 'force-dynamic';

export default async function GlobalLeadHubLeadDetailPage({
  params,
}: {
  params: { leadId: string };
}) {
  const access = await resolveGlhAccessContext();
  if (!access.ok) {
    if (access.code === 'UNAUTHENTICATED') {
      redirect(`/login?redirect=${encodeURIComponent(`/global-lead-hub/leads/${params.leadId}`)}`);
    }
    redirect('/dashboard?error=global_lead_hub_access_denied');
  }

  const detail = await loadGlhLeadDetail(access.context, params.leadId);
  const canAssign = access.context.role === 'ADMIN' || access.context.role === 'MANAGER';
  const assignable = canAssign
    ? await loadGlhAssignableProfiles(access.context)
    : { ok: true as const, data: [] };

  return (
    <AppLayout>
      <PageHeader
        title={detail.ok ? detail.data.listItem.contactName : 'Lead Detail'}
        description={detail.ok
          ? `${detail.data.listItem.lifecycle.replaceAll('_', ' ')} · ${detail.data.listItem.source}`
          : 'Organization-scoped lead record'}
      />

      <nav aria-label="Global Lead Hub sections" className="mb-4 flex gap-3 text-xs">
        <Link href="/global-lead-hub" className="text-gray-500 hover:text-gray-900">Today</Link>
        <Link href="/global-lead-hub/leads" className="text-gray-500 hover:text-gray-900">Leads</Link>
        <Link href="/global-lead-hub/tasks" className="text-gray-500 hover:text-gray-900">My Tasks</Link>
      </nav>

      {!detail.ok ? (
        <div role="alert" className="rounded-lg border border-gray-300 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900">
            {detail.code === 'NOT_FOUND' ? 'Lead not available' : 'Lead detail unavailable'}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {detail.code === 'NOT_FOUND'
              ? 'The lead does not exist in your organization and authorized lead scope.'
              : 'The server could not load the lead detail. No provider or Production action was attempted.'}
          </p>
          <Link
            href="/global-lead-hub/leads"
            className="mt-4 inline-flex rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700"
          >
            Return to lead library
          </Link>
        </div>
      ) : !assignable.ok ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Assignment choices could not be loaded. Lead details remain read-only.
        </div>
      ) : (
        <LeadDetail
          detail={detail.data}
          canAssign={canAssign}
          assignableProfiles={assignable.data}
        />
      )}
    </AppLayout>
  );
}
