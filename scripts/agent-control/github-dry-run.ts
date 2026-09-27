import fs from 'node:fs';
import {
  AGENT_CONTROL_ISSUE_NUMBER,
  AGENT_CONTROL_REPOSITORY,
  classifyPullRequestReadFailure,
  evaluateAgentControlDryRun,
  isTrustedAgentControlCommentEvent,
  type AgentControlDryRunResult,
  type LivePullRequestFacts,
} from '../../src/lib/agent-control/trigger';
import {
  AgentControlParseError,
  parseAgentControlState,
} from '../../src/lib/agent-control/parser';
import type { AgentControlState } from '../../src/lib/agent-control/control-state';
import {
  selectTrustedMac5FixTask,
  type Mac5IssueComment,
} from '../../src/lib/agent-control/mac5';
import {
  READY_BOOTSTRAP_ACCEPTANCE_TASK_ID,
  selectTrustedReadyBootstrapTask,
} from '../../src/lib/agent-control/ready-bootstrap';

const token = process.env.GITHUB_TOKEN;
const eventPath = process.env.GITHUB_EVENT_PATH;
const eventName = process.env.GITHUB_EVENT_NAME;

class GitHubApiError extends Error {
  readonly status: number;

  constructor(pathname: string, status: number) {
    super(`GitHub API ${pathname} returned ${status}`);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

function printResult(
  result: AgentControlDryRunResult,
  extraOutputs: Record<string, string> = {},
) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const outputLines = [
      `result=${result.result}`,
      `task_id=${result.summary?.task_id ?? 'none'}`,
      `verified_head=${result.summary?.verified_head ?? ''}`,
      `master_sha=${result.summary?.master_sha ?? ''}`,
      `active_pr=${result.summary?.active_pr ?? 'null'}`,
      `active_branch=${result.summary?.active_branch ?? ''}`,
      `status=${result.summary?.status ?? ''}`,
      `fix_round=${result.summary?.fix_round ?? 0}`,
      `max_fix_rounds=${result.summary?.max_fix_rounds ?? 0}`,
      ...Object.entries(extraOutputs).map(([key, value]) => `${key}=${value}`),
    ];
    fs.appendFileSync(outputPath, `${outputLines.join('\n')}\n`);
  }

  console.log(`result=${result.result}`);
  console.log(`reason=${result.reason}`);
  if (result.summary) {
    console.log(`status=${result.summary.status}`);
    console.log(`task_id=${result.summary.task_id}`);
    console.log(`active_pr=${result.summary.active_pr ?? 'null'}`);
    console.log(`active_branch=${result.summary.active_branch ?? 'null'}`);
    console.log(`verified_head=${result.summary.verified_head}`);
    console.log(`master_sha=${result.summary.master_sha}`);
    console.log(
      `fix_round=${result.summary.fix_round}/${result.summary.max_fix_rounds}`,
    );
    console.log(
      `idempotency_key=${result.summary.idempotency_key ?? 'null'}`,
    );
  }
  console.log('dry_run=YES');
}

function runtimeFailure(message: string): never {
  printResult({
    result: 'RUNTIME_ERROR',
    reason: message,
    summary: null,
  });
  process.exit(1);
}

async function githubGetJson<T>(pathname: string): Promise<T> {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hongda-agent-control-dry-run',
    },
  });
  if (!response.ok) {
    throw new GitHubApiError(pathname, response.status);
  }
  return response.json() as Promise<T>;
}

async function githubGetIssueComments(
  repository: string,
  issueNumber: number,
): Promise<Mac5IssueComment[]> {
  const comments: Mac5IssueComment[] = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await githubGetJson<Array<{
      id: number;
      body: string | null;
      created_at?: string | null;
      user: { login: string };
    }>>(
      `/repos/${repository}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
    );
    comments.push(...batch.map(comment => ({
      id: comment.id,
      authorLogin: comment.user.login,
      body: comment.body ?? '',
      createdAt: comment.created_at ?? null,
    })));
    if (batch.length < 100) break;
    if (page === 5) {
      throw new Error('Agent Control task history has more than 500 comments');
    }
  }
  return comments;
}

async function main() {
  if (!token) runtimeFailure('GITHUB_TOKEN is required for read-only validation');
  if (!eventPath) runtimeFailure('GITHUB_EVENT_PATH is required');
  if (!eventName) runtimeFailure('GITHUB_EVENT_NAME is required');

  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as any;
  let trustedTrigger = false;
  let repository = process.env.GITHUB_REPOSITORY ?? '';

  if (eventName === 'issue_comment') {
    repository = event.repository?.full_name ?? '';
    trustedTrigger = isTrustedAgentControlCommentEvent({
      action: event.action ?? '',
      repository,
      issueNumber: event.issue?.number ?? -1,
      isPullRequest: Boolean(event.issue?.pull_request),
      actorLogin: event.sender?.login ?? '',
      commentAuthorLogin: event.comment?.user?.login ?? '',
      commentBody: event.comment?.body ?? '',
    });
    if (!trustedTrigger) {
      printResult({
        result: 'UNTRUSTED_TRIGGER',
        reason: 'comment event did not satisfy the trusted trigger contract',
        summary: null,
      });
      return;
    }
  } else if (eventName === 'workflow_dispatch') {
    trustedTrigger = true;
  } else {
    runtimeFailure(`unsupported event: ${eventName}`);
  }

  if (repository !== AGENT_CONTROL_REPOSITORY) {
    printResult({
      result: 'UNTRUSTED_TRIGGER',
      reason: 'repository is not the Agent Control repository',
      summary: null,
    });
    return;
  }

  let state: AgentControlState | null = null;
  try {
    const issue = await githubGetJson<{ body: string | null }>(
      `/repos/${repository}/issues/${AGENT_CONTROL_ISSUE_NUMBER}`,
    );
    state = issue.body ? parseAgentControlState(issue.body) : null;
  } catch (error) {
    if (error instanceof AgentControlParseError) {
      printResult({
        result: 'INVALID_STATE',
        reason: `${error.code}: ${error.message}`,
        summary: null,
      });
      process.exit(1);
    }
    throw error;
  }

  const master = await githubGetJson<{ commit: { sha: string } }>(
    `/repos/${repository}/branches/master`,
  );

  let pullRequest: LivePullRequestFacts | null = null;
  if (state?.active_pr) {
    try {
      const livePr = await githubGetJson<{
        number: number;
        state: 'open' | 'closed';
        head: { ref: string; sha: string };
        base: { ref: string };
      }>(`/repos/${repository}/pulls/${state.active_pr}`);
      pullRequest = {
        number: livePr.number,
        state: livePr.state,
        headBranch: livePr.head.ref,
        headSha: livePr.head.sha,
        baseBranch: livePr.base.ref,
      };
    } catch (error) {
      if (error instanceof GitHubApiError) {
        const classification = classifyPullRequestReadFailure(error.status);
        if (classification === 'INVALID_PR_STATE') {
          printResult({
            result: 'INVALID_PR_STATE',
            reason: `active PR ${state.active_pr} was not found`,
            summary: null,
          });
          process.exit(1);
        }
      }
      throw error;
    }
  }

  const evaluated = evaluateAgentControlDryRun({
    triggerSource: eventName,
    trustedTrigger,
    state,
    liveMasterSha: master.commit.sha,
    pullRequest,
  });

  const extraOutputs: Record<string, string> = {};
  if (
    evaluated.result === 'READY'
    && state?.status === 'READY_FOR_CODEX'
    && state.current_task_id === READY_BOOTSTRAP_ACCEPTANCE_TASK_ID
  ) {
    if (
      state.active_pr !== null
      || state.active_branch !== null
      || state.fix_round !== 0
    ) {
      printResult({
        result: 'INVALID_STATE',
        reason: 'READY_FOR_CODEX bootstrap requires no active PR, no branch, and fix_round 0',
        summary: evaluated.summary,
      });
      process.exit(1);
    }

    const comments = await githubGetIssueComments(
      repository,
      AGENT_CONTROL_ISSUE_NUMBER,
    );
    const task = selectTrustedReadyBootstrapTask(comments, {
      taskId: state.current_task_id,
      baseMasterSha: state.master_sha,
    });

    if (!task) {
      printResult({
        result: 'INVALID_STATE',
        reason: 'trusted READY bootstrap task comment not found or does not match control state',
        summary: evaluated.summary,
      });
      process.exit(1);
    }

    extraOutputs.task_comment_id = String(task.commentId);
    extraOutputs.task_body_b64 = Buffer.from(task.body, 'utf8').toString('base64');
    console.log(`ready_bootstrap_task_comment_id=${task.commentId}`);
    console.log('ready_bootstrap_task_payload=AVAILABLE');
  }

  if (evaluated.result === 'READY' && state?.status === 'FIX_REQUIRED') {
    if (!state.active_pr || !state.active_branch) {
      printResult({
        result: 'INVALID_STATE',
        reason: 'FIX_REQUIRED requires an active PR and branch for MAC-5',
        summary: evaluated.summary,
      });
      process.exit(1);
    }

    const comments = await githubGetIssueComments(repository, state.active_pr);
    const task = selectTrustedMac5FixTask(comments, {
      taskId: state.current_task_id ?? '',
      expectedHead: state.verified_head,
      fixRound: state.fix_round,
      maxFixRounds: state.max_fix_rounds,
    });

    if (!task) {
      printResult({
        result: 'INVALID_STATE',
        reason: 'trusted MAC-5 fix task comment not found or does not match control state',
        summary: evaluated.summary,
      });
      process.exit(1);
    }

    extraOutputs.task_comment_id = String(task.commentId);
    extraOutputs.task_body_b64 = Buffer.from(task.body, 'utf8').toString('base64');
    console.log(`mac5_task_comment_id=${task.commentId}`);
    console.log('mac5_task_payload=AVAILABLE');
  }

  printResult(evaluated, extraOutputs);

  if (
    evaluated.result === 'INVALID_STATE'
    || evaluated.result === 'STALE_MASTER'
    || evaluated.result === 'STALE_PR_HEAD'
    || evaluated.result === 'INVALID_PR_STATE'
  ) {
    process.exit(1);
  }
}

main().catch(error => {
  runtimeFailure(error instanceof Error ? error.message : 'unknown runtime error');
});
