/**
 * Fail-closed evaluator for the GLH Phase 9 repository-only rehearsal.
 *
 * This module is intentionally pure: it performs no environment, network,
 * filesystem, database, provider, or Production access. Production-only
 * evidence remains UNKNOWN until a separately authorized Human Gate task.
 */

export const GLH_PHASE9_NONPRODUCTION_REHEARSAL_TASK = Object.freeze({
  taskId: 'GLH-P9-NONPROD-REHEARSAL-003',
  project: 'global-lead-hub',
  baseMasterSha: 'd04b2cdea3060828f216782ee05c3d4b01f5ea26',
  mode: 'REPOSITORY_ONLY_SYNTHETIC',
  productionChanged: false,
  productionExecutionAuthorized: false,
  humanGateRequired: true,
});

export const GLH_PHASE9_REHEARSAL_REQUIREMENTS = [
  ['META_BUSINESS_PREREQUISITES', 'CHANNEL_OWNER', 'HUMAN_GATE'],
  ['META_WEBHOOK_VERIFICATION', 'GLH_SECURITY_OWNER', 'REPOSITORY'],
  ['META_WEBHOOK_SIGNATURE', 'GLH_SECURITY_OWNER', 'REPOSITORY'],
  ['WEBHOOK_IDEMPOTENCY', 'GLH_ENGINEERING_OWNER', 'REPOSITORY'],
  ['SUPABASE_SCHEMA_INVENTORY', 'DATABASE_OWNER', 'HUMAN_GATE'],
  ['SUPABASE_RLS_GRANTS', 'DATABASE_OWNER', 'HUMAN_GATE'],
  ['SUPABASE_ADVISORS', 'DATABASE_OWNER', 'HUMAN_GATE'],
  ['VERCEL_ENV_NAMES', 'RELEASE_OWNER', 'HUMAN_GATE'],
  ['SECRET_REDACTION', 'GLH_SECURITY_OWNER', 'REPOSITORY'],
  ['AI_FORBIDDEN_CLAIMS', 'GLH_PRODUCT_OWNER', 'REPOSITORY'],
  ['HUMAN_HANDOFF', 'GLH_PRODUCT_OWNER', 'REPOSITORY'],
  ['AI_PROVIDER_OUTAGE', 'SUPPORT_OWNER', 'REPOSITORY'],
  ['RLS_ACCEPTANCE', 'DATABASE_OWNER', 'REPOSITORY'],
  ['ROLLOUT_DRY_RUN', 'RELEASE_OWNER', 'REPOSITORY'],
  ['CONTAINMENT_DRY_RUN', 'INCIDENT_COMMANDER', 'REPOSITORY'],
  ['ROLLBACK_DRY_RUN', 'ROLLBACK_OWNER', 'REPOSITORY'],
] as const;

export type GlhPhase9RehearsalId =
  (typeof GLH_PHASE9_REHEARSAL_REQUIREMENTS)[number][0];
export type GlhPhase9RehearsalOwner =
  (typeof GLH_PHASE9_REHEARSAL_REQUIREMENTS)[number][1];
export type GlhPhase9RehearsalExecution =
  (typeof GLH_PHASE9_REHEARSAL_REQUIREMENTS)[number][2];
export type GlhPhase9RehearsalStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export type GlhPhase9RepositoryRehearsalId = Extract<
  (typeof GLH_PHASE9_REHEARSAL_REQUIREMENTS)[number],
  readonly [string, string, 'REPOSITORY']
>[0];

export interface GlhPhase9RepositoryObservation {
  passed?: unknown;
  ownerRole?: unknown;
  evidenceRef?: unknown;
  observedAt?: unknown;
  candidateSha?: unknown;
  targetAlias?: unknown;
}

export interface GlhPhase9NonproductionRehearsalInput {
  taskId?: unknown;
  baseMasterSha?: unknown;
  candidateSha?: unknown;
  evaluatedAt?: unknown;
  targetAlias?: unknown;
  observations?: Partial<
    Record<GlhPhase9RepositoryRehearsalId, GlhPhase9RepositoryObservation | null>
  > | null;
  productionSqlExecuted?: unknown;
  productionRlsOrGrantsChanged?: unknown;
  productionEnvOrSecretsReadOrChanged?: unknown;
  productionDataChanged?: unknown;
  realProviderCutoverExecuted?: unknown;
  realCustomerMessageSent?: unknown;
  externalPublishingExecuted?: unknown;
  authenticationWeakened?: unknown;
}

export interface GlhPhase9RehearsalEvidenceResult {
  id: GlhPhase9RehearsalId;
  requiredOwner: GlhPhase9RehearsalOwner;
  execution: GlhPhase9RehearsalExecution;
  status: GlhPhase9RehearsalStatus;
  evidenceRef: string | null;
  issues: readonly string[];
}

export interface GlhPhase9NonproductionRehearsalReport {
  taskId: typeof GLH_PHASE9_NONPRODUCTION_REHEARSAL_TASK.taskId;
  rehearsalStatus: 'PASS' | 'FAIL';
  productionReadiness: 'NOT_READY';
  evidence: readonly GlhPhase9RehearsalEvidenceResult[];
  pass: readonly GlhPhase9RehearsalId[];
  fail: readonly GlhPhase9RehearsalId[];
  unknown: readonly GlhPhase9RehearsalId[];
  issues: readonly string[];
  humanGateRequired: true;
  productionExecutionAuthorized: false;
  productionChanged: false;
}

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SAFE_REFERENCE_PATTERN =
  /^(?:repository|artifact):\/\/[a-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/i;
const SECRET_LIKE_PATTERN =
  /(?:sk-[a-z0-9_-]{12,}|eyJ[a-zA-Z0-9_-]{12,}|(?:token|secret|password|service[_-]?role)[=:][^\s/]{8,})/i;

function isUtcTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && ISO_UTC_PATTERN.test(value)
    && !Number.isNaN(Date.parse(value));
}

function evaluateRepositoryObservation(
  id: GlhPhase9RepositoryRehearsalId,
  requiredOwner: GlhPhase9RehearsalOwner,
  observation: GlhPhase9RepositoryObservation | null | undefined,
  candidateSha: string | null,
  evaluatedAt: string | null,
  targetAlias: string | null,
): GlhPhase9RehearsalEvidenceResult {
  const issues: string[] = [];
  let evidenceRef: string | null = null;

  if (!observation) {
    return {
      id,
      requiredOwner,
      execution: 'REPOSITORY',
      status: 'UNKNOWN',
      evidenceRef,
      issues: ['MISSING_REPOSITORY_OBSERVATION'],
    };
  }

  if (observation.ownerRole !== requiredOwner) issues.push('OWNER_MISMATCH');
  if (
    typeof observation.evidenceRef !== 'string'
    || !SAFE_REFERENCE_PATTERN.test(observation.evidenceRef)
    || SECRET_LIKE_PATTERN.test(observation.evidenceRef)
  ) {
    issues.push('UNSAFE_OR_MISSING_EVIDENCE_REFERENCE');
  } else {
    evidenceRef = observation.evidenceRef;
  }
  if (!isUtcTimestamp(observation.observedAt)) {
    issues.push('INVALID_OBSERVED_AT');
  } else if (evaluatedAt && Date.parse(observation.observedAt) > Date.parse(evaluatedAt)) {
    issues.push('EVIDENCE_FROM_FUTURE');
  }
  if (!candidateSha || observation.candidateSha !== candidateSha) {
    issues.push('CANDIDATE_SHA_MISMATCH');
  }
  if (!targetAlias || observation.targetAlias !== targetAlias) {
    issues.push('TARGET_ALIAS_MISMATCH');
  }
  if (typeof observation.passed !== 'boolean') issues.push('INVALID_PASS_RESULT');

  const status = issues.length > 0
    ? 'UNKNOWN'
    : observation.passed
      ? 'PASS'
      : 'FAIL';

  return {
    id,
    requiredOwner,
    execution: 'REPOSITORY',
    status,
    evidenceRef,
    issues,
  };
}

export function evaluateGlhPhase9NonproductionRehearsal(
  input: GlhPhase9NonproductionRehearsalInput,
): GlhPhase9NonproductionRehearsalReport {
  const issues: string[] = [];
  const candidateSha =
    typeof input.candidateSha === 'string' && SHA_PATTERN.test(input.candidateSha)
      ? input.candidateSha
      : null;
  const evaluatedAt = isUtcTimestamp(input.evaluatedAt)
    ? input.evaluatedAt
    : null;
  const targetAlias =
    typeof input.targetAlias === 'string' && input.targetAlias.trim()
      ? input.targetAlias
      : null;

  if (input.taskId !== GLH_PHASE9_NONPRODUCTION_REHEARSAL_TASK.taskId) {
    issues.push('TASK_ID_MISMATCH');
  }
  if (input.baseMasterSha !== GLH_PHASE9_NONPRODUCTION_REHEARSAL_TASK.baseMasterSha) {
    issues.push('BASE_MASTER_SHA_MISMATCH');
  }
  if (!candidateSha) issues.push('INVALID_CANDIDATE_SHA');
  if (!evaluatedAt) issues.push('INVALID_EVALUATED_AT');
  if (!targetAlias) issues.push('INVALID_TARGET_ALIAS');

  const prohibitedFlags = [
    ['PRODUCTION_SQL_EXECUTED', input.productionSqlExecuted],
    ['PRODUCTION_RLS_OR_GRANTS_CHANGED', input.productionRlsOrGrantsChanged],
    [
      'PRODUCTION_ENV_OR_SECRETS_READ_OR_CHANGED',
      input.productionEnvOrSecretsReadOrChanged,
    ],
    ['PRODUCTION_DATA_CHANGED', input.productionDataChanged],
    ['REAL_PROVIDER_CUTOVER_EXECUTED', input.realProviderCutoverExecuted],
    ['REAL_CUSTOMER_MESSAGE_SENT', input.realCustomerMessageSent],
    ['EXTERNAL_PUBLISHING_EXECUTED', input.externalPublishingExecuted],
    ['AUTHENTICATION_WEAKENED', input.authenticationWeakened],
  ] as const;

  for (const [name, value] of prohibitedFlags) {
    if (value !== false) issues.push(`${name}_MUST_BE_FALSE`);
  }

  const evidence = GLH_PHASE9_REHEARSAL_REQUIREMENTS.map(
    ([id, requiredOwner, execution]): GlhPhase9RehearsalEvidenceResult => {
      if (execution === 'HUMAN_GATE') {
        return {
          id,
          requiredOwner,
          execution,
          status: 'UNKNOWN',
          evidenceRef: null,
          issues: [
            'PRODUCTION_OR_EXTERNAL_EVIDENCE_NOT_COLLECTED',
            'SEPARATE_HUMAN_GATE_REQUIRED',
          ],
        };
      }

      return evaluateRepositoryObservation(
        id,
        requiredOwner,
        input.observations?.[id],
        candidateSha,
        evaluatedAt,
        targetAlias,
      );
    },
  );
  const repositoryEvidence = evidence.filter(item => item.execution === 'REPOSITORY');
  const pass = evidence.filter(item => item.status === 'PASS').map(item => item.id);
  const fail = evidence.filter(item => item.status === 'FAIL').map(item => item.id);
  const unknown = evidence
    .filter(item => item.status === 'UNKNOWN')
    .map(item => item.id);
  const rehearsalStatus =
    issues.length === 0
    && repositoryEvidence.every(item => item.status === 'PASS')
      ? 'PASS'
      : 'FAIL';

  return {
    taskId: GLH_PHASE9_NONPRODUCTION_REHEARSAL_TASK.taskId,
    rehearsalStatus,
    productionReadiness: 'NOT_READY',
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
