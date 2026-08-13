// ===== Review Center Setup Doctor (read-only) =====
// Checks environment readiness for live Supabase auth verification.
// Never prints secret values. Never modifies anything.
// Run: pnpm review-center:doctor

function envPresent(name: string): boolean {
  const v = process.env[name];
  return !!v && v.trim().length > 0;
}

function main() {
  console.log('\n=== Review Center Setup Doctor ===\n');

  const authMode = process.env.AUTH_MODE || 'mock';
  const featureFlag = envPresent('NEXT_PUBLIC_FEATURE_PROJECT_REVIEW_CENTER');

  const supabaseUrl = envPresent('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = envPresent('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const serviceKey = envPresent('SUPABASE_SERVICE_ROLE_KEY');

  const liveAdminEmail = envPresent('LIVE_TEST_ADMIN_EMAIL');
  const liveAdminPwd = envPresent('LIVE_TEST_ADMIN_PASSWORD');
  const liveViewerEmail = envPresent('LIVE_TEST_VIEWER_EMAIL');
  const liveViewerPwd = envPresent('LIVE_TEST_VIEWER_PASSWORD');
  const allowLive = process.env.ALLOW_LIVE_AUTH_TESTS === 'true';
  const envTarget = process.env.SUPABASE_ENVIRONMENT || 'unknown';

  console.log(`AUTH_MODE: ${authMode}`);
  console.log(`Review Feature Flag: ${featureFlag ? 'enabled' : 'disabled'}`);
  console.log('');
  console.log(`NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? 'PRESENT' : 'MISSING'}`);
  console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY: ${anonKey ? 'PRESENT' : 'MISSING'}`);
  console.log(`SUPABASE_SERVICE_ROLE_KEY: ${serviceKey ? 'PRESENT' : 'MISSING'}`);
  console.log('');
  console.log(`SUPABASE_ENVIRONMENT: ${envTarget}`);
  console.log(`ALLOW_LIVE_AUTH_TESTS: ${allowLive ? 'true' : 'false'}`);
  console.log(`live test credentials: ${(liveAdminEmail && liveAdminPwd && liveViewerEmail && liveViewerPwd) ? 'PRESENT' : 'MISSING'}`);
  console.log('');

  const allSupabase = supabaseUrl && anonKey && serviceKey;
  const authOk = authMode === 'supabase' && allSupabase && featureFlag;
  const liveOk = authOk && allowLive && envTarget !== 'production' && liveAdminEmail && liveAdminPwd && liveViewerEmail && liveViewerPwd;

  console.log(`Supabase connection: ${allSupabase ? 'PRESENT (read-only check available)' : 'NOT CONFIGURED'}`);
  console.log(`profiles table: ${allSupabase ? 'PENDING (needs live query)' : 'NOT CHECKED'}`);
  console.log(`auth helpers: ${allSupabase ? 'PENDING (needs live query)' : 'NOT CHECKED'}`);
  console.log(`migration state: ${allSupabase ? 'ATTENTION (run migration status via Supabase CLI/Editor)' : 'NOT CHECKED'}`);
  console.log('');

  console.log(`Ready for live auth verification: ${liveOk ? 'YES' : 'NO'}`);
  console.log(`Overall status: ${authOk ? (liveOk ? 'READY' : 'NOT_READY') : 'NOT_READY'}`);
  console.log('');
  if (!authOk) {
    console.log('Reason: need AUTH_MODE=supabase + 3 Supabase vars + feature flag enabled.');
  }
  if (!liveOk && authOk) {
    console.log('Reason: need ALLOW_LIVE_AUTH_TESTS=true, SUPABASE_ENVIRONMENT=development/preview, and 4 LIVE_TEST_* credentials.');
  }
  console.log('');
}

main();
