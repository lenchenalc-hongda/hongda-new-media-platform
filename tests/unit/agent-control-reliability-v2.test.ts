import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  classifyFailureText,
  displayStatus,
  reconcileMergedState,
  recoveryDecision,
  shouldRedispatch,
  watchdogTaskBlocker,
  selectCorrelatedDispatchRun,
  parseProjectValidationProof,
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
const expectedRepo = 'lenchenalc-hongda/hongda-new-media-platform';
const taskId = 'GLH-UNIT-TEST';
const readyState = {
  stateStatus: 'READY_FOR_CODEX',
  expectedRepository: expectedRepo,
  stateRepository: expectedRepo,
  stateProject: 'global-lead-hub',
  expectedProject: 'global-lead-hub',
  currentTaskId: taskId,
  taskPrefix: 'GLH-',
  branchPrefix: 'codex/glh-',
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
  number:190,state:'open',merged:false,
  body:['PROJECT = global-lead-hub','TASK_ID = '+taskId,'BASE_MASTER_SHA = '+shaA].join('\n'),
  base:{ref:'master',repo:{full_name:expectedRepo}},
  head:{ref:branch,sha:shaB,repo:{full_name:expectedRepo}},
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

assert.equal(classifyFailureText('Failed to resolve external auth via /usr/bin/security; unexpected 401 invalid api key'),
  'PROVIDER_401', 'explicit 401 must outrank incidental keychain context');
const shellSource = readFileSync('scripts/agent-control/project-lane-run.sh', 'utf8');
const shellClassifiers = shellSource.slice(
  shellSource.indexOf('classify_codex_failure() {'),
  shellSource.indexOf('retry_delay() {'),
);
assert(shellClassifiers.includes('classify_codex_attempt() {'), 'real execution helper must be present');
assert(shellSource.includes('failure_class="$(classify_codex_attempt "$codex_status" "$error_log")"'),
  'actual Codex execution branch must call centralized classifier');
function classifyActualShellExecution(exitStatus: number, stderr: string) {
  const dir = mkdtempSync(join(tmpdir(), 'hongda-ac-reliability-'));
  const filename = join(dir, 'synthetic-cli-stderr.log');
  try {
    // Use a seekable regular file: the real runner greps one stderr file
    // multiple times. A process-substitution FIFO is consumed on first grep.
    writeFileSync(filename, stderr, { encoding: 'utf8', mode: 0o600 });
    return execFileSync('bash', ['-c',
      shellClassifiers + '\nclassify_codex_attempt ' + exitStatus + ' "$SYNTHETIC_LOG_PATH"',
    ], {
      env: { ...process.env, SYNTHETIC_LOG_PATH: filename }, encoding: 'utf8',
    }).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
assert.equal(classifyActualShellExecution(1,
  'WARNING: legacy /usr/bin/security keychain context\nERROR: unexpected status 401 unauthorized invalid api key'),
  'PROVIDER_401', 'real post-exec mixed 401 must be terminal provider failure');
assert.equal(classifyActualShellExecution(0, 'HTTP 401 invalid api key'),
  'PROVIDER_401', 'CLI exit zero cannot hide an explicit provider auth rejection');
assert.equal(classifyActualShellExecution(1, '/usr/bin/security keychain failed with status 36'),
  'KEYCHAIN_FAILURE', 'a genuine keychain-only error remains distinct');
assert.equal(classifyActualShellExecution(0, ''), 'NONE', 'clean CLI execution still passes');

const classifier = shellSource.split('classify_codex_failure() {')[1].split('retry_delay() {')[0];
assert(classifier.indexOf("printf 'PROVIDER_401'") < classifier.indexOf("printf 'KEYCHAIN_FAILURE'"),
  'shell 401 classifier must precede keychain classifier');
assert.equal(watchdogTaskBlocker({...readyState,expectedProject:'workshop-order-system'}), 'PROJECT_TASK_BINDING_MISMATCH');
assert.equal(watchdogTaskBlocker({...readyState,stateRepository:'evil/other'}), 'PROJECT_TASK_BINDING_MISMATCH');
assert.equal(watchdogTaskBlocker({...readyState,currentTaskId:'WOS-UNIT-TEST'}), 'PROJECT_TASK_BINDING_MISMATCH');
assert.equal(watchdogTaskBlocker({...fixState,activeBranch:'codex/wos-wrong-'+shaA.slice(0,12)}), 'FIX_WRONG_PROJECT_BRANCH');
assert.equal(watchdogTaskBlocker({...fixState,fixPr:{...fixPr,head:{...fixPr.head,repo:{full_name:'evil/other'}}}}), 'FIX_PR_HEAD_MISMATCH');
assert.equal(watchdogTaskBlocker({...fixState,fixPr:{...fixPr,number:777}}), 'FIX_PR_HEAD_MISMATCH');
assert.equal(watchdogTaskBlocker({...fixState,fixPr:{...fixPr,body:fixPr.body.replace(taskId,'WOS-OTHER')}}),
  'FIX_PR_TASK_BINDING_MISMATCH');

const startedAtMs = Date.parse('2026-10-30T01:00:00.000Z');
const proof = [
  'result=READY',
  'reason=project task validated',
  'project=global-lead-hub',
  'task_id='+taskId,
  'expected_head='+shaB,
  'status=FIX_REQUIRED',
  'active_pr=190',
  'active_branch='+branch,
].map((line,i) => new Date(startedAtMs + i * 100).toISOString() + ' ' + line).join('\n');
assert.equal(parseProjectValidationProof(proof)?.task_id,taskId);
assert.equal(parseProjectValidationProof(proof+'\nresult=READY'),null,'duplicated validator markers are rejected');
const runGood = {
  id:123456,event:'workflow_dispatch',created_at:new Date(startedAtMs+1000).toISOString(),
  head_sha:shaA,repository:{full_name:expectedRepo},html_url:'https://github.com/actions/123456',
};
const dispatchInput = {
  runs:[runGood],
  evidenceByRunId:{'123456':proof},
  dispatchedAtMs:startedAtMs,
  checkedAtMs:startedAtMs+20000,
  dispatchRefSha:shaA,
  expectedRepository:expectedRepo,
  expectedProject:'global-lead-hub',
  expectedTaskId:taskId,
  expectedHead:shaB,
  expectedStateStatus:'FIX_REQUIRED',
  expectedActivePr:190,
  expectedActiveBranch:branch,
};
assert.equal(selectCorrelatedDispatchRun(dispatchInput).status,'CONFIRMED','actual matching run validator proof');
assert.equal(selectCorrelatedDispatchRun({...dispatchInput,runs:[]}).status,'PENDING','no run is not a confirmation');
assert.equal(selectCorrelatedDispatchRun({...dispatchInput,evidenceByRunId:{}}).status,'PENDING','no validator log is not proof');
assert.equal(selectCorrelatedDispatchRun({...dispatchInput,checkedAtMs:startedAtMs+3000}).status,'PENDING','early match must settle');
assert.equal(selectCorrelatedDispatchRun({...dispatchInput,evidenceByRunId:{'123456':proof.replace('task_id='+taskId,'task_id=GLH-WRONG')}}).status,'PENDING','unrelated run not accepted');
assert.equal(selectCorrelatedDispatchRun({...dispatchInput,runs:[{...runGood,id:123455},runGood]}).status,'AMBIGUOUS','competing dispatches fail closed');
assert.equal(selectCorrelatedDispatchRun({...dispatchInput,runs:[{...runGood,head_sha:shaB}]}).status,'PENDING','run at wrong master ref cannot pass');


// A prior owner-action flag must not hide a PR already merged by GitHub.
// This is a guard on control-flow ordering, not permission to merge a PR.
const watchdogSource = readFileSync('scripts/agent-control/reliability-watchdog.mjs', 'utf8');
const mergedReconciliationGate = watchdogSource.indexOf("if (['APPROVED_FOR_MERGE', 'READY_FOR_PM_REVIEW', 'WAITING_REVIEW'].includes(state.status)");
const ownerGate = watchdogSource.indexOf("if (['HUMAN_GATE', 'NEEDS_DECISION'].includes(state.status)");
assert(mergedReconciliationGate !== -1 && ownerGate !== -1 && mergedReconciliationGate < ownerGate,
  'merged PR must be reconciled before stale owner-action gate');

// Regression: the real supplier Codex run produced test/code diffs mentioning
// HTTP 401 and keychain terms, which a broad grep incorrectly treated as a
// provider rejection despite code being generated. Patch lines are not errors.
const generatedPatchMentioning401 = [
  '+assert.match(message, /HTTP 401 Unauthorized invalid api key/);',
  '+const failedAuthCase = "authentication failed";',
  '+// Avoid leaking /usr/bin/security keychain data',
  '+console.log("fake login credentials are not sent")',
].join('\n');
assert.equal(classifyActualShellExecution(0, generatedPatchMentioning401),
  'NONE', 'successful Codex with auth-related source patches must not be discarded');
assert.notEqual(classifyActualShellExecution(1, generatedPatchMentioning401),
  'PROVIDER_401', 'Codex exit failure with only generated source is not provider evidence');
assert.notEqual(classifyActualShellExecution(1, generatedPatchMentioning401),
  'KEYCHAIN_FAILURE', 'generated source mentioning a keychain is not a system keychain error');
assert.notEqual(classifyFailureText(generatedPatchMentioning401), 'PROVIDER_401',
  'JS infrastructure classifier must not turn source patches into terminal provider rejection');
assert.equal(classifyActualShellExecution(0, 'ERROR: HTTP 401 invalid api key'),
  'PROVIDER_401', 'genuine even-zero-exit diagnostic remains terminal');
assert.equal(classifyActualShellExecution(1,
  'WARNING: legacy /usr/bin/security keychain context\nERROR: HTTP 401 Unauthorized'),
  'PROVIDER_401', 'real provider error outranks a keychain warning');
assert.equal(classifyFailureText('ERROR: HTTP 401 Unauthorized invalid api key'),
  'PROVIDER_401', 'JS classifier recognizes genuine provider diagnostic');

console.log('agent-control-reliability-v2.test.ts: 8/8 PASS');
