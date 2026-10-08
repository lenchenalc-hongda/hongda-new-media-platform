import fs from 'node:fs';

const REPOSITORY = 'lenchenalc-hongda/hongda-new-media-platform';
const TRUSTED_ACTOR = 'lenchenalc-hongda';
const TRIGGER = 'AGENT_CONTROL_TRIGGER_V1';
const TASK_SENTINEL = 'AGENT_CONTROL_PROJECT_TASK_V1';
const PROJECT = process.env.AGENT_CONTROL_PROJECT || 'global-lead-hub';
const CONTROL_ISSUE = Number(process.env.AGENT_CONTROL_ISSUE || '72');
const token = process.env.GITHUB_TOKEN;
const eventPath = process.env.GITHUB_EVENT_PATH;
const eventName = process.env.GITHUB_EVENT_NAME;
const registryPath = process.env.AGENT_CONTROL_REGISTRY || '.github/agent-control/project-registry.json';

function fail(message) {
  emit({ result: 'INVALID', reason: message });
  process.exit(1);
}

function outputValue(key, value) {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) return;
  fs.appendFileSync(path, `${key}=${String(value).replaceAll('\n', '%0A')}\n`);
}

function emit(values) {
  for (const [key, value] of Object.entries(values)) {
    console.log(`${key}=${value}`);
    outputValue(key, value);
  }
}

async function api(pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hongda-agent-control-project-lane',
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${pathname} returned ${response.status}`);
  return response.json();
}

async function comments(issueNumber) {
  const all = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await api(`/repos/${REPOSITORY}/issues/${issueNumber}/comments?per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
    if (page === 5) throw new Error('task history exceeds 500 comments');
  }
  return all;
}

function parseState(body) {
  const match = /<!-- AGENT_CONTROL_STATE_START -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- AGENT_CONTROL_STATE_END -->/.exec(body || '');
  if (!match) return null;
  return JSON.parse(match[1]);
}

function canonicalBase64(value) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  const buffer = Buffer.from(value, 'base64');
  if (!buffer.length || buffer.length > 12000 || buffer.toString('base64') !== value) return null;
  return buffer.toString('utf8');
}

function parseTask(body) {
  const normalized = String(body || '').replaceAll('\r\n', '\n');
  const lines = normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : normalized.split('\n');
  if (lines[0] !== TASK_SENTINEL) return null;
  const fields = new Map();
  for (const line of lines.slice(1)) {
    const match = /^([A-Z0-9_]+) = (.*)$/.exec(line);
    if (!match || fields.has(match[1])) return null;
    fields.set(match[1], match[2]);
  }
  const required = ['PROJECT', 'TASK_ID', 'TASK_STATUS', 'BASE_MASTER_SHA', 'EXPECTED_HEAD', 'FIX_ROUND', 'ALLOWED_PATHS_JSON', 'CHECKS', 'OBJECTIVE_B64'];
  if (required.some(key => !fields.has(key))) return null;
  if (fields.get('PROJECT') !== PROJECT) return null;
  const objective = canonicalBase64(fields.get('OBJECTIVE_B64'));
  if (!objective || objective.trim() !== objective) return null;
  let allowedPaths;
  try { allowedPaths = JSON.parse(fields.get('ALLOWED_PATHS_JSON')); } catch { return null; }
  if (!Array.isArray(allowedPaths) || allowedPaths.length < 1 || allowedPaths.length > 30 || !allowedPaths.every(value => typeof value === 'string')) return null;
  return {
    project: fields.get('PROJECT'),
    taskId: fields.get('TASK_ID'),
    status: fields.get('TASK_STATUS'),
    baseMasterSha: fields.get('BASE_MASTER_SHA'),
    expectedHead: fields.get('EXPECTED_HEAD'),
    fixRound: fields.get('FIX_ROUND'),
    allowedPaths,
    checks: fields.get('CHECKS'),
    objectiveB64: fields.get('OBJECTIVE_B64'),
  };
}

function safePath(path) {
  return path.length > 0 && path.length <= 240 && !path.includes('\\') && !path.includes('\0') && !path.startsWith('/') && !path.split('/').some(part => !part || part === '..' || part === '.');
}

function compilePolicy(projectConfig) {
  const regexes = (projectConfig.owned_regexes || []).map(value => new RegExp(value));
  return path => safePath(path) && ((projectConfig.owned_prefixes || []).some(prefix => path.startsWith(prefix)) || regexes.some(regex => regex.test(path)));
}

function sharedPath(path, registry) {
  return (registry.shared_exact_paths || []).includes(path) || (registry.shared_prefixes || []).some(prefix => path.startsWith(prefix));
}

function validateTaskAgainstState(task, state, masterSha, projectConfig, registry) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(task.taskId)) fail('invalid task id');
  if (!task.taskId.startsWith(projectConfig.task_prefix)) fail('task prefix does not match project');
  if (!/^[0-9a-f]{40}$/.test(task.baseMasterSha) || !/^[0-9a-f]{40}$/.test(task.expectedHead)) fail('invalid SHA');
  if (task.baseMasterSha !== state.master_sha) fail('task base SHA does not match project control state');
  if (task.status !== state.status || task.taskId !== state.current_task_id) fail('task identity/status does not match control state');
  const allow = compilePolicy(projectConfig);
  const seen = new Set();
  for (const path of task.allowedPaths) {
    if (seen.has(path)) fail(`duplicate allowed path: ${path}`);
    seen.add(path);
    if (sharedPath(path, registry)) fail(`shared path requires serialized shared lock: ${path}`);
    if (!allow(path)) fail(`path is outside project ownership: ${path}`);
  }
  const checks = task.checks.split(',').filter(Boolean);
  const allowedChecks = new Set(['typecheck', 'build', 'secret-audit', 'smoke']);
  if (!checks.length || checks.some(check => !allowedChecks.has(check)) || new Set(checks).size !== checks.length) fail('invalid checks');
  if (state.status === 'READY_FOR_CODEX') {
    if (task.baseMasterSha !== masterSha) fail('READY task/master SHA is stale');
    if (state.active_pr !== null || state.active_branch !== null || state.fix_round !== 0) fail('READY state must not have active PR/branch/fix round');
    if (task.expectedHead !== masterSha || task.fixRound !== '0 / 3') fail('READY task head/fix round mismatch');
  } else if (state.status === 'FIX_REQUIRED') {
    if (!Number.isInteger(state.active_pr) || state.active_pr <= 0 || !state.active_branch) fail('FIX state requires active PR and branch');
    if (task.expectedHead !== state.verified_head || task.fixRound !== `${state.fix_round} / ${state.max_fix_rounds}`) fail('FIX task head/fix round mismatch');
  } else {
    fail(`state ${state.status} is not executable by project lane`);
  }
  return checks;
}

async function main() {
  if (!token || !eventPath || !eventName) fail('GitHub runtime inputs are missing');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const projectConfig = registry.projects?.[PROJECT];
  if (!projectConfig || projectConfig.control_issue !== CONTROL_ISSUE) fail('project registry mismatch');

  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  if (eventName !== 'issue_comment') fail('project lane only accepts issue_comment trigger');
  if (event.repository?.full_name !== REPOSITORY || event.issue?.number !== CONTROL_ISSUE || event.issue?.pull_request) fail('untrusted repository/control issue');
  if (event.sender?.login !== TRUSTED_ACTOR || event.comment?.user?.login !== TRUSTED_ACTOR || String(event.comment?.body || '').trim() !== TRIGGER) fail('untrusted trigger');

  const issue = await api(`/repos/${REPOSITORY}/issues/${CONTROL_ISSUE}`);
  const state = parseState(issue.body);
  if (!state || state.project !== PROJECT || state.schema_version !== 1) fail('project control state missing/invalid');
  if (state.max_fix_rounds !== 3 || state.auto_merge !== false || state.auto_production !== false) fail('control safety flags invalid');

  const master = await api(`/repos/${REPOSITORY}/branches/master`);
  const masterSha = master.commit?.sha;
  if (!/^[0-9a-f]{40}$/.test(masterSha || '')) fail('live master SHA unavailable');

  if (state.status === 'READY_FOR_CODEX' && (state.master_sha !== masterSha || state.verified_head !== masterSha)) fail('READY control state is stale against master');

  if (state.status === 'FIX_REQUIRED') {
    const pr = await api(`/repos/${REPOSITORY}/pulls/${state.active_pr}`);
    if (pr.state !== 'open' || pr.base?.ref !== 'master' || pr.head?.ref !== state.active_branch || pr.head?.sha !== state.verified_head) fail('active PR does not match FIX state');
  }

  const sourceIssue = state.status === 'FIX_REQUIRED' ? state.active_pr : CONTROL_ISSUE;
  const allComments = await comments(sourceIssue);
  const candidates = allComments
    .filter(comment => comment.user?.login === TRUSTED_ACTOR && String(comment.body || '').replaceAll('\r\n', '\n').split('\n')[0] === TASK_SENTINEL)
    .sort((a, b) => b.id - a.id);
  const comment = candidates[0];
  if (!comment) fail('trusted project task comment not found');
  const task = parseTask(comment.body);
  if (!task) fail('project task comment invalid');
  const checks = validateTaskAgainstState(task, state, masterSha, projectConfig, registry);

  const branchSuffix = task.taskId.slice(projectConfig.task_prefix.length).toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const branch = state.status === 'FIX_REQUIRED'
    ? state.active_branch
    : `${projectConfig.branch_prefix}${branchSuffix}-${masterSha.slice(0, 12)}`;
  if (!branch.startsWith(projectConfig.branch_prefix)) fail('branch prefix does not match project');

  if (state.status === 'READY_FOR_CODEX') {
    const owner = REPOSITORY.split('/')[0];
    const prs = await api(`/repos/${REPOSITORY}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`);
    if (prs.length) {
      emit({ result: 'NOT_EXECUTABLE', reason: 'deterministic project task branch already has an open PR', project: PROJECT, control_issue: CONTROL_ISSUE });
      return;
    }
  }

  emit({
    result: 'READY',
    reason: 'project task validated',
    project: PROJECT,
    control_issue: CONTROL_ISSUE,
    task_id: task.taskId,
    status: state.status,
    base_master_sha: task.baseMasterSha,
    expected_head: task.expectedHead,
    active_pr: state.active_pr ?? 'null',
    active_branch: state.active_branch ?? '',
    branch,
    fix_round: state.fix_round,
    max_fix_rounds: state.max_fix_rounds,
    task_comment_id: comment.id,
    objective_b64: task.objectiveB64,
    allowed_paths_b64: Buffer.from(JSON.stringify(task.allowedPaths), 'utf8').toString('base64'),
    checks: checks.join(','),
  });
}

main().catch(error => fail(error instanceof Error ? error.message : 'unknown validator error'));
