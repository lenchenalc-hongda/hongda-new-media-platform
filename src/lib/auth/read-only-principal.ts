import 'server-only';

import { cache } from 'react';
import { createReadOnlySupabaseClient } from '@/lib/supabase/readonly';
import { resolveVerifiedSupabaseIdentity } from '@/lib/auth/supabase-identity';
import { normalizeRole, type Role } from '@/lib/auth/types';

export interface ReadOnlySupabasePrincipal {
  authUserId: string;
  identityEmail: string | null;
  profileId: string | null;
  orgId: string | null;
  fullName: string | null;
  profileEmail: string | null;
  role: Role;
  department: string | null;
  isActive: boolean | null;
}

export type ReadOnlySupabasePrincipalResult =
  | { ok: true; principal: ReadOnlySupabasePrincipal }
  | { ok: false; reason: 'unavailable' | 'unauthenticated' | 'invalid_profile' };

async function loadReadOnlySupabasePrincipal(): Promise<ReadOnlySupabasePrincipalResult> {
  const client = await createReadOnlySupabaseClient();
  if (!client) return { ok: false, reason: 'unavailable' };

  const identity = await resolveVerifiedSupabaseIdentity(client as any);
  if (!identity) return { ok: false, reason: 'unauthenticated' };

  const profileResult = await client
    .from('profiles')
    .select('id,user_id,full_name,email,role,department,is_active,org_id')
    .eq('user_id', identity.id)
    .maybeSingle();

  if (profileResult.error || !profileResult.data) {
    return { ok: false, reason: 'invalid_profile' };
  }

  const role = normalizeRole(profileResult.data.role);
  if (!role) return { ok: false, reason: 'invalid_profile' };

  return {
    ok: true,
    principal: {
      authUserId: identity.id,
      identityEmail: identity.email,
      profileId: typeof profileResult.data.id === 'string' ? profileResult.data.id : null,
      orgId: typeof profileResult.data.org_id === 'string' ? profileResult.data.org_id : null,
      fullName: typeof profileResult.data.full_name === 'string' ? profileResult.data.full_name : null,
      profileEmail: typeof profileResult.data.email === 'string' ? profileResult.data.email : null,
      role,
      department: typeof profileResult.data.department === 'string'
        ? profileResult.data.department
        : null,
      isActive: typeof profileResult.data.is_active === 'boolean'
        ? profileResult.data.is_active
        : null,
    },
  };
}

// React cache is request-scoped during the Server Component render.
// It intentionally does not persist identity/profile data across requests or users.
export const getReadOnlySupabasePrincipal = cache(loadReadOnlySupabasePrincipal);
