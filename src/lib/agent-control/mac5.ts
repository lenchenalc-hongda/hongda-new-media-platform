export const MAC5_FIX_TASK_SENTINEL = 'AGENT_CONTROL_FIX_TASK_V1';
export const MAC5_TRUSTED_TASK_AUTHORS = ['lenchenalc-hongda'] as const;
export const MAC5_MAX_TASK_BODY_BYTES = 20_000;
export const MAC5_MAX_CHANGED_PATHS = 40;
export const MAC5_SAFE_TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export interface Mac5IssueComment {
  id: number;
  authorLogin: string;
  body: string;
  createdAt?: string | null;
}

export interface Mac5ExpectedFixTask {
  taskId: string;
  expectedHead: string;
  fixRound: number;
  maxFixRounds: number;
}

export interface Mac5FixTaskSelection {
  commentId: number;
  body: string;
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

function parseRound(body: string): { current: number; max: number } | null {
  const value = singleValue(body, 'FIX_ROUND');
  if (!value) return null;
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(value);
  if (!match) return null;
  return { current: Number(match[1]), max: Number(match[2]) };
}

export function isTrustedMac5FixTaskComment(
  comment: Mac5IssueComment,
  expected: Mac5ExpectedFixTask,
): boolean {
  if (!MAC5_SAFE_TASK_ID.test(expected.taskId)) {
    return false;
  }

  if (!MAC5_TRUSTED_TASK_AUTHORS.includes(
    comment.authorLogin as (typeof MAC5_TRUSTED_TASK_AUTHORS)[number],
  )) {
    return false;
  }

  if (Buffer.byteLength(comment.body, 'utf8') > MAC5_MAX_TASK_BODY_BYTES) {
    return false;
  }

  if (!standaloneLine(comment.body, MAC5_FIX_TASK_SENTINEL)) {
    return false;
  }

  if (singleValue(comment.body, 'TASK_ID') !== expected.taskId) {
    return false;
  }
  if (singleValue(comment.body, 'TASK_STATUS') !== 'FIX_REQUIRED') {
    return false;
  }
  if (singleValue(comment.body, 'EXPECTED_HEAD') !== expected.expectedHead) {
    return false;
  }

  const round = parseRound(comment.body);
  return Boolean(
    round
    && round.current === expected.fixRound
    && round.max === expected.maxFixRounds
    && round.current >= 1
    && round.current <= round.max
    && round.max === 3,
  );
}

export function selectTrustedMac5FixTask(
  comments: Mac5IssueComment[],
  expected: Mac5ExpectedFixTask,
): Mac5FixTaskSelection | null {
  const matches = comments
    .filter(comment => isTrustedMac5FixTaskComment(comment, expected))
    .sort((a, b) => b.id - a.id);

  return matches.length > 0
    ? { commentId: matches[0].id, body: matches[0].body }
    : null;
}

const DENIED_EXACT_PATHS = new Set([
  'AGENTS.md',
  '.gitignore',
  '.npmrc',
  'package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  'tsconfig.json',
  'vercel.json',
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'next.config.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.ts',
  'postcss.config.js',
  'postcss.config.mjs',
  'tailwind.config.js',
  'tailwind.config.ts',
]);

const DENIED_PREFIXES = [
  '.github/',
  'docs/agent-control/',
  'scripts/',
  'src/lib/agent-control/',
  'supabase/',
];

export function isMac5ProtectedPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\')) return true;
  if (path === '..' || path.startsWith('../') || path.includes('/../')) return true;
  if (DENIED_EXACT_PATHS.has(path)) return true;
  if (path.startsWith('.env')) return true;
  if (path.toLowerCase().endsWith('.sql')) return true;
  if (path.startsWith('tests/unit/agent-control')) return true;
  return DENIED_PREFIXES.some(prefix => path.startsWith(prefix));
}

export interface Mac5PathPolicyResult {
  ok: boolean;
  uniquePaths: string[];
  deniedPaths: string[];
  reason: 'OK' | 'NO_CHANGES' | 'TOO_MANY_PATHS' | 'PROTECTED_PATH';
}

export function evaluateMac5ChangedPaths(paths: string[]): Mac5PathPolicyResult {
  const uniquePaths = [...new Set(paths)].sort();

  if (uniquePaths.length === 0) {
    return { ok: false, uniquePaths, deniedPaths: [], reason: 'NO_CHANGES' };
  }
  if (uniquePaths.length > MAC5_MAX_CHANGED_PATHS) {
    return {
      ok: false,
      uniquePaths,
      deniedPaths: [],
      reason: 'TOO_MANY_PATHS',
    };
  }

  const deniedPaths = uniquePaths.filter(isMac5ProtectedPath);
  if (deniedPaths.length > 0) {
    return {
      ok: false,
      uniquePaths,
      deniedPaths,
      reason: 'PROTECTED_PATH',
    };
  }

  return { ok: true, uniquePaths, deniedPaths: [], reason: 'OK' };
}
