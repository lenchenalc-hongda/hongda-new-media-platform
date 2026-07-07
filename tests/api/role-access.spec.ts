// ===== API Role Access Tests =====
// Tests that API routes respect role-based access control.
// Run with: node --experimental-vm-modules tests/api/role-access.spec.ts

import {
  canAccessPage, canPerformAction, canAccessResource,
  MOCK_AUTH_USERS
} from '@/lib/auth/roles';

const { describe, it, expect } = globalThis as any;

describe('API Route Access Control', () => {
  const admin = MOCK_AUTH_USERS.find(u => u.role === 'admin')!;
  const operator = MOCK_AUTH_USERS.find(u => u.role === 'operator')!;
  const sales = MOCK_AUTH_USERS.find(u => u.role === 'sales')!;
  const viewer = MOCK_AUTH_USERS.find(u => u.role === 'viewer')!;

  it('viewer cannot mutate anything', () => {
    expect(canPerformAction(viewer, 'delete')).toBe(false);
    expect(canPerformAction(viewer, 'update')).toBe(false);
    expect(canPerformAction(viewer, 'create')).toBe(false);
    expect(canAccessPage(viewer, 'settings')).toBe(false);
  });

  it('operator cannot delete or approve', () => {
    expect(canPerformAction(operator, 'delete')).toBe(false);
    expect(canPerformAction(operator, 'approve')).toBe(false);
    expect(canPerformAction(operator, 'manage_users')).toBe(false);
  });

  it('sales cannot read others leads', () => {
    expect(canAccessResource(sales, 'leads', 'u_other')).toBe(false);
    expect(canAccessResource(sales, 'leads', sales.id)).toBe(true);
    expect(canAccessPage(sales, 'accounts')).toBe(false);
    expect(canAccessPage(sales, 'topics')).toBe(false);
  });

  it('admin can do everything', () => {
    expect(canAccessPage(admin, 'settings')).toBe(true);
    expect(canAccessPage(admin, 'leads')).toBe(true);
    expect(canPerformAction(admin, 'delete')).toBe(true);
    expect(canPerformAction(admin, 'approve')).toBe(true);
    expect(canPerformAction(admin, 'manage_users')).toBe(true);
  });

  it('edge cases: unknown page/action returns false', () => {
    expect(canAccessPage(admin, 'nonexistent' as any)).toBe(false);
    expect(canPerformAction(admin, 'hack' as any)).toBe(false);
    expect(canAccessResource(sales, 'leads')).toBe(false);
  });
});
