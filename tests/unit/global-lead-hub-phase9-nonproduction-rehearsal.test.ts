import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GLH_PHASE8_PILOT_EVIDENCE_CHECK_IDS,
  GLH_PHASE8_PILOT_EVIDENCE_REPORT_VERSION,
  GLH_PHASE8_PILOT_EVIDENCE_TASK,
  type GlhPhase8PilotEvidenceReport,
} from '../../src/lib/global-lead-hub/phase8-pilot-evidence-bundle';
import {
  GLH_PHASE9_EVIDENCE_PREP_TASK,
  evaluateGlhPhase9EvidencePrep,
} from '../../src/lib/global-lead-hub/phase9-evidence-prep';
import {
  GLH_PHASE9_DIRECT_REHEARSAL_IDS,
  GLH_PHASE9_NONPRODUCTION_REHEARSAL_TASK,
  GLH_PHASE9_REHEARSAL_REQUIREMENTS,
  evaluateGlhPhase9NonproductionRehearsal,
  type GlhPhase9NonproductionRehearsalInput,
  type GlhPhase9RepositoryObservation,
  type GlhPhase9DirectRehearsalId,
} from '../../src/lib/global-lead-hub/phase9-nonproduction-rehearsal';

const candidateSha = GLH_PHASE9_NONPRODUCTION_REHEARSAL_TASK.baseMasterSha;
const evaluatedAt = '2026-10-15T10:50:00Z';
const observedAt = '2026-10-15T10:45:00Z';
const targetAlias = 'repository-only-synthetic';

const repositoryRequirements = GLH_PHASE9_REHEARSAL_REQUIREMENTS.filter(
  requirement => requirement[2] === 'REPOSITORY',
);
const humanGateRequirements = GLH_PHASE9_REHEARSAL_REQUIREMENTS.filter(
  requirement => requirement[2] === 'HUMAN_GATE',
);

function acceptedPhase8Report(): GlhPhase8PilotEvidenceReport {
  return {
    reportVersion: GLH_PHASE8_PILOT_EVIDENCE_REPORT_VERSION,
    taskId: GLH_PHASE8_PILOT_EVIDENCE_TASK.taskId,
    environment: 'NON_PRODUCTION',
    overallStatus: 'PASS',
    accepted: true,
    passed: GLH_PHASE8_PILOT_EVIDENCE_CHECK_IDS.length,
    failed: 0,
    evidenceGeneratedAt: '2026-10-15T10:40:00Z',
    evidenceExpiresAt: '2026-10-18T10:40:00Z',
    checks: GLH_PHASE8_PILOT_EVIDENCE_CHECK_IDS.map(id => ({
      id,
      status: 'PASS',
      sourceRefs: [`phase8-${id}`],
      errors: [],
    })),
    errors: [],
  };
}

function phase9Preparation() {
  return evaluateGlhPhase9EvidencePrep({
    taskId: GLH_PHASE9_EVIDENCE_PREP_TASK.taskId,
    baseMasterSha: GLH_PHASE9_EVIDENCE_PREP_TASK.baseMasterSha,
    candidateSha,
    evaluatedAt,
    evidence: {},
    productionSqlExecuted: false,
    productionRlsOrGrantsChanged: false,
    productionEnvOrSecretsChanged: false,
    productionDataChanged: false,
    realProviderCutoverExecuted: false,
    realCustomerMessageSent: false,
    externalPublishingExecuted: false,
    authenticationWeakened: false,
  });
}

function passingObservations(): Record<
  GlhPhase9DirectRehearsalId,
  GlhPhase9RepositoryObservation
> {
  return Object.fromEntries(
    GLH_PHASE9_DIRECT_REHEARSAL_IDS.map(id => {
      const requirement = GLH_PHASE9_REHEARSAL_REQUIREMENTS.find(
        item => item[0] === id,
      );
      assert(requirement);
      return [
        id,
        {
          passed: true,
          ownerRole: requirement[1],
          evidenceRef: `repository://glh/nonproduction-rehearsal#${id}`,
          observedAt,
          candidateSha,
          targetAlias,
        },
      ];
    }),
  ) as Record<GlhPhase9DirectRehearsalId, GlhPhase9RepositoryObservation>;
}

function passingInput(): GlhPhase9NonproductionRehearsalInput {
  return {
    taskId: GLH_PHASE9_NONPRODUCTION_REHEARSAL_TASK.taskId,
    baseMasterSha: GLH_PHASE9_NONPRODUCTION_REHEARSAL_TASK.baseMasterSha,
    candidateSha,
    evaluatedAt,
    targetAlias,
    phase8EvidenceReport: acceptedPhase8Report(),
    phase9EvidencePreparation: phase9Preparation(),
    observations: passingObservations(),
    productionSqlExecuted: false,
    productionRlsOrGrantsChanged: false,
    productionEnvOrSecretsReadOrChanged: false,
    productionDataChanged: false,
    realProviderCutoverExecuted: false,
    realCustomerMessageSent: false,
    externalPublishingExecuted: false,
    authenticationWeakened: false,
  };
}

const report = evaluateGlhPhase9NonproductionRehearsal(passingInput());
assert.equal(report.rehearsalStatus, 'PASS');
assert.equal(report.productionReadiness, 'NOT_READY');
assert.equal(report.pass.length, repositoryRequirements.length);
assert.equal(report.fail.length, 0);
assert.deepEqual(
  new Set(report.unknown),
  new Set(humanGateRequirements.map(([id]) => id)),
);
assert.equal(report.humanGateRequired, true);
assert.equal(report.productionExecutionAuthorized, false);
assert.equal(report.productionChanged, false);
assert(
  report.evidence
    .filter(item => item.execution === 'HUMAN_GATE')
    .every(item => item.issues.includes('SEPARATE_HUMAN_GATE_REQUIRED')),
);

const failed = passingInput();
failed.observations!.ROLLOUT_DRY_RUN = {
  ...failed.observations!.ROLLOUT_DRY_RUN!,
  passed: false,
};
const failedReport = evaluateGlhPhase9NonproductionRehearsal(failed);
assert.equal(failedReport.rehearsalStatus, 'FAIL');
assert(failedReport.fail.includes('ROLLOUT_DRY_RUN'));

const missing = passingInput();
delete missing.observations!.META_WEBHOOK_VERIFICATION;
const missingReport = evaluateGlhPhase9NonproductionRehearsal(missing);
assert.equal(missingReport.rehearsalStatus, 'FAIL');
assert(missingReport.unknown.includes('META_WEBHOOK_VERIFICATION'));

const future = passingInput();
future.observations!.META_WEBHOOK_SIGNATURE = {
  ...future.observations!.META_WEBHOOK_SIGNATURE!,
  observedAt: '2026-10-15T10:50:01Z',
};
const futureReport = evaluateGlhPhase9NonproductionRehearsal(future);
assert.equal(futureReport.rehearsalStatus, 'FAIL');
assert(
  futureReport.evidence
    .find(item => item.id === 'META_WEBHOOK_SIGNATURE')
    ?.issues.includes('EVIDENCE_FROM_FUTURE'),
);

const secretLike = passingInput();
secretLike.observations!.META_WEBHOOK_VERIFICATION = {
  ...secretLike.observations!.META_WEBHOOK_VERIFICATION!,
  evidenceRef: 'artifact://token=synthetic-but-forbidden-123456789',
};
const secretLikeReport = evaluateGlhPhase9NonproductionRehearsal(secretLike);
assert.equal(secretLikeReport.rehearsalStatus, 'FAIL');
assert(!JSON.stringify(secretLikeReport).includes('synthetic-but-forbidden'));

const rejectedPhase8 = passingInput();
rejectedPhase8.phase8EvidenceReport = {
  ...acceptedPhase8Report(),
  accepted: false,
  overallStatus: 'FAIL',
};
const rejectedPhase8Report = evaluateGlhPhase9NonproductionRehearsal(rejectedPhase8);
assert.equal(rejectedPhase8Report.rehearsalStatus, 'FAIL');
assert(rejectedPhase8Report.fail.includes('WEBHOOK_IDEMPOTENCY'));

const missingPreparation = passingInput();
missingPreparation.phase9EvidencePreparation = null;
const missingPreparationReport = evaluateGlhPhase9NonproductionRehearsal(
  missingPreparation,
);
assert.equal(missingPreparationReport.rehearsalStatus, 'FAIL');
assert(
  missingPreparationReport.issues.includes(
    'MISSING_PHASE9_EVIDENCE_PREPARATION',
  ),
);

const productionBoundaryViolation = evaluateGlhPhase9NonproductionRehearsal({
  ...passingInput(),
  productionEnvOrSecretsReadOrChanged: true,
});
assert.equal(productionBoundaryViolation.rehearsalStatus, 'FAIL');
assert(
  productionBoundaryViolation.issues.includes(
    'PRODUCTION_ENV_OR_SECRETS_READ_OR_CHANGED_MUST_BE_FALSE',
  ),
);
assert.equal(productionBoundaryViolation.productionExecutionAuthorized, false);

const omittedBoundary = passingInput();
delete omittedBoundary.realCustomerMessageSent;
assert.equal(
  evaluateGlhPhase9NonproductionRehearsal(omittedBoundary).rehearsalStatus,
  'FAIL',
);

const reportDoc = readFileSync(
  'docs/global-lead-hub/12_NON_PRODUCTION_REHEARSAL_REPORT.md',
  'utf8',
);
const helper = readFileSync(
  'src/lib/global-lead-hub/phase9-nonproduction-rehearsal.ts',
  'utf8',
);
for (const [id] of GLH_PHASE9_REHEARSAL_REQUIREMENTS) {
  assert(reportDoc.includes(id), `rehearsal report contains ${id}`);
}
assert(reportDoc.includes('11 PASS'));
assert(reportDoc.includes('5 UNKNOWN'));
assert(reportDoc.includes('PRODUCTION_EXECUTION_AUTHORIZED = NO'));
assert(reportDoc.includes('PRODUCTION_CHANGED = NO'));
assert(reportDoc.includes('Human Gate'));
assert(!/\bprocess\.env\b/.test(helper));
assert(!/\bfetch\s*\(/.test(helper));
assert(!/createClient/.test(helper));

console.log('\n=== Global Lead Hub Phase 9 Non-Production Rehearsal ===');
console.log('all assertions passed');
