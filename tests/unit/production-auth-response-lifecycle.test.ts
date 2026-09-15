// ===== Real Supabase middleware response lifecycle regression tests =====
import { register } from 'node:module';
import { NextRequest, NextResponse } from 'next/server';

const loader = `
export async function load(url, context, nextLoad) {
  if (url.includes('/node_modules/@supabase/ssr/')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: \`
export function createServerClient(_url, _key, options) {
  const behavior = globalThis.__authLifecycleBehavior;
  return {
    auth: {
      getUser: async () => {
        if (behavior.setCookie) {
          options.cookies.setAll([
            { name: 'sb-test-auth-token', value: 'rotated', options: { path: '/' } },
          ]);
        }
        return { data: { user: behavior.user }, error: null };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: behavior.profile,
            error: behavior.profileError || null,
          }),
        }),
      }),
    }),
  };
}
\`,
    };
  }
  return nextLoad(url, context);
}
`;

await register('data:text/javascript,' + encodeURIComponent(loader), import.meta.url);
process.env.AUTH_MODE = 'supabase';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.NEXT_PUBLIC_FEATURE_PROJECT_REVIEW_CENTER = 'true';

const { getSupabaseUserAndResponseFromRequest } = await import('../../src/lib/auth/supabase-user');
const { copyResponseCookies } = await import('../../src/lib/supabase/middleware');
const { middleware } = await import('../../src/middleware');

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

function behavior(overrides: Record<string, unknown> = {}) {
  (globalThis as any).__authLifecycleBehavior = {
    setCookie: true,
    user: { id: 'auth-admin', email: null },
    profile: { id: 'profile-1', user_id: 'auth-admin', role: 'admin', is_active: true, department: '管理层' },
    profileError: null,
    ...overrides,
  };
}

function request(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: 'sb-test-auth-token=old' },
  });
}

console.log('=== Production Auth Response Lifecycle ===');

behavior();
let req = request('/review-center/reviews');
let resolved = await getSupabaseUserAndResponseFromRequest(req);
assert(resolved.user?.role === 'admin', 'valid session/profile resolves admin');
assert(req.cookies.get('sb-test-auth-token')?.value === 'rotated', 'request cookie is updated during auth resolution');
assert((resolved.response.headers.get('set-cookie') || '').includes('sb-test-auth-token=rotated'), 'caller receives response created during getUser setAll');

const redirect = copyResponseCookies(resolved.response, NextResponse.redirect('http://localhost/login'));
assert((redirect.headers.get('set-cookie') || '').includes('sb-test-auth-token=rotated'), 'redirect retains latest response cookie');

behavior();
let middlewareResponse = await middleware(request('/review-center/reviews'));
assert(middlewareResponse.status === 200, 'valid admin protected route allowed');
assert((middlewareResponse.headers.get('set-cookie') || '').includes('sb-test-auth-token=rotated'), 'success response retains rotated cookie');

behavior({ user: null, profile: null });
middlewareResponse = await middleware(request('/workspace-home'));
assert(middlewareResponse.status === 307 && middlewareResponse.headers.get('location')?.includes('/login') === true, 'missing session redirects to login');
assert((middlewareResponse.headers.get('set-cookie') || '').includes('sb-test-auth-token=rotated'), 'login redirect retains rotated cookie mutation');

behavior({
  user: { id: 'auth-viewer', email: null },
  profile: { id: 'profile-2', user_id: 'auth-viewer', role: 'viewer', is_active: true, department: null },
});
middlewareResponse = await middleware(request('/review-center/settings'));
assert(middlewareResponse.status === 307 && middlewareResponse.headers.get('location')?.includes('/dashboard') === true, 'role guard redirects viewer');
assert((middlewareResponse.headers.get('set-cookie') || '').includes('sb-test-auth-token=rotated'), 'role redirect retains rotated cookie mutation');

behavior({ user: { id: 'auth-missing-profile', email: null }, profile: null });
middlewareResponse = await middleware(request('/workspace-home'));
assert(middlewareResponse.status === 307, 'missing profile denied');

behavior({
  user: { id: 'auth-inactive', email: null },
  profile: { id: 'profile-3', user_id: 'auth-inactive', role: 'admin', is_active: false, department: null },
});
middlewareResponse = await middleware(request('/workspace-home'));
assert(middlewareResponse.status === 307, 'inactive profile denied');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
