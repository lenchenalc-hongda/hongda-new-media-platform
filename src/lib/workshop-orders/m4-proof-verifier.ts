import { createHash, timingSafeEqual } from 'node:crypto';
import {
  WOS_QA_IMAGE_CATEGORIES,
  buildWosQaImageObjectPath,
  isWosQaImageCategory,
  type WosQaImageCategory,
} from './qa-image-categories';

export const WOS_M4_PROOF_READ_ROLES = [
  'admin', 'manager', 'sales', 'operator',
] as const;
export const WOS_M4_PROOF_MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const sha256Pattern = /^[a-f0-9]{64}$/;
const versionLabelPattern = /^QA-R[1-9][0-9]*$/;
const orderNumberPattern = /^QA-NONPROD-[0-9a-f-]{36}$/i;

export type WosM4ProofReadRole = (typeof WOS_M4_PROOF_READ_ROLES)[number];

export interface WosM4ProofVerifierActor {
  readonly userId: string;
  readonly profileId: string;
  readonly organizationId: string;
  readonly role: WosM4ProofReadRole;
}

export interface WosM4ProofVerifierOrder {
  readonly id: string;
  readonly organizationId: string;
  readonly orderNumber: string;
  readonly version: number;
  readonly versionLabel: string;
  readonly workflowStatus: string;
}

export interface WosM4ProofSnapshotImage {
  readonly imageId: string;
  readonly category: WosQaImageCategory;
  readonly expectedSha256: string;
  readonly expiresAt: string;
}

export interface WosM4ProofSnapshot {
  readonly orderId: string;
  readonly orderVersion: number;
  readonly versionLabel: string;
  readonly baselineId: string;
  readonly checkedAt: string;
  readonly proofExpiresAt: string;
  readonly snapshotFingerprint: string;
  readonly metadataSnapshotValid: true;
  readonly officeWorkshopDistinct: true;
  readonly proofSetDigestMatch: true;
  readonly m2ReceiptChainComplete: true;
  readonly images: readonly WosM4ProofSnapshotImage[];
  readonly canStart: false;
}

export interface WosM4ProofReferenceImage {
  readonly id: string;
  readonly organizationId: string;
  readonly entityType: 'PRODUCTION_ORDER';
  readonly entityId: string;
  readonly category: WosQaImageCategory;
  readonly versionLabel: string;
  readonly imageStatus: string;
  readonly supersededAt: string | null;
  readonly storageBucket: string;
  readonly storagePath: string;
}

export interface WosM4ProofVerifierDependencies {
  readonly readSnapshot: (
    orderId: string,
    expectedVersion: number,
    versionLabel: string,
  ) => Promise<unknown>;
  readonly readReferenceImages: (
    orderId: string,
    imageIds: readonly string[],
  ) => Promise<unknown>;
  readonly downloadObject: (
    bucket: string,
    path: string,
  ) => Promise<Uint8Array>;
  readonly now?: () => number;
}

export interface WosM4ProofVerifierResult {
  readonly orderId: string;
  readonly orderVersion: number;
  readonly versionLabel: string;
  readonly baselineId: string;
  readonly imageCategories: readonly WosQaImageCategory[];
  readonly metadataSnapshotStable: true;
  readonly contentSha256Verified: true;
  readonly officeWorkshopDistinct: true;
  readonly proofSetDigestMatch: true;
  readonly m2ReceiptChainComplete: true;
  readonly blockers: readonly [];
  readonly canStart: false;
}

export type WosM4ProofVerifierErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'ORDER_NOT_AVAILABLE'
  | 'PROOF_ORDER_NOT_READY'
  | 'VERSION_CONFLICT'
  | 'PROOF_SNAPSHOT_INVALID'
  | 'BASELINE_CARDINALITY_INVALID'
  | 'PROOF_NOT_AVAILABLE'
  | 'PROOF_OBJECT_CHANGED'
  | 'PROOF_OBJECT_UNAVAILABLE'
  | 'PROOF_EXPIRED'
  | 'PROOF_SHA_MISMATCH'
  | 'SIGNOFF_MISMATCH'
  | 'RECEIPT_CHAIN_INVALID'
  | 'SNAPSHOT_CHANGED'
  | 'DATABASE_READ_UNAVAILABLE'
  | 'PROOF_VERIFIER_TIMEOUT'
  | 'PROOF_VERIFIER_UNAVAILABLE';

export class WosM4ProofVerifierFailure extends Error {
  readonly code: WosM4ProofVerifierErrorCode;
  readonly status: number;

  constructor(code: WosM4ProofVerifierErrorCode, status: number) {
    super(code);
    this.name = 'WosM4ProofVerifierFailure';
    this.code = code;
    this.status = status;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

export function parseWosM4ProofVerifierRequest(requestUrl: string):
  | { readonly ok: true; readonly orderId: string }
  | { readonly ok: false; readonly code: 'INVALID_READ_QUERY' } {
  try {
    const search = new URL(requestUrl).searchParams;
    const keys = Array.from(search.keys());
    if (keys.length !== 1 || keys[0] !== 'orderId'
      || search.getAll('orderId').length !== 1) {
      return { ok: false, code: 'INVALID_READ_QUERY' };
    }
    const orderId = search.get('orderId');
    return uuid(orderId)
      ? { ok: true, orderId }
      : { ok: false, code: 'INVALID_READ_QUERY' };
  } catch {
    return { ok: false, code: 'INVALID_READ_QUERY' };
  }
}

export function parseWosM4ProofSnapshot(value: unknown): WosM4ProofSnapshot | null {
  if (!record(value) || !hasExactKeys(value, [
    'orderId', 'orderVersion', 'versionLabel', 'baselineId', 'checkedAt',
    'proofExpiresAt', 'snapshotFingerprint', 'metadataSnapshotValid',
    'officeWorkshopDistinct', 'proofSetDigestMatch',
    'm2ReceiptChainComplete', 'images', 'canStart',
  ])) return null;
  if (!uuid(value.orderId)
    || !Number.isSafeInteger(value.orderVersion)
    || Number(value.orderVersion) < 5
    || typeof value.versionLabel !== 'string'
    || !versionLabelPattern.test(value.versionLabel)
    || !uuid(value.baselineId)
    || !validDate(value.checkedAt)
    || !validDate(value.proofExpiresAt)
    || typeof value.snapshotFingerprint !== 'string'
    || !sha256Pattern.test(value.snapshotFingerprint)
    || value.metadataSnapshotValid !== true
    || value.officeWorkshopDistinct !== true
    || value.proofSetDigestMatch !== true
    || value.m2ReceiptChainComplete !== true
    || value.canStart !== false
    || !Array.isArray(value.images)
    || value.images.length !== 4) return null;

  const images: WosM4ProofSnapshotImage[] = [];
  for (const candidate of value.images) {
    if (!record(candidate) || !hasExactKeys(candidate, [
      'imageId', 'category', 'expectedSha256', 'expiresAt',
    ])
      || !uuid(candidate.imageId)
      || !isWosQaImageCategory(candidate.category)
      || typeof candidate.expectedSha256 !== 'string'
      || !sha256Pattern.test(candidate.expectedSha256)
      || !validDate(candidate.expiresAt)) return null;
    images.push({
      imageId: candidate.imageId,
      category: candidate.category,
      expectedSha256: candidate.expectedSha256,
      expiresAt: candidate.expiresAt,
    });
  }
  const imageIds = new Set(images.map(image => image.imageId));
  if (imageIds.size !== 4
    || WOS_QA_IMAGE_CATEGORIES.some(category =>
      images.filter(image => image.category === category).length !== 1)) return null;
  const minimumExpiry = Math.min(...images.map(image => Date.parse(image.expiresAt)));
  if (Date.parse(value.proofExpiresAt) !== minimumExpiry) return null;
  return {
    orderId: value.orderId,
    orderVersion: Number(value.orderVersion),
    versionLabel: value.versionLabel,
    baselineId: value.baselineId,
    checkedAt: value.checkedAt,
    proofExpiresAt: value.proofExpiresAt,
    snapshotFingerprint: value.snapshotFingerprint,
    metadataSnapshotValid: true,
    officeWorkshopDistinct: true,
    proofSetDigestMatch: true,
    m2ReceiptChainComplete: true,
    images: images.sort((a, b) =>
      WOS_QA_IMAGE_CATEGORIES.indexOf(a.category)
      - WOS_QA_IMAGE_CATEGORIES.indexOf(b.category)),
    canStart: false,
  };
}

export function wosM4SnapshotStableProjection(snapshot: WosM4ProofSnapshot): string {
  return JSON.stringify({
    orderId: snapshot.orderId,
    orderVersion: snapshot.orderVersion,
    versionLabel: snapshot.versionLabel,
    baselineId: snapshot.baselineId,
    proofExpiresAt: snapshot.proofExpiresAt,
    snapshotFingerprint: snapshot.snapshotFingerprint,
    metadataSnapshotValid: snapshot.metadataSnapshotValid,
    officeWorkshopDistinct: snapshot.officeWorkshopDistinct,
    proofSetDigestMatch: snapshot.proofSetDigestMatch,
    m2ReceiptChainComplete: snapshot.m2ReceiptChainComplete,
    images: snapshot.images,
    canStart: snapshot.canStart,
  });
}

export function wosM4ProofSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

function verifyHashesEqual(actual: string, expected: string): boolean {
  if (!sha256Pattern.test(actual) || !sha256Pattern.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new WosM4ProofVerifierFailure('PROOF_VERIFIER_TIMEOUT', 504);
  }
}

function parseReferenceImage(value: unknown): WosM4ProofReferenceImage | null {
  if (!record(value)
    || !uuid(value.id)
    || !uuid(value.organizationId)
    || value.entityType !== 'PRODUCTION_ORDER'
    || !uuid(value.entityId)
    || !isWosQaImageCategory(value.category)
    || typeof value.versionLabel !== 'string'
    || typeof value.imageStatus !== 'string'
    || (value.supersededAt !== null && !validDate(value.supersededAt))
    || value.storageBucket !== 'wos-private'
    || typeof value.storagePath !== 'string'
    || value.storagePath.length < 1
    || value.storagePath.length > 600) return null;
  return {
    id: value.id,
    organizationId: value.organizationId,
    entityType: 'PRODUCTION_ORDER',
    entityId: value.entityId,
    category: value.category,
    versionLabel: value.versionLabel,
    imageStatus: value.imageStatus,
    supersededAt: value.supersededAt,
    storageBucket: value.storageBucket,
    storagePath: value.storagePath,
  };
}

function assertOrder(input: {
  readonly actor: WosM4ProofVerifierActor;
  readonly orderId: string;
  readonly order: WosM4ProofVerifierOrder;
}): void {
  if (input.order.id !== input.orderId
    || input.order.organizationId !== input.actor.organizationId) {
    throw new WosM4ProofVerifierFailure('ORDER_NOT_AVAILABLE', 404);
  }
  if (input.order.workflowStatus !== 'READINESS_CHECK'
    || !orderNumberPattern.test(input.order.orderNumber)) {
    throw new WosM4ProofVerifierFailure('PROOF_ORDER_NOT_READY', 409);
  }
  if (!Number.isSafeInteger(input.order.version)
    || input.order.version < 5
    || !versionLabelPattern.test(input.order.versionLabel)) {
    throw new WosM4ProofVerifierFailure('VERSION_CONFLICT', 409);
  }
}

function assertSnapshotScope(
  snapshot: WosM4ProofSnapshot,
  order: WosM4ProofVerifierOrder,
): void {
  if (snapshot.orderId !== order.id
    || snapshot.orderVersion !== order.version
    || snapshot.versionLabel !== order.versionLabel) {
    throw new WosM4ProofVerifierFailure('VERSION_CONFLICT', 409);
  }
}

function mapReferenceImages(input: {
  readonly snapshot: WosM4ProofSnapshot;
  readonly order: WosM4ProofVerifierOrder;
  readonly organizationId: string;
  readonly value: unknown;
}): readonly WosM4ProofReferenceImage[] {
  if (!Array.isArray(input.value) || input.value.length !== 4) {
    throw new WosM4ProofVerifierFailure('BASELINE_CARDINALITY_INVALID', 409);
  }
  const images = input.value.map(parseReferenceImage);
  if (images.some(image => image === null)) {
    throw new WosM4ProofVerifierFailure('PROOF_NOT_AVAILABLE', 409);
  }
  const rows = images as WosM4ProofReferenceImage[];
  const ids = new Set(rows.map(image => image.id));
  const paths = new Set(rows.map(image => image.storagePath));
  if (ids.size !== 4 || paths.size !== 4) {
    throw new WosM4ProofVerifierFailure('BASELINE_CARDINALITY_INVALID', 409);
  }
  for (const expected of input.snapshot.images) {
    const matches = rows.filter(image => image.id === expected.imageId);
    if (matches.length !== 1) {
      throw new WosM4ProofVerifierFailure('PROOF_NOT_AVAILABLE', 409);
    }
    const image = matches[0];
    if (image.organizationId !== input.organizationId
      || image.entityId !== input.order.id
      || image.entityType !== 'PRODUCTION_ORDER'
      || image.versionLabel !== input.order.versionLabel
      || image.category !== expected.category
      || image.imageStatus !== 'READY'
      || image.supersededAt !== null) {
      throw new WosM4ProofVerifierFailure('PROOF_OBJECT_CHANGED', 409);
    }
    const canonical = buildWosQaImageObjectPath({
      organizationId: input.organizationId,
      orderId: input.order.id,
      versionLabel: input.order.versionLabel,
      imageId: image.id,
      category: image.category,
    });
    if (image.storageBucket !== 'wos-private' || image.storagePath !== canonical) {
      throw new WosM4ProofVerifierFailure('PROOF_OBJECT_CHANGED', 409);
    }
  }
  return rows;
}

export async function executeWosM4ProofVerifier(input: {
  readonly actor: WosM4ProofVerifierActor;
  readonly orderId: string;
  readonly order: WosM4ProofVerifierOrder;
  readonly dependencies: WosM4ProofVerifierDependencies;
  readonly signal?: AbortSignal;
}): Promise<WosM4ProofVerifierResult> {
  throwIfAborted(input.signal);
  if (!(WOS_M4_PROOF_READ_ROLES as readonly string[]).includes(input.actor.role)) {
    throw new WosM4ProofVerifierFailure('FORBIDDEN', 403);
  }
  assertOrder(input);

  const first = parseWosM4ProofSnapshot(
    await input.dependencies.readSnapshot(
      input.order.id,
      input.order.version,
      input.order.versionLabel,
    ),
  );
  if (!first) {
    throw new WosM4ProofVerifierFailure('PROOF_SNAPSHOT_INVALID', 409);
  }
  throwIfAborted(input.signal);
  assertSnapshotScope(first, input.order);

  const referenceImages = mapReferenceImages({
    snapshot: first,
    order: input.order,
    organizationId: input.actor.organizationId,
    value: await input.dependencies.readReferenceImages(
      input.order.id,
      first.images.map(image => image.imageId),
    ),
  });
  const referenceById = new Map(referenceImages.map(image => [image.id, image]));
  throwIfAborted(input.signal);

  let downloaded: readonly Uint8Array[];
  try {
    downloaded = await Promise.all(first.images.map(image => {
      const reference = referenceById.get(image.imageId);
      if (!reference) {
        throw new WosM4ProofVerifierFailure('PROOF_NOT_AVAILABLE', 409);
      }
      return input.dependencies.downloadObject(
        reference.storageBucket,
        reference.storagePath,
      );
    }));
    throwIfAborted(input.signal);
  } catch (error) {
    if (error instanceof WosM4ProofVerifierFailure) throw error;
    throw new WosM4ProofVerifierFailure('PROOF_OBJECT_UNAVAILABLE', 409);
  }

  for (let index = 0; index < first.images.length; index += 1) {
    const bytes = downloaded[index];
    if (!(bytes instanceof Uint8Array)
      || bytes.byteLength < 1
      || bytes.byteLength > WOS_M4_PROOF_MAX_IMAGE_BYTES) {
      throw new WosM4ProofVerifierFailure('PROOF_OBJECT_UNAVAILABLE', 409);
    }
    const actual = wosM4ProofSha256(bytes);
    if (!verifyHashesEqual(actual, first.images[index].expectedSha256)) {
      throw new WosM4ProofVerifierFailure('PROOF_SHA_MISMATCH', 409);
    }
  }

  const secondRaw = await input.dependencies.readSnapshot(
    input.order.id,
    input.order.version,
    input.order.versionLabel,
  );
  const second = parseWosM4ProofSnapshot(secondRaw);
  if (!second) {
    throw new WosM4ProofVerifierFailure('PROOF_SNAPSHOT_INVALID', 409);
  }
  throwIfAborted(input.signal);
  assertSnapshotScope(second, input.order);
  if (wosM4SnapshotStableProjection(first) !== wosM4SnapshotStableProjection(second)
    || Date.parse(second.checkedAt) < Date.parse(first.checkedAt)) {
    throw new WosM4ProofVerifierFailure('SNAPSHOT_CHANGED', 409);
  }
  const nowMs = input.dependencies.now?.() ?? Date.now();
  if (Date.parse(second.proofExpiresAt) <= Date.parse(second.checkedAt)
    || second.images.some(image =>
      Date.parse(image.expiresAt) <= Date.parse(second.checkedAt))
    || Date.parse(second.proofExpiresAt) <= nowMs
    || second.images.some(image => Date.parse(image.expiresAt) <= nowMs)) {
    throw new WosM4ProofVerifierFailure('PROOF_EXPIRED', 409);
  }

  return {
    orderId: input.order.id,
    orderVersion: input.order.version,
    versionLabel: input.order.versionLabel,
    baselineId: second.baselineId,
    imageCategories: second.images.map(image => image.category),
    metadataSnapshotStable: true,
    contentSha256Verified: true,
    officeWorkshopDistinct: true,
    proofSetDigestMatch: true,
    m2ReceiptChainComplete: true,
    blockers: [],
    canStart: false,
  };
}

export function mapWosM4ProofDatabaseError(message: string): WosM4ProofVerifierFailure {
  const match = /(?:^|\s)(NOT_AUTHORIZED|ORDER_NOT_AVAILABLE|PROOF_ORDER_NOT_READY|VERSION_CONFLICT|BASELINE_CARDINALITY_INVALID|PROOF_NOT_AVAILABLE|PROOF_EXPIRED|PROOF_OBJECT_CHANGED|PROOF_SET_MISMATCH|SIGNOFF_MISMATCH|RECEIPT_CHAIN_INVALID)(?:\s|$)/.exec(message);
  switch (match?.[1]) {
    case 'NOT_AUTHORIZED':
      return new WosM4ProofVerifierFailure('FORBIDDEN', 403);
    case 'ORDER_NOT_AVAILABLE':
      return new WosM4ProofVerifierFailure('ORDER_NOT_AVAILABLE', 404);
    case 'PROOF_ORDER_NOT_READY':
      return new WosM4ProofVerifierFailure('PROOF_ORDER_NOT_READY', 409);
    case 'VERSION_CONFLICT':
      return new WosM4ProofVerifierFailure('VERSION_CONFLICT', 409);
    case 'BASELINE_CARDINALITY_INVALID':
      return new WosM4ProofVerifierFailure('BASELINE_CARDINALITY_INVALID', 409);
    case 'PROOF_NOT_AVAILABLE':
      return new WosM4ProofVerifierFailure('PROOF_NOT_AVAILABLE', 409);
    case 'PROOF_EXPIRED':
      return new WosM4ProofVerifierFailure('PROOF_EXPIRED', 409);
    case 'PROOF_OBJECT_CHANGED':
      return new WosM4ProofVerifierFailure('PROOF_OBJECT_CHANGED', 409);
    case 'PROOF_SET_MISMATCH':
      return new WosM4ProofVerifierFailure('PROOF_SNAPSHOT_INVALID', 409);
    case 'SIGNOFF_MISMATCH':
      return new WosM4ProofVerifierFailure('SIGNOFF_MISMATCH', 409);
    case 'RECEIPT_CHAIN_INVALID':
      return new WosM4ProofVerifierFailure('RECEIPT_CHAIN_INVALID', 409);
    default:
      return new WosM4ProofVerifierFailure('DATABASE_READ_UNAVAILABLE', 503);
  }
}
