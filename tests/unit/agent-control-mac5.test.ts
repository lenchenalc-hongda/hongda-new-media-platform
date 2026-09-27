import fs from 'node:fs';
import {
  evaluateMac5ChangedPaths,
  isTrustedMac5FixTaskComment,
  selectTrustedMac5FixTask,
} from '../../src/lib/agent-control/mac5';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

console.log('\n=== Agent Control MAC-5 ===');

const expected = {
  taskId: 'CPC-TEST-FIX-001',
  expectedHead: 'a'.repeat(40),
  fixRound: 1,
  maxFixRounds: 3,
};

const trustedBody = [
  'AGENT_CONTROL_FIX_TASK_V1',
  'TASK_ID = CPC-TEST-FIX-001',
  'TASK_STATUS = FIX_REQUIRED',
  'EXPECTED_HEAD = ' + 'a'.repeat(40),
  'FIX_ROUND = 1 / 3',
  '',
  'Fix the failing business-code behavior and update focused tests.',
].join('\n');

assert(
  isTrustedMac5FixTaskComment(
    { id: 1, authorLogin: 'lenchenalc-hongda', body: trustedBody },
    expected,
  ),
  'trusted owner fix task with exact identity is accepted',
);

assert(
  !isTrustedMac5FixTaskComment(
    { id: 2, authorLogin: 'random-user', body: trustedBody },
    expected,
  ),
  'untrusted author cannot control MAC-5',
);

assert(
  !isTrustedMac5FixTaskComment(
    {
      id: 3,
      authorLogin: 'lenchenalc-hongda',
      body: trustedBody.replace('EXPECTED_HEAD = ' + 'a'.repeat(40), 'EXPECTED_HEAD = ' + 'b'.repeat(40)),
    },
    expected,
  ),
  'stale task head is rejected',
);

assert(
  !isTrustedMac5FixTaskComment(
    {
      id: 4,
      authorLogin: 'lenchenalc-hongda',
      body: trustedBody.replace('FIX_ROUND = 1 / 3', 'FIX_ROUND = 2 / 3'),
    },
    expected,
  ),
  'wrong fix round is rejected',
);

assert(
  !isTrustedMac5FixTaskComment(
    { id: 5, authorLogin: 'lenchenalc-hongda', body: trustedBody },
    { ...expected, taskId: 'bad"task' },
  ),
  'unsafe task id is rejected before it can reach shell/JSON publication',
);

assert(
  selectTrustedMac5FixTask(
    [
      { id: 10, authorLogin: 'lenchenalc-hongda', body: trustedBody },
      { id: 11, authorLogin: 'random-user', body: trustedBody },
      { id: 12, authorLogin: 'lenchenalc-hongda', body: trustedBody },
    ],
    expected,
  )?.commentId === 12,
  'latest trusted matching task comment wins',
);

assert(
  evaluateMac5ChangedPaths([
    'src/app/project/page.tsx',
    'tests/unit/project.test.ts',
  ]).ok,
  'business code and focused tests are allowed',
);

for (const denied of [
  '.github/workflows/ci.yml',
  'AGENTS.md',
  'docs/agent-control/PROTOCOL.md',
  'scripts/build-meta.mjs',
  'src/lib/agent-control/trigger.ts',
  'tests/unit/agent-control-trigger.test.ts',
  'supabase/migrations/001_initial_schema.sql',
  'docs/project-review-center/readonly-impact-audit-001.sql',
  '.env.local',
  '.envrc',
  'next.config.cjs',
  'eslint.config.mjs',
  'package.json',
  'pnpm-lock.yaml',
  'vercel.json',
]) {
  assert(
    !evaluateMac5ChangedPaths([denied]).ok,
    'protected path is rejected: ' + denied,
  );
}

assert(
  evaluateMac5ChangedPaths([]).reason === 'NO_CHANGES',
  'empty fix is rejected',
);

assert(
  evaluateMac5ChangedPaths(
    Array.from({ length: 41 }, (_, i) => 'src/app/fix-' + i + '.ts'),
  ).reason === 'TOO_MANY_PATHS',
  'more than 40 changed paths is rejected',
);

const workflowSource = fs.readFileSync(
  '.github/workflows/agent-control-dry-run.yml',
  'utf8',
);
const mac5Start = workflowSource.indexOf('  mac5-fix-existing-pr:');
const mac5Section = workflowSource.slice(mac5Start);
const codexStart = mac5Section.indexOf('      - name: Run bounded MAC-5 fix');
const tokenStart = mac5Section.indexOf('      - name: Mint scoped GitHub App token');
const publishStart = mac5Section.indexOf('      - name: Publish MAC-5 fix');
const codexStep = mac5Section.slice(codexStart, tokenStart);
const tokenStep = mac5Section.slice(tokenStart, publishStart);
const publishStep = mac5Section.slice(publishStart);

assert(
  mac5Start >= 0
  && mac5Section.includes("needs.validate.outputs.status == 'FIX_REQUIRED'")
  && mac5Section.includes("needs.validate.outputs.max_fix_rounds == '3'")
  && mac5Section.includes("needs.validate.outputs.active_pr != 'null'"),
  'MAC-5 routes only validated FIX_REQUIRED existing-PR state with max rounds fixed at 3',
);

assert(
  codexStep.includes('-s workspace-write')
  && codexStep.includes(`-c 'approval_policy="never"'`)
  && codexStep.includes('--ephemeral')
  && codexStep.includes('--ignore-user-config')
  && codexStep.includes('--ignore-rules')
  && codexStep.includes('env -i')
  && !/GH_APP_TOKEN|GITHUB_TOKEN|AGENT_CONTROL_APP_PRIVATE_KEY|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(codexStep),
  'Codex receives workspace write but no GitHub/application/Production credential',
);

assert(
  codexStep.includes('MAC5_GIT_CONTROL_STATE=UNCHANGED')
  && codexStep.includes('MAC5_TASK_ID=INVALID')
  && codexStep.includes('MAC5_FILE_MODE=EXECUTABLE')
  && codexStep.includes('MAC5_MAX_CHANGED_PATHS=40')
  && codexStep.includes('MAC5_PROTECTED_PATH')
  && codexStep.includes('supabase/*')
  && codexStep.includes('*.sql')
  && codexStep.includes('.github/*'),
  'MAC-5 wrapper enforces git-control and protected-path boundaries before token mint',
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
  'GitHub App token remains minimal and is minted only after Codex',
);

assert(
  publishStep.includes('REMOTE_HEAD_MUST_MATCH_EXPECTED')
  && publishStep.includes('MAC5_STAGED_FILE_MODE=UNSAFE')
  && publishStep.includes('git -c core.hooksPath=/dev/null push origin')
  && !publishStep.includes('--force')
  && !/git push[^\n]*(master|main)|gh pr merge|\/merge"/.test(publishStep)
  && publishStep.includes('/issues/$ACTIVE_PR/comments'),
  'publisher fast-forwards only the active PR branch, posts completion, and cannot merge',
);

assert(
  !/issues\/10|AGENT_CONTROL_STATE_START/.test(publishStep),
  'runtime publisher does not mutate Issue #10 control state',
);


const dryRunSource = fs.readFileSync(
  'scripts/agent-control/github-dry-run.ts',
  'utf8',
);
assert(
  dryRunSource.includes('selectTrustedMac5FixTask')
  && dryRunSource.includes('task_body_b64')
  && dryRunSource.includes('more than 500 comments')
  && dryRunSource.includes('mac5_task_payload=AVAILABLE'),
  'cloud validator selects one bounded trusted PM task and fails closed on oversized histories',
);

const ciSource = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
assert(
  ciSource.includes('pnpm exec tsx tests/unit/agent-control-mac5.test.ts'),
  'normal CI runs MAC-5 safety tests',
);

console.log(`Agent Control MAC-5 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
