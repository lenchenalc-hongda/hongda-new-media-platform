import fs from 'node:fs';
import {
  READY_BOOTSTRAP_ACCEPTANCE_PATH,
  READY_BOOTSTRAP_ACCEPTANCE_TASK_ID,
  buildReadyBootstrapAcceptanceContent,
  buildReadyBootstrapBranchName,
  evaluateReadyBootstrapChangedPaths,
  isTrustedReadyBootstrapTaskComment,
  selectTrustedReadyBootstrapTask,
} from '../../src/lib/agent-control/ready-bootstrap';
import { isTrustedAgentControlCommentEvent } from '../../src/lib/agent-control/trigger';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

console.log('\n=== Agent Control READY Bootstrap ===');

const baseMasterSha = 'a'.repeat(40);
const expected = {
  taskId: READY_BOOTSTRAP_ACCEPTANCE_TASK_ID,
  baseMasterSha,
};
const trustedBody = [
  'AGENT_CONTROL_NEW_TASK_V1',
  `TASK_ID = ${READY_BOOTSTRAP_ACCEPTANCE_TASK_ID}`,
  'TASK_STATUS = READY_FOR_CODEX',
  `BASE_MASTER_SHA = ${baseMasterSha}`,
  '',
  'Bootstrap one fixed canary path and one Draft PR.',
].join('\n');

assert(
  isTrustedReadyBootstrapTaskComment(
    { id: 1, authorLogin: 'lenchenalc-hongda', body: trustedBody },
    expected,
  ),
  'trusted owner READY task with exact identity is accepted',
);

assert(
  isTrustedReadyBootstrapTaskComment(
    {
      id: 2,
      authorLogin: 'lenchenalc-hongda',
      body: trustedBody.replace(/\n/g, '\r\n'),
    },
    expected,
  ),
  'trusted GitHub web comment using CRLF is accepted',
);

assert(
  !isTrustedReadyBootstrapTaskComment(
    { id: 3, authorLogin: 'random-user', body: trustedBody },
    expected,
  ),
  'untrusted author cannot control READY bootstrap',
);

assert(
  !isTrustedReadyBootstrapTaskComment(
    {
      id: 4,
      authorLogin: 'lenchenalc-hongda',
      body: trustedBody.replace(
        `BASE_MASTER_SHA = ${baseMasterSha}`,
        `BASE_MASTER_SHA = ${'b'.repeat(40)}`,
      ),
    },
    expected,
  ),
  'stale base master SHA is rejected',
);

assert(
  !isTrustedReadyBootstrapTaskComment(
    {
      id: 5,
      authorLogin: 'lenchenalc-hongda',
      body: trustedBody.replace('AGENT_CONTROL_NEW_TASK_V1', 'AGENT_CONTROL_TRIGGER_V1'),
    },
    expected,
  ),
  'missing NEW_TASK sentinel is rejected',
);

assert(
  !isTrustedReadyBootstrapTaskComment(
    {
      id: 6,
      authorLogin: 'lenchenalc-hongda',
      body: trustedBody + `\nTASK_ID = ${READY_BOOTSTRAP_ACCEPTANCE_TASK_ID}`,
    },
    expected,
  ),
  'duplicate task id values are rejected',
);

assert(
  !isTrustedReadyBootstrapTaskComment(
    {
      id: 7,
      authorLogin: 'lenchenalc-hongda',
      body: trustedBody.replace('READY_FOR_CODEX', 'FIX_REQUIRED'),
    },
    expected,
  ),
  'wrong task status is rejected',
);

assert(
  !isTrustedReadyBootstrapTaskComment(
    {
      id: 8,
      authorLogin: 'lenchenalc-hongda',
      body: trustedBody + '\n' + 'x'.repeat(20_001),
    },
    expected,
  ),
  'oversized task payload is rejected',
);

assert(
  selectTrustedReadyBootstrapTask(
    [
      { id: 10, authorLogin: 'lenchenalc-hongda', body: trustedBody },
      { id: 11, authorLogin: 'random-user', body: trustedBody },
      { id: 12, authorLogin: 'lenchenalc-hongda', body: trustedBody },
    ],
    expected,
  )?.commentId === 12,
  'latest trusted READY task comment wins',
);

assert(
  !isTrustedAgentControlCommentEvent({
    action: 'created',
    repository: 'other/repository',
    issueNumber: 10,
    isPullRequest: false,
    actorLogin: 'lenchenalc-hongda',
    commentAuthorLogin: 'lenchenalc-hongda',
    commentBody: 'AGENT_CONTROL_TRIGGER_V1',
  })
  && !isTrustedAgentControlCommentEvent({
    action: 'created',
    repository: 'lenchenalc-hongda/hongda-new-media-platform',
    issueNumber: 11,
    isPullRequest: false,
    actorLogin: 'lenchenalc-hongda',
    commentAuthorLogin: 'lenchenalc-hongda',
    commentBody: 'AGENT_CONTROL_TRIGGER_V1',
  }),
  'wrong repository or issue is rejected',
);

const branch = buildReadyBootstrapBranchName('CPC-Test-Task-001', baseMasterSha);
assert(
  branch === 'codex/agent-control-ready-bootstrap-cpc-test-task-001-aaaaaaaaaaaa',
  'branch name is deterministic from task id and base SHA',
);
assert(
  (() => {
    try {
      buildReadyBootstrapBranchName('bad"task', baseMasterSha);
      return false;
    } catch {
      return true;
    }
  })(),
  'unsafe task id cannot reach branch construction',
);

assert(
  buildReadyBootstrapAcceptanceContent(READY_BOOTSTRAP_ACCEPTANCE_TASK_ID, baseMasterSha) === [
    '# Agent Control READY Bootstrap Acceptance',
    '',
    `- TASK_ID: ${READY_BOOTSTRAP_ACCEPTANCE_TASK_ID}`,
    `- BASE_MASTER_SHA: ${baseMasterSha}`,
    '- RESULT: READY_BOOTSTRAP_PASS',
    '',
  ].join('\n'),
  'acceptance content is fixed and deterministic',
);

assert(
  evaluateReadyBootstrapChangedPaths([READY_BOOTSTRAP_ACCEPTANCE_PATH]).ok,
  'exact acceptance path is allowed',
);
assert(
  evaluateReadyBootstrapChangedPaths([]).reason === 'NO_CHANGES',
  'empty bootstrap change is rejected',
);
assert(
  evaluateReadyBootstrapChangedPaths([
    READY_BOOTSTRAP_ACCEPTANCE_PATH,
    'src/app/example.ts',
  ]).reason === 'MULTIPLE_PATHS',
  'more than one changed path is rejected',
);
assert(
  evaluateReadyBootstrapChangedPaths([
    'docs/agent-control/acceptance/other.md',
  ]).reason === 'WRONG_PATH',
  'wrong bootstrap path is rejected',
);

const workflowSource = fs.readFileSync(
  '.github/workflows/agent-control-dry-run.yml',
  'utf8',
);
const jobStart = workflowSource.indexOf('  ready-task-bootstrap:');
const job = workflowSource.slice(jobStart);
const codexStart = job.indexOf('      - name: Run READY bootstrap canary');
const tokenStart = job.indexOf('      - name: Mint scoped GitHub App token');
const publishStart = job.indexOf('      - name: Publish READY bootstrap Draft PR');
const codexStep = job.slice(codexStart, tokenStart);
const tokenStep = job.slice(tokenStart, publishStart);
const publishStep = job.slice(publishStart);

assert(
  jobStart >= 0
  && job.includes("needs.validate.outputs.status == 'READY_FOR_CODEX'")
  && job.includes("needs.validate.outputs.active_pr == 'null'")
  && job.includes("needs.validate.outputs.active_branch == ''")
  && job.includes("needs.validate.outputs.fix_round == '0'")
  && job.includes("needs.validate.outputs.task_id == 'CPC-AUTO-002-READY-BOOTSTRAP-ACCEPT-001'"),
  'READY bootstrap job is narrowly gated to the canary state',
);

assert(
  codexStep.includes('AGENT_CONTROL_NEW_TASK_V1')
  && codexStep.includes('TASK_STATUS = READY_FOR_CODEX')
  && codexStep.includes('BASE_MASTER_SHA = $EXPECTED_SHA')
  && codexStep.includes('READY_BOOTSTRAP_INITIAL_STATUS=CLEAN_REQUIRED')
  && codexStep.includes('READY_BOOTSTRAP_GIT_CONTROL_STATE=CHANGED')
  && codexStep.includes('READY_BOOTSTRAP_WRONG_PATH')
  && codexStep.includes('READY_BOOTSTRAP_CONTENT=FAIL')
  && codexStep.includes('READY_BOOTSTRAP_FILE_TYPE=INVALID')
  && codexStep.includes('READY_BOOTSTRAP_CODEX_AUTH=UNAVAILABLE')
  && !codexStep.includes('cat "$task_file" >> "$prompt_file"'),
  'Codex step fails closed on malformed task, dirty state, wrong path/content, and missing auth',
);

assert(
  codexStep.includes('env -i')
  && codexStep.includes('-s workspace-write')
  && codexStep.includes(`-c 'approval_policy="never"'`)
  && codexStep.includes('--ephemeral')
  && codexStep.includes('--ignore-user-config')
  && codexStep.includes('--ignore-rules')
  && !/GH_APP_TOKEN|GITHUB_TOKEN|AGENT_CONTROL_APP_PRIVATE_KEY|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(codexStep),
  'Codex receives workspace write but no GitHub/application/Production credential',
);

assert(
  tokenStep.includes(
    'actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1',
  )
  && tokenStep.includes('permission-contents: write')
  && tokenStep.includes('permission-pull-requests: write')
  && !tokenStep.includes('permission-issues:')
  && !tokenStep.includes('permission-actions:')
  && !tokenStep.includes('permission-workflows:'),
  'GitHub App token is minted only after Codex with minimal permissions',
);

assert(
  publishStep.includes('READY_BOOTSTRAP_BRANCH=EXISTS')
  && publishStep.includes('READY_BOOTSTRAP_OPEN_PR=EXISTS')
  && publishStep.includes('READY_BOOTSTRAP_PUSH=UNVERIFIED')
  && publishStep.includes('/pulls?state=open&head=')
  && publishStep.includes('"draft":true')
  && publishStep.includes('/issues/$pr_number/comments')
  && !publishStep.includes('--force')
  && !/git push[^\n]*(master|main)|gh pr merge|\/merge"/.test(publishStep)
  && !/issues\/10|AGENT_CONTROL_STATE_START/.test(publishStep),
  'publisher rejects duplicate branch/task, creates only a Draft PR, posts completion, and cannot merge or mutate Issue #10',
);

const dryRunSource = fs.readFileSync(
  'scripts/agent-control/github-dry-run.ts',
  'utf8',
);
assert(
  dryRunSource.includes('selectTrustedReadyBootstrapTask')
  && dryRunSource.includes('ready_bootstrap_task_payload=AVAILABLE')
  && dryRunSource.includes('more than 500 comments'),
  'cloud validator selects one bounded trusted READY task and fails closed on oversized history',
);

const protocolSource = fs.readFileSync(
  'docs/agent-control/PROTOCOL.md',
  'utf8',
);
assert(
  protocolSource.includes('Work v2 PR-opened race')
  && protocolSource.includes('active_pr = null')
  && protocolSource.includes('exact `active_pr`, `active_branch`, and `verified_head`'),
  'protocol documents the PR-opened binding race and the account-side update required',
);
assert(
  protocolSource.includes('DeepSeek runner proof')
  && protocolSource.includes('no personal API key is copied'),
  'protocol records the separate DeepSeek runner proof boundary',
);

const ciSource = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
assert(
  ciSource.includes('pnpm exec tsx tests/unit/agent-control-ready-bootstrap.test.ts'),
  'normal CI runs READY bootstrap safety tests',
);

console.log(`Agent Control READY Bootstrap tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
