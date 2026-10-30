// ===== Verified Supabase JWT identity =====
// Prefer getClaims() to verify JWTs, but a transient JWKS/claims failure must
// not silently turn a valid password session into an anonymous user. Fall back
// to getUser(), which contacts Supabase Auth for fresh verification. A failed
// getUser() still denies access. Never trust user_metadata or raw getSession().

export interface VerifiedSupabaseIdentity {
  id: string;
  email: string | null;
}

interface ClaimsResult {
  data: {
    claims?: {
      sub?: unknown;
      email?: unknown;
    } | null;
  } | null;
  error: { message: string } | null;
}

interface UserResult {
  data: {
    user: {
      id: string;
      email?: string | null;
    } | null;
  } | null;
  error: { message: string } | null;
}

export interface SupabaseIdentityClient {
  auth: {
    getClaims?: () => Promise<ClaimsResult>;
    getUser: () => Promise<UserResult>;
  };
}

export async function resolveVerifiedSupabaseIdentity(
  client: SupabaseIdentityClient,
): Promise<VerifiedSupabaseIdentity | null> {
  if (typeof client.auth.getClaims === 'function') {
    try {
      const { data, error } = await client.auth.getClaims();
      const claims = data?.claims;
      if (!error && claims && typeof claims.sub === 'string' && claims.sub.length > 0) {
        return {
          id: claims.sub,
          email: typeof claims.email === 'string' ? claims.email : null,
        };
      }
      // Continue to verified getUser() on invalid/unavailable claims.
    } catch {
      // Continue to verified getUser() if JWKS/claims lookup throws.
    }
  }

  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user?.id) return null;

    return {
      id: data.user.id,
      email: data.user.email ?? null,
    };
  } catch {
    return null;
  }
}
