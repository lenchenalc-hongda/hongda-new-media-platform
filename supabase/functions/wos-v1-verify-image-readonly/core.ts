// @ts-ignore Deno requires the explicit .ts extension for local imports.
import { pngValid } from '../_shared/wos-png-integrity.ts';
// @ts-ignore Deno requires the explicit .ts extension for local imports.
import { WOS_V1_IMAGE_CATEGORIES, canonicalWosV1ImagePath, objectSnapshotStable, type WosV1ObjectSnapshot } from '../wos-v1-verify-image/core.ts';

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const sha256 = /^[a-f0-9]{64}$/;
const versionLabel = /^(?:QA-R[1-9][0-9]*|V[1-9][0-9]{0,20})$/;

export const WOS_V1_READONLY_MAX_BYTES = 20 * 1024 * 1024;
export const WOS_V1_READONLY_MIN_BYTES = 60;

export interface WosV1ReadOnlyImage {
  readonly category: (typeof WOS_V1_IMAGE_CATEGORIES)[number];
  readonly imageId: string;
  readonly sha256: string;
  readonly storagePath: string;
}

export interface WosV1ReadOnlyVerificationBody {
  readonly expectedVersion: number;
  readonly expectedVersionLabel: string;
  readonly images: readonly WosV1ReadOnlyImage[];
  readonly orderId: string;
}

export interface WosV1ReadOnlyProfile {
  readonly id: string;
  readonly user_id: string;
  readonly org_id: string;
  readonly role: string;
  readonly is_active: boolean;
}

export interface WosV1ReadOnlyOrder {
  readonly id: string;
  readonly organization_id: string;
  readonly version: number;
  readonly version_label: string;
  readonly workflow_status: string;
}

export interface WosV1ReadOnlyProof {
  readonly image_id: string;
  readonly organization_id: string;
  readonly order_id: string;
  readonly actor_user_id: string;
  readonly storage_bucket: string;
  readonly storage_path: string;
  readonly storage_object_id: string;
  readonly storage_object_version: string | null;
  readonly storage_object_updated_at: string;
  readonly verified_sha256: string;
  readonly verified_at: string;
  readonly expires_at: string;
}

export type WosV1ReadOnlyFailureCode =
  | 'BASELINE_CARDINALITY_INVALID'
  | 'PROOF_EXPIRED'
  | 'PROOF_METADATA_MISMATCH'
  | 'PROOF_CHANGED_DURING_VERIFICATION'
  | 'PRIVATE_BINARY_UNAVAILABLE'
  | 'PRIVATE_BINARY_SIZE_MISMATCH'
  | 'PNG_OR_SHA256_VERIFICATION_FAILED'
  | 'OBJECT_CHANGED_DURING_VERIFICATION'
  | 'ORDER_CHANGED_DURING_VERIFICATION'
  | 'ORDER_VERSION_MISMATCH'
  | 'ROLE_FORBIDDEN'
  | 'PROFILE_INVALID'
  | 'ORGANIZATION_DENIED'
  | 'STATUS_DENIED'
  | 'RUNTIME_DENIED'
  | 'READONLY_VERIFY_DISABLED';

export function parseWosV1ReadOnlyVerificationBody(
  value: unknown,
): WosV1ReadOnlyVerificationBody | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(',')
      !== 'expectedVersion,expectedVersionLabel,images,orderId'
    || typeof row.orderId !== 'string' || !uuid.test(row.orderId)
    || !Number.isSafeInteger(row.expectedVersion)
    || Number(row.expectedVersion) < 1
    || Number(row.expectedVersion) > 2147483646
    || typeof row.expectedVersionLabel !== 'string'
    || !versionLabel.test(row.expectedVersionLabel)
    || !Array.isArray(row.images)
    || row.images.length !== 4) return null;
  const images: WosV1ReadOnlyImage[] = [];
  for (const candidate of row.images) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return null;
    }
    const image = candidate as Record<string, unknown>;
    if (Object.keys(image).sort().join(',')
        !== 'category,imageId,sha256,storagePath'
      || typeof image.category !== 'string'
      || !(WOS_V1_IMAGE_CATEGORIES as readonly string[]).includes(image.category)
      || typeof image.imageId !== 'string' || !uuid.test(image.imageId)
      || typeof image.sha256 !== 'string' || !sha256.test(image.sha256)
      || typeof image.storagePath !== 'string'
      || image.storagePath.length < 1
      || image.storagePath.length > 600
      || image.storagePath.includes('..')) return null;
    images.push(image as unknown as WosV1ReadOnlyImage);
  }
  if (new Set(images.map(image => image.category)).size !== 4
    || new Set(images.map(image => image.imageId)).size !== 4
    || !WOS_V1_IMAGE_CATEGORIES.every(category =>
      images.some(image => image.category === category))) return null;
  return {
    expectedVersion: Number(row.expectedVersion),
    expectedVersionLabel: row.expectedVersionLabel,
    images,
    orderId: row.orderId,
  };
}

export function evaluateWosV1ReadOnlyAccess(input: {
  readonly readOnlyEnabled: boolean;
  readonly qaRuntimeBound: boolean;
  readonly profile: WosV1ReadOnlyProfile | null | undefined;
  readonly order: WosV1ReadOnlyOrder | null | undefined;
  readonly expectedVersion: number;
  readonly expectedVersionLabel: string;
}): { readonly allowed: boolean; readonly code: 'ALLOWED' | WosV1ReadOnlyFailureCode } {
  if (!input.qaRuntimeBound) return { allowed: false, code: 'RUNTIME_DENIED' };
  if (!input.readOnlyEnabled) {
    return { allowed: false, code: 'READONLY_VERIFY_DISABLED' };
  }
  const profile = input.profile;
  if (!profile
    || profile.is_active !== true
    || !uuid.test(profile.id)
    || !uuid.test(profile.user_id)
    || !uuid.test(profile.org_id)) {
    return { allowed: false, code: 'PROFILE_INVALID' };
  }
  if (!['admin', 'manager'].includes(profile.role)) {
    return { allowed: false, code: 'ROLE_FORBIDDEN' };
  }
  const order = input.order;
  if (!order) return { allowed: false, code: 'ORDER_VERSION_MISMATCH' };
  if (order.organization_id !== profile.org_id) {
    return { allowed: false, code: 'ORGANIZATION_DENIED' };
  }
  if (order.version !== input.expectedVersion
    || order.version_label !== input.expectedVersionLabel
    || !versionLabel.test(order.version_label)) {
    return { allowed: false, code: 'ORDER_VERSION_MISMATCH' };
  }
  if (!['WAITING_MATERIAL', 'READINESS_CHECK'].includes(order.workflow_status)) {
    return { allowed: false, code: 'STATUS_DENIED' };
  }
  return { allowed: true, code: 'ALLOWED' };
}

export function readOnlyOriginAllowed(
  origin: string | null,
  allowedOrigins: readonly string[],
): boolean {
  return origin !== null
    && origin.length > 0
    && allowedOrigins.includes(origin);
}

export function orderSnapshotStable(
  first: WosV1ReadOnlyOrder,
  second: WosV1ReadOnlyOrder,
): boolean {
  return first.id === second.id
    && first.organization_id === second.organization_id
    && first.version === second.version
    && first.version_label === second.version_label
    && first.workflow_status === second.workflow_status;
}

export function evaluateReadOnlyRequestGuard(input: {
  readonly origin: string | null;
  readonly allowedOrigins: readonly string[];
  readonly readOnlyEnabled: boolean;
  readonly qaRuntimeBound: boolean;
  readonly contentType: string | null;
  readonly authorization: string | null;
}): {
  readonly allowed: boolean;
  readonly status: number;
  readonly code: 'ALLOWED' | string;
} {
  if (!readOnlyOriginAllowed(input.origin, input.allowedOrigins)) {
    return { allowed: false, status: 403, code: 'WOS_V1_READONLY_ORIGIN_DENIED' };
  }
  if (!input.qaRuntimeBound) {
    return { allowed: false, status: 503, code: 'WOS_V1_READONLY_RUNTIME_DENIED' };
  }
  if (!input.readOnlyEnabled) {
    return { allowed: false, status: 503, code: 'WOS_V1_READONLY_VERIFY_DISABLED' };
  }
  if (!input.contentType?.startsWith('application/json')) {
    return { allowed: false, status: 400, code: 'INVALID_INPUT' };
  }
  if (!/^Bearer [^\s]+$/.test(input.authorization ?? '')) {
    return { allowed: false, status: 401, code: 'UNAUTHENTICATED' };
  }
  return { allowed: true, status: 200, code: 'ALLOWED' };
}

const timestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const microsPerMillisecond = BigInt(1000);

function timestampMicros(value: string): bigint | null {
  const match = timestampPattern.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[10] === undefined ? 0 : Number(match[10]);
  const offsetMinute = match[11] === undefined ? 0 : Number(match[11]);
  if (year < 1000
    || month < 1 || month > 12
    || day < 1 || day > 31
    || hour > 23
    || minute > 59
    || second > 59
    || offsetHour > 23
    || offsetMinute > 59) return null;

  const localMillis = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(localMillis)) return null;
  const normalized = new Date(localMillis);
  if (normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() + 1 !== month
    || normalized.getUTCDate() !== day
    || normalized.getUTCHours() !== hour
    || normalized.getUTCMinutes() !== minute
    || normalized.getUTCSeconds() !== second) return null;

  const fraction = BigInt((match[7] ?? '').padEnd(6, '0'));
  const offsetDirection = match[9] === '-' ? -1 : 1;
  const offsetMinutes = match[8] === 'Z'
    ? 0
    : offsetDirection * (offsetHour * 60 + offsetMinute);
  return BigInt(localMillis - offsetMinutes * 60_000)
      * microsPerMillisecond
    + fraction;
}

function sameTimestamp(first: string, second: string): boolean {
  const firstMicros = timestampMicros(first);
  const secondMicros = timestampMicros(second);
  return firstMicros !== null
    && secondMicros !== null
    && firstMicros === secondMicros;
}

function timestampInterval(value: string): {
  readonly earliestMicros: bigint;
  readonly latestMicros: bigint;
} | null {
  const earliestMicros = timestampMicros(value);
  const match = timestampPattern.exec(value);
  if (earliestMicros === null || !match) return null;
  const precision = match[7]?.length ?? 0;
  if (precision === 6) {
    return { earliestMicros, latestMicros: earliestMicros };
  }
  const uncertaintyMicros = BigInt(10 ** (6 - precision));
  return {
    earliestMicros,
    latestMicros: earliestMicros + uncertaintyMicros - BigInt(1),
  };
}

function proofScopeMatches(input: {
  readonly proof: WosV1ReadOnlyProof;
  readonly image: WosV1ReadOnlyImage;
  readonly order: WosV1ReadOnlyOrder;
}): boolean {
  const proof = input.proof;
  return proof.image_id === input.image.imageId
    && proof.organization_id === input.order.organization_id
    && proof.order_id === input.order.id
    && uuid.test(proof.actor_user_id)
    && proof.storage_bucket === 'wos-private'
    && proof.storage_path === input.image.storagePath
    && proof.verified_sha256.toLowerCase() === input.image.sha256.toLowerCase()
    && uuid.test(proof.storage_object_id)
    && typeof proof.storage_object_version === 'string'
    && proof.storage_object_version.length > 0
    && timestampMicros(proof.storage_object_updated_at) !== null
    && timestampMicros(proof.verified_at) !== null
    && timestampMicros(proof.expires_at) !== null;
}

export function proofSnapshotStable(
  first: WosV1ReadOnlyProof,
  second: WosV1ReadOnlyProof,
): boolean {
  return first.image_id === second.image_id
    && first.organization_id === second.organization_id
    && first.order_id === second.order_id
    && first.actor_user_id === second.actor_user_id
    && first.storage_bucket === second.storage_bucket
    && first.storage_path === second.storage_path
    && first.storage_object_id === second.storage_object_id
    && first.storage_object_version === second.storage_object_version
    && sameTimestamp(
      first.storage_object_updated_at,
      second.storage_object_updated_at,
    )
    && first.verified_sha256 === second.verified_sha256
    && sameTimestamp(first.verified_at, second.verified_at)
    && sameTimestamp(first.expires_at, second.expires_at);
}

function proofObjectIdentityMatches(
  proof: WosV1ReadOnlyProof,
  snapshot: WosV1ObjectSnapshot,
): boolean {
  const updatedAt = timestampMicros(proof.storage_object_updated_at);
  const snapshotUpdatedAt = timestampMicros(snapshot.updatedAt);
  return proof.storage_object_id === snapshot.id
    && proof.storage_object_version === snapshot.version
    && updatedAt !== null
    && snapshotUpdatedAt !== null
    && updatedAt === snapshotUpdatedAt;
}

function proofCurrentAt(
  proof: WosV1ReadOnlyProof,
  checkedAt: {
    readonly earliestMicros: bigint;
    readonly latestMicros: bigint;
  },
): boolean {
  const expiresAt = timestampMicros(proof.expires_at);
  const verifiedAt = timestampMicros(proof.verified_at);
  return verifiedAt !== null
    && verifiedAt <= checkedAt.earliestMicros
    && expiresAt !== null
    && checkedAt.latestMicros < expiresAt;
}

export function preflightWosV1ReadOnlyImage(input: {
  readonly image: WosV1ReadOnlyImage;
  readonly order: WosV1ReadOnlyOrder;
  readonly proof: WosV1ReadOnlyProof;
  readonly snapshot: WosV1ObjectSnapshot;
  readonly checkedAt: string;
}): {
  readonly ok: boolean;
  readonly code: 'VALID' | WosV1ReadOnlyFailureCode;
} {
  const checkedAt = timestampInterval(input.checkedAt);
  if (!checkedAt
    || !proofScopeMatches({
      proof: input.proof,
      image: input.image,
      order: input.order,
    })) {
    return { ok: false, code: 'PROOF_METADATA_MISMATCH' };
  }
  if (!proofObjectIdentityMatches(input.proof, input.snapshot)) {
    return { ok: false, code: 'PROOF_METADATA_MISMATCH' };
  }
  if (!proofCurrentAt(input.proof, checkedAt)) {
    return { ok: false, code: 'PROOF_EXPIRED' };
  }
  const declaredSize = Number(input.snapshot.byteSize);
  if (!Number.isSafeInteger(declaredSize)
    || declaredSize < WOS_V1_READONLY_MIN_BYTES
    || declaredSize > WOS_V1_READONLY_MAX_BYTES
    || input.snapshot.mimeType !== 'image/png') {
    return { ok: false, code: 'PRIVATE_BINARY_SIZE_MISMATCH' };
  }
  const expectedPath = canonicalWosV1ImagePath({
    organizationId: input.order.organization_id,
    orderId: input.order.id,
    versionLabel: input.order.version_label,
    imageId: input.image.imageId,
    category: input.image.category,
  });
  if (expectedPath !== input.image.storagePath) {
    return { ok: false, code: 'PROOF_METADATA_MISMATCH' };
  }
  return { ok: true, code: 'VALID' };
}

export async function verifyWosV1ReadOnlyImage(input: {
  readonly image: WosV1ReadOnlyImage;
  readonly order: WosV1ReadOnlyOrder;
  readonly firstProof: WosV1ReadOnlyProof;
  readonly secondProof: WosV1ReadOnlyProof;
  readonly firstSnapshot: WosV1ObjectSnapshot;
  readonly secondSnapshot: WosV1ObjectSnapshot;
  readonly bytes: Uint8Array;
  readonly firstCheckedAt: string;
  readonly secondCheckedAt: string;
}): Promise<{
  readonly ok: boolean;
  readonly code: 'VERIFIED' | WosV1ReadOnlyFailureCode;
}> {
  const firstCheckedAt = timestampInterval(input.firstCheckedAt);
  const secondCheckedAt = timestampInterval(input.secondCheckedAt);
  if (firstCheckedAt === null || secondCheckedAt === null
    || !proofScopeMatches({
      proof: input.firstProof,
      image: input.image,
      order: input.order,
    })
    || !proofScopeMatches({
      proof: input.secondProof,
      image: input.image,
      order: input.order,
    })) {
    return { ok: false, code: 'PROOF_METADATA_MISMATCH' };
  }
  if (!proofObjectIdentityMatches(input.firstProof, input.firstSnapshot)) {
    return { ok: false, code: 'PROOF_METADATA_MISMATCH' };
  }
  if (!proofCurrentAt(input.firstProof, firstCheckedAt)) {
    return { ok: false, code: 'PROOF_EXPIRED' };
  }
  if (!proofSnapshotStable(input.firstProof, input.secondProof)) {
    return { ok: false, code: 'PROOF_CHANGED_DURING_VERIFICATION' };
  }
  if (!proofObjectIdentityMatches(input.secondProof, input.secondSnapshot)) {
    return { ok: false, code: 'OBJECT_CHANGED_DURING_VERIFICATION' };
  }
  if (!proofCurrentAt(input.secondProof, secondCheckedAt)) {
    return { ok: false, code: 'PROOF_EXPIRED' };
  }
  const declaredSize = Number(input.firstSnapshot.byteSize);
  if (!Number.isSafeInteger(declaredSize)
    || declaredSize < WOS_V1_READONLY_MIN_BYTES
    || declaredSize > WOS_V1_READONLY_MAX_BYTES
    || input.firstSnapshot.mimeType !== 'image/png'
    || input.bytes.byteLength !== declaredSize) {
    return { ok: false, code: 'PRIVATE_BINARY_SIZE_MISMATCH' };
  }
  const expectedPath = canonicalWosV1ImagePath({
    organizationId: input.order.organization_id,
    orderId: input.order.id,
    versionLabel: input.order.version_label,
    imageId: input.image.imageId,
    category: input.image.category,
  });
  if (expectedPath !== input.image.storagePath) {
    return { ok: false, code: 'PROOF_METADATA_MISMATCH' };
  }
  if (!await pngValid(input.bytes, input.image.sha256)) {
    return { ok: false, code: 'PNG_OR_SHA256_VERIFICATION_FAILED' };
  }
  if (!objectSnapshotStable(input.firstSnapshot, input.secondSnapshot)) {
    return { ok: false, code: 'OBJECT_CHANGED_DURING_VERIFICATION' };
  }
  return { ok: true, code: 'VERIFIED' };
}

export function safeReadOnlyVerification(
  input: {
    readonly order: WosV1ReadOnlyOrder;
    readonly categories: readonly string[];
  },
): {
  readonly orderId: string;
  readonly orderVersion: number;
  readonly versionLabel: string;
  readonly imageCategories: readonly string[];
  readonly metadataSnapshotStable: true;
  readonly contentSha256Verified: true;
  readonly byteVerificationPassed: true;
  readonly reviewReady: false;
  readonly canStart: false;
} {
  return {
    orderId: input.order.id,
    orderVersion: input.order.version,
    versionLabel: input.order.version_label,
    imageCategories: input.categories,
    metadataSnapshotStable: true,
    contentSha256Verified: true,
    byteVerificationPassed: true,
    reviewReady: false,
    canStart: false,
  };
}
