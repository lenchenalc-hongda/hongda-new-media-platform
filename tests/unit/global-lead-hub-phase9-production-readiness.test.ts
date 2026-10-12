import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GLH_PHASE9_EVIDENCE_MAX_AGE_DAYS,
  GLH_PHASE9_EVIDENCE_MAX_AGE_MS,
  GLH_PHASE9_EVIDENCE_REQUIREMENTS,
  GLH_PHASE9_PRODUCTION_READINESS_TASK,
  buildGlhPhase9OwnerApprovalPhrase,
  evaluateGlhPhase9ProductionReadiness,
  type GlhPhase9EvidenceId,
  type GlhPhase9EvidenceItem,
  type GlhPhase9ReadinessInput,
} from '../../src/lib/global-lead-hub/phase9-production-readiness';

const candidateReleaseSha = 'a'.repeat(40);
const expectedReleaseSha = candidateReleaseSha;
const observedAt = '2026-10-12T11:45:00Z';
const evaluatedAt = '2026-10-12T12:00:00Z';

function makePassingEvidence(): Partial<
  Record<GlhPhase9EvidenceId, GlhPhase9EvidenceItem>
> {
  const evidence: Partial<
    Record<GlhPhase9EvidenceId, GlhPhase9EvidenceItem>
  > = {};

  for (const requirement of GLH_PHASE9_EVIDENCE_REQUIREMENTS) {
    evidence[requirement.id] = {
      status: 'PASS',
      owner: requirement.owner,
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
    expectedReleaseSha,
    candidateReleaseSha,
    evaluatedAt,
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
  GLH_PHASE9_PRODUCTION_READINESS_TASK.agentControlBootstrapHeadSha
    === '3eeeda7c0ca4f97fead645a5ed7063fbca6bcb18',
  'the Agent Control bootstrap head remains explicitly recorded',
);
assert(
  GLH_PHASE9_PRODUCTION_READINESS_TASK.expectedHeadSha
    === '464357ad33e4b863d22f0e44f0307bf76ee9094b',
  'the current Agent Control task head is distinct from the bootstrap head',
);
assert(
  String(GLH_PHASE9_PRODUCTION_READINESS_TASK.expectedHeadSha)
    !== String(
      GLH_PHASE9_PRODUCTION_READINESS_TASK.agentControlBootstrapHeadSha,
    ),
  'the task head is never treated as the release candidate',
);
assert(
  GLH_PHASE9_PRODUCTION_READINESS_TASK.productionChanged === false,
  'the repository task records no Production change',
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
assert(
  GLH_PHASE9_EVIDENCE_MAX_AGE_DAYS === 7
    && GLH_PHASE9_EVIDENCE_MAX_AGE_MS
      === GLH_PHASE9_EVIDENCE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
  'evidence freshness window is exactly seven days',
);

const ready = evaluateGlhPhase9ProductionReadiness(makeReadyInput());
assert(
  ready.overallStatus === 'READY_FOR_SEPARATE_PRODUCTION_EXECUTION',
  'complete fresh evidence and exact owner approval produce repository readiness',
);
assert(ready.accepted, 'repository readiness requires every gate');
assert(
  ready.productionChanged === false
    && ready.productionExecutionAuthorized === false
    && ready.activationAuthorizedByThisReport === false,
  'repository readiness never changes Production or authorizes execution',
);
assert(
  ready.revision.candidateMatchesExpectedRelease,
  'the candidate release is bound to the supplied expected release SHA',
);
assert(
  ready.evidence.every(item => item.ownerMatchesRequirement),
  'every evidence item is owned by its required role',
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
    owner: 'DATABASE_OWNER',
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

const staleInput = makeReadyInput();
const staleEvidence = {
  ...staleInput.evidence,
  CHANNEL_CONFIGURATION_REVIEW: {
    status: 'PASS',
    owner: 'CHANNEL_OWNER',
    evidenceRef: 'artifact://glh-phase9/CHANNEL_CONFIGURATION_REVIEW/stale',
    observedAt: '2026-10-05T11:59:59Z',
  },
};
const stale = evaluateGlhPhase9ProductionReadiness({
  ...staleInput,
  evidence: staleEvidence,
});
assert(stale.overallStatus === 'NOT_READY', 'stale evidence is NOT_READY');
assert(
  stale.evidence.find(item => item.id === 'CHANNEL_CONFIGURATION_REVIEW')
    ?.status === 'UNKNOWN',
  'stale evidence fails closed as UNKNOWN',
);
assert(
  stale.issues.some(issue => issue.code === 'EVIDENCE_STALE'),
  'stale evidence records its freshness failure',
);

const futureInput = makeReadyInput();
const futureEvidence = {
  ...futureInput.evidence,
  META_WEBHOOK_SECURITY_REVIEW: {
    status: 'PASS',
    owner: 'GLH_SECURITY_OWNER',
    evidenceRef: 'artifact://glh-phase9/META_WEBHOOK_SECURITY_REVIEW/future',
    observedAt: '2026-10-12T12:00:00.001Z',
  },
};
const future = evaluateGlhPhase9ProductionReadiness({
  ...futureInput,
  evidence: futureEvidence,
});
assert(future.overallStatus === 'NOT_READY', 'future evidence is NOT_READY');
assert(
  future.evidence.find(item => item.id === 'META_WEBHOOK_SECURITY_REVIEW')
    ?.status === 'UNKNOWN',
  'future-dated evidence fails closed as UNKNOWN',
);
assert(
  future.issues.some(issue => issue.code === 'EVIDENCE_FROM_FUTURE'),
  'future-dated evidence records the timestamp failure',
);

const missingEvaluationInput = makeReadyInput();
delete missingEvaluationInput.evaluatedAt;
const missingEvaluation = evaluateGlhPhase9ProductionReadiness(
  missingEvaluationInput,
);
assert(
  missingEvaluation.overallStatus === 'NOT_READY'
    && missingEvaluation.evaluation.evaluatedAtRecorded === false,
  'an explicit evaluation timestamp is required',
);
assert(
  missingEvaluation.issues.some(
    issue => issue.code === 'MISSING_EVALUATION_TIMESTAMP',
  ),
  'missing evaluation timestamp is explicit',
);
assert(
  missingEvaluation.unknownEvidence.length
    === GLH_PHASE9_EVIDENCE_REQUIREMENTS.length,
  'evidence freshness cannot pass without an evaluation timestamp',
);

const malformedEvaluation = evaluateGlhPhase9ProductionReadiness({
  ...makeReadyInput(),
  evaluatedAt: 'not-a-timestamp',
});
assert(
  malformedEvaluation.overallStatus === 'NOT_READY'
    && malformedEvaluation.evaluation.evaluatedAtRecorded === false,
  'malformed evaluation timestamp is NOT_READY',
);
assert(
  malformedEvaluation.issues.some(
    issue => issue.code === 'INVALID_EVALUATION_TIMESTAMP',
  ),
  'malformed evaluation timestamp is explicit',
);

const malformedInput = makeReadyInput();
const malformedEvidence = {
  ...malformedInput.evidence,
  META_WEBHOOK_SECURITY_REVIEW: {
    status: 'UNVERIFIED',
    owner: 'GLH_SECURITY_OWNER',
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

const malformedTimestampInput = makeReadyInput();
const malformedTimestampEvidence = {
  ...malformedTimestampInput.evidence,
  META_WEBHOOK_SECURITY_REVIEW: {
    status: 'PASS',
    owner: 'GLH_SECURITY_OWNER',
    evidenceRef: 'artifact://glh-phase9/META_WEBHOOK_SECURITY_REVIEW/time',
    observedAt: '2026-02-30T12:00:00Z',
  },
};
const malformedTimestamp = evaluateGlhPhase9ProductionReadiness({
  ...malformedTimestampInput,
  evidence: malformedTimestampEvidence,
});
assert(
  malformedTimestamp.evidence.find(
    item => item.id === 'META_WEBHOOK_SECURITY_REVIEW',
  )?.status === 'UNKNOWN',
  'malformed evidence timestamps fail closed as UNKNOWN',
);
assert(
  malformedTimestamp.issues.some(
    issue => issue.code === 'INVALID_EVIDENCE_TIMESTAMP',
  ),
  'malformed evidence timestamps are explicit',
);

const missingOwnerInput = makeReadyInput();
const missingOwnerEvidence = {
  ...missingOwnerInput.evidence,
  SECRET_HANDLING_REVIEW: {
    status: 'PASS',
    evidenceRef: 'artifact://glh-phase9/SECRET_HANDLING_REVIEW/no-owner',
    observedAt,
  },
};
const missingOwner = evaluateGlhPhase9ProductionReadiness({
  ...missingOwnerInput,
  evidence: missingOwnerEvidence,
});
assert(missingOwner.overallStatus === 'NOT_READY', 'missing owner is NOT_READY');
assert(
  missingOwner.evidence.find(item => item.id === 'SECRET_HANDLING_REVIEW')
    ?.status === 'UNKNOWN',
  'evidence without an accountable owner is UNKNOWN',
);
assert(
  missingOwner.issues.some(issue => issue.code === 'MISSING_EVIDENCE_OWNER'),
  'missing evidence owner is explicit',
);

const mismatchedOwnerInput = makeReadyInput();
const mismatchedOwnerEvidence = {
  ...mismatchedOwnerInput.evidence,
  SECRET_HANDLING_REVIEW: {
    status: 'PASS',
    owner: 'CHANNEL_OWNER',
    evidenceRef: 'artifact://glh-phase9/SECRET_HANDLING_REVIEW/wrong-owner',
    observedAt,
  },
};
const mismatchedOwner = evaluateGlhPhase9ProductionReadiness({
  ...mismatchedOwnerInput,
  evidence: mismatchedOwnerEvidence,
});
assert(
  mismatchedOwner.overallStatus === 'NOT_READY',
  'mismatched owner is NOT_READY',
);
assert(
  mismatchedOwner.evidence.find(item => item.id === 'SECRET_HANDLING_REVIEW')
    ?.status === 'UNKNOWN',
  'evidence with a mismatched owner is UNKNOWN',
);
assert(
  mismatchedOwner.issues.some(
    issue => issue.code === 'EVIDENCE_OWNER_MISMATCH',
  ),
  'mismatched evidence owner is explicit',
);

const missingReferenceInput = makeReadyInput();
const missingReferenceEvidence = {
  ...missingReferenceInput.evidence,
  SECRET_HANDLING_REVIEW: {
    status: 'PASS',
    owner: 'GLH_SECURITY_OWNER',
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
    owner: 'GLH_SECURITY_OWNER',
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

const wrongTaskHead = evaluateGlhPhase9ProductionReadiness({
  ...makeReadyInput(),
  expectedHeadSha: 'b'.repeat(40),
});
assert(
  wrongTaskHead.overallStatus === 'NOT_READY'
    && wrongTaskHead.revision.status === 'MISMATCH',
  'task head mismatch is NOT_READY',
);

const wrongRelease = evaluateGlhPhase9ProductionReadiness({
  ...makeReadyInput(),
  expectedReleaseSha: 'b'.repeat(40),
});
assert(
  wrongRelease.overallStatus === 'NOT_READY'
    && wrongRelease.revision.status === 'MISMATCH',
  'candidate release versus expected release mismatch is NOT_READY',
);
assert(
  wrongRelease.issues.some(issue => issue.code === 'RELEASE_SHA_MISMATCH'),
  'candidate release mismatch is explicit',
);
assert(
  wrongRelease.ownerApproval.status === 'INVALID',
  'owner approval cannot remain recorded for an unbound candidate release',
);

assert(
  runbook.includes('PRODUCTION_CHANGED = NO')
    && runbook.includes('PRODUCTION_EXECUTION_AUTHORIZED = NO')
    && runbook.includes('OWNER_APPROVAL_REQUIRED = YES')
    && runbook.includes('AUTO_PRODUCTION = false')
    && runbook.includes('AUTO_MERGE = false'),
  'runbook records the hard Production and owner-approval boundary',
);
assert(
  runbook.includes(
    'AGENT_CONTROL_BOOTSTRAP_HEAD = 3eeeda7c0ca4f97fead645a5ed7063fbca6bcb18',
  )
    && runbook.includes(
      'EXPECTED_HEAD = 464357ad33e4b863d22f0e44f0307bf76ee9094b',
    ),
  'runbook distinguishes the bootstrap head from the Agent Control task head',
);
assert(
  runbook.includes('EVALUATION_TIMESTAMP_REQUIRED = YES')
    && runbook.includes('MAX_EVIDENCE_AGE_DAYS = 7'),
  'runbook documents deterministic evidence freshness',
);
assert(
  runbook.includes(
    'CANDIDATE_RELEASE_SHA_MUST_MATCH_EXPECTED_RELEASE_SHA = YES',
  )
    && runbook.includes(
      'APPROVE GLH PHASE 9 PRODUCTION ACTIVATION FOR <40_CHAR_RELEASE_SHA> AFTER ALL READINESS EVIDENCE AND ROLLBACK DRILL',
    ),
  'runbook binds owner approval to the supplied expected release SHA',
);
assert(
  !runbook.includes(
    'APPROVE GLH PHASE 9 PRODUCTION ACTIVATION FOR 3eeeda7c0ca4f97fead645a5ed7063fbca6bcb18',
  ),
  'runbook does not present the bootstrap head as a release approval example',
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
assert(
  checklist.includes('EVALUATION_TIMESTAMP_REQUIRED = YES')
    && checklist.includes('MAX_EVIDENCE_AGE_DAYS = 7')
    && checklist.includes(
      'CANDIDATE_RELEASE_SHA_MUST_MATCH_EXPECTED_RELEASE_SHA = YES',
    ),
  'checklist requires freshness and release SHA binding',
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
