import { TextDecoder } from 'node:util';

export const READY_GENERAL_SENTINEL = 'AGENT_CONTROL_READY_TASK_V1';
export const READY_GENERAL_TRUSTED_AUTHOR = 'lenchenalc-hongda';
export const READY_GENERAL_WRITER_BOT = 'hongda-agent-control-writer[bot]';
export const READY_GENERAL_MAX_COMMENT_BYTES = 20_000;
export const READY_GENERAL_MAX_OBJECTIVE_BYTES = 4_000;
export const READY_GENERAL_MAX_FILES = 6;

export type ReadyGeneralCheck =
  | 'typecheck'
  | 'agent-control'
  | 'customer-project-center'
  | 'build'
  | 'secret-audit'
  | 'smoke';

export interface ReadyGeneralTask {
  taskId: string;
  baseMasterSha: string;
  objective: string;
  allowedPaths: string[];
  checks: ReadyGeneralCheck[];
  commentId: number;
}

export interface ReadyGeneralComment {
  id: number;
  authorLogin: string;
  body: string;
}

export interface ReadyGeneralPublishedPullRequest {
  number: number;
  state: 'open' | 'closed';
  draft: boolean;
  headBranch: string;
  headSha: string;
  baseBranch: string;
  authorLogin: string;
  body: string;
}

const taskIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const shaPattern = /^[0-9a-f]{40}$/;
const allowedChecks: ReadyGeneralCheck[] = [
  'typecheck', 'agent-control', 'customer-project-center',
  'build', 'secret-audit', 'smoke',
];
const fields = [
  'TASK_ID', 'TASK_STATUS', 'BASE_MASTER_SHA',
  'ALLOWED_PATHS_JSON', 'CHECKS', 'OBJECTIVE_B64',
] as const;

export function buildReadyGeneralBranchName(
  taskId: string,
  baseMasterSha: string,
): string | null {
  if (!taskIdPattern.test(taskId) || !shaPattern.test(baseMasterSha)) return null;
  return `codex/agent-control-ready-general-${taskId.toLowerCase()}-${baseMasterSha.slice(0, 12)}`;
}

function exactLineSet(body: string): Set<string> {
  return new Set(body.replace(/\r\n/g, '\n').split('\n'));
}

export function readyGeneralPublicationComplete(
  pullRequest: ReadyGeneralPublishedPullRequest,
  comments: ReadyGeneralComment[],
  expected: { taskId: string; baseMasterSha: string; taskCommentId: number },
): boolean {
  const branch = buildReadyGeneralBranchName(expected.taskId, expected.baseMasterSha);
  if (!branch
    || pullRequest.state !== 'open'
    || pullRequest.draft !== true
    || pullRequest.authorLogin !== READY_GENERAL_WRITER_BOT
    || pullRequest.baseBranch !== 'master'
    || pullRequest.headBranch !== branch
    || !shaPattern.test(pullRequest.headSha)) return false;

  const prLines = exactLineSet(pullRequest.body);
  const requiredPrLines = [
    `TASK_ID = ${expected.taskId}`,
    `BASE_MASTER_SHA = ${expected.baseMasterSha}`,
    `TASK_COMMENT_ID = ${expected.taskCommentId}`,
    `BRANCH = ${branch}`,
    `HEAD_SHA = ${pullRequest.headSha}`,
    'AUTO_MERGE = false',
    'AUTO_PRODUCTION = false',
  ];
  if (!requiredPrLines.every(line => prLines.has(line))) return false;

  return comments.some(comment => {
    if (comment.authorLogin !== READY_GENERAL_WRITER_BOT) return false;
    const lines = exactLineSet(comment.body);
    return [
      `TASK_ID = ${expected.taskId}`,
      'TASK_STATUS = PASS',
      `BASE_MASTER_SHA = ${expected.baseMasterSha}`,
      `BRANCH = ${branch}`,
      `HEAD_SHA = ${pullRequest.headSha}`,
      `PR_NUMBER = ${pullRequest.number}`,
      'READY_FOR_PM_REVIEW = YES',
      'AUTO_MERGE = false',
      'AUTO_PRODUCTION = false',
    ].every(line => lines.has(line));
  });
}

export function isAllowedReadyGeneralPath(filePath: string): boolean {
  if (filePath.length > 200 || filePath.includes('\\') || filePath.includes('\0')) return false;
  if (!/^[A-Za-z0-9_./-]+$/.test(filePath)) return false;
  if (filePath.split('/').some(part => !part || part.startsWith('.'))) return false;
  return (
    /^docs\/customer-project-center\/[A-Za-z0-9_./-]+\.md$/.test(filePath)
    || /^src\/lib\/customer-projects\/[A-Za-z0-9_./-]+\.ts$/.test(filePath)
    || /^tests\/unit\/customer-project-[A-Za-z0-9_./-]+\.test\.ts$/.test(filePath)
  );
}

function decodeCanonicalBase64(value: string): string | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return null;
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || bytes.length === 0
    || bytes.length > READY_GENERAL_MAX_OBJECTIVE_BYTES) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Pure validation only. No Issue text from this parser is ever executed as a shell command. */
export function parseReadyGeneralTask(
  comment: ReadyGeneralComment,
  expected: { taskId: string; baseMasterSha: string },
): ReadyGeneralTask | null {
  if (comment.authorLogin !== READY_GENERAL_TRUSTED_AUTHOR
    || !Number.isSafeInteger(comment.id) || comment.id <= 0
    || Buffer.byteLength(comment.body, 'utf8') > READY_GENERAL_MAX_COMMENT_BYTES
    || !taskIdPattern.test(expected.taskId)
    || !shaPattern.test(expected.baseMasterSha)) return null;

  const normalized = comment.body.replace(/\r\n/g, '\n');
  if (normalized.includes('\r')) return null;
  const lines = (normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized).split('\n');
  if (lines.length !== fields.length + 1 || lines[0] !== READY_GENERAL_SENTINEL) return null;
  const values = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const match = /^([A-Z0-9_]+) = (\S.*)$/.exec(line);
    if (!match || !fields.includes(match[1] as typeof fields[number])
      || values.has(match[1])) return null;
    values.set(match[1], match[2]);
  }
  if (fields.some(field => !values.has(field))) return null;
  if (values.get('TASK_ID') !== expected.taskId
    || values.get('TASK_STATUS') !== 'READY_FOR_CODEX'
    || values.get('BASE_MASTER_SHA') !== expected.baseMasterSha) return null;

  let allowedPaths: unknown;
  try {
    allowedPaths = JSON.parse(values.get('ALLOWED_PATHS_JSON')!);
  } catch {
    return null;
  }
  if (!Array.isArray(allowedPaths) || allowedPaths.length < 1
    || allowedPaths.length > READY_GENERAL_MAX_FILES
    || !allowedPaths.every(path => typeof path === 'string' && isAllowedReadyGeneralPath(path))
    || new Set(allowedPaths).size !== allowedPaths.length) return null;

  const checks = values.get('CHECKS')!.split(',') as ReadyGeneralCheck[];
  if (checks.length < 2 || checks.some(check => !allowedChecks.includes(check))
    || new Set(checks).size !== checks.length
    || !checks.includes('typecheck') || !checks.includes('agent-control')) return null;
  if (allowedPaths.some(path => path.startsWith('src/') || path.startsWith('tests/'))
    && (!checks.includes('customer-project-center') || !checks.includes('build')
      || !checks.includes('secret-audit'))) return null;

  const objective = decodeCanonicalBase64(values.get('OBJECTIVE_B64')!);
  if (!objective || objective.trim() !== objective || objective.length < 20
    || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(objective)) return null;

  return {
    taskId: expected.taskId,
    baseMasterSha: expected.baseMasterSha,
    objective,
    allowedPaths,
    checks,
    commentId: comment.id,
  };
}

export function selectTrustedReadyGeneralTask(
  comments: ReadyGeneralComment[],
  expected: { taskId: string; baseMasterSha: string },
): ReadyGeneralTask | null {
  const newest = [...comments]
    .filter(comment => comment.authorLogin === READY_GENERAL_TRUSTED_AUTHOR
      && comment.body.replace(/\r\n/g, '\n').split('\n')[0] === READY_GENERAL_SENTINEL)
    .sort((a, b) => b.id - a.id)[0];
  return newest ? parseReadyGeneralTask(newest, expected) : null;
}

export function readyGeneralChangedPathsAllowed(
  changedPaths: string[],
  allowedPaths: string[],
): boolean {
  if (changedPaths.length < 1 || changedPaths.length > READY_GENERAL_MAX_FILES
    || new Set(changedPaths).size !== changedPaths.length) return false;
  const allowed = new Set(allowedPaths);
  return changedPaths.every(path => allowed.has(path) && isAllowedReadyGeneralPath(path));
}
