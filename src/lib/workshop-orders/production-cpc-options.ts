import type { SupabaseClient } from '@supabase/supabase-js';

export interface WosV1CpcCustomerOption {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'pending_review';
}

export interface WosV1CpcProjectOption {
  readonly id: string;
  readonly customerId: string;
  readonly name: string;
  readonly ownerProfileId: string;
}

export interface WosV1CpcSelection {
  readonly customerId: string;
  readonly customerName: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectOwnerProfileId: string;
}

export function cpcProjectOptionsForCustomer(
  projects: readonly WosV1CpcProjectOption[],
  customerId: string,
): readonly WosV1CpcProjectOption[] {
  return projects.filter(project => project.customerId === customerId);
}

export async function loadWosV1CpcOptions(
  client: SupabaseClient,
): Promise<
  | {
      readonly ok: true;
      readonly customers: readonly WosV1CpcCustomerOption[];
      readonly projects: readonly WosV1CpcProjectOption[];
    }
  | { readonly ok: false; readonly code: string }
> {
  const auth = await client.auth.getUser();
  if (auth.error || !auth.data.user?.id) {
    return { ok: false, code: 'UNAUTHENTICATED' };
  }
  const profile = await client.from('profiles')
    .select('id,user_id,org_id,role,is_active')
    .eq('user_id', auth.data.user.id)
    .eq('is_active', true)
    .maybeSingle();
  const profileRow = profile.data;
  if (profile.error || !profileRow
    || !['admin', 'manager', 'sales'].includes(profileRow.role)
    || typeof profileRow.org_id !== 'string') {
    return { ok: false, code: 'FORBIDDEN' };
  }
  const organizationId = profileRow.org_id;

  const [customerResult, projectResult] = await Promise.all([
    client.from('cpc_customer_references')
      .select('id,org_id,display_name_snapshot,status')
      .eq('org_id', organizationId)
      .in('status', ['active', 'pending_review'])
      .limit(201),
    client.from('cpc_projects')
      .select('id,org_id,customer_reference_id,title,owner_profile_id,status,archived_at')
      .eq('org_id', organizationId)
      .eq('status', 'active')
      .is('archived_at', null)
      .limit(201),
  ]);
  if (customerResult.error || projectResult.error) {
    return { ok: false, code: 'CPC_OPTIONS_UNAVAILABLE' };
  }
  if ((customerResult.data?.length ?? 0) > 200
    || (projectResult.data?.length ?? 0) > 200) {
    return { ok: false, code: 'CPC_OPTION_LIMIT_EXCEEDED' };
  }

  const customers = (customerResult.data ?? [])
    .filter(row =>
      row.org_id === organizationId
      && (row.status === 'active' || row.status === 'pending_review')
      && typeof row.id === 'string'
      && typeof row.display_name_snapshot === 'string')
    .map(row => ({
      id: String(row.id),
      name: String(row.display_name_snapshot),
      status: row.status as 'active' | 'pending_review',
    }));
  const customerIds = new Set(customers.map(customer => customer.id));
  const projects = (projectResult.data ?? [])
    .filter(row =>
      row.org_id === organizationId
      && row.status === 'active'
      && row.archived_at === null
      && typeof row.id === 'string'
      && typeof row.customer_reference_id === 'string'
      && customerIds.has(row.customer_reference_id)
      && typeof row.title === 'string'
      && typeof row.owner_profile_id === 'string')
    .map(row => ({
      id: String(row.id),
      customerId: String(row.customer_reference_id),
      name: String(row.title),
      ownerProfileId: String(row.owner_profile_id),
    }));
  return { ok: true, customers, projects };
}
