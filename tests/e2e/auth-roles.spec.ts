// ===== End-to-End Auth & Role Tests =====
// Run with: node --experimental-vm-modules tests/e2e/auth-roles.spec.ts
// Or import from a vitest/playwright runner.

import {
  canAccessPage, canPerformAction, canAccessResource,
  getAccessiblePages, getPageSlugFromRoute,
  MOCK_AUTH_USERS, AuthUser
} from '@/lib/auth/roles';

const { describe, it, expect } = globalThis as any;

function getUserByRole(role: AuthUser['role']): AuthUser {
  const user = MOCK_AUTH_USERS.find(u => u.role === role);
  if (!user) throw new Error(`No mock user found for role: ${role}`);
  return user;
}

// ============ Page Access ============
describe('Page Access Matrix', () => {
  const admin = getUserByRole('admin');
  const manager = getUserByRole('manager');
  const operator = getUserByRole('operator');
  const sales = getUserByRole('sales');
  const viewer = getUserByRole('viewer');

  it('admin can access all protected pages', () => {
    const pages = ['dashboard','accounts','topics','scripts','teardowns',
      'calendar','posts','leads','knowledge','reports','settings'];
    pages.forEach(page => {
      expect(canAccessPage(admin, page as any)).toBe(true);
    });
  });

  it('manager cannot access settings', () => {
    expect(canAccessPage(manager, 'settings')).toBe(false);
    expect(canAccessPage(manager, 'dashboard')).toBe(true);
    expect(canAccessPage(manager, 'accounts')).toBe(true);
    expect(canAccessPage(manager, 'reports')).toBe(true);
  });

  it('operator cannot access settings or reports', () => {
    expect(canAccessPage(operator, 'settings')).toBe(false);
    expect(canAccessPage(operator, 'reports')).toBe(false);
    expect(canAccessPage(operator, 'topics')).toBe(true);
  });

  it('sales can only access dashboard and leads', () => {
    expect(canAccessPage(sales, 'settings')).toBe(false);
    expect(canAccessPage(sales, 'accounts')).toBe(false);
    expect(canAccessPage(sales, 'topics')).toBe(false);
    expect(canAccessPage(sales, 'scripts')).toBe(false);
    expect(canAccessPage(sales, 'knowledge')).toBe(false);
    expect(canAccessPage(sales, 'leads')).toBe(true);
    expect(canAccessPage(sales, 'dashboard')).toBe(true);
  });

  it('viewer can read pages but not settings', () => {
    expect(canAccessPage(viewer, 'settings')).toBe(false);
    expect(canAccessPage(viewer, 'dashboard')).toBe(true);
    expect(canAccessPage(viewer, 'accounts')).toBe(true);
    expect(canAccessPage(viewer, 'topics')).toBe(true);
    expect(canAccessPage(viewer, 'reports')).toBe(true);
  });
});

// ============ Action Permissions ============
describe('Action Permission Matrix', () => {
  const admin = getUserByRole('admin');
  const operator = getUserByRole('operator');
  const sales = getUserByRole('sales');
  const viewer = getUserByRole('viewer');

  it('admin can do all actions', () => {
    ['create','read','update','delete','approve','score','export','assign','manage_users'].forEach(a => {
      expect(canPerformAction(admin, a as any)).toBe(true);
    });
  });

  it('operator can create, update, score but not delete or approve', () => {
    expect(canPerformAction(operator, 'create')).toBe(true);
    expect(canPerformAction(operator, 'read')).toBe(true);
    expect(canPerformAction(operator, 'update')).toBe(true);
    expect(canPerformAction(operator, 'score')).toBe(true);
    expect(canPerformAction(operator, 'delete')).toBe(false);
    expect(canPerformAction(operator, 'approve')).toBe(false);
    expect(canPerformAction(operator, 'manage_users')).toBe(false);
  });

  it('sales can only read', () => {
    expect(canPerformAction(sales, 'read')).toBe(true);
    expect(canPerformAction(sales, 'create')).toBe(false);
    expect(canPerformAction(sales, 'update')).toBe(false);
    expect(canPerformAction(sales, 'delete')).toBe(false);
    expect(canPerformAction(sales, 'approve')).toBe(false);
  });

  it('viewer can only read, nothing else', () => {
    expect(canPerformAction(viewer, 'read')).toBe(true);
    expect(canPerformAction(viewer, 'create')).toBe(false);
    expect(canPerformAction(viewer, 'update')).toBe(false);
    expect(canPerformAction(viewer, 'delete')).toBe(false);
    expect(canPerformAction(viewer, 'approve')).toBe(false);
    expect(canPerformAction(viewer, 'score')).toBe(false);
  });
});

// ============ Resource Isolation (Leads) ============
describe('Resource-Level Access', () => {
  const admin = getUserByRole('admin');
  const manager = getUserByRole('manager');
  const sales = getUserByRole('sales');
  const otherUserId = 'u_other_sales';

  it('sales can only read own leads', () => {
    expect(canAccessResource(sales, 'leads', sales.id)).toBe(true);
    expect(canAccessResource(sales, 'leads', otherUserId)).toBe(false);
    expect(canAccessResource(sales, 'topics', sales.id)).toBe(false);
  });

  it('admin can read any lead', () => {
    expect(canAccessResource(admin, 'leads', otherUserId)).toBe(true);
    expect(canAccessResource(admin, 'leads', admin.id)).toBe(true);
  });

  it('manager can read any lead', () => {
    expect(canAccessResource(manager, 'leads', otherUserId)).toBe(true);
  });

  it('operator cannot read any leads', () => {
    const operator = getUserByRole('operator');
    expect(canAccessResource(operator, 'leads', operator.id)).toBe(false);
  });
});

// ============ Route Mapping ============
describe('Route Mapping', () => {
  it('maps routes correctly', () => {
    expect(getPageSlugFromRoute('/dashboard')).toBe('dashboard');
    expect(getPageSlugFromRoute('/topics')).toBe('topics');
    expect(getPageSlugFromRoute('/leads')).toBe('leads');
    expect(getPageSlugFromRoute('/settings')).toBe('settings');
    expect(getPageSlugFromRoute('/accounts/abc')).toBe('accounts_detail');
    expect(getPageSlugFromRoute('/login')).toBeNull();
  });
});
