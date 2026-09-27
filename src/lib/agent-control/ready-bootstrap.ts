export const READY_BOOTSTRAP_TASK_SENTINEL = 'AGENT_CONTROL_NEW_TASK_V1';
export const READY_BOOTSTRAP_ACCEPTANCE_TASK_ID =
  'CPC-AUTO-002-READY-BOOTSTRAP-ACCEPT-001';
export const READY_BOOTSTRAP_TRUSTED_TASK_AUTHORS = [
  'lenchenalc-hongda',
] as const;
export const READY_BOOTSTRAP_MAX_TASK_BODY_BYTES = 20_000;
export const READY_BOOTSTRAP_ACCEPTANCE_PATH =
  'docs/agent-control/acceptance/ready-bootstrap.md';
export const READY_BOOTSTRAP_SAFE_TASK_ID =
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export interface ReadyBootstrapIssueComment {
  id: number;
  authorLogin: string;
  body: string;
  createdAt?: string | null;
}

export interface ReadyBootstrapExpectedTask {
  taskId: string;
  baseMasterSha: string;
}

export interface ReadyBootstrapTaskSelection {
  commentId: number;
  body: string;
}

export interface ReadyBootstrapPathPolicyResult {
  ok: boolean;
  uniquePaths: string[];
  reason:
    | 'OK'
    | 'NO_CHANGES'
    | 'MULTIPLE_PATHS'
    | 'WRONG_PATH';
}

function standaloneLine(body: string, expected: string): boolean {
  return body.split(/\r?\n/).some(line => line.trim() === expected);
}

function singleValue(body: string, key: string): string | null {
  const prefix = key + ' = ';
  const values = body
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith(prefix))
    .map(line => line.slice(prefix.length).trim());
  return values.length === 1 ? values[0] : null;
}

export function isTrustedReadyBootstrapTaskComment(
  comment: ReadyBootstrapIssueComment,
  expected: ReadyBootstrapExpectedTask,
): boolean {
  if (!READY_BOOTSTRAP_SAFE_TASK_ID.test(expected.taskId)) {
    return false;
  }

  if (!READY_BOOTSTRAP_TRUSTED_TASK_AUTHORS.includes(
    comment.authorLogin as (typeof READY_BOOTSTRAP_TRUSTED_TASK_AUTHORS)[number],
  )) {
    return false;
  }

  if (Buffer.byteLength(comment.body, 'utf8') > READY_BOOTSTRAP_MAX_TASK_BODY_BYTES) {
    return false;
  }

  if (!standaloneLine(comment.body, READY_BOOTSTRAP_TASK_SENTINEL)) {
    return false;
  }

  return singleValue(comment.body, 'TASK_ID') === expected.taskId
    && singleValue(comment.body, 'TASK_STATUS') === 'READY_FOR_CODEX'
    && singleValue(comment.body, 'BASE_MASTER_SHA') === expected.baseMasterSha;
}

export function selectTrustedReadyBootstrapTask(
  comments: ReadyBootstrapIssueComment[],
  expected: ReadyBootstrapExpectedTask,
): ReadyBootstrapTaskSelection | null {
  const matches = comments
    .filter(comment => isTrustedReadyBootstrapTaskComment(comment, expected))
    .sort((a, b) => b.id - a.id);

  return matches.length > 0
    ? { commentId: matches[0].id, body: matches[0].body }
    : null;
}

export function buildReadyBootstrapBranchName(
  taskId: string,
  baseMasterSha: string,
): string {
  if (!READY_BOOTSTRAP_SAFE_TASK_ID.test(taskId)) {
    throw new Error('unsafe READY bootstrap task id');
  }
  if (!/^[0-9a-f]{40}$/.test(baseMasterSha)) {
    throw new Error('invalid READY bootstrap base SHA');
  }

  return `codex/agent-control-ready-bootstrap-${taskId.toLowerCase()}-${baseMasterSha.slice(0, 12)}`;
}

export function buildReadyBootstrapAcceptanceContent(
  taskId: string,
  baseMasterSha: string,
): string {
  if (!READY_BOOTSTRAP_SAFE_TASK_ID.test(taskId)) {
    throw new Error('unsafe READY bootstrap task id');
  }
  if (!/^[0-9a-f]{40}$/.test(baseMasterSha)) {
    throw new Error('invalid READY bootstrap base SHA');
  }

  return [
    '# Agent Control READY Bootstrap Acceptance',
    '',
    `- TASK_ID: ${taskId}`,
    `- BASE_MASTER_SHA: ${baseMasterSha}`,
    '- RESULT: READY_BOOTSTRAP_PASS',
    '',
  ].join('\n');
}

export function evaluateReadyBootstrapChangedPaths(
  paths: string[],
): ReadyBootstrapPathPolicyResult {
  const uniquePaths = [...new Set(paths)].sort();

  if (uniquePaths.length === 0) {
    return { ok: false, uniquePaths, reason: 'NO_CHANGES' };
  }
  if (uniquePaths.length !== 1) {
    return { ok: false, uniquePaths, reason: 'MULTIPLE_PATHS' };
  }
  if (uniquePaths[0] !== READY_BOOTSTRAP_ACCEPTANCE_PATH) {
    return { ok: false, uniquePaths, reason: 'WRONG_PATH' };
  }

  return { ok: true, uniquePaths, reason: 'OK' };
}
