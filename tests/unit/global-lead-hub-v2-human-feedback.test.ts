import assert from 'node:assert/strict';
import {
  GLH_V2_C_CLASSIFICATIONS,
  GLH_V2_C_FEEDBACK_SCHEMA,
  GLH_V2_C_IMMUTABLE_AUDIT_MARKER,
  proposeGlhV2CQualityDimensions,
  reviewGlhV2CQuality,
  type GlhV2CActor,
  type GlhV2CCandidateVersions,
  type GlhV2CFeedbackCommand,
  type GlhV2CHumanFact,
  type GlhV2CReviewedCandidate,
  type GlhV2CReviewInput,
  type GlhV2CScope,
} from '../../src/lib/global-lead-hub/v2-human-feedback';
import {
  GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION,
  type GlhV2SourceMessage,
} from '../../src/lib/global-lead-hub/v2-inquiry-evidence';
import {
  GLH_V2_LLM_EXTRACTION_CANDIDATE_SCHEMA_VERSION,
} from '../../src/lib/global-lead-hub/v2-llm-extraction-eval';

const org = '11111111-1111-4111-8111-111111111111';
const otherOrg = '22222222-2222-4222-8222-222222222222';
const inquiry = '33333333-3333-4333-8333-333333333333';
const otherInquiry = '33333333-3333-4333-8333-333333333334';
const salesA = '44444444-4444-4444-8444-444444444444';
const salesB = '55555555-5555-4555-8555-555555555555';
const managerId = '66666666-6666-4666-8666-666666666666';
const fact1 = '77777777-7777-4777-8777-777777777777';
const fact2 = '88888888-8888-4888-8888-888888888888';
const fact3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fact4 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const key1 = '99999999-9999-4999-8999-999999999999';
const key2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const key3 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const key4 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const scope: GlhV2CScope = {
  organizationId: org,
  inquiryId: inquiry,
  assignedSalesProfileId: salesA,
};
const actor: GlhV2CActor = {
  profileId: salesA,
  organizationId: org,
  role: 'sales',
  isActive: true,
};
const manager: GlhV2CActor = {
  profileId: managerId,
  organizationId: org,
  role: 'manager',
  isActive: true,
};
const sourceMessages: GlhV2SourceMessage[] = [
  {
    id: 'inbound-a',
    organizationId: org,
    inquiryId: inquiry,
    direction: 'INBOUND',
    kind: 'TEXT',
    text: 'We need PP heat transfer film.',
  },
  {
    id: 'inbound-b',
    organizationId: org,
    inquiryId: inquiry,
    direction: 'INBOUND',
    kind: 'TEXT',
    text: 'Delivery to Germany.',
  },
  {
    id: 'outbound-a',
    organizationId: org,
    inquiryId: inquiry,
    direction: 'OUTBOUND',
    kind: 'TEXT',
    text: 'Our sales team will review.',
  },
];

const candidateVersions: GlhV2CCandidateVersions = {
  candidateVersion: 'candidate-2026-10-30.1',
  baselineVersion: 'glh-business-baseline-v1',
  modelId: 'synthetic-model',
  modelVersion: 'synthetic-model-version-1',
  promptVersion: 'synthetic-prompt-v1',
  knowledgeVersion: 'synthetic-knowledge-v1',
};

const candidate: GlhV2CReviewedCandidate = {
  schemaVersion: GLH_V2_LLM_EXTRACTION_CANDIDATE_SCHEMA_VERSION,
  versions: candidateVersions,
  evidence: {
    schemaVersion: GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION,
    inquiryId: inquiry,
    organizationId: org,
    claims: [
      {
        field: 'material',
        value: 'PP',
        sourceMessageId: 'inbound-a',
        excerpt: 'PP',
        confidence: 0.95,
        needsVerification: true,
      },
      {
        field: 'country',
        value: 'Germany',
        sourceMessageId: 'inbound-b',
        excerpt: 'Germany',
        confidence: 0.9,
        needsVerification: true,
      },
    ],
    humanReviewRequired: true,
    customerFacingAutoSendAllowed: false,
    authoritativeWriteAllowed: false,
    legacyGradeUntouched: true,
  },
  intent: 'FILM',
  language: 'EN',
  classificationConfidence: { intent: 0.9, language: 0.9 },
  ambiguities: [],
  missingInformationSuggestions: [],
  reviewOnly: true,
};

const acceptedCommand: GlhV2CFeedbackCommand = {
  factId: fact1,
  idempotencyKey: key1,
  candidateClaim: {
    candidateVersion: candidateVersions.candidateVersion,
    claimIndex: 0,
    field: 'material',
    sourceMessageId: 'inbound-a',
    candidateValue: 'PP',
  },
  classification: 'ACCEPTED',
  correctedValue: null,
  reason: 'Sales confirmed the customer specified PP.',
  supersedesFactId: null,
  actorConfirmed: true,
};
const reviewTime = '2026-10-29T09:00:00Z';

function review(
  overrides: Partial<GlhV2CReviewInput> = {},
) {
  return reviewGlhV2CQuality({
    actor,
    scope,
    sourceMessages,
    existingHistory: [],
    candidate,
    command: acceptedCommand,
    trustedReviewedAt: reviewTime,
    ...overrides,
  });
}

function rejectCode(value: ReturnType<typeof review>, wanted: string) {
  assert.equal(value.ok, false);
  if (!value.ok) assert.equal(value.code, wanted);
}

assert.deepEqual(
  [...GLH_V2_C_CLASSIFICATIONS],
  ['ACCEPTED', 'CORRECTED', 'REJECTED', 'NEEDS_FOLLOW_UP'],
);

const first = review();
assert.equal(first.ok, true);
if (!first.ok) throw Error('expected first human-reviewed draft');
assert.equal(first.action, 'APPENDED');
assert.equal(first.fact.schemaVersion, GLH_V2_C_FEEDBACK_SCHEMA);
assert.equal(first.fact.immutableAuditMarker, GLH_V2_C_IMMUTABLE_AUDIT_MARKER);
assert.equal(first.fact.organizationId, org);
assert.equal(first.fact.inquiryId, inquiry);
assert.equal(first.fact.assignedSalesProfileId, salesA);
assert.equal(first.fact.reviewedByProfileId, salesA);
assert.equal(first.fact.field, 'material');
assert.equal(first.fact.candidateClaimIndex, 0);
assert.equal(first.fact.candidateClaimId, 'candidate-2026-10-30.1:0');
assert.equal(first.fact.sourceMessageId, 'inbound-a');
assert.equal(first.fact.sourceExcerpt, 'PP');
assert.equal(first.fact.beforeValue, 'PP');
assert.equal(first.fact.afterValue, 'PP');
assert.equal(first.fact.classification, 'ACCEPTED');
assert.equal(first.fact.candidateVersion, candidateVersions.candidateVersion);
assert.equal(first.fact.baselineVersion, candidateVersions.baselineVersion);
assert.equal(first.fact.modelId, candidateVersions.modelId);
assert.equal(first.fact.modelVersion, candidateVersions.modelVersion);
assert.equal(first.fact.promptVersion, candidateVersions.promptVersion);
assert.equal(first.fact.knowledgeVersion, candidateVersions.knowledgeVersion);
assert.equal(first.fact.actorConfirmed, true);
assert.equal(first.fact.humanConfirmed, true);
assert.equal(first.fact.reviewedAt, reviewTime);
assert.equal(first.fact.reason, acceptedCommand.reason);
assert.equal(first.fact.reviewOnly, true);
assert.equal(first.fact.authoritativeBusinessFact, false);
assert.equal(first.authoritativeWriteAllowed, false);
assert.equal(first.legacyGradeUntouched, true);
assert.equal(first.cpcWriteAllowed, false);
assert.equal(first.autoDiscardAllowed, false);
assert.equal(first.customerFacingAutoSendAllowed, false);
assert.equal(first.providerCalls, 0);
assert.equal(first.realModelAccuracy, 'NOT_MEASURED');
assert.equal(first.history.length, 1);
assert(Object.isFrozen(first.fact));
assert(Object.isFrozen(first.history));

// Reusing an idempotency key always fails, even with an identical payload.
rejectCode(
  review({ existingHistory: first.history }),
  'IDEMPOTENCY_CONFLICT',
);

const correctionCommand: GlhV2CFeedbackCommand = {
  factId: fact2,
  idempotencyKey: key2,
  candidateClaim: acceptedCommand.candidateClaim,
  classification: 'CORRECTED',
  correctedValue: 'ABS',
  reason: 'Assigned sales corrected the material after customer confirmation.',
  supersedesFactId: fact1,
  actorConfirmed: true,
};
const corrected = review({
  actor: manager,
  existingHistory: first.history,
  command: correctionCommand,
  trustedReviewedAt: '2026-10-29T09:30:00Z',
});
assert.equal(corrected.ok, true);
if (!corrected.ok) throw Error('expected corrected review');
assert.equal(corrected.current.classification, 'CORRECTED');
assert.equal(corrected.current.beforeValue, 'PP');
assert.equal(corrected.current.afterValue, 'ABS');
assert.equal(corrected.current.supersedesFactId, fact1);
assert.equal(corrected.history[0], first.fact);
assert.equal(first.history.length, 1, 'prior history must remain immutable');
rejectCode(
  review({
    existingHistory: corrected.history,
    command: correctionCommand,
  }),
  'IDEMPOTENCY_CONFLICT',
);

const rejected = review({
  command: {
    ...acceptedCommand,
    factId: fact3,
    idempotencyKey: key3,
    classification: 'REJECTED',
  },
});
assert.equal(rejected.ok, true);
if (!rejected.ok) throw Error('expected rejected review');
assert.equal(rejected.fact.afterValue, null);

const needsFollowUp = review({
  command: {
    ...acceptedCommand,
    factId: fact4,
    idempotencyKey: key4,
    classification: 'NEEDS_FOLLOW_UP',
  },
});
assert.equal(needsFollowUp.ok, true);
if (!needsFollowUp.ok) throw Error('expected follow-up review');
assert.equal(needsFollowUp.fact.afterValue, null);

// Reviewer and source scope failures.
rejectCode(review({ actor: { ...actor, profileId: salesB } }), 'UNAUTHORIZED_REVIEWER');
rejectCode(review({ actor: { ...actor, isActive: false } }), 'UNAUTHORIZED_REVIEWER');
rejectCode(review({ actor: { ...actor, organizationId: otherOrg } }), 'UNAUTHORIZED_REVIEWER');
rejectCode(review({ actor: { ...actor, profileId: managerId } }), 'UNAUTHORIZED_REVIEWER');
rejectCode(review({ scope: { ...scope, organizationId: otherOrg } }), 'UNAUTHORIZED_REVIEWER');
rejectCode(
  review({
    sourceMessages: [{ ...sourceMessages[0], organizationId: otherOrg }],
  }),
  'INVALID_SOURCE',
);
rejectCode(
  review({
    sourceMessages: [{ ...sourceMessages[0], inquiryId: otherInquiry }],
  }),
  'INVALID_SOURCE',
);
rejectCode(
  review({ sourceMessages: [sourceMessages[0], sourceMessages[0]] }),
  'INVALID_SOURCE',
);
rejectCode(
  review({
    sourceMessages: [sourceMessages[0], sourceMessages[1]],
    candidate: {
      ...candidate,
      evidence: {
        ...candidate.evidence,
        claims: [{
          ...candidate.evidence.claims[0],
          sourceMessageId: 'outbound-a',
        }],
      },
    },
  }),
  'INVALID_CANDIDATE',
);
rejectCode(
  review({
    candidate: {
      ...candidate,
      evidence: {
        ...candidate.evidence,
        claims: [{
          ...candidate.evidence.claims[0],
          sourceMessageId: 'made-up-message',
        }],
      },
    },
  }),
  'INVALID_CANDIDATE',
);
rejectCode(
  review({
    candidate: {
      ...candidate,
      evidence: {
        ...candidate.evidence,
        claims: [{
          ...candidate.evidence.claims[0],
          excerpt: 'not in the original message',
        }],
      },
    },
  }),
  'INVALID_CANDIDATE',
);

// Candidate claim and version references must match the validated candidate.
rejectCode(
  review({
    command: {
      ...acceptedCommand,
      candidateClaim: { ...acceptedCommand.candidateClaim, field: 'country' },
    },
  }),
  'CANDIDATE_MISMATCH',
);
rejectCode(
  review({
    command: {
      ...acceptedCommand,
      candidateClaim: { ...acceptedCommand.candidateClaim, candidateValue: 'ABS' },
    },
  }),
  'CANDIDATE_MISMATCH',
);
// Initial arbitrary version relabeling: the command may not relabel the
// candidate version away from the candidate envelope's immutable snapshot.
rejectCode(
  review({
    command: {
      ...acceptedCommand,
      candidateClaim: {
        ...acceptedCommand.candidateClaim,
        candidateVersion: 'candidate-other-v1',
      },
    },
  }),
  'CANDIDATE_VERSION_MISMATCH',
);
// Candidate-envelope mismatch: the envelope's version snapshot must agree with
// the command reference; a disagreement in either direction fails closed.
rejectCode(
  review({
    candidate: {
      ...candidate,
      versions: {
        ...candidateVersions,
        candidateVersion: 'candidate-other-v1',
      },
    },
  }),
  'CANDIDATE_VERSION_MISMATCH',
);
rejectCode(
  review({
    candidate: {
      ...candidate,
      versions: { ...candidateVersions, modelVersion: '' },
    },
  }),
  'INVALID_CANDIDATE',
);
rejectCode(
  review({
    existingHistory: first.history,
    command: correctionCommand,
    candidate: {
      ...candidate,
      versions: {
        ...candidateVersions,
        baselineVersion: 'different-baseline-v1',
      },
    },
  }),
  'CANDIDATE_VERSION_MISMATCH',
);

// A supersession chain must stay on one claim identity and one version
// snapshot. A valid fact for another field/source/candidate cannot masquerade
// as a correction of the first fact.
const mixedClaimHistory: GlhV2CHumanFact = {
  schemaVersion: GLH_V2_C_FEEDBACK_SCHEMA,
  immutableAuditMarker: GLH_V2_C_IMMUTABLE_AUDIT_MARKER,
  organizationId: org,
  inquiryId: inquiry,
  assignedSalesProfileId: salesA,
  factId: fact2,
  idempotencyKey: key2,
  candidateClaimId: 'candidate-2026-10-30.1:1',
  candidateClaimIndex: 1,
  field: 'country',
  sourceMessageId: 'inbound-b',
  sourceExcerpt: 'Germany',
  sourceConfidence: 0.9,
  beforeValue: 'Germany',
  afterValue: 'Germany',
  classification: 'ACCEPTED',
  reason: 'Sales confirmed the destination country.',
  supersedesFactId: fact1,
  reviewedByProfileId: managerId,
  reviewedByRole: 'manager',
  reviewedAt: '2026-10-29T09:30:00Z',
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
};
rejectCode(
  review({
    existingHistory: [first.fact, mixedClaimHistory],
    command: correctionCommand,
  }),
  'UNTRUSTED_HISTORY',
);

const mixedVersionHistory: GlhV2CHumanFact = {
  ...mixedClaimHistory,
  factId: fact2,
  idempotencyKey: key2,
  candidateClaimId: 'candidate-2026-10-30.2:0',
  candidateClaimIndex: 0,
  field: 'material',
  sourceMessageId: 'inbound-a',
  sourceExcerpt: 'PP',
  sourceConfidence: 0.95,
  beforeValue: 'PP',
  afterValue: 'PP',
  classification: 'ACCEPTED',
  reason: 'Sales reconfirmed the material under a newer version snapshot.',
  candidateVersion: 'candidate-2026-10-30.2',
  modelVersion: 'synthetic-model-version-2',
};
rejectCode(
  review({
    existingHistory: [first.fact, mixedVersionHistory],
    command: correctionCommand,
  }),
  'UNTRUSTED_HISTORY',
);

// Malformed commands and old TRUE/FALSE/UNKNOWN review enums fail closed.
rejectCode(
  review({
    command: { ...acceptedCommand, actorConfirmed: false as true },
  }),
  'INVALID_COMMAND',
);
rejectCode(
  review({
    command: { ...acceptedCommand, classification: 'TRUE' as 'ACCEPTED' },
  }),
  'INVALID_COMMAND',
);
rejectCode(
  review({
    command: {
      ...acceptedCommand,
      classification: 'CORRECTED',
      correctedValue: null,
    },
  }),
  'INVALID_COMMAND',
);
rejectCode(
  review({
    command: { ...acceptedCommand, reason: '' },
  }),
  'INVALID_COMMAND',
);
rejectCode(
  review({ trustedReviewedAt: 'not-a-timestamp' }),
  'INVALID_COMMAND',
);
rejectCode(
  review({ trustedReviewedAt: '2026-02-30T09:00:00Z' }),
  'INVALID_COMMAND',
);
rejectCode(
  reviewGlhV2CQuality(null as unknown as GlhV2CReviewInput),
  'INVALID_COMMAND',
);
rejectCode(
  review({
    existingHistory: null as unknown as GlhV2CReviewInput['existingHistory'],
  }),
  'UNTRUSTED_HISTORY',
);

// Histories must be structurally valid, uniquely keyed, and tied to the source.
rejectCode(
  review({
    existingHistory: [{ ...first.fact, organizationId: otherOrg }],
  }),
  'UNTRUSTED_HISTORY',
);
rejectCode(
  review({
    existingHistory: [{ ...first.fact, reviewOnly: false as true }],
  }),
  'UNTRUSTED_HISTORY',
);
rejectCode(
  review({
    existingHistory: [first.fact, first.fact],
  }),
  'UNTRUSTED_HISTORY',
);
rejectCode(
  review({
    existingHistory: [{
      ...first.fact,
      classification: 'TRUE' as 'ACCEPTED',
    }],
  }),
  'UNTRUSTED_HISTORY',
);
rejectCode(
  review({
    existingHistory: [first.fact],
    command: { ...acceptedCommand, factId: fact2, idempotencyKey: key2 },
  }),
  'STALE_CORRECTION',
);
rejectCode(
  review({
    sourceMessages: [{
      ...sourceMessages[0],
      text: 'The trusted source was replaced.',
    }],
    existingHistory: first.history,
  }),
  'UNTRUSTED_HISTORY',
);

// Completeness is advisory and only computed after source/candidate validation.
assert.deepEqual(proposeGlhV2CQualityDimensions(
  candidate.evidence,
  sourceMessages,
  scope,
), {
  completeness: { knownFields: 2, targetFields: 6, needsVerification: true },
  fit: 'REVIEW_REQUIRED',
  intent: 'REVIEW_REQUIRED',
  useForGrade: false,
  automaticallyRejectLead: false,
  humanReviewRequired: true,
  authoritativeWriteAllowed: false,
  providerCalls: 0,
  realModelAccuracy: 'NOT_MEASURED',
});
assert.equal(proposeGlhV2CQualityDimensions(
  candidate.evidence,
  [{ ...sourceMessages[0], organizationId: otherOrg }],
  scope,
), null);
assert.equal(proposeGlhV2CQualityDimensions(
  {
    ...candidate.evidence,
    claims: [{
      ...candidate.evidence.claims[0],
      sourceMessageId: 'outbound-a',
    }],
  },
  sourceMessages,
  scope,
), null);
assert.equal(proposeGlhV2CQualityDimensions(
  {
    ...candidate.evidence,
    authoritativeWriteAllowed: true as false,
  },
  sourceMessages,
  scope,
), null);
assert.equal('grade' in (proposeGlhV2CQualityDimensions(
  candidate.evidence,
  sourceMessages,
  scope,
) ?? {}), false);

console.log('global-lead-hub-v2-human-feedback.test.ts: PASS');
