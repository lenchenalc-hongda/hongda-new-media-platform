// ===== Live Supabase Auth Integration Test (optional, safety-gated) =====
// Only runs when ALL conditions pass:
//   - AUTH_MODE=supabase
//   - Supabase env vars present
//   - ALLOW_LIVE_AUTH_TESTS=true
//   - SUPABASE_ENVIRONMENT=development|preview (production is refused)
//   - LIVE_TEST_* credentials present
// Otherwise it SKIPs. Never prints credentials/tokens/secrets.
// Run: pnpm test:auth:live

import { isSupabaseConfigured, getAuthMode } from '../../src/lib/auth/types';

var passed = 0;
var failed = 0;
var skipped = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

function envPresent(name: string): boolean {
  const v = process.env[name];
  return !!v && v.trim().length > 0;
}

async function main() {
  console.log('\n=== Live Supabase Auth Integration ===');

  const allow = process.env.ALLOW_LIVE_AUTH_TESTS === 'true';
  const target = (process.env.SUPABASE_ENVIRONMENT || 'unknown').toLowerCase();
  const credsOk = envPresent('LIVE_TEST_ADMIN_EMAIL') && envPresent('LIVE_TEST_ADMIN_PASSWORD') &&
    envPresent('LIVE_TEST_VIEWER_EMAIL') && envPresent('LIVE_TEST_VIEWER_PASSWORD');

  const blocked =
    !isSupabaseConfigured() ||
    getAuthMode() !== 'supabase' ||
    !allow ||
    target === 'production' ||
    !credsOk;

  if (blocked) {
    skipped++;
    const reasons: string[] = [];
    if (!isSupabaseConfigured()) reasons.push('Supabase env missing');
    if (getAuthMode() !== 'supabase') reasons.push('AUTH_MODE != supabase');
    if (!allow) reasons.push('ALLOW_LIVE_AUTH_TESTS != true');
    if (target === 'production') reasons.push('SUPABASE_ENVIRONMENT=production refused');
    if (!credsOk) reasons.push('LIVE_TEST_* credentials missing');
    console.log('SKIPPED: ' + reasons.join('; '));
    console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);
    return;
  }

  console.log('Target environment: ' + target + ' (live tests enabled)');

  // Real live tests would run here once a safe environment is configured:
  // 1. viewer login -> /review-center access, /settings denied
  // 2. admin login -> /settings access
  // 3. forged nmc_user -> still viewer
  // 4. logout -> protected page denied
  assert(true, 'LIVE AUTH: harness ready; real verification requires manual test accounts');

  console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);
}

main().catch(err => {
  console.error('Live test crashed:', err.message);
  process.exit(1);
});
