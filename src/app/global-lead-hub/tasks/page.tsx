import Link from 'next/link';
import { redirect } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import TaskBoard from '@/components/global-lead-hub/TaskBoard';
import {
  loadGlhMyTasks,
  resolveGlhAccessContext,
} from '@/lib/global-lead-hub/server';

export const dynamic = 'force-dynamic';

export default async function GlobalLeadHubTasksPage() {
  const access = await resolveGlhAccessContext();
  if (!access.ok) {
    if (access.code === 'UNAUTHENTICATED') {
      redirect('/login?redirect=%2Fglobal-lead-hub%2Ftasks');
    }
    redirect('/dashboard?error=global_lead_hub_access_denied');
  }

  const tasks = await loadGlhMyTasks(access.context);

  return (
    <AppLayout>
      <PageHeader
        title="My Tasks"
        description="Open tasks and follow-ups assigned to you across accessible GLH leads."
      />

      <nav aria-label="Global Lead Hub sections" className="mb-4 flex gap-3 text-xs">
        <Link href="/global-lead-hub" className="text-gray-500 hover:text-gray-900">Today</Link>
        <Link href="/global-lead-hub/leads" className="text-gray-500 hover:text-gray-900">Leads</Link>
        <Link href="/global-lead-hub/tasks" className="font-semibold text-gray-900">My Tasks</Link>
      </nav>

      {!tasks.ok ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {tasks.code === 'LIMIT_EXCEEDED'
            ? 'Your task list exceeds the current safe display limit.'
            : 'Your GLH tasks could not be loaded. No provider call was attempted.'}
        </div>
      ) : (
        <TaskBoard items={tasks.data} />
      )}
    </AppLayout>
  );
}
