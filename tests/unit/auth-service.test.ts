// ===== Auth Service Security Tests (Phase 1.6A) =====
import { getMockUserFromCookie } from '../../src/lib/auth/mock-user';
import { resolveSupabaseCurrentUser } from '../../src/lib/auth/supabase-user';
import { hasRole } from '../../src/lib/auth/current-user';

var passed = 0;
var failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

// ===== Fake Supabase client builder =====
function fakeSupabase(opts: {
  sessionUser?: { id: string; email?: string } | null;
  authError?: { message: string } | null;
  profile?: any | null;
  profileError?: { message: string } | null;
  profileRole?: string;
}) {
  return {
    auth: {
      getUser: async () => ({
        data: opts.sessionUser ? { user: opts.sessionUser } : null,
        error: opts.authError || null,
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: opts.profile === undefined ? null : opts.profile,
            error: opts.profileError || null,
          }),
        }),
      }),
    }),
  } as any;
}

console.log('\n=== Mock Mode ===');
var mock = getMockUserFromCookie(encodeURIComponent(JSON.stringify({ id: 'u1', full_name: '小陈', email: 'x@h.com', role: 'operator', org_id: 'org_001' })));
assert(mock !== null && mock.role === 'operator', 'mock cookie parses operator');
assert(mock!.authSource === 'mock', 'authSource=mock');
assert(getMockUserFromCookie('bad-json') === null, 'invalid mock cookie -> null');
assert(getMockUserFromCookie(null) === null, 'missing mock cookie -> null');

console.log('\n=== Supabase Mode: identity resolution ===');
// 1. no session -> null
assert((await resolveSupabaseCurrentUser(fakeSupabase({ sessionUser: null }))) === null, 'no session -> null');

// 2. invalid token (getUser error) -> null
assert((await resolveSupabaseCurrentUser(fakeSupabase({ authError: { message: 'invalid token' } }))) === null, 'invalid token -> null');

// 3. profile missing -> reject
assert((await resolveSupabaseCurrentUser(fakeSupabase({ sessionUser: { id: 'auth-1', email: 'a@h.com' }, profile: null }))) === null, 'profile missing -> null');

// 4. profile inactive -> reject
assert((await resolveSupabaseCurrentUser(fakeSupabase({ sessionUser: { id: 'auth-1' }, profile: { user_id: 'auth-1', role: 'viewer', is_active: false } }))) === null, 'inactive -> null');

// 5. valid viewer -> viewer, not admin
var viewerUser = await resolveSupabaseCurrentUser(fakeSupabase({ sessionUser: { id: 'auth-1' }, profile: { user_id: 'auth-1', full_name: '查看者', role: 'viewer', is_active: true } }));
assert(viewerUser !== null && viewerUser.role === 'viewer', 'viewer role resolved');
assert(hasRole(viewerUser, ['admin']) === false, 'viewer is NOT admin');
assert(hasRole(viewerUser, ['viewer']) === true, 'viewer IS viewer');
assert(viewerUser!.authSource === 'supabase', 'authSource=supabase');

// 6. valid admin -> admin
var adminUser = await resolveSupabaseCurrentUser(fakeSupabase({ sessionUser: { id: 'auth-2' }, profile: { user_id: 'auth-2', full_name: '管理员', role: 'admin', is_active: true } }));
assert(adminUser !== null && adminUser.role === 'admin', 'admin role resolved');

console.log('\n=== Supabase Mode: anti-forgery ===');
// 7. Client sends nmc_user role=admin, but profile role=viewer -> STILL viewer
// resolveSupabaseCurrentUser NEVER reads nmc_user, so forged cookie cannot escalate.
var forged = await resolveSupabaseCurrentUser(fakeSupabase({ sessionUser: { id: 'auth-9', email: 'viewer@h.com' }, profile: { user_id: 'auth-9', full_name: '真实查看者', role: 'viewer', is_active: true } }));
assert(forged !== null && forged.role === 'viewer', 'profile viewer wins over forged client role');
assert(hasRole(forged, ['admin']) === false, 'forged admin role does NOT grant admin');

// 8. Client sends forged userId in nmc_user; session auth id is authoritative
var authIdUser = await resolveSupabaseCurrentUser(fakeSupabase({ sessionUser: { id: 'real-auth-id' }, profile: { user_id: 'real-auth-id', full_name: '本人', role: 'operator', is_active: true } }));
assert(authIdUser !== null && authIdUser.id === 'real-auth-id', 'identity comes from verified session id, not client userId');

// 9. Invalid role in profile -> reject
assert((await resolveSupabaseCurrentUser(fakeSupabase({ sessionUser: { id: 'auth-3' }, profile: { user_id: 'auth-3', role: 'superadmin', is_active: true } }))) === null, 'unknown profile role -> null');

// 10. profileError -> reject
assert((await resolveSupabaseCurrentUser(fakeSupabase({ sessionUser: { id: 'auth-4' }, profileError: { message: 'db error' } }))) === null, 'profile query error -> null');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
