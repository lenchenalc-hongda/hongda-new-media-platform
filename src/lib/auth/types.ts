// ===== Auth Types =====
// Unified identity contract for business code.
// Business code must NOT know cookie names, Supabase JWT shape, or profile queries.

import type { Role, Action } from './roles';

export type AuthMode = 'mock' | 'supabase';

export interface CurrentUser {
  id: string;
  name: string;
  role: Role;
  department: string | null;
  email?: string | null;
  active: boolean;
  authSource: AuthMode;
}

export class AuthError extends Error {
  code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'AUTH_CONFIG_MISSING';
  constructor(code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'AUTH_CONFIG_MISSING', message: string) {
    super(message);
    this.code = code;
    this.name = 'AuthError';
  }
}

export function getAuthMode(): AuthMode {
  return process.env.AUTH_MODE === 'supabase' ? 'supabase' : 'mock';
}

export function isSupabaseConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function normalizeRole(value: unknown): Role | null {
  const allowed: Role[] = ['admin', 'manager', 'operator', 'sales', 'viewer'];
  return allowed.includes(value as Role) ? (value as Role) : null;
}

export type { Role, Action };
