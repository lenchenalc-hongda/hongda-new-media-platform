import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { WosEntityType } from '../../src/lib/workshop-orders/domain';
import {
  WOS_ATOMIC_SUBMISSION_PENDING_STATUS,
  evaluateWosAtomicSubmissionEvidence,
  validateWosAtomicSubmissionEvidence,
} from '../../src/lib/workshop-orders/p6-atomic-submission-evidence';

const organizationId = '11111111-1111-4111-8111-111111111111';
const foreignOrganizationId = '22222222-2222-4222-8222-222222222222';
const profileId = '33333333-3333-4333-8333-333333333333';
const productionSourceId = '44444444-4444-4444-8444-444444444444';
const samplingSourceId = '55555555-5555-4555-8555-555555555555';
const submissionId = '66666666-6666-4666-8666-666666666666';
const receiptId = '77777777-7777-4777-8777-777777777777';
const inboxTaskId = '88888888-8888-4888-8888-888888888888';
const auditEventId = '99999999-9999-4999-8999-999999999999';
const idempotencyKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fingerprint =
  'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function evidenceFor(entityType: WosEntityType) {
  const sourceId =
    entityType === 'PRODUCTION_ORDER'
      ? productionSourceId
      : samplingSourceId;
  return {
    evidenceVersion: 1,
    source: 'TRUSTED_NONPRODUCTION_RPC',
    organizationId,
    actor: {
      profileId,
      organizationId,
      role: 'sales',
      isActive: true,
    },
    entityType,
    expectedVersion: 3,
    fingerprint,
    submission: {
      submissionId,
      organizationId,
      entityType,
      sourceId,
      sourceRevision: 3,
      sourceVersionLabel: 'V3',
      workflowStatus: 'SUBMITTED',
      idempotencyKey,
      fingerprint,
    },
    facts: {
      receipts: [{
        receiptId,
        organizationId,
        entityType,
        submissionId,
        sourceId,
        sourceRevision: 3,
        sourceVersionLabel: 'V3',
        idempotencyKey,
        fingerprint,
        status: 'COMMITTED',
      }],
      inbox: [{
        inboxTaskId,
        organizationId,
        entityType,
        submissionId,
        sourceId,
        sourceRevision: 3,
        sourceVersionLabel: 'V3',
        idempotencyKey,
        workflowStatus: 'SUBMITTED',
      }],
      audit: [{
        auditEventId,
        organizationId,
        entityType,
        submissionId,
        sourceId,
        sourceRevision: 3,
        sourceVersionLabel: 'V3',
        idempotencyKey,
        eventType: 'OFFICE_SUBMISSION_COMMITTED',
      }],
    },
    counts: {
      receipts: 1,
      inbox: 1,
      audit: 1,
    },
    replay: {
      submissionId,
      idempotencyKey,
      fingerprint,
    },
    transactionCommitted: true,
  };
}

type Evidence = ReturnType<typeof evidenceFor>;

function mutate(
  entityType: WosEntityType,
  change: (value: Evidence) => void,
): Evidence {
  const value = structuredClone(evidenceFor(entityType));
  change(value);
  return value;
}

function blockerCodes(value: unknown): readonly string[] {
  return evaluateWosAtomicSubmissionEvidence(value)
    .blockers.map((blocker) => blocker.code);
}

function assertBlocker(value: unknown, code: string): void {
  const decision = evaluateWosAtomicSubmissionEvidence(value);
  assert.equal(decision.status, 'REJECTED');
  assert.equal(decision.evidenceShapeConsistent, false);
  assert.equal(decision.persisted, false);
  assert.equal(decision.databaseCommitVerified, false);
  assert.equal(decision.productionChanged, false);
  assert(
    decision.blockers.some((blocker) => blocker.code === code),
    `Expected blocker ${code}; received ${blockerCodes(value).join(', ')}`,
  );
}

function assertPending(value: unknown): void {
  const decision = evaluateWosAtomicSubmissionEvidence(value);
  assert.equal(decision.status, WOS_ATOMIC_SUBMISSION_PENDING_STATUS);
  assert.equal(decision.evidenceShapeConsistent, true);
  assert.deepEqual(decision.blockers, []);
  assert.equal(decision.persisted, false);
  assert.equal(decision.databaseCommitVerified, false);
  assert.equal(decision.productionChanged, false);
  assert.equal(decision.serverVerification, 'REQUIRED');
  assert.equal(
    JSON.stringify(decision).includes('"persisted":true'),
    false,
  );
}

// Serialized, fully self-consistent browser JSON is still not commit proof.
const production = evidenceFor('PRODUCTION_ORDER');
const browserRoundTrip = JSON.parse(JSON.stringify(production)) as unknown;
assertPending(browserRoundTrip);
assertPending(evidenceFor('SAMPLING_REQUEST'));
assert.equal(
  validateWosAtomicSubmissionEvidence(browserRoundTrip).persisted,
  false,
);

for (const role of ['admin', 'manager', 'sales']) {
  assertPending(mutate('PRODUCTION_ORDER', (value) => {
    value.actor.role = role;
  }));
}

assertBlocker(
  mutate('PRODUCTION_ORDER', (value) => {
    value.actor.organizationId = foreignOrganizationId;
  }),
  'ORGANIZATION_MISMATCH',
);
assertBlocker(
  mutate('PRODUCTION_ORDER', (value) => {
    value.actor.isActive = false;
  }),
  'PROFILE_INACTIVE',
);
for (const role of ['workshop', 'technician']) {
  assertBlocker(
    mutate('PRODUCTION_ORDER', (value) => {
      value.actor.role = role;
    }),
    'PROFILE_ROLE_NOT_ALLOWED',
  );
}

assertBlocker(
  mutate('PRODUCTION_ORDER', (value) => {
    value.expectedVersion = 4;
  }),
  'STALE_VERSION',
);
assertBlocker(
  mutate('PRODUCTION_ORDER', (value) => {
    value.submission.entityType = 'SAMPLING_REQUEST';
  }),
  'ENTITY_TYPE_MISMATCH',
);
assertBlocker(
  mutate('SAMPLING_REQUEST', (value) => {
    value.facts.inbox[0].entityType = 'PRODUCTION_ORDER';
  }),
  'ENTITY_TYPE_MISMATCH',
);

assertBlocker(
  mutate('PRODUCTION_ORDER', (value) => {
    value.facts.receipts[0].fingerprint =
      'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
  }),
  'FINGERPRINT_MISMATCH',
);
assertPending(mutate('PRODUCTION_ORDER', (value) => {
  const fabricated =
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  value.fingerprint = fabricated;
  value.submission.fingerprint = fabricated;
  value.facts.receipts[0].fingerprint = fabricated;
  value.replay!.fingerprint = fabricated;
}));

assertBlocker(
  mutate('PRODUCTION_ORDER', (value) => {
    value.replay!.fingerprint =
      'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  }),
  'REPLAY_CONTENT_MISMATCH',
);

// Both commit-flag values are untrusted claims and neither can become proof.
assertPending(mutate('PRODUCTION_ORDER', (value) => {
  value.transactionCommitted = true;
}));
assertPending(mutate('PRODUCTION_ORDER', (value) => {
  value.transactionCommitted = false;
}));

for (const factCollection of ['receipts', 'inbox', 'audit'] as const) {
  const idField =
    factCollection === 'receipts'
      ? 'receiptId'
      : factCollection === 'inbox'
        ? 'inboxTaskId'
        : 'auditEventId';
  const blocker =
    factCollection === 'receipts'
      ? 'DUPLICATE_RECEIPT_ID'
      : factCollection === 'inbox'
        ? 'DUPLICATE_INBOX_ID'
        : 'DUPLICATE_AUDIT_ID';
  assertBlocker(
    mutate('SAMPLING_REQUEST', (value) => {
      const collection = value.facts[factCollection] as Array<
        Record<string, unknown>
      >;
      collection.push(structuredClone(collection[0]));
      value.counts[factCollection] = 2;
      assert.equal(collection[1][idField], collection[0][idField]);
    }),
    blocker,
  );
}

assertBlocker(
  mutate('PRODUCTION_ORDER', (value) => {
    value.facts.inbox = [];
    value.counts.inbox = 0;
  }),
  'NON_ATOMIC_FACTS',
);
assertBlocker(
  mutate('PRODUCTION_ORDER', (value) => {
    value.counts.receipts = 2;
  }),
  'COUNT_MISMATCH',
);
assertBlocker(
  mutate('PRODUCTION_ORDER', (value) => {
    value.facts.audit[0].sourceId = samplingSourceId;
  }),
  'UNTRUSTED_FACT_MISMATCH',
);
assertBlocker({ ...production, transactionCommitted: 'true' }, 'INVALID_SHAPE');
assertBlocker(null, 'INVALID_SHAPE');

// The legacy office POST remains fail-closed and does not write independently.
const root = process.cwd();
const apiServer = readFileSync(
  root + '/src/lib/workshop-orders/api-server.ts',
  'utf8',
);
const productionRoute = readFileSync(
  root + '/src/app/api/workshop-orders/production/route.ts',
  'utf8',
);
const samplingRoute = readFileSync(
  root + '/src/app/api/workshop-orders/sampling/route.ts',
  'utf8',
);
assert(apiServer.includes("return response('NONPRODUCTION_ONLY_DISABLED', 503)"));
assert(apiServer.includes("code: 'DATABASE_UNAVAILABLE'"));
assert(apiServer.includes("response('DATABASE_READ_UNAVAILABLE', 503)"));
assert(apiServer.includes("return response('FORBIDDEN', 403)"));
assert(apiServer.includes("return response('ATOMIC_SUBMISSION_RPC_REQUIRED', 409"));
assert(apiServer.includes('persisted: false'));
assert(apiServer.includes('productionChanged: false'));
assert(!apiServer.includes('.insert('));
assert(!apiServer.includes('.upsert('));
assert(!apiServer.includes('.rpc('));
assert(!apiServer.includes('service_role'));
assert(productionRoute.includes("'PRODUCTION_ORDER'"));
assert(samplingRoute.includes("'SAMPLING_REQUEST'"));

// Existing readiness gates remain present; the full aggregator also executes
// their behavioral tests.
const readiness = readFileSync(
  root + '/src/lib/workshop-orders/readiness.ts',
  'utf8',
);
for (const retainedGate of [
  'evaluateProductionStartGate',
  'evaluateSamplingStartGate',
  'evaluateVersionAlignment',
  'FILM_VERSION_UNVERIFIED',
  'FIXTURE_NOT_READY',
  'INCOMING_MATERIAL_NOT_READY',
  'SIGNED_SAMPLE_MISSING',
  'VISUAL_BASELINE_MISSING',
  'TECHNICAL_CONFIRMATION_MISSING',
  'SUPERVISOR_CONFIRMATION_MISSING',
  'TECHNICIAN_ACCEPTANCE_MISSING',
]) {
  assert(
    readiness.includes(retainedGate),
    `Readiness gate was not retained: ${retainedGate}`,
  );
}
assert(readFileSync(
  root + '/tests/unit/workshop-order-suite.test.ts',
  'utf8',
).includes("import './workshop-order-p6-atomic-submission.test';"));

console.log('workshop-order-p6-atomic-submission.test.ts: PASS');
