import assert from 'node:assert/strict';
import {
  GLH_V2_C_FEEDBACK_SCHEMA,
  reviewGlhV2CQuality,
  proposeGlhV2CQualityDimensions,
  type GlhV2CActor,
  type GlhV2CScope,
  type GlhV2CFeedbackCommand,
} from '../../src/lib/global-lead-hub/v2-human-feedback';
import {
  GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION,
  type GlhV2EvidenceDraft,
  type GlhV2SourceMessage,
} from '../../src/lib/global-lead-hub/v2-inquiry-evidence';

const org = '11111111-1111-4111-8111-111111111111';
const otherOrg = '22222222-2222-4222-8222-222222222222';
const inquiry = '33333333-3333-4333-8333-333333333333';
const salesA = '44444444-4444-4444-8444-444444444444';
const salesB = '55555555-5555-4555-8555-555555555555';
const managerId = '66666666-6666-4666-8666-666666666666';
const fact1 = '77777777-7777-4777-8777-777777777777';
const fact2 = '88888888-8888-4888-8888-888888888888';
const key1 = '99999999-9999-4999-8999-999999999999';
const key2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const scope: GlhV2CScope = { organizationId: org, inquiryId: inquiry, assignedSalesProfileId: salesA };
const actor: GlhV2CActor = { profileId: salesA, organizationId: org, role: 'sales', isActive: true };
const manager: GlhV2CActor = { profileId: managerId, organizationId: org, role: 'manager', isActive: true };
const sources: GlhV2SourceMessage[] = [
  { id: 'inbound-a', organizationId: org, inquiryId: inquiry, direction: 'INBOUND', kind: 'TEXT', text: 'I need PP heat transfer film.' },
  { id: 'inbound-b', organizationId: org, inquiryId: inquiry, direction: 'INBOUND', kind: 'TEXT', text: 'Sample first, please.' },
  { id: 'outbound-a', organizationId: org, inquiryId: inquiry, direction: 'OUTBOUND', kind: 'TEXT', text: 'Our sales team will review.' },
];
const originalCommand: GlhV2CFeedbackCommand = {
  factId: fact1, idempotencyKey: key1, decision: 'UNKNOWN',
  reason: 'Insufficient customer information; sales must follow up.',
  sourceMessageId: 'inbound-a', supersedesFactId: null,
};
const reviewTime = '2026-10-29T09:00:00Z';
function review(overrides: Partial<Parameters<typeof reviewGlhV2CQuality>[0]> = {}) {
  return reviewGlhV2CQuality({
    actor, scope, sourceMessages: sources,
    existingHistory: [], command: originalCommand,
    trustedReviewedAt: reviewTime,
    ...overrides,
  });
}
const first = review();
assert.equal(first.ok, true);
if (!first.ok) throw Error('expected first confirmed feedback');
assert.equal(first.action, 'APPENDED');
assert.equal(first.fact.schemaVersion, GLH_V2_C_FEEDBACK_SCHEMA);
assert.equal(first.fact.decision, 'UNKNOWN');
assert.equal(first.fact.reviewedByProfileId, salesA);
assert.equal(first.fact.reviewedAt, reviewTime);
assert.equal(first.legacyGradeUntouched, true);
assert.equal(first.cpcWriteAllowed, false);
assert.equal(first.autoDiscardAllowed, false);
assert.equal(first.customerFacingAutoSendAllowed, false);
assert.equal(first.history.length, 1);
assert(Object.isFrozen(first.fact));
assert(Object.isFrozen(first.history));

const replay = review({ existingHistory: first.history, trustedReviewedAt: '2026-10-29T09:05:00Z' });
assert.equal(replay.ok, true);
if (!replay.ok) throw Error('expected replay');
assert.equal(replay.action, 'REPLAYED');
assert.equal(replay.history, first.history);
assert.equal(replay.fact.factId, fact1);
const conflict = review({ existingHistory: first.history, command: { ...originalCommand, decision: 'TRUE' } });
assert.deepEqual(conflict.ok ? 'unexpected' : conflict.code, 'IDEMPOTENCY_CONFLICT');

const secondCommand: GlhV2CFeedbackCommand = {
  factId: fact2, idempotencyKey: key2, decision: 'TRUE',
  reason: 'The assigned salesperson verified this PP film inquiry with a customer.',
  sourceMessageId: 'inbound-b', supersedesFactId: fact1,
};
const corrected = review({
  actor: manager, existingHistory: first.history, command: secondCommand,
  trustedReviewedAt: '2026-10-29T09:30:00Z',
});
assert.equal(corrected.ok, true);
if (!corrected.ok) throw Error('expected manager correction');
assert.equal(corrected.action, 'APPENDED');
assert.equal(corrected.current.decision, 'TRUE');
assert.equal(corrected.current.supersedesFactId, fact1);
assert.equal(corrected.history[0], first.fact);
assert.equal(corrected.history.length, 2);
assert.equal(first.history.length, 1, 'prior history must stay immutable');

const oldReplay = review({ existingHistory: corrected.history });
assert.equal(oldReplay.ok, true);
if (!oldReplay.ok) throw Error('expected older duplicate safe replay');
assert.equal(oldReplay.current.factId, fact2);
assert.equal(oldReplay.fact.factId, fact1);

function rejectCode(value: ReturnType<typeof review>, wanted: string) {
  assert.equal(value.ok, false);
  if (!value.ok) assert.equal(value.code, wanted);
}
rejectCode(review({ actor: { ...actor, profileId: salesB } }), 'UNAUTHORIZED_REVIEWER');
rejectCode(review({ actor: { ...actor, isActive: false } }), 'UNAUTHORIZED_REVIEWER');
rejectCode(review({ actor: { ...actor, organizationId: otherOrg } }), 'UNAUTHORIZED_REVIEWER');
rejectCode(review({ actor: { ...actor, role: 'sales', profileId: managerId } }), 'UNAUTHORIZED_REVIEWER');
rejectCode(review({ scope: { ...scope, organizationId: otherOrg } }), 'UNAUTHORIZED_REVIEWER');
rejectCode(review({ sourceMessages: [{ ...sources[0], organizationId: otherOrg }] }), 'INVALID_SOURCE');
rejectCode(review({ sourceMessages: [{ ...sources[0], inquiryId: otherOrg }] }), 'INVALID_SOURCE');
rejectCode(review({ sourceMessages: [sources[2]], command: { ...originalCommand, sourceMessageId: 'outbound-a' } }), 'INVALID_SOURCE');
rejectCode(review({ sourceMessages: [sources[0], sources[0]] }), 'INVALID_SOURCE');
rejectCode(review({ command: { ...originalCommand, sourceMessageId: 'made-up-message' } }), 'INVALID_SOURCE');
rejectCode(review({ command: { ...originalCommand, decision: 'AUTO_APPROVE' as 'TRUE' } }), 'INVALID_COMMAND');
rejectCode(review({ command: { ...originalCommand, reason: '' } }), 'INVALID_COMMAND');
rejectCode(review({ command: { ...originalCommand, idempotencyKey: 'invalid' } }), 'INVALID_COMMAND');
rejectCode(review({ trustedReviewedAt: 'not-a-timestamp' }), 'INVALID_COMMAND');
rejectCode(review({ trustedReviewedAt: '2026-02-30T09:00:00Z' }), 'INVALID_COMMAND');
rejectCode(review({ command: { ...originalCommand, supersedesFactId: fact2 } }), 'STALE_CORRECTION');
rejectCode(review({ existingHistory: first.history, command: { ...secondCommand, supersedesFactId: null } }), 'STALE_CORRECTION');
rejectCode(review({ existingHistory: corrected.history, command: { ...secondCommand, factId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } }), 'STALE_CORRECTION');
rejectCode(review({ existingHistory: [{ ...first.fact, organizationId: otherOrg }] }), 'UNTRUSTED_HISTORY');
rejectCode(review({ existingHistory: [first.fact, first.fact] }), 'UNTRUSTED_HISTORY');
rejectCode(review({ existingHistory: [first.fact, { ...corrected.current, supersedesFactId: null }] }), 'UNTRUSTED_HISTORY');
rejectCode(review({ existingHistory: [first.fact], command: { ...originalCommand, factId: fact2, idempotencyKey: key2 } }), 'STALE_CORRECTION');

const candidateEvidence: GlhV2EvidenceDraft = {
  schemaVersion: GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION,
  inquiryId: inquiry, organizationId: org,
  claims: [
    { field: 'material', value: 'PP', sourceMessageId: 'inbound-a', excerpt: 'PP', confidence: 0.95, needsVerification: true },
    { field: 'requirementType', value: 'FILM', sourceMessageId: 'inbound-a', excerpt: 'film', confidence: 0.95, needsVerification: true },
    { field: 'material', value: 'PP', sourceMessageId: 'inbound-b', excerpt: 'Sample', confidence: 0.75, needsVerification: true },
  ],
  humanReviewRequired: true, customerFacingAutoSendAllowed: false,
  authoritativeWriteAllowed: false, legacyGradeUntouched: true,
};
const dimensions = proposeGlhV2CQualityDimensions(candidateEvidence, scope);
assert.deepEqual(dimensions, {
  completeness: { knownFields: 2, targetFields: 6, needsVerification: true },
  fit: 'REVIEW_REQUIRED', intent: 'REVIEW_REQUIRED', useForGrade: false,
  automaticallyRejectLead: false, humanReviewRequired: true,
});
assert.equal(proposeGlhV2CQualityDimensions(null, scope), null);
assert.equal(proposeGlhV2CQualityDimensions(candidateEvidence, { ...scope, organizationId: otherOrg }), null);
assert.equal(proposeGlhV2CQualityDimensions({ ...candidateEvidence, claims: [{ ...candidateEvidence.claims[0], needsVerification: false }] }, scope), null);
assert.equal('grade' in (dimensions ?? {}), false);
console.log('global-lead-hub-v2-human-feedback.test.ts: PASS');
