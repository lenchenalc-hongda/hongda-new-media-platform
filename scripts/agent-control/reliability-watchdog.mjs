import fs from 'node:fs';
import { displayStatus, shouldRedispatch, watchdogTaskBlocker } from './reliability-core.mjs';
const REPOSITORY = process.env.GITHUB_REPOSITORY || 'lenchenalc-hongda/hongda-new-media-platform';
const TOKEN = process.env.GITHUB_TOKEN || '';
const REGISTRY_PATH = process.env.AGENT_CONTROL_REGISTRY || '.github/agent-control/project-registry.json';
const LOST_TRIGGER_MINUTES = Number(process.env.LOST_TRIGGER_MINUTES || '10');
const RUNNER_STALL_MINUTES = Number(process.env.RUNNER_STALL_MINUTES || '30');

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
      'User-Agent': 'hongda-agent-control-watchdog-v2',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${pathname} returned ${response.status}: ${body.slice(0, 300)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function updateState(issue, state) {
  const body = replaceState(issue.body, state);
  await api(`/repos/${REPOSITORY}/issues/${issue.number}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function comment(issueNumber, body) {
  await api(`/repos/${REPOSITORY}/issues/${issueNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function workflowRuns(workflowFile) {
  const payload = await api(
    `/repos/${REPOSITORY}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?per_page=30`,
  );
  return payload?.workflow_runs || [];
}

function ageMinutes(timestamp) {
  const ms = Date.now() - Date.parse(timestamp || '');
  return Number.isFinite(ms) ? ms / 60000 : Number.POSITIVE_INFINITY;
}

async function blockWatchdog(project, issue, state, reason, runtimeStatus = 'CONTROL_RECONCILIATION_REQUIRED') {
  const changed = state.runtime_status !== runtimeStatus || state.watchdog_block_reason !== reason;
  if (changed) {
    state.runtime_status = runtimeStatus;
    state.watchdog_block_reason = reason;
    await updateState(issue, state);
    await comment(issue.number, [
      'AGENT_CONTROL_WATCHDOG_CONTROL_BLOCK_V2',
      'PROJECT = ' + project,
      'TASK_ID = ' + state.current_task_id,
      'RESULT = ' + runtimeStatus,
      'REASON = ' + reason,
      'AUTO_MERGE = false',
      'PRODUCTION_CHANGED = NO',
    ].join('\n'));
  }
  console.log('WATCHDOG_PROJECT=' + project + ' RESULT=' + runtimeStatus + ' REASON=' + reason);
}

async function findExistingTaskPr(config, state) {
  if (!String(state.current_task_id || '').startsWith(config.task_prefix)
      || !/^[0-9a-f]{40}$/.test(String(state.master_sha || ''))) return true;
  const suffix = state.current_task_id.slice(config.task_prefix.length).toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const branch = config.branch_prefix + suffix + '-' + state.master_sha.slice(0, 12);
  const owner = REPOSITORY.split('/')[0];
  const pulls = await api('/repos/' + REPOSITORY + '/pulls?state=open&head=' + encodeURIComponent(owner + ':' + branch));
  if (!Array.isArray(pulls)) throw new Error('WATCHDOG_EXISTING_PRS_UNAVAILABLE');
  return pulls.some(pr => pr.state === 'open' && pr.head?.ref === branch);
}

async function dispatch(project, issue, state, config, reason) {
  const expectedHead = state.status === 'FIX_REQUIRED' ? state.verified_head : state.master_sha;
  const master = await api('/repos/' + REPOSITORY + '/branches/master');
  const dispatchRefSha = master?.commit?.sha;
  if (!/^[0-9a-f]{40}$/.test(String(dispatchRefSha || ''))) throw new Error('WATCHDOG_MASTER_SHA_UNAVAILABLE');
  // workflow_dispatch uses ref: master even for FIX tasks anchored to a PR HEAD.
  // Compare the emitted run with the DISPATCH REF, never with the FIX task HEAD.
  if (state.status === 'READY_FOR_CODEX' && expectedHead !== dispatchRefSha) throw new Error('WATCHDOG_READY_MASTER_CHANGED');
  const dispatchedAt = Date.now();
  await api('/repos/' + REPOSITORY + '/actions/workflows/' + encodeURIComponent(config.workflow_file) + '/dispatches', {
    method: 'POST',
    body: JSON.stringify({
      ref: 'master',
      inputs: {
        recovery_task_id: String(state.current_task_id || ''),
        recovery_expected_head: String(expectedHead || ''),
        recovery_attempt: String(state.infra_retry_count || 0),
        recovery_reason: reason,
      },
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  let confirmed = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const runs = await workflowRuns(config.workflow_file);
    const matches = runs.filter(run => {
      const created = Date.parse(run.created_at || '');
      return run.event === 'workflow_dispatch' && run.head_sha === dispatchRefSha
        && Number.isFinite(created) && created >= dispatchedAt - 2000;
    });
    if (matches.length > 1) throw new Error('WATCHDOG_DISPATCH_AMBIGUOUS_RUN');
    if (matches.length === 1) { confirmed = matches[0]; break; }
  }
  if (!confirmed) throw new Error('WATCHDOG_DISPATCH_UNCONFIRMED_NO_RUN_ID');
  await comment(issue.number, [
    'AGENT_CONTROL_WATCHDOG_V2',
    'PROJECT = ' + project,
    'TASK_ID = ' + state.current_task_id,
    'ACTION = DISPATCH_CONFIRMED',
    'REASON = ' + reason,
    'RUN_ID = ' + confirmed.id,
    'RUN_URL = ' + confirmed.html_url,
    'PRODUCTION_CHANGED = NO',
  ].join('\n'));
  return confirmed;
}

async function reconcileMergedPr(project, issue, state) {
  if (!Number.isInteger(state.active_pr) || state.active_pr <= 0) return false;
  const pr = await api(`/repos/${REPOSITORY}/pulls/${state.active_pr}`);
  if (!pr.merged) return false;

  state.status = 'MERGED';
  state.runtime_status = 'COMPLETE';
  state.verified_head = pr.merge_commit_sha || state.verified_head;
  const master = await api(`/repos/${REPOSITORY}/branches/master`);
  state.master_sha = master?.commit?.sha || pr.merge_commit_sha || state.master_sha;
  state.active_pr = null;
  state.active_branch = null;
  state.infra_retry_count = 0;
  state.last_failure_class = null;
  state.last_failure_run_id = null;
  state.owner_action_required = false;
  await updateState(issue, state);
  await comment(
    issue.number,
    [
      'AGENT_CONTROL_RECONCILED_V2',
      `PROJECT = ${project}`,
      `TASK_ID = ${state.current_task_id}`,
      `MERGED_PR = ${pr.number}`,
      `MERGE_COMMIT = ${pr.merge_commit_sha}`,
      'RESULT = CONTROL_STATE_RECONCILED',
      'PRODUCTION_CHANGED = NO',
    ].join('\n'),
  );
  return true;
}

async function inspectProject(project, config) {
  const issue = await api(`/repos/${REPOSITORY}/issues/${config.control_issue}`);
  const state = parseState(issue.body);
  if (!state || state.project !== project) {
    console.log(`WATCHDOG_PROJECT=${project} RESULT=INVALID_CONTROL_STATE`);
    return;
  }

  // A live GitHub merge is authoritative even when an old owner gate remains
  // on the Issue. Reconcile an already-merged PR before waiting for approval.
  if (['APPROVED_FOR_MERGE', 'READY_FOR_PM_REVIEW', 'WAITING_REVIEW'].includes(state.status) && state.active_pr) {
    if (await reconcileMergedPr(project, issue, state)) {
      console.log(`WATCHDOG_PROJECT=${project} RESULT=RECONCILED_MERGED_PR`);
      return;
    }
  }

  if (['HUMAN_GATE', 'NEEDS_DECISION'].includes(state.status) || state.owner_action_required === true) {
    const derived = displayStatus({
      stateStatus: state.status,
      ownerActionRequired: state.owner_action_required === true,
    });
    if (state.runtime_status !== derived) {
      state.runtime_status = derived;
      await updateState(issue, state);
    }
    console.log(`WATCHDOG_PROJECT=${project} RESULT=${derived}`);
    return;
  }

  if (['PASS', 'COMPLETE', 'MERGED', 'BLOCKED'].includes(state.status)) {
    console.log(`WATCHDOG_PROJECT=${project} RESULT=${state.status}`);
    return;
  }

  if (!['READY_FOR_CODEX', 'FIX_REQUIRED'].includes(state.status)) {
    console.log(`WATCHDOG_PROJECT=${project} RESULT=NO_AUTOMATIC_ACTION STATUS=${state.status}`);
    return;
  }

  // Never re-execute a stale READY snapshot or an already-open task PR.
  // For FIX, demand live PR identity and exact HEAD; the CLI validator also
  // checks provenance and bounded task instructions before actual execution.
  const liveMaster = await api('/repos/' + REPOSITORY + '/branches/master');
  const liveMasterSha = liveMaster?.commit?.sha;
  let matchingTaskPr = false;
  let fixPr = null;
  if (state.status === 'READY_FOR_CODEX' && state.active_pr == null && state.active_branch == null) {
    matchingTaskPr = await findExistingTaskPr(config, state);
  }
  if (state.status === 'FIX_REQUIRED' && Number.isSafeInteger(state.active_pr) && state.active_pr > 0) {
    fixPr = await api('/repos/' + REPOSITORY + '/pulls/' + state.active_pr);
  }
  const blocker = watchdogTaskBlocker({
    stateStatus: state.status,
    activePr: state.active_pr,
    activeBranch: state.active_branch,
    masterSha: state.master_sha,
    verifiedHead: state.verified_head,
    liveMasterSha,
    matchingTaskPr,
    fixPr,
    infraRetryCount: state.infra_retry_count,
    lastFailureClass: state.last_failure_class,
  });
  if (blocker) {
    await blockWatchdog(project, issue, state, blocker);
    return;
  }

  const runs = await workflowRuns(config.workflow_file);
  const active = runs.find(run => ['queued', 'in_progress', 'waiting', 'pending'].includes(run.status));
  if (active) {
    const queued = ['queued', 'waiting', 'pending'].includes(active.status);
    state.runtime_status = ageMinutes(active.created_at) > RUNNER_STALL_MINUTES
      ? 'RUNNER_STALLED'
      : displayStatus({
        stateStatus: state.status,
        ownerActionRequired: false,
        hasActiveRun: !queued,
        queued,
      });
    await updateState(issue, state);
    console.log(`WATCHDOG_PROJECT=${project} RESULT=${state.runtime_status} RUN_ID=${active.id}`);
    return;
  }

  const latest = runs.find(run => run.conclusion !== 'skipped') || null;
  // A failed VALIDATE job is a deterministic control-plane rejection. It is
  // not a lost trigger or recoverable Mac transport issue: repeated dispatch
  // of the same unchanged state will only fail again.
  if (latest?.conclusion === 'failure') {
    const jobs = await api('/repos/' + REPOSITORY + '/actions/runs/' + latest.id + '/jobs?per_page=100');
    if ((jobs?.jobs || []).some(job => job.name === 'validate' && job.conclusion === 'failure')) {
      await blockWatchdog(project, issue, state, 'VALIDATION_JOB_FAILED_RUN_' + latest.id, 'CONTROL_VALIDATION_BLOCKED');
      return;
    }
  }
  if (latest?.conclusion === 'success') {
    await blockWatchdog(project, issue, state, 'COMPLETED_RUN_WITHOUT_CONTROL_HANDOFF_' + latest.id);
    return;
  }
  const terminalAge = latest ? ageMinutes(latest.updated_at || latest.created_at) : Number.POSITIVE_INFINITY;
  const redispatch = shouldRedispatch({
    stateStatus: state.status,
    ownerActionRequired: state.owner_action_required === true,
    hasActiveRun: false,
    latestTerminalAgeMinutes: terminalAge,
    lostTriggerMinutes: LOST_TRIGGER_MINUTES,
  });
  if (!redispatch) {
    console.log(`WATCHDOG_PROJECT=${project} RESULT=RECENT_TERMINAL_RUN RUN_ID=${latest?.id || 'none'}`);
    return;
  }

  state.runtime_status = 'DISPATCHING';
  await updateState(issue, state);
  const confirmed = await dispatch(project, issue, state, config, latest?.conclusion === 'failure' ? 'FAILED_RUN_WITHOUT_ACTIVE_RECOVERY' : 'LOST_TRIGGER');
  console.log('WATCHDOG_PROJECT=' + project + ' RESULT=DISPATCHED RUN_ID=' + confirmed.id);
}

async function main() {
  if (!TOKEN) throw new Error('GITHUB_TOKEN missing');
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  for (const [project, config] of Object.entries(registry.projects || {})) {
    if (!config.workflow_file) {
      console.log(`WATCHDOG_PROJECT=${project} RESULT=NO_WORKFLOW_MAPPING`);
      continue;
    }
    try {
      await inspectProject(project, config);
    } catch (error) {
      console.error(`WATCHDOG_PROJECT=${project} RESULT=ERROR MESSAGE=${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
