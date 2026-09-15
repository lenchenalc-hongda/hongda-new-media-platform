// ===== Production auth middleware cookie/session regression tests =====
import { register } from 'node:module';
import { NextRequest, NextResponse } from 'next/server';

const loader = `
export async function load(url, context, nextLoad) {
  if (url.endsWith('/src/lib/auth/current-user.ts')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: \`
export async function getCurrentUserAndResponseFromRequest() {
  return globalThis.__authHotfixResult;
}
export async function getCurrentUserFromRequest() {
  return (await globalThis.__authHotfixResult).user;
}
export async function requireUserFromRequest() {
  const result = await globalThis.__authHotfixResult;
  if (!result.user) throw new Error('unauthenticated test');
  return result.user;
}
\`,
    };
  }
  if (url.endsWith('/src/lib/supabase/server.ts')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: \`export async function createClient() {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: { id: 'profile-1', org_id: 'org-1' }, error: null }),
              };
            },
          };
        },
      };
    },
  };
}\`,
    };
  }
  return nextLoad(url, context);
}
`;

await register('data:text/javascript,' + encodeURIComponent(loader), import.meta.url);
process.env.NEXT_PUBLIC_FEATURE_PROJECT_REVIEW_CENTER = 'true';

const { middleware } = await import('../../src/middleware');
const { GET } = await import('../../src/app/api/review-center/me/route');

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

function setResult(user: any, cookie?: { name: string; value: string }) {
  const response = NextResponse.next();
  if (cookie) response.cookies.set(cookie.name, cookie.value, { path: '/' });
  (globalThis as any).__authHotfixResult = { user, response };
}

const admin = {
  id: 'auth-admin',
  name: '管理员',
  role: 'admin',
  department: '管理层',
  email: null,
  active: true,
  authSource: 'supabase',
};

function request(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

console.log('=== Production Auth Middleware Hotfix ===');

setResult(admin, { name: 'sb-test-auth-token', value: 'refreshed' });
let result = await middleware(request('/review-center/reviews'));
assert(result.status === 200, 'valid admin + active profile allows protected route');
assert((result.headers.get('set-cookie') || '').includes('sb-test-auth-token=refreshed'), 'success response retains refreshed auth cookie');

setResult(null);
result = await middleware(request('/workspace-home'));
assert(result.status === 307 && result.headers.get('location')?.includes('/login') === true, 'missing session redirects to login');

setResult(null);
result = await middleware(request('/review-center/reviews'));
assert(result.status === 307 && result.headers.get('location')?.includes('/login') === true, 'missing profile result redirects to login');

setResult(null);
result = await middleware(request('/workspace-home'));
assert(result.status === 307, 'inactive profile represented as no user redirects');

setResult(null, { name: 'sb-test-auth-token', value: 'redirect-refresh' });
result = await middleware(request('/workspace-home'));
assert(result.status === 307, 'redirect path retained');
assert((result.headers.get('set-cookie') || '').includes('sb-test-auth-token=redirect-refresh'), 'redirect response preserves Supabase cookie mutation');

setResult(admin);
const meResponse = await GET(request('/api/review-center/me'));
const meBody = await meResponse.json();
assert(meResponse.status === 200, 'review-center/me returns 200 for admin');
assert(meBody.role === 'admin', 'me returns admin role');
assert(meBody.can_create_review === true, 'me returns create permission');
assert(meBody.profile_id === 'profile-1', 'me returns trusted profile id');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
