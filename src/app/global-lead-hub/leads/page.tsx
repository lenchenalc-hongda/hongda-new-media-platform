import Link from 'next/link';
import { redirect } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import LeadTable from '@/components/global-lead-hub/LeadTable';
import {
  GLH_LIFECYCLE_STATES,
  GLH_PRIORITY_GRADES,
} from '@/lib/global-lead-hub/domain';
import {
  GLH_REQUIREMENT_TYPES,
  GLH_SOURCE_PLATFORMS,
} from '@/lib/global-lead-hub/read-model';
import {
  loadGlhLeads,
  resolveGlhAccessContext,
} from '@/lib/global-lead-hub/server';
import {
  getGlhManualCreationGuard,
  parseGlhLeadListFilters,
} from '@/lib/global-lead-hub/validation';

export const dynamic = 'force-dynamic';

function value(input: string | string[] | undefined): string {
  return Array.isArray(input) ? input[0] ?? '' : input ?? '';
}

export default async function GlobalLeadHubLeadsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const access = await resolveGlhAccessContext();
  if (!access.ok) {
    if (access.code === 'UNAUTHENTICATED') {
      redirect('/login?redirect=%2Fglobal-lead-hub%2Fleads');
    }
    redirect('/dashboard?error=global_lead_hub_access_denied');
  }

  const query = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, raw]) => {
    const selected = value(raw);
    if (selected) query.set(key, selected);
  });
  const filters = parseGlhLeadListFilters(query);
  const leads = await loadGlhLeads(access.context, filters);
  const manualCreation = getGlhManualCreationGuard();

  return (
    <AppLayout>
      <PageHeader
        title="Lead Library"
        description="Search organization-scoped leads by the frozen Phase 2 filters."
        actions={manualCreation.allowed ? (
          <Link
            href="/global-lead-hub/leads/new"
            className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800"
          >
            Create test lead
          </Link>
        ) : undefined}
      />

      <nav aria-label="Global Lead Hub sections" className="mb-4 flex gap-3 text-xs">
        <Link href="/global-lead-hub" className="text-gray-500 hover:text-gray-900">Today</Link>
        <Link href="/global-lead-hub/leads" className="font-semibold text-gray-900">Leads</Link>
        <Link href="/global-lead-hub/tasks" className="text-gray-500 hover:text-gray-900">My Tasks</Link>
      </nav>

      <form className="mb-4 rounded-lg border border-gray-200 bg-white p-3" method="get">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <label className="text-xs text-gray-500">
            Search
            <input
              name="search"
              defaultValue={value(searchParams.search)}
              placeholder="Customer, company, owner, ID"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label className="text-xs text-gray-500">
            Country
            <input
              name="country"
              defaultValue={value(searchParams.country)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <FilterSelect
            name="source"
            label="Source"
            defaultValue={value(searchParams.source)}
            options={GLH_SOURCE_PLATFORMS.map(item => ({ value: item, label: item }))}
          />
          <FilterSelect
            name="requirement"
            label="Requirement"
            defaultValue={value(searchParams.requirement)}
            options={GLH_REQUIREMENT_TYPES.map(item => ({
              value: item,
              label: item.replaceAll('_', ' '),
            }))}
          />
          <FilterSelect
            name="grade"
            label="Grade"
            defaultValue={value(searchParams.grade)}
            options={GLH_PRIORITY_GRADES.map(item => ({ value: item, label: item }))}
          />
          <FilterSelect
            name="lifecycle"
            label="Lifecycle"
            defaultValue={value(searchParams.lifecycle)}
            options={GLH_LIFECYCLE_STATES.map(item => ({
              value: item,
              label: item.replaceAll('_', ' '),
            }))}
          />
          <label className="text-xs text-gray-500">
            Owner profile ID
            <input
              name="owner"
              defaultValue={value(searchParams.owner)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <FilterSelect
            name="due"
            label="Follow-up due"
            defaultValue={value(searchParams.due)}
            options={[
              { value: 'TODAY', label: 'Today' },
              { value: 'OVERDUE', label: 'Overdue' },
              { value: 'UPCOMING', label: 'Upcoming' },
            ]}
          />
          <label className="text-xs text-gray-500">
            Ad / creative
            <input
              name="adCreative"
              defaultValue={value(searchParams.adCreative)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800"
            >
              Apply filters
            </button>
            <Link
              href="/global-lead-hub/leads"
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600"
            >
              Reset
            </Link>
          </div>
        </div>
      </form>

      {!leads.ok ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {leads.code === 'LIMIT_EXCEEDED'
            ? 'The accessible lead set exceeds the current safe display limit. Add filters to narrow it.'
            : 'The lead library could not be loaded from the organization-scoped read model.'}
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-gray-500">
            {leads.data.length} accessible lead{leads.data.length === 1 ? '' : 's'}
          </p>
          <LeadTable leads={leads.data} />
        </>
      )}
    </AppLayout>
  );
}

function FilterSelect({
  name,
  label,
  defaultValue,
  options = [],
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options?: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="text-xs text-gray-500">
      {label}
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
      >
        <option value="">All</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
