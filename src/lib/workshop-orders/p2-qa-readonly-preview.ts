/**
 * P2 QA-only read page: safe preview read authorization is independent of
 * P7 submission, P2 operator/office mutations and production readiness.
 */
import { isApprovedWosSandboxUrl, WOS_READ_ROLES } from './api-contract';

export interface P2QaReadonlyPreviewEnv {
  readonly vercelEnv?: string;
  readonly authMode?: string;
  readonly enableReadonly?: string;
  readonly supabaseUrl?: string;
}

export function canExposeP2QaReadonlyPreview(env: P2QaReadonlyPreviewEnv): boolean {
  return env.vercelEnv === 'preview'
    && env.authMode === 'supabase'
    && env.enableReadonly === 'true'
    && isApprovedWosSandboxUrl(env.supabaseUrl);
}

export function isVerifiedP2QaReadActor(
  verifiedAuthUserId: unknown,
  profile: unknown,
): profile is {
  readonly id: string;
  readonly user_id: string;
  readonly org_id: string;
  readonly role: string;
  readonly is_active: true;
} {
  if (typeof verifiedAuthUserId !== 'string' || !/^[a-f0-9-]{36}$/i.test(verifiedAuthUserId)
    || !profile || typeof profile !== 'object' || Array.isArray(profile)) return false;
  const record = profile as Record<string, unknown>;
  return record.user_id === verifiedAuthUserId
    && typeof record.id === 'string' && /^[a-f0-9-]{36}$/i.test(record.id)
    && typeof record.org_id === 'string' && /^[a-f0-9-]{36}$/i.test(record.org_id)
    && record.is_active === true
    && typeof record.role === 'string'
    && (WOS_READ_ROLES as readonly string[]).includes(record.role);
}

export function isScopedP2QaOrder(
  order: unknown, orderId: string, organizationId: string,
): order is {
  readonly id: string;
  readonly organization_id: string;
  readonly version: number;
  readonly version_label: string;
  readonly workflow_status: string;
  readonly current_batch_quantity: number;
} {
  if (!order || typeof order !== 'object' || Array.isArray(order)) return false;
  const row = order as Record<string, unknown>;
  return row.id === orderId
    && row.organization_id === organizationId
    && row.workflow_status === 'WAITING_MATERIAL'
    && Number.isSafeInteger(row.version) && Number(row.version) >= 7
    && typeof row.version_label === 'string' && row.version_label.trim().length > 0
    && Number.isSafeInteger(row.current_batch_quantity) && Number(row.current_batch_quantity) > 0;
}
