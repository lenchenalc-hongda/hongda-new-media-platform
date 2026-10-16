// ===== Supabase Identity Resolver =====
// Verifies session server-side, then reads role/department from profiles.
// Never trusts nmc_user, client role, or user_metadata for authorization.

import type { NextRequest, NextResponse } from 'next/server';
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import {
  resolveVerifiedSupabaseIdentity,
  type SupabaseIdentityClient,
} from './supabase-identity';
import { CurrentUser, normalizeRole } from './types';

interface SupabaseUserRow {
  id: string;
  user_id: string;
  org_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
  department?: string | null;
  is_active?: boolean | null;
}

export interface SupabaseLikeClient extends SupabaseIdentityClient {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: SupabaseUserRow | null; error: { message: string } | null }>;
      };
    };
  };
}

export async function resolveSupabaseCurrentUser(client: SupabaseLikeClient): Promise<CurrentUser | null> {
  const identity = await resolveVerifiedSupabaseIdentity(client);
  if (!identity) return null;
  const authId = identity.id;

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id,user_id,org_id,full_name,email,role,department,is_active')
    .eq('user_id', authId)
    .maybeSingle();

  if (profileError || !profile) return null;
  if (profile.is_active === false) return null;

  const role = normalizeRole(profile.role);
  if (!role) return null;

  return {
    id: authId,
    name: profile.full_name || identity.email || '用户',
    role,
    department: profile.department ?? null,
    email: identity.email ?? profile.email ?? null,
    profileId: profile.id,
    orgId: profile.org_id ?? null,
    active: true,
    authSource: 'supabase',
  };
}

export async function getSupabaseUserFromRequest(req: NextRequest): Promise<CurrentUser | null> {
  return (await getSupabaseUserAndResponseFromRequest(req)).user;
}

export async function getSupabaseUserAndResponseFromRequest(req: NextRequest): Promise<{
  user: CurrentUser | null;
  response: NextResponse;
}> {
  const { supabase, getResponse } = createMiddlewareSupabaseClient(req);
  if (!supabase) return { user: null, response: getResponse() };
  const user = await resolveSupabaseCurrentUser(supabase as unknown as SupabaseLikeClient);
  return {
    user,
    response: getResponse(),
  };
}

export async function getSupabaseUserFromServer(): Promise<CurrentUser | null> {
  const client = await createServerSupabaseClient();
  if (!client) return null;
  return resolveSupabaseCurrentUser(client as unknown as SupabaseLikeClient);
}
