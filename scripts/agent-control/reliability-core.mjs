export const INFRA_FAILURES = new Set([
  'AUTH_FAILURE',
  'PROVIDER_401',
  'KEYCHAIN_FAILURE',
  'NETWORK_FAILURE',
  'CHECKOUT_FAILURE',
  'RUNNER_OFFLINE',
  'DEPENDENCY_FAILURE',
  'CODEX_CRASH',
  'UNKNOWN_INFRA_FAILURE',
]);

export function classifyFailureText(text) {
  const value = String(text || '');
  // Explicit provider rejection wins over incidental keychain text in combined logs.
  if (/(^|[^0-9])401([^0-9]|$)|unauthori[sz]ed|invalid (api )?key|authentication failed/i.test(value)) return 'PROVIDER_401';
  if (/\/usr\/bin\/security|Failed to resolve external auth|keychain/i.test(value)) return 'KEYCHAIN_FAILURE';
  if (/429|Too Many Requests|Could not resolve host|connection reset|network is unreachable|timed? out|TLS|SSL/i.test(value)) return 'NETWORK_FAILURE';
  if (/checkout|git fetch|ls-remote/i.test(value) && /fail|error|fatal/i.test(value)) return 'CHECKOUT_FAILURE';
  if (/pnpm install|npm install|dependency/i.test(value) && /fail|error/i.test(value)) return 'DEPENDENCY_FAILURE';
  if (/auth|credential|login/i.test(value)) return 'AUTH_FAILURE';
  return 'UNKNOWN_INFRA_FAILURE';
}

export function recoveryDecision({ failureClass, retryCount = 0, maxRetries = 3 }) {
  if (!INFRA_FAILURES.has(failureClass)) {
    return { action: 'NO_INFRA_RETRY', nextRetryCount: retryCount };
  }
  // A provider-declared invalid credential is not transient. Retrying the
  // same launchctl key only burns runner time and can flood the watchdog.
  if (failureClass === 'PROVIDER_401') {
    return { action: 'BLOCK', nextRetryCount: retryCount };
  }
  if (retryCount >= maxRetries) {
    return { action: 'BLOCK', nextRetryCount: retryCount };
  }
  return { action: 'RETRY', nextRetryCount: retryCount + 1 };
}

export function reconcileMergedState({ stateStatus, prMerged }) {
  if (prMerged && ['APPROVED_FOR_MERGE', 'READY_FOR_PM_REVIEW', 'WAITING_REVIEW'].includes(stateStatus)) {
    return 'MERGED';
  }
  return stateStatus;
}

export function shouldRedispatch({
  stateStatus,
  ownerActionRequired = false,
  hasActiveRun = false,
  latestTerminalAgeMinutes = Number.POSITIVE_INFINITY,
  lostTriggerMinutes = 10,
}) {
  if (ownerActionRequired || ['HUMAN_GATE', 'NEEDS_DECISION', 'BLOCKED', 'PASS', 'COMPLETE', 'MERGED'].includes(stateStatus)) return false;
  if (!['READY_FOR_CODEX', 'FIX_REQUIRED'].includes(stateStatus)) return false;
  if (hasActiveRun) return false;
  return latestTerminalAgeMinutes >= lostTriggerMinutes;
}

export function displayStatus({ stateStatus, ownerActionRequired = false, hasActiveRun = false, queued = false }) {
  if (ownerActionRequired || ['HUMAN_GATE', 'NEEDS_DECISION'].includes(stateStatus)) return 'WAITING_OWNER';
  if (stateStatus === 'BLOCKED') return 'BLOCKED';
  if (queued) return 'QUEUED';
  if (hasActiveRun || ['READY_FOR_CODEX', 'FIX_REQUIRED', 'READY_FOR_PM_REVIEW', 'WAITING_REVIEW', 'APPROVED_FOR_MERGE'].includes(stateStatus)) return 'RUNNING';
  if (['PASS', 'COMPLETE', 'MERGED'].includes(stateStatus)) return 'COMPLETE';
  return 'RUNNING';
}

/**
 * Pure fail-closed guard for the unattended watchdog. Returning a reason
 * forbids dispatch; it never grants permission to merge or mutate Production.
 * @param {{
 *   stateStatus: string,
 *   expectedRepository?: string,
 *   stateRepository?: string,
 *   stateProject?: string,
 *   expectedProject?: string,
 *   currentTaskId?: string,
 *   taskPrefix?: string,
 *   branchPrefix?: string,
 *   activePr?: number | null,
 *   activeBranch?: string | null,
 *   masterSha?: string,
 *   verifiedHead?: string,
 *   liveMasterSha?: string,
 *   matchingTaskPr?: boolean,
 *   fixPr?: {number?: number, state?: string, merged?: boolean, body?: string,
 *     base?: {ref?: string, repo?: {full_name?: string}},
 *     head?: {ref?: string, sha?: string, repo?: {full_name?: string}}} | null,
 *   infraRetryCount?: number,
 *   maxInfraRetries?: number,
 *   lastFailureClass?: string | null
 * }} input
 */
export function watchdogTaskBlocker({
  stateStatus,
  expectedRepository,
  stateRepository,
  stateProject,
  expectedProject,
  currentTaskId,
  taskPrefix,
  branchPrefix,
  activePr = null,
  activeBranch = null,
  masterSha,
  verifiedHead,
  liveMasterSha,
  matchingTaskPr = false,
  fixPr = null,
  infraRetryCount = 0,
  maxInfraRetries = 3,
  lastFailureClass = null,
}) {
  if (!['READY_FOR_CODEX', 'FIX_REQUIRED'].includes(stateStatus)) return null;
  // All identifiers are read from trusted registry/Issue and checked before
  // starting a costly or potentially duplicated self-hosted Codex run.
  if (expectedRepository !== 'lenchenalc-hongda/hongda-new-media-platform'
      || (stateRepository && stateRepository !== expectedRepository)
      || !expectedProject || stateProject !== expectedProject
      || !taskPrefix || !branchPrefix
      || !currentTaskId?.startsWith(taskPrefix)) return 'PROJECT_TASK_BINDING_MISMATCH';
  const taskSuffix = currentTaskId.slice(taskPrefix.length)
    .toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  if (!taskSuffix) return 'PROJECT_TASK_BINDING_MISMATCH';
  if (stateStatus === 'READY_FOR_CODEX') {
    if (activePr !== null || activeBranch !== null) return 'READY_HAS_ACTIVE_PR_OR_BRANCH';
    if (matchingTaskPr) return 'EXISTING_TASK_PR_NOT_RECONCILED';
    if (masterSha !== liveMasterSha || verifiedHead !== liveMasterSha) return 'STALE_READY_MASTER';
  }
  if (stateStatus === 'FIX_REQUIRED') {
    if (!Number.isSafeInteger(activePr) || activePr <= 0 || !activeBranch) return 'FIX_MISSING_ACTIVE_PR';
    if (!activeBranch.startsWith(branchPrefix + taskSuffix + '-'))
      return 'FIX_WRONG_PROJECT_BRANCH';
    if (!fixPr || fixPr.number !== activePr
        || fixPr.state !== 'open' || fixPr.merged === true ||
        fixPr.base?.ref !== 'master' || fixPr.head?.ref !== activeBranch ||
        fixPr.head?.sha !== verifiedHead
        || fixPr.head?.repo?.full_name !== expectedRepository
        || fixPr.base?.repo?.full_name !== expectedRepository)
      return 'FIX_PR_HEAD_MISMATCH';
    const prBody = typeof fixPr.body === 'string' ? fixPr.body.split(/\r?\n/) : [];
    if (!prBody.includes('PROJECT = ' + expectedProject)
        || !prBody.includes('TASK_ID = ' + currentTaskId)
        || !prBody.includes('BASE_MASTER_SHA = ' + masterSha))
      return 'FIX_PR_TASK_BINDING_MISMATCH';
  }
  if (INFRA_FAILURES.has(lastFailureClass) &&
      Number.isInteger(infraRetryCount) && infraRetryCount >= maxInfraRetries) {
    return 'INFRA_RETRY_BUDGET_EXHAUSTED';
  }
  return null;
}

/**
 * Parse only exact, validator-emitted key/value lines from a GitHub Actions
 * validate JOB log. An untrusted workflow run name or PR title is not proof.
 */
export function parseProjectValidationProof(logText) {
  if (typeof logText !== 'string' || logText.length > 1024 * 1024) return null;
  const values = new Map();
  const required = new Set([
    'result', 'reason', 'project', 'task_id', 'expected_head',
    'status', 'active_pr', 'active_branch',
  ]);
  for (const line of logText.split(/\r?\n/)) {
    const plain = line.replace(/^\d{4}-\d\d-\d\dT[^\s]+Z\s+/, '').trim();
    const m = /^([a-z_]+)=([A-Za-z0-9._/-]+)$/.exec(plain);
    if (!m || !required.has(m[1])) continue;
    // Multiple (even identical) validator proof markers are ambiguous.
    if (values.has(m[1])) return null;
    values.set(m[1], m[2]);
  }
  if ([...required].some(key => !values.has(key))) return null;
  return Object.fromEntries(values);
}

/**
 * Select a dispatch run only after its real GitHub validator job has
 * independently attested this exact project/task/PR/head. A race or missing
 * attestation returns PENDING/AMBIGUOUS, never an invented run ID.
 *
 * No claim of request-unique nonce is made: existing workflows do not echo
 * recovery_reason. We therefore also reject all competing candidate runs
 * rather than guessing which accepted dispatch created which ID.
 *
 * @param {{
 * runs: Array<{id?: number, event?: string, created_at?: string, head_sha?: string,
 *   repository?: {full_name?: string}}>,
 * evidenceByRunId: Record<string, string>,
 * dispatchedAtMs: number,
 * checkedAtMs: number,
 * dispatchRefSha: string,
 * expectedRepository: string,
 * expectedProject: string,
 * expectedTaskId: string,
 * expectedHead: string,
 * expectedStateStatus: string,
 * expectedActivePr?: number | null,
 * expectedActiveBranch?: string | null
 * }} input
 */
export function selectCorrelatedDispatchRun({
  runs,
  evidenceByRunId,
  dispatchedAtMs,
  checkedAtMs,
  dispatchRefSha,
  expectedRepository,
  expectedProject,
  expectedTaskId,
  expectedHead,
  expectedStateStatus,
  expectedActivePr = null,
  expectedActiveBranch = null,
}) {
  const pending = { status: 'PENDING', run: null };
  if (!Array.isArray(runs) || !evidenceByRunId ||
      !Number.isFinite(dispatchedAtMs) || !Number.isFinite(checkedAtMs) ||
      !/^[0-9a-f]{40}$/.test(String(dispatchRefSha)) ||
      !/^[0-9a-f]{40}$/.test(String(expectedHead))) return pending;
  const candidates = runs.filter(run => {
    const createdAt = Date.parse(run.created_at || '');
    return Number.isSafeInteger(run.id) && run.id > 0 &&
      run.event === 'workflow_dispatch' &&
      run.head_sha === dispatchRefSha &&
      (!run.repository?.full_name || run.repository.full_name === expectedRepository) &&
      Number.isFinite(createdAt) &&
      createdAt >= dispatchedAtMs - 2000 && createdAt <= checkedAtMs + 2000;
  });
  if (candidates.length > 1) return { status: 'AMBIGUOUS', run: null };
  if (candidates.length === 0) return pending;
  const run = candidates[0];
  const proof = parseProjectValidationProof(evidenceByRunId[String(run.id)]);
  if (!proof) return pending;
  if (proof.result !== 'READY' || proof.reason !== 'project task validated' ||
      proof.project !== expectedProject ||
      proof.task_id !== expectedTaskId ||
      proof.expected_head !== expectedHead ||
      proof.status !== expectedStateStatus ||
      proof.active_pr !== String(expectedActivePr ?? 'null') ||
      proof.active_branch !== String(expectedActiveBranch ?? '')) return pending;
  // A single early matching run is not sufficient. Allow the other dispatch
  // time to become visible before attesting against the complete candidate set.
  if (checkedAtMs - dispatchedAtMs < 15000) return pending;
  return { status: 'CONFIRMED', run };
}
