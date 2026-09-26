import {
  buildAgentControlIdempotencyKey,
  isExecutableAgentControlState,
  type AgentControlState,
} from './control-state';

export const AGENT_CONTROL_REPOSITORY =
  'lenchenalc-hongda/hongda-new-media-platform';
export const AGENT_CONTROL_ISSUE_NUMBER = 10;
export const AGENT_CONTROL_TRIGGER_SENTINEL = 'AGENT_CONTROL_TRIGGER_V1';
export const AGENT_CONTROL_ACTOR_ALLOWLIST = ['lenchenalc-hongda'] as const;

export interface AgentControlCommentEventInput {
  action: string;
  repository: string;
  issueNumber: number;
  isPullRequest: boolean;
  actorLogin: string;
  commentAuthorLogin: string;
  commentBody: string;
}

export function hasStandaloneAgentControlTrigger(body: string): boolean {
  return body
    .split(/\r?\n/)
    .some(line => line.trim() === AGENT_CONTROL_TRIGGER_SENTINEL);
}

export function isTrustedAgentControlCommentEvent(
  input: AgentControlCommentEventInput,
): boolean {
  return input.action === 'created'
    && input.repository === AGENT_CONTROL_REPOSITORY
    && input.issueNumber === AGENT_CONTROL_ISSUE_NUMBER
    && !input.isPullRequest
    && AGENT_CONTROL_ACTOR_ALLOWLIST.includes(
      input.actorLogin as (typeof AGENT_CONTROL_ACTOR_ALLOWLIST)[number],
    )
    && AGENT_CONTROL_ACTOR_ALLOWLIST.includes(
      input.commentAuthorLogin as (typeof AGENT_CONTROL_ACTOR_ALLOWLIST)[number],
    )
    && hasStandaloneAgentControlTrigger(input.commentBody);
}

export const AGENT_CONTROL_DRY_RUN_RESULTS = [
  'READY',
  'NOT_EXECUTABLE',
  'UNTRUSTED_TRIGGER',
  'INVALID_STATE',
  'STALE_MASTER',
  'STALE_PR_HEAD',
  'INVALID_PR_STATE',
  'RUNTIME_ERROR',
] as const;

export type AgentControlDryRunResultCode =
  (typeof AGENT_CONTROL_DRY_RUN_RESULTS)[number];

export type AgentControlTriggerSource = 'issue_comment' | 'workflow_dispatch';

export interface LivePullRequestFacts {
  number: number;
  state: 'open' | 'closed';
  headBranch: string;
  headSha: string;
  baseBranch: string;
}

export interface AgentControlDryRunInput {
  triggerSource: AgentControlTriggerSource;
  trustedTrigger: boolean;
  state: AgentControlState | null;
  liveMasterSha: string;
  pullRequest: LivePullRequestFacts | null;
}

export interface AgentControlDryRunSummary {
  status: AgentControlState['status'];
  task_id: string;
  active_pr: number | null;
  verified_head: string;
  master_sha: string;
  fix_round: number;
  max_fix_rounds: number;
  idempotency_key: string | null;
}

export interface AgentControlDryRunResult {
  result: AgentControlDryRunResultCode;
  reason: string;
  summary: AgentControlDryRunSummary | null;
}

function result(
  code: AgentControlDryRunResultCode,
  reason: string,
  state?: AgentControlState,
): AgentControlDryRunResult {
  return {
    result: code,
    reason,
    summary: state
      ? {
          status: state.status,
          task_id: state.current_task_id ?? 'none',
          active_pr: state.active_pr,
          verified_head: state.verified_head,
          master_sha: state.master_sha,
          fix_round: state.fix_round,
          max_fix_rounds: state.max_fix_rounds,
          idempotency_key: code === 'READY'
            ? buildAgentControlIdempotencyKey(
                AGENT_CONTROL_REPOSITORY,
                state,
              )
            : null,
        }
      : null,
  };
}

export function evaluateAgentControlDryRun(
  input: AgentControlDryRunInput,
): AgentControlDryRunResult {
  if (!input.trustedTrigger) {
    return result('UNTRUSTED_TRIGGER', 'trigger is not trusted');
  }

  const { state } = input;
  if (!state) {
    return result('INVALID_STATE', 'Issue #10 control state is missing or invalid');
  }

  if (!isExecutableAgentControlState(state)) {
    return result(
      'NOT_EXECUTABLE',
      `${state.status} is not an executable Agent Control state`,
      state,
    );
  }

  if (state.active_pr === null) {
    if (state.active_branch !== null) {
      return result(
        'INVALID_STATE',
        'new-task state cannot carry active_branch without active_pr',
        state,
      );
    }
    if (
      state.verified_head !== input.liveMasterSha
      || state.master_sha !== input.liveMasterSha
    ) {
      return result(
        'STALE_MASTER',
        'new-task verified_head/master_sha does not match live master',
        state,
      );
    }
    return result('READY', 'new task is ready for dry-run dispatch', state);
  }

  if (!state.active_branch) {
    return result(
      'INVALID_PR_STATE',
      'active PR requires active_branch',
      state,
    );
  }
  if (!input.pullRequest) {
    return result(
      'INVALID_PR_STATE',
      'active PR metadata is unavailable',
      state,
    );
  }
  if (
    input.pullRequest.state !== 'open'
    || input.pullRequest.number !== state.active_pr
    || input.pullRequest.headBranch !== state.active_branch
    || input.pullRequest.baseBranch !== 'master'
  ) {
    return result(
      'INVALID_PR_STATE',
      'live PR state does not match control state',
      state,
    );
  }
  if (input.pullRequest.headSha !== state.verified_head) {
    return result(
      'STALE_PR_HEAD',
      'live PR head does not match verified_head',
      state,
    );
  }
  if (state.master_sha !== input.liveMasterSha) {
    return result(
      'STALE_MASTER',
      'control master_sha does not match live master',
      state,
    );
  }

  return result('READY', 'active PR is ready for dry-run dispatch', state);
}
