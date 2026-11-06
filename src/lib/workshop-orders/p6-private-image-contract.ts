import {
  WOS_REFERENCE_IMAGE_STATUSES,
  replaceCurrentBaseline,
  type WosBaselineReplacement,
  type WosEntityType,
  type WosReferenceImage,
  type WosVisualBaseline,
} from './domain';
import type { ReferenceImageCategory, VisualBaselineSummary } from './spec';

// This module is an offline decision contract. It has no Storage, Auth,
// database, network, or filesystem capability and cannot prove a server action.
export const WOS_PRIVATE_IMAGE_CONTRACT_VERSION = 1 as const;
export const WOS_PRIVATE_IMAGE_BUCKET = 'wos-private' as const;
export const WOS_PRIVATE_IMAGE_PENDING_STATUS =
  'UNVERIFIED_PENDING_SERVER_STORAGE' as const;
export const WOS_PRIVATE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const WOS_PRIVATE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const WOS_PRIVATE_IMAGE_AUTHORIZED_ROLES = [
  'admin',
  'manager',
  'sales',
  'workshop',
  'technician',
] as const;

export type WosPrivateImageActorRole =
  (typeof WOS_PRIVATE_IMAGE_AUTHORIZED_ROLES)[number];
export type WosPrivateImageGateStage = 'PREVIEW' | 'START';
export type WosPrivateImageAction = 'APPEND_IMAGE' | WosPrivateImageGateStage;

export interface WosPrivateImageTrustedProfileBinding {
  readonly profileId: string;
  readonly organizationId: string;
  readonly role: string;
  readonly isActive: boolean;
}

export interface WosPrivateImageTrustedBinding {
  readonly organizationId: string;
  readonly entityType: WosEntityType;
  readonly entityId: string;
  readonly versionLabel: string;
  readonly profile: WosPrivateImageTrustedProfileBinding;
}

export interface WosPrivateImageUntrustedClaims {
  readonly persisted?: unknown;
  readonly uploadOccurred?: unknown;
  readonly signedUrlIssued?: unknown;
  readonly storageAuthorizationVerified?: unknown;
  readonly storagePolicyVerified?: unknown;
}

export interface WosPrivateImageIntent extends WosReferenceImage {
  readonly fileSize: number;
  readonly uploadedAt: string;
  readonly fingerprint?: string | null;
  readonly signedUrl?: string | null;
  readonly publicUrl?: string | null;
  readonly upsert?: unknown;
  readonly overwrite?: unknown;
  readonly mode?: unknown;
  readonly claims?: WosPrivateImageUntrustedClaims | null;
}

export interface WosPrivateImageReplayClaim {
  readonly imageId: string;
  readonly objectKey: string;
  readonly fingerprint: string;
}

export interface WosPrivateImageContractInput {
  readonly trustedBinding: WosPrivateImageTrustedBinding;
  readonly candidate: WosPrivateImageIntent;
  readonly existingImages: readonly WosReferenceImage[];
  readonly currentBaseline: WosVisualBaseline | null;
  readonly replacementBaseline?: WosVisualBaseline | null;
  readonly baselineImageIds?: readonly string[];
  readonly signedSampleRequired?: boolean;
  readonly action?: WosPrivateImageAction;
  readonly replay?: WosPrivateImageReplayClaim | null;
}

export type WosPrivateImageBlockerCode =
  | 'INVALID_INPUT'
  | 'ORGANIZATION_MISMATCH'
  | 'ENTITY_TYPE_MISMATCH'
  | 'PROFILE_ORGANIZATION_MISMATCH'
  | 'PROFILE_INACTIVE'
  | 'PROFILE_ROLE_NOT_ALLOWED'
  | 'VERSION_MISMATCH'
  | 'DUPLICATE_IMAGE_ID'
  | 'DUPLICATE_OBJECT_KEY'
  | 'INVALID_OBJECT_KEY'
  | 'PUBLIC_URL_NOT_ALLOWED'
  | 'INVALID_IMAGE_FILE'
  | 'IMAGE_NOT_READY'
  | 'IMAGE_CATEGORY_ENTITY_MISMATCH'
  | 'SUPERSEDE_TARGET_MISSING'
  | 'SUPERSEDE_TARGET_MISMATCH'
  | 'SUPERSEDE_TARGET_NOT_READY'
  | 'SUPERSEDE_TARGET_ALREADY_USED'
  | 'SUPERSEDE_VERSION_MISMATCH'
  | 'BASELINE_MISSING'
  | 'BASELINE_NOT_CURRENT'
  | 'BASELINE_ENTITY_MISMATCH'
  | 'BASELINE_VERSION_MISMATCH'
  | 'BASELINE_IMAGE_NOT_READY'
  | 'BASELINE_IMAGE_SUPERSEDED'
  | 'SIGNED_SAMPLE_NOT_READY'
  | 'REPLAY_MISMATCH'
  | 'UPSERT_OR_OVERWRITE_NOT_ALLOWED';

export interface WosPrivateImageBlocker {
  readonly code: WosPrivateImageBlockerCode;
  readonly message: string;
}

export interface WosPrivateImageGateInput {
  readonly trustedBinding: WosPrivateImageTrustedBinding;
  readonly currentBaseline: WosVisualBaseline | null;
  readonly images: readonly WosReferenceImage[];
  readonly baselineImageIds?: readonly string[];
  readonly signedSampleRequired?: boolean;
  readonly stage: WosPrivateImageGateStage;
}

export interface WosPrivateImageGateDecision {
  readonly stage: WosPrivateImageGateStage;
  readonly status: 'BLOCKED' | typeof WOS_PRIVATE_IMAGE_PENDING_STATUS;
  readonly gateSatisfied: boolean;
  readonly serverReadinessVerified: false;
  readonly storageAuthorizationVerified: false;
  readonly persisted: false;
  readonly signedUrlIssued: false;
  readonly blockers: readonly WosPrivateImageBlocker[];
  readonly visualBaselineSummary: VisualBaselineSummary | null;
}

export interface WosPrivateImageContractDecision {
  readonly contractVersion: typeof WOS_PRIVATE_IMAGE_CONTRACT_VERSION;
  readonly status: 'REJECTED' | typeof WOS_PRIVATE_IMAGE_PENDING_STATUS;
  readonly offlineContractConsistent: boolean;
  readonly persisted: false;
  readonly uploadOccurred: false;
  readonly storagePolicyVerified: false;
  readonly storageAuthorizationVerified: false;
  readonly signedUrlIssued: false;
  readonly publicUrlIssued: false;
  readonly serverVerification: 'REQUIRED' | 'NOT_PERFORMED';
  readonly proposedImages: readonly WosReferenceImage[] | null;
  readonly baselineReplacement: WosBaselineReplacement | null;
  readonly gate: WosPrivateImageGateDecision | null;
  readonly blockers: readonly WosPrivateImageBlocker[];
}

const BLOCKER_MESSAGES: Readonly<
  Record<WosPrivateImageBlockerCode, string>
> = {
  INVALID_INPUT: '私有图片输入不完整或格式无效',
  ORGANIZATION_MISMATCH: '图片、源记录与受信组织不一致',
  ENTITY_TYPE_MISMATCH: '图片、基准与受信入口类型不一致',
  PROFILE_ORGANIZATION_MISMATCH: '受信人员档案不属于当前组织',
  PROFILE_INACTIVE: '人员档案已停用',
  PROFILE_ROLE_NOT_ALLOWED: '人员角色无权操作 WOS 私有图片',
  VERSION_MISMATCH: '图片版本与受信源记录或当前基准不一致',
  DUPLICATE_IMAGE_ID: '图片 ID 已存在，图片记录不可覆盖',
  DUPLICATE_OBJECT_KEY: '私有对象键已被其他图片占用',
  INVALID_OBJECT_KEY: '私有对象键不是组织、入口、图片和版本隔离的规范路径',
  PUBLIC_URL_NOT_ALLOWED: '私有图片不得提交公开或可复用链接',
  INVALID_IMAGE_FILE: '图片文件名、MIME 或字节数不符合安全阈值',
  IMAGE_NOT_READY: '只有 READY 图片可作为当前基准或新版本',
  IMAGE_CATEGORY_ENTITY_MISMATCH: '图片类别与业务入口不匹配',
  SUPERSEDE_TARGET_MISSING: '被替代图片不存在',
  SUPERSEDE_TARGET_MISMATCH: '被替代图片不属于相同组织、入口和类别',
  SUPERSEDE_TARGET_NOT_READY: '被替代图片不是 READY 状态',
  SUPERSEDE_TARGET_ALREADY_USED: '被替代图片已经由另一新版本替代',
  SUPERSEDE_VERSION_MISMATCH: '替代图片必须使用严格更新的版本',
  BASELINE_MISSING: '缺少当前视觉基准',
  BASELINE_NOT_CURRENT: '视觉基准不是唯一 CURRENT 状态',
  BASELINE_ENTITY_MISMATCH: '视觉基准不属于受信组织或业务入口',
  BASELINE_VERSION_MISMATCH: '视觉基准版本与受信当前版本不一致',
  BASELINE_IMAGE_NOT_READY: '当前基准包含非 READY 图片',
  BASELINE_IMAGE_SUPERSEDED: '当前基准仍引用已替代图片',
  SIGNED_SAMPLE_NOT_READY: '必需签样缺失或不是 READY 图片',
  REPLAY_MISMATCH: '重放声明与图片身份或指纹不一致',
  UPSERT_OR_OVERWRITE_NOT_ALLOWED: '私有图片只允许追加，不允许 upsert 或覆盖',
};

const ENTITY_SEGMENTS: Readonly<Record<WosEntityType, string>> = {
  PRODUCTION_ORDER: 'production-order',
  SAMPLING_REQUEST: 'sampling-request',
};

const CATEGORY_SEGMENTS: Readonly<Record<ReferenceImageCategory, string>> = {
  FILM_PATTERN: 'film-pattern',
  PRODUCT: 'product',
  CUSTOMER_APPROVED_SAMPLE: 'customer-approved-sample',
  SIGNED_SAMPLE: 'signed-sample',
  SAMPLING_RESULT: 'sampling-result',
  PACKAGING_LABEL: 'packaging-label',
  DEFECT_RISK: 'defect-risk',
  OTHER: 'other',
};

const ENTITY_TYPES = new Set<string>([
  'PRODUCTION_ORDER',
  'SAMPLING_REQUEST',
]);
const IMAGE_STATUSES = new Set<string>(WOS_REFERENCE_IMAGE_STATUSES);
const IMAGE_CATEGORIES = new Set<string>(Object.keys(CATEGORY_SEGMENTS));
const AUTHORIZED_ROLES = new Set<string>(WOS_PRIVATE_IMAGE_AUTHORIZED_ROLES);
const APPROVED_MIME_TYPES = new Set<string>(WOS_PRIVATE_IMAGE_MIME_TYPES);
const SAFE_KEY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isEntityType(value: unknown): value is WosEntityType {
  return typeof value === 'string' && ENTITY_TYPES.has(value);
}

function addBlocker(
  blockers: WosPrivateImageBlocker[],
  code: WosPrivateImageBlockerCode,
): void {
  if (blockers.some((blocker) => blocker.code === code)) return;
  blockers.push({ code, message: BLOCKER_MESSAGES[code] });
}

function hasDuplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function parseTrustedBinding(
  value: unknown,
  blockers: WosPrivateImageBlocker[],
): WosPrivateImageTrustedBinding | null {
  if (!isRecord(value)
    || !isText(value.organizationId)
    || !isEntityType(value.entityType)
    || !isText(value.entityId)
    || !isText(value.versionLabel)
    || !isRecord(value.profile)
    || !isText(value.profile.profileId)
    || !isText(value.profile.organizationId)
    || !isText(value.profile.role)
    || typeof value.profile.isActive !== 'boolean') {
    addBlocker(blockers, 'INVALID_INPUT');
    return null;
  }
  return value as unknown as WosPrivateImageTrustedBinding;
}

function parseCandidate(
  value: unknown,
  blockers: WosPrivateImageBlocker[],
): WosPrivateImageIntent | null {
  if (!isRecord(value)
    || !isText(value.id)
    || !isText(value.organizationId)
    || !isEntityType(value.entityType)
    || !isText(value.entityId)
    || !isText(value.category)
    || !IMAGE_CATEGORIES.has(value.category)
    || !isText(value.storageBucket)
    || !isText(value.storagePath)
    || !isText(value.fileName)
    || !isText(value.mimeType)
    || !isText(value.versionLabel)
    || !isText(value.imageStatus)
    || !IMAGE_STATUSES.has(value.imageStatus)
    || !(value.supersedesImageId === null || isText(value.supersedesImageId))
    || !isText(value.uploadedByProfileId)
    || !isText(value.uploadedAt)
    || typeof value.fileSize !== 'number'
    || !Number.isInteger(value.fileSize)) {
    addBlocker(blockers, 'INVALID_INPUT');
    return null;
  }
  return value as unknown as WosPrivateImageIntent;
}

function imageIsRecord(value: unknown): value is WosReferenceImage {
  return isRecord(value)
    && isText(value.id)
    && isText(value.organizationId)
    && isEntityType(value.entityType)
    && isText(value.entityId)
    && isText(value.category)
    && IMAGE_CATEGORIES.has(value.category)
    && isText(value.storageBucket)
    && isText(value.storagePath)
    && isText(value.fileName)
    && isText(value.mimeType)
    && isText(value.versionLabel)
    && isText(value.imageStatus)
    && IMAGE_STATUSES.has(value.imageStatus)
    && (value.supersedesImageId === null || isText(value.supersedesImageId))
    && isText(value.uploadedByProfileId);
}

function baselineIsRecord(value: unknown): value is WosVisualBaseline {
  return isRecord(value)
    && isText(value.id)
    && isText(value.organizationId)
    && isEntityType(value.entityType)
    && isText(value.entityId)
    && isText(value.versionLabel)
    && (
      value.status === 'DRAFT'
      || value.status === 'CURRENT'
      || value.status === 'SUPERSEDED'
    )
    && (
      value.confirmedByOfficeProfileId === null
      || isText(value.confirmedByOfficeProfileId)
    )
    && (
      value.confirmedByWorkshopProfileId === null
      || isText(value.confirmedByWorkshopProfileId)
    );
}

function canonicalKeySegment(value: string): string {
  if (!SAFE_KEY_SEGMENT.test(value)) {
    throw new Error('INVALID_PRIVATE_IMAGE_KEY_SEGMENT');
  }
  return value;
}

function canonicalFileName(value: string): string {
  if (
    !SAFE_FILE_NAME.test(value)
    || value === '.'
    || value === '..'
    || value.includes('..')
    || value.includes('/')
    || value.includes('\\')
  ) {
    throw new Error('INVALID_PRIVATE_IMAGE_FILE_NAME');
  }
  return value;
}

export function buildWosPrivateImageObjectKey(input: {
  readonly organizationId: string;
  readonly entityType: WosEntityType;
  readonly entityId: string;
  readonly category: ReferenceImageCategory;
  readonly versionLabel: string;
  readonly imageId: string;
  readonly fileName: string;
}): string {
  const entitySegment = ENTITY_SEGMENTS[input.entityType];
  const categorySegment = CATEGORY_SEGMENTS[input.category];
  if (!entitySegment || !categorySegment) {
    throw new Error('INVALID_PRIVATE_IMAGE_KEY_IDENTITY');
  }
  return [
    'organizations',
    canonicalKeySegment(input.organizationId),
    'wos',
    entitySegment,
    canonicalKeySegment(input.entityId),
    'images',
    categorySegment,
    'versions',
    canonicalKeySegment(input.versionLabel),
    canonicalKeySegment(input.imageId),
    canonicalFileName(input.fileName),
  ].join('/');
}

function fileMatchesMime(fileName: string, mimeType: string): boolean {
  const normalized = fileName.toLowerCase();
  if (mimeType === 'image/jpeg') {
    return normalized.endsWith('.jpg') || normalized.endsWith('.jpeg');
  }
  if (mimeType === 'image/png') return normalized.endsWith('.png');
  if (mimeType === 'image/webp') return normalized.endsWith('.webp');
  return false;
}

function hasPublicUrl(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value !== 'string') return true;
  return /^(?:https?:|data:|blob:)/i.test(value)
    || value.includes('://');
}

function sameEntity(
  value: {
    readonly organizationId: string;
    readonly entityType: WosEntityType;
    readonly entityId: string;
  },
  binding: WosPrivateImageTrustedBinding,
): boolean {
  return value.organizationId === binding.organizationId
    && value.entityType === binding.entityType
    && value.entityId === binding.entityId;
}

function validateTrustedBinding(
  binding: WosPrivateImageTrustedBinding,
  action: WosPrivateImageAction,
  blockers: WosPrivateImageBlocker[],
): void {
  if (binding.profile.organizationId !== binding.organizationId) {
    addBlocker(blockers, 'PROFILE_ORGANIZATION_MISMATCH');
  }
  if (binding.profile.isActive !== true) {
    addBlocker(blockers, 'PROFILE_INACTIVE');
  }
  if (!AUTHORIZED_ROLES.has(binding.profile.role)) {
    addBlocker(blockers, 'PROFILE_ROLE_NOT_ALLOWED');
  }
  if (action !== 'APPEND_IMAGE' && action !== 'PREVIEW' && action !== 'START') {
    addBlocker(blockers, 'PROFILE_ROLE_NOT_ALLOWED');
  }
}

function validateCandidateIdentityAndFile(
  binding: WosPrivateImageTrustedBinding,
  candidate: WosPrivateImageIntent,
  blockers: WosPrivateImageBlocker[],
): string | null {
  if (!sameEntity(candidate, binding)) {
    addBlocker(
      blockers,
      candidate.entityType !== binding.entityType
        ? 'ENTITY_TYPE_MISMATCH'
        : 'ORGANIZATION_MISMATCH',
    );
  }
  if (candidate.uploadedByProfileId !== binding.profile.profileId) {
    addBlocker(blockers, 'PROFILE_ORGANIZATION_MISMATCH');
  }
  if (candidate.versionLabel !== binding.versionLabel) {
    addBlocker(blockers, 'VERSION_MISMATCH');
  }
  if (
    candidate.category === 'SAMPLING_RESULT'
    && binding.entityType !== 'SAMPLING_REQUEST'
  ) {
    addBlocker(blockers, 'IMAGE_CATEGORY_ENTITY_MISMATCH');
  }
  if (
    candidate.storageBucket !== WOS_PRIVATE_IMAGE_BUCKET
    || !APPROVED_MIME_TYPES.has(candidate.mimeType)
    || candidate.fileSize <= 0
    || candidate.fileSize > WOS_PRIVATE_IMAGE_MAX_BYTES
    || !fileMatchesMime(candidate.fileName, candidate.mimeType)
  ) {
    addBlocker(blockers, 'INVALID_IMAGE_FILE');
  }
  if (
    candidate.publicUrl !== null
    && candidate.publicUrl !== undefined
  ) {
    addBlocker(blockers, 'PUBLIC_URL_NOT_ALLOWED');
  }
  if (
    candidate.upsert === true
    || candidate.overwrite === true
    || candidate.mode === 'upsert'
    || candidate.mode === 'overwrite'
  ) {
    addBlocker(blockers, 'UPSERT_OR_OVERWRITE_NOT_ALLOWED');
  }

  let expectedKey: string;
  try {
    expectedKey = buildWosPrivateImageObjectKey({
      organizationId: binding.organizationId,
      entityType: binding.entityType,
      entityId: binding.entityId,
      category: candidate.category,
      versionLabel: binding.versionLabel,
      imageId: candidate.id,
      fileName: candidate.fileName,
    });
  } catch {
    addBlocker(blockers, 'INVALID_OBJECT_KEY');
    return null;
  }

  const pathSegments = candidate.storagePath.split('/');
  if (
    candidate.storagePath !== expectedKey
    || candidate.storagePath.startsWith('/')
    || candidate.storagePath.includes('\\')
    || candidate.storagePath.includes('?')
    || candidate.storagePath.includes('#')
    || candidate.storagePath.includes('%')
    || pathSegments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    addBlocker(
      blockers,
      hasPublicUrl(candidate.storagePath)
        ? 'PUBLIC_URL_NOT_ALLOWED'
        : 'INVALID_OBJECT_KEY',
    );
  }
  return expectedKey;
}

function candidateShapeMatchesExisting(
  candidate: WosPrivateImageIntent,
  existing: WosReferenceImage,
): boolean {
  return candidate.id === existing.id
    && candidate.organizationId === existing.organizationId
    && candidate.entityType === existing.entityType
    && candidate.entityId === existing.entityId
    && candidate.category === existing.category
    && candidate.storageBucket === existing.storageBucket
    && candidate.storagePath === existing.storagePath
    && candidate.fileName === existing.fileName
    && candidate.mimeType === existing.mimeType
    && candidate.versionLabel === existing.versionLabel
    && candidate.imageStatus === existing.imageStatus
    && candidate.supersedesImageId === existing.supersedesImageId
    && candidate.uploadedByProfileId === existing.uploadedByProfileId;
}

function proposedReferenceImage(
  candidate: WosPrivateImageIntent,
): WosReferenceImage {
  return {
    id: candidate.id,
    organizationId: candidate.organizationId,
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    category: candidate.category,
    storageBucket: candidate.storageBucket,
    storagePath: candidate.storagePath,
    fileName: candidate.fileName,
    mimeType: candidate.mimeType,
    versionLabel: candidate.versionLabel,
    imageStatus: candidate.imageStatus,
    supersedesImageId: candidate.supersedesImageId,
    uploadedByProfileId: candidate.uploadedByProfileId,
  };
}

function validateReplay(
  input: WosPrivateImageContractInput,
  expectedKey: string | null,
  blockers: WosPrivateImageBlocker[],
): WosReferenceImage | null {
  const { candidate, replay } = input;
  if (replay === null || replay === undefined) return null;
  if (
    !isRecord(replay)
    || replay.imageId !== candidate.id
    || replay.objectKey !== expectedKey
    || !isText(replay.fingerprint)
    || replay.fingerprint !== candidate.fingerprint
  ) {
    addBlocker(blockers, 'REPLAY_MISMATCH');
    return null;
  }
  const existing = input.existingImages.find(
    (image) => image.id === candidate.id,
  ) ?? null;
  if (!existing || !candidateShapeMatchesExisting(candidate, existing)) {
    addBlocker(blockers, 'REPLAY_MISMATCH');
    return null;
  }
  return existing;
}

function uniqueExistingImages(
  images: readonly WosReferenceImage[],
  blockers: WosPrivateImageBlocker[],
): boolean {
  if (!images.every(imageIsRecord)) {
    addBlocker(blockers, 'INVALID_INPUT');
    return false;
  }
  if (hasDuplicate(images.map((image) => image.id))) {
    addBlocker(blockers, 'DUPLICATE_IMAGE_ID');
  }
  if (
    hasDuplicate(
      images.map((image) => `${image.storageBucket}\0${image.storagePath}`),
    )
  ) {
    addBlocker(blockers, 'DUPLICATE_OBJECT_KEY');
  }
  return true;
}

function baselineScopeMatches(
  baseline: WosVisualBaseline,
  binding: WosPrivateImageTrustedBinding,
): boolean {
  return baseline.organizationId === binding.organizationId
    && baseline.entityType === binding.entityType
    && baseline.entityId === binding.entityId;
}

function baselineImages(
  input: {
    readonly baselineImageIds?: readonly string[];
  },
  baseline: WosVisualBaseline,
  images: readonly WosReferenceImage[],
): readonly WosReferenceImage[] {
  if (input.baselineImageIds !== undefined) {
    const byId = new Map(images.map((image) => [image.id, image]));
    return input.baselineImageIds
      .map((id) => byId.get(id))
      .filter((image): image is WosReferenceImage => image !== undefined);
  }
  return images.filter(
    (image) =>
      image.organizationId === baseline.organizationId
      && image.entityType === baseline.entityType
      && image.entityId === baseline.entityId
      && image.versionLabel === baseline.versionLabel
      && image.imageStatus !== 'SUPERSEDED'
      && image.imageStatus !== 'ARCHIVED',
  );
}

function validateBaselineAndImages(
  input: {
    readonly trustedBinding: WosPrivateImageTrustedBinding;
    readonly currentBaseline: WosVisualBaseline | null;
    readonly baselineImageIds?: readonly string[];
    readonly signedSampleRequired?: boolean;
  },
  images: readonly WosReferenceImage[],
  blockers: WosPrivateImageBlocker[],
): VisualBaselineSummary | null {
  const { trustedBinding: binding, currentBaseline: baseline } = input;
  if (baseline === null) {
    addBlocker(blockers, 'BASELINE_MISSING');
    return null;
  }
  if (!baselineIsRecord(baseline)) {
    addBlocker(blockers, 'INVALID_INPUT');
    addBlocker(blockers, 'BASELINE_MISSING');
    return null;
  }
  if (!baselineScopeMatches(baseline, binding)) {
    addBlocker(blockers, 'BASELINE_ENTITY_MISMATCH');
  }
  if (baseline.status !== 'CURRENT') {
    addBlocker(blockers, 'BASELINE_NOT_CURRENT');
  }
  if (baseline.versionLabel !== binding.versionLabel) {
    addBlocker(blockers, 'BASELINE_VERSION_MISMATCH');
  }

  if (
    input.baselineImageIds !== undefined
    && hasDuplicate(input.baselineImageIds)
  ) {
    addBlocker(blockers, 'DUPLICATE_IMAGE_ID');
  }

  const referenced = baselineImages(input, baseline, images);
  if (
    input.baselineImageIds !== undefined
    && referenced.length !== input.baselineImageIds.length
  ) {
    addBlocker(blockers, 'BASELINE_IMAGE_NOT_READY');
  }
  if (referenced.length === 0) {
    addBlocker(blockers, 'BASELINE_IMAGE_NOT_READY');
  }

  for (const image of referenced) {
    if (
      image.organizationId !== baseline.organizationId
      || image.entityType !== baseline.entityType
      || image.entityId !== baseline.entityId
      || image.versionLabel !== baseline.versionLabel
    ) {
      addBlocker(blockers, 'BASELINE_ENTITY_MISMATCH');
    }
    if (image.imageStatus === 'SUPERSEDED') {
      addBlocker(blockers, 'BASELINE_IMAGE_SUPERSEDED');
    } else if (image.imageStatus !== 'READY') {
      addBlocker(blockers, 'BASELINE_IMAGE_NOT_READY');
    }
  }

  const readyReferenced = referenced.filter(
    (image) => image.imageStatus === 'READY',
  );
  const signedSamples = referenced.filter(
    (image) => image.category === 'SIGNED_SAMPLE',
  );
  if (
    input.signedSampleRequired === true
    && !signedSamples.some((image) => image.imageStatus === 'READY')
  ) {
    addBlocker(blockers, 'SIGNED_SAMPLE_NOT_READY');
  }

  return {
    versionLabel: baseline.versionLabel,
    isCurrent: baseline.status === 'CURRENT',
    productImageCount: readyReferenced.filter(
      (image) => image.category === 'PRODUCT',
    ).length,
    filmImageCount: readyReferenced.filter(
      (image) => image.category === 'FILM_PATTERN',
    ).length,
    customerApprovedSampleCount: readyReferenced.filter(
      (image) => image.category === 'CUSTOMER_APPROVED_SAMPLE',
    ).length,
    signedSampleCount: signedSamples.filter(
      (image) => image.imageStatus === 'READY',
    ).length,
    workshopConfirmed: baseline.confirmedByWorkshopProfileId !== null,
  };
}

export function evaluateWosPrivateImageGate(
  input: WosPrivateImageGateInput,
): WosPrivateImageGateDecision {
  const blockers: WosPrivateImageBlocker[] = [];
  const binding = parseTrustedBinding(input.trustedBinding, blockers);
  if (input.stage !== 'PREVIEW' && input.stage !== 'START') {
    addBlocker(blockers, 'INVALID_INPUT');
  }
  if (binding) {
    validateTrustedBinding(binding, input.stage, blockers);
  }
  if (!Array.isArray(input.images) || !input.images.every(imageIsRecord)) {
    addBlocker(blockers, 'INVALID_INPUT');
    return {
      stage: input.stage,
      status: 'BLOCKED',
      gateSatisfied: false,
      serverReadinessVerified: false,
      storageAuthorizationVerified: false,
      persisted: false,
      signedUrlIssued: false,
      blockers,
      visualBaselineSummary: null,
    };
  }
  const summary = binding
    ? validateBaselineAndImages(input, input.images, blockers)
    : null;
  return {
    stage: input.stage,
    status:
      blockers.length === 0
        ? WOS_PRIVATE_IMAGE_PENDING_STATUS
        : 'BLOCKED',
    gateSatisfied: blockers.length === 0,
    serverReadinessVerified: false,
    storageAuthorizationVerified: false,
    persisted: false,
    signedUrlIssued: false,
    blockers,
    visualBaselineSummary: summary,
  };
}

function validateReplacementBaseline(
  current: WosVisualBaseline,
  replacement: WosVisualBaseline | null | undefined,
  binding: WosPrivateImageTrustedBinding,
  blockers: WosPrivateImageBlocker[],
): WosBaselineReplacement | null {
  if (replacement === null || replacement === undefined) return null;
  if (!baselineIsRecord(replacement)) {
    addBlocker(blockers, 'INVALID_INPUT');
    return null;
  }
  if (!baselineScopeMatches(replacement, binding)) {
    addBlocker(blockers, 'BASELINE_ENTITY_MISMATCH');
  }
  if (replacement.versionLabel !== binding.versionLabel) {
    addBlocker(blockers, 'BASELINE_VERSION_MISMATCH');
  }
  try {
    return replaceCurrentBaseline(current, replacement);
  } catch {
    addBlocker(blockers, 'BASELINE_NOT_CURRENT');
    return null;
  }
}

function validateSupersession(
  candidate: WosPrivateImageIntent,
  existingImages: readonly WosReferenceImage[],
  blockers: WosPrivateImageBlocker[],
): WosReferenceImage | null {
  if (candidate.supersedesImageId === null) return null;
  const target = existingImages.find(
    (image) => image.id === candidate.supersedesImageId,
  );
  if (!target) {
    addBlocker(blockers, 'SUPERSEDE_TARGET_MISSING');
    return null;
  }
  if (
    target.organizationId !== candidate.organizationId
    || target.entityType !== candidate.entityType
    || target.entityId !== candidate.entityId
    || target.category !== candidate.category
  ) {
    addBlocker(blockers, 'SUPERSEDE_TARGET_MISMATCH');
  }
  if (target.imageStatus !== 'READY') {
    addBlocker(
      blockers,
      target.imageStatus === 'SUPERSEDED'
        ? 'BASELINE_IMAGE_SUPERSEDED'
        : 'SUPERSEDE_TARGET_NOT_READY',
    );
  }
  if (target.versionLabel === candidate.versionLabel) {
    addBlocker(blockers, 'SUPERSEDE_VERSION_MISMATCH');
  }
  if (
    existingImages.some(
      (image) =>
        image.id !== candidate.id
        && image.supersedesImageId === target.id,
    )
  ) {
    addBlocker(blockers, 'SUPERSEDE_TARGET_ALREADY_USED');
  }
  return target;
}

export function evaluateWosPrivateImageVersionContract(
  input: WosPrivateImageContractInput,
): WosPrivateImageContractDecision {
  const blockers: WosPrivateImageBlocker[] = [];
  if (!isRecord(input)
    || !Array.isArray(input.existingImages)
    || !(input.currentBaseline === null
      || input.currentBaseline === undefined
      || isRecord(input.currentBaseline))
    || !(input.baselineImageIds === undefined
      || Array.isArray(input.baselineImageIds))
    || !(input.signedSampleRequired === undefined
      || typeof input.signedSampleRequired === 'boolean')) {
    addBlocker(blockers, 'INVALID_INPUT');
    return {
      contractVersion: WOS_PRIVATE_IMAGE_CONTRACT_VERSION,
      status: 'REJECTED',
      offlineContractConsistent: false,
      persisted: false,
      uploadOccurred: false,
      storagePolicyVerified: false,
      storageAuthorizationVerified: false,
      signedUrlIssued: false,
      publicUrlIssued: false,
      serverVerification: 'NOT_PERFORMED',
      proposedImages: null,
      baselineReplacement: null,
      gate: null,
      blockers,
    };
  }

  const binding = parseTrustedBinding(input.trustedBinding, blockers);
  const candidate = parseCandidate(input.candidate, blockers);
  const action = input.action ?? 'APPEND_IMAGE';
  if (binding) validateTrustedBinding(binding, action, blockers);
  const existingAreValid = uniqueExistingImages(
    input.existingImages,
    blockers,
  );
  if (!binding || !candidate || !existingAreValid) {
    return {
      contractVersion: WOS_PRIVATE_IMAGE_CONTRACT_VERSION,
      status: 'REJECTED',
      offlineContractConsistent: false,
      persisted: false,
      uploadOccurred: false,
      storagePolicyVerified: false,
      storageAuthorizationVerified: false,
      signedUrlIssued: false,
      publicUrlIssued: false,
      serverVerification: 'NOT_PERFORMED',
      proposedImages: null,
      baselineReplacement: null,
      gate: null,
      blockers,
    };
  }

  const expectedKey = validateCandidateIdentityAndFile(
    binding,
    candidate,
    blockers,
  );
  if (candidate.imageStatus !== 'READY') {
    addBlocker(blockers, 'IMAGE_NOT_READY');
  }

  const replayed = validateReplay(input, expectedKey, blockers);
  const duplicateId = input.existingImages.some(
    (image) => image.id === candidate.id,
  );
  const duplicateKey = input.existingImages.some(
    (image) =>
      image.storageBucket === candidate.storageBucket
      && image.storagePath === candidate.storagePath,
  );
  if (duplicateId && !replayed) {
    addBlocker(blockers, 'DUPLICATE_IMAGE_ID');
  }
  if (duplicateKey && replayed === null) {
    addBlocker(blockers, 'DUPLICATE_OBJECT_KEY');
  }

  const superseded = validateSupersession(
    candidate,
    input.existingImages,
    blockers,
  );
  const replacement = binding && input.currentBaseline
    ? validateReplacementBaseline(
        input.currentBaseline,
        input.replacementBaseline,
        binding,
        blockers,
      )
    : null;

  const proposedImages: WosReferenceImage[] = replayed
    ? [...input.existingImages]
    : input.existingImages.map((image) =>
        superseded && image.id === superseded.id
          ? { ...image, imageStatus: 'SUPERSEDED' }
          : image,
      );
  if (!replayed) {
    proposedImages.push(proposedReferenceImage(candidate));
  }

  const gate = evaluateWosPrivateImageGate({
    trustedBinding: binding,
    currentBaseline: input.currentBaseline,
    images: proposedImages,
    baselineImageIds: input.baselineImageIds,
    signedSampleRequired: input.signedSampleRequired,
    stage: action === 'PREVIEW' ? 'PREVIEW' : 'START',
  });
  for (const blocker of gate.blockers) {
    addBlocker(blockers, blocker.code);
  }

  return {
    contractVersion: WOS_PRIVATE_IMAGE_CONTRACT_VERSION,
    status:
      blockers.length === 0
        ? WOS_PRIVATE_IMAGE_PENDING_STATUS
        : 'REJECTED',
    offlineContractConsistent: blockers.length === 0,
    persisted: false,
    uploadOccurred: false,
    storagePolicyVerified: false,
    storageAuthorizationVerified: false,
    signedUrlIssued: false,
    publicUrlIssued: false,
    serverVerification:
      blockers.length === 0 ? 'REQUIRED' : 'NOT_PERFORMED',
    proposedImages: blockers.length === 0 ? proposedImages : null,
    baselineReplacement: blockers.length === 0 ? replacement : null,
    gate,
    blockers,
  };
}

export const evaluatePrivateImageVersionContract =
  evaluateWosPrivateImageVersionContract;
export const validateWosPrivateImageVersionContract =
  evaluateWosPrivateImageVersionContract;
