import type { WosEntityType } from './domain';
import { canSubmitWosOfficeRequest } from './api-contract';

// This module validates only the shape and internal consistency of evidence
// supplied by a caller. It has no database connection and cannot authenticate
// a claim, receipt, audit event, or transaction commit.
export const WOS_ATOMIC_SUBMISSION_EVIDENCE_VERSION = 1 as const;
export const WOS_ATOMIC_SUBMISSION_PENDING_STATUS =
  'UNVERIFIED_PENDING_SERVER_VERIFICATION' as const;

export type WosAtomicSubmissionBlockerCode =
  | 'INVALID_SHAPE'
  | 'ORGANIZATION_MISMATCH'
  | 'PROFILE_INACTIVE'
  | 'PROFILE_ROLE_NOT_ALLOWED'
  | 'ENTITY_TYPE_MISMATCH'
  | 'STALE_VERSION'
  | 'FINGERPRINT_MISMATCH'
  | 'REPLAY_CONTENT_MISMATCH'
  | 'COUNT_MISMATCH'
  | 'DUPLICATE_RECEIPT_ID'
  | 'DUPLICATE_INBOX_ID'
  | 'DUPLICATE_AUDIT_ID'
  | 'NON_ATOMIC_FACTS'
  | 'UNTRUSTED_FACT_MISMATCH';

export interface WosAtomicSubmissionBlocker {
  readonly code: WosAtomicSubmissionBlockerCode;
  readonly message: string;
}

export interface WosAtomicSubmissionEvidenceDecision {
  readonly status:
    | 'REJECTED'
    | typeof WOS_ATOMIC_SUBMISSION_PENDING_STATUS;
  readonly evidenceShapeConsistent: boolean;
  readonly persisted: false;
  readonly databaseCommitVerified: false;
  readonly productionChanged: false;
  readonly serverVerification: 'REQUIRED' | 'NOT_PERFORMED';
  readonly blockers: readonly WosAtomicSubmissionBlocker[];
}

interface WosAtomicSubmissionActorShape {
  readonly profileId: string;
  readonly organizationId: string;
  readonly role: string;
  readonly isActive: boolean;
}

interface WosAtomicSubmissionRecordShape {
  readonly submissionId: string;
  readonly organizationId: string;
  readonly entityType: WosEntityType;
  readonly sourceId: string;
  readonly sourceRevision: number;
  readonly sourceVersionLabel: string;
  readonly workflowStatus: string;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
}

interface WosReceiptShape {
  readonly receiptId: string;
  readonly organizationId: string;
  readonly entityType: WosEntityType;
  readonly submissionId: string;
  readonly sourceId: string;
  readonly sourceRevision: number;
  readonly sourceVersionLabel: string;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly status: string;
}

interface WosInboxFactShape {
  readonly inboxTaskId: string;
  readonly organizationId: string;
  readonly entityType: WosEntityType;
  readonly submissionId: string;
  readonly sourceId: string;
  readonly sourceRevision: number;
  readonly sourceVersionLabel: string;
  readonly idempotencyKey: string;
  readonly workflowStatus: string;
}

interface WosAuditFactShape {
  readonly auditEventId: string;
  readonly organizationId: string;
  readonly entityType: WosEntityType;
  readonly submissionId: string;
  readonly sourceId: string;
  readonly sourceRevision: number;
  readonly sourceVersionLabel: string;
  readonly idempotencyKey: string;
  readonly eventType: string;
}

interface WosReplayShape {
  readonly submissionId: string;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
}

interface WosAtomicSubmissionEvidenceShape {
  readonly evidenceVersion: typeof WOS_ATOMIC_SUBMISSION_EVIDENCE_VERSION;
  readonly source: string;
  readonly organizationId: string;
  readonly actor: WosAtomicSubmissionActorShape;
  readonly entityType: WosEntityType;
  readonly expectedVersion: number;
  readonly fingerprint: string;
  readonly submission: WosAtomicSubmissionRecordShape;
  readonly facts: {
    readonly receipts: readonly WosReceiptShape[];
    readonly inbox: readonly WosInboxFactShape[];
    readonly audit: readonly WosAuditFactShape[];
  };
  readonly counts: {
    readonly receipts: number;
    readonly inbox: number;
    readonly audit: number;
  };
  readonly replay: WosReplayShape | null;
  readonly transactionCommitted: boolean;
}

const BLOCKER_MESSAGES: Readonly<
  Record<WosAtomicSubmissionBlockerCode, string>
> = {
  INVALID_SHAPE: '证据 JSON 形状无效或不完整',
  ORGANIZATION_MISMATCH: '提交、人员和事实的组织不一致',
  PROFILE_INACTIVE: '提交人员档案未启用',
  PROFILE_ROLE_NOT_ALLOWED: '办公室提交角色不被允许',
  ENTITY_TYPE_MISMATCH: '生产单与打样申请入口或事实类型不一致',
  STALE_VERSION: '提交版本与期望版本或事实版本不一致',
  FINGERPRINT_MISMATCH: '提交指纹与事实指纹不一致',
  REPLAY_CONTENT_MISMATCH: '幂等重放内容与原始提交不一致',
  COUNT_MISMATCH: '声明的回执、Inbox 或审计数量与实际数组不一致',
  DUPLICATE_RECEIPT_ID: '回执 ID 重复',
  DUPLICATE_INBOX_ID: 'Inbox 任务 ID 重复',
  DUPLICATE_AUDIT_ID: '审计事件 ID 重复',
  NON_ATOMIC_FACTS: '必须恰好存在同一提交的一条回执、一条 Inbox 和一条审计事实',
  UNTRUSTED_FACT_MISMATCH: '回执、Inbox 或审计事实与提交身份不一致',
};

const ENTITY_TYPES = new Set<string>([
  'PRODUCTION_ORDER',
  'SAMPLING_REQUEST',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isEntityType(value: unknown): value is WosEntityType {
  return typeof value === 'string' && ENTITY_TYPES.has(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isActorShape(value: unknown): value is WosAtomicSubmissionActorShape {
  return isRecord(value)
    && isText(value.profileId)
    && isText(value.organizationId)
    && isText(value.role)
    && typeof value.isActive === 'boolean';
}

function isSubmissionShape(
  value: unknown,
): value is WosAtomicSubmissionRecordShape {
  return isRecord(value)
    && isText(value.submissionId)
    && isText(value.organizationId)
    && isEntityType(value.entityType)
    && isText(value.sourceId)
    && isPositiveInteger(value.sourceRevision)
    && isText(value.sourceVersionLabel)
    && isText(value.workflowStatus)
    && isText(value.idempotencyKey)
    && isText(value.fingerprint);
}

function isReceiptShape(value: unknown): value is WosReceiptShape {
  return isRecord(value)
    && isText(value.receiptId)
    && isText(value.organizationId)
    && isEntityType(value.entityType)
    && isText(value.submissionId)
    && isText(value.sourceId)
    && isPositiveInteger(value.sourceRevision)
    && isText(value.sourceVersionLabel)
    && isText(value.idempotencyKey)
    && isText(value.fingerprint)
    && isText(value.status);
}

function isInboxShape(value: unknown): value is WosInboxFactShape {
  return isRecord(value)
    && isText(value.inboxTaskId)
    && isText(value.organizationId)
    && isEntityType(value.entityType)
    && isText(value.submissionId)
    && isText(value.sourceId)
    && isPositiveInteger(value.sourceRevision)
    && isText(value.sourceVersionLabel)
    && isText(value.idempotencyKey)
    && isText(value.workflowStatus);
}

function isAuditShape(value: unknown): value is WosAuditFactShape {
  return isRecord(value)
    && isText(value.auditEventId)
    && isText(value.organizationId)
    && isEntityType(value.entityType)
    && isText(value.submissionId)
    && isText(value.sourceId)
    && isPositiveInteger(value.sourceRevision)
    && isText(value.sourceVersionLabel)
    && isText(value.idempotencyKey)
    && isText(value.eventType);
}

function isReplayShape(value: unknown): value is WosReplayShape {
  return isRecord(value)
    && isText(value.submissionId)
    && isText(value.idempotencyKey)
    && isText(value.fingerprint);
}

function parseEvidenceShape(value: unknown): WosAtomicSubmissionEvidenceShape | null {
  if (!isRecord(value)
    || value.evidenceVersion !== WOS_ATOMIC_SUBMISSION_EVIDENCE_VERSION
    || !isText(value.source)
    || !isText(value.organizationId)
    || !isActorShape(value.actor)
    || !isEntityType(value.entityType)
    || !isPositiveInteger(value.expectedVersion)
    || !isText(value.fingerprint)
    || !isSubmissionShape(value.submission)
    || !isRecord(value.facts)
    || !Array.isArray(value.facts.receipts)
    || !value.facts.receipts.every(isReceiptShape)
    || !Array.isArray(value.facts.inbox)
    || !value.facts.inbox.every(isInboxShape)
    || !Array.isArray(value.facts.audit)
    || !value.facts.audit.every(isAuditShape)
    || !isRecord(value.counts)
    || !isNonNegativeInteger(value.counts.receipts)
    || !isNonNegativeInteger(value.counts.inbox)
    || !isNonNegativeInteger(value.counts.audit)
    || !(value.replay === null || isReplayShape(value.replay))
    || typeof value.transactionCommitted !== 'boolean') {
    return null;
  }
  return value as unknown as WosAtomicSubmissionEvidenceShape;
}

function addBlocker(
  blockers: WosAtomicSubmissionBlocker[],
  code: WosAtomicSubmissionBlockerCode,
): void {
  if (blockers.some((blocker) => blocker.code === code)) return;
  blockers.push({ code, message: BLOCKER_MESSAGES[code] });
}

function duplicateIds(ids: readonly string[]): boolean {
  return new Set(ids).size !== ids.length;
}

function factIdentityMatches(
  fact: {
    readonly organizationId: string;
    readonly entityType: WosEntityType;
    readonly submissionId: string;
    readonly sourceId: string;
    readonly sourceRevision: number;
    readonly sourceVersionLabel: string;
    readonly idempotencyKey: string;
  },
  evidence: WosAtomicSubmissionEvidenceShape,
): boolean {
  return fact.organizationId === evidence.organizationId
    && fact.entityType === evidence.entityType
    && fact.submissionId === evidence.submission.submissionId
    && fact.sourceId === evidence.submission.sourceId
    && fact.sourceRevision === evidence.expectedVersion
    && fact.sourceVersionLabel === evidence.submission.sourceVersionLabel
    && fact.idempotencyKey === evidence.submission.idempotencyKey;
}

function validateConsistency(
  evidence: WosAtomicSubmissionEvidenceShape,
): readonly WosAtomicSubmissionBlocker[] {
  const blockers: WosAtomicSubmissionBlocker[] = [];
  const { actor, submission, facts, counts, replay } = evidence;

  if (evidence.organizationId !== actor.organizationId
    || evidence.organizationId !== submission.organizationId
    || facts.receipts.some(
      (fact) => fact.organizationId !== evidence.organizationId,
    )
    || facts.inbox.some(
      (fact) => fact.organizationId !== evidence.organizationId,
    )
    || facts.audit.some(
      (fact) => fact.organizationId !== evidence.organizationId,
    )) {
    addBlocker(blockers, 'ORGANIZATION_MISMATCH');
  }

  if (actor.isActive !== true) {
    addBlocker(blockers, 'PROFILE_INACTIVE');
  }
  if (!canSubmitWosOfficeRequest(actor.role)) {
    addBlocker(blockers, 'PROFILE_ROLE_NOT_ALLOWED');
  }

  if (submission.entityType !== evidence.entityType
    || facts.receipts.some((fact) => fact.entityType !== evidence.entityType)
    || facts.inbox.some((fact) => fact.entityType !== evidence.entityType)
    || facts.audit.some((fact) => fact.entityType !== evidence.entityType)) {
    addBlocker(blockers, 'ENTITY_TYPE_MISMATCH');
  }

  if (submission.sourceRevision !== evidence.expectedVersion
    || facts.receipts.some(
      (fact) => fact.sourceRevision !== evidence.expectedVersion,
    )
    || facts.inbox.some(
      (fact) => fact.sourceRevision !== evidence.expectedVersion,
    )
    || facts.audit.some(
      (fact) => fact.sourceRevision !== evidence.expectedVersion,
    )) {
    addBlocker(blockers, 'STALE_VERSION');
  }

  if (submission.fingerprint !== evidence.fingerprint
    || facts.receipts.some(
      (fact) => fact.fingerprint !== evidence.fingerprint,
    )) {
    addBlocker(blockers, 'FINGERPRINT_MISMATCH');
  }

  if (replay
    && (replay.submissionId !== submission.submissionId
      || replay.idempotencyKey !== submission.idempotencyKey
      || replay.fingerprint !== evidence.fingerprint)) {
    addBlocker(blockers, 'REPLAY_CONTENT_MISMATCH');
  }

  if (counts.receipts !== facts.receipts.length
    || counts.inbox !== facts.inbox.length
    || counts.audit !== facts.audit.length) {
    addBlocker(blockers, 'COUNT_MISMATCH');
  }

  if (duplicateIds(facts.receipts.map((fact) => fact.receiptId))) {
    addBlocker(blockers, 'DUPLICATE_RECEIPT_ID');
  }
  if (duplicateIds(facts.inbox.map((fact) => fact.inboxTaskId))) {
    addBlocker(blockers, 'DUPLICATE_INBOX_ID');
  }
  if (duplicateIds(facts.audit.map((fact) => fact.auditEventId))) {
    addBlocker(blockers, 'DUPLICATE_AUDIT_ID');
  }

  if (facts.receipts.length !== 1
    || facts.inbox.length !== 1
    || facts.audit.length !== 1) {
    addBlocker(blockers, 'NON_ATOMIC_FACTS');
  }

  if (submission.workflowStatus !== 'SUBMITTED'
    || facts.receipts.some(
      (fact) => !factIdentityMatches(fact, evidence) || fact.status !== 'COMMITTED',
    )
    || facts.inbox.some(
      (fact) => !factIdentityMatches(fact, evidence)
        || fact.workflowStatus !== 'SUBMITTED',
    )
    || facts.audit.some(
      (fact) => !factIdentityMatches(fact, evidence)
        || fact.eventType !== 'OFFICE_SUBMISSION_COMMITTED',
    )) {
    addBlocker(blockers, 'UNTRUSTED_FACT_MISMATCH');
  }

  return blockers;
}

export function evaluateWosAtomicSubmissionEvidence(
  value: unknown,
): WosAtomicSubmissionEvidenceDecision {
  const evidence = parseEvidenceShape(value);
  if (!evidence) {
    return {
      status: 'REJECTED',
      evidenceShapeConsistent: false,
      persisted: false,
      databaseCommitVerified: false,
      productionChanged: false,
      serverVerification: 'NOT_PERFORMED',
      blockers: [{
        code: 'INVALID_SHAPE',
        message: BLOCKER_MESSAGES.INVALID_SHAPE,
      }],
    };
  }

  const blockers = validateConsistency(evidence);
  if (blockers.length > 0) {
    return {
      status: 'REJECTED',
      evidenceShapeConsistent: false,
      persisted: false,
      databaseCommitVerified: false,
      productionChanged: false,
      serverVerification: 'NOT_PERFORMED',
      blockers,
    };
  }

  // A self-consistent browser payload is still only an assertion. Do not
  // promote its source string, IDs, counts, fingerprint, or commit flag into
  // trusted persistence proof.
  return {
    status: WOS_ATOMIC_SUBMISSION_PENDING_STATUS,
    evidenceShapeConsistent: true,
    persisted: false,
    databaseCommitVerified: false,
    productionChanged: false,
    serverVerification: 'REQUIRED',
    blockers: [],
  };
}

// Kept as a compatibility name for callers that describe this step as
// validation. The result is deliberately a pending decision, never a commit.
export const validateWosAtomicSubmissionEvidence =
  evaluateWosAtomicSubmissionEvidence;
