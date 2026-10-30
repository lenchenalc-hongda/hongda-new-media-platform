// ===== Verified Supabase JWT identity =====
// Prefer getClaims() so asymmetric JWTs can be verified locally/cached through
// Supabase JWKS. Fall back to getUser() only for older/test clients that do not
// expose getClaims(). Never trust unverified session/user metadata.

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
      if (error || !claims || typeof claims.sub !== 'string' || claims.sub.length === 0) {
        return null;
      }

      return {
        id: claims.sub,
        email: typeof claims.email === 'string' ? claims.email : null,
      };
    } catch {
      return null;
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
