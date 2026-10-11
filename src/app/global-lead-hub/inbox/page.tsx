import Link from 'next/link';
import { redirect } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import UnifiedInbox from '@/components/global-lead-hub/UnifiedInbox';
import {
  loadGlhAssignableProfiles,
  loadGlhInbox,
  resolveGlhAccessContext,
} from '@/lib/global-lead-hub/server';

export const dynamic = 'force-dynamic';

export default async function GlobalLeadHubInboxPage() {
  const access = await resolveGlhAccessContext();
  if (!access.ok) {
    if (access.code === 'UNAUTHENTICATED') redirect('/login?redirect=%2Fglobal-lead-hub%2Finbox');
    redirect('/dashboard?error=global_lead_hub_access_denied');
  }
  const [inbox, assignable] = await Promise.all([
    loadGlhInbox(access.context),
    loadGlhAssignableProfiles(access.context),
  ]);
  const canTransfer = access.context.role === 'ADMIN' || access.context.role === 'MANAGER';

  return (
    <AppLayout>
      <PageHeader title="Unified Inbox" description="Original conversations, human handoff, and AI copilot context." />
      <nav aria-label="Global Lead Hub sections" className="mb-4 flex gap-3 text-xs">
        <Link href="/global-lead-hub" className="text-gray-500 hover:text-gray-900">Today</Link>
        <Link href="/global-lead-hub/inbox" className="font-semibold text-gray-900">Inbox</Link>
        <Link href="/global-lead-hub/leads" className="text-gray-500 hover:text-gray-900">Leads</Link>
        <Link href="/global-lead-hub/tasks" className="text-gray-500 hover:text-gray-900">My Tasks</Link>
      </nav>
      {!inbox.ok || !assignable.ok ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          The organization-scoped inbox is unavailable. No provider or Production action was attempted.
        </div>
      ) : (
        <UnifiedInbox
          inbox={inbox.data}
          canTransfer={canTransfer}
          assignableProfiles={assignable.data}
        />
      )}
    </AppLayout>
  );
}
