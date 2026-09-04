// ===== Auth Mode Production Fail-Open Regression Tests =====
import { AuthError, resolveAuthMode } from '../../src/lib/auth/types';
import { getCurrentUserFromRequest } from '../../src/lib/auth/current-user';

var passed = 0;
var failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + msg);
  }
}

function configMode(authMode: string | undefined, nodeEnv: string | undefined) {
  try {
    return { mode: resolveAuthMode({ authMode, nodeEnv }), error: null };
  } catch (err) {
    return { mode: null, error: err };
  }
}

function isConfigError(err: unknown): boolean {
  return err instanceof AuthError && err.code === 'AUTH_CONFIG_MISSING';
}

console.log('=== Auth Mode Resolver Matrix ===');

var r = configMode('supabase', 'production');
assert(r.mode === 'supabase' && r.error === null, 'production + supabase -> supabase');

r = configMode(undefined, 'production');
assert(r.mode === null && isConfigError(r.error), 'production + missing -> config error');

r = configMode('mock', 'production');
assert(r.mode === null && isConfigError(r.error), 'production + mock -> config error');

r = configMode('suapbase', 'production');
assert(r.mode === null && isConfigError(r.error), 'production + invalid -> config error');

r = configMode('mock', 'development');
assert(r.mode === 'mock' && r.error === null, 'development + mock -> mock');

r = configMode('supabase', 'development');
assert(r.mode === 'supabase' && r.error === null, 'development + supabase -> supabase');

r = configMode(undefined, 'development');
assert(r.mode === 'mock' && r.error === null, 'development + missing -> mock fallback');

r = configMode('suapbase', 'development');
assert(r.mode === null && isConfigError(r.error), 'development + invalid -> config error');

console.log('\n=== Production Mock Cookie Negative Proof ===');

function makeRequest(cookieValue?: string) {
  return {
    cookies: {
      get: (name: string) => (name === 'nmc_user' && cookieValue ? { value: cookieValue } : undefined),
    },
  };
}

var attackerCookie = encodeURIComponent(JSON.stringify({
  id: 'u_admin',
  full_name: '管理员',
  email: '',
  role: 'admin',
  org_id: 'org_001',
}));

var previousNodeEnv = process.env.NODE_ENV;
var previousAuthMode = process.env.AUTH_MODE;

function setNodeEnv(value: string | undefined) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function restoreEnvironment() {
  setNodeEnv(previousNodeEnv);
  if (previousAuthMode === undefined) {
    delete process.env.AUTH_MODE;
  } else {
    process.env.AUTH_MODE = previousAuthMode;
  }
}

async function runProductionMode(mode: string | undefined) {
  setNodeEnv('production');
  if (mode === undefined) {
    delete process.env.AUTH_MODE;
  } else {
    process.env.AUTH_MODE = mode;
  }
  var rejected = false;
  try {
    await getCurrentUserFromRequest(makeRequest(attackerCookie) as any);
  } catch (err) {
    rejected = isConfigError(err);
  }
  return rejected;
}

async function main() {
  try {
    assert((await runProductionMode(undefined)) === true, 'production missing + nmc_user cookie -> config error, no mock user');
    assert((await runProductionMode('mock')) === true, 'production mock + nmc_user cookie -> config error, no mock user');
    assert((await runProductionMode('invalid')) === true, 'production invalid + nmc_user cookie -> config error, no mock user');
  } finally {
    restoreEnvironment();
  }

  console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  restoreEnvironment();
  console.error('auth-mode-config test crashed:', err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
