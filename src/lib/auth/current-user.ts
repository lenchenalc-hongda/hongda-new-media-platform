// ===== Unified Current-User Bridge =====
// Business code depends ONLY on this interface.
// AUTH_MODE=mock  -> nmc_user cookie (development compatibility, NOT audit-grade)
// AUTH_MODE=supabase -> Supabase session + profiles (trusted identity)

import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { canPerformAction } from './roles';
import { CurrentUser, AuthError, getAuthMode, isSupabaseConfigured, type Role, type Action } from './types';
import { getMockUserFromCookie } from './mock-user';
import { getSupabaseUserFromRequest, getSupabaseUserFromServer } from './supabase-user';

export type { CurrentUser, Role, Action };

export function hasRole(user: CurrentUser | null, roles: Role[]): boolean {
  return !!user && roles.includes(user.role);
}

// ===== Middleware / Route Handler entry =====
export async function getCurrentUserFromRequest(req: NextRequest): Promise<CurrentUser | null> {
  if (getAuthMode() === 'supabase') {
    if (!isSupabaseConfigured()) {
      throw new AuthError('AUTH_CONFIG_MISSING', 'AUTH_MODE=supabase 但 Supabase 环境变量缺失');
    }
    return getSupabaseUserFromRequest(req);
  }
  return getMockUserFromCookie(req.cookies.get('nmc_user')?.value);
}

export async function requireUserFromRequest(req: NextRequest): Promise<CurrentUser> {
  const user = await getCurrentUserFromRequest(req);
  if (!user) throw new AuthError('UNAUTHENTICATED', '未登录');
  return user;
}

export async function requireRoleFromRequest(req: NextRequest, roles: Role[]): Promise<CurrentUser> {
  const user = await requireUserFromRequest(req);
  if (!roles.includes(user.role)) throw new AuthError('FORBIDDEN', '无权限');
  return user;
}

// ===== Server Component / API entry =====
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (getAuthMode() === 'supabase') {
    if (!isSupabaseConfigured()) {
      throw new AuthError('AUTH_CONFIG_MISSING', 'AUTH_MODE=supabase 但 Supabase 环境变量缺失');
    }
    return getSupabaseUserFromServer();
  }
  const cookieStore = await cookies();
  return getMockUserFromCookie(cookieStore.get('nmc_user')?.value);
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('UNAUTHENTICATED', '未登录');
  return user;
}

export async function requireRole(roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new AuthError('FORBIDDEN', '无权限');
  return user;
}

export async function requirePermission(action: Action): Promise<CurrentUser> {
  const user = await requireUser();
  const authLike = {
    id: user.id,
    full_name: user.name,
    email: user.email ?? '',
    role: user.role,
    org_id: '',
    department: user.department,
  };
  if (!canPerformAction(authLike as any, action)) throw new AuthError('FORBIDDEN', '无操作权限');
  return user;
}
