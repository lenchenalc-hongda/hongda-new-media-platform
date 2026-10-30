import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifyFailureText,
  displayStatus,
  reconcileMergedState,
  recoveryDecision,
  shouldRedispatch,
  watchdogTaskBlocker,
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
  { action: 'BLOCK', nextRetryCount: 2 },
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


const shaA = 'a'.repeat(40);
const shaB = 'b'.repeat(40);
const branch = 'codex/glh-unit-test-' + shaA.slice(0, 12);
const readyState = {
  stateStatus: 'READY_FOR_CODEX',
  activePr: null,
  activeBranch: null,
  masterSha: shaA,
  verifiedHead: shaA,
  liveMasterSha: shaA,
};
assert.equal(watchdogTaskBlocker(readyState), null, 'fresh READY without active PR may dispatch');
assert.equal(watchdogTaskBlocker({...readyState,activePr:173}), 'READY_HAS_ACTIVE_PR_OR_BRANCH');
assert.equal(watchdogTaskBlocker({...readyState,activeBranch:branch}), 'READY_HAS_ACTIVE_PR_OR_BRANCH');
assert.equal(watchdogTaskBlocker({...readyState,matchingTaskPr:true}), 'EXISTING_TASK_PR_NOT_RECONCILED');
assert.equal(watchdogTaskBlocker({...readyState,liveMasterSha:shaB}), 'STALE_READY_MASTER');
assert.equal(watchdogTaskBlocker({...readyState,verifiedHead:shaB}), 'STALE_READY_MASTER');
const fixPr = {
  state:'open',merged:false,base:{ref:'master'},
  head:{ref:branch,sha:shaB},
};
const fixState = {
  ...readyState,
  stateStatus:'FIX_REQUIRED',
  activePr:190,
  activeBranch:branch,
  verifiedHead:shaB,
  fixPr,
};
assert.equal(watchdogTaskBlocker(fixState), null, 'matching FIX PR is eligible');
assert.equal(watchdogTaskBlocker({...fixState,fixPr:null}), 'FIX_PR_HEAD_MISMATCH');
assert.equal(watchdogTaskBlocker({...fixState,fixPr:{...fixPr,head:{ref:branch,sha:shaA}}}), 'FIX_PR_HEAD_MISMATCH');
assert.equal(watchdogTaskBlocker({...fixState,fixPr:{...fixPr,state:'closed'}}), 'FIX_PR_HEAD_MISMATCH');
assert.equal(watchdogTaskBlocker({...fixState,infraRetryCount:3,lastFailureClass:'CODEX_CRASH'}), 'INFRA_RETRY_BUDGET_EXHAUSTED');
assert.equal(recoveryDecision({ failureClass:'PROVIDER_401',retryCount:0,maxRetries:3 }).action, 'BLOCK');

// A prior owner-action flag must not hide a PR already merged by GitHub.
// This is a guard on control-flow ordering, not permission to merge a PR.
const watchdogSource = readFileSync('scripts/agent-control/reliability-watchdog.mjs', 'utf8');
const mergedReconciliationGate = watchdogSource.indexOf("if (['APPROVED_FOR_MERGE', 'READY_FOR_PM_REVIEW', 'WAITING_REVIEW'].includes(state.status)");
const ownerGate = watchdogSource.indexOf("if (['HUMAN_GATE', 'NEEDS_DECISION'].includes(state.status)");
assert(mergedReconciliationGate !== -1 && ownerGate !== -1 && mergedReconciliationGate < ownerGate,
  'merged PR must be reconciled before stale owner-action gate');

console.log('agent-control-reliability-v2.test.ts: 8/8 PASS');
