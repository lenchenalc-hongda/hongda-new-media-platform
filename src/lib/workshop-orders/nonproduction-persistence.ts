import type { WosEntityType } from './domain';
import type { ReferenceImageCategory } from './spec';

export const WOS_PRIVATE_IMAGE_BUCKET = 'wos-private' as const;

export const WOS_IMAGE_VERSION_CATEGORIES = [
  'PRODUCT',
  'FILM_PATTERN',
  'CUSTOMER_APPROVED_SAMPLE',
  'SIGNED_SAMPLE',
  'SAMPLING_RESULT',
  'PACKAGING_LABEL',
  'DEFECT_RISK',
  'OTHER',
] as const satisfies readonly ReferenceImageCategory[];

export type WosImageVersionCategory = ReferenceImageCategory;

export type WosImageVersionStatus =
  | 'UPLOADING'
  | 'READY'
  | 'FAILED'
  | 'QUARANTINED'
  | 'ARCHIVED';

export type WosPersistenceBlockerCode =
  | 'INVALID_INPUT'
  | 'INVALID_SUBMISSION_KEY'
  | 'SUBMISSION_ID_DUPLICATE'
  | 'IDEMPOTENCY_KEY_CONFLICT'
  | 'SUBMISSION_VERSION_DUPLICATE'
  | 'SOURCE_IDENTITY_MISMATCH'
  | 'STALE_SOURCE_VERSION'
  | 'SOURCE_NOT_SUBMITTED'
  | 'PROJECT_OWNER_MISMATCH'
  | 'PROFILE_ORGANIZATION_MISMATCH'
  | 'PROFILE_INACTIVE'
  | 'PROFILE_ROLE_NOT_ALLOWED'
  | 'READINESS_EVIDENCE_MISSING'
  | 'READINESS_EVIDENCE_VERSION_MISMATCH'
  | 'READINESS_EVIDENCE_DUPLICATE'
  | 'READINESS_EVIDENCE_PROFILE_MISMATCH'
  | 'DUPLICATE_INBOX_SOURCE'
  | 'DUPLICATE_IMAGE_ID'
  | 'DUPLICATE_OBJECT_KEY'
  | 'INVALID_IMAGE_OBJECT_KEY'
  | 'INVALID_IMAGE_FILE'
  | 'IMAGE_NOT_READY'
  | 'IMAGE_CATEGORY_ENTITY_MISMATCH'
  | 'TECHNICAL_ATTEMPT_MISSING'
  | 'TECHNICAL_ATTEMPT_MISMATCH'
  | 'TECHNICAL_ATTEMPT_NOT_ALLOWED'
  | 'SUPERSEDE_TARGET_MISSING'
  | 'SUPERSEDE_TARGET_MISMATCH'
  | 'SUPERSEDE_TARGET_ALREADY_USED';

export interface WosPersistenceBlocker {
  readonly code: WosPersistenceBlockerCode;
  readonly message: string;
}

export interface WosSourceSnapshot {
  readonly entityType: WosEntityType;
  readonly sourceId: string;
  readonly organizationId: string;
  readonly revision: number;
  readonly versionLabel: string;
  readonly projectOwnerProfileId: string;
  readonly workflowStatus: string;
}

export interface WosProfileSnapshot {
  readonly profileId: string;
  readonly organizationId: string;
  readonly isActive: boolean;
  readonly role: string;
}

export interface WosReadinessEvidenceSnapshot {
  readonly evidenceId: string;
  readonly evidenceType: 'OFFICE_COMPLETENESS';
  readonly organizationId: string;
  readonly entityType: WosEntityType;
  readonly sourceId: string;
  readonly sourceRevision: number;
  readonly sourceVersionLabel: string;
  readonly confirmedByProfileId: string;
  readonly confirmedAt: string;
  readonly immutable: true;
}

export interface WosOfficeSubmissionFacts {
  readonly submissionId: string;
  readonly submissionKey: string;
  readonly organizationId: string;
  readonly entityType: WosEntityType;
  readonly sourceId: string;
  readonly sourceRevision: number;
  readonly sourceVersionLabel: string;
  readonly projectOwnerProfileId: string;
  readonly submittedByProfileId: string;
  readonly readinessEvidence: WosReadinessEvidenceSnapshot;
  readonly submittedAt: string;
}

export type WosOfficeSubmissionCommand = WosOfficeSubmissionFacts;

export interface WosOfficeSubmissionRecord extends WosOfficeSubmissionFacts {
  readonly immutable: true;
}

export interface WosSubmissionPersistenceResult {
  readonly status: 'CREATED' | 'REPLAYED' | 'REJECTED';
  readonly submissions: readonly WosOfficeSubmissionRecord[];
  readonly submission: WosOfficeSubmissionRecord | null;
  readonly blockers: readonly WosPersistenceBlocker[];
}

export interface WosWorkshopInboxTask {
  readonly taskKey: string;
  readonly entityType: WosEntityType;
  readonly organizationId: string;
  readonly sourceId: string;
  readonly sourceRevision: number;
  readonly versionLabel: string;
  readonly projectOwnerProfileId: string;
  readonly submissionId: string;
  readonly submittedAt: string;
  readonly workflowStatus: 'SUBMITTED';
}

export interface WosWorkshopInboxResult {
  readonly tasks: readonly WosWorkshopInboxTask[];
  readonly blockers: readonly WosPersistenceBlocker[];
}

export interface WosTechnicalAttemptSnapshot {
  readonly technicalAttemptId: string;
  readonly organizationId: string;
  readonly samplingRequestId: string;
  readonly immutable: boolean;
}

export interface WosImageVersionMetadata {
  readonly imageId: string;
  readonly organizationId: string;
  readonly entityType: WosEntityType;
  readonly sourceId: string;
  readonly category: WosImageVersionCategory;
  readonly sourceRevision: number;
  readonly sourceVersionLabel: string;
  readonly storageBucket: string;
  readonly storagePath: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly uploadedByProfileId: string;
  readonly imageStatus: WosImageVersionStatus;
  readonly supersedesImageId: string | null;
  readonly technicalAttemptId: string | null;
  readonly uploadedAt: string;
}

export interface WosImageSupersessionFact {
  readonly supersessionId: string;
  readonly organizationId: string;
  readonly entityType: WosEntityType;
  readonly sourceId: string;
  readonly previousImageId: string;
  readonly nextImageId: string;
  readonly previousSourceRevision: number;
  readonly nextSourceRevision: number;
  readonly supersededByProfileId: string;
  readonly supersededAt: string;
}

export interface WosImageAppendInput {
  readonly images: readonly WosImageVersionMetadata[];
  readonly supersessions: readonly WosImageSupersessionFact[];
  readonly candidate: WosImageVersionMetadata;
  readonly source: WosSourceSnapshot;
  readonly uploaderProfile: WosProfileSnapshot;
  readonly technicalAttempt: WosTechnicalAttemptSnapshot | null;
}

export interface WosImageAppendResult {
  readonly appended: boolean;
  readonly images: readonly WosImageVersionMetadata[];
  readonly supersessions: readonly WosImageSupersessionFact[];
  readonly image: WosImageVersionMetadata | null;
  readonly supersession: WosImageSupersessionFact | null;
  readonly blockers: readonly WosPersistenceBlocker[];
}

export interface WosCurrentImageProjection {
  readonly currentImages: readonly WosImageVersionMetadata[];
  readonly supersededImageIds: readonly string[];
  readonly blockers: readonly WosPersistenceBlocker[];
}

const BLOCKER_MESSAGES: Readonly<
  Record<WosPersistenceBlockerCode, string>
> = {
  INVALID_INPUT: '持久化输入不完整或格式无效',
  INVALID_SUBMISSION_KEY: '提交幂等键必须为 8 至 200 个字符',
  SUBMISSION_ID_DUPLICATE: '提交 ID 已存在，提交事实不可覆盖',
  IDEMPOTENCY_KEY_CONFLICT: '同一幂等键已被不同业务内容使用',
  SUBMISSION_VERSION_DUPLICATE: '同一源记录版本已由其他幂等键提交',
  SOURCE_IDENTITY_MISMATCH: '组织、入口类型或源记录 ID 不一致',
  STALE_SOURCE_VERSION: '提交或图片版本与当前源记录版本不一致',
  SOURCE_NOT_SUBMITTED: '只有当前已提交的办公室记录可进入车间队列',
  PROJECT_OWNER_MISMATCH: '项目负责人与源记录快照不一致',
  PROFILE_ORGANIZATION_MISMATCH: '人员档案不属于当前组织',
  PROFILE_INACTIVE: '人员档案已停用',
  PROFILE_ROLE_NOT_ALLOWED: '办公室提交仅允许管理、经理或销售档案',
  READINESS_EVIDENCE_MISSING: '缺少不可变的办公室齐套证据',
  READINESS_EVIDENCE_VERSION_MISMATCH: '齐套证据与当前源记录版本不一致',
  READINESS_EVIDENCE_DUPLICATE: '齐套证据 ID 已绑定其他源记录版本',
  READINESS_EVIDENCE_PROFILE_MISMATCH: '齐套证据确认人与组织内有效档案不一致',
  DUPLICATE_INBOX_SOURCE: '同一源记录产生了多个当前车间任务',
  DUPLICATE_IMAGE_ID: '图片 ID 已存在，图片版本只能追加',
  DUPLICATE_OBJECT_KEY: '私有对象键已用于其他图片',
  INVALID_IMAGE_OBJECT_KEY: '图片对象键不符合组织和源记录隔离规则',
  INVALID_IMAGE_FILE: '图片文件名、类型或大小不符合私有上传规则',
  IMAGE_NOT_READY: '只有已就绪图片可写入版本元数据',
  IMAGE_CATEGORY_ENTITY_MISMATCH: '图片类别与入口类型不匹配',
  TECHNICAL_ATTEMPT_MISSING: '打样结果图必须绑定技术尝试',
  TECHNICAL_ATTEMPT_MISMATCH: '打样结果图未绑定到精确且不可变的技术尝试',
  TECHNICAL_ATTEMPT_NOT_ALLOWED: '非打样结果图不得绑定技术尝试',
  SUPERSEDE_TARGET_MISSING: '被替代图片不存在',
  SUPERSEDE_TARGET_MISMATCH: '被替代图片不属于同一组织、源记录和图片类别',
  SUPERSEDE_TARGET_ALREADY_USED: '被替代图片已经由另一个新版本显式替代',
};

const ENTITY_SEGMENTS: Readonly<Record<WosEntityType, string>> = {
  PRODUCTION_ORDER: 'production-order',
  SAMPLING_REQUEST: 'sampling-request',
};

const CATEGORY_SEGMENTS: Readonly<Record<WosImageVersionCategory, string>> = {
  PRODUCT: 'product',
  FILM_PATTERN: 'film-pattern',
  CUSTOMER_APPROVED_SAMPLE: 'customer-approved-sample',
  SIGNED_SAMPLE: 'signed-sample',
  SAMPLING_RESULT: 'sampling-result',
  PACKAGING_LABEL: 'packaging-label',
  DEFECT_RISK: 'defect-risk',
  OTHER: 'other',
};

const IMAGE_CATEGORY_SET = new Set<string>(WOS_IMAGE_VERSION_CATEGORIES);
const OFFICE_PROFILE_ROLES = new Set(['admin', 'manager', 'sales']);
const APPROVED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/;
const MAX_IMAGE_FILE_SIZE = 20 * 1024 * 1024;
const MAX_SOURCE_EDGE = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function addBlocker(
  blockers: WosPersistenceBlocker[],
  code: WosPersistenceBlockerCode,
): void {
  if (blockers.some((blocker) => blocker.code === code)) return;
  blockers.push({ code, message: BLOCKER_MESSAGES[code] });
}

function profileMatchesOrganization(
  profile: WosProfileSnapshot | null | undefined,
  profileId: string,
  organizationId: string,
  blockers: WosPersistenceBlocker[],
): boolean {
  if (
    !profile
    || !isRecord(profile)
    || profile.profileId !== profileId
    || !isNonEmptyString(profile.role)
  ) {
    addBlocker(blockers, 'PROFILE_ORGANIZATION_MISMATCH');
    return false;
  }
  if (profile.organizationId !== organizationId) {
    addBlocker(blockers, 'PROFILE_ORGANIZATION_MISMATCH');
    return false;
  }
  if (profile.isActive !== true) {
    addBlocker(blockers, 'PROFILE_INACTIVE');
    return false;
  }
  return true;
}

function officeProfileMatches(
  profile: WosProfileSnapshot | null | undefined,
  profileId: string,
  organizationId: string,
  blockers: WosPersistenceBlocker[],
): boolean {
  if (
    !profileMatchesOrganization(
      profile,
      profileId,
      organizationId,
      blockers,
    )
  ) {
    return false;
  }
  if (!OFFICE_PROFILE_ROLES.has(profile?.role ?? '')) {
    addBlocker(blockers, 'PROFILE_ROLE_NOT_ALLOWED');
    return false;
  }
  return true;
}

function sourceIdentityMatches(
  source: WosSourceSnapshot | null | undefined,
  expected: {
    organizationId: string;
    entityType: WosEntityType;
    sourceId: string;
  },
): boolean {
  return (
    !!source
    && isRecord(source)
    && source.organizationId === expected.organizationId
    && source.entityType === expected.entityType
    && source.sourceId === expected.sourceId
  );
}

function validateSourceVersion(
  source: WosSourceSnapshot | null | undefined,
  revision: number,
  versionLabel: string,
): boolean {
  return (
    !!source
    && source.revision === revision
    && source.versionLabel === versionLabel
  );
}

function validateReadinessEvidence(
  evidence: WosReadinessEvidenceSnapshot | null | undefined,
  submission: {
    organizationId: string;
    entityType: WosEntityType;
    sourceId: string;
    sourceRevision: number;
    sourceVersionLabel: string;
  },
  confirmerProfile: WosProfileSnapshot | null | undefined,
  blockers: WosPersistenceBlocker[],
): void {
  if (
    !evidence
    || !isRecord(evidence)
    || evidence.evidenceType !== 'OFFICE_COMPLETENESS'
    || !isNonEmptyString(evidence.evidenceId)
    || !isNonEmptyString(evidence.confirmedAt)
  ) {
    addBlocker(blockers, 'READINESS_EVIDENCE_MISSING');
    return;
  }
  if (
    evidence.organizationId !== submission.organizationId
    || evidence.entityType !== submission.entityType
    || evidence.sourceId !== submission.sourceId
  ) {
    addBlocker(blockers, 'SOURCE_IDENTITY_MISMATCH');
  }
  if (
    evidence.sourceRevision !== submission.sourceRevision
    || evidence.sourceVersionLabel !== submission.sourceVersionLabel
  ) {
    addBlocker(blockers, 'READINESS_EVIDENCE_VERSION_MISMATCH');
  }
  if (evidence.immutable !== true) {
    addBlocker(blockers, 'READINESS_EVIDENCE_MISSING');
  }
  if (
    !officeProfileMatches(
      confirmerProfile,
      evidence.confirmedByProfileId,
      submission.organizationId,
      blockers,
    )
  ) {
    addBlocker(blockers, 'READINESS_EVIDENCE_PROFILE_MISMATCH');
  }
}

function validateSubmission(
  command: WosOfficeSubmissionCommand,
  source: WosSourceSnapshot,
  profiles: {
    projectOwner: WosProfileSnapshot | null | undefined;
    submittedBy: WosProfileSnapshot | null | undefined;
    readinessConfirmer: WosProfileSnapshot | null | undefined;
  },
): WosPersistenceBlocker[] {
  const blockers: WosPersistenceBlocker[] = [];

  if (
    !isRecord(command)
    || !isNonEmptyString(command.submissionId)
    || !isNonEmptyString(command.organizationId)
    || !isNonEmptyString(command.sourceId)
    || !isNonEmptyString(command.sourceVersionLabel)
    || !isNonEmptyString(command.projectOwnerProfileId)
    || !isNonEmptyString(command.submittedByProfileId)
    || !isNonEmptyString(command.submittedAt)
    || !isPositiveInteger(command.sourceRevision)
    || (
      command.entityType !== 'PRODUCTION_ORDER'
      && command.entityType !== 'SAMPLING_REQUEST'
    )
  ) {
    addBlocker(blockers, 'INVALID_INPUT');
    return blockers;
  }

  const submissionKey = command.submissionKey.trim();
  if (submissionKey.length < 8 || submissionKey.length > MAX_SOURCE_EDGE) {
    addBlocker(blockers, 'INVALID_SUBMISSION_KEY');
  }

  if (!sourceIdentityMatches(source, command)) {
    addBlocker(blockers, 'SOURCE_IDENTITY_MISMATCH');
    return blockers;
  }
  if (
    !validateSourceVersion(
      source,
      command.sourceRevision,
      command.sourceVersionLabel,
    )
  ) {
    addBlocker(blockers, 'STALE_SOURCE_VERSION');
  }
  if (source.workflowStatus !== 'SUBMITTED') {
    addBlocker(blockers, 'SOURCE_NOT_SUBMITTED');
  }
  if (
    source.projectOwnerProfileId !== command.projectOwnerProfileId
    || source.projectOwnerProfileId !== profiles.projectOwner?.profileId
  ) {
    addBlocker(blockers, 'PROJECT_OWNER_MISMATCH');
  }

  officeProfileMatches(
    profiles.projectOwner,
    command.projectOwnerProfileId,
    command.organizationId,
    blockers,
  );
  officeProfileMatches(
    profiles.submittedBy,
    command.submittedByProfileId,
    command.organizationId,
    blockers,
  );
  validateReadinessEvidence(
    command.readinessEvidence,
    command,
    profiles.readinessConfirmer,
    blockers,
  );

  return blockers;
}

function submissionBusinessPayload(
  submission: WosOfficeSubmissionFacts,
): string {
  return JSON.stringify({
    submissionKey: submission.submissionKey.trim(),
    organizationId: submission.organizationId,
    entityType: submission.entityType,
    sourceId: submission.sourceId,
    sourceRevision: submission.sourceRevision,
    sourceVersionLabel: submission.sourceVersionLabel,
    projectOwnerProfileId: submission.projectOwnerProfileId,
    submittedByProfileId: submission.submittedByProfileId,
    readinessEvidence: {
      evidenceId: submission.readinessEvidence.evidenceId,
      evidenceType: submission.readinessEvidence.evidenceType,
      organizationId: submission.readinessEvidence.organizationId,
      entityType: submission.readinessEvidence.entityType,
      sourceId: submission.readinessEvidence.sourceId,
      sourceRevision: submission.readinessEvidence.sourceRevision,
      sourceVersionLabel:
        submission.readinessEvidence.sourceVersionLabel,
      confirmedByProfileId:
        submission.readinessEvidence.confirmedByProfileId,
      confirmedAt: submission.readinessEvidence.confirmedAt,
      immutable: submission.readinessEvidence.immutable,
    },
  });
}

function freezeSubmission(
  submission: WosOfficeSubmissionCommand,
): WosOfficeSubmissionRecord {
  return Object.freeze({
    ...submission,
    submissionKey: submission.submissionKey.trim(),
    readinessEvidence: Object.freeze({ ...submission.readinessEvidence }),
    immutable: true,
  });
}

export function persistOfficeSubmission(input: {
  readonly submissions: readonly WosOfficeSubmissionRecord[];
  readonly command: WosOfficeSubmissionCommand;
  readonly source: WosSourceSnapshot;
  readonly projectOwnerProfile: WosProfileSnapshot;
  readonly submittedByProfile: WosProfileSnapshot;
  readonly readinessConfirmerProfile: WosProfileSnapshot;
}): WosSubmissionPersistenceResult {
  const blockers = validateSubmission(input.command, input.source, {
    projectOwner: input.projectOwnerProfile,
    submittedBy: input.submittedByProfile,
    readinessConfirmer: input.readinessConfirmerProfile,
  });

  if (blockers.length > 0) {
    return {
      status: 'REJECTED',
      submissions: input.submissions,
      submission: null,
      blockers,
    };
  }

  const sameKey = input.submissions.find(
    (submission) =>
      submission.organizationId === input.command.organizationId
      && submission.submissionKey === input.command.submissionKey.trim(),
  );
  if (sameKey) {
    if (
      submissionBusinessPayload(sameKey)
      !== submissionBusinessPayload(input.command)
    ) {
      return {
        status: 'REJECTED',
        submissions: input.submissions,
        submission: null,
        blockers: [{
          code: 'IDEMPOTENCY_KEY_CONFLICT',
          message: BLOCKER_MESSAGES.IDEMPOTENCY_KEY_CONFLICT,
        }],
      };
    }
    return {
      status: 'REPLAYED',
      submissions: input.submissions,
      submission: sameKey,
      blockers: [],
    };
  }

  if (
    input.submissions.some(
      (submission) => submission.submissionId === input.command.submissionId,
    )
  ) {
    return {
      status: 'REJECTED',
      submissions: input.submissions,
      submission: null,
      blockers: [{
        code: 'SUBMISSION_ID_DUPLICATE',
        message: BLOCKER_MESSAGES.SUBMISSION_ID_DUPLICATE,
      }],
    };
  }

  if (
    input.submissions.some(
      (submission) =>
        submission.readinessEvidence.evidenceId
        === input.command.readinessEvidence.evidenceId,
    )
  ) {
    return {
      status: 'REJECTED',
      submissions: input.submissions,
      submission: null,
      blockers: [{
        code: 'READINESS_EVIDENCE_DUPLICATE',
        message: BLOCKER_MESSAGES.READINESS_EVIDENCE_DUPLICATE,
      }],
    };
  }

  if (
    input.submissions.some(
      (submission) =>
        submission.organizationId === input.command.organizationId
        && submission.entityType === input.command.entityType
        && submission.sourceId === input.command.sourceId
        && submission.sourceRevision === input.command.sourceRevision,
    )
  ) {
    return {
      status: 'REJECTED',
      submissions: input.submissions,
      submission: null,
      blockers: [{
        code: 'SUBMISSION_VERSION_DUPLICATE',
        message: BLOCKER_MESSAGES.SUBMISSION_VERSION_DUPLICATE,
      }],
    };
  }

  const saved = freezeSubmission(input.command);
  return {
    status: 'CREATED',
    submissions: Object.freeze([...input.submissions, saved]),
    submission: saved,
    blockers: [],
  };
}

function sourceMap(
  sources: readonly WosSourceSnapshot[],
  blockedKeys: Set<string>,
  blockers: WosPersistenceBlocker[],
): ReadonlyMap<string, WosSourceSnapshot> {
  const result = new Map<string, WosSourceSnapshot>();
  for (const source of sources) {
    const key = `${source.entityType}:${source.sourceId}`;
    if (result.has(key)) {
      blockedKeys.add(key);
      addBlocker(blockers, 'SOURCE_IDENTITY_MISMATCH');
      continue;
    }
    result.set(key, source);
  }
  return result;
}

function profileMap(
  profiles: readonly WosProfileSnapshot[],
  blockedProfileIds: Set<string>,
  blockers: WosPersistenceBlocker[],
): ReadonlyMap<string, WosProfileSnapshot> {
  const result = new Map<string, WosProfileSnapshot>();
  for (const profile of profiles) {
    if (result.has(profile.profileId)) {
      blockedProfileIds.add(profile.profileId);
      addBlocker(blockers, 'PROFILE_ORGANIZATION_MISMATCH');
      continue;
    }
    result.set(profile.profileId, profile);
  }
  return result;
}

export function buildWorkshopInbox(input: {
  readonly submissions: readonly WosOfficeSubmissionRecord[];
  readonly sources: readonly WosSourceSnapshot[];
  readonly profiles: readonly WosProfileSnapshot[];
}): WosWorkshopInboxResult {
  const blockers: WosPersistenceBlocker[] = [];
  const blockedSourceKeys = new Set<string>();
  const blockedProfileIds = new Set<string>();
  const sources = sourceMap(input.sources, blockedSourceKeys, blockers);
  const profiles = profileMap(
    input.profiles,
    blockedProfileIds,
    blockers,
  );
  const candidates: WosOfficeSubmissionRecord[] = [];

  for (const submission of input.submissions) {
    if (!isRecord(submission) || submission.immutable !== true) {
      addBlocker(blockers, 'INVALID_INPUT');
      continue;
    }
    const source = sources.get(
      `${submission.entityType}:${submission.sourceId}`,
    );
    if (!source) {
      addBlocker(blockers, 'SOURCE_IDENTITY_MISMATCH');
      continue;
    }
    const evidenceConfirmerId =
      isRecord(submission.readinessEvidence)
      && isNonEmptyString(submission.readinessEvidence.confirmedByProfileId)
        ? submission.readinessEvidence.confirmedByProfileId
        : '';
    if (
      blockedSourceKeys.has(
        `${submission.entityType}:${submission.sourceId}`,
      )
      || blockedProfileIds.has(submission.projectOwnerProfileId)
      || blockedProfileIds.has(submission.submittedByProfileId)
      || blockedProfileIds.has(evidenceConfirmerId)
    ) {
      continue;
    }
    const owner = profiles.get(submission.projectOwnerProfileId);
    const submitter = profiles.get(submission.submittedByProfileId);
    const evidenceConfirmer = profiles.get(evidenceConfirmerId);
    const submissionBlockers = validateSubmission(submission, source, {
      projectOwner: owner,
      submittedBy: submitter,
      readinessConfirmer: evidenceConfirmer,
    });
    if (submissionBlockers.length > 0) {
      for (const blocker of submissionBlockers) {
        addBlocker(blockers, blocker.code);
      }
      continue;
    }
    candidates.push(submission);
  }

  const grouped = new Map<string, WosOfficeSubmissionRecord[]>();
  for (const submission of candidates) {
    const key = `${submission.entityType}:${submission.sourceId}`;
    const group = grouped.get(key) ?? [];
    group.push(submission);
    grouped.set(key, group);
  }

  const tasks: WosWorkshopInboxTask[] = [];
  for (const [taskKey, group] of grouped) {
    if (group.length !== 1) {
      addBlocker(blockers, 'DUPLICATE_INBOX_SOURCE');
      continue;
    }
    const submission = group[0];
    tasks.push(Object.freeze({
      taskKey,
      entityType: submission.entityType,
      organizationId: submission.organizationId,
      sourceId: submission.sourceId,
      sourceRevision: submission.sourceRevision,
      versionLabel: submission.sourceVersionLabel,
      projectOwnerProfileId: submission.projectOwnerProfileId,
      submissionId: submission.submissionId,
      submittedAt: submission.submittedAt,
      workflowStatus: 'SUBMITTED',
    }));
  }

  tasks.sort(
    (left, right) =>
      left.submittedAt.localeCompare(right.submittedAt)
      || left.taskKey.localeCompare(right.taskKey),
  );

  return {
    tasks: Object.freeze(tasks),
    blockers,
  };
}

function pathSegmentIsSafe(value: string): boolean {
  return SAFE_PATH_SEGMENT.test(value);
}

export function buildImageVersionObjectKey(input: {
  readonly organizationId: string;
  readonly entityType: WosEntityType;
  readonly sourceId: string;
  readonly category: WosImageVersionCategory;
  readonly sourceRevision: number;
  readonly imageId: string;
  readonly fileName: string;
  readonly technicalAttemptId: string | null;
}): string {
  const entitySegment =
    input.entityType === 'PRODUCTION_ORDER'
      ? ENTITY_SEGMENTS.PRODUCTION_ORDER
      : input.entityType === 'SAMPLING_REQUEST'
        ? ENTITY_SEGMENTS.SAMPLING_REQUEST
        : null;
  if (
    entitySegment === null
    || !pathSegmentIsSafe(input.organizationId)
    || !pathSegmentIsSafe(input.sourceId)
    || !pathSegmentIsSafe(input.imageId)
    || !isPositiveInteger(input.sourceRevision)
    || !SAFE_FILE_NAME.test(input.fileName)
    || !IMAGE_CATEGORY_SET.has(input.category)
    || (
      input.category === 'SAMPLING_RESULT'
        ? !pathSegmentIsSafe(input.technicalAttemptId ?? '')
        : input.technicalAttemptId !== null
    )
  ) {
    throw new Error('INVALID_IMAGE_OBJECT_IDENTITY');
  }

  const attemptSegment = input.category === 'SAMPLING_RESULT'
    ? `attempt/${input.technicalAttemptId}`
    : 'no-attempt';
  return [
    'organizations',
    input.organizationId,
    'wos',
    entitySegment,
    input.sourceId,
    CATEGORY_SEGMENTS[input.category],
    `v${input.sourceRevision}`,
    attemptSegment,
    input.imageId,
    input.fileName,
  ].join('/');
}

function imageShapeIsValid(image: WosImageVersionMetadata): boolean {
  return (
    isRecord(image)
    && isNonEmptyString(image.imageId)
    && isNonEmptyString(image.organizationId)
    && isNonEmptyString(image.sourceId)
    && isPositiveInteger(image.sourceRevision)
    && isNonEmptyString(image.sourceVersionLabel)
    && isNonEmptyString(image.storageBucket)
    && isNonEmptyString(image.storagePath)
    && isNonEmptyString(image.fileName)
    && isNonEmptyString(image.mimeType)
    && isPositiveInteger(image.fileSize)
    && isNonEmptyString(image.uploadedByProfileId)
    && isNonEmptyString(image.uploadedAt)
    && IMAGE_CATEGORY_SET.has(image.category)
    && (
      image.entityType === 'PRODUCTION_ORDER'
      || image.entityType === 'SAMPLING_REQUEST'
    )
    && (
      image.technicalAttemptId === null
      || isNonEmptyString(image.technicalAttemptId)
    )
    && (
      image.supersedesImageId === null
      || isNonEmptyString(image.supersedesImageId)
    )
  );
}

function validateTechnicalAttempt(
  candidate: WosImageVersionMetadata,
  attempt: WosTechnicalAttemptSnapshot | null,
  blockers: WosPersistenceBlocker[],
): void {
  if (candidate.category !== 'SAMPLING_RESULT') {
    if (candidate.technicalAttemptId !== null) {
      addBlocker(blockers, 'TECHNICAL_ATTEMPT_NOT_ALLOWED');
    }
    return;
  }
  if (
    candidate.entityType !== 'SAMPLING_REQUEST'
    || candidate.technicalAttemptId === null
  ) {
    addBlocker(blockers, 'IMAGE_CATEGORY_ENTITY_MISMATCH');
    addBlocker(blockers, 'TECHNICAL_ATTEMPT_MISSING');
    return;
  }
  if (
    !attempt
    || attempt.technicalAttemptId !== candidate.technicalAttemptId
    || attempt.organizationId !== candidate.organizationId
    || attempt.samplingRequestId !== candidate.sourceId
    || attempt.immutable !== true
  ) {
    addBlocker(blockers, 'TECHNICAL_ATTEMPT_MISMATCH');
  }
}

function validateCandidateImage(input: WosImageAppendInput): WosPersistenceBlocker[] {
  const { candidate, source, uploaderProfile } = input;
  const blockers: WosPersistenceBlocker[] = [];

  if (!imageShapeIsValid(candidate)) {
    addBlocker(blockers, 'INVALID_INPUT');
    return blockers;
  }
  if (!sourceIdentityMatches(source, candidate)) {
    addBlocker(blockers, 'SOURCE_IDENTITY_MISMATCH');
    return blockers;
  }
  if (
    !validateSourceVersion(
      source,
      candidate.sourceRevision,
      candidate.sourceVersionLabel,
    )
  ) {
    addBlocker(blockers, 'STALE_SOURCE_VERSION');
  }
  profileMatchesOrganization(
    uploaderProfile,
    candidate.uploadedByProfileId,
    candidate.organizationId,
    blockers,
  );

  if (
    candidate.storageBucket !== WOS_PRIVATE_IMAGE_BUCKET
    || !SAFE_FILE_NAME.test(candidate.fileName)
    || !APPROVED_IMAGE_MIME_TYPES.has(candidate.mimeType)
    || candidate.fileSize <= 0
    || candidate.fileSize > MAX_IMAGE_FILE_SIZE
  ) {
    addBlocker(blockers, 'INVALID_IMAGE_FILE');
  }

  let expectedPath: string | null = null;
  try {
    expectedPath = buildImageVersionObjectKey(candidate);
  } catch {
    addBlocker(blockers, 'INVALID_IMAGE_OBJECT_KEY');
  }
  if (
    expectedPath !== null
    && (
      candidate.storagePath !== expectedPath
      || candidate.storagePath.startsWith('/')
      || candidate.storagePath.includes('..')
      || candidate.storagePath.includes('\\')
      || candidate.storagePath.includes('?')
      || candidate.storagePath.includes('#')
    )
  ) {
    addBlocker(blockers, 'INVALID_IMAGE_OBJECT_KEY');
  }

  if (candidate.imageStatus !== 'READY') {
    addBlocker(blockers, 'IMAGE_NOT_READY');
  }
  if (
    input.images.some((image) => image.imageId === candidate.imageId)
  ) {
    addBlocker(blockers, 'DUPLICATE_IMAGE_ID');
  }
  if (
    input.images.some(
      (image) =>
        image.storageBucket === candidate.storageBucket
        && image.storagePath === candidate.storagePath,
    )
  ) {
    addBlocker(blockers, 'DUPLICATE_OBJECT_KEY');
  }

  validateTechnicalAttempt(candidate, input.technicalAttempt, blockers);

  if (candidate.supersedesImageId !== null) {
    const previous = input.images.find(
      (image) => image.imageId === candidate.supersedesImageId,
    );
    if (!previous) {
      addBlocker(blockers, 'SUPERSEDE_TARGET_MISSING');
    } else {
      if (
        previous.organizationId !== candidate.organizationId
        || previous.entityType !== candidate.entityType
        || previous.sourceId !== candidate.sourceId
        || previous.category !== candidate.category
        || previous.imageStatus !== 'READY'
      ) {
        addBlocker(blockers, 'SUPERSEDE_TARGET_MISMATCH');
      }
      if (
        previous.sourceRevision >= candidate.sourceRevision
        || previous.sourceVersionLabel === candidate.sourceVersionLabel
      ) {
        addBlocker(blockers, 'STALE_SOURCE_VERSION');
      }
      if (
        input.supersessions.some(
          (fact) => fact.previousImageId === previous.imageId,
        )
      ) {
        addBlocker(blockers, 'SUPERSEDE_TARGET_ALREADY_USED');
      }
    }
  }

  return blockers;
}

export function appendImageVersion(
  input: WosImageAppendInput,
): WosImageAppendResult {
  const blockers = validateCandidateImage(input);
  if (blockers.length > 0) {
    return {
      appended: false,
      images: input.images,
      supersessions: input.supersessions,
      image: null,
      supersession: null,
      blockers,
    };
  }

  const image = Object.freeze({ ...input.candidate });
  let supersession: WosImageSupersessionFact | null = null;
  let supersessions = input.supersessions;

  if (image.supersedesImageId !== null) {
    const previous = input.images.find(
      (entry) => entry.imageId === image.supersedesImageId,
    ) as WosImageVersionMetadata;
    supersession = Object.freeze({
      supersessionId: `image-supersedes:${previous.imageId}:${image.imageId}`,
      organizationId: image.organizationId,
      entityType: image.entityType,
      sourceId: image.sourceId,
      previousImageId: previous.imageId,
      nextImageId: image.imageId,
      previousSourceRevision: previous.sourceRevision,
      nextSourceRevision: image.sourceRevision,
      supersededByProfileId: image.uploadedByProfileId,
      supersededAt: image.uploadedAt,
    });
    supersessions = Object.freeze([...input.supersessions, supersession]);
  }

  return {
    appended: true,
    images: Object.freeze([...input.images, image]),
    supersessions,
    image,
    supersession,
    blockers: [],
  };
}

function supersessionShapeIsValid(
  fact: WosImageSupersessionFact,
): boolean {
  return (
    isRecord(fact)
    && isNonEmptyString(fact.supersessionId)
    && isNonEmptyString(fact.organizationId)
    && isNonEmptyString(fact.sourceId)
    && isNonEmptyString(fact.previousImageId)
    && isNonEmptyString(fact.nextImageId)
    && isPositiveInteger(fact.previousSourceRevision)
    && isPositiveInteger(fact.nextSourceRevision)
    && isNonEmptyString(fact.supersededByProfileId)
    && isNonEmptyString(fact.supersededAt)
    && (
      fact.entityType === 'PRODUCTION_ORDER'
      || fact.entityType === 'SAMPLING_REQUEST'
    )
  );
}

export function projectCurrentImageVersions(input: {
  readonly images: readonly WosImageVersionMetadata[];
  readonly supersessions: readonly WosImageSupersessionFact[];
}): WosCurrentImageProjection {
  const blockers: WosPersistenceBlocker[] = [];
  const imageById = new Map<string, WosImageVersionMetadata>();
  for (const image of input.images) {
    if (!imageShapeIsValid(image) || imageById.has(image.imageId)) {
      addBlocker(blockers, 'DUPLICATE_IMAGE_ID');
      continue;
    }
    imageById.set(image.imageId, image);
  }

  const previousIds = new Set<string>();
  const nextIds = new Set<string>();
  const supersededImageIds: string[] = [];
  for (const fact of input.supersessions) {
    if (
      !supersessionShapeIsValid(fact)
      || previousIds.has(fact.previousImageId)
      || nextIds.has(fact.nextImageId)
    ) {
      addBlocker(blockers, 'SUPERSEDE_TARGET_ALREADY_USED');
      continue;
    }
    const previous = imageById.get(fact.previousImageId);
    const next = imageById.get(fact.nextImageId);
    if (!previous || !next) {
      addBlocker(blockers, 'SUPERSEDE_TARGET_MISSING');
      continue;
    }
    if (
      previous.organizationId !== fact.organizationId
      || next.organizationId !== fact.organizationId
      || previous.entityType !== fact.entityType
      || next.entityType !== fact.entityType
      || previous.sourceId !== fact.sourceId
      || next.sourceId !== fact.sourceId
      || previous.category !== next.category
      || next.supersedesImageId !== previous.imageId
      || previous.sourceRevision !== fact.previousSourceRevision
      || next.sourceRevision !== fact.nextSourceRevision
    ) {
      addBlocker(blockers, 'SUPERSEDE_TARGET_MISMATCH');
      continue;
    }
    previousIds.add(previous.imageId);
    nextIds.add(next.imageId);
    supersededImageIds.push(previous.imageId);
  }

  if (blockers.length > 0) {
    return {
      currentImages: Object.freeze([]),
      supersededImageIds: Object.freeze([]),
      blockers: Object.freeze(blockers),
    };
  }

  const currentImages = [...imageById.values()]
    .filter((image) => !previousIds.has(image.imageId))
    .sort((left, right) =>
      left.imageId.localeCompare(right.imageId)
      || left.sourceRevision - right.sourceRevision,
    );

  return {
    currentImages: Object.freeze(currentImages.map((image) => Object.freeze(image))),
    supersededImageIds: Object.freeze(supersededImageIds.sort()),
    blockers: [],
  };
}
