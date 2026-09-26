import fs from 'node:fs';
import path from 'node:path';
import type { AgentControlState } from '../../src/lib/agent-control/control-state';
import { parseAgentControlState } from '../../src/lib/agent-control/parser';
import {
  AGENT_CONTROL_REPOSITORY,
  AGENT_CONTROL_TRIGGER_SENTINEL,
  classifyPullRequestReadFailure,
  evaluateAgentControlDryRun,
  hasStandaloneAgentControlTrigger,
  isTrustedAgentControlCommentEvent,
  type AgentControlCommentEventInput,
  type AgentControlDryRunResultCode,
} from '../../src/lib/agent-control/trigger';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

function fixture(name: string): string {
  return fs.readFileSync(
    path.resolve('tests/fixtures/agent-control', name),
    'utf8',
  );
}

const readyState = parseAgentControlState(fixture('valid-ready.md'));
const fixState = parseAgentControlState(fixture('valid-fix.md'));

const trustedInput: AgentControlCommentEventInput = {
  action: 'created',
  repository: AGENT_CONTROL_REPOSITORY,
  issueNumber: 10,
  isPullRequest: false,
  actorLogin: 'lenchenalc-hongda',
  commentAuthorLogin: 'lenchenalc-hongda',
  commentBody: `${AGENT_CONTROL_TRIGGER_SENTINEL}\n`,
};

function expectResult(
  actual: AgentControlDryRunResultCode,
  expected: AgentControlDryRunResultCode,
  label: string,
) {
  assert(actual === expected, `${label}: expected ${expected}, got ${actual}`);
}

console.log('\n=== Agent Control Trigger ===');

assert(isTrustedAgentControlCommentEvent(trustedInput), 'trusted Issue #10 event');
assert(
  !isTrustedAgentControlCommentEvent({ ...trustedInput, issueNumber: 9 }),
  'wrong issue is untrusted',
);
assert(
  !isTrustedAgentControlCommentEvent({ ...trustedInput, isPullRequest: true }),
  'PR comment is untrusted',
);
assert(
  !isTrustedAgentControlCommentEvent({ ...trustedInput, actorLogin: 'public-user' }),
  'wrong actor is untrusted',
);
assert(
  !isTrustedAgentControlCommentEvent({
    ...trustedInput,
    commentAuthorLogin: 'public-user',
  }),
  'non-allowlisted comment author is untrusted',
);
assert(
  !isTrustedAgentControlCommentEvent({
    ...trustedInput,
    repository: 'another-owner/another-repo',
  }),
  'cross-repository event is untrusted',
);
assert(
  !isTrustedAgentControlCommentEvent({ ...trustedInput, action: 'edited' }),
  'edited comment is untrusted',
);
assert(
  !hasStandaloneAgentControlTrigger(
    `prefix ${AGENT_CONTROL_TRIGGER_SENTINEL} suffix`,
  ),
  'sentinel substring is not standalone',
);
assert(
  hasStandaloneAgentControlTrigger(
    `some text\n  ${AGENT_CONTROL_TRIGGER_SENTINEL}  \nmore text`,
  ),
  'standalone sentinel with surrounding whitespace is trusted',
);

expectResult(
  evaluateAgentControlDryRun({
    triggerSource: 'issue_comment',
    trustedTrigger: true,
    state: readyState,
    liveMasterSha: readyState.master_sha,
    pullRequest: null,
  }).result,
  'READY',
  'new task exact master',
);
expectResult(
  evaluateAgentControlDryRun({
    triggerSource: 'issue_comment',
    trustedTrigger: true,
    state: readyState,
    liveMasterSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    pullRequest: null,
  }).result,
  'STALE_MASTER',
  'new task stale master',
);

const fixStateWithLiveMaster: AgentControlState = {
  ...fixState,
  master_sha: 'd1a93bab48f7535406d2ecb27ece17f39858c6f8',
};
const matchingPr = {
  number: fixState.active_pr!,
  state: 'open' as const,
  headBranch: fixState.active_branch!,
  headSha: fixState.verified_head,
  baseBranch: 'master',
};
expectResult(
  evaluateAgentControlDryRun({
    triggerSource: 'issue_comment',
    trustedTrigger: true,
    state: fixStateWithLiveMaster,
    liveMasterSha: fixStateWithLiveMaster.master_sha,
    pullRequest: matchingPr,
  }).result,
  'READY',
  'fix task matching PR',
);
expectResult(
  evaluateAgentControlDryRun({
    triggerSource: 'issue_comment',
    trustedTrigger: true,
    state: fixStateWithLiveMaster,
    liveMasterSha: fixStateWithLiveMaster.master_sha,
    pullRequest: {
      ...matchingPr,
      headSha: 'ffffffffffffffffffffffffffffffffffffffff',
    },
  }).result,
  'STALE_PR_HEAD',
  'fix task stale PR head',
);
expectResult(
  evaluateAgentControlDryRun({
    triggerSource: 'issue_comment',
    trustedTrigger: true,
    state: fixStateWithLiveMaster,
    liveMasterSha: fixStateWithLiveMaster.master_sha,
    pullRequest: { ...matchingPr, state: 'closed' },
  }).result,
  'INVALID_PR_STATE',
  'closed PR invalid',
);
expectResult(
  evaluateAgentControlDryRun({
    triggerSource: 'issue_comment',
    trustedTrigger: true,
    state: { ...fixStateWithLiveMaster, active_branch: null },
    liveMasterSha: fixStateWithLiveMaster.master_sha,
    pullRequest: matchingPr,
  }).result,
  'INVALID_PR_STATE',
  'active PR without branch fails closed',
);
expectResult(
  evaluateAgentControlDryRun({
    triggerSource: 'issue_comment',
    trustedTrigger: true,
    state: fixStateWithLiveMaster,
    liveMasterSha: fixStateWithLiveMaster.master_sha,
    pullRequest: null,
  }).result,
  'INVALID_PR_STATE',
  'missing active PR produces deterministic invalid PR state',
);
assert(
  classifyPullRequestReadFailure(404) === 'INVALID_PR_STATE',
  'PR 404 classified as INVALID_PR_STATE',
);
assert(
  classifyPullRequestReadFailure(500) === 'RUNTIME_ERROR',
  'PR server failure classified as RUNTIME_ERROR',
);

for (const status of [
  'APPROVED_FOR_MERGE',
  'MERGED',
  'BLOCKED',
  'NEEDS_DECISION',
  'FAILED',
  'WAITING_REVIEW',
  'CODEX_WORKING',
] as const) {
  expectResult(
    evaluateAgentControlDryRun({
      triggerSource: 'workflow_dispatch',
      trustedTrigger: true,
      state: {
        ...readyState,
        status,
        current_task_id: readyState.current_task_id,
        active_pr: status === 'APPROVED_FOR_MERGE' ? 12 : null,
      },
      liveMasterSha: readyState.master_sha,
      pullRequest: status === 'APPROVED_FOR_MERGE' ? matchingPr : null,
    }).result,
    'NOT_EXECUTABLE',
    `${status} not executable`,
  );
}

expectResult(
  evaluateAgentControlDryRun({
    triggerSource: 'issue_comment',
    trustedTrigger: false,
    state: readyState,
    liveMasterSha: readyState.master_sha,
    pullRequest: null,
  }).result,
  'UNTRUSTED_TRIGGER',
  'untrusted actor cannot produce READY',
);
expectResult(
  evaluateAgentControlDryRun({
    triggerSource: 'issue_comment',
    trustedTrigger: true,
    state: { ...readyState, status: 'BLOCKED' },
    liveMasterSha: readyState.master_sha,
    pullRequest: null,
  }).result,
  'NOT_EXECUTABLE',
  'fake READY in comment cannot override Issue body state',
);
expectResult(
  evaluateAgentControlDryRun({
    triggerSource: 'workflow_dispatch',
    trustedTrigger: true,
    state: readyState,
    liveMasterSha: readyState.master_sha,
    pullRequest: null,
  }).result,
  'READY',
  'manual dry-run still validates state',
);

const workflowSource = fs.readFileSync(
  '.github/workflows/agent-control-dry-run.yml',
  'utf8',
);
const dryRunSource = fs.readFileSync(
  'scripts/agent-control/github-dry-run.ts',
  'utf8',
);
assert(
  dryRunSource.includes('GITHUB_OUTPUT')
  && dryRunSource.includes('result=${result.result}')
  && dryRunSource.includes('verified_head='),
  'dry-run adapter exports safe job outputs',
);
assert(
  workflowSource.includes('types: [created]')
  && workflowSource.includes('workflow_dispatch:'),
  'workflow has created issue_comment and manual triggers',
);
assert(
  workflowSource.includes('contents: read')
  && workflowSource.includes('issues: read')
  && workflowSource.includes('pull-requests: read'),
  'workflow uses read-only permissions',
);
assert(
  workflowSource.includes('needs: gate')
  && workflowSource.includes("needs.gate.outputs.trusted == 'true'"),
  'heavy validate job depends on trusted gate output',
);
const gateSection = workflowSource.slice(
  workflowSource.indexOf('  gate:'),
  workflowSource.indexOf('  validate:'),
);
const validateSection = workflowSource.slice(
  workflowSource.indexOf('  validate:'),
);
assert(
  !gateSection.includes('actions/checkout')
  && !gateSection.includes('pnpm install')
  && !gateSection.includes('pnpm exec'),
  'gate job does not perform checkout or dependency installation',
);
assert(
  !workflowSource.includes('EVENT_PATH: ${{ github.event_path }}')
  && gateSection.includes('GITHUB_EVENT_PATH'),
  'gate uses runner-provided GITHUB_EVENT_PATH without a custom override',
);
assert(
  gateSection.includes("github.event.issue.number == 10")
  && gateSection.includes("github.event.issue.pull_request == null")
  && gateSection.includes(
    "github.event.sender.login == 'lenchenalc-hongda'",
  )
  && gateSection.includes(
    "github.event.comment.user.login == 'lenchenalc-hongda'",
  )
  && gateSection.includes('AGENT_CONTROL_TRIGGER_V1'),
  'cheap gate checks repository, issue, PR, actor, and sentinel metadata',
);
assert(
  validateSection.includes('actions/checkout@v4')
  && validateSection.includes('pnpm install --frozen-lockfile'),
  'only trusted validate job performs checkout and install',
);
const selfHostedSection = workflowSource.slice(
  workflowSource.indexOf('  self-hosted-proof:'),
);
assert(
  selfHostedSection.includes(
    'runs-on: [self-hosted, macOS, X64, hongda-agent-control]',
  ),
  'self-hosted proof uses the dedicated runner label set',
);
assert(
  selfHostedSection.includes('needs: validate')
  && selfHostedSection.includes(
    "needs.validate.outputs.result == 'READY'",
  ),
  'self-hosted proof runs only after validated READY',
);
assert(
  selfHostedSection.includes(
    'ref: ${{ needs.validate.outputs.verified_head }}',
  )
  && selfHostedSection.includes('persist-credentials: false'),
  'self-hosted proof checks out the exact validated SHA without persisted credentials',
);
assert(
  selfHostedSection.includes('git diff --exit-code')
  && selfHostedSection.includes('git diff --cached --exit-code')
  && selfHostedSection.includes('git status --porcelain')
  && selfHostedSection.includes('ROUTING_PROOF=PASS'),
  'self-hosted proof performs repository integrity checks',
);
assert(
  selfHostedSection.includes('timeout-minutes:')
  && !selfHostedSection.includes('pnpm install')
  && !/\bcodex\b/i.test(selfHostedSection)
  && !/openai|supabase|openai_api_key|service_role|wechat|douyin/i.test(
    selfHostedSection,
  ),
  'self-hosted proof has a timeout and no model/install/application secrets',
);
assert(
  !selfHostedSection.includes('issues: write')
  && !selfHostedSection.includes('pull-requests: write')
  && !selfHostedSection.includes('contents: write')
  && !selfHostedSection.includes('id-token: write'),
  'self-hosted proof has no GitHub write permission',
);
for (const forbidden of [
  'contents: write',
  'issues: write',
  'pull-requests: write',
  'id-token: write',
  'OPENAI_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]) {
  assert(
    !workflowSource.includes(forbidden),
    `workflow does not include ${forbidden}`,
  );
}

console.log(`Agent Control Trigger tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
