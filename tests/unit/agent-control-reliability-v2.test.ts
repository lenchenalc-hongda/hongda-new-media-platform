import assert from 'node:assert/strict';
import {
  classifyFailureText,
  displayStatus,
  reconcileMergedState,
  recoveryDecision,
  shouldRedispatch,
} from '../../scripts/agent-control/reliability-core.mjs';

// TEST 1 — Keychain unavailable.
assert.equal(
  classifyFailureText('Failed to resolve external auth: provider auth command /usr/bin/security exited with status 36'),
  'KEYCHAIN_FAILURE',
);
assert.deepEqual(
  recoveryDecision({ failureClass: 'KEYCHAIN_FAILURE', retryCount: 0, maxRetries: 3 }),
  { action: 'RETRY', nextRetryCount: 1 },
);

// TEST 2 — transient network failure.
assert.equal(classifyFailureText('429 Too Many Requests while downloading checkout'), 'NETWORK_FAILURE');
assert.deepEqual(
  recoveryDecision({ failureClass: 'NETWORK_FAILURE', retryCount: 1, maxRetries: 3 }),
  { action: 'RETRY', nextRetryCount: 2 },
);

// TEST 3 — provider auth failure.
assert.equal(classifyFailureText('HTTP 401 unauthorized invalid api key'), 'PROVIDER_401');
assert.deepEqual(
  recoveryDecision({ failureClass: 'PROVIDER_401', retryCount: 2, maxRetries: 3 }),
  { action: 'RETRY', nextRetryCount: 3 },
);

// TEST 4 — coding/test failure must not consume infra retries.
assert.deepEqual(
  recoveryDecision({ failureClass: 'TEST_FAILURE', retryCount: 1, maxRetries: 3 }),
  { action: 'NO_INFRA_RETRY', nextRetryCount: 1 },
);

// TEST 5 — stale merged PR state reconciles to MERGED.
assert.equal(
  reconcileMergedState({ stateStatus: 'APPROVED_FOR_MERGE', prMerged: true }),
  'MERGED',
);

// TEST 6 — lost trigger is redispatched when READY has no live run for >=10 minutes.
assert.equal(
  shouldRedispatch({
    stateStatus: 'READY_FOR_CODEX',
    ownerActionRequired: false,
    hasActiveRun: false,
    latestTerminalAgeMinutes: 11,
    lostTriggerMinutes: 10,
  }),
  true,
);
assert.equal(
  shouldRedispatch({
    stateStatus: 'READY_FOR_CODEX',
    ownerActionRequired: false,
    hasActiveRun: true,
    latestTerminalAgeMinutes: 60,
    lostTriggerMinutes: 10,
  }),
  false,
);

// TEST 7 — Human Gate never auto-dispatches and renders WAITING_OWNER.
assert.equal(
  shouldRedispatch({
    stateStatus: 'HUMAN_GATE',
    ownerActionRequired: true,
    hasActiveRun: false,
    latestTerminalAgeMinutes: 999,
    lostTriggerMinutes: 10,
  }),
  false,
);
assert.equal(
  displayStatus({ stateStatus: 'HUMAN_GATE', ownerActionRequired: true }),
  'WAITING_OWNER',
);

// TEST 8 — exhausted infrastructure retries block instead of looping forever.
assert.deepEqual(
  recoveryDecision({ failureClass: 'CODEX_CRASH', retryCount: 3, maxRetries: 3 }),
  { action: 'BLOCK', nextRetryCount: 3 },
);

assert.equal(displayStatus({ stateStatus: 'BLOCKED' }), 'BLOCKED');
assert.equal(displayStatus({ stateStatus: 'READY_FOR_CODEX', queued: true }), 'QUEUED');
assert.equal(displayStatus({ stateStatus: 'PASS' }), 'COMPLETE');

console.log('agent-control-reliability-v2.test.ts: 8/8 PASS');
