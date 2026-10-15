import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GLH_PHASE9_ENV_NAME_PREREQUISITES,
  GLH_PHASE9_EVIDENCE_PREP_REQUIREMENTS,
  GLH_PHASE9_EVIDENCE_PREP_TASK,
  buildGlhPhase9HumanGatePhrase,
  evaluateGlhPhase9EvidencePrep,
  type GlhPhase9EvidencePrepId,
  type GlhPhase9EvidenceRecord,
} from '../../src/lib/global-lead-hub/phase9-evidence-prep';

const candidateSha = 'a'.repeat(40);
const evaluatedAt = '2026-10-15T09:30:00Z';

function passingEvidence(): Partial<
  Record<GlhPhase9EvidencePrepId, GlhPhase9EvidenceRecord>
> {
  return Object.fromEntries(
    GLH_PHASE9_EVIDENCE_PREP_REQUIREMENTS.map(([id, ownerRole]) => [
      id,
      {
        status: 'PASS',
        ownerRole,
        evidenceRef: `artifact://glh-phase9-evidence/${id}`,
        observedAt: '2026-10-15T09:20:00Z',
        candidateSha,
        targetAlias: 'isolated-glh-rehearsal',
      },
    ]),
  );
}

function readyInput() {
  return {
    taskId: GLH_PHASE9_EVIDENCE_PREP_TASK.taskId,
    baseMasterSha: GLH_PHASE9_EVIDENCE_PREP_TASK.baseMasterSha,
    candidateSha,
    evaluatedAt,
    evidence: passingEvidence(),
    productionSqlExecuted: false,
    productionRlsOrGrantsChanged: false,
    productionEnvOrSecretsChanged: false,
    productionDataChanged: false,
    realProviderCutoverExecuted: false,
    realCustomerMessageSent: false,
    externalPublishingExecuted: false,
    authenticationWeakened: false,
  };
}

const plan = readFileSync(
  'docs/global-lead-hub/10_NON_PRODUCTION_EVIDENCE_PLAN.md',
  'utf8',
);
const checklist = readFileSync(
  'docs/global-lead-hub/11_PRODUCTION_REHEARSAL_CHECKLIST.md',
  'utf8',
);
const helper = readFileSync(
  'src/lib/global-lead-hub/phase9-evidence-prep.ts',
  'utf8',
);

const ready = evaluateGlhPhase9EvidencePrep(readyInput());
assert.equal(ready.overallStatus, 'READY_FOR_HUMAN_GATE');
assert.equal(ready.pass.length, GLH_PHASE9_EVIDENCE_PREP_REQUIREMENTS.length);
assert.equal(ready.fail.length, 0);
assert.equal(ready.unknown.length, 0);
assert.equal(ready.productionExecutionAuthorized, false);
assert.equal(ready.productionChanged, false);
assert.equal(ready.humanGateRequired, true);

const missing = readyInput();
delete missing.evidence.META_BUSINESS_PREREQUISITES;
const missingReport = evaluateGlhPhase9EvidencePrep(missing);
assert.equal(missingReport.overallStatus, 'NOT_READY');
assert(missingReport.unknown.includes('META_BUSINESS_PREREQUISITES'));

const failed = readyInput();
failed.evidence.WEBHOOK_IDEMPOTENCY = {
  ...failed.evidence.WEBHOOK_IDEMPOTENCY!,
  status: 'FAIL',
};
const failedReport = evaluateGlhPhase9EvidencePrep(failed);
assert.equal(failedReport.overallStatus, 'NOT_READY');
assert(failedReport.fail.includes('WEBHOOK_IDEMPOTENCY'));

const wrongOwner = readyInput();
wrongOwner.evidence.RLS_ACCEPTANCE = {
  ...wrongOwner.evidence.RLS_ACCEPTANCE!,
  ownerRole: 'RELEASE_OWNER',
};
const wrongOwnerReport = evaluateGlhPhase9EvidencePrep(wrongOwner);
assert(wrongOwnerReport.unknown.includes('RLS_ACCEPTANCE'));
assert(
  wrongOwnerReport.evidence
    .find(item => item.id === 'RLS_ACCEPTANCE')
    ?.issues.includes('OWNER_MISMATCH'),
);

const future = readyInput();
future.evidence.META_WEBHOOK_SIGNATURE = {
  ...future.evidence.META_WEBHOOK_SIGNATURE!,
  observedAt: '2026-10-15T09:30:01Z',
};
const futureReport = evaluateGlhPhase9EvidencePrep(future);
assert(futureReport.unknown.includes('META_WEBHOOK_SIGNATURE'));

const secretLike = readyInput();
secretLike.evidence.SECRET_REDaction = {
  ...secretLike.evidence.SECRET_REDaction!,
  evidenceRef: 'token=should-never-appear-123456789',
};
const secretLikeReport = evaluateGlhPhase9EvidencePrep(secretLike);
assert(secretLikeReport.unknown.includes('SECRET_REDaction'));
assert(!JSON.stringify(secretLikeReport).includes('should-never-appear'));

const productionMutation = evaluateGlhPhase9EvidencePrep({
  ...readyInput(),
  productionEnvOrSecretsChanged: true,
});
assert.equal(productionMutation.overallStatus, 'NOT_READY');
assert(
  productionMutation.issues.includes(
    'PRODUCTION_ENV_OR_SECRETS_CHANGED_MUST_BE_FALSE',
  ),
);

const omittedBoundary = readyInput();
delete (omittedBoundary as Partial<typeof omittedBoundary>).realCustomerMessageSent;
assert.equal(
  evaluateGlhPhase9EvidencePrep(omittedBoundary).overallStatus,
  'NOT_READY',
);

assert.equal(
  buildGlhPhase9HumanGatePhrase(candidateSha),
  `APPROVE GLH PRODUCTION EXECUTION FOR ${candidateSha} WITH REVIEWED META, SUPABASE, VERCEL, ROLLOUT AND ROLLBACK EVIDENCE`,
);

for (const [id] of GLH_PHASE9_EVIDENCE_PREP_REQUIREMENTS) {
  assert(plan.includes(id), `plan contains ${id}`);
}
for (const name of GLH_PHASE9_ENV_NAME_PREREQUISITES) {
  assert(plan.includes(name), `plan contains name-only prerequisite ${name}`);
}
assert(plan.includes('PASS') && plan.includes('FAIL') && plan.includes('UNKNOWN'));
assert(plan.includes('Exact Human Gate'));
assert(checklist.includes('Rollout dry run'));
assert(checklist.includes('Stop and containment dry run'));
assert(checklist.includes('Rollback dry run'));
assert(checklist.includes('REAL_CUSTOMER_SEND = NO'));
assert(!/\bprocess\.env\b/.test(helper));
assert(!/\bfetch\s*\(/.test(helper));
assert(!/createClient/.test(helper));

console.log('\n=== Global Lead Hub Phase 9 Evidence Preparation ===');
console.log('all assertions passed');

