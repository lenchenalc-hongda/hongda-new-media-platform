import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  READY_BOOTSTRAP_ACCEPTANCE_PATH,
  READY_BOOTSTRAP_ACCEPTANCE_TASK_ID,
  READY_DOCS_PILOT_ACCEPTANCE_TASK_ID,
  READY_DOCS_PILOT_ACCEPTANCE_PATH,
  buildReadyBootstrapAcceptanceContent,
  buildReadyBootstrapBranchName,
  evaluateReadyBootstrapChangedPaths,
  isTrustedReadyBootstrapTaskComment,
  selectTrustedReadyBootstrapTask,
  readyTaskRecipe,
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
    { id: 6, authorLogin: 'lenchenalc-hongda', body: trustedBody + '\nTASK_STATUS=FAILED' },
    expected,
  ),
  'duplicate task status with alternate spacing is rejected',
);

assert(
  readyTaskRecipe(READY_DOCS_PILOT_ACCEPTANCE_TASK_ID)?.path === READY_DOCS_PILOT_ACCEPTANCE_PATH
    && readyTaskRecipe('CPC-UNAPPROVED-001') === null,
  'repository recipe allowlist admits only approved task identities',
);
assert(
  isTrustedReadyBootstrapTaskComment(
    { id: 9, authorLogin: 'lenchenalc-hongda', body: trustedBody.replaceAll(
      READY_BOOTSTRAP_ACCEPTANCE_TASK_ID, READY_DOCS_PILOT_ACCEPTANCE_TASK_ID,
    ) },
    { taskId: READY_DOCS_PILOT_ACCEPTANCE_TASK_ID, baseMasterSha },
  ),
  'second pilot task requires a matching trusted owner comment',
);

assert(
  buildReadyBootstrapAcceptanceContent(READY_DOCS_PILOT_ACCEPTANCE_TASK_ID, baseMasterSha) === [
    '# Agent Control READY Docs Pilot Acceptance',
    '',
    `- TASK_ID: ${READY_DOCS_PILOT_ACCEPTANCE_TASK_ID}`,
    `- BASE_MASTER_SHA: ${baseMasterSha}`,
    '- RESULT: READY_DOCS_PILOT_PASS',
    '',
  ].join('\n'),
  'second task has deterministic, repository-owned file content',
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
  selectTrustedReadyBootstrapTask(
    [
      { id: 12, authorLogin: 'lenchenalc-hongda', body: trustedBody },
      { id: 13, authorLogin: 'lenchenalc-hongda', body: trustedBody.replace('READY_FOR_CODEX', 'FAILED') },
    ],
    expected,
  ) === null,
  'newest owner task supersedes an older matching task and fails closed',
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
assert(
  evaluateReadyBootstrapChangedPaths([READY_DOCS_PILOT_ACCEPTANCE_PATH], READY_DOCS_PILOT_ACCEPTANCE_PATH).ok
    && evaluateReadyBootstrapChangedPaths([READY_BOOTSTRAP_ACCEPTANCE_PATH], READY_DOCS_PILOT_ACCEPTANCE_PATH).reason === 'WRONG_PATH',
  'second task allows its exact path and rejects the original canary path',
);

const jsonEncoderPath = path.resolve(
  'scripts/agent-control/ready-bootstrap-json.rb',
);
const publishGuardPath = path.resolve(
  'scripts/agent-control/ready-bootstrap-publish-guard.rb',
);
const resultGuardPath = path.resolve('scripts/agent-control/ready-bootstrap-result.rb');
const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'agent-control-ready-bootstrap-'),
);
const multilineBodyPath = path.join(temporaryDirectory, 'body.md');
const multilineBody = [
  'READY bootstrap acceptance for Agent Control.',
  '',
  'TASK_ID = ' + READY_BOOTSTRAP_ACCEPTANCE_TASK_ID,
  'BASE_MASTER_SHA = ' + baseMasterSha,
  '',
  'Multi-line body must survive JSON encoding.',
].join('\n');
fs.writeFileSync(multilineBodyPath, multilineBody, 'utf8');

try {
  const draftPrPayload = execFileSync(
    'ruby',
    [
      jsonEncoderPath,
      'draft-pr',
      'Agent Control READY task bootstrap acceptance',
      'codex/test-ready-branch',
      'master',
      multilineBodyPath,
    ],
    { encoding: 'utf8' },
  );
  const parsedDraftPrPayload = JSON.parse(draftPrPayload) as {
    body: string;
    draft: boolean;
    base: string;
  };
  assert(
    parsedDraftPrPayload.body === multilineBody
      && parsedDraftPrPayload.draft === true
      && parsedDraftPrPayload.base === 'master',
    'actual draft PR payload builder produces parseable JSON with exact multi-line body',
  );

  const commentPayload = execFileSync(
    'ruby',
    [jsonEncoderPath, 'comment', multilineBodyPath],
    { encoding: 'utf8' },
  );
  assert(
    (JSON.parse(commentPayload) as { body: string }).body === multilineBody,
    'actual completion comment payload builder produces parseable JSON with exact multi-line body',
  );

  assert(
    (() => {
      try {
        execFileSync('ruby', [publishGuardPath, baseMasterSha, baseMasterSha]);
        return true;
      } catch {
        return false;
      }
    })(),
    'publish guard accepts matching remote master SHA',
  );
  assert(
    (() => {
      try {
        execFileSync('ruby', [publishGuardPath, baseMasterSha, 'b'.repeat(40)]);
        return false;
      } catch {
        return true;
      }
    })(),
    'publish guard rejects changed remote master SHA',
  );
  assert(
    (() => {
      try {
        execFileSync('ruby', [publishGuardPath, baseMasterSha, 'not-a-sha']);
        return false;
      } catch {
        return true;
      }
    })(),
    'publish guard rejects malformed remote master reads',
  );
  const resultPath = path.join(temporaryDirectory, 'result.json');
  const validResult = {
    status: 'PASS', task_id: READY_DOCS_PILOT_ACCEPTANCE_TASK_ID,
    base_master_sha: baseMasterSha, file_path: READY_DOCS_PILOT_ACCEPTANCE_PATH,
    workspace_write_confirmed: true,
    acceptance_sentinel: 'CODEX_READY_BOOTSTRAP_PROOF=PASS',
  };
  const verifyResult = (value: string) => {
    fs.writeFileSync(resultPath, value);
    try {
      execFileSync('ruby', [resultGuardPath, resultPath, READY_DOCS_PILOT_ACCEPTANCE_TASK_ID,
        baseMasterSha, READY_DOCS_PILOT_ACCEPTANCE_PATH]);
      return true;
    } catch { return false; }
  };
  assert(verifyResult(JSON.stringify(validResult)), 'structured result accepts exact pilot proof');
  assert(!verifyResult(JSON.stringify({ ...validResult, file_path: '../escape.md' })),
    'structured result rejects a different path');
  assert(!verifyResult(JSON.stringify({ ...validResult, extra: 'PASS' })),
    'structured result rejects extra fields');
  assert(!verifyResult(JSON.stringify(validResult) + '\n{}'),
    'structured result rejects trailing JSON');
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

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
  job.includes("needs.validate.outputs.task_id == 'CPC-AUTO-003-READY-DOCS-PILOT-ACCEPT-001'")
    && codexStep.includes('READY_BOOTSTRAP_RECIPE=INVALID')
    && codexStep.includes('ready-bootstrap-result.rb')
    && codexStep.includes('READY_BOOTSTRAP_PARENT_DIRECTORY=INVALID')
    && publishStep.includes('READY_BOOTSTRAP_PUBLISH_CONTENT=INVALID'),
  'second recipe is gated and checked before credentials and again during publishing',
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
  && publishStep.includes('"$json_encoder" draft-pr')
  && publishStep.includes('/issues/$pr_number/comments')
  && !publishStep.includes('--force')
  && !/git push[^\n]*(master|main)|gh pr merge|\/merge"/.test(publishStep)
  && !/issues\/10|AGENT_CONTROL_STATE_START/.test(publishStep),
  'publisher rejects duplicate branch/task, creates only a Draft PR, posts completion, and cannot merge or mutate Issue #10',
);

assert(
  publishStep.includes('ready-bootstrap-json.rb')
  && publishStep.includes('ready-bootstrap-publish-guard.rb')
  && publishStep.includes('validate_json_payload "$pr_payload" DRAFT_PR')
  && publishStep.includes('validate_json_payload "$completion_payload" COMPLETION_COMMENT')
  && !publishStep.includes('pr_body="$(awk')
  && !publishStep.includes('pr_payload="$(printf'),
  'publisher uses executable JSON encoding for real outgoing payloads',
);

const untrackedRepo = fs.mkdtempSync(
  path.join(os.tmpdir(), 'agent-control-ready-untracked-'),
);
try {
  execFileSync('git', ['init', '-q', untrackedRepo]);
  const canaryFile = path.join(untrackedRepo, READY_BOOTSTRAP_ACCEPTANCE_PATH);
  fs.mkdirSync(path.dirname(canaryFile), { recursive: true });
  fs.writeFileSync(canaryFile, 'canary\\n', 'utf8');
  const status = execFileSync(
    'git',
    ['-C', untrackedRepo, 'status', '--porcelain=v1', '--untracked-files=all'],
    { encoding: 'utf8' },
  );
  assert(
    status.trimEnd() === `?? ${READY_BOOTSTRAP_ACCEPTANCE_PATH}`,
    'real git status expands a newly created nested directory to the exact canary file',
  );
  const pilotFile = path.join(untrackedRepo, READY_DOCS_PILOT_ACCEPTANCE_PATH);
  fs.writeFileSync(pilotFile, 'pilot\n', 'utf8');
  const twoFileStatus = execFileSync('git',
    ['-C', untrackedRepo, 'status', '--porcelain=v1', '--untracked-files=all'],
    { encoding: 'utf8' });
  assert(twoFileStatus.trimEnd().split('\n').length === 2,
    'real git status exposes multiple nested untracked files for rejection',
  );
  assert(
    publishStep.includes('git status --porcelain=v1 --untracked-files=all | wc -l')
      && publishStep.includes('status_entry="$(git status --porcelain=v1 --untracked-files=all)"'),
    'READY publisher counts and checks the exact expanded untracked path',
  );
} finally {
  fs.rmSync(untrackedRepo, { recursive: true, force: true });
}

const beforePublishIndex = publishStep.indexOf(
  'assert_remote_master BEFORE_PUBLISH',
);
const switchIndex = publishStep.indexOf(
  'git -c core.hooksPath=/dev/null switch -c "$branch"',
);
const beforePrIndex = publishStep.indexOf('assert_remote_master BEFORE_PR');
const createPrIndex = publishStep.indexOf(
  '"https://api.github.com/repos/$REPOSITORY/pulls"',
);
assert(
  beforePublishIndex >= 0
  && switchIndex > beforePublishIndex
  && beforePrIndex > switchIndex
  && createPrIndex > beforePrIndex
  && (publishStep.match(/assert_remote_master BEFORE_PUBLISH/g) ?? []).length === 1
  && (publishStep.match(/assert_remote_master BEFORE_PR/g) ?? []).length === 1,
  'publisher rechecks remote master immediately before branch publication and before PR POST',
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
  && /exact `active_pr`, `active_branch`,\s+and `verified_head`/.test(protocolSource),
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
