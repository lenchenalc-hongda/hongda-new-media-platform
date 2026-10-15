/**
 * Pure evaluator for GLH non-Production evidence preparation.
 *
 * It performs no environment, network, filesystem, database, provider or
 * Production access. Missing or malformed evidence fails closed as UNKNOWN.
 */

export const GLH_PHASE9_EVIDENCE_PREP_TASK = Object.freeze({
  taskId: 'GLH-P9-EVIDENCE-PREP-002',
  project: 'global-lead-hub',
  baseMasterSha: '1708f43753409b891a40c6110e2e6d3e7a549b2a',
  mode: 'REPOSITORY_ONLY',
  productionChanged: false,
  productionExecutionAuthorized: false,
  humanGateRequired: true,
});

export const GLH_PHASE9_PRODUCTION_HUMAN_GATE_PHRASE =
  'APPROVE GLH PRODUCTION EXECUTION FOR <40_CHAR_RELEASE_SHA> WITH REVIEWED META, SUPABASE, VERCEL, ROLLOUT AND ROLLBACK EVIDENCE' as const;

export const GLH_PHASE9_ENV_NAME_PREREQUISITES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'META_APP_SECRET',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_VERIFY_TOKEN',
  'GLH_PROVIDER_CALLS_ENABLED',
] as const;

export const GLH_PHASE9_EVIDENCE_PREP_REQUIREMENTS = [
  ['META_BUSINESS_PREREQUISITES', 'CHANNEL_OWNER'],
  ['META_WEBHOOK_VERIFICATION', 'GLH_SECURITY_OWNER'],
  ['META_WEBHOOK_SIGNATURE', 'GLH_SECURITY_OWNER'],
  ['WEBHOOK_IDEMPOTENCY', 'GLH_ENGINEERING_OWNER'],
  ['SUPABASE_SCHEMA_INVENTORY', 'DATABASE_OWNER'],
  ['SUPABASE_RLS_GRANTS', 'DATABASE_OWNER'],
  ['SUPABASE_ADVISORS', 'DATABASE_OWNER'],
  ['VERCEL_ENV_NAMES', 'RELEASE_OWNER'],
  ['SECRET_REDACTION', 'GLH_SECURITY_OWNER'],
  ['AI_FORBIDDEN_CLAIMS', 'GLH_PRODUCT_OWNER'],
  ['HUMAN_HANDOFF', 'GLH_PRODUCT_OWNER'],
  ['AI_PROVIDER_OUTAGE', 'SUPPORT_OWNER'],
  ['RLS_ACCEPTANCE', 'DATABASE_OWNER'],
  ['ROLLOUT_DRY_RUN', 'RELEASE_OWNER'],
  ['CONTAINMENT_DRY_RUN', 'INCIDENT_COMMANDER'],
  ['ROLLBACK_DRY_RUN', 'ROLLBACK_OWNER'],
] as const;

export type GlhPhase9EvidencePrepId =
  (typeof GLH_PHASE9_EVIDENCE_PREP_REQUIREMENTS)[number][0];
export type GlhPhase9EvidenceOwner =
  (typeof GLH_PHASE9_EVIDENCE_PREP_REQUIREMENTS)[number][1];
export type GlhPhase9EvidenceStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface GlhPhase9EvidenceRecord {
  status?: unknown;
  ownerRole?: unknown;
  evidenceRef?: unknown;
  observedAt?: unknown;
  candidateSha?: unknown;
  targetAlias?: unknown;
}

export interface GlhPhase9EvidencePrepInput {
  taskId?: unknown;
  baseMasterSha?: unknown;
  candidateSha?: unknown;
  evaluatedAt?: unknown;
  evidence?: Partial<
    Record<GlhPhase9EvidencePrepId, GlhPhase9EvidenceRecord | null>
  > | null;
  productionSqlExecuted?: unknown;
  productionRlsOrGrantsChanged?: unknown;
  productionEnvOrSecretsChanged?: unknown;
  productionDataChanged?: unknown;
  realProviderCutoverExecuted?: unknown;
  realCustomerMessageSent?: unknown;
  externalPublishingExecuted?: unknown;
  authenticationWeakened?: unknown;
}

export interface GlhPhase9EvidenceResult {
  id: GlhPhase9EvidencePrepId;
  requiredOwner: GlhPhase9EvidenceOwner;
  status: GlhPhase9EvidenceStatus;
  issues: readonly string[];
}

export interface GlhPhase9EvidencePrepReport {
  taskId: typeof GLH_PHASE9_EVIDENCE_PREP_TASK.taskId;
  overallStatus: 'NOT_READY' | 'READY_FOR_HUMAN_GATE';
  evidence: readonly GlhPhase9EvidenceResult[];
  pass: readonly GlhPhase9EvidencePrepId[];
  fail: readonly GlhPhase9EvidencePrepId[];
  unknown: readonly GlhPhase9EvidencePrepId[];
  issues: readonly string[];
  humanGateRequired: true;
  productionExecutionAuthorized: false;
  productionChanged: false;
}

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SECRET_LIKE_PATTERN =
  /(?:sk-[a-z0-9_-]{12,}|eyJ[a-zA-Z0-9_-]{12,}|(?:token|secret|password|service[_-]?role)[=:][^\s/]{8,})/i;

function isExactUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_UTC_PATTERN.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function normalizeEvidence(
  id: GlhPhase9EvidencePrepId,
  requiredOwner: GlhPhase9EvidenceOwner,
  record: GlhPhase9EvidenceRecord | null | undefined,
  candidateSha: string | null,
  evaluatedAt: string | null,
): GlhPhase9EvidenceResult {
  const issues: string[] = [];
  let status: GlhPhase9EvidenceStatus = 'UNKNOWN';

  if (!record) {
    issues.push('MISSING_EVIDENCE');
    return { id, requiredOwner, status, issues };
  }

  if (!['PASS', 'FAIL', 'UNKNOWN'].includes(String(record.status))) {
    issues.push('INVALID_STATUS');
  } else {
    status = record.status as GlhPhase9EvidenceStatus;
  }

  if (record.ownerRole !== requiredOwner) issues.push('OWNER_MISMATCH');
  if (typeof record.evidenceRef !== 'string' || !record.evidenceRef.trim()) {
    issues.push('MISSING_EVIDENCE_REFERENCE');
  } else if (SECRET_LIKE_PATTERN.test(record.evidenceRef)) {
    issues.push('SECRET_LIKE_EVIDENCE_REFERENCE');
  }
  if (!isExactUtcTimestamp(record.observedAt)) {
    issues.push('INVALID_OBSERVED_AT');
  } else if (evaluatedAt && Date.parse(record.observedAt) > Date.parse(evaluatedAt)) {
    issues.push('EVIDENCE_FROM_FUTURE');
  }
  if (!candidateSha || record.candidateSha !== candidateSha) {
    issues.push('CANDIDATE_SHA_MISMATCH');
  }
  if (typeof record.targetAlias !== 'string' || !record.targetAlias.trim()) {
    issues.push('MISSING_TARGET_ALIAS');
  }

  if (issues.length > 0) status = 'UNKNOWN';
  return { id, requiredOwner, status, issues };
}

export function buildGlhPhase9HumanGatePhrase(candidateSha: string): string {
  return GLH_PHASE9_PRODUCTION_HUMAN_GATE_PHRASE.replace(
    '<40_CHAR_RELEASE_SHA>',
    candidateSha,
  );
}

export function evaluateGlhPhase9EvidencePrep(
  input: GlhPhase9EvidencePrepInput,
): GlhPhase9EvidencePrepReport {
  const issues: string[] = [];
  const candidateSha =
    typeof input.candidateSha === 'string' && SHA_PATTERN.test(input.candidateSha)
      ? input.candidateSha
      : null;
  const evaluatedAt = isExactUtcTimestamp(input.evaluatedAt)
    ? input.evaluatedAt
    : null;

  if (input.taskId !== GLH_PHASE9_EVIDENCE_PREP_TASK.taskId) {
    issues.push('TASK_ID_MISMATCH');
  }
  if (input.baseMasterSha !== GLH_PHASE9_EVIDENCE_PREP_TASK.baseMasterSha) {
    issues.push('BASE_MASTER_SHA_MISMATCH');
  }
  if (!candidateSha) issues.push('INVALID_CANDIDATE_SHA');
  if (!evaluatedAt) issues.push('INVALID_EVALUATED_AT');

  const prohibitedFlags = [
    ['PRODUCTION_SQL_EXECUTED', input.productionSqlExecuted],
    ['PRODUCTION_RLS_OR_GRANTS_CHANGED', input.productionRlsOrGrantsChanged],
    ['PRODUCTION_ENV_OR_SECRETS_CHANGED', input.productionEnvOrSecretsChanged],
    ['PRODUCTION_DATA_CHANGED', input.productionDataChanged],
    ['REAL_PROVIDER_CUTOVER_EXECUTED', input.realProviderCutoverExecuted],
    ['REAL_CUSTOMER_MESSAGE_SENT', input.realCustomerMessageSent],
    ['EXTERNAL_PUBLISHING_EXECUTED', input.externalPublishingExecuted],
    ['AUTHENTICATION_WEAKENED', input.authenticationWeakened],
  ] as const;

  for (const [name, value] of prohibitedFlags) {
    if (value !== false) issues.push(`${name}_MUST_BE_FALSE`);
  }

  const evidence = GLH_PHASE9_EVIDENCE_PREP_REQUIREMENTS.map(([id, owner]) =>
    normalizeEvidence(
      id,
      owner,
      input.evidence?.[id],
      candidateSha,
      evaluatedAt,
    ),
  );
  const pass = evidence.filter(item => item.status === 'PASS').map(item => item.id);
  const fail = evidence.filter(item => item.status === 'FAIL').map(item => item.id);
  const unknown = evidence
    .filter(item => item.status === 'UNKNOWN')
    .map(item => item.id);
  const overallStatus =
    issues.length === 0 && fail.length === 0 && unknown.length === 0
      ? 'READY_FOR_HUMAN_GATE'
      : 'NOT_READY';

  return {
    taskId: GLH_PHASE9_EVIDENCE_PREP_TASK.taskId,
    overallStatus,
    evidence,
    pass,
    fail,
    unknown,
    issues,
    humanGateRequired: true,
    productionExecutionAuthorized: false,
    productionChanged: false,
  };
}

