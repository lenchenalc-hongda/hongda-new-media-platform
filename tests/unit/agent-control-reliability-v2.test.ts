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
  selectAuthorizedSuccessorTask,
  countActiveProjectLanes,
  successorPathOverlapBlocker,
  selectSuccessorCommentClaim,
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

// TEST 9 — Finished code slices may continue only through a NEW explicit,
// owner-authored task pinned to the live master SHA, with unchanged safety gates.
const nextMaster = 'c'.repeat(40);
const priorTask = 'CSO-P2-NONPROD-E2E-001';
const nextTask = 'CSO-P3-NONPROD-REVIEW-001';
const nextState = {
  project:'commercial-supplier-orders',
  status:'MERGED',
  runtime_status:'RELEASE_VERIFIED_CODE_ONLY',
  owner_action_required:false,
  active_pr:null, active_branch:null,
  task_comment_id:100,
  current_task_id:priorTask,
  postmerge_ci_status:'PASS_EXACT_MERGE_SHA',
  vercel_production_status:'READY_EXACT_MERGE_SHA',
};
const nextConfig = {
  control_issue:195, task_prefix:'CSO-', branch_prefix:'codex/cso-',
  owned_prefixes:['src/lib/commercial-supplier-orders/','tests/unit/commercial-supplier-order-'],
  owned_regexes:['^supabase/migrations/[0-9]+_commercial_supplier_order_[A-Za-z0-9_]+\\.sql$'],
};
const nextRegistry = {
  projects:{'commercial-supplier-orders':nextConfig},
  shared_exact_paths:['AGENTS.md','package.json'],
  shared_prefixes:['scripts/agent-control/','.github/','src/lib/supabase/'],
};
function nextContract({
  taskId = nextTask, master = nextMaster,
  paths = ['tests/unit/commercial-supplier-order-handoff.test.ts'],
  project = 'commercial-supplier-orders',
  status = 'READY_FOR_CODEX',
  checks = 'typecheck,build,secret-audit,smoke',
  scope = 'NONPROD_CODE_ONLY', production = 'NO',
  autoMerge = 'false', autoProduction = 'false',
  authWidening = 'NO', destructive = 'NO', externalSend = 'NO',
  objective = 'Add deterministic unit tests for the stage handoff.',
} = {}) {
  return [
    'AGENT_CONTROL_PROJECT_TASK_V1',
    'PROJECT = '+project,
    'TASK_ID = '+taskId,
    'TASK_STATUS = '+status,
    'BASE_MASTER_SHA = '+master,
    'EXPECTED_HEAD = '+master,
    'FIX_ROUND = 0 / 3',
    'ALLOWED_PATHS_JSON = '+JSON.stringify(paths),
    'CHECKS = '+checks,
    'SCOPE = '+scope,
    'PRODUCTION_CHANGED = '+production,
    'AUTO_MERGE = '+autoMerge,
    'AUTO_PRODUCTION = '+autoProduction,
    'AUTH_WIDENING = '+authWidening,
    'DESTRUCTIVE_SOT_CHANGE = '+destructive,
    'EXTERNAL_SEND = '+externalSend,
    'OBJECTIVE_B64 = '+Buffer.from(objective).toString('base64'),
  ].join('\n');
}
const nextComment = {id:101,user:{login:'lenchenalc-hongda'},body:nextContract()};
const nextInput = {
  state:nextState, project:'commercial-supplier-orders',
  config:nextConfig, registry:nextRegistry, masterSha:nextMaster,
  comments:[nextComment],
};
const selectedSuccessor = selectAuthorizedSuccessorTask(nextInput);
assert.equal(selectedSuccessor.status,'READY','single exact-head owner-authored next task accepted');
assert.equal(selectedSuccessor.task?.taskId,nextTask);
assert.equal(selectedSuccessor.task?.commentId,101);
assert.deepEqual(selectedSuccessor.task?.checks,['typecheck','build','secret-audit','smoke']);
assert.deepEqual(selectedSuccessor.task?.allowedPaths,['tests/unit/commercial-supplier-order-handoff.test.ts']);
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[]}).status,
  'AWAITING_AUTHORIZED_NEXT_TASK','merged state must never invent a follow-up task');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,user:{login:'github-actions[bot]'}}]}).status,
  'AWAITING_AUTHORIZED_NEXT_TASK','bot cannot forge the owner-preauthorized next phase');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,id:99}]}).status,
  'AWAITING_AUTHORIZED_NEXT_TASK','prior task history is not a new task');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,state:{...nextState,owner_action_required:true}}).status,
  'HOLD_OWNER','pending owner decision must stop handoff');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,state:{...nextState,postmerge_ci_status:'FAIL'}}).status,
  'WAIT_RELEASE_VERIFICATION','failed merge CI cannot hand off');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,state:{...nextState,vercel_production_status:'BUILDING'}}).status,
  'WAIT_RELEASE_VERIFICATION','unverified release cannot hand off');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,body:nextContract({master:'b'.repeat(40)})}]}).status,
  'NEXT_TASK_BASE_STALE','stale master task requires explicit rebase');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,body:nextContract({taskId:priorTask})}]}).status,
  'AWAITING_AUTHORIZED_NEXT_TASK','old task is never automatically replayed');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[nextComment,{...nextComment,id:102}]}).status,
  'AMBIGUOUS_NEXT_TASK_COMMENTS','duplicate competing next tasks require reconciliation');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,body:nextContract({project:'global-lead-hub'})}]}).status,
  'NEXT_TASK_IDENTITY_MISMATCH','foreign project cannot use this lane');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,body:nextContract({paths:['scripts/agent-control/reliability-watchdog.mjs']})}]}).status,
  'SHARED_OR_DATABASE_PATH_REQUIRES_SEPARATE_GATE','successor cannot claim shared infrastructure files');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,body:nextContract({paths:['supabase/migrations/202611010001_commercial_supplier_order_test.sql']})}]}).status,
  'SHARED_OR_DATABASE_PATH_REQUIRES_SEPARATE_GATE','production migration paths require separate explicit gate');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,body:nextContract({paths:['src/lib/workshop-orders/test.ts']})}]}).status,
  'NEXT_TASK_PATH_NOT_OWNED','project ownership contract remains enforced');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,body:nextContract({checks:'skip-tests'})}]}).status,
  'INVALID_NEXT_TASK_CHECKS','cannot bypass existing CI gates');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,body:nextContract({checks:'typecheck'})}]}).status,
  'INVALID_NEXT_TASK_CHECKS','subset of CI checks must fail closed');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,body:nextContract({production:'YES'})}]}).status,
  'NEXT_TASK_REQUIRES_SEPARATE_HUMAN_GATE','Production changes are never implicit');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,body:nextContract({autoMerge:'true'})}]}).status,
  'NEXT_TASK_REQUIRES_SEPARATE_HUMAN_GATE','successor cannot request automatic merge');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,body:nextContract({autoProduction:'true'})}]}).status,
  'NEXT_TASK_REQUIRES_SEPARATE_HUMAN_GATE','successor cannot request Production deployment');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,body:nextContract({authWidening:'YES'})}]}).status,
  'NEXT_TASK_REQUIRES_SEPARATE_HUMAN_GATE','auth policy widening needs separate human gate');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,body:nextContract({destructive:'YES'})}]}).status,
  'NEXT_TASK_REQUIRES_SEPARATE_HUMAN_GATE','destructive source of truth needs separate gate');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,body:nextContract({externalSend:'YES'})}]}).status,
  'NEXT_TASK_REQUIRES_SEPARATE_HUMAN_GATE','customer/supplier external sends require separate gate');
assert.equal(selectAuthorizedSuccessorTask({...nextInput,comments:[{...nextComment,body:nextContract({objective:'Change production RLS to grant access.'})}]}).status,
  'NEXT_TASK_OBJECTIVE_REQUIRES_HUMAN_GATE','high-risk objective cannot bypass structured restrictions');
assert.equal(successorPathOverlapBlocker([
  {status:'CODING',active_pr:42,allowed_paths:['src/lib/commercial-supplier-orders/cso.ts']},
],['src/lib/commercial-supplier-orders/cso.ts']),'ACTIVE_LANE_PATH_OVERLAP',
  'parallel lanes may not edit the same file');
assert.equal(successorPathOverlapBlocker([
  {status:'FIX_REQUIRED',active_pr:42,allowed_paths:null},
],['tests/unit/commercial-supplier-order-handoff.test.ts']),'ACTIVE_LANE_OWNED_PATHS_UNVERIFIED',
  'unknown active lane scope is fail-closed');
assert.equal(successorPathOverlapBlocker([
  {status:'MERGED',active_pr:null,allowed_paths:[]},
  {status:'CODING',active_pr:45,allowed_paths:['src/lib/workshop-orders/order.ts']},
],['tests/unit/commercial-supplier-order-handoff.test.ts']),null,
  'different paths permit bounded concurrency');

const watchdogHandoffSource = readFileSync('scripts/agent-control/reliability-watchdog.mjs','utf8');
assert(watchdogHandoffSource.includes('await inspectMergedNextTask(project, config, issue, state, registry)'),
  'MERGED must run the explicit-next-task handoff path before terminal skip');
assert(watchdogHandoffSource.includes("transferState.task_started_at_utc = new Date().toISOString()"),
  'new task must have a run epoch that isolates it from previous task runs');
assert(watchdogHandoffSource.includes('const epoch = Date.parse(state.task_started_at_utc'),
  'stale successful project runs may never suppress a new task dispatch');

// Registry limit applies across project lanes, not merely within one workflow.
assert.equal(countActiveProjectLanes([
  {status:'MERGED',active_pr:null,active_branch:null},
  {status:'WAITING_REVIEW',active_pr:173,active_branch:'codex/cpc-foo'},
]),1,'completed phase frees its execution lane');
assert.equal(countActiveProjectLanes([
  {status:'READY_FOR_CODEX',active_pr:null,active_branch:null},
  {status:'FIX_REQUIRED',active_pr:190,active_branch:'codex/glh-bar'},
]),2,'queued or fixing tasks occupy capacity');
assert.equal(countActiveProjectLanes([
  {status:'BLOCKED',active_pr:200,active_branch:'codex/cso-active'},
]),1,'blocked open PR still occupies execution capacity');
assert.equal(countActiveProjectLanes([{status:'COMPLETE',active_pr:null,active_branch:null}]),0);
assert.equal(countActiveProjectLanes([null as unknown as Record<string, unknown>]),Infinity,'invalid foreign project is fail closed');
assert(watchdogHandoffSource.includes('hasProjectLaneCapacity(project, registry, next.allowedPaths)'),
  'next-stage watchdog must consult cross-project capacity and path overlap');
assert(watchdogHandoffSource.includes('const currentComments = await recentOwnerTaskComments(issue.number)'),
  'must re-read owner task after external API calls and before dispatch claim');
assert(watchdogHandoffSource.includes('successor.task.contractBody !== next.contractBody'),
  'edited owner comment must invalidate stale successor task');
assert(watchdogHandoffSource.includes('claimSuccessorWithIssueComment(project, freshIssue, next, liveMasterSha)'),
  'serialized watchdog uses recoverable comment claim without Git ref writes');
assert(watchdogHandoffSource.includes('transferState.allowed_paths = [...next.allowedPaths]'),
  'accepted task scope must be persisted before dispatch');
assert(watchdogHandoffSource.includes('transferState.required_checks = [...next.checks]'),
  'complete CI checks must be persisted before dispatch');
assert(watchdogHandoffSource.includes('claimedState?.next_task_dispatch_claim?.commentId !== claim.commentId'),
  'issue-comment claim must be verified after saving state');
const watchdogWorkflow = readFileSync('.github/workflows/agent-control-reliability-watchdog-v2.yml','utf8');
assert(watchdogWorkflow.includes('group: agent-control-reliability-watchdog-v2') &&
  watchdogWorkflow.includes('cancel-in-progress: false'),
  'GitHub Actions workflow remains serialized');
assert(/\bcontents:\s*read\b/.test(watchdogWorkflow) && !/\bcontents:\s*write\b/.test(watchdogWorkflow),
  'watchdog token stays contents:read without Git refs permission');
assert(!watchdogHandoffSource.includes('/git/refs') &&
  !watchdogHandoffSource.includes('claimSuccessorWithGitRef'),
  'the redesigned handoff does not create Git refs or tags');


// TEST 10 — Bot-authored claim is safely reusable after a lost POST response,
// a failed Issue PATCH or a restarted serialized watchdog; duplicates fail closed.
const claimMaster = nextMaster;
const claimDigest = 'e'.repeat(64);
const claimInput = {
  project:'commercial-supplier-orders',
  taskId:nextTask,
  taskCommentId:101,
  masterSha:claimMaster,
  contractSha256:claimDigest,
};
const claimBody = [
  'AGENT_CONTROL_NEXT_TASK_CLAIM_V1',
  'PROJECT = '+claimInput.project,
  'TASK_ID = '+claimInput.taskId,
  'SOURCE_COMMENT_ID = '+claimInput.taskCommentId,
  'MASTER_SHA = '+claimInput.masterSha,
  'CONTRACT_SHA256 = '+claimInput.contractSha256,
  'WATCHDOG_RUN_ID = 41280000001',
].join('\n');
const botClaim = {id:102,user:{login:'github-actions[bot]'},body:claimBody};
assert.equal(selectSuccessorCommentClaim({...claimInput,comments:[]}).status,'CREATE',
  'no durable claim means a new comment may be created');
const recovered = selectSuccessorCommentClaim({...claimInput,comments:[botClaim]});
assert.equal(recovered.status,'REUSE',
  'after a lost HTTP response the previously created claim is recovered');
assert.equal(recovered.claim?.commentId,102);
assert.equal(recovered.claim?.watchdogRunId,'41280000001');
assert.equal(selectSuccessorCommentClaim({...claimInput,comments:[botClaim,botClaim]}).status,
  'CONFLICT','concurrent duplicate claims are not silently accepted');
assert.equal(selectSuccessorCommentClaim({
  ...claimInput,comments:[{...botClaim,user:{login:'untrusted-actor'}}],
}).status,'CONFLICT','non-bot cannot impersonate a durable watchdog claim');
assert.equal(selectSuccessorCommentClaim({
  ...claimInput,masterSha:'f'.repeat(40),comments:[botClaim],
}).status,'CONFLICT','stale master claim cannot be reused');
assert.equal(selectSuccessorCommentClaim({
  ...claimInput,contractSha256:'a'.repeat(64),comments:[botClaim],
}).status,'CONFLICT','edited owner task cannot reuse a former claim');
assert.equal(selectSuccessorCommentClaim({
  ...claimInput,comments:[{...botClaim,body:claimBody.replace(
    'SOURCE_COMMENT_ID = 101','SOURCE_COMMENT_ID = 999')}],
}).status,'CONFLICT','claim must remain bound to original task comment');
assert(watchdogHandoffSource.includes('NEXT_TASK_PREPATCH_ISSUE_CHANGED') &&
  watchdogHandoffSource.includes('NEXT_TASK_CONTROL_CHANGED_AFTER_CLAIM'),
  'guarded state transfer must fail closed when the Issue changes around claim creation');
assert(watchdogHandoffSource.includes('selectSuccessorCommentClaim({'),
  'watchdog must read and verify persisted claims before dispatch');

console.log('agent-control-reliability-v2.test.ts: 10/10 PASS');
