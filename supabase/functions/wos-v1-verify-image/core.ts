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

export interface WosV1ImageUploadVerificationBody {
  readonly category: (typeof WOS_V1_IMAGE_CATEGORIES)[number];
  readonly imageId: string;
  readonly orderId: string;
  readonly sha256: string;
  readonly storagePath: string;
}

export interface WosV1ImageExistingProofVerificationBody {
  readonly category: (typeof WOS_V1_IMAGE_CATEGORIES)[number];
  readonly imageId: string;
  readonly orderId: string;
  readonly reverifyExistingProof: true;
}

export type WosV1ImageVerificationBody =
  | WosV1ImageUploadVerificationBody
  | WosV1ImageExistingProofVerificationBody;

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
const revisionVersionLabel = /^V(?:[2-9]|[1-9][0-9]{1,20})$/;

export function isWosV1RevisionLabel(value: unknown): value is string {
  return typeof value === 'string' && revisionVersionLabel.test(value);
}

export function parseWosV1ImageVerificationBody(
  value: unknown,
): WosV1ImageVerificationBody | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.category !== 'string'
    || !(WOS_V1_IMAGE_CATEGORIES as readonly string[]).includes(row.category)
    || typeof row.imageId !== 'string' || !uuid.test(row.imageId)
    || typeof row.orderId !== 'string' || !uuid.test(row.orderId)) {
    return null;
  }
  const keys = Object.keys(row).sort().join(',');
  if (keys === 'category,imageId,orderId,sha256,storagePath') {
    if (typeof row.sha256 !== 'string' || !sha256.test(row.sha256)
      || typeof row.storagePath !== 'string'
      || row.storagePath.length > 600
      || row.storagePath.includes('..')) return null;
    return row as unknown as WosV1ImageUploadVerificationBody;
  }
  if (keys === 'category,imageId,orderId,reverifyExistingProof'
    && row.reverifyExistingProof === true) {
    return row as unknown as WosV1ImageExistingProofVerificationBody;
  }
  return null;
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
  if (order.workflow_status === 'DRAFT'
    || order.workflow_status === 'NEEDS_INFORMATION') {
    return versionLabel.test(order.version_label)
      ? { allowed: true, code: 'ALLOWED' }
      : { allowed: false, code: 'VERSION_INVALID' };
  }
  if (order.workflow_status === 'WAITING_MATERIAL'
    || order.workflow_status === 'READINESS_CHECK') {
    if (isWosV1RevisionLabel(order.version_label)) {
      return { allowed: true, code: 'ALLOWED' };
    }
    if (input.qaRevisionAuthorized !== true) {
      return { allowed: false, code: 'STATUS_DENIED' };
    }
    return /^QA-R[1-9][0-9]*$/.test(order.version_label)
      ? { allowed: true, code: 'ALLOWED' }
      : { allowed: false, code: 'VERSION_INVALID' };
  }
  return { allowed: false, code: 'STATUS_DENIED' };
}

// The platform verifies the caller's legacy JWT with verify_jwt=true.
// Supabase's sb_secret_* Admin key is distinct and must never serve as a JWT.
export function selectWosV1AdminApiKey(
  secretKeysJson: string | undefined,
  legacyServiceRoleJwt: string | undefined,
): string {
  try {
    const keys = JSON.parse(secretKeysJson || '{}');
    if (typeof keys.default === 'string' && keys.default) return keys.default;
  } catch {
    // Legacy-only project fallback.
  }
  return legacyServiceRoleJwt || '';
}

export function wosV1EdgeWritesEnabled(value: string | undefined): boolean {
  return value === 'true';
}

function decodeLegacyServiceRoleJwtPayload(
  jwt: string,
): Record<string, unknown> | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const bytes = Uint8Array.from(
      atob(base64),
      character => character.charCodeAt(0),
    );
    const value = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function matchesLegacyQaCloserJwt(
  authorization: string | null,
  legacyServiceRoleJwt: string | undefined,
): boolean {
  if (typeof legacyServiceRoleJwt !== 'string'
    || authorization !== (legacyServiceRoleJwt
      ? `Bearer ${legacyServiceRoleJwt}`
      : '')
    || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
      legacyServiceRoleJwt,
    )) {
    return false;
  }
  // Exact configured-env equality is the trust anchor. The claims are an
  // additional QA-project and role guard; platform verify_jwt remains required.
  const claims = decodeLegacyServiceRoleJwtPayload(legacyServiceRoleJwt);
  return claims?.role === 'service_role'
    && claims?.ref === 'xulmpqaknlwqqculbsek';
}

export type WosV1QaCloserProbeAuthResult =
  | { allowed: true }
  | {
      allowed: false;
      code: string;
      status: 503;
      data?: Record<string, unknown>;
    };

export function evaluateWosV1QaCloserProbeAuth(input: {
  expectedAuthorizationId: string;
  authorizationId: string | null;
  executionId: string | null;
  processNonce: string | null;
  authorization: string | null;
  adminKey: string;
  dedicatedCloserJwt: string | undefined;
}): WosV1QaCloserProbeAuthResult {
  const uuidPattern =
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const authorizationPattern =
    /^WOS-V1-PRODUCTION-M2-QA-UAT-[0-9]{3}$/;
  if (!authorizationPattern.test(input.expectedAuthorizationId)
    || input.authorizationId !== input.expectedAuthorizationId
    || !uuidPattern.test(input.executionId || '')
    || !uuidPattern.test(input.processNonce || '')) {
    return {
      allowed: false,
      code: 'WOS_V1_QA_EDGE_AUTHORIZATION_REQUIRED',
      status: 503,
    };
  }
  if (!input.adminKey) {
    return {
      allowed: false,
      code: 'WOS_V1_EDGE_SERVER_CONFIG_INCOMPLETE',
      status: 503,
    };
  }
  if (!input.dedicatedCloserJwt) {
    return {
      allowed: false,
      code: 'WOS_V1_QA_EDGE_CLOSER_CREDENTIAL_MISSING',
      status: 503,
    };
  }
  if (!matchesLegacyQaCloserJwt(
    input.authorization,
    input.dedicatedCloserJwt,
  )) {
    return {
      allowed: false,
      code: 'WOS_V1_QA_EDGE_CLOSER_CREDENTIAL_MISMATCH',
      status: 503,
    };
  }
  return { allowed: true };
}

export function evaluateWosV1QaCloserProbeGate(input: {
  error: boolean;
  executionId: string;
  processNonce: string;
  control:
    | {
        status?: unknown;
        executionId?: unknown;
        edgeProcessNonce?: unknown;
        closedAt?: unknown;
      }
    | null;
}): WosV1QaCloserProbeAuthResult {
  if (input.error) {
    return {
      allowed: false,
      code: 'WOS_V1_QA_EDGE_GATE_UNAVAILABLE',
      status: 503,
    };
  }
  const status = String(input.control?.status || '');
  const responseNonce = input.control?.edgeProcessNonce;
  if (String(input.control?.executionId || '') !== input.executionId
    || status === 'DENIED'
    || (responseNonce != null
      && String(responseNonce) !== input.processNonce)
    || (status === 'OPEN'
      && String(responseNonce || '') !== input.processNonce)) {
    return {
      allowed: false,
      code: 'WOS_V1_QA_EDGE_PROBE_SCOPE_DENIED',
      status: 503,
    };
  }
  if (status !== 'OPEN') {
    return {
      allowed: false,
      code: 'WOS_V1_QA_EDGE_CLOSED',
      status: 503,
      data: {
        gateStatus: status,
        executionId: input.executionId,
        closedAt: input.control?.closedAt ?? null,
      },
    };
  }
  return { allowed: true };
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
  requireOwner = true,
): boolean {
  return (!requireOwner || snapshot.ownerId === userId)
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
  const expectedCategory = input.category.toUpperCase().replaceAll('-', '_');
  const actualCategory = String(row.category || '')
    .toUpperCase()
    .replaceAll('-', '_');
  return ['VERIFIED', 'REPLAYED', 'RENEWED', 'UNCHANGED'].includes(
    String(row.status),
  )
    && row.imageId === input.imageId
    && actualCategory === expectedCategory
    && row.sha256 === input.sha256;
}
