export const INFRA_FAILURES = new Set([
  'AUTH_FAILURE',
  'PROVIDER_401',
  'KEYCHAIN_FAILURE',
  'NETWORK_FAILURE',
  'CHECKOUT_FAILURE',
  'RUNNER_OFFLINE',
  'DEPENDENCY_FAILURE',
  'CODEX_CRASH',
  'UNKNOWN_INFRA_FAILURE',
]);

export function classifyFailureText(text) {
  const value = String(text || '');
  // GitHub logs and Codex stderr often contain generated source patches with
  // test strings such as "HTTP 401 invalid api key". Only actual error or HTTP
  // diagnostic lines can prove a provider/Keychain authentication failure.
  const diagnosticLines = value.split(/\r?\n/)
    .map(line => line.replace(/^\d{4}-\d\d-\d\dT[^\s]+Z\s+/, ''))
    .filter(line => /^\s*(error:|error sending|stream error:|api error:|request failed:|failed to get response|HTTP\s+401|Failed to resolve external auth|\/usr\/bin\/security\s+keychain|WARNING:)/i.test(line));
  const providerFailure = /(^|[^0-9])401([^0-9]|$)|unauthori[sz]ed|invalid (api )?key|authentication failed/i;
  if (diagnosticLines.some(line => providerFailure.test(line))) return 'PROVIDER_401';
  if (diagnosticLines.some(line => /\/usr\/bin\/security|Failed to resolve external auth|keychain|external auth/i.test(line))) return 'KEYCHAIN_FAILURE';
  if (/429|Too Many Requests|Could not resolve host|connection reset|network is unreachable|timed? out|TLS|SSL/i.test(value)) return 'NETWORK_FAILURE';
  if (/checkout|git fetch|ls-remote/i.test(value) && /fail|error|fatal/i.test(value)) return 'CHECKOUT_FAILURE';
  if (/pnpm install|npm install|dependency/i.test(value) && /fail|error/i.test(value)) return 'DEPENDENCY_FAILURE';
  if (/auth|credential|login/i.test(value)) return 'AUTH_FAILURE';
  return 'UNKNOWN_INFRA_FAILURE';
}

export function recoveryDecision({ failureClass, retryCount = 0, maxRetries = 3 }) {
  if (!INFRA_FAILURES.has(failureClass)) {
    return { action: 'NO_INFRA_RETRY', nextRetryCount: retryCount };
  }
  // A provider-declared invalid credential is not transient. Retrying the
  // same launchctl key only burns runner time and can flood the watchdog.
  if (failureClass === 'PROVIDER_401') {
    return { action: 'BLOCK', nextRetryCount: retryCount };
  }
  if (retryCount >= maxRetries) {
    return { action: 'BLOCK', nextRetryCount: retryCount };
  }
  return { action: 'RETRY', nextRetryCount: retryCount + 1 };
}

export function reconcileMergedState({ stateStatus, prMerged }) {
  if (prMerged && ['APPROVED_FOR_MERGE', 'READY_FOR_PM_REVIEW', 'WAITING_REVIEW'].includes(stateStatus)) {
    return 'MERGED';
  }
  return stateStatus;
}

export function shouldRedispatch({
  stateStatus,
  ownerActionRequired = false,
  hasActiveRun = false,
  latestTerminalAgeMinutes = Number.POSITIVE_INFINITY,
  lostTriggerMinutes = 10,
}) {
  if (ownerActionRequired || ['HUMAN_GATE', 'NEEDS_DECISION', 'BLOCKED', 'PASS', 'COMPLETE', 'MERGED'].includes(stateStatus)) return false;
  if (!['READY_FOR_CODEX', 'FIX_REQUIRED'].includes(stateStatus)) return false;
  if (hasActiveRun) return false;
  return latestTerminalAgeMinutes >= lostTriggerMinutes;
}

export function displayStatus({ stateStatus, ownerActionRequired = false, hasActiveRun = false, queued = false }) {
  if (ownerActionRequired || ['HUMAN_GATE', 'NEEDS_DECISION'].includes(stateStatus)) return 'WAITING_OWNER';
  if (stateStatus === 'BLOCKED') return 'BLOCKED';
  if (queued) return 'QUEUED';
  if (hasActiveRun || ['READY_FOR_CODEX', 'FIX_REQUIRED', 'READY_FOR_PM_REVIEW', 'WAITING_REVIEW', 'APPROVED_FOR_MERGE'].includes(stateStatus)) return 'RUNNING';
  if (['PASS', 'COMPLETE', 'MERGED'].includes(stateStatus)) return 'COMPLETE';
  return 'RUNNING';
}

/**
 * Pure fail-closed guard for the unattended watchdog. Returning a reason
 * forbids dispatch; it never grants permission to merge or mutate Production.
 * @param {{
 *   stateStatus: string,
 *   expectedRepository?: string,
 *   stateRepository?: string,
 *   stateProject?: string,
 *   expectedProject?: string,
 *   currentTaskId?: string,
 *   taskPrefix?: string,
 *   branchPrefix?: string,
 *   activePr?: number | null,
 *   activeBranch?: string | null,
 *   masterSha?: string,
 *   verifiedHead?: string,
 *   liveMasterSha?: string,
 *   matchingTaskPr?: boolean,
 *   fixPr?: {number?: number, state?: string, merged?: boolean, body?: string,
 *     base?: {ref?: string, repo?: {full_name?: string}},
 *     head?: {ref?: string, sha?: string, repo?: {full_name?: string}}} | null,
 *   infraRetryCount?: number,
 *   maxInfraRetries?: number,
 *   lastFailureClass?: string | null
 * }} input
 */
export function watchdogTaskBlocker({
  stateStatus,
  expectedRepository,
  stateRepository,
  stateProject,
  expectedProject,
  currentTaskId,
  taskPrefix,
  branchPrefix,
  activePr = null,
  activeBranch = null,
  masterSha,
  verifiedHead,
  liveMasterSha,
  matchingTaskPr = false,
  fixPr = null,
  infraRetryCount = 0,
  maxInfraRetries = 3,
  lastFailureClass = null,
}) {
  if (!['READY_FOR_CODEX', 'FIX_REQUIRED'].includes(stateStatus)) return null;
  // All identifiers are read from trusted registry/Issue and checked before
  // starting a costly or potentially duplicated self-hosted Codex run.
  if (expectedRepository !== 'lenchenalc-hongda/hongda-new-media-platform'
      || (stateRepository && stateRepository !== expectedRepository)
      || !expectedProject || stateProject !== expectedProject
      || !taskPrefix || !branchPrefix
      || !currentTaskId?.startsWith(taskPrefix)) return 'PROJECT_TASK_BINDING_MISMATCH';
  const taskSuffix = currentTaskId.slice(taskPrefix.length)
    .toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  if (!taskSuffix) return 'PROJECT_TASK_BINDING_MISMATCH';
  if (stateStatus === 'READY_FOR_CODEX') {
    if (activePr !== null || activeBranch !== null) return 'READY_HAS_ACTIVE_PR_OR_BRANCH';
    if (matchingTaskPr) return 'EXISTING_TASK_PR_NOT_RECONCILED';
    if (masterSha !== liveMasterSha || verifiedHead !== liveMasterSha) return 'STALE_READY_MASTER';
  }
  if (stateStatus === 'FIX_REQUIRED') {
    if (!Number.isSafeInteger(activePr) || activePr <= 0 || !activeBranch) return 'FIX_MISSING_ACTIVE_PR';
    if (!activeBranch.startsWith(branchPrefix + taskSuffix + '-'))
      return 'FIX_WRONG_PROJECT_BRANCH';
    if (!fixPr || fixPr.number !== activePr
        || fixPr.state !== 'open' || fixPr.merged === true ||
        fixPr.base?.ref !== 'master' || fixPr.head?.ref !== activeBranch ||
        fixPr.head?.sha !== verifiedHead
        || fixPr.head?.repo?.full_name !== expectedRepository
        || fixPr.base?.repo?.full_name !== expectedRepository)
      return 'FIX_PR_HEAD_MISMATCH';
    const prBody = typeof fixPr.body === 'string' ? fixPr.body.split(/\r?\n/) : [];
    if (!prBody.includes('PROJECT = ' + expectedProject)
        || !prBody.includes('TASK_ID = ' + currentTaskId)
        || !prBody.includes('BASE_MASTER_SHA = ' + masterSha))
      return 'FIX_PR_TASK_BINDING_MISMATCH';
  }
  if (INFRA_FAILURES.has(lastFailureClass) &&
      Number.isInteger(infraRetryCount) && infraRetryCount >= maxInfraRetries) {
    return 'INFRA_RETRY_BUDGET_EXHAUSTED';
  }
  return null;
}

/**
 * Parse only exact, validator-emitted key/value lines from a GitHub Actions
 * validate JOB log. An untrusted workflow run name or PR title is not proof.
 */
export function parseProjectValidationProof(logText) {
  if (typeof logText !== 'string' || logText.length > 1024 * 1024) return null;
  const values = new Map();
  const required = new Set([
    'result', 'reason', 'project', 'task_id', 'expected_head',
    'status', 'active_pr', 'active_branch',
  ]);
  for (const line of logText.split(/\r?\n/)) {
    const plain = line.replace(/^\d{4}-\d\d-\d\dT[^\s]+Z\s+/, '').trim();
    const m = /^([a-z_]+)=([A-Za-z0-9._/ -]{0,256})$/.exec(plain);
    if (!m || !required.has(m[1])) continue;
    // Multiple (even identical) validator proof markers are ambiguous.
    if (values.has(m[1])) return null;
    values.set(m[1], m[2]);
  }
  if ([...required].some(key => !values.has(key))) return null;
  return Object.fromEntries(values);
}

/**
 * Select a dispatch run only after its real GitHub validator job has
 * independently attested this exact project/task/PR/head. A race or missing
 * attestation returns PENDING/AMBIGUOUS, never an invented run ID.
 *
 * No claim of request-unique nonce is made: existing workflows do not echo
 * recovery_reason. We therefore also reject all competing candidate runs
 * rather than guessing which accepted dispatch created which ID.
 *
 * @param {{
 * runs: Array<{id?: number, event?: string, created_at?: string, head_sha?: string,
 *   repository?: {full_name?: string}}>,
 * evidenceByRunId: Record<string, string>,
 * dispatchedAtMs: number,
 * checkedAtMs: number,
 * dispatchRefSha: string,
 * expectedRepository: string,
 * expectedProject: string,
 * expectedTaskId: string,
 * expectedHead: string,
 * expectedStateStatus: string,
 * expectedActivePr?: number | null,
 * expectedActiveBranch?: string | null
 * }} input
 */
export function selectCorrelatedDispatchRun({
  runs,
  evidenceByRunId,
  dispatchedAtMs,
  checkedAtMs,
  dispatchRefSha,
  expectedRepository,
  expectedProject,
  expectedTaskId,
  expectedHead,
  expectedStateStatus,
  expectedActivePr = null,
  expectedActiveBranch = null,
}) {
  const pending = { status: 'PENDING', run: null };
  if (!Array.isArray(runs) || !evidenceByRunId ||
      !Number.isFinite(dispatchedAtMs) || !Number.isFinite(checkedAtMs) ||
      !/^[0-9a-f]{40}$/.test(String(dispatchRefSha)) ||
      !/^[0-9a-f]{40}$/.test(String(expectedHead))) return pending;
  const candidates = runs.filter(run => {
    const createdAt = Date.parse(run.created_at || '');
    return Number.isSafeInteger(run.id) && run.id > 0 &&
      run.event === 'workflow_dispatch' &&
      run.head_sha === dispatchRefSha &&
      (!run.repository?.full_name || run.repository.full_name === expectedRepository) &&
      Number.isFinite(createdAt) &&
      createdAt >= dispatchedAtMs - 2000 && createdAt <= checkedAtMs + 2000;
  });
  if (candidates.length > 1) return { status: 'AMBIGUOUS', run: null };
  if (candidates.length === 0) return pending;
  const run = candidates[0];
  const proof = parseProjectValidationProof(evidenceByRunId[String(run.id)]);
  if (!proof) return pending;
  if (proof.result !== 'READY' || proof.reason !== 'project task validated' ||
      proof.project !== expectedProject ||
      proof.task_id !== expectedTaskId ||
      proof.expected_head !== expectedHead ||
      proof.status !== expectedStateStatus ||
      proof.active_pr !== String(expectedActivePr ?? 'null') ||
      proof.active_branch !== String(expectedActiveBranch ?? '')) return pending;
  // A single early matching run is not sufficient. Allow the other dispatch
  // time to become visible before attesting against the complete candidate set.
  if (checkedAtMs - dispatchedAtMs < 15000) return pending;
  return { status: 'CONFIRMED', run };
}


/**
 * Parse and select one explicitly owner-authored next task after a verified
 * code-only merge. The watchdog may not invent business requirements or
 * broaden Production permissions. An owner pre-registers a complete
 * AGENT_CONTROL_PROJECT_TASK_V1 comment after the last task comment, pinned
 * to the live master SHA. No next task => WAITING, not invented progress.
 *
 * @param {Record<string, any>} input
 */
export function selectAuthorizedSuccessorTask({
  state, comments, project, config, registry, masterSha,
  trustedOwner = 'lenchenalc-hongda',
}) {
  const decision = (status, reason = status) => ({ status, reason, task: null });
  if (!state || state.status !== 'MERGED') return decision('NO_ACTION');
  if (state.owner_action_required === true) return decision('HOLD_OWNER');
  if (state.active_pr !== null || state.active_branch !== null) return decision('CONTROL_HAS_ACTIVE_PR');
  const permittedRuntime = [
    'RELEASE_VERIFIED_CODE_ONLY', 'AWAITING_AUTHORIZED_NEXT_TASK',
    'NEXT_TASK_VALIDATION_BLOCKED',
  ];
  if (!permittedRuntime.includes(state.runtime_status)) return decision('WAIT_RELEASE_VERIFICATION');
  const ci = state.post_merge_ci_status || state.postmerge_ci_status || '';
  const deployed = state.vercel_production_status || '';
  if (!String(ci).startsWith('PASS') || !String(deployed).startsWith('READY'))
    return decision('WAIT_RELEASE_VERIFICATION');
  if (!Number.isSafeInteger(state.task_comment_id) || state.task_comment_id <= 0)
    return decision('MISSING_PREVIOUS_TASK_PROVENANCE');
  if (!/^[a-f0-9]{40}$/.test(String(masterSha || '')) ||
      !config || !registry || registry.projects?.[project]?.control_issue !== config.control_issue ||
      state.project !== project || !config.task_prefix || !config.branch_prefix)
    return decision('PROJECT_REGISTRY_OR_MASTER_MISMATCH');

  const taskComments = (Array.isArray(comments) ? comments : [])
    .filter(c => Number.isSafeInteger(c?.id) &&
      c.id > state.task_comment_id &&
      c.user?.login === trustedOwner &&
      String(c.body || '').replaceAll('\r\n', '\n').startsWith('AGENT_CONTROL_PROJECT_TASK_V1\n'))
    .sort((a, b) => b.id - a.id);
  const candidateComments = taskComments.filter(c =>
    !String(c.body).split(/\r?\n/).includes('TASK_ID = ' + state.current_task_id));
  if (candidateComments.length === 0) return decision('AWAITING_AUTHORIZED_NEXT_TASK');
  // Multiple different successor comments require explicit reconciliation.
  // Never select the newest by guesswork while a prior task is still pending.
  if (candidateComments.length !== 1) return decision('AMBIGUOUS_NEXT_TASK_COMMENTS');

  const comment = candidateComments[0];
  const lines = String(comment.body).replaceAll('\r\n', '\n').trimEnd().split('\n');
  if (lines[0] !== 'AGENT_CONTROL_PROJECT_TASK_V1') return decision('INVALID_NEXT_TASK');
  const fields = new Map();
  for (const line of lines.slice(1)) {
    const match = /^([A-Z0-9_]+) = (.*)$/.exec(line);
    if (!match || fields.has(match[1])) return decision('INVALID_NEXT_TASK');
    fields.set(match[1], match[2]);
  }
  const required = [
    'PROJECT', 'TASK_ID', 'TASK_STATUS', 'BASE_MASTER_SHA',
    'EXPECTED_HEAD', 'FIX_ROUND', 'ALLOWED_PATHS_JSON', 'CHECKS',
    'OBJECTIVE_B64', 'SCOPE', 'PRODUCTION_CHANGED', 'AUTO_MERGE',
    'AUTO_PRODUCTION', 'AUTH_WIDENING', 'DESTRUCTIVE_SOT_CHANGE',
    'EXTERNAL_SEND',
  ];
  if (required.some(key => !fields.has(key))) return decision('INVALID_NEXT_TASK');
  const taskId = fields.get('TASK_ID');
  if (fields.get('PROJECT') !== project ||
      typeof taskId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(taskId) ||
      !taskId.startsWith(config.task_prefix) || taskId === state.current_task_id ||
      fields.get('TASK_STATUS') !== 'READY_FOR_CODEX' ||
      fields.get('FIX_ROUND') !== '0 / 3')
    return decision('NEXT_TASK_IDENTITY_MISMATCH');
  if (fields.get('BASE_MASTER_SHA') !== masterSha ||
      fields.get('EXPECTED_HEAD') !== masterSha)
    return decision('NEXT_TASK_BASE_STALE');

  // An owner task comment is a code-only scope claim, not authorization for
  // unreviewed Production access, widened auth or outbound communications.
  if (fields.get('SCOPE') !== 'NONPROD_CODE_ONLY' ||
      fields.get('PRODUCTION_CHANGED') !== 'NO' ||
      fields.get('AUTO_MERGE') !== 'false' ||
      fields.get('AUTO_PRODUCTION') !== 'false' ||
      fields.get('AUTH_WIDENING') !== 'NO' ||
      fields.get('DESTRUCTIVE_SOT_CHANGE') !== 'NO' ||
      fields.get('EXTERNAL_SEND') !== 'NO')
    return decision('NEXT_TASK_REQUIRES_SEPARATE_HUMAN_GATE');

  const encoded = fields.get('OBJECTIVE_B64') || '';
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    return decision('INVALID_NEXT_TASK_OBJECTIVE');
  const buffer = Buffer.from(encoded, 'base64');
  const objective = buffer.toString('utf8');
  if (!buffer.length || buffer.length > 12000 ||
      buffer.toString('base64') !== encoded ||
      !objective.trim() || objective.trim() !== objective)
    return decision('INVALID_NEXT_TASK_OBJECTIVE');

  // Reject potentially sensitive operations for a fully automatic successor.
  // A task mentioning them (even as a negation) requires a fresh human-reviewed
  // scope instead of inferring intent from loosely structured natural language.
  if (/\b(?:production|prod|live|ddl|sql|rls|database|storage|secret|env|auth|permission|migrat\w*|delete|drop|truncate|overwrite|whatsapp|meta|wechat|customer|supplier|publish|external|payment|financial|salary)\b/i.test(objective))
    return decision('NEXT_TASK_OBJECTIVE_REQUIRES_HUMAN_GATE');

  let paths;
  try { paths = JSON.parse(fields.get('ALLOWED_PATHS_JSON')); } catch {
    return decision('INVALID_NEXT_TASK_PATHS');
  }
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 30 ||
      new Set(paths).size !== paths.length)
    return decision('INVALID_NEXT_TASK_PATHS');
  const ownedRegexes = (config.owned_regexes || []).map(re => new RegExp(re));
  for (const path of paths) {
    if (typeof path !== 'string' || path.length < 1 || path.length > 240 ||
        path.includes('\\') || path.includes('\0') || path.startsWith('/') ||
        path.split('/').some(segment => !segment || segment === '.' || segment === '..'))
      return decision('INVALID_NEXT_TASK_PATHS');
    if ((registry.shared_exact_paths || []).includes(path) ||
        (registry.shared_prefixes || []).some(prefix => path.startsWith(prefix)) ||
        path.startsWith('supabase/migrations/'))
      return decision('SHARED_OR_DATABASE_PATH_REQUIRES_SEPARATE_GATE');
    if (!(config.owned_prefixes || []).some(prefix => path.startsWith(prefix)) &&
        !ownedRegexes.some(re => re.test(path)))
      return decision('NEXT_TASK_PATH_NOT_OWNED');
  }
  const checks = String(fields.get('CHECKS') || '').split(',');
  const mandatoryChecks = ['typecheck', 'build', 'secret-audit', 'smoke'];
  if (checks.length !== mandatoryChecks.length ||
      new Set(checks).size !== mandatoryChecks.length ||
      mandatoryChecks.some(check => !checks.includes(check)))
    return decision('INVALID_NEXT_TASK_CHECKS');

  return {
    status: 'READY', reason: 'TRUSTED_OWNER_EXACT_MASTER_SUCCESSOR',
    task: {
      taskId, commentId: comment.id, allowedPaths: paths,
      checks: mandatoryChecks, contractBody: String(comment.body),
    },
  };
}


/** Count lanes that consume the registry's bounded parallel-development budget.
 * A BLOCKED project with a still-open PR counts as occupied; a completed
 * MERGED/COMPLETE code slice does not. Invalid observations fail closed.
 * @param {Array<Record<string, any>>} states
 */
export function countActiveProjectLanes(states) {
  if (!Array.isArray(states) || states.some(s => !s || typeof s !== 'object'))
    return Number.POSITIVE_INFINITY;
  const active = new Set([
    'READY_FOR_CODEX', 'DISPATCHING', 'CODING', 'FIX_REQUIRED',
    'READY_FOR_PM_REVIEW', 'WAITING_REVIEW', 'PM_REVIEW', 'APPROVED_FOR_MERGE',
  ]);
  return states.filter(s =>
    active.has(s.status) ||
    (Number.isSafeInteger(s.active_pr) && s.active_pr > 0) ||
    (typeof s.active_branch === 'string' && s.active_branch.length > 0)
  ).length;
}


/**
 * Fail closed when a successor would overlap an active lane's file allowlist.
 * Unknown active ownership is unsafe rather than assuming no collision.
 */
export function successorPathOverlapBlocker(states, successorPaths) {
  if (!Array.isArray(states) || !Array.isArray(successorPaths) ||
      successorPaths.length === 0 || successorPaths.some(p => typeof p !== 'string'))
    return 'INVALID_CROSS_PROJECT_PATH_EVIDENCE';
  const active = new Set([
    'READY_FOR_CODEX', 'DISPATCHING', 'CODING', 'FIX_REQUIRED',
    'READY_FOR_PM_REVIEW', 'WAITING_REVIEW', 'PM_REVIEW', 'APPROVED_FOR_MERGE',
  ]);
  for (const state of states) {
    if (!state || typeof state !== 'object') return 'INVALID_CROSS_PROJECT_STATE';
    const busy = active.has(state.status) ||
      (Number.isSafeInteger(state.active_pr) && state.active_pr > 0) ||
      (typeof state.active_branch === 'string' && state.active_branch.length > 0);
    if (!busy) continue;
    if (!Array.isArray(state.allowed_paths) || state.allowed_paths.length === 0 ||
        state.allowed_paths.some(p => typeof p !== 'string'))
      return 'ACTIVE_LANE_OWNED_PATHS_UNVERIFIED';
    if (successorPaths.some(p => state.allowed_paths.some(q =>
      p === q || p.startsWith(q.endsWith('/') ? q : q + '/') ||
      q.startsWith(p.endsWith('/') ? p : p + '/'))))
      return 'ACTIVE_LANE_PATH_OVERLAP';
  }
  return null;
}


/**
 * Inspect an append-only, task-scoped GitHub issue-comment handoff claim.
 * Existing claims are recoverable after a crashed HTTP response or state PATCH.
 * This is NOT a compare-and-swap on the Issue body. The serialized watchdog
 * still has to re-read state and fail closed on concurrent control changes.
 */
export function selectSuccessorCommentClaim({
  comments, project, taskId, taskCommentId, masterSha, contractSha256,
  trustedBot = 'github-actions[bot]',
}) {
  const invalid = reason => ({ status:'CONFLICT', reason, claim:null });
  if (!Array.isArray(comments) ||
      !/^[a-z][a-z0-9-]+$/.test(String(project)) ||
      !/^[A-Za-z0-9._-]+$/.test(String(taskId)) ||
      !Number.isSafeInteger(taskCommentId) || taskCommentId < 1 ||
      !/^[a-f0-9]{40}$/.test(String(masterSha)) ||
      !/^[a-f0-9]{64}$/.test(String(contractSha256)))
    return invalid('INVALID_CLAIM_INPUT');
  const prefix = 'AGENT_CONTROL_NEXT_TASK_CLAIM_V1\n';
  const claims = comments.filter(c =>
    String(c?.body || '').replaceAll('\r\n','\n').startsWith(prefix) &&
    String(c.body).includes('TASK_ID = ' + taskId + '\n'));
  if (claims.length > 1) return invalid('DUPLICATE_HANDOFF_CLAIMS');
  if (claims.length === 0) return { status:'CREATE', reason:'NO_EXISTING_CLAIM', claim:null };
  const comment = claims[0];
  if (comment?.user?.login !== trustedBot || !Number.isSafeInteger(comment.id) ||
      comment.id <= taskCommentId) return invalid('UNTRUSTED_HANDOFF_CLAIM');
  const fields = new Map();
  const lines = String(comment.body).replaceAll('\r\n','\n').trimEnd().split('\n');
  for (const line of lines.slice(1)) {
    const match = /^([A-Z0-9_]+) = (.*)$/.exec(line);
    if (!match || fields.has(match[1])) return invalid('MALFORMED_HANDOFF_CLAIM');
    fields.set(match[1],match[2]);
  }
  const keys = ['PROJECT','TASK_ID','SOURCE_COMMENT_ID','MASTER_SHA','CONTRACT_SHA256','WATCHDOG_RUN_ID'];
  if (fields.size !== keys.length || keys.some(k => !fields.has(k)) ||
      fields.get('PROJECT') !== project ||
      fields.get('TASK_ID') !== taskId ||
      fields.get('SOURCE_COMMENT_ID') !== String(taskCommentId) ||
      fields.get('MASTER_SHA') !== masterSha ||
      fields.get('CONTRACT_SHA256') !== contractSha256 ||
      !/^[1-9][0-9]*$/.test(String(fields.get('WATCHDOG_RUN_ID'))))
    return invalid('HANDOFF_CLAIM_MISMATCH');
  return {
    status:'REUSE', reason:'EXISTING_TRUSTED_HANDOFF_CLAIM',
    claim:{
      commentId:comment.id,
      sourceCommentId:taskCommentId,
      masterSha,
      contractSha256,
      watchdogRunId:fields.get('WATCHDOG_RUN_ID'),
    },
  };
}
