/**
 * Post-password sign-in authorization gate.
 * Supabase Auth's successful signInWithPassword only proves credentials.
 * A HongdaOS account MUST also have a valid, active, organization-scoped
 * public.profiles record before the UI reports login success.
 *
 * The profile row comes only from a server-side authenticated database query;
 * do not substitute user_metadata, query parameters or a client-supplied role.
 */
import { normalizeRole } from './types';

export type LoginProfileFailure =
  | 'PROFILE_NOT_CONFIGURED'
  | 'PROFILE_INACTIVE'
  | 'PROFILE_ROLE_INVALID'
  | 'PROFILE_ORGANIZATION_MISSING'
  | 'PROFILE_LOOKUP_UNAVAILABLE';

export type LoginProfileResult =
  | { ok: true }
  | { ok: false; code: LoginProfileFailure; status: 403 | 503; message: string };

export function evaluatePostLoginProfile(
  authUserId: string,
  profile: unknown,
  lookupError: unknown = null,
): LoginProfileResult {
  if (lookupError) {
    return { ok: false, code: 'PROFILE_LOOKUP_UNAVAILABLE', status: 503, message: '暂时无法读取账号权限，请稍后重试' };
  }

  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return { ok: false, code: 'PROFILE_NOT_CONFIGURED', status: 403, message: '密码已验证，但该账号尚未完成系统权限配置，请联系管理员' };
  }

  const row = profile as Record<string, unknown>;
  if (typeof authUserId !== 'string' || !authUserId || row.user_id !== authUserId) {
    return { ok: false, code: 'PROFILE_NOT_CONFIGURED', status: 403, message: '密码已验证，但该账号尚未完成系统权限配置，请联系管理员' };
  }
  if (row.is_active !== true) {
    return { ok: false, code: 'PROFILE_INACTIVE', status: 403, message: '此账号暂未启用，请联系管理员' };
  }
  if (!normalizeRole(row.role)) {
    return { ok: false, code: 'PROFILE_ROLE_INVALID', status: 403, message: '该账号的岗位权限尚未配置，请联系管理员' };
  }
  if (typeof row.org_id !== 'string' || row.org_id.trim().length === 0) {
    return { ok: false, code: 'PROFILE_ORGANIZATION_MISSING', status: 403, message: '该账号尚未加入公司组织，请联系管理员' };
  }
  return { ok: true };
}

export function safePostLoginRedirect(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')
      || value.includes('\\') || /[\r\n]/.test(value)) {
    return '/workspace-home';
  }
  // Only internal relative URLs; make bypass attempts such as /%2f or
  // percent-encoded backslashes fall back to the neutral portal home.
  try {
    const parsed = new URL(value, 'https://hongda.local.invalid');
    if (parsed.origin !== 'https://hongda.local.invalid'
        || parsed.pathname.startsWith('//')
        || /%2f|%5c/i.test(parsed.pathname)) {
      return '/workspace-home';
    }
  } catch {
    return '/workspace-home';
  }
  return value;
}
