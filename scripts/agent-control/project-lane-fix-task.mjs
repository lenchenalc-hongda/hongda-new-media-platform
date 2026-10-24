// Parse the owner-authored, bounded Agent Control repair instruction.
// Caller MUST independently verify GitHub comment author before using the result.
// A FIX task is strictly a subset of the original, verified READY task.
export const FIX_TASK_SENTINEL = 'AGENT_CONTROL_FIX_TASK_V1';

const REQUIRED_FIX_KEYS = Object.freeze([
  'PROJECT',
  'TASK_ID',
  'TASK_STATUS',
  'PR_NUMBER',
  'BRANCH',
  'EXPECTED_HEAD',
  'VERIFIED_HEAD',
  'FIX_ROUND',
  'ALLOWED_PATHS_JSON',
  'CHECKS',
]);
const ALLOWED_FIX_KEYS = new Set(REQUIRED_FIX_KEYS);
const SHA = /^[a-f0-9]{40}$/;

export function parseTrustedFixTask(body, originalTask, state) {
  if (
    typeof body !== 'string'
    || !originalTask
    || !state
    || state.status !== 'FIX_REQUIRED'
    || originalTask.status !== 'READY_FOR_CODEX'
    || originalTask.project !== state.project
    || originalTask.taskId !== state.current_task_id
    || originalTask.baseMasterSha !== state.master_sha
    || originalTask.expectedHead !== state.master_sha
    || originalTask.fixRound !== '0 / 3'
    || !Array.isArray(originalTask.allowedPaths)
    || !Number.isInteger(state.active_pr)
    || state.active_pr <= 0
    || typeof state.active_branch !== 'string'
    || !state.active_branch
    || !SHA.test(String(state.verified_head || ''))
    || !Number.isInteger(state.fix_round)
    || !Number.isInteger(state.max_fix_rounds)
    || state.fix_round < 1
    || state.fix_round >= state.max_fix_rounds
  ) return null;

  const normalized = body.replaceAll('\r\n', '\n');
  const firstBreak = normalized.indexOf('\n\n');
  if (firstBreak <= 0) return null;

  const header = normalized.slice(0, firstBreak).split('\n');
  if (header.shift() !== FIX_TASK_SENTINEL) return null;
  const values = new Map();
  for (const line of header) {
    const match = /^([A-Z0-9_]+) = (.*)$/.exec(line);
    if (!match || !ALLOWED_FIX_KEYS.has(match[1]) || values.has(match[1])) return null;
    values.set(match[1], match[2]);
  }
  if (values.size !== REQUIRED_FIX_KEYS.length
    || REQUIRED_FIX_KEYS.some(key => !values.has(key))) return null;

  const instructions = normalized.slice(firstBreak + 2).trim();
  if (!instructions || Buffer.byteLength(instructions, 'utf8') > 12000) return null;

  if (
    values.get('PROJECT') !== state.project
    || values.get('TASK_ID') !== state.current_task_id
    || values.get('TASK_STATUS') !== 'FIX_REQUIRED'
    || values.get('PR_NUMBER') !== String(state.active_pr)
    || values.get('BRANCH') !== state.active_branch
    || values.get('EXPECTED_HEAD') !== state.verified_head
    || values.get('VERIFIED_HEAD') !== state.verified_head
    || values.get('FIX_ROUND') !== state.fix_round + ' / ' + state.max_fix_rounds
    || values.get('CHECKS') !== originalTask.checks
  ) return null;

  let allowedPaths;
  try { allowedPaths = JSON.parse(values.get('ALLOWED_PATHS_JSON')); }
  catch { return null; }
  if (
    !Array.isArray(allowedPaths)
    || allowedPaths.length === 0
    || allowedPaths.length > originalTask.allowedPaths.length
    || !allowedPaths.every(path => typeof path === 'string' && originalTask.allowedPaths.includes(path))
    || new Set(allowedPaths).size !== allowedPaths.length
  ) return null;

  return {
    ...originalTask,
    status: 'FIX_REQUIRED',
    expectedHead: state.verified_head,
    fixRound: values.get('FIX_ROUND'),
    allowedPaths,
    objectiveB64: Buffer.from(instructions, 'utf8').toString('base64'),
  };
}


// Bind a FIX to the exact, trusted READY comment saved when the PR was created.
// A later same-task READY comment must never replace the original scope/checks.
export function selectBoundOriginalReadyTask(pr, trustedOriginalTasks, state) {
  if (
    !pr || typeof pr.body !== 'string'
    || !Array.isArray(trustedOriginalTasks)
    || !state || state.status !== 'FIX_REQUIRED'
    || pr.number !== state.active_pr
  ) return null;

  const keys = ['PROJECT', 'TASK_ID', 'BASE_MASTER_SHA', 'BRANCH', 'TASK_COMMENT_ID'];
  const fields = new Map();
  for (const line of pr.body.replaceAll('\r\n', '\n').split('\n')) {
    const match = /^([A-Z0-9_]+) = (.*)$/.exec(line);
    if (match && keys.includes(match[1])) {
      if (fields.has(match[1])) return null;
      fields.set(match[1], match[2]);
    } else if (keys.some(key => line === key || line.startsWith(key + ' ') || line.startsWith(key + '='))) {
      return null;
    }
  }
  if (
    fields.size !== keys.length
    || fields.get('PROJECT') !== state.project
    || fields.get('TASK_ID') !== state.current_task_id
    || fields.get('BASE_MASTER_SHA') !== state.master_sha
    || fields.get('BRANCH') !== state.active_branch
    || !/^[1-9][0-9]*$/.test(fields.get('TASK_COMMENT_ID') || '')
  ) return null;

  const originalCommentId = Number(fields.get('TASK_COMMENT_ID'));
  if (!Number.isSafeInteger(originalCommentId)) return null;
  const matching = trustedOriginalTasks.filter(entry => (
    entry?.comment?.id === originalCommentId
    && entry?.task?.status === 'READY_FOR_CODEX'
    && entry.task.project === state.project
    && entry.task.taskId === state.current_task_id
    && entry.task.baseMasterSha === state.master_sha
  ));
  if (matching.length !== 1) return null;
  const bound = matching[0];
  const prCreated = Date.parse(pr.created_at || '');
  const commentCreated = Date.parse(bound.comment.created_at || '');
  const commentUpdated = Date.parse(bound.comment.updated_at || '');
  if (
    !Number.isFinite(prCreated)
    || !Number.isFinite(commentCreated)
    || !Number.isFinite(commentUpdated)
    || commentCreated > prCreated
    || commentUpdated > prCreated
  ) return null;
  return bound.task;
}
