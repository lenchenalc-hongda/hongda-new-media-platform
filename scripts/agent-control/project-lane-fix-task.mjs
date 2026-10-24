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
