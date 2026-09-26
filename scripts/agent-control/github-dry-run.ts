import fs from 'node:fs';
import {
  AGENT_CONTROL_ISSUE_NUMBER,
  AGENT_CONTROL_REPOSITORY,
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

const token = process.env.GITHUB_TOKEN;
const eventPath = process.env.GITHUB_EVENT_PATH;
const eventName = process.env.GITHUB_EVENT_NAME;

function printResult(result: AgentControlDryRunResult) {
  console.log(`result=${result.result}`);
  console.log(`reason=${result.reason}`);
  if (result.summary) {
    console.log(`status=${result.summary.status}`);
    console.log(`task_id=${result.summary.task_id}`);
    console.log(`active_pr=${result.summary.active_pr ?? 'null'}`);
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
    throw new Error(`GitHub API ${pathname} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
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
  }

  const evaluated = evaluateAgentControlDryRun({
    triggerSource: eventName,
    trustedTrigger,
    state,
    liveMasterSha: master.commit.sha,
    pullRequest,
  });
  printResult(evaluated);

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
