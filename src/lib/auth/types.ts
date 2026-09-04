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

export interface AuthModeEnv {
  authMode: string | undefined;
  nodeEnv: string | undefined;
}

export function resolveAuthMode({ authMode, nodeEnv }: AuthModeEnv): AuthMode {
  if (authMode === 'supabase') return 'supabase';

  if (authMode === 'mock') {
    if (nodeEnv === 'production') {
      throw new AuthError('AUTH_CONFIG_MISSING', '正式环境禁止 mock 认证，必须配置 AUTH_MODE=supabase');
    }
    return 'mock';
  }

  if (authMode !== undefined) {
    throw new AuthError('AUTH_CONFIG_MISSING', 'AUTH_MODE 配置无效，仅支持 mock 或 supabase');
  }

  if (nodeEnv === 'production') {
    throw new AuthError('AUTH_CONFIG_MISSING', '正式环境缺少 AUTH_MODE=supabase 配置');
  }

  return 'mock';
}

export function getAuthMode(): AuthMode {
  return resolveAuthMode({
    authMode: process.env.AUTH_MODE,
    nodeEnv: process.env.NODE_ENV,
  });
}

export function isSupabaseConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function normalizeRole(value: unknown): Role | null {
  const allowed: Role[] = ['admin', 'manager', 'operator', 'sales', 'viewer'];
  return allowed.includes(value as Role) ? (value as Role) : null;
}

export type { Role, Action };
