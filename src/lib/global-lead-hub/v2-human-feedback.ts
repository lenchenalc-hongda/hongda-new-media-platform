import {
  GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION,
  GLH_V2_INQUIRY_FIELDS,
  validateGlhV2InquiryEvidence,
  type GlhV2EvidenceDraft,
  type GlhV2InquiryField,
  type GlhV2SourceMessage,
} from './v2-inquiry-evidence';
import {
  GLH_V2_LLM_EXTRACTION_CANDIDATE_SCHEMA_VERSION,
  type GlhV2ExtractionCandidate,
} from './v2-llm-extraction-eval';

/**
 * Offline, append-only review of one V2 extraction candidate claim.
 *
 * A human classification is an auditable review result, not an authoritative
 * business fact. This module never writes GLH/CPC data, changes V1 grades, sends
 * messages, calls a model provider, or persists the returned history.
 */
export const GLH_V2_C_FEEDBACK_SCHEMA = 'GLH-V2-C-HUMAN-FEEDBACK-001' as const;
export const GLH_V2_C_CLASSIFICATIONS = [
  'ACCEPTED',
  'CORRECTED',
  'REJECTED',
  'NEEDS_FOLLOW_UP',
] as const;
export type GlhV2CReviewClassification =
  (typeof GLH_V2_C_CLASSIFICATIONS)[number];
export type GlhV2CHumanDecision = GlhV2CReviewClassification;
export type GlhV2CActorRole = 'admin' | 'manager' | 'sales';

export const GLH_V2_C_IMMUTABLE_AUDIT_MARKER =
  'APPEND_ONLY_IMMUTABLE' as const;
export const GLH_V2_C_PROVIDER_CALLS = 0 as const;
export const GLH_V2_C_REAL_MODEL_ACCURACY = 'NOT_MEASURED' as const;

export interface GlhV2CActor {
  readonly profileId: string;
  readonly organizationId: string;
  readonly role: GlhV2CActorRole;
  readonly isActive: boolean;
}

export interface GlhV2CScope {
  readonly organizationId: string;
  readonly inquiryId: string;
  readonly assignedSalesProfileId: string;
}

export interface GlhV2CCandidateVersions {
  /** Identity of this extraction candidate, independent of model/prompt versions. */
  readonly candidateVersion: string;
  /** Business baseline against which the human review was performed. */
  readonly baselineVersion: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly knowledgeVersion: string;
}

/**
 * The validated V2 extraction candidate envelope plus its immutable version
 * snapshot. The version snapshot lives on the candidate itself so there is
 * exactly one source of truth; the review layer never accepts a side-channel
 * version input that could relabel a candidate after it was validated.
 */
export interface GlhV2CReviewedCandidate extends GlhV2ExtractionCandidate {
  readonly versions: GlhV2CCandidateVersions;
}

/**
 * The reference is deliberately redundant with the candidate. A review fails
 * closed unless every field below exactly identifies one claim in the validated
 * candidate evidence.
 */
export interface GlhV2CCandidateClaimReference {
  readonly candidateVersion: string;
  readonly claimIndex: number;
  readonly field: GlhV2InquiryField;
  readonly sourceMessageId: string;
  readonly candidateValue: string;
}

export interface GlhV2CFeedbackCommand {
  readonly factId: string;
  readonly idempotencyKey: string;
  readonly candidateClaim: GlhV2CCandidateClaimReference;
  readonly classification: GlhV2CReviewClassification;
  /** Required only for CORRECTED; must differ from candidateValue. */
  readonly correctedValue: string | null;
  readonly reason: string;
  readonly supersedesFactId: string | null;
  readonly actorConfirmed: true;
}

export interface GlhV2CHumanFact extends GlhV2CCandidateVersions {
  readonly schemaVersion: typeof GLH_V2_C_FEEDBACK_SCHEMA;
  readonly immutableAuditMarker: typeof GLH_V2_C_IMMUTABLE_AUDIT_MARKER;
  readonly organizationId: string;
  readonly inquiryId: string;
  readonly assignedSalesProfileId: string;
  readonly factId: string;
  readonly idempotencyKey: string;
  readonly candidateClaimId: string;
  readonly candidateClaimIndex: number;
  readonly field: GlhV2InquiryField;
  readonly sourceMessageId: string;
  readonly sourceExcerpt: string | null;
  readonly sourceConfidence: number;
  readonly beforeValue: string;
  readonly afterValue: string | null;
  readonly classification: GlhV2CReviewClassification;
  readonly reason: string;
  readonly supersedesFactId: string | null;
  readonly reviewedByProfileId: string;
  readonly reviewedByRole: GlhV2CActorRole;
  readonly reviewedAt: string;
  readonly actorConfirmed: true;
  readonly humanConfirmed: true;
  /** The accepted/corrected value remains a draft and is not business truth. */
  readonly reviewOnly: true;
  readonly authoritativeBusinessFact: false;
}

export type GlhV2CRejectCode =
  | 'UNTRUSTED_SCOPE'
  | 'UNAUTHORIZED_REVIEWER'
  | 'INVALID_COMMAND'
  | 'INVALID_CANDIDATE'
  | 'INVALID_SOURCE'
  | 'UNTRUSTED_HISTORY'
  | 'IDEMPOTENCY_CONFLICT'
  | 'STALE_CORRECTION'
  | 'CANDIDATE_MISMATCH'
  | 'CANDIDATE_VERSION_MISMATCH';

export type GlhV2CReviewResult =
  | {
    readonly ok: true;
    readonly action: 'APPENDED';
    readonly fact: GlhV2CHumanFact;
    readonly history: readonly GlhV2CHumanFact[];
    readonly current: GlhV2CHumanFact;
    readonly legacyGradeUntouched: true;
    readonly cpcWriteAllowed: false;
    readonly authoritativeWriteAllowed: false;
    readonly autoDiscardAllowed: false;
    readonly customerFacingAutoSendAllowed: false;
    readonly providerCalls: 0;
    readonly realModelAccuracy: 'NOT_MEASURED';
  }
  | {
    readonly ok: false;
    readonly code: GlhV2CRejectCode;
    readonly history: readonly GlhV2CHumanFact[];
  };

export interface GlhV2CQualityDimensions {
  readonly completeness: {
    readonly knownFields: number;
    readonly targetFields: number;
    readonly needsVerification: true;
  };
  readonly fit: 'REVIEW_REQUIRED';
  readonly intent: 'REVIEW_REQUIRED';
  readonly useForGrade: false;
  readonly automaticallyRejectLead: false;
  readonly humanReviewRequired: true;
  readonly authoritativeWriteAllowed: false;
  readonly providerCalls: 0;
  readonly realModelAccuracy: 'NOT_MEASURED';
}

export interface GlhV2CReviewInput {
  readonly actor: GlhV2CActor;
  readonly scope: GlhV2CScope;
  /** Trusted, server-sourced original conversation messages. */
  readonly sourceMessages: readonly GlhV2SourceMessage[];
  readonly existingHistory: readonly GlhV2CHumanFact[];
  /** Exactly one validated candidate carrying the referenced claim and version snapshot. */
  readonly candidate: GlhV2CReviewedCandidate;
  readonly command: GlhV2CFeedbackCommand;
  readonly trustedReviewedAt: string;
}

const REQUIRED_FIELDS = [
  'product',
  'material',
  'quantity',
  'country',
  'requirementType',
  'purchaseTimeline',
] as const;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^[A-Za-z0-9._:-]{1,128}$/;
const CLASSIFICATIONS = new Set<string>(GLH_V2_C_CLASSIFICATIONS);
const ROLES = new Set<string>(['admin', 'manager', 'sales']);
const FIELDS = new Set<string>(GLH_V2_INQUIRY_FIELDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function id(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

function txt(value: unknown, max: number): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= max;
}

function version(value: unknown): value is string {
  return typeof value === 'string' && VERSION.test(value);
}

function validClassifier(value: unknown): value is GlhV2CReviewClassification {
  return typeof value === 'string' && CLASSIFICATIONS.has(value);
}

function validTime(value: unknown): value is string {
  if (typeof value !== 'string'
    || value.length > 40
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const canonical = new Date(parsed).toISOString();
  return canonical === value || canonical.replace('.000Z', 'Z') === value;
}

function validConfidence(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && value <= 1;
}

function validVersions(value: unknown): value is GlhV2CCandidateVersions {
  return isRecord(value)
    && version(value.candidateVersion)
    && version(value.baselineVersion)
    && version(value.modelId)
    && version(value.modelVersion)
    && version(value.promptVersion)
    && version(value.knowledgeVersion);
}

function reject(
  code: GlhV2CRejectCode,
  history: readonly GlhV2CHumanFact[],
): GlhV2CReviewResult {
  return { ok: false, code, history };
}

function scopeIsWellFormed(scope: unknown): scope is GlhV2CScope {
  return isRecord(scope)
    && id(scope.organizationId)
    && id(scope.inquiryId)
    && id(scope.assignedSalesProfileId);
}

function authorized(actor: unknown, scope: GlhV2CScope): actor is GlhV2CActor {
  return isRecord(actor)
    && id(actor.profileId)
    && id(actor.organizationId)
    && actor.organizationId === scope.organizationId
    && actor.isActive === true
    && typeof actor.role === 'string'
    && ROLES.has(actor.role)
    && (actor.role !== 'sales'
      || actor.profileId === scope.assignedSalesProfileId);
}

function trustedCorpusIsValid(
  messages: unknown,
  scope: GlhV2CScope,
): boolean {
  if (!Array.isArray(messages) || messages.length > 200) return false;
  return validateGlhV2InquiryEvidence({
    schemaVersion: GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION,
    inquiryId: scope.inquiryId,
    claims: [],
  }, messages, scope).ok;
}

function candidateIsValid(
  value: unknown,
  messages: readonly GlhV2SourceMessage[],
  scope: GlhV2CScope,
): value is GlhV2CReviewedCandidate {
  if (!isRecord(value)
    || value.schemaVersion !== GLH_V2_LLM_EXTRACTION_CANDIDATE_SCHEMA_VERSION
    || value.reviewOnly !== true
    || !validVersions(value.versions)
    || !isRecord(value.evidence)) return false;
  const evidence = value.evidence;
  if (evidence.schemaVersion !== GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION
    || evidence.inquiryId !== scope.inquiryId
    || evidence.organizationId !== scope.organizationId
    || evidence.humanReviewRequired !== true
    || evidence.customerFacingAutoSendAllowed !== false
    || evidence.authoritativeWriteAllowed !== false
    || evidence.legacyGradeUntouched !== true) return false;
  return validateGlhV2InquiryEvidence(evidence, messages, scope).ok;
}

function validClaimReference(
  value: unknown,
): value is GlhV2CCandidateClaimReference {
  return isRecord(value)
    && version(value.candidateVersion)
    && typeof value.claimIndex === 'number'
    && Number.isInteger(value.claimIndex)
    && value.claimIndex >= 0
    && value.claimIndex <= 49
    && typeof value.field === 'string'
    && FIELDS.has(value.field)
    && txt(value.sourceMessageId, 128)
    && txt(value.candidateValue, 300);
}

function validCommand(
  value: unknown,
): value is GlhV2CFeedbackCommand {
  if (!isRecord(value)
    || !id(value.factId)
    || !id(value.idempotencyKey)
    || !validClaimReference(value.candidateClaim)
    || !validClassifier(value.classification)
    || !txt(value.reason, 2000)
    || (value.supersedesFactId !== null && !id(value.supersedesFactId))
    || value.actorConfirmed !== true) return false;

  if (value.classification === 'CORRECTED') {
    return txt(value.correctedValue, 300)
      && value.correctedValue.trim() !== value.candidateClaim.candidateValue;
  }
  return value.correctedValue === null || value.correctedValue === undefined;
}

function reviewedAfterValue(
  command: GlhV2CFeedbackCommand,
): string | null {
  if (command.classification === 'ACCEPTED') {
    return command.candidateClaim.candidateValue;
  }
  if (command.classification === 'CORRECTED') {
    return command.correctedValue!.trim();
  }
  return null;
}

function classificationValueIsValid(fact: GlhV2CHumanFact): boolean {
  if (fact.classification === 'ACCEPTED') {
    return fact.afterValue === fact.beforeValue;
  }
  if (fact.classification === 'CORRECTED') {
    return txt(fact.afterValue, 300)
      && fact.afterValue !== fact.beforeValue;
  }
  return fact.afterValue === null;
}

function historyEvidence(
  fact: GlhV2CHumanFact,
): GlhV2EvidenceDraft {
  return {
    schemaVersion: GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION,
    inquiryId: fact.inquiryId,
    organizationId: fact.organizationId,
    claims: [{
      field: fact.field,
      value: fact.beforeValue,
      sourceMessageId: fact.sourceMessageId,
      excerpt: fact.sourceExcerpt,
      confidence: fact.sourceConfidence,
      needsVerification: true,
    }],
    humanReviewRequired: true,
    customerFacingAutoSendAllowed: false,
    authoritativeWriteAllowed: false,
    legacyGradeUntouched: true,
  };
}

/**
 * Every supersession chain is one candidate claim with one immutable version
 * snapshot. A later fact must not drift to another field, source message, claim
 * identity, or version snapshot, otherwise a valid fact for another
 * field/source/candidate could masquerade as a correction of the first one.
 */
function sameClaimSnapshot(
  previous: GlhV2CHumanFact,
  fact: GlhV2CHumanFact,
): boolean {
  return fact.candidateClaimId === previous.candidateClaimId
    && fact.field === previous.field
    && fact.sourceMessageId === previous.sourceMessageId
    && fact.candidateVersion === previous.candidateVersion
    && fact.baselineVersion === previous.baselineVersion
    && fact.modelId === previous.modelId
    && fact.modelVersion === previous.modelVersion
    && fact.promptVersion === previous.promptVersion
    && fact.knowledgeVersion === previous.knowledgeVersion;
}

function safeHistory(
  history: unknown,
  messages: readonly GlhV2SourceMessage[],
  scope: GlhV2CScope,
): history is readonly GlhV2CHumanFact[] {
  if (!Array.isArray(history) || history.length > 500) return false;
  const seenFacts = new Set<string>();
  const seenKeys = new Set<string>();

  for (let index = 0; index < history.length; index++) {
    const value = history[index];
    if (!isRecord(value)) return false;
    const fact = value as unknown as GlhV2CHumanFact;
    if (fact.schemaVersion !== GLH_V2_C_FEEDBACK_SCHEMA
      || fact.immutableAuditMarker !== GLH_V2_C_IMMUTABLE_AUDIT_MARKER
      || fact.organizationId !== scope.organizationId
      || fact.inquiryId !== scope.inquiryId
      || fact.assignedSalesProfileId !== scope.assignedSalesProfileId
      || !id(fact.factId)
      || !id(fact.idempotencyKey)
      || !txt(fact.candidateClaimId, 300)
      || !Number.isInteger(fact.candidateClaimIndex)
      || fact.candidateClaimIndex < 0
      || fact.candidateClaimIndex > 49
      || typeof fact.field !== 'string'
      || !FIELDS.has(fact.field)
      || !txt(fact.sourceMessageId, 128)
      || (fact.sourceExcerpt !== null && !txt(fact.sourceExcerpt, 400))
      || !validConfidence(fact.sourceConfidence)
      || !txt(fact.beforeValue, 300)
      || !validClassifier(fact.classification)
      || !classificationValueIsValid(fact)
      || !txt(fact.reason, 2000)
      || !id(fact.reviewedByProfileId)
      || typeof fact.reviewedByRole !== 'string'
      || !ROLES.has(fact.reviewedByRole)
      || (fact.reviewedByRole === 'sales'
        && fact.reviewedByProfileId !== scope.assignedSalesProfileId)
      || !validTime(fact.reviewedAt)
      || fact.actorConfirmed !== true
      || fact.humanConfirmed !== true
      || fact.reviewOnly !== true
      || fact.authoritativeBusinessFact !== false
      || !validVersions(fact)
      || fact.candidateClaimId
        !== `${fact.candidateVersion}:${fact.candidateClaimIndex}`
      || seenFacts.has(fact.factId)
      || seenKeys.has(fact.idempotencyKey)
      || (index === 0
        ? fact.supersedesFactId !== null
        : fact.supersedesFactId !== history[index - 1].factId)) return false;

    if (index > 0
      && !sameClaimSnapshot(
        history[index - 1] as unknown as GlhV2CHumanFact,
        fact,
      )) return false;

    if (!validateGlhV2InquiryEvidence(
      historyEvidence(fact),
      messages,
      scope,
    ).ok) return false;

    seenFacts.add(fact.factId);
    seenKeys.add(fact.idempotencyKey);
  }
  return true;
}

/**
 * Validate the trusted source corpus and candidate evidence before calculating
 * an advisory completeness count. A field count is never evidence that the
 * model interpreted the message correctly.
 */
export function proposeGlhV2CQualityDimensions(
  evidence: GlhV2EvidenceDraft | null,
  sourceMessages: readonly GlhV2SourceMessage[],
  scope: GlhV2CScope,
): GlhV2CQualityDimensions | null {
  if (!scopeIsWellFormed(scope)
    || !trustedCorpusIsValid(sourceMessages, scope)
    || !isRecord(evidence)
    || evidence.schemaVersion !== GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION
    || evidence.humanReviewRequired !== true
    || evidence.customerFacingAutoSendAllowed !== false
    || evidence.authoritativeWriteAllowed !== false
    || evidence.legacyGradeUntouched !== true) return null;

  const validated = validateGlhV2InquiryEvidence(
    evidence,
    sourceMessages,
    scope,
  );
  if (!validated.ok) return null;

  const observed = new Set<string>();
  for (const claim of validated.data.claims) {
    if ((REQUIRED_FIELDS as readonly string[]).includes(claim.field)) {
      observed.add(claim.field);
    }
  }
  return {
    completeness: {
      knownFields: observed.size,
      targetFields: REQUIRED_FIELDS.length,
      needsVerification: true,
    },
    fit: 'REVIEW_REQUIRED',
    intent: 'REVIEW_REQUIRED',
    useForGrade: false,
    automaticallyRejectLead: false,
    humanReviewRequired: true,
    authoritativeWriteAllowed: false,
    providerCalls: 0,
    realModelAccuracy: 'NOT_MEASURED',
  };
}

/**
 * Append one human review draft. Reusing an idempotency key is always rejected,
 * including when the payload is identical, so callers cannot confuse a retry
 * with a new append-only audit event.
 */
export function reviewGlhV2CQuality(
  input: GlhV2CReviewInput,
): GlhV2CReviewResult {
  if (!input || typeof input !== 'object') {
    return reject('INVALID_COMMAND', []);
  }
  if (!Array.isArray(input.existingHistory)) {
    return reject('UNTRUSTED_HISTORY', []);
  }
  const existingHistory = input.existingHistory;
  if (!scopeIsWellFormed(input.scope)) {
    return reject('UNTRUSTED_SCOPE', existingHistory);
  }
  if (!authorized(input.actor, input.scope)) {
    return reject('UNAUTHORIZED_REVIEWER', existingHistory);
  }
  if (!trustedCorpusIsValid(input.sourceMessages, input.scope)) {
    return reject('INVALID_SOURCE', existingHistory);
  }
  if (!safeHistory(existingHistory, input.sourceMessages, input.scope)) {
    return reject('UNTRUSTED_HISTORY', existingHistory);
  }
  if (!validCommand(input.command)) {
    return reject('INVALID_COMMAND', existingHistory);
  }
  if (!validTime(input.trustedReviewedAt)) {
    return reject('INVALID_COMMAND', existingHistory);
  }
  if (!candidateIsValid(input.candidate, input.sourceMessages, input.scope)) {
    return reject('INVALID_CANDIDATE', existingHistory);
  }

  const candidate = input.candidate;
  const candidateVersions = candidate.versions;
  const command = input.command;
  if (command.candidateClaim.candidateVersion
    !== candidateVersions.candidateVersion) {
    return reject('CANDIDATE_VERSION_MISMATCH', existingHistory);
  }
  const candidateClaims = candidate.evidence.claims;
  const candidateClaim = candidateClaims[command.candidateClaim.claimIndex];
  if (!candidateClaim
    || command.candidateClaim.field !== candidateClaim.field
    || command.candidateClaim.sourceMessageId !== candidateClaim.sourceMessageId
    || command.candidateClaim.candidateValue !== candidateClaim.value) {
    return reject('CANDIDATE_MISMATCH', existingHistory);
  }

  if (existingHistory.some(fact =>
    fact.idempotencyKey === command.idempotencyKey
  )) {
    return reject('IDEMPOTENCY_CONFLICT', existingHistory);
  }
  if (existingHistory.some(fact => fact.factId === command.factId)) {
    return reject('IDEMPOTENCY_CONFLICT', existingHistory);
  }

  const latest = existingHistory.at(-1);
  const candidateClaimId =
    `${candidateVersions.candidateVersion}:${command.candidateClaim.claimIndex}`;
  if ((latest
    ? command.supersedesFactId !== latest.factId
    : command.supersedesFactId !== null)) {
    return reject('STALE_CORRECTION', existingHistory);
  }
  if (latest && (latest.field !== candidateClaim.field
    || latest.sourceMessageId !== candidateClaim.sourceMessageId)) {
    return reject('CANDIDATE_MISMATCH', existingHistory);
  }
  if (latest && (
    latest.candidateVersion !== candidateVersions.candidateVersion
    || latest.baselineVersion !== candidateVersions.baselineVersion
    || latest.modelId !== candidateVersions.modelId
    || latest.modelVersion !== candidateVersions.modelVersion
    || latest.promptVersion !== candidateVersions.promptVersion
    || latest.knowledgeVersion !== candidateVersions.knowledgeVersion
  )) {
    return reject('CANDIDATE_VERSION_MISMATCH', existingHistory);
  }
  if (latest && latest.candidateClaimId !== candidateClaimId) {
    return reject('CANDIDATE_MISMATCH', existingHistory);
  }

  const fact: GlhV2CHumanFact = Object.freeze({
    schemaVersion: GLH_V2_C_FEEDBACK_SCHEMA,
    immutableAuditMarker: GLH_V2_C_IMMUTABLE_AUDIT_MARKER,
    organizationId: input.scope.organizationId,
    inquiryId: input.scope.inquiryId,
    assignedSalesProfileId: input.scope.assignedSalesProfileId,
    factId: command.factId,
    idempotencyKey: command.idempotencyKey,
    candidateClaimId,
    candidateClaimIndex: command.candidateClaim.claimIndex,
    field: candidateClaim.field,
    sourceMessageId: candidateClaim.sourceMessageId,
    sourceExcerpt: candidateClaim.excerpt,
    sourceConfidence: candidateClaim.confidence,
    beforeValue: candidateClaim.value,
    afterValue: reviewedAfterValue(command),
    classification: command.classification,
    reason: command.reason,
    supersedesFactId: command.supersedesFactId,
    reviewedByProfileId: input.actor.profileId,
    reviewedByRole: input.actor.role,
    reviewedAt: input.trustedReviewedAt,
    candidateVersion: candidateVersions.candidateVersion,
    baselineVersion: candidateVersions.baselineVersion,
    modelId: candidateVersions.modelId,
    modelVersion: candidateVersions.modelVersion,
    promptVersion: candidateVersions.promptVersion,
    knowledgeVersion: candidateVersions.knowledgeVersion,
    actorConfirmed: true,
    humanConfirmed: true,
    reviewOnly: true,
    authoritativeBusinessFact: false,
  });
  const history = Object.freeze([...existingHistory, fact]);
  return {
    ok: true,
    action: 'APPENDED',
    fact,
    history,
    current: fact,
    legacyGradeUntouched: true,
    cpcWriteAllowed: false,
    authoritativeWriteAllowed: false,
    autoDiscardAllowed: false,
    customerFacingAutoSendAllowed: false,
    providerCalls: 0,
    realModelAccuracy: 'NOT_MEASURED',
  };
}
