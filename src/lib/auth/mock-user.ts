// ===== Mock Auth Resolver =====
// Development-only identity source. NOT an audit-grade identity.
import { deserializeUser } from './roles';
import { CurrentUser, normalizeRole } from './types';

export function getMockUserFromCookie(cookieValue: string | undefined | null): CurrentUser | null {
  if (!cookieValue) return null;
  const raw = deserializeUser(cookieValue);
  if (!raw) return null;
  const role = normalizeRole(raw.role);
  if (!role) return null;
  return {
    id: raw.id,
    name: raw.full_name || raw.email || '用户',
    role,
    department: raw.department ?? null,
    email: raw.email ?? null,
    active: true,
    authSource: 'mock',
  };
}
