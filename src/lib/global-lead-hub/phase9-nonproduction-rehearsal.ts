/**
 * Fail-closed evaluator for the GLH Phase 9 repository-only rehearsal.
 *
 * This module is intentionally pure: it performs no environment, network,
 * filesystem, database, provider, or Production access. Production-only
 * evidence remains UNKNOWN until a separately authorized Human Gate task.
 */

import type {
  GlhPhase8PilotEvidenceCheckId,
  GlhPhase8PilotEvidenceReport,
} from './phase8-pilot-evidence-bundle';
import type { GlhPhase9EvidencePrepReport } from './phase9-evidence-prep';

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

export const GLH_PHASE9_PHASE8_EVIDENCE_MAP = Object.freeze({
  WEBHOOK_IDEMPOTENCY: ['WEBHOOK_REPLAY_IDEMPOTENCY'],
  SECRET_REDACTION: ['NO_BROWSER_OR_LOG_SECRET_EXPOSURE'],
  AI_FORBIDDEN_CLAIMS: ['ACCEPTANCE_CASES_A_TO_G'],
  HUMAN_HANDOFF: ['HUMAN_TAKEOVER_STOPS_AUTOSEND'],
  AI_PROVIDER_OUTAGE: [
    'AI_PROVIDER_OUTAGE_FALLBACK',
    'HUMAN_WORK_REMAINS_AVAILABLE_WITHOUT_AI',
  ],
  RLS_ACCEPTANCE: [
    'RLS_SALES_ISOLATION',
    'MANAGER_ADMIN_ORGANIZATION_SCOPE',
  ],
} satisfies Partial<
  Record<GlhPhase9RepositoryRehearsalId, readonly GlhPhase8PilotEvidenceCheckId[]>
>);

export const GLH_PHASE9_DIRECT_REHEARSAL_IDS = [
  'META_WEBHOOK_VERIFICATION',
  'META_WEBHOOK_SIGNATURE',
  'ROLLOUT_DRY_RUN',
  'CONTAINMENT_DRY_RUN',
  'ROLLBACK_DRY_RUN',
] as const satisfies readonly GlhPhase9RepositoryRehearsalId[];

export type GlhPhase9DirectRehearsalId =
  (typeof GLH_PHASE9_DIRECT_REHEARSAL_IDS)[number];

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
  phase8EvidenceReport?: GlhPhase8PilotEvidenceReport | null;
  phase9EvidencePreparation?: GlhPhase9EvidencePrepReport | null;
  observations?: Partial<
    Record<GlhPhase9DirectRehearsalId, GlhPhase9RepositoryObservation | null>
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

function evaluatePhase8Evidence(
  id: keyof typeof GLH_PHASE9_PHASE8_EVIDENCE_MAP,
  requiredOwner: GlhPhase9RehearsalOwner,
  report: GlhPhase8PilotEvidenceReport | null | undefined,
): GlhPhase9RehearsalEvidenceResult {
  const requiredChecks = GLH_PHASE9_PHASE8_EVIDENCE_MAP[id];
  if (!report) {
    return {
      id,
      requiredOwner,
      execution: 'REPOSITORY',
      status: 'UNKNOWN',
      evidenceRef: null,
      issues: ['MISSING_PHASE8_EVIDENCE_REPORT'],
    };
  }

  const issues: string[] = [];
  if (
    report.environment !== 'NON_PRODUCTION'
    || !report.accepted
    || report.overallStatus !== 'PASS'
  ) {
    issues.push('PHASE8_EVIDENCE_REPORT_NOT_ACCEPTED');
  }
  for (const checkId of requiredChecks) {
    const check = report.checks.find(item => item.id === checkId);
    if (!check) issues.push(`PHASE8_CHECK_MISSING:${checkId}`);
    else if (check.status !== 'PASS' || check.errors.length > 0) {
      issues.push(`PHASE8_CHECK_NOT_PASS:${checkId}`);
    }
  }

  return {
    id,
    requiredOwner,
    execution: 'REPOSITORY',
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    evidenceRef: `repository://glh/phase8-pilot-evidence#${id}`,
    issues,
  };
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
  if (!input.phase8EvidenceReport) {
    issues.push('MISSING_PHASE8_EVIDENCE_REPORT');
  }
  if (!input.phase9EvidencePreparation) {
    issues.push('MISSING_PHASE9_EVIDENCE_PREPARATION');
  } else {
    if (input.phase9EvidencePreparation.humanGateRequired !== true) {
      issues.push('PHASE9_HUMAN_GATE_MUST_BE_REQUIRED');
    }
    if (input.phase9EvidencePreparation.productionExecutionAuthorized !== false) {
      issues.push('PHASE9_PRODUCTION_EXECUTION_MUST_NOT_BE_AUTHORIZED');
    }
    if (input.phase9EvidencePreparation.productionChanged !== false) {
      issues.push('PHASE9_PRODUCTION_CHANGED_MUST_BE_FALSE');
    }
  }

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

      if (id in GLH_PHASE9_PHASE8_EVIDENCE_MAP) {
        return evaluatePhase8Evidence(
          id as keyof typeof GLH_PHASE9_PHASE8_EVIDENCE_MAP,
          requiredOwner,
          input.phase8EvidenceReport,
        );
      }

      const directId = id as GlhPhase9DirectRehearsalId;
      return evaluateRepositoryObservation(
        directId,
        requiredOwner,
        input.observations?.[directId],
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
