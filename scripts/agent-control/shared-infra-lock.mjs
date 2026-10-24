import fs from 'node:fs';

const REPOSITORY = 'lenchenalc-hongda/hongda-new-media-platform';

function requireCondition(condition, message) {
  if (!condition) throw new Error('SHARED_INFRA_LOCK_' + message);
}

function safePath(path) {
  return typeof path === 'string'
    && path.length > 0 && path.length <= 240
    && !path.includes('\\') && !path.includes('\0') && !path.startsWith('/')
    && !path.split('/').some(segment => !segment || segment === '.' || segment === '..');
}

export function verifySharedInfraLock({ registry, state, pr, changedPaths, eventHead, masterHead, controlIssue }) {
  const lane = registry?.shared_infrastructure_lane;
  requireCondition(registry?.shared_path_lock === true, 'REGISTRY_LOCK_DISABLED');
  requireCondition(lane && lane.project === 'agent-control-infrastructure', 'UNREGISTERED_LANE');
  requireCondition(lane.control_issue === controlIssue && controlIssue === 160, 'WRONG_CONTROL_ISSUE');
  requireCondition(lane.requires_serialized_shared_path_lock === true && lane.max_active_infrastructure_prs === 1, 'LOCK_POLICY_MISSING');
  requireCondition(lane.auto_merge === false && lane.auto_production === false, 'UNSAFE_REGISTRY_FLAGS');
  requireCondition(state?.schema_version === 1 && state.project === lane.project, 'STATE_MISSING');
  requireCondition(['REPAIR_IN_PROGRESS', 'PM_REVIEW'].includes(state.status), 'STATE_NOT_REVIEWABLE');
  requireCondition(typeof state.current_task_id === 'string' && state.current_task_id.startsWith(lane.task_prefix), 'TASK_MISMATCH');
  requireCondition(state.max_parallel_projects === registry.max_parallel_projects && state.max_parallel_projects === 2, 'PARALLEL_LIMIT_MISMATCH');
  requireCondition(state.auto_merge === false && state.auto_production === false && state.production_execution_authorized !== true, 'UNSAFE_STATE_FLAGS');
  requireCondition(state.active_pr === pr?.number && state.shared_path_lock_owner === pr.number, 'LOCK_NOT_HELD');
  requireCondition(typeof state.active_branch === 'string' && state.active_branch.startsWith(lane.branch_prefix), 'BRANCH_PREFIX_MISMATCH');
  requireCondition(pr.state === 'open' && pr.draft === true && pr.merged !== true, 'PR_NOT_SAFE_DRAFT');
  requireCondition(pr.head?.ref === state.active_branch && pr.head?.sha === state.verified_head && eventHead === state.verified_head, 'STALE_HEAD');
  requireCondition(pr.base?.ref === 'master' && pr.base?.sha === state.base_master_sha && masterHead === state.base_master_sha, 'STALE_MASTER');
  requireCondition(
    typeof pr.body === 'string'
      && pr.body.split(/\r?\n/).some(line => line === 'INFRA_CONTROL_ISSUE = ' + controlIssue)
      && pr.body.split(/\r?\n/).some(line => line === 'TASK_ID = ' + state.current_task_id),
    'PR_CONTROL_BINDING_MISMATCH',
  );
  const allowedPaths = state.allowed_paths;
  requireCondition(Array.isArray(allowedPaths) && allowedPaths.length > 0 && allowedPaths.length <= 30
    && new Set(allowedPaths).size === allowedPaths.length, 'INVALID_ALLOWLIST');
  const ownedPrefixes = lane.owned_shared_prefixes || [];
  const ownedExact = lane.owned_shared_exact_paths || [];
  const pathOwned = path => safePath(path) && (
    ownedExact.includes(path) || ownedPrefixes.some(prefix => path.startsWith(prefix))
  );
  requireCondition(allowedPaths.every(pathOwned), 'ALLOWLIST_NOT_SHARED_INFRA_OWNED');
  requireCondition(Array.isArray(changedPaths) && changedPaths.length > 0
    && new Set(changedPaths).size === changedPaths.length, 'INVALID_CHANGED_PATHS');
  requireCondition(changedPaths.every(path => allowedPaths.includes(path) && pathOwned(path)), 'CHANGED_PATH_OUT_OF_SCOPE');
  requireCondition(Array.isArray(state.queued_shared_prs)
    && !state.queued_shared_prs.includes(pr.number), 'QUEUED_LOCK_CONFLICT');
  return {
    status: 'PASS',
    task_id: state.current_task_id,
    pr_number: pr.number,
    head: state.verified_head,
    verified_files: changedPaths.length,
  };
}

async function githubGet(pathname, token) {
  const response = await fetch('https://api.github.com' + pathname, {
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hongda-shared-infra-verify',
    },
  });
  if (!response.ok) throw new Error('SHARED_INFRA_GITHUB_API_HTTP_' + response.status);
  return response.json();
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GH_INFRA_REPOSITORY;
  const prNumber = Number(process.env.GH_INFRA_PR_NUMBER);
  const eventHead = process.env.GH_INFRA_PR_HEAD;
  if (!token || repo !== REPOSITORY || !Number.isSafeInteger(prNumber) || !eventHead) {
    throw new Error('SHARED_INFRA_LOCK_BAD_GITHUB_CONTEXT');
  }
  const registry = JSON.parse(fs.readFileSync('.github/agent-control/project-registry.json', 'utf8'));
  const controlIssue = registry.shared_infrastructure_lane?.control_issue;
  requireCondition(controlIssue === 160, 'NO_REGISTERED_CONTROL');
  const prefix = '/repos/' + REPOSITORY;
  const [issue, pr, master] = await Promise.all([
    githubGet(prefix + '/issues/' + controlIssue, token),
    githubGet(prefix + '/pulls/' + prNumber, token),
    githubGet(prefix + '/branches/master', token),
  ]);
  const machine = /<!-- AGENT_CONTROL_INFRA_STATE_START -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- AGENT_CONTROL_INFRA_STATE_END -->/;
  const match = machine.exec(issue.body || '');
  requireCondition(match, 'MACHINE_BLOCK_MISSING');
  const state = JSON.parse(match[1]);
  const changedPaths = [];
  for (let page = 1; page <= 10; page++) {
    const files = await githubGet(prefix + '/pulls/' + prNumber + '/files?per_page=100&page=' + page, token);
    for (const f of files) {
      if (f.status === 'renamed') throw new Error('SHARED_INFRA_LOCK_RENAMES_FORBIDDEN');
      changedPaths.push(f.filename);
    }
    if (files.length < 100) break;
    requireCondition(page < 10, 'DIFF_TOO_LARGE');
  }
  const result = verifySharedInfraLock({
    registry, state, pr, changedPaths, eventHead,
    masterHead: master.commit?.sha,
    controlIssue,
  });
  process.stdout.write('SHARED_INFRA_LOCK=' + result.status + ' PR=' + prNumber + ' HEAD=' + result.head + ' FILES=' + result.verified_files + '\n');
}

if (process.argv[1]?.endsWith('/shared-infra-lock.mjs')) {
  main().catch(error => {
    process.stderr.write('SHARED_INFRA_LOCK=BLOCKED reason=' + (error instanceof Error ? error.message : 'UNKNOWN') + '\n');
    process.exitCode = 1;
  });
}
