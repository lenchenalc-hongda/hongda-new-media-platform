export const WOS_V1_IMAGE_CATEGORIES = [
  'PRODUCT',
  'FILM_PATTERN',
  'CUSTOMER_APPROVED_SAMPLE',
  'SIGNED_SAMPLE',
] as const;

export const WOS_V1_IMAGE_CATEGORY_SLUGS = {
  PRODUCT: 'product',
  FILM_PATTERN: 'film-pattern',
  CUSTOMER_APPROVED_SAMPLE: 'customer-approved-sample',
  SIGNED_SAMPLE: 'signed-sample',
} as const;

export interface WosV1ImageVerificationBody {
  readonly category: (typeof WOS_V1_IMAGE_CATEGORIES)[number];
  readonly imageId: string;
  readonly orderId: string;
  readonly sha256: string;
  readonly storagePath: string;
}

export interface WosV1ImageAccessInput {
  readonly runtimeAuthorized: boolean;
  readonly writesEnabled: boolean;
  readonly qaRevisionAuthorized?: boolean;
  readonly profile: WosV1ImageProfile | null | undefined;
  readonly order: WosV1ImageOrder | null | undefined;
}

export interface WosV1ImageProfile {
  readonly id: string;
  readonly user_id: string;
  readonly org_id: string;
  readonly role: string;
  readonly is_active: boolean;
}

export interface WosV1ImageOrder {
  readonly id: string;
  readonly organization_id: string;
  readonly created_by_profile_id: string;
  readonly sales_owner_profile_id: string;
  readonly version: number;
  readonly version_label: string;
  readonly workflow_status: string;
}

export interface WosV1ObjectSnapshot {
  readonly id: string;
  readonly ownerId: string;
  readonly version: string | null;
  readonly updatedAt: string;
  readonly mimeType: string;
  readonly byteSize: string;
}

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const sha256 = /^[a-f0-9]{64}$/;
const versionLabel = /^V[1-9][0-9]{0,20}$/;

export function parseWosV1ImageVerificationBody(
  value: unknown,
): WosV1ImageVerificationBody | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(',')
      !== 'category,imageId,orderId,sha256,storagePath'
    || typeof row.category !== 'string'
    || !(WOS_V1_IMAGE_CATEGORIES as readonly string[]).includes(row.category)
    || typeof row.imageId !== 'string' || !uuid.test(row.imageId)
    || typeof row.orderId !== 'string' || !uuid.test(row.orderId)
    || typeof row.sha256 !== 'string' || !sha256.test(row.sha256)
    || typeof row.storagePath !== 'string'
    || row.storagePath.length > 600
    || row.storagePath.includes('..')) return null;
  return row as unknown as WosV1ImageVerificationBody;
}

export function canonicalWosV1ImagePath(input: {
  readonly organizationId: string;
  readonly orderId: string;
  readonly versionLabel: string;
  readonly imageId: string;
  readonly category: (typeof WOS_V1_IMAGE_CATEGORIES)[number];
}): string {
  return [
    'organizations',
    input.organizationId,
    'wos',
    'production-order',
    input.orderId,
    'images',
    WOS_V1_IMAGE_CATEGORY_SLUGS[input.category],
    'versions',
    input.versionLabel,
    input.imageId,
    'source.png',
  ].join('/');
}

export function evaluateWosV1ImageAccess(input: WosV1ImageAccessInput): {
  readonly allowed: boolean;
  readonly code:
    | 'ALLOWED'
    | 'WRITES_DISABLED'
    | 'RUNTIME_DENIED'
    | 'ROLE_FORBIDDEN'
    | 'PROFILE_INVALID'
    | 'ORDER_NOT_FOUND'
    | 'ORGANIZATION_DENIED'
    | 'OWNER_DENIED'
    | 'STATUS_DENIED'
    | 'VERSION_INVALID';
} {
  if (!input.runtimeAuthorized) return { allowed: false, code: 'RUNTIME_DENIED' };
  if (!input.writesEnabled) return { allowed: false, code: 'WRITES_DISABLED' };
  const profile = input.profile;
  if (!profile || profile.is_active !== true || !uuid.test(profile.id)
    || !uuid.test(profile.user_id) || !uuid.test(profile.org_id)) {
    return { allowed: false, code: 'PROFILE_INVALID' };
  }
  if (!['admin', 'manager', 'sales'].includes(profile.role)) {
    return { allowed: false, code: 'ROLE_FORBIDDEN' };
  }
  const order = input.order;
  if (!order) return { allowed: false, code: 'ORDER_NOT_FOUND' };
  if (order.organization_id !== profile.org_id) {
    return { allowed: false, code: 'ORGANIZATION_DENIED' };
  }
  if (profile.role === 'sales'
    && profile.id !== order.created_by_profile_id
    && profile.id !== order.sales_owner_profile_id) {
    return { allowed: false, code: 'OWNER_DENIED' };
  }
  if (order.workflow_status === 'DRAFT') {
    return versionLabel.test(order.version_label)
      ? { allowed: true, code: 'ALLOWED' }
      : { allowed: false, code: 'VERSION_INVALID' };
  }
  if (order.workflow_status === 'WAITING_MATERIAL'
    || order.workflow_status === 'READINESS_CHECK') {
    if (input.qaRevisionAuthorized !== true) {
      return { allowed: false, code: 'STATUS_DENIED' };
    }
    return /^QA-R[1-9][0-9]*$/.test(order.version_label)
      ? { allowed: true, code: 'ALLOWED' }
      : { allowed: false, code: 'VERSION_INVALID' };
  }
  return { allowed: false, code: 'STATUS_DENIED' };
}

export function parseAllowedSupabaseRefs(value: string | undefined): readonly string[] {
  if (!value) return [];
  const refs = value.split(',').map(ref => ref.trim()).filter(Boolean);
  if (refs.length === 0 || refs.length > 8
    || refs.some(ref => !/^[a-z0-9]{20}$/.test(ref))
    || new Set(refs).size !== refs.length) return [];
  return refs;
}

export function parseAllowedOrigins(value: string | undefined): readonly string[] {
  if (!value) return [];
  const origins = value.split(',').map(origin => origin.trim()).filter(Boolean);
  if (origins.length === 0 || origins.length > 20
    || new Set(origins).size !== origins.length) return [];
  try {
    return origins.every(origin => {
      const url = new URL(origin);
      return url.protocol === 'https:'
        && Boolean(url.hostname)
        && !url.port
        && !url.username
        && !url.password
        && (url.pathname === '/' || url.pathname === '')
        && !url.search
        && !url.hash
        && url.origin === origin.replace(/\/$/, '');
    }) ? origins.map(origin => origin.replace(/\/$/, '')) : [];
  } catch {
    return [];
  }
}

export function approvedBrowserOrigin(
  origin: string | null,
  allowedOrigins: readonly string[],
): boolean {
  return origin === null || (
    origin.length > 0
    && allowedOrigins.includes(origin)
  );
}

export function approvedSupabaseRuntimeUrl(
  value: string | undefined,
  allowedRefs: readonly string[],
): boolean {
  if (!value || allowedRefs.length === 0) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !url.port
      && !url.username
      && !url.password
      && (url.pathname === '/' || url.pathname === '')
      && !url.search
      && !url.hash
      && allowedRefs.some(ref => url.hostname === ref + '.supabase.co');
  } catch {
    return false;
  }
}

export function objectSnapshotStable(
  first: WosV1ObjectSnapshot,
  second: WosV1ObjectSnapshot,
): boolean {
  return first.id === second.id
    && first.ownerId === second.ownerId
    && first.version === second.version
    && first.updatedAt === second.updatedAt
    && first.mimeType === second.mimeType
    && first.byteSize === second.byteSize;
}

export function snapshotMatchesUpload(
  snapshot: WosV1ObjectSnapshot,
  userId: string,
  fileSize: number,
): boolean {
  return snapshot.ownerId === userId
    && snapshot.mimeType === 'image/png'
    && uuid.test(snapshot.id)
    && typeof snapshot.version === 'string'
    && snapshot.version.length > 0
    && typeof snapshot.updatedAt === 'string'
    && snapshot.updatedAt.length > 0
    && /^[0-9]+$/.test(snapshot.byteSize)
    && Number(snapshot.byteSize) === fileSize
    && Number.isSafeInteger(fileSize)
    && fileSize >= 60
    && fileSize <= 20 * 1024 * 1024;
}

export async function deterministicProofRequestId(input: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  ));
  digest[6] = (digest[6] & 0x0f) | 0x40;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Array.from(digest.slice(0, 16), byte =>
    byte.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-'
    + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-'
    + hex.slice(20, 32);
}

export function isWosV1ProofResult(
  value: unknown,
  input: {
    readonly imageId: string;
    readonly category: string;
    readonly sha256: string;
  },
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ['VERIFIED', 'REPLAYED'].includes(String(row.status))
    && row.imageId === input.imageId
    && row.category === input.category.toLowerCase().replaceAll('_', '-')
      .replaceAll('-', '_')
    && row.sha256 === input.sha256;
}
