// ===== Live Supabase Auth Integration Test (Phase 1 - 6) =====
// Phase 1: real admin/viewer login + own profile read through authenticated RLS.
// Phase 2: real identity -> application permission matrix -> settings page access.
// Phase 3: forged nmc_user cookie + forged userId cannot override Supabase session.
// Phase 4: viewer cannot UPDATE own profile role/department/is_active/user_id.
// Phase 5A: inactive viewer profile must be rejected by the app CurrentUser resolver.
// Phase 5B: auth user with no profile must be rejected by the app CurrentUser resolver.
// Phase 6: logout invalidates session and forged nmc_user cannot restore identity.
// Only runs when ALL safety gate conditions pass.
// Run: pnpm test:auth:live

import { createRequire } from 'module';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { evaluateLiveAuthGate } from './live-auth-gate';
import { resolveSupabaseCurrentUser } from '../../src/lib/auth/supabase-user';
import { getCurrentUserFromRequest } from '../../src/lib/auth/current-user';
import { canAccessPage, getPageSlugFromRoute } from '../../src/lib/auth/roles';
import type { CurrentUser } from '../../src/lib/auth/types';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

var passed = 0;
var failed = 0;
var skipped = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

async function signOut(client: any) {
  try { await client.auth.signOut(); } catch {}
}

async function loginAndResolve(
  client: any,
  email: string,
  password: string,
): Promise<{ loginOk: boolean; profileOk: boolean; user: CurrentUser | null; reason?: string }> {
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error || !login.data?.user?.id) {
    return { loginOk: false, profileOk: false, user: null, reason: 'LOGIN_FAILED' };
  }

  const user = await resolveSupabaseCurrentUser(client as any);
  if (!user) {
    return { loginOk: true, profileOk: false, user: null, reason: 'PROFILE_RLS_READ_FAILED' };
  }

  return { loginOk: true, profileOk: true, user };
}

function pageAllowed(user: CurrentUser, path: string): boolean {
  const slug = getPageSlugFromRoute(path);
  if (!slug) return false;
  const authLike = {
    id: user.id,
    full_name: user.name,
    email: user.email ?? '',
    role: user.role,
    org_id: '',
    department: user.department,
  };
  return canAccessPage(authLike, slug);
}

function forgedAdminCookie(): string {
  return encodeURIComponent(JSON.stringify({
    id: 'forged-admin-user',
    full_name: 'Forged Admin',
    email: 'forged@example.test',
    role: 'admin',
    org_id: 'org_001',
    department: null,
  }));
}

function makeRequest(cookies: Record<string, string>): NextRequest {
  const header = Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; ');
  return new NextRequest('https://local.test', { headers: { cookie: header } });
}

async function loginServerSession(
  url: string,
  anonKey: string,
  email: string,
  password: string,
): Promise<Record<string, string>> {
  const store = new Map<string, string>();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => Array.from(store.entries()).map(([name, value]) => ({ name, value })),
      setAll: (items: { name: string; value: string; options?: Record<string, unknown> }[]) => {
        for (const item of items) {
          if (item.value) store.set(item.name, item.value);
          else store.delete(item.name);
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('SERVER_LOGIN_FAILED');
  return Object.fromEntries(store);
}

interface ProfileSnapshot {
  id: string;
  user_id: string;
  role: string;
  department: string | null;
  is_active: boolean;
}

async function readProfile(client: any, userId: string): Promise<ProfileSnapshot | null> {
  const { data, error } = await client
    .from('profiles')
    .select('id,user_id,role,department,is_active')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProfileSnapshot;
}

async function profileHeadCount(client: any, userId: string): Promise<number> {
  try {
    const res = await client
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    return typeof res.count === 'number' ? res.count : -1;
  } catch {
    return -1;
  }
}

function sameProfile(a: ProfileSnapshot, b: ProfileSnapshot): boolean {
  return a.id === b.id
    && a.user_id === b.user_id
    && a.role === b.role
    && a.department === b.department
    && a.is_active === b.is_active;
}

async function restoreProfile(client: any, snapshot: ProfileSnapshot): Promise<boolean> {
  const { error } = await client
    .from('profiles')
    .update({
      role: snapshot.role,
      department: snapshot.department,
      is_active: snapshot.is_active,
      user_id: snapshot.user_id,
    })
    .eq('id', snapshot.id);
  return !error;
}

function generateTempPassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const symbols = '!@#$%^&*()-_=+';
  const all = upper + lower + digits + symbols;
  const parts = [upper, lower, digits, symbols];
  const chars = parts.map(set => set[Math.floor(Math.random() * set.length)]);
  for (let i = 0; i < 28; i++) {
    chars.push(all[Math.floor(Math.random() * all.length)]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

async function main() {
  console.log('\n=== Live Supabase Auth Integration Phase 1 - 6 ===');

  const gate = evaluateLiveAuthGate({
    authMode: process.env.AUTH_MODE,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    allowLiveAuthTests: process.env.ALLOW_LIVE_AUTH_TESTS,
    supabaseEnvironment: process.env.SUPABASE_ENVIRONMENT,
    adminEmail: process.env.LIVE_TEST_ADMIN_EMAIL,
    adminPassword: process.env.LIVE_TEST_ADMIN_PASSWORD,
    viewerEmail: process.env.LIVE_TEST_VIEWER_EMAIL,
    viewerPassword: process.env.LIVE_TEST_VIEWER_PASSWORD,
  });

  if (!gate.allowed) {
    skipped++;
    console.log('SKIPPED: ' + gate.reasons.join('; '));
    console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);
    return;
  }

  console.log('Target environment: ' + (process.env.SUPABASE_ENVIRONMENT || '').toLowerCase() + ' (live tests enabled)');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const clientOptions = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };

  const adminClient = createClient(url, anonKey, clientOptions);
  const viewerClient = createClient(url, anonKey, clientOptions);

  const adminResult = await loginAndResolve(
    adminClient,
    process.env.LIVE_TEST_ADMIN_EMAIL!,
    process.env.LIVE_TEST_ADMIN_PASSWORD!,
  );
  await signOut(adminClient);

  if (!adminResult.loginOk) {
    failed++;
    console.error('FAIL: QA Admin ' + (adminResult.reason || 'LOGIN_FAILED'));
    console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);
    process.exitCode = 1;
    return;
  }
  if (!adminResult.profileOk || !adminResult.user) {
    failed++;
    console.error('FAIL: QA Admin ' + (adminResult.reason || 'PROFILE_RLS_READ_FAILED'));
    console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);
    process.exitCode = 1;
    return;
  }
  if (adminResult.user.role !== 'admin' || adminResult.user.active !== true) {
    failed++;
    console.error('FAIL: QA Admin role/active mismatch');
    console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);
    process.exitCode = 1;
    return;
  }

  const viewerResult = await loginAndResolve(
    viewerClient,
    process.env.LIVE_TEST_VIEWER_EMAIL!,
    process.env.LIVE_TEST_VIEWER_PASSWORD!,
  );
  await signOut(viewerClient);

  if (!viewerResult.loginOk) {
    failed++;
    console.error('FAIL: QA Viewer ' + (viewerResult.reason || 'LOGIN_FAILED'));
    console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);
    process.exitCode = 1;
    return;
  }
  if (!viewerResult.profileOk || !viewerResult.user) {
    failed++;
    console.error('FAIL: QA Viewer ' + (viewerResult.reason || 'PROFILE_RLS_READ_FAILED'));
    console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);
    process.exitCode = 1;
    return;
  }
  if (viewerResult.user.role !== 'viewer' || viewerResult.user.active !== true) {
    failed++;
    console.error('FAIL: QA Viewer role/active mismatch');
    console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);
    process.exitCode = 1;
    return;
  }

  const adminUser = adminResult.user;
  const viewerUser = viewerResult.user;

  const adminSettings = pageAllowed(adminUser, '/settings');
  const adminReviewSettings = pageAllowed(adminUser, '/review-center/settings');
  const viewerSettingsDenied = !pageAllowed(viewerUser, '/settings');
  const viewerReviewSettingsDenied = !pageAllowed(viewerUser, '/review-center/settings');

  assert(adminResult.user.role === 'admin', 'QA Admin role=admin');
  assert(adminResult.user.active === true, 'QA Admin is_active=true');
  assert(viewerResult.user.role === 'viewer', 'QA Viewer role=viewer');
  assert(viewerResult.user.active === true, 'QA Viewer is_active=true');
  assert(adminSettings, 'QA Admin /settings ALLOW');
  assert(adminReviewSettings, 'QA Admin /review-center/settings ALLOW');
  assert(viewerSettingsDenied, 'QA Viewer /settings DENY');
  assert(viewerReviewSettingsDenied, 'QA Viewer /review-center/settings DENY');

  console.log('ADMIN_SETTINGS=' + (adminSettings ? 'PASS' : 'FAIL'));
  console.log('ADMIN_REVIEW_SETTINGS=' + (adminReviewSettings ? 'PASS' : 'FAIL'));
  console.log('VIEWER_SETTINGS_DENIED=' + (viewerSettingsDenied ? 'PASS' : 'FAIL'));
  console.log('VIEWER_REVIEW_SETTINGS_DENIED=' + (viewerReviewSettingsDenied ? 'PASS' : 'FAIL'));

  const forged = forgedAdminCookie();
  const noSessionUser = await getCurrentUserFromRequest(makeRequest({ nmc_user: forged }));
  const forgedCookieBlocked = noSessionUser === null;

  let forgedWithSessionStillViewer = false;
  let forgedWithSessionResult: CurrentUser | null | undefined;
  try {
    const viewerCookies = await loginServerSession(
      url,
      anonKey,
      process.env.LIVE_TEST_VIEWER_EMAIL!,
      process.env.LIVE_TEST_VIEWER_PASSWORD!,
    );
    forgedWithSessionResult = await getCurrentUserFromRequest(makeRequest({
      ...viewerCookies,
      nmc_user: forged,
    }));
    forgedWithSessionStillViewer = !!forgedWithSessionResult
      && forgedWithSessionResult.authSource === 'supabase'
      && forgedWithSessionResult.role === 'viewer'
      && forgedWithSessionResult.id !== 'forged-admin-user';
  } catch {}

  assert(forgedCookieBlocked, 'forged nmc_user admin without session -> null');
  assert(forgedWithSessionStillViewer, 'viewer session + forged admin cookie -> still viewer');

  console.log('FORGED_COOKIE_WITHOUT_SESSION=' + (forgedCookieBlocked ? 'BLOCKED' : 'FAILED'));
  console.log('VIEWER_SESSION_PLUS_FORGED_ADMIN_COOKIE=' + (forgedWithSessionStillViewer ? 'STILL_VIEWER' : (forgedWithSessionResult ? 'FAILED' : 'NOT_DIRECTLY_TESTABLE')));

  const serviceClient = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const attackClient = createClient(url, anonKey, clientOptions);
  const attackLogin = await attackClient.auth.signInWithPassword({
    email: process.env.LIVE_TEST_VIEWER_EMAIL!,
    password: process.env.LIVE_TEST_VIEWER_PASSWORD!,
  });
  if (attackLogin.error || !attackLogin.data?.user?.id) {
    failed++;
    console.error('FAIL: Phase 4 viewer login failed');
    console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);
    process.exitCode = 1;
    return;
  }

  const attackUserId = attackLogin.data.user.id;
  const before = await readProfile(attackClient, attackUserId);
  const backup = await readProfile(serviceClient, attackUserId);
  if (!before || !backup) {
    failed++;
    console.error('FAIL: Phase 4 profile snapshot failed');
    await signOut(attackClient);
    console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);
    process.exitCode = 1;
    return;
  }

  const attempts: { key: string; update: Record<string, unknown> }[] = [
    { key: 'role', update: { role: 'admin' } },
    { key: 'department', update: { department: 'QA_FORBIDDEN_DEPARTMENT_CHANGE' } },
    { key: 'is_active', update: { is_active: false } },
    { key: 'user_id', update: { user_id: randomUUID() } },
  ];
  const results: Record<string, string> = {
    role: 'NOT_TESTED',
    department: 'NOT_TESTED',
    is_active: 'NOT_TESTED',
    user_id: 'NOT_TESTED',
  };
  let successfulWrites = 0;
  let emergencyRestore = false;
  let escalation = false;

  for (const attempt of attempts) {
    try {
      await attackClient.from('profiles').update(attempt.update).eq('user_id', attackUserId);
    } catch {}
    const after = await readProfile(attackClient, attackUserId);
    const blocked = !!after && sameProfile(before, after);
    results[attempt.key] = blocked ? 'BLOCKED' : 'SUCCEEDED';
    if (!blocked) {
      escalation = true;
      successfulWrites++;
      emergencyRestore = await restoreProfile(serviceClient, backup);
      break;
    }
  }

  let finalUnchanged = false;
  if (!escalation) {
    const final = await readProfile(serviceClient, attackUserId);
    finalUnchanged = !!final && sameProfile(before, final);
    if (!finalUnchanged) {
      escalation = true;
      successfulWrites++;
      emergencyRestore = await restoreProfile(serviceClient, backup);
    }
  } else {
    const final = await readProfile(serviceClient, attackUserId);
    finalUnchanged = !!final && sameProfile(before, final);
  }

  await signOut(attackClient);

  assert(results.role === 'BLOCKED', 'viewer role update blocked');
  assert(results.department === 'BLOCKED', 'viewer department update blocked');
  assert(results.is_active === 'BLOCKED', 'viewer is_active update blocked');
  assert(results.user_id === 'BLOCKED', 'viewer user_id update blocked');
  assert(!escalation, 'no unauthorized profile write');

  console.log('VIEWER_ROLE_CHANGE_TO_ADMIN=' + results.role);
  console.log('VIEWER_DEPARTMENT_CHANGE=' + results.department);
  console.log('VIEWER_IS_ACTIVE_CHANGE=' + results.is_active);
  console.log('VIEWER_USER_ID_CHANGE=' + results.user_id);
  console.log('PROFILE_STATE_UNCHANGED_AFTER_TESTS=' + (finalUnchanged ? 'YES' : 'NO'));
  console.log('PROFILE_PRIVILEGE_ESCALATION=' + (escalation ? 'VULNERABLE' : 'BLOCKED'));
  console.log('DATABASE_SUCCESSFUL_WRITES=' + successfulWrites);
  console.log('EMERGENCY_RESTORE_USED=' + (emergencyRestore ? 'YES' : 'NO'));

  const viewerId5 = viewerResult.user.id;
  let phase5InitialActive = false;
  let phase5InitialRoleOk = false;
  let phase5Snapshot: ProfileSnapshot | null = null;
  let inactiveWriteApplied = false;
  let authLoginWhileInactive = false;
  let appRejectedWhileInactive = false;
  let restoreExecuted = false;
  let restoreVerified = false;
  let restoreFailure = false;

  try {
    phase5Snapshot = await readProfile(serviceClient, viewerId5);
    phase5InitialActive = !!phase5Snapshot && phase5Snapshot.is_active === true;
    phase5InitialRoleOk = !!phase5Snapshot && phase5Snapshot.role === 'viewer';
    assert(phase5InitialActive, 'QA Viewer initial is_active=true');
    assert(phase5InitialRoleOk, 'QA Viewer initial role=viewer');
    if (!phase5Snapshot || !phase5InitialActive || !phase5InitialRoleOk) {
      throw new Error('PHASE5_SNAPSHOT_FAILED');
    }

    const inactiveWrite = await serviceClient
      .from('profiles')
      .update({ is_active: false })
      .eq('user_id', viewerId5);
    if (inactiveWrite.error) throw new Error('PHASE5_WRITE_FAILED');

    const inactiveCheck = await readProfile(serviceClient, viewerId5);
    inactiveWriteApplied = !!inactiveCheck && inactiveCheck.is_active === false;
    assert(inactiveWriteApplied, 'inactive write applied');
    if (!inactiveWriteApplied) throw new Error('PHASE5_WRITE_VERIFY_FAILED');

    const inactiveLoginClient = createClient(url, anonKey, clientOptions);
    const inactiveLogin = await inactiveLoginClient.auth.signInWithPassword({
      email: process.env.LIVE_TEST_VIEWER_EMAIL!,
      password: process.env.LIVE_TEST_VIEWER_PASSWORD!,
    });
    authLoginWhileInactive = !inactiveLogin.error && !!inactiveLogin.data?.user?.id;
    const currentUser = await resolveSupabaseCurrentUser(inactiveLoginClient as any);
    appRejectedWhileInactive = currentUser === null;
    assert(appRejectedWhileInactive, 'inactive profile rejected by CurrentUser resolver');
    await signOut(inactiveLoginClient);
  } catch (e) {
    failed++;
    console.error('FAIL: Phase 5A ' + String(e));
    process.exitCode = 1;
  } finally {
    restoreExecuted = true;
    const restore = await serviceClient
      .from('profiles')
      .update({ is_active: true })
      .eq('user_id', viewerId5);
    const restored = await readProfile(serviceClient, viewerId5);
    restoreVerified = !restore.error && !!restored && restored.role === 'viewer' && restored.is_active === true;
    restoreFailure = !restoreVerified;
    if (restoreFailure) {
      failed++;
      console.error('FAIL: Phase 5A restore failure');
      process.exitCode = 1;
    }
  }

  const phase5WriteCount = inactiveWriteApplied ? 1 : 0;
  const phase5Pass = phase5InitialActive
    && phase5InitialRoleOk
    && inactiveWriteApplied
    && appRejectedWhileInactive
    && restoreVerified;

  console.log('PHASE5A_INITIAL_ACTIVE=' + (phase5InitialActive ? 'YES' : 'NO'));
  console.log('PHASE5A_INACTIVE_WRITE_APPLIED=' + (inactiveWriteApplied ? 'YES' : 'NO'));
  console.log('PHASE5A_AUTH_LOGIN_WHILE_INACTIVE=' + (authLoginWhileInactive ? 'PASS' : 'FAIL'));
  console.log('PHASE5A_APPLICATION_CURRENT_USER=' + (appRejectedWhileInactive ? 'REJECTED' : 'ACCEPTED'));
  console.log('PHASE5A_RESTORE_EXECUTED=' + (restoreExecuted ? 'YES' : 'NO'));
  console.log('PHASE5A_RESTORE_VERIFIED=' + (restoreVerified ? 'YES' : 'NO'));
  console.log('PHASE5A_RESTORE_FAILURE=' + (restoreFailure ? 'YES' : 'NO'));
  console.log('PHASE5A_DATABASE_SUCCESSFUL_WRITES=' + phase5WriteCount);
  console.log('PHASE5A_PROTECTION=' + (phase5Pass ? 'PASS' : 'FAIL'));

  const tempEmail = 'live-auth-' + randomUUID() + '@qa.local';
  const tempPassword = generateTempPassword();
  const tempPasswordBytes = Buffer.byteLength(tempPassword, 'utf8');
  const passwordLimitOk = tempPasswordBytes >= 12 && tempPasswordBytes <= 72;
  let tempUserCreated = false;
  let tempUserId: string | null = null;
  let tempSignInOk = false;
  let tempGetUserIdMatch = false;
  let tempAppRejected = false;
  let tempLoginClient: any = null;
  let profileAfterCreate: 'MISSING' | 'PRESENT' = 'MISSING';
  let profileAfterResolve: 'MISSING' | 'PRESENT' = 'MISSING';
  let profileAfterCleanup: 'MISSING' | 'PRESENT' = 'MISSING';
  let cleanupExecuted = false;
  let tempUserRemoved = false;
  let cleanupFailure = false;

  try {
    if (!passwordLimitOk) throw new Error('PHASE5B_PASSWORD_LIMIT_FAILED');

    const created = await serviceClient.auth.admin.createUser({
      email: tempEmail,
      password: tempPassword,
      email_confirm: true,
    });
    if (created.error || !created.data?.user) throw new Error('PHASE5B_CREATE_FAILED');
    tempUserCreated = true;
    tempUserId = created.data.user.id;

    profileAfterCreate = (await profileHeadCount(serviceClient, tempUserId)) > 0 ? 'PRESENT' : 'MISSING';
    assert(profileAfterCreate === 'MISSING', 'temp auth user has no profile after create');

    tempLoginClient = createClient(url, anonKey, clientOptions);
    const login = await tempLoginClient.auth.signInWithPassword({
      email: tempEmail,
      password: tempPassword,
    });
    tempSignInOk = !login.error && !!login.data?.user?.id;
    assert(tempSignInOk, 'temp auth user login success');
    if (!tempSignInOk) throw new Error('PHASE5B_LOGIN_FAILED');

    const getUser = await tempLoginClient.auth.getUser();
    tempGetUserIdMatch = !getUser.error && !!getUser.data?.user && getUser.data.user.id === tempUserId;
    assert(tempGetUserIdMatch, 'temp auth user id matches session');

    const currentUser = await resolveSupabaseCurrentUser(tempLoginClient as any);
    tempAppRejected = currentUser === null;
    assert(tempAppRejected, 'missing profile rejected by CurrentUser resolver');

    profileAfterResolve = (await profileHeadCount(serviceClient, tempUserId)) > 0 ? 'PRESENT' : 'MISSING';
    assert(profileAfterResolve === 'MISSING', 'no profile auto-created');
  } catch (e) {
    failed++;
    console.error('FAIL: Phase 5B ' + String(e));
    process.exitCode = 1;
  } finally {
    cleanupExecuted = true;
    if (tempLoginClient) await signOut(tempLoginClient);
    if (tempUserId) {
      try {
        const del = await serviceClient.auth.admin.deleteUser(tempUserId);
        const verify = await serviceClient.auth.admin.getUserById(tempUserId);
        tempUserRemoved = !del.error && !verify.data?.user;
      } catch {}
      profileAfterCleanup = (await profileHeadCount(serviceClient, tempUserId)) > 0 ? 'PRESENT' : 'MISSING';
    } else {
      tempUserRemoved = true;
    }
    cleanupFailure = !tempUserRemoved;
    if (cleanupFailure) {
      failed++;
      console.error('FAIL: Phase 5B cleanup failure');
      process.exitCode = 1;
    }
  }

  const phase5bPass = tempUserCreated
    && tempSignInOk
    && tempGetUserIdMatch
    && tempAppRejected
    && profileAfterCreate === 'MISSING'
    && profileAfterResolve === 'MISSING'
    && profileAfterCleanup === 'MISSING'
    && tempUserRemoved;

  console.log('PHASE5B_TEMP_AUTH_CREATED=' + (tempUserCreated ? 'YES' : 'NO'));
  console.log('PHASE5B_PROFILE_AFTER_CREATE=' + profileAfterCreate);
  console.log('PHASE5B_TEMP_SIGN_IN=' + (tempSignInOk ? 'PASS' : 'FAIL'));
  console.log('PHASE5B_TEMP_GET_USER_ID_MATCH=' + (tempGetUserIdMatch ? 'YES' : 'NO'));
  console.log('PHASE5B_APPLICATION_CURRENT_USER=' + (tempAppRejected ? 'REJECTED' : 'ACCEPTED'));
  console.log('PHASE5B_PROFILE_AFTER_RESOLVE=' + profileAfterResolve);
  console.log('PHASE5B_CLEANUP_EXECUTED=' + (cleanupExecuted ? 'YES' : 'NO'));
  console.log('PHASE5B_TEMP_USER_REMOVED=' + (tempUserRemoved ? 'YES' : 'NO'));
  console.log('PHASE5B_PROFILE_AFTER_CLEANUP=' + profileAfterCleanup);
  console.log('PHASE5B_PROTECTION=' + (phase5bPass ? 'PASS' : 'FAIL'));

  const logoutClient = createClient(url, anonKey, clientOptions);
  const logoutLogin = await logoutClient.auth.signInWithPassword({
    email: process.env.LIVE_TEST_VIEWER_EMAIL!,
    password: process.env.LIVE_TEST_VIEWER_PASSWORD!,
  });
  const logoutLoginOk = !logoutLogin.error && !!logoutLogin.data?.user?.id;

  const beforeLogout = await logoutClient.auth.getUser();
  const logoutGetUserBeforeOk = !beforeLogout.error && !!beforeLogout.data?.user?.id;

  const signedOut = await logoutClient.auth.signOut();
  const logoutSignOutOk = !signedOut.error;

  const afterLogout = await logoutClient.auth.getUser();
  const afterLogoutHasUser = !!afterLogout.data?.user;
  const logoutGetUserAfterRejected = !afterLogoutHasUser;

  const sessionAfter = await logoutClient.auth.getSession();
  const logoutSessionMissing = !sessionAfter.error && !sessionAfter.data?.session;

  const appUserAfterLogout = await resolveSupabaseCurrentUser(logoutClient as any);
  const logoutAppRejected = appUserAfterLogout === null;

  const forgedAfterLogout = await getCurrentUserFromRequest(makeRequest({ nmc_user: forgedAdminCookie() }));
  const forgedAfterLogoutRejected = forgedAfterLogout === null;

  assert(logoutLoginOk, 'logout test login success');
  assert(logoutGetUserBeforeOk, 'logout test session valid before signOut');
  assert(logoutSignOutOk, 'signOut returned no error');
  assert(logoutGetUserAfterRejected, 'getUser rejected after signOut');
  assert(logoutSessionMissing, 'session missing after signOut');
  assert(logoutAppRejected, 'CurrentUser rejected after signOut');
  assert(forgedAfterLogoutRejected, 'forged nmc_user rejected after signOut');

  const logoutPass = logoutLoginOk
    && logoutGetUserBeforeOk
    && logoutSignOutOk
    && logoutGetUserAfterRejected
    && logoutSessionMissing
    && logoutAppRejected
    && forgedAfterLogoutRejected;

  console.log('PHASE6_LOGIN_BEFORE_LOGOUT=' + (logoutLoginOk ? 'PASS' : 'FAIL'));
  console.log('PHASE6_AUTH_GET_USER_BEFORE_LOGOUT=' + (logoutGetUserBeforeOk ? 'PASS' : 'FAIL'));
  console.log('PHASE6_SIGN_OUT=' + (logoutSignOutOk ? 'PASS' : 'FAIL'));
  console.log('PHASE6_AUTH_GET_USER_AFTER_LOGOUT=' + (afterLogoutHasUser ? 'STILL_AUTHENTICATED' : (afterLogout.error ? 'ERROR' : 'REJECTED')));
  console.log('PHASE6_SESSION_AFTER_LOGOUT=' + (logoutSessionMissing ? 'MISSING' : 'PRESENT'));
  console.log('PHASE6_APPLICATION_CURRENT_USER_AFTER_LOGOUT=' + (logoutAppRejected ? 'REJECTED' : 'ACCEPTED'));
  console.log('PHASE6_FORGED_NMC_USER_AFTER_LOGOUT=' + (forgedAfterLogoutRejected ? 'REJECTED' : 'ACCEPTED'));
  console.log('PHASE6_LOGOUT_PROTECTION=' + (logoutPass ? 'PASS' : 'FAIL'));
  console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);

  if (failed > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error('Live test crashed: ' + String(err?.message || err));
  process.exit(1);
});
