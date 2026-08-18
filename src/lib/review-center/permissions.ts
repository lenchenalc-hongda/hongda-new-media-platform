import type { Role } from '@/lib/auth/types';

export const REVIEW_CREATE_ROLES: Role[] = ['admin', 'manager', 'operator', 'sales'];

export function canCreateReview(role: Role): boolean {
  return REVIEW_CREATE_ROLES.includes(role);
}
