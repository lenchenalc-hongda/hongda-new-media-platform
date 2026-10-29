import type { GlhV2EvidenceDraft, GlhV2SourceMessage } from './v2-inquiry-evidence';

// Offline, review-only candidate facts. Never make authoritative GLH/CPC
// mutations or change existing A/B/C/D or CPC SS-N ratings.
export const GLH_V2_C_FEEDBACK_SCHEMA = 'GLH-V2-C-HUMAN-FEEDBACK-001' as const;
export const GLH_V2_C_DECISIONS = ['TRUE', 'FALSE', 'UNKNOWN'] as const;
export type GlhV2CHumanDecision = (typeof GLH_V2_C_DECISIONS)[number];
export type GlhV2CActorRole = 'admin' | 'manager' | 'sales';

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
export interface GlhV2CFeedbackCommand {
  readonly factId: string;
  readonly idempotencyKey: string;
  readonly decision: GlhV2CHumanDecision;
  readonly reason: string;
  readonly sourceMessageId: string;
  readonly supersedesFactId: string | null;
}
export interface GlhV2CHumanFact {
  readonly schemaVersion: typeof GLH_V2_C_FEEDBACK_SCHEMA;
  readonly organizationId: string;
  readonly inquiryId: string;
  readonly factId: string;
  readonly idempotencyKey: string;
  readonly decision: GlhV2CHumanDecision;
  readonly reason: string;
  readonly sourceMessageId: string;
  readonly supersedesFactId: string | null;
  readonly reviewedByProfileId: string;
  readonly reviewedAt: string;
  readonly humanConfirmed: true;
  readonly reviewOnly: true;
}
export type GlhV2CRejectCode =
  | 'UNTRUSTED_SCOPE' | 'UNAUTHORIZED_REVIEWER' | 'INVALID_COMMAND'
  | 'INVALID_SOURCE' | 'UNTRUSTED_HISTORY' | 'IDEMPOTENCY_CONFLICT'
  | 'STALE_CORRECTION';
export type GlhV2CReviewResult =
  | {
    readonly ok: true;
    readonly action: 'APPENDED' | 'REPLAYED';
    readonly fact: GlhV2CHumanFact;
    readonly history: readonly GlhV2CHumanFact[];
    readonly current: GlhV2CHumanFact;
    readonly legacyGradeUntouched: true;
    readonly cpcWriteAllowed: false;
    readonly autoDiscardAllowed: false;
    readonly customerFacingAutoSendAllowed: false;
  }
  | { readonly ok: false; readonly code: GlhV2CRejectCode; readonly history: readonly GlhV2CHumanFact[] };

export interface GlhV2CQualityDimensions {
  readonly completeness: { readonly knownFields: number; readonly targetFields: number; readonly needsVerification: true };
  readonly fit: 'REVIEW_REQUIRED';
  readonly intent: 'REVIEW_REQUIRED';
  readonly useForGrade: false;
  readonly automaticallyRejectLead: false;
  readonly humanReviewRequired: true;
}

const REQUIRED_FIELDS = ['product', 'material', 'quantity', 'country', 'requirementType', 'purchaseTimeline'] as const;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECISIONS = new Set<string>(GLH_V2_C_DECISIONS);
const ROLES = new Set<string>(['admin', 'manager', 'sales']);
function id(x: unknown): x is string { return typeof x === 'string' && ID.test(x); }
function txt(x: unknown, max: number): x is string {
  return typeof x === 'string' && x.trim().length > 0 && x.length <= max;
}
function validTime(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === new Date(Date.parse(value)).toISOString().replace('.000Z', 'Z');
}

function reject(code: GlhV2CRejectCode, history: readonly GlhV2CHumanFact[]): GlhV2CReviewResult {
  return { ok: false, code, history };
}

export function proposeGlhV2CQualityDimensions(
  evidence: GlhV2EvidenceDraft | null,
  scope: GlhV2CScope,
): GlhV2CQualityDimensions | null {
  if (!evidence || evidence.inquiryId !== scope.inquiryId
    || evidence.organizationId !== scope.organizationId
    || !Array.isArray(evidence.claims)) return null;
  const observed = new Set<string>();
  for (const claim of evidence.claims) {
    // Field existence is NOT proof that the model interpreted the original
    // message correctly. Only expose the number of suggested fields.
    if (claim.needsVerification !== true || !txt(claim.sourceMessageId, 128)) return null;
    if ((REQUIRED_FIELDS as readonly string[]).includes(claim.field)
      && txt(claim.value, 300)) observed.add(claim.field);
  }
  return {
    completeness: { knownFields: observed.size, targetFields: REQUIRED_FIELDS.length, needsVerification: true },
    fit: 'REVIEW_REQUIRED', intent: 'REVIEW_REQUIRED', useForGrade: false,
    automaticallyRejectLead: false, humanReviewRequired: true,
  };
}

function authorized(actor: GlhV2CActor, scope: GlhV2CScope): boolean {
  return id(actor.profileId) && id(actor.organizationId)
    && id(scope.organizationId) && id(scope.inquiryId) && id(scope.assignedSalesProfileId)
    && actor.organizationId === scope.organizationId && actor.isActive === true
    && ROLES.has(actor.role)
    && (actor.role !== 'sales' || actor.profileId === scope.assignedSalesProfileId);
}

function verifiedSource(
  messages: readonly GlhV2SourceMessage[],
  scope: GlhV2CScope,
  requiredId: string,
): boolean {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 200) return false;
  const seen = new Set<string>();
  let found = false;
  for (const msg of messages) {
    if (!msg || !txt(msg.id, 128) || seen.has(msg.id)
      || msg.organizationId !== scope.organizationId || msg.inquiryId !== scope.inquiryId
      || (msg.direction !== 'INBOUND' && msg.direction !== 'OUTBOUND')
      || (msg.kind !== 'TEXT' && msg.kind !== 'MEDIA')) return false;
    seen.add(msg.id);
    if (msg.id === requiredId && msg.direction === 'INBOUND') found = true;
  }
  return found;
}

function safeHistory(history: readonly GlhV2CHumanFact[], scope: GlhV2CScope): boolean {
  if (!Array.isArray(history) || history.length > 500) return false;
  const seenFacts = new Set<string>(), seenKeys = new Set<string>();
  for (let i = 0; i < history.length; i++) {
    const f = history[i];
    if (!f || f.schemaVersion !== GLH_V2_C_FEEDBACK_SCHEMA
      || f.organizationId !== scope.organizationId || f.inquiryId !== scope.inquiryId
      || !id(f.factId) || !id(f.idempotencyKey) || !id(f.reviewedByProfileId)
      || !txt(f.sourceMessageId, 128) || !txt(f.reason, 2000)
      || !DECISIONS.has(f.decision) || !validTime(f.reviewedAt)
      || f.humanConfirmed !== true || f.reviewOnly !== true
      || seenFacts.has(f.factId) || seenKeys.has(f.idempotencyKey)
      || (i === 0 ? f.supersedesFactId !== null : f.supersedesFactId !== history[i - 1].factId)) return false;
    seenFacts.add(f.factId); seenKeys.add(f.idempotencyKey);
  }
  return true;
}

/** Pure append-only human action. Trusted server must supply actor/scope/time. */
export function reviewGlhV2CQuality(input: {
  readonly actor: GlhV2CActor;
  readonly scope: GlhV2CScope;
  readonly sourceMessages: readonly GlhV2SourceMessage[];
  readonly existingHistory: readonly GlhV2CHumanFact[];
  readonly command: GlhV2CFeedbackCommand;
  readonly trustedReviewedAt: string;
}): GlhV2CReviewResult {
  const { actor, scope, existingHistory, command, sourceMessages, trustedReviewedAt } = input;
  if (!scope || !actor || !id(scope.organizationId) || !id(scope.inquiryId)) {
    return reject('UNTRUSTED_SCOPE', existingHistory ?? []);
  }
  if (!authorized(actor, scope)) return reject('UNAUTHORIZED_REVIEWER', existingHistory);
  if (!safeHistory(existingHistory, scope)) return reject('UNTRUSTED_HISTORY', existingHistory);
  if (!command || !id(command.factId) || !id(command.idempotencyKey)
    || !DECISIONS.has(command.decision) || !txt(command.reason, 2000)
    || !txt(command.sourceMessageId, 128)
    || (command.supersedesFactId !== null && !id(command.supersedesFactId))
    || !validTime(trustedReviewedAt)) return reject('INVALID_COMMAND', existingHistory);
  if (!verifiedSource(sourceMessages, scope, command.sourceMessageId)) {
    return reject('INVALID_SOURCE', existingHistory);
  }
  const priorKey = existingHistory.find(f => f.idempotencyKey === command.idempotencyKey);
  if (priorKey) {
    if (priorKey.factId !== command.factId || priorKey.decision !== command.decision
      || priorKey.reason !== command.reason || priorKey.sourceMessageId !== command.sourceMessageId
      || priorKey.supersedesFactId !== command.supersedesFactId
      || priorKey.reviewedByProfileId !== actor.profileId) {
      return reject('IDEMPOTENCY_CONFLICT', existingHistory);
    }
    return {
      ok: true, action: 'REPLAYED', fact: priorKey, history: existingHistory,
      current: existingHistory[existingHistory.length - 1],
      legacyGradeUntouched: true, cpcWriteAllowed: false,
      autoDiscardAllowed: false, customerFacingAutoSendAllowed: false,
    };
  }
  if (existingHistory.some(f => f.factId === command.factId)) {
    return reject('IDEMPOTENCY_CONFLICT', existingHistory);
  }
  const latest = existingHistory.at(-1);
  if (latest ? command.supersedesFactId !== latest.factId : command.supersedesFactId !== null) {
    return reject('STALE_CORRECTION', existingHistory);
  }
  const fact: GlhV2CHumanFact = Object.freeze({
    schemaVersion: GLH_V2_C_FEEDBACK_SCHEMA,
    organizationId: scope.organizationId,
    inquiryId: scope.inquiryId,
    factId: command.factId,
    idempotencyKey: command.idempotencyKey,
    decision: command.decision,
    reason: command.reason,
    sourceMessageId: command.sourceMessageId,
    supersedesFactId: command.supersedesFactId,
    reviewedByProfileId: actor.profileId,
    reviewedAt: trustedReviewedAt,
    humanConfirmed: true,
    reviewOnly: true,
  });
  return {
    ok: true, action: 'APPENDED', fact,
    history: Object.freeze([...existingHistory, fact]),
    current: fact, legacyGradeUntouched: true, cpcWriteAllowed: false,
    autoDiscardAllowed: false, customerFacingAutoSendAllowed: false,
  };
}
