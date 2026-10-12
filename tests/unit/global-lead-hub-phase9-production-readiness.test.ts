import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GLH_PHASE9_EVIDENCE_REQUIREMENTS,
  GLH_PHASE9_PRODUCTION_READINESS_TASK,
  buildGlhPhase9OwnerApprovalPhrase,
  evaluateGlhPhase9ProductionReadiness,
  type GlhPhase9EvidenceId,
  type GlhPhase9EvidenceItem,
  type GlhPhase9ReadinessInput,
} from '../../src/lib/global-lead-hub/phase9-production-readiness';

const candidateReleaseSha = 'a'.repeat(40);
const observedAt = '2026-10-12T12:00:00Z';

function makePassingEvidence(): Partial<
  Record<GlhPhase9EvidenceId, GlhPhase9EvidenceItem>
> {
  const evidence: Partial<
    Record<GlhPhase9EvidenceId, GlhPhase9EvidenceItem>
  > = {};

  for (const requirement of GLH_PHASE9_EVIDENCE_REQUIREMENTS) {
    evidence[requirement.id] = {
      status: 'PASS',
      evidenceRef: `artifact://glh-phase9/${requirement.id}`,
      observedAt,
    };
  }

  return evidence;
}

function makeReadyInput(): GlhPhase9ReadinessInput {
  return {
    baseMasterSha: GLH_PHASE9_PRODUCTION_READINESS_TASK.baseMasterSha,
    expectedHeadSha: GLH_PHASE9_PRODUCTION_READINESS_TASK.expectedHeadSha,
    candidateReleaseSha,
    evidence: makePassingEvidence(),
    ownerApproval: {
      phrase: buildGlhPhase9OwnerApprovalPhrase(candidateReleaseSha),
      approvedBy: 'human-owner',
      approvedAt: observedAt,
    },
  };
}

const runbook = readFileSync(
  'docs/global-lead-hub/08_PRODUCTION_READINESS_RUNBOOK.md',
  'utf8',
);
const checklist = readFileSync(
  'docs/global-lead-hub/09_PRODUCTION_GATE_CHECKLIST.md',
  'utf8',
);
const helperSource = readFileSync(
  'src/lib/global-lead-hub/phase9-production-readiness.ts',
  'utf8',
);

assert(
  GLH_PHASE9_PRODUCTION_READINESS_TASK.taskId
    === 'GLH-P9-PRODUCTION-READINESS-001',
  'task id is exact',
);
assert(
  GLH_PHASE9_PRODUCTION_READINESS_TASK.productionExecutionAuthorized === false,
  'repository task never authorizes Production execution',
);
assert(
  GLH_PHASE9_PRODUCTION_READINESS_TASK.ownerApprovalRequired === true,
  'owner approval remains mandatory',
);
assert(
  GLH_PHASE9_PRODUCTION_READINESS_TASK.autoProduction === false
    && GLH_PHASE9_PRODUCTION_READINESS_TASK.autoMerge === false,
  'auto Production and auto merge remain disabled',
);

const ready = evaluateGlhPhase9ProductionReadiness(makeReadyInput());
assert(
  ready.overallStatus === 'READY_FOR_SEPARATE_PRODUCTION_EXECUTION',
  'complete evidence and exact owner approval produce repository readiness',
);
assert(ready.accepted, 'repository readiness requires every gate');
assert(
  ready.productionExecutionAuthorized === false
    && ready.activationAuthorizedByThisReport === false,
  'repository readiness never authorizes Production execution',
);
assert(
  ready.evidence.every(item => item.status === 'PASS'),
  'all required evidence passes when complete',
);
assert(
  ready.gates.every(gate => gate.status === 'PASS'),
  'all four gates pass only with exact owner approval',
);
assert(
  ready.nextAction === 'STOP_FOR_SEPARATE_HUMAN_PRODUCTION_EXECUTION',
  'ready repository evidence stops for a separate human execution',
);

const missingInput = makeReadyInput();
const missingEvidence = {
  ...missingInput.evidence,
};
delete missingEvidence.CHANNEL_CONFIGURATION_REVIEW;
const missing = evaluateGlhPhase9ProductionReadiness({
  ...missingInput,
  evidence: missingEvidence,
});
assert(missing.overallStatus === 'NOT_READY', 'missing evidence is NOT_READY');
assert(
  missing.missingEvidence.includes('CHANNEL_CONFIGURATION_REVIEW'),
  'missing evidence remains explicitly UNKNOWN',
);
assert(
  missing.unknownEvidence.includes('CHANNEL_CONFIGURATION_REVIEW'),
  'missing evidence is reported in the unknown set',
);
assert(
  missing.evidence.find(item => item.id === 'CHANNEL_CONFIGURATION_REVIEW')
    ?.status === 'UNKNOWN',
  'missing evidence is never inferred as PASS',
);

const failedInput = makeReadyInput();
const failedEvidence = {
  ...failedInput.evidence,
  RLS_AUTHORIZATION_REVIEW: {
    status: 'FAIL',
    evidenceRef: 'artifact://glh-phase9/RLS_AUTHORIZATION_REVIEW/failure',
    observedAt,
  },
};
const failed = evaluateGlhPhase9ProductionReadiness({
  ...failedInput,
  evidence: failedEvidence,
});
assert(failed.overallStatus === 'NOT_READY', 'failed evidence is NOT_READY');
assert(
  failed.failedEvidence.includes('RLS_AUTHORIZATION_REVIEW'),
  'failed evidence remains FAIL',
);
assert(
  failed.nextAction === 'STOP_AND_REMEDIATE_FAILED_EVIDENCE',
  'failure stops the rollout',
);

const malformedInput = makeReadyInput();
const malformedEvidence = {
  ...malformedInput.evidence,
  META_WEBHOOK_SECURITY_REVIEW: {
    status: 'UNVERIFIED',
    evidenceRef: 'artifact://glh-phase9/META_WEBHOOK_SECURITY_REVIEW',
    observedAt,
  },
};
const malformed = evaluateGlhPhase9ProductionReadiness({
  ...malformedInput,
  evidence: malformedEvidence,
});
assert(
  malformed.evidence.find(item => item.id === 'META_WEBHOOK_SECURITY_REVIEW')
    ?.status === 'UNKNOWN',
  'malformed evidence status fails closed as UNKNOWN',
);

const missingReferenceInput = makeReadyInput();
const missingReferenceEvidence = {
  ...missingReferenceInput.evidence,
  SECRET_HANDLING_REVIEW: {
    status: 'PASS',
    evidenceRef: '',
    observedAt,
  },
};
const missingReference = evaluateGlhPhase9ProductionReadiness({
  ...missingReferenceInput,
  evidence: missingReferenceEvidence,
});
assert(
  missingReference.evidence.find(item => item.id === 'SECRET_HANDLING_REVIEW')
    ?.status === 'UNKNOWN',
  'PASS without an evidence reference is UNKNOWN',
);

const secretReferenceInput = makeReadyInput();
const secretReferenceEvidence = {
  ...secretReferenceInput.evidence,
  SECRET_HANDLING_REVIEW: {
    status: 'PASS',
    evidenceRef: 'sk-test-secret-value-12345678',
    observedAt,
  },
};
const secretReference = evaluateGlhPhase9ProductionReadiness({
  ...secretReferenceInput,
  evidence: secretReferenceEvidence,
});
assert(
  secretReference.issues.some(
    issue => issue.code === 'SECRET_LIKE_EVIDENCE_REFERENCE',
  ),
  'secret-like evidence references fail closed',
);
assert(
  !JSON.stringify(secretReference).includes('sk-test-secret-value'),
  'the evaluator does not echo secret-like evidence references',
);

const noApproval = evaluateGlhPhase9ProductionReadiness({
  ...makeReadyInput(),
  ownerApproval: null,
});
assert(
  noApproval.overallStatus === 'OWNER_APPROVAL_REQUIRED',
  'complete evidence without owner approval remains blocked',
);
assert(
  noApproval.ownerApproval.status === 'REQUIRED'
    && noApproval.ownerApproval.required,
  'owner approval status is explicitly required',
);
assert(
  noApproval.productionExecutionAuthorized === false,
  'missing owner approval never authorizes Production',
);

const wrongApproval = evaluateGlhPhase9ProductionReadiness({
  ...makeReadyInput(),
  ownerApproval: {
    phrase: 'APPROVE GLH PRODUCTION',
    approvedBy: 'human-owner',
    approvedAt: observedAt,
  },
});
assert(
  wrongApproval.overallStatus === 'NOT_READY'
    && wrongApproval.ownerApproval.status === 'INVALID',
  'wrong owner approval phrase is NOT_READY',
);

const wrongRevision = evaluateGlhPhase9ProductionReadiness({
  ...makeReadyInput(),
  expectedHeadSha: 'b'.repeat(40),
});
assert(
  wrongRevision.overallStatus === 'NOT_READY'
    && wrongRevision.revision.status === 'MISMATCH',
  'revision mismatch is NOT_READY',
);

assert(
  runbook.includes('PRODUCTION_EXECUTION_AUTHORIZED = NO')
    && runbook.includes('OWNER_APPROVAL_REQUIRED = YES')
    && runbook.includes('AUTO_PRODUCTION = false')
    && runbook.includes('AUTO_MERGE = false'),
  'runbook records the hard Production and owner-approval boundary',
);
assert(
  runbook.includes(
    'APPROVE GLH PHASE 9 PRODUCTION ACTIVATION FOR <40_CHAR_RELEASE_SHA> AFTER ALL READINESS EVIDENCE AND ROLLBACK DRILL',
  ),
  'runbook records the exact owner approval phrase template',
);
assert(
  runbook.includes('UNKNOWN') && runbook.includes('NOT_READY'),
  'runbook defines fail-closed UNKNOWN/NOT_READY semantics',
);
assert(
  runbook.includes('## 6. Future human rollout sequence')
    && runbook.includes('## 7. Postflight')
    && runbook.includes('## 8. Stop and rollback'),
  'runbook contains rollout, postflight, and stop/rollback sections',
);
assert(
  checklist.includes('MISSING_EVIDENCE = UNKNOWN')
    && checklist.includes('UNKNOWN_OR_FAIL = NOT_READY'),
  'checklist fails closed for missing evidence',
);

for (const requirement of GLH_PHASE9_EVIDENCE_REQUIREMENTS) {
  assert(
    checklist.includes(requirement.id),
    `checklist contains evidence id ${requirement.id}`,
  );
}

assert(
  !/\bprocess\.env\b/.test(helperSource)
    && !/\bfetch\s*\(/.test(helperSource)
    && !/createClient/.test(helperSource)
    && !/SUPABASE_SERVICE_ROLE_KEY/.test(helperSource),
  'readiness helper has no Production, environment, or network access',
);

console.log('\n=== Global Lead Hub Phase 9 Production Readiness Contract ===');
console.log('all assertions passed');
