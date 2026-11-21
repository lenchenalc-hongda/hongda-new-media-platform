import type { Role } from '@/lib/auth/roles';

export const WORKSHOP_ORDERS_ROUTE_PREFIX = '/workshop-orders';

export const WORKSHOP_ORDERS_PAGE_ROLES = [
  'admin',
  'manager',
  'operator',
  'sales',
] as const;

type WorkshopOrdersPageRole = (typeof WORKSHOP_ORDERS_PAGE_ROLES)[number];

export function isWorkshopOrdersFeatureEnabled(value: string | undefined): boolean {
  return value === 'true';
}

export function isWorkshopOrdersRoute(pathname: string): boolean {
  return pathname === WORKSHOP_ORDERS_ROUTE_PREFIX
    || pathname.startsWith(WORKSHOP_ORDERS_ROUTE_PREFIX + '/');
}

export function isWorkshopOrdersPageRoleAllowed(
  role: Role | null | undefined,
): role is WorkshopOrdersPageRole {
  return typeof role === 'string'
    && (WORKSHOP_ORDERS_PAGE_ROLES as readonly string[]).includes(role);
}

export function canAccessWorkshopOrdersPage(input: {
  readonly featureValue: string | undefined;
  readonly authenticated: boolean;
  readonly role: Role | null | undefined;
}): boolean {
  return isWorkshopOrdersFeatureEnabled(input.featureValue)
    && input.authenticated
    && isWorkshopOrdersPageRoleAllowed(input.role);
}
