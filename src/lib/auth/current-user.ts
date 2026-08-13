// ===== Unified Current-User Bridge =====
// Minimal abstraction so Review Center business code depends on one user interface.
// NOTE: nmc_user is currently a client-created, unsigned cookie (audit finding).
// This bridge keeps the swap point small when real Supabase Auth is adopted.

import type { NextRequest } from 'next/server';
import { deserializeUser, AuthUser, Role } from './roles';

export function getCurrentUserFromRequest(req: NextRequest): AuthUser | null {
  const userCookie = req.cookies.get('nmc_user')?.value;
  if (!userCookie) return null;
  return deserializeUser(userCookie);
}

export function requireUser(req: NextRequest): AuthUser | null {
  return getCurrentUserFromRequest(req);
}

export function hasRole(user: AuthUser | null, roles: Role[]): boolean {
  return !!user && roles.includes(user.role);
}
