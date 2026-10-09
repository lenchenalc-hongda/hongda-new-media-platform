import { getCurrentUser } from '@/lib/auth/current-user';
import type { CurrentUser, Role } from '@/lib/auth/types';
import { normalizeRole } from '@/lib/auth/types';
import { createReadOnlySupabaseClient } from '@/lib/supabase/readonly';
import {
  evaluateGlhAccess,
  GlhAccessError,
  type GlhAccessContext,
  type GlhAccessDecision,
  type TrustedGlhBusinessIdentity,
} from './access';

export interface GlhAccessResolverDependencies {
  getCurrentUser: () => Promise<CurrentUser | null>;
  loadTrustedBusinessIdentity: (
    user: CurrentUser,
  ) => Promise<TrustedGlhBusinessIdentity | null>;
}

async function loadTrustedBusinessIdentity(
  user: CurrentUser,
): Promise<TrustedGlhBusinessIdentity | null> {
  if (user.authSource !== 'supabase') return null;

  const client = await createReadOnlySupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from('profiles')
    .select('id,user_id,org_id,role,is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return null;

  const rootRole = normalizeRole(data.role);
  return {
    authUserId: data.user_id,
    profileId: data.id,
    organizationId: data.org_id,
    rootRole,
    active: data.is_active === true,
  };
}

const defaultDependencies: GlhAccessResolverDependencies = {
  getCurrentUser,
  loadTrustedBusinessIdentity,
};

export async function resolveGlhAccessContext(
  dependencies: GlhAccessResolverDependencies = defaultDependencies,
): Promise<GlhAccessDecision> {
  const user = await dependencies.getCurrentUser();
  if (!user) return { ok: false, code: 'UNAUTHENTICATED' };

  let identity: TrustedGlhBusinessIdentity | null = null;
  if (user.authSource === 'supabase') {
    identity = await dependencies.loadTrustedBusinessIdentity(user);
  }

  return evaluateGlhAccess(user, identity);
}

export async function requireGlhAccessContext(
  dependencies: GlhAccessResolverDependencies = defaultDependencies,
): Promise<GlhAccessContext> {
  const decision = await resolveGlhAccessContext(dependencies);
  if (!decision.ok) {
    throw new GlhAccessError(
      decision.code,
      decision.code === 'UNAUTHENTICATED' ? 'Authentication required' : 'Access denied',
    );
  }
  return decision.context;
}

export function isTrustedGlhRole(value: Role | null): boolean {
  return value === 'admin' || value === 'manager' || value === 'sales';
}
