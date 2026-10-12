/**
 * Pure repository evaluator for the GLH Phase 9 Production Readiness Gate.
 *
 * This module performs no network, database, provider, environment, secret,
 * or Production reads. Missing or malformed evidence fails closed as UNKNOWN.
 */

export const GLH_PHASE9_PRODUCTION_READINESS_TASK = Object.freeze({
  taskId: 'GLH-P9-PRODUCTION-READINESS-001',
  project: 'global-lead-hub',
  phase: 'Phase 9 - Production Readiness Gate',
  baseMasterSha: '2ce22b565a5926b048205b87ac1ddca34fe0d43b',
  agentControlBootstrapHeadSha:
    '3eeeda7c0ca4f97fead645a5ed7063fbca6bcb18',
  expectedHeadSha: '464357ad33e4b863d22f0e44f0307bf76ee9094b',
  mode: 'REPOSITORY_ONLY',
  productionChanged: false,
  productionExecutionAuthorized: false,
  ownerApprovalRequired: true,
  autoProduction: false,
  autoMerge: false,
});

export const GLH_PHASE9_READINESS_REPORT_VERSION =
  'glh-phase9-production-readiness-report/v1' as const;
export const GLH_PHASE9_EVIDENCE_MAX_AGE_DAYS = 7;
export const GLH_PHASE9_EVIDENCE_MAX_AGE_MS =
  GLH_PHASE9_EVIDENCE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

export const GLH_PHASE9_GATE_IDS = [
  'PILOT_BASELINE',
  'CHANNEL_ENVIRONMENT_SECURITY',
  'ROLLOUT_RECOVERY_POSTFLIGHT',
  'OWNER_APPROVAL',
] as const;

export type GlhPhase9GateId = (typeof GLH_PHASE9_GATE_IDS)[number];

export const GLH_PHASE9_EVIDENCE_REQUIREMENTS = [
  {
    id: 'PHASE8_PILOT_PASS',
    gate: 'PILOT_BASELINE',
    label: 'Phase 8 non-Production pilot evidence bundle passed',
    owner: 'GLH_PRODUCT_OWNER',
  },
  {
    id: 'ACCEPTANCE_CASES_A_G_PASS',
    gate: 'PILOT_BASELINE',
    label: 'Acceptance Cases A-G passed with evidence',
    owner: 'PHASE8_PILOT_OWNER',
  },
  {
    id: 'NON_PRODUCTION_BOUNDARY_PASS',
    gate: 'PILOT_BASELINE',
    label: 'Pilot data, users, and channels stayed non-Production',
    owner: 'GLH_PRODUCT_OWNER',
  },
  {
    id: 'CHANNEL_CONFIGURATION_REVIEW',
    gate: 'CHANNEL_ENVIRONMENT_SECURITY',
    label: 'Meta/WhatsApp channel and permissions reviewed',
    owner: 'CHANNEL_OWNER',
  },
  {
    id: 'META_WEBHOOK_SECURITY_REVIEW',
    gate: 'CHANNEL_ENVIRONMENT_SECURITY',
    label: 'Webhook token and HMAC signature verification reviewed',
    owner: 'GLH_SECURITY_OWNER',
  },
  {
    id: 'PRODUCTION_TARGET_REVIEW',
    gate: 'CHANNEL_ENVIRONMENT_SECURITY',
    label: 'Production and non-Production targets are distinct',
    owner: 'RELEASE_OWNER',
  },
  {
    id: 'SECRET_HANDLING_REVIEW',
    gate: 'CHANNEL_ENVIRONMENT_SECURITY',
    label: 'Server-only secret handling and redaction reviewed',
    owner: 'GLH_SECURITY_OWNER',
  },
  {
    id: 'RLS_AUTHORIZATION_REVIEW',
    gate: 'CHANNEL_ENVIRONMENT_SECURITY',
    label: 'RLS, roles, and cross-organization denial reviewed',
    owner: 'DATABASE_OWNER',
  },
  {
    id: 'AI_FAILURE_CONTAINMENT_REVIEW',
    gate: 'CHANNEL_ENVIRONMENT_SECURITY',
    label: 'AI/provider outage and human-work continuity reviewed',
    owner: 'SUPPORT_OWNER',
  },
  {
    id: 'ROLLOUT_PLAN_REVIEW',
    gate: 'ROLLOUT_RECOVERY_POSTFLIGHT',
    label: 'Staged rollout and observation plan reviewed',
    owner: 'RELEASE_OWNER',
  },
  {
    id: 'ROLLBACK_TARGET_RECORD',
    gate: 'ROLLOUT_RECOVERY_POSTFLIGHT',
    label: 'Previous deployment/channel rollback target recorded',
    owner: 'RELEASE_OWNER',
  },
  {
    id: 'STOP_CRITERIA_REVIEW',
    gate: 'ROLLOUT_RECOVERY_POSTFLIGHT',
    label: 'Stop and containment criteria reviewed',
    owner: 'INCIDENT_COMMANDER',
  },
  {
    id: 'ROLLBACK_DRILL_PASS',
    gate: 'ROLLOUT_RECOVERY_POSTFLIGHT',
    label: 'Non-Production rollback/containment drill passed',
    owner: 'ROLLBACK_OWNER',
  },
  {
    id: 'POSTFLIGHT_PLAN_REVIEW',
    gate: 'ROLLOUT_RECOVERY_POSTFLIGHT',
    label: 'Postflight checks and thresholds reviewed',
    owner: 'RELEASE_OWNER',
  },
  {
    id: 'INCIDENT_OWNERS_RECORD',
    gate: 'ROLLOUT_RECOVERY_POSTFLIGHT',
    label: 'Incident, support, and rollback owners recorded',
    owner: 'INCIDENT_COMMANDER',
  },
] as const;

export type GlhPhase9EvidenceId =
  (typeof GLH_PHASE9_EVIDENCE_REQUIREMENTS)[number]['id'];

export type GlhPhase9EvidenceStatus = 'PASS' | 'FAIL' | 'UNKNOWN';
export type GlhPhase9ReadinessResult =
  | 'NOT_READY'
  | 'OWNER_APPROVAL_REQUIRED'
  | 'READY_FOR_SEPARATE_PRODUCTION_EXECUTION';
export type GlhPhase9RevisionStatus = 'MATCH' | 'MISMATCH' | 'UNKNOWN';
export type GlhPhase9OwnerApprovalStatus = 'RECORDED' | 'REQUIRED' | 'INVALID';
export type GlhPhase9NextAction =
  | 'RESOLVE_REVISION_AND_EVIDENCE'
  | 'STOP_AND_REMEDIATE_FAILED_EVIDENCE'
  | 'COLLECT_MISSING_EVIDENCE'
  | 'OBTAIN_OWNER_APPROVAL'
  | 'STOP_FOR_SEPARATE_HUMAN_PRODUCTION_EXECUTION';

export type GlhPhase9IssueCode =
  | 'MISSING_REVISION'
  | 'INVALID_REVISION'
  | 'REVISION_MISMATCH'
  | 'RELEASE_SHA_MISMATCH'
  | 'MISSING_EVALUATION_TIMESTAMP'
  | 'INVALID_EVALUATION_TIMESTAMP'
  | 'MISSING_EVIDENCE'
  | 'INVALID_EVIDENCE_STATUS'
  | 'MISSING_EVIDENCE_OWNER'
  | 'EVIDENCE_OWNER_MISMATCH'
  | 'MISSING_EVIDENCE_REFERENCE'
  | 'INVALID_EVIDENCE_TIMESTAMP'
  | 'EVIDENCE_FROM_FUTURE'
  | 'EVIDENCE_STALE'
  | 'SECRET_LIKE_EVIDENCE_REFERENCE'
  | 'EVIDENCE_REPORTED_FAILURE'
  | 'OWNER_APPROVAL_REQUIRED'
  | 'INVALID_OWNER_APPROVAL'
  | 'OWNER_APPROVAL_FROM_FUTURE'
  | 'OWNER_APPROVAL_PRECEDES_EVIDENCE'
  | 'OWNER_APPROVAL_PHRASE_MISMATCH';

export interface GlhPhase9Issue {
  code: GlhPhase9IssueCode;
  path: string;
  message: string;
  evidenceId?: GlhPhase9EvidenceId;
}

export interface GlhPhase9EvidenceItem {
  status?: unknown;
  owner?: unknown;
  evidenceRef?: string | null;
  observedAt?: string | null;
}

export interface GlhPhase9OwnerApprovalRecord {
  phrase?: unknown;
  approvedBy?: unknown;
  approvedAt?: unknown;
}

export interface GlhPhase9ReadinessInput {
  baseMasterSha?: unknown;
  expectedHeadSha?: unknown;
  expectedReleaseSha?: unknown;
  candidateReleaseSha?: unknown;
  evaluatedAt?: unknown;
  evidence?: Partial<
    Record<GlhPhase9EvidenceId, GlhPhase9EvidenceItem | null | undefined>
  > | null;
  ownerApproval?: GlhPhase9OwnerApprovalRecord | null;
}

export interface GlhPhase9EvidenceReport {
  id: GlhPhase9EvidenceId;
  gate: GlhPhase9GateId;
  label: string;
  owner: string;
  status: GlhPhase9EvidenceStatus;
  ownerRecorded: boolean;
  ownerMatchesRequirement: boolean;
  evidenceRefRecorded: boolean;
  observedAtRecorded: boolean;
  issues: readonly GlhPhase9Issue[];
}

export interface GlhPhase9GateReport {
  id: GlhPhase9GateId;
  status: GlhPhase9EvidenceStatus;
}

export interface GlhPhase9RevisionReport {
  status: GlhPhase9RevisionStatus;
  baseMasterShaRecorded: boolean;
  expectedHeadShaRecorded: boolean;
  expectedReleaseShaRecorded: boolean;
  candidateReleaseShaRecorded: boolean;
  candidateMatchesExpectedRelease: boolean;
  issues: readonly GlhPhase9Issue[];
}

export interface GlhPhase9EvaluationReport {
  evaluatedAtRecorded: boolean;
  maximumEvidenceAgeMs: typeof GLH_PHASE9_EVIDENCE_MAX_AGE_MS;
  issues: readonly GlhPhase9Issue[];
}

export interface GlhPhase9OwnerApprovalReport {
  status: GlhPhase9OwnerApprovalStatus;
  required: true;
  exactPhraseRecorded: boolean;
  approverRecorded: boolean;
  approvedAtRecorded: boolean;
  issues: readonly GlhPhase9Issue[];
}

export interface GlhPhase9ProductionReadinessReport {
  reportVersion: typeof GLH_PHASE9_READINESS_REPORT_VERSION;
  taskId: typeof GLH_PHASE9_PRODUCTION_READINESS_TASK.taskId;
  mode: 'REPOSITORY_ONLY';
  productionChanged: false;
  overallStatus: GlhPhase9ReadinessResult;
  accepted: boolean;
  productionExecutionAuthorized: false;
  activationAuthorizedByThisReport: false;
  ownerApprovalRequired: true;
  autoProduction: false;
  nextAction: GlhPhase9NextAction;
  evaluation: GlhPhase9EvaluationReport;
  revision: GlhPhase9RevisionReport;
  evidence: readonly GlhPhase9EvidenceReport[];
  gates: readonly GlhPhase9GateReport[];
  ownerApproval: GlhPhase9OwnerApprovalReport;
  missingEvidence: readonly GlhPhase9EvidenceId[];
  failedEvidence: readonly GlhPhase9EvidenceId[];
  unknownEvidence: readonly GlhPhase9EvidenceId[];
  issues: readonly GlhPhase9Issue[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeString(value: unknown): string {
  return isNonEmptyString(value) ? value.trim() : '';
}

function isFullSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value.trim());
}

function parseIsoTimestamp(value: unknown): number | null {
  if (!isNonEmptyString(value)) return null;
  const normalized = value.trim();
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(
      normalized,
    );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] ?? '').padEnd(3, '0') || '0');
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  parsed.setUTCHours(hour, minute, second, millisecond);

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
    && parsed.getUTCHours() === hour
    && parsed.getUTCMinutes() === minute
    && parsed.getUTCSeconds() === second
    && parsed.getUTCMilliseconds() === millisecond
    ? parsed.getTime()
    : null;
}

function isIsoTimestamp(value: unknown): value is string {
  return parseIsoTimestamp(value) !== null;
}

function containsSecretLikeReference(value: string): boolean {
  return /(?:service[_-]?role|access[_-]?token\s*=|app[_-]?secret\s*=|client[_-]?secret\s*=|bearer\s+\S+|sk-[a-z0-9-]{8,}|-----BEGIN|eyJ[a-z0-9_-]{10,}\.)/i.test(value);
}

function makeIssue(
  code: GlhPhase9IssueCode,
  path: string,
  message: string,
  evidenceId?: GlhPhase9EvidenceId,
): GlhPhase9Issue {
  return evidenceId
    ? { code, path, message, evidenceId }
    : { code, path, message };
}

export function buildGlhPhase9OwnerApprovalPhrase(
  candidateReleaseSha: string,
): string {
  return `APPROVE GLH PHASE 9 PRODUCTION ACTIVATION FOR ${candidateReleaseSha.trim()} AFTER ALL READINESS EVIDENCE AND ROLLBACK DRILL`;
}

function evaluateRevision(
  input: GlhPhase9ReadinessInput,
): GlhPhase9RevisionReport {
  const issues: GlhPhase9Issue[] = [];
  const baseMasterSha = normalizeString(input.baseMasterSha);
  const expectedHeadSha = normalizeString(input.expectedHeadSha);
  const expectedReleaseSha = normalizeString(input.expectedReleaseSha);
  const candidateReleaseSha = normalizeString(input.candidateReleaseSha);
  const fields = [
    ['baseMasterSha', baseMasterSha],
    ['expectedHeadSha', expectedHeadSha],
    ['expectedReleaseSha', expectedReleaseSha],
    ['candidateReleaseSha', candidateReleaseSha],
  ] as const;

  for (const [field, value] of fields) {
    if (!value) {
      issues.push(makeIssue(
        'MISSING_REVISION',
        field,
        `${field} is required.`,
      ));
    } else if (!isFullSha(value)) {
      issues.push(makeIssue(
        'INVALID_REVISION',
        field,
        `${field} must be a full 40-character SHA.`,
      ));
    }
  }

  if (
    baseMasterSha
    && isFullSha(baseMasterSha)
    && baseMasterSha.toLowerCase()
      !== GLH_PHASE9_PRODUCTION_READINESS_TASK.baseMasterSha
  ) {
    issues.push(makeIssue(
      'REVISION_MISMATCH',
      'baseMasterSha',
      'baseMasterSha does not match the recorded task base.',
    ));
  }
  if (
    expectedHeadSha
    && isFullSha(expectedHeadSha)
    && expectedHeadSha.toLowerCase()
      !== GLH_PHASE9_PRODUCTION_READINESS_TASK.expectedHeadSha
  ) {
    issues.push(makeIssue(
      'REVISION_MISMATCH',
      'expectedHeadSha',
      'expectedHeadSha does not match the recorded task head.',
    ));
  }
  const candidateMatchesExpectedRelease =
    isFullSha(expectedReleaseSha)
    && isFullSha(candidateReleaseSha)
    && expectedReleaseSha.toLowerCase() === candidateReleaseSha.toLowerCase();
  if (
    isFullSha(expectedReleaseSha)
    && isFullSha(candidateReleaseSha)
    && !candidateMatchesExpectedRelease
  ) {
    issues.push(makeIssue(
      'RELEASE_SHA_MISMATCH',
      'candidateReleaseSha',
      'candidateReleaseSha must match the supplied expectedReleaseSha.',
    ));
  }

  const hasMismatch = issues.some(issue =>
    issue.code === 'REVISION_MISMATCH'
    || issue.code === 'RELEASE_SHA_MISMATCH'
  );
  const hasIncomplete = issues.some(issue =>
    issue.code === 'MISSING_REVISION' || issue.code === 'INVALID_REVISION'
  );

  return {
    status: hasMismatch ? 'MISMATCH' : hasIncomplete ? 'UNKNOWN' : 'MATCH',
    baseMasterShaRecorded: isFullSha(baseMasterSha),
    expectedHeadShaRecorded: isFullSha(expectedHeadSha),
    expectedReleaseShaRecorded: isFullSha(expectedReleaseSha),
    candidateReleaseShaRecorded: isFullSha(candidateReleaseSha),
    candidateMatchesExpectedRelease,
    issues,
  };
}

function evaluateEvaluationTimestamp(
  input: GlhPhase9ReadinessInput,
): GlhPhase9EvaluationReport {
  const evaluatedAt = normalizeString(input.evaluatedAt);
  const issues: GlhPhase9Issue[] = [];

  if (!evaluatedAt) {
    issues.push(makeIssue(
      'MISSING_EVALUATION_TIMESTAMP',
      'evaluatedAt',
      'An explicit ISO-8601 UTC evaluation timestamp is required.',
    ));
  } else if (!isIsoTimestamp(evaluatedAt)) {
    issues.push(makeIssue(
      'INVALID_EVALUATION_TIMESTAMP',
      'evaluatedAt',
      'evaluatedAt must be a valid ISO-8601 UTC timestamp.',
    ));
  }

  return {
    evaluatedAtRecorded: isIsoTimestamp(evaluatedAt),
    maximumEvidenceAgeMs: GLH_PHASE9_EVIDENCE_MAX_AGE_MS,
    issues,
  };
}

function evaluateEvidenceItem(
  requirement: (typeof GLH_PHASE9_EVIDENCE_REQUIREMENTS)[number],
  item: GlhPhase9EvidenceItem | null | undefined,
  evaluatedAtMs: number | null,
): GlhPhase9EvidenceReport {
  if (!item) {
    return {
      id: requirement.id,
      gate: requirement.gate,
      label: requirement.label,
      owner: requirement.owner,
      status: 'UNKNOWN',
      ownerRecorded: false,
      ownerMatchesRequirement: false,
      evidenceRefRecorded: false,
      observedAtRecorded: false,
      issues: [makeIssue(
        'MISSING_EVIDENCE',
        `evidence.${requirement.id}`,
        'Evidence is missing and remains UNKNOWN.',
        requirement.id,
      )],
    };
  }

  const issues: GlhPhase9Issue[] = [];
  const evidenceOwner = normalizeString(item.owner);
  const ownerMatchesRequirement = evidenceOwner === requirement.owner;
  const evidenceRef = normalizeString(item.evidenceRef);
  const observedAt = normalizeString(item.observedAt);
  const observedAtMs = parseIsoTimestamp(observedAt);
  const status = item.status;

  if (status !== 'PASS' && status !== 'FAIL') {
    issues.push(makeIssue(
      'INVALID_EVIDENCE_STATUS',
      `evidence.${requirement.id}.status`,
      'Evidence status must be explicitly PASS or FAIL; missing or malformed status is UNKNOWN.',
      requirement.id,
    ));
  }
  if (!evidenceOwner) {
    issues.push(makeIssue(
      'MISSING_EVIDENCE_OWNER',
      `evidence.${requirement.id}.owner`,
      `The evidence owner must be ${requirement.owner}.`,
      requirement.id,
    ));
  } else if (!ownerMatchesRequirement) {
    issues.push(makeIssue(
      'EVIDENCE_OWNER_MISMATCH',
      `evidence.${requirement.id}.owner`,
      `The evidence owner must match ${requirement.owner}.`,
      requirement.id,
    ));
  }
  if (!evidenceRef) {
    issues.push(makeIssue(
      'MISSING_EVIDENCE_REFERENCE',
      `evidence.${requirement.id}.evidenceRef`,
      'A non-secret evidence reference is required.',
      requirement.id,
    ));
  } else if (containsSecretLikeReference(evidenceRef)) {
    issues.push(makeIssue(
      'SECRET_LIKE_EVIDENCE_REFERENCE',
      `evidence.${requirement.id}.evidenceRef`,
      'Evidence references must not contain secret-like values.',
      requirement.id,
    ));
  }
  if (observedAtMs === null) {
    issues.push(makeIssue(
      'INVALID_EVIDENCE_TIMESTAMP',
      `evidence.${requirement.id}.observedAt`,
      'A valid ISO-8601 UTC observation timestamp is required.',
      requirement.id,
    ));
  } else if (evaluatedAtMs === null) {
    issues.push(makeIssue(
      'INVALID_EVALUATION_TIMESTAMP',
      `evidence.${requirement.id}.observedAt`,
      'Evidence freshness cannot be verified without a valid evaluatedAt.',
      requirement.id,
    ));
  } else if (observedAtMs > evaluatedAtMs) {
    issues.push(makeIssue(
      'EVIDENCE_FROM_FUTURE',
      `evidence.${requirement.id}.observedAt`,
      'Evidence observation time is later than the evaluation timestamp.',
      requirement.id,
    ));
  } else if (evaluatedAtMs - observedAtMs > GLH_PHASE9_EVIDENCE_MAX_AGE_MS) {
    issues.push(makeIssue(
      'EVIDENCE_STALE',
      `evidence.${requirement.id}.observedAt`,
      'Evidence is older than the seven-day freshness window.',
      requirement.id,
    ));
  }
  if (status === 'FAIL' && issues.length === 0) {
    issues.push(makeIssue(
      'EVIDENCE_REPORTED_FAILURE',
      `evidence.${requirement.id}.status`,
      'Evidence explicitly reports FAIL.',
      requirement.id,
    ));
  }

  const resolvedStatus: GlhPhase9EvidenceStatus = issues.some(issue =>
    issue.code === 'EVIDENCE_REPORTED_FAILURE'
  )
    ? 'FAIL'
    : issues.length > 0
      ? 'UNKNOWN'
      : 'PASS';

  return {
    id: requirement.id,
    gate: requirement.gate,
    label: requirement.label,
    owner: requirement.owner,
    status: resolvedStatus,
    ownerRecorded: evidenceOwner.length > 0,
    ownerMatchesRequirement,
    evidenceRefRecorded: evidenceRef.length > 0,
    observedAtRecorded: isIsoTimestamp(observedAt),
    issues,
  };
}

function evaluateOwnerApproval(
  input: GlhPhase9ReadinessInput,
  candidateReleaseSha: string,
  candidateMatchesExpectedRelease: boolean,
  evaluatedAtMs: number | null,
  latestEvidenceAtMs: number | null,
): GlhPhase9OwnerApprovalReport {
  const approval = input.ownerApproval;
  const phrase = normalizeString(approval?.phrase);
  const approvedBy = normalizeString(approval?.approvedBy);
  const approvedAt = normalizeString(approval?.approvedAt);
  const approvedAtMs = parseIsoTimestamp(approvedAt);
  const expectedPhrase =
    isFullSha(candidateReleaseSha) && candidateMatchesExpectedRelease
    ? buildGlhPhase9OwnerApprovalPhrase(candidateReleaseSha)
    : '';
  const exactPhraseRecorded = Boolean(expectedPhrase) && phrase === expectedPhrase;
  const approverRecorded = approvedBy.length > 0;
  const approvedAtRecorded = approvedAtMs !== null;
  const anyApprovalField = Boolean(phrase || approvedBy || approvedAt);
  const issues: GlhPhase9Issue[] = [];

  if (!anyApprovalField) {
    issues.push(makeIssue(
      'OWNER_APPROVAL_REQUIRED',
      'ownerApproval',
      'Exact owner approval remains mandatory before separate Production execution.',
    ));
    return {
      status: 'REQUIRED',
      required: true,
      exactPhraseRecorded: false,
      approverRecorded: false,
      approvedAtRecorded: false,
      issues,
    };
  }

  if (!exactPhraseRecorded) {
    issues.push(makeIssue(
      'OWNER_APPROVAL_PHRASE_MISMATCH',
      'ownerApproval.phrase',
      'Owner approval phrase does not exactly match the candidate release phrase.',
    ));
  }
  if (!approverRecorded || !approvedAtRecorded) {
    issues.push(makeIssue(
      'INVALID_OWNER_APPROVAL',
      'ownerApproval',
      'Approver identity and ISO-8601 approval timestamp are required.',
    ));
  }
  if (
    approvedAtMs !== null
    && evaluatedAtMs !== null
    && approvedAtMs > evaluatedAtMs
  ) {
    issues.push(makeIssue(
      'OWNER_APPROVAL_FROM_FUTURE',
      'ownerApproval.approvedAt',
      'Owner approval cannot be later than the evaluation timestamp.',
    ));
  }
  if (
    approvedAtMs !== null
    && latestEvidenceAtMs !== null
    && approvedAtMs < latestEvidenceAtMs
  ) {
    issues.push(makeIssue(
      'OWNER_APPROVAL_PRECEDES_EVIDENCE',
      'ownerApproval.approvedAt',
      'Owner approval must be recorded after all readiness evidence observations.',
    ));
  }

  return {
    status: exactPhraseRecorded
      && approverRecorded
      && approvedAtRecorded
      && issues.length === 0
      ? 'RECORDED'
      : 'INVALID',
    required: true,
    exactPhraseRecorded,
    approverRecorded,
    approvedAtRecorded,
    issues,
  };
}

export function evaluateGlhPhase9ProductionReadiness(
  input: GlhPhase9ReadinessInput | null | undefined,
): GlhPhase9ProductionReadinessReport {
  const safeInput = input ?? {};
  const evaluation = evaluateEvaluationTimestamp(safeInput);
  const evaluatedAtMs = evaluation.evaluatedAtRecorded
    ? parseIsoTimestamp(safeInput.evaluatedAt)
    : null;
  const revision = evaluateRevision(safeInput);
  const evidence = GLH_PHASE9_EVIDENCE_REQUIREMENTS.map(requirement =>
    evaluateEvidenceItem(
      requirement,
      safeInput.evidence?.[requirement.id],
      evaluatedAtMs,
    )
  );
  const candidateReleaseSha = normalizeString(safeInput.candidateReleaseSha);
  const latestEvidenceAtMs = GLH_PHASE9_EVIDENCE_REQUIREMENTS.reduce<number | null>(
    (latest, requirement) => {
      const observedAtMs = parseIsoTimestamp(
        safeInput.evidence?.[requirement.id]?.observedAt,
      );
      if (observedAtMs === null) return latest;
      return latest === null || observedAtMs > latest ? observedAtMs : latest;
    },
    null,
  );
  const ownerApproval = evaluateOwnerApproval(
    safeInput,
    candidateReleaseSha,
    revision.candidateMatchesExpectedRelease,
    evaluatedAtMs,
    latestEvidenceAtMs,
  );
  const missingEvidence = evidence
    .filter(item => item.issues.some(issue => issue.code === 'MISSING_EVIDENCE'))
    .map(item => item.id);
  const failedEvidence = evidence
    .filter(item => item.status === 'FAIL')
    .map(item => item.id);
  const unknownEvidence = evidence
    .filter(item => item.status === 'UNKNOWN')
    .map(item => item.id);
  const evidenceIssues = evidence.flatMap(item => item.issues);
  const issues = [
    ...revision.issues,
    ...evaluation.issues,
    ...evidenceIssues,
    ...ownerApproval.issues,
  ];
  const allEvidencePass = evidence.every(item => item.status === 'PASS');
  const revisionMatches = revision.status === 'MATCH';
  const evaluationValid = evaluation.evaluatedAtRecorded;

  let overallStatus: GlhPhase9ReadinessResult;
  let nextAction: GlhPhase9NextAction;

  if (!revisionMatches || !evaluationValid) {
    overallStatus = 'NOT_READY';
    nextAction = 'RESOLVE_REVISION_AND_EVIDENCE';
  } else if (failedEvidence.length > 0) {
    overallStatus = 'NOT_READY';
    nextAction = 'STOP_AND_REMEDIATE_FAILED_EVIDENCE';
  } else if (!allEvidencePass || ownerApproval.status === 'INVALID') {
    overallStatus = 'NOT_READY';
    nextAction = 'COLLECT_MISSING_EVIDENCE';
  } else if (ownerApproval.status === 'REQUIRED') {
    overallStatus = 'OWNER_APPROVAL_REQUIRED';
    nextAction = 'OBTAIN_OWNER_APPROVAL';
  } else {
    overallStatus = 'READY_FOR_SEPARATE_PRODUCTION_EXECUTION';
    nextAction = 'STOP_FOR_SEPARATE_HUMAN_PRODUCTION_EXECUTION';
  }

  const gateStatus = (
    gate: Exclude<GlhPhase9GateId, 'OWNER_APPROVAL'>,
  ): GlhPhase9EvidenceStatus => {
    const gateEvidence = evidence.filter(item => item.gate === gate);
    if (gateEvidence.some(item => item.status === 'FAIL')) return 'FAIL';
    if (gateEvidence.some(item => item.status === 'UNKNOWN')) return 'UNKNOWN';
    return 'PASS';
  };

  const gates: GlhPhase9GateReport[] = [
    {
      id: 'PILOT_BASELINE',
      status: gateStatus('PILOT_BASELINE'),
    },
    {
      id: 'CHANNEL_ENVIRONMENT_SECURITY',
      status: gateStatus('CHANNEL_ENVIRONMENT_SECURITY'),
    },
    {
      id: 'ROLLOUT_RECOVERY_POSTFLIGHT',
      status: gateStatus('ROLLOUT_RECOVERY_POSTFLIGHT'),
    },
    {
      id: 'OWNER_APPROVAL',
      status: ownerApproval.status === 'RECORDED'
        ? 'PASS'
        : ownerApproval.status === 'INVALID'
          ? 'FAIL'
          : 'UNKNOWN',
    },
  ];

  return {
    reportVersion: GLH_PHASE9_READINESS_REPORT_VERSION,
    taskId: GLH_PHASE9_PRODUCTION_READINESS_TASK.taskId,
    mode: 'REPOSITORY_ONLY',
    productionChanged: false,
    overallStatus,
    accepted: overallStatus === 'READY_FOR_SEPARATE_PRODUCTION_EXECUTION',
    productionExecutionAuthorized: false,
    activationAuthorizedByThisReport: false,
    ownerApprovalRequired: true,
    autoProduction: false,
    nextAction,
    evaluation,
    revision,
    evidence,
    gates,
    ownerApproval,
    missingEvidence,
    failedEvidence,
    unknownEvidence,
    issues,
  };
}
