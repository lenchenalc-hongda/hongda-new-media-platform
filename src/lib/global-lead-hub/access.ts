import type { CurrentUser, Role } from '@/lib/auth/types';
import { GLH_HUMAN_ROLES, type GlhHumanRole } from './domain';

export const GLH_ROOT_ROLE_MAP: Readonly<Partial<Record<Role, GlhHumanRole>>> = {
  admin: 'ADMIN',
  manager: 'MANAGER',
  sales: 'SALES',
};

export interface TrustedGlhBusinessIdentity {
  authUserId: string;
  profileId: string;
  organizationId: string;
  rootRole: Role | null;
  active: boolean;
}

export interface GlhAccessContext {
  actorProfileId: string;
  organizationId: string;
  role: GlhHumanRole;
  authSource: 'supabase';
}

export type GlhAccessDeniedCode = 'UNAUTHENTICATED' | 'FORBIDDEN';

export type GlhAccessDecision =
  | { ok: true; context: GlhAccessContext }
  | { ok: false; code: GlhAccessDeniedCode };

export interface GlhLeadAccessRecord {
  organizationId: string;
  ownerProfileId: string | null;
  collaboratorProfileIds?: readonly string[];
}

export class GlhAccessError extends Error {
  readonly code: GlhAccessDeniedCode;

  constructor(code: GlhAccessDeniedCode, message: string) {
    super(message);
    this.name = 'GlhAccessError';
    this.code = code;
  }
}

export function mapRootRoleToGlhRole(role: Role): GlhHumanRole | null {
  return GLH_ROOT_ROLE_MAP[role] ?? null;
}

export function evaluateGlhAccess(
  user: CurrentUser | null,
  businessIdentity: TrustedGlhBusinessIdentity | null,
): GlhAccessDecision {
  if (!user || !user.active) {
    return { ok: false, code: 'UNAUTHENTICATED' };
  }

  // Mock identity is intentionally not audit-grade and cannot establish a
  // trusted profiles.id/organization binding.
  if (user.authSource !== 'supabase') {
    return { ok: false, code: 'FORBIDDEN' };
  }

  if (!businessIdentity || !businessIdentity.active) {
    return { ok: false, code: 'FORBIDDEN' };
  }

  if (
    businessIdentity.authUserId !== user.id
    || businessIdentity.rootRole !== user.role
    || !businessIdentity.profileId
    || !businessIdentity.organizationId
  ) {
    return { ok: false, code: 'FORBIDDEN' };
  }

  const role = mapRootRoleToGlhRole(businessIdentity.rootRole);
  if (!role || !GLH_HUMAN_ROLES.includes(role)) {
    return { ok: false, code: 'FORBIDDEN' };
  }

  return {
    ok: true,
    context: {
      actorProfileId: businessIdentity.profileId,
      organizationId: businessIdentity.organizationId,
      role,
      authSource: 'supabase',
    },
  };
}

export function isSameGlhOrganization(
  context: GlhAccessContext,
  organizationId: string,
): boolean {
  return context.organizationId === organizationId;
}

export function canManageGlhOrganization(
  context: GlhAccessContext,
  organizationId: string,
): boolean {
  return isSameGlhOrganization(context, organizationId)
    && (context.role === 'ADMIN' || context.role === 'MANAGER');
}

export function canViewAllGlhLeads(context: GlhAccessContext): boolean {
  return context.role === 'ADMIN' || context.role === 'MANAGER';
}

export function canViewGlhLead(
  context: GlhAccessContext,
  lead: GlhLeadAccessRecord,
): boolean {
  if (!isSameGlhOrganization(context, lead.organizationId)) return false;
  if (canViewAllGlhLeads(context)) return true;
  if (context.role !== 'SALES') return false;
  return lead.ownerProfileId === context.actorProfileId
    || (lead.collaboratorProfileIds ?? []).includes(context.actorProfileId);
}

export function canTakeOverGlhConversation(
  context: GlhAccessContext,
  lead: GlhLeadAccessRecord,
): boolean {
  return canViewGlhLead(context, lead)
    && (context.role === 'ADMIN' || context.role === 'MANAGER' || context.role === 'SALES');
}

export function canAssignGlhLead(
  context: GlhAccessContext,
  organizationId: string,
): boolean {
  return canManageGlhOrganization(context, organizationId);
}

export function canCorrectGlhGrade(
  context: GlhAccessContext,
  organizationId: string,
): boolean {
  return canManageGlhOrganization(context, organizationId);
}

export function canUpdateGlhStage(
  context: GlhAccessContext,
  lead: GlhLeadAccessRecord,
): boolean {
  return canViewGlhLead(context, lead)
    && (context.role === 'ADMIN' || context.role === 'MANAGER' || context.role === 'SALES');
}

export function canManageGlhChannelSettings(
  context: GlhAccessContext,
  organizationId: string,
): boolean {
  return context.role === 'ADMIN' && isSameGlhOrganization(context, organizationId);
}

export function canChangeGlhRole(
  context: GlhAccessContext,
  organizationId: string,
): boolean {
  return context.role === 'ADMIN' && isSameGlhOrganization(context, organizationId);
}

export function canReadGlhAudit(
  context: GlhAccessContext,
  organizationId: string,
): boolean {
  return canManageGlhOrganization(context, organizationId);
}
