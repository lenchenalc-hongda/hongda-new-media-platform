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
 *   activePr?: number | null,
 *   activeBranch?: string | null,
 *   masterSha?: string,
 *   verifiedHead?: string,
 *   liveMasterSha?: string,
 *   matchingTaskPr?: boolean,
 *   fixPr?: {state?: string, merged?: boolean, base?: {ref?: string}, head?: {ref?: string, sha?: string}} | null,
 *   infraRetryCount?: number,
 *   maxInfraRetries?: number,
 *   lastFailureClass?: string | null
 * }} input
 */
export function watchdogTaskBlocker({
  stateStatus,
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
  if (stateStatus === 'READY_FOR_CODEX') {
    if (activePr !== null || activeBranch !== null) return 'READY_HAS_ACTIVE_PR_OR_BRANCH';
    if (matchingTaskPr) return 'EXISTING_TASK_PR_NOT_RECONCILED';
    if (masterSha !== liveMasterSha || verifiedHead !== liveMasterSha) return 'STALE_READY_MASTER';
  }
  if (stateStatus === 'FIX_REQUIRED') {
    if (!Number.isSafeInteger(activePr) || activePr <= 0 || !activeBranch) return 'FIX_MISSING_ACTIVE_PR';
    if (!fixPr || fixPr.state !== 'open' || fixPr.merged === true ||
        fixPr.base?.ref !== 'master' || fixPr.head?.ref !== activeBranch ||
        fixPr.head?.sha !== verifiedHead) return 'FIX_PR_HEAD_MISMATCH';
  }
  if (INFRA_FAILURES.has(lastFailureClass) &&
      Number.isInteger(infraRetryCount) && infraRetryCount >= maxInfraRetries) {
    return 'INFRA_RETRY_BUDGET_EXHAUSTED';
  }
  return null;
}
