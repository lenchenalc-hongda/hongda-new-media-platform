// ===== Live Auth Safety Gate Unit Tests =====
import { evaluateLiveAuthGate } from '../live/live-auth-gate';

var passed = 0;
var failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    authMode: 'supabase',
    supabaseUrl: 'dev-url',
    anonKey: 'anon-key',
    serviceRoleKey: 'service-key',
    allowLiveAuthTests: 'true',
    supabaseEnvironment: 'development',
    adminEmail: 'admin@example.test',
    adminPassword: 'admin-password',
    viewerEmail: 'viewer@example.test',
    viewerPassword: 'viewer-password',
    ...overrides,
  };
}

console.log('\n=== Live Auth Safety Gate ===');

assert(evaluateLiveAuthGate(baseEnv()).allowed === true, 'development + allow=true -> ALLOWED');
assert(evaluateLiveAuthGate(baseEnv({ supabaseEnvironment: 'preview' })).allowed === true, 'preview + allow=true -> ALLOWED');

assert(evaluateLiveAuthGate(baseEnv({ supabaseEnvironment: 'production' })).allowed === false, 'production -> BLOCKED');
assert(evaluateLiveAuthGate(baseEnv({ supabaseEnvironment: 'staging' })).allowed === false, 'staging -> BLOCKED');
assert(evaluateLiveAuthGate(baseEnv({ supabaseEnvironment: 'unknown' })).allowed === false, 'unknown -> BLOCKED');
assert(evaluateLiveAuthGate(baseEnv({ supabaseEnvironment: '' })).allowed === false, 'missing environment -> BLOCKED');
assert(evaluateLiveAuthGate(baseEnv({ allowLiveAuthTests: 'false' })).allowed === false, 'ALLOW_LIVE_AUTH_TESTS=false -> BLOCKED');

assert(evaluateLiveAuthGate(baseEnv({ authMode: 'mock' })).allowed === false, 'AUTH_MODE=mock -> BLOCKED');
assert(evaluateLiveAuthGate(baseEnv({ supabaseUrl: '' })).allowed === false, 'missing Supabase URL -> BLOCKED');
assert(evaluateLiveAuthGate(baseEnv({ anonKey: '' })).allowed === false, 'missing anon key -> BLOCKED');
assert(evaluateLiveAuthGate(baseEnv({ serviceRoleKey: '' })).allowed === false, 'missing service role key -> BLOCKED');
assert(evaluateLiveAuthGate(baseEnv({ adminEmail: '', adminPassword: '' })).allowed === false, 'missing admin credentials -> BLOCKED');
assert(evaluateLiveAuthGate(baseEnv({ viewerEmail: '', viewerPassword: '' })).allowed === false, 'missing viewer credentials -> BLOCKED');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
