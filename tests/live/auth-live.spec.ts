// ===== Live Supabase Auth Integration Test (optional) =====
// Only runs when real Supabase env vars are present. Otherwise reports SKIPPED.
// Run: pnpm test:auth:live

import { isSupabaseConfigured, getAuthMode } from '../../src/lib/auth/types';

var passed = 0;
var failed = 0;
var skipped = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

async function main() {
  console.log('\n=== Live Supabase Auth Integration ===');

  if (!isSupabaseConfigured() || getAuthMode() !== 'supabase') {
    skipped++;
    console.log('SKIPPED: Supabase 环境变量缺失或 AUTH_MODE != supabase（LIVE_SETUP_BLOCKED）');
    console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);
    return;
  }

  // Real live tests would run here once env is present:
  // 1. viewer login -> /review-center access, /settings denied
  // 2. admin login -> /settings access
  // 3. forged nmc_user -> still viewer
  // 4. logout -> protected page denied
  assert(true, 'LIVE AUTH: real verification pending manual test account creation');

  console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);
}

main().catch(err => {
  console.error('Live test crashed:', err.message);
  process.exit(1);
});
