// WOS P0-02-01: production-neutral, READ-ONLY CPC identity/eligibility rules.
// Never trust client-supplied role, organization, project ownership or snapshots.
import { isApprovedWosSandboxUrl } from './api-contract';

export type WosCpcRole = 'admin' | 'manager' | 'sales';
export interface WosCpcActor {
  readonly id: string;
  readonly userId: string;
  readonly orgId: string;
  readonly role: WosCpcRole;
}
export interface WosCpcCustomer {
  readonly id: string;
  readonly org_id: string;
  readonly status: string;
  readonly display_name_snapshot: string;
}
export interface WosCpcProject {
  readonly id: string;
  readonly org_id: string;
  readonly customer_reference_id: string;
  readonly title: string;
  readonly owner_profile_id: string;
  readonly status: string;
  readonly archived_at: string | null;
}
export type WosCpcCustomerOption = { id: string; name: string };
export type WosCpcProjectOption = { id: string; customerId: string; name: string; ownerProfileId: string };
type ActorResult = { ok: true; actor: WosCpcActor }
  | { ok: false; code: 'UNAUTHENTICATED' | 'FORBIDDEN' };
type PairResult = { ok: true; customer: WosCpcCustomerOption; project: WosCpcProjectOption }
  | { ok: false; code: 'CPC_RELATIONSHIP_DENIED' };
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
export function isWosCpcUuid(v: unknown): v is string {
  return typeof v === 'string' && uuidPattern.test(v);
}
function text(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}
export function resolveWosCpcActor(verifiedUserId: unknown, profile: unknown): ActorResult {
  if (!isWosCpcUuid(verifiedUserId)) return { ok: false, code: 'UNAUTHENTICATED' };
  if (!record(profile) || profile.user_id !== verifiedUserId
    || !isWosCpcUuid(profile.id) || !isWosCpcUuid(profile.org_id)
    || profile.is_active !== true
    || !['admin', 'manager', 'sales'].includes(String(profile.role))) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  return { ok: true, actor: {
    id: profile.id as string, userId: verifiedUserId, orgId: profile.org_id as string,
    role: profile.role as WosCpcRole,
  } };
}

// This candidate is read-only and opt-in only for the exact vetted QA Preview.
// It deliberately refuses ALL Production deployments until a separate reviewed
// Production release adapter + Owner authorization exists. No write endpoint.
export function isWosCpcReadCandidateEnabled(input: {
  readonly vercelEnv?: string;
  readonly nodeEnv?: string;
  readonly enabled?: string;
  readonly supabaseUrl?: string;
}): boolean {
  if (input.enabled !== 'true' || !isApprovedWosSandboxUrl(input.supabaseUrl)) return false;
  return input.vercelEnv === 'preview'
    || (input.vercelEnv === undefined && input.nodeEnv === 'development');
}

export function verifyWosCpcPair(input: {
  readonly actor: WosCpcActor;
  readonly customer: WosCpcCustomer | null;
  readonly project: WosCpcProject | null;
  readonly canReadCustomer: boolean;
  readonly canReadProject: boolean;
}): PairResult {
  const { actor, customer, project } = input;
  if (!input.canReadCustomer || !input.canReadProject
    || !customer || !project
    || !isWosCpcUuid(customer.id) || !isWosCpcUuid(project.id)
    || !isWosCpcUuid(project.owner_profile_id)
    || !text(customer.display_name_snapshot) || !text(project.title)
    || customer.org_id !== actor.orgId || project.org_id !== actor.orgId
    || project.customer_reference_id !== customer.id
    || customer.status !== 'active' || project.status !== 'active'
    || project.archived_at !== null) {
    return { ok: false, code: 'CPC_RELATIONSHIP_DENIED' };
  }
  return {
    ok: true,
    customer: { id: customer.id, name: customer.display_name_snapshot },
    project: { id: project.id, customerId: customer.id, name: project.title, ownerProfileId: project.owner_profile_id },
  };
}

export function buildWosCpcOptions(input: {
  readonly actor: WosCpcActor;
  readonly customers: readonly WosCpcCustomer[];
  readonly projects: readonly WosCpcProject[];
}): { ok: true; customers: WosCpcCustomerOption[]; projects: WosCpcProjectOption[] }
  | { ok: false; code: 'CPC_OPTION_LIMIT_EXCEEDED' | 'CPC_UNTRUSTED_RECORD' } {
  if (input.customers.length > 200 || input.projects.length > 200) {
    return { ok: false, code: 'CPC_OPTION_LIMIT_EXCEEDED' };
  }
  const customers: WosCpcCustomerOption[] = [];
  const eligible = new Map<string, WosCpcCustomerOption>();
  for (const row of input.customers) {
    if (!row || row.org_id !== input.actor.orgId || !isWosCpcUuid(row.id)
      || !text(row.display_name_snapshot)) {
      return { ok: false, code: 'CPC_UNTRUSTED_RECORD' };
    }
    // Pending review, mapped, and disabled customers may never be selected.
    if (row.status !== 'active') continue;
    if (eligible.has(row.id)) return { ok: false, code: 'CPC_UNTRUSTED_RECORD' };
    const c = { id: row.id, name: row.display_name_snapshot };
    customers.push(c);
    eligible.set(row.id, c);
  }
  const projects: WosCpcProjectOption[] = [];
  const projectIds = new Set<string>();
  for (const row of input.projects) {
    if (!row || row.org_id !== input.actor.orgId || !isWosCpcUuid(row.id)
      || !isWosCpcUuid(row.owner_profile_id) || !text(row.title)
      || !isWosCpcUuid(row.customer_reference_id)) {
      return { ok: false, code: 'CPC_UNTRUSTED_RECORD' };
    }
    if (row.status !== 'active' || row.archived_at !== null
      || !eligible.has(row.customer_reference_id)) continue;
    if (projectIds.has(row.id)) return { ok: false, code: 'CPC_UNTRUSTED_RECORD' };
    projectIds.add(row.id);
    projects.push({
      id: row.id, customerId: row.customer_reference_id,
      name: row.title, ownerProfileId: row.owner_profile_id,
    });
  }
  customers.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  projects.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { ok: true, customers, projects };
}

export function parseWosCpcPairRequest(value: unknown): { customerId: string; projectId: string } | null {
  if (!record(value) || Object.keys(value).length !== 2
    || !isWosCpcUuid(value.customerId) || !isWosCpcUuid(value.projectId)) return null;
  return { customerId: value.customerId, projectId: value.projectId };
}
