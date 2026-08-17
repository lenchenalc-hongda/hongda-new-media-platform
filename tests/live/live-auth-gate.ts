// ===== Live Auth Test Safety Gate (pure, unit-testable) =====
// The live suite may only run against an explicitly allowed environment.

export interface LiveAuthGateEnv {
  authMode?: string;
  supabaseUrl?: string;
  anonKey?: string;
  serviceRoleKey?: string;
  allowLiveAuthTests?: string;
  supabaseEnvironment?: string;
  adminEmail?: string;
  adminPassword?: string;
  viewerEmail?: string;
  viewerPassword?: string;
}

export type LiveAuthGateResult =
  | { allowed: true }
  | { allowed: false; reasons: string[] };

function present(value?: string): boolean {
  return !!value && value.trim().length > 0;
}

export function evaluateLiveAuthGate(env: LiveAuthGateEnv): LiveAuthGateResult {
  const reasons: string[] = [];

  if (env.authMode !== 'supabase') reasons.push('AUTH_MODE != supabase');
  if (!present(env.supabaseUrl)) reasons.push('NEXT_PUBLIC_SUPABASE_URL missing');
  if (!present(env.anonKey)) reasons.push('NEXT_PUBLIC_SUPABASE_ANON_KEY missing');
  if (!present(env.serviceRoleKey)) reasons.push('SUPABASE_SERVICE_ROLE_KEY missing');
  if (env.allowLiveAuthTests !== 'true') reasons.push('ALLOW_LIVE_AUTH_TESTS != true');

  const target = (env.supabaseEnvironment || '').trim().toLowerCase();
  if (target === 'production') {
    reasons.push('SUPABASE_ENVIRONMENT=production refused');
  } else if (target !== 'development' && target !== 'preview') {
    reasons.push('SUPABASE_ENVIRONMENT must be development|preview');
  }

  if (!present(env.adminEmail) || !present(env.adminPassword)) {
    reasons.push('LIVE_TEST_ADMIN_* credentials missing');
  }
  if (!present(env.viewerEmail) || !present(env.viewerPassword)) {
    reasons.push('LIVE_TEST_VIEWER_* credentials missing');
  }

  return reasons.length === 0 ? { allowed: true } : { allowed: false, reasons };
}
