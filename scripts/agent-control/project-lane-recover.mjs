import { INFRA_FAILURES, classifyFailureText, recoveryDecision, selectCorrelatedDispatchRun } from './reliability-core.mjs';
const REPOSITORY = process.env.GITHUB_REPOSITORY || 'lenchenalc-hongda/hongda-new-media-platform';
const PROJECT = process.env.PROJECT_SLUG || '';
const CONTROL_ISSUE = Number(process.env.CONTROL_ISSUE || '0');
const WORKFLOW_FILE = process.env.WORKFLOW_FILE || '';
const CURRENT_RUN_ID = Number(process.env.CURRENT_RUN_ID || '0');
const TOKEN = process.env.GITHUB_TOKEN || '';
const PROVIDED_FAILURE_CLASS = process.env.FAILURE_CLASS || '';
const MAX_INFRA_RETRIES = Number(process.env.MAX_INFRA_RETRIES || '3');

function fail(message) {
  console.error(`RELIABILITY_RECOVERY_ERROR=${message}`);
  process.exit(1);
}

function parseState(body) {
  const match = /<!-- AGENT_CONTROL_STATE_START -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- AGENT_CONTROL_STATE_END -->/.exec(body || '');
  if (!match) return null;
  return JSON.parse(match[1]);
}

function replaceState(body, state) {
  const encoded = JSON.stringify(state, null, 2);
  const replacement = `<!-- AGENT_CONTROL_STATE_START -->\n\`\`\`json\n${encoded}\n\`\`\`\n<!-- AGENT_CONTROL_STATE_END -->`;
  return String(body || '').replace(
    /<!-- AGENT_CONTROL_STATE_START -->[\s\S]*?<!-- AGENT_CONTROL_STATE_END -->/,
    replacement,
  );
}

async function api(pathname, options = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hongda-agent-control-reliability-v2',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${pathname} returned ${response.status}: ${text.slice(0, 300)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function jobLog(jobId) {
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/actions/jobs/${jobId}/logs`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'hongda-agent-control-reliability-v2',
      },
      redirect: 'follow',
    },
  );
  if (!response.ok) return '';
  return response.text();
}

async function inferFailureClass() {
  if (PROVIDED_FAILURE_CLASS && PROVIDED_FAILURE_CLASS !== 'NONE') return PROVIDED_FAILURE_CLASS;
  if (!CURRENT_RUN_ID) return 'UNKNOWN_INFRA_FAILURE';

  const jobsPayload = await api(`/repos/${REPOSITORY}/actions/runs/${CURRENT_RUN_ID}/jobs?per_page=100`);
  const jobs = jobsPayload?.jobs || [];
  const failed = jobs.filter(job => ['failure', 'timed_out', 'cancelled'].includes(job.conclusion));
  for (const job of failed) {
    const log = await jobLog(job.id);
    const fromLog = classifyFailureText(log);
    if (fromLog && fromLog !== 'UNKNOWN_INFRA_FAILURE') return fromLog;

    const failedSteps = (job.steps || []).filter(step => step.conclusion === 'failure').map(step => step.name || '');
    const names = failedSteps.join(' | ');
    if (/checkout/i.test(names)) return 'CHECKOUT_FAILURE';
    if (/Install dependencies|setup-node|pnpm/i.test(names)) return 'DEPENDENCY_FAILURE';
    if (/Set up job/i.test(names)) return 'NETWORK_FAILURE';
    if (/Validate project lane task/i.test(names)) return 'STALE_TASK';
    if (/Run bounded project task/i.test(names)) return 'CODEX_CRASH';
  }
  return 'UNKNOWN_INFRA_FAILURE';
}

function retryDelaySeconds(attempt) {
  if (attempt <= 1) return 60;
  if (attempt === 2) return 300;
  return 600;
}


async function confirmDispatch(startedAtMs, dispatchRefSha, state, expectedHead) {
  for (let poll = 0; poll < 12; poll++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const now = Date.now();
    const runs = await api(
      '/repos/' + REPOSITORY + '/actions/workflows/' +
      encodeURIComponent(WORKFLOW_FILE) + '/runs?event=workflow_dispatch&per_page=30',
    );
    const entries = runs?.workflow_runs || [];
    const possible = entries.filter(run =>
      run.head_sha === dispatchRefSha &&
      Number.isFinite(Date.parse(run.created_at || '')) &&
      Date.parse(run.created_at) >= startedAtMs - 2000);
    const evidenceByRunId = {};
    for (const run of possible.slice(0, 4)) {
      const jobs = await api('/repos/' + REPOSITORY + '/actions/runs/' + run.id + '/jobs?per_page=100');
      const validators = (jobs?.jobs || []).filter(job => job.name === 'validate' && job.conclusion === 'success');
      if (validators.length === 1) evidenceByRunId[String(run.id)] = await jobLog(validators[0].id);
    }
    const result = selectCorrelatedDispatchRun({
      runs: entries, evidenceByRunId,
      dispatchedAtMs: startedAtMs, checkedAtMs: now, dispatchRefSha,
      expectedRepository: REPOSITORY, expectedProject: PROJECT,
      expectedTaskId: state.current_task_id, expectedHead,
      expectedStateStatus: state.status,
      expectedActivePr: state.active_pr,
      expectedActiveBranch: state.active_branch,
    });
    if (result.status === 'AMBIGUOUS') {
      throw new Error('INFRA_RECOVERY_DISPATCH_AMBIGUOUS_RUN');
    }
    if (result.status === 'CONFIRMED') return result.run;
  }
  return null;
}

async function commentIssue(body) {
  await api(`/repos/${REPOSITORY}/issues/${CONTROL_ISSUE}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function main() {
  if (!TOKEN || !PROJECT || !CONTROL_ISSUE || !WORKFLOW_FILE) fail('required runtime inputs missing');

  const issue = await api(`/repos/${REPOSITORY}/issues/${CONTROL_ISSUE}`);
  const state = parseState(issue.body);
  if (!state || state.project !== PROJECT) fail('control issue state missing or project mismatch');

  if (['HUMAN_GATE', 'BLOCKED', 'PASS', 'COMPLETE', 'MERGED'].includes(state.status)) {
    console.log(`RECOVERY_SKIPPED_STATE=${state.status}`);
    return;
  }
  if (!['READY_FOR_CODEX', 'FIX_REQUIRED'].includes(state.status)) {
    console.log(`RECOVERY_SKIPPED_NON_EXECUTABLE_STATE=${state.status}`);
    return;
  }

  const failureClass = await inferFailureClass();
  console.log(`INFRA_FAILURE_CLASS=${failureClass}`);

  if (!INFRA_FAILURES.has(failureClass)) {
    console.log('INFRA_RECOVERY=NOT_APPLICABLE');
    return;
  }

  const currentRetries = Number.isInteger(state.infra_retry_count) ? state.infra_retry_count : 0;
  const decision = recoveryDecision({
    failureClass,
    retryCount: currentRetries,
    maxRetries: MAX_INFRA_RETRIES,
  });
  if (decision.action === 'BLOCK') {
    const terminalCredential = failureClass === 'PROVIDER_401';
    state.status = 'BLOCKED';
    state.runtime_status = 'BLOCKED';
    state.last_failure_class = failureClass;
    state.last_failure_run_id = CURRENT_RUN_ID || null;
    state.owner_action_required = true;
    state.auto_production = false;
    const body = replaceState(issue.body, state);
    await api(`/repos/${REPOSITORY}/issues/${CONTROL_ISSUE}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
      headers: { 'Content-Type': 'application/json' },
    });
    await commentIssue(
      [
        'AGENT_CONTROL_BLOCKED_V2',
        `PROJECT = ${PROJECT}`,
        `TASK_ID = ${state.current_task_id}`,
        `FAILURE_CLASS = ${failureClass}`,
        `INFRA_RETRY_COUNT = ${currentRetries} / ${MAX_INFRA_RETRIES}`,
        `LAST_RUN_ID = ${CURRENT_RUN_ID || 'unknown'}`,
        'OWNER_ACTION_REQUIRED = YES',
        'PRODUCTION_CHANGED = NO',
        terminalCredential
          ? 'MESSAGE = Provider rejected the configured credential (401). Stop identical-key retries; rotate/verify the key in the self-hosted runner and start a fresh bounded nonproduction proof.'
          : 'MESSAGE = Automatic infrastructure recovery was exhausted. PM/owner must inspect the remaining credential, runner, or provider blocker before execution can continue.',
      ].join('\n'),
    );
    console.log(terminalCredential ? 'INFRA_RECOVERY=BLOCKED_NON_RETRYABLE_PROVIDER_401' : 'INFRA_RECOVERY=EXHAUSTED');
    return;
  }

  const nextRetry = decision.nextRetryCount;
  state.runtime_status = 'INFRA_RETRY';
  state.infra_retry_count = nextRetry;
  state.last_failure_class = failureClass;
  state.last_failure_run_id = CURRENT_RUN_ID || null;
  state.owner_action_required = false;
  state.auto_production = false;
  const updatedBody = replaceState(issue.body, state);
  await api(`/repos/${REPOSITORY}/issues/${CONTROL_ISSUE}`, {
    method: 'PATCH',
    body: JSON.stringify({ body: updatedBody }),
    headers: { 'Content-Type': 'application/json' },
  });

  const delay = retryDelaySeconds(nextRetry);
  console.log(`INFRA_RETRY_BACKOFF_SECONDS=${delay}`);
  await new Promise(resolve => setTimeout(resolve, delay * 1000));

  const freshIssue = await api(`/repos/${REPOSITORY}/issues/${CONTROL_ISSUE}`);
  const freshState = parseState(freshIssue.body);
  if (!freshState || freshState.current_task_id !== state.current_task_id || !['READY_FOR_CODEX', 'FIX_REQUIRED'].includes(freshState.status)) {
    console.log('INFRA_RECOVERY=STALE_AFTER_BACKOFF');
    return;
  }

  const expectedHead = freshState.status === 'FIX_REQUIRED'
    ? freshState.verified_head
    : freshState.master_sha;
  if (freshState.status !== state.status ||
      freshState.active_pr !== state.active_pr ||
      freshState.active_branch !== state.active_branch ||
      freshState.verified_head !== state.verified_head ||
      freshState.infra_retry_count !== nextRetry) {
    console.log('INFRA_RECOVERY=STALE_CONTROL_STATE_BEFORE_DISPATCH');
    return;
  }

  const master = await api('/repos/' + REPOSITORY + '/branches/master');
  const dispatchRefSha = master?.commit?.sha;
  if (!/^[0-9a-f]{40}$/.test(String(dispatchRefSha))) {
    throw new Error('INFRA_RECOVERY_LIVE_MASTER_UNAVAILABLE');
  }
  if (freshState.status === 'READY_FOR_CODEX' && expectedHead !== dispatchRefSha) {
    console.log('INFRA_RECOVERY=STALE_READY_MASTER_BEFORE_DISPATCH');
    return;
  }
  const startedAt = Date.now();
  await api(`/repos/${REPOSITORY}/actions/workflows/${encodeURIComponent(WORKFLOW_FILE)}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({
      ref: 'master',
      inputs: {
        recovery_task_id: String(freshState.current_task_id || ''),
        recovery_expected_head: String(expectedHead || ''),
        recovery_attempt: String(nextRetry),
        recovery_reason: failureClass,
      },
    }),
    headers: { 'Content-Type': 'application/json' },
  });

  const dispatched = await confirmDispatch(startedAt, dispatchRefSha, freshState, expectedHead);
  if (!dispatched) {
    await commentIssue(
      [
        'AGENT_CONTROL_INFRA_RECOVERY_V2',
        `PROJECT = ${PROJECT}`,
        `TASK_ID = ${freshState.current_task_id}`,
        `FAILURE_CLASS = ${failureClass}`,
        `INFRA_RETRY_COUNT = ${nextRetry} / ${MAX_INFRA_RETRIES}`,
        'RECOVERY_STATUS = RECOVERY_NOT_STARTED',
        'RUN_ID = UNKNOWN',
        'PRODUCTION_CHANGED = NO',
      ].join('\n'),
    );
    console.log('INFRA_RECOVERY=RECOVERY_NOT_STARTED');
    process.exit(1);
  }

  await commentIssue(
    [
      'AGENT_CONTROL_INFRA_RECOVERY_V2',
      `PROJECT = ${PROJECT}`,
      `TASK_ID = ${freshState.current_task_id}`,
      `FAILURE_CLASS = ${failureClass}`,
      `INFRA_RETRY_COUNT = ${nextRetry} / ${MAX_INFRA_RETRIES}`,
      'RECOVERY_STATUS = RECOVERY_DISPATCHED',
      'CONFIRMATION = EXACT_TASK_HEAD_VALIDATOR_LOG_AND_NO_COMPETING_RUNS',
      `RUN_ID = ${dispatched.id}`,
      `RUN_URL = ${dispatched.html_url}`,
      'PRODUCTION_CHANGED = NO',
    ].join('\n'),
  );
  console.log(`INFRA_RECOVERY_RUN_ID=${dispatched.id}`);
  console.log('INFRA_RECOVERY=RECOVERY_DISPATCHED');
}

main().catch(error => fail(error instanceof Error ? error.message : 'unknown recovery error'));
