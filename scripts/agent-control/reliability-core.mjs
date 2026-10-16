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
  if (/\/usr\/bin\/security|Failed to resolve external auth|keychain/i.test(value)) return 'KEYCHAIN_FAILURE';
  if (/(^|[^0-9])401([^0-9]|$)|unauthori[sz]ed|invalid (api )?key|authentication failed/i.test(value)) return 'PROVIDER_401';
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
