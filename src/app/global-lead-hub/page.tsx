import { redirect } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import { resolveGlhAccessContext } from '@/lib/global-lead-hub/server';

export const dynamic = 'force-dynamic';

export default async function GlobalLeadHubPage() {
  const access = await resolveGlhAccessContext();

  if (!access.ok) {
    if (access.code === 'UNAUTHENTICATED') {
      redirect('/login?redirect=%2Fglobal-lead-hub');
    }
    redirect('/dashboard?error=global_lead_hub_access_denied');
  }

  return (
    <AppLayout>
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Global Lead Hub
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          Lead Operations
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Organization-scoped intake, qualification, handoff, and sales follow-up.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-800">Lead Intake</h2>
          <p className="mt-2 text-sm text-slate-500">
            Provider events are persisted before downstream processing.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-800">Human Handoff</h2>
          <p className="mt-2 text-sm text-slate-500">
            Access is organization-bound and limited to Admin, Manager, and Sales roles.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-800">Audit Trail</h2>
          <p className="mt-2 text-sm text-slate-500">
            Assignment, grade, stage, handoff, and channel changes are append-oriented.
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Access role</dt>
            <dd className="mt-1 font-medium text-slate-900">{access.context.role}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Organization</dt>
            <dd className="mt-1 font-mono text-xs text-slate-800">
              {access.context.organizationId}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Account</dt>
            <dd className="mt-1 font-mono text-xs text-slate-800">
              {access.context.actorProfileId}
            </dd>
          </div>
        </dl>
      </section>
    </AppLayout>
  );
}
