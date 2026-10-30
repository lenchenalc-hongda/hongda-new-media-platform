import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { NextRequest } from 'next/server';
import {
  evaluatePostLoginProfile,
  safePostLoginRedirect,
} from '../../src/lib/auth/login-access';

// Replace only the server Supabase client. No real network/database/credentials.
const loader = `
export async function load(url, context, nextLoad) {
  if (url.endsWith('/src/lib/supabase/server.ts')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: \`
export async function createClient() {
  const fake = globalThis.__postAuthGateFake;
  if (fake.noClient) return null;
  return {
    auth: {
      signInWithPassword: async ({ email, password }) => {
        fake.lastInput = { email, password };
        return fake.signInResponse || {
          data: { user: { id: 'auth-employee' }, session: { access_token: 'mock-session' } },
          error: null,
        };
      },
      signOut: async ({ scope } = {}) => {
        fake.signOutCount++;
        fake.signOutScope = scope;
        return { error: null };
      },
    },
    from: (table) => {
      fake.queriedTable = table;
      return {
        select: (fields) => {
          fake.queriedColumns = fields;
          return {
            eq: (column, userId) => {
              fake.filterColumn = column;
              fake.filterValue = userId;
              return {
                maybeSingle: async () => {
                  if (fake.throwLookup) throw new Error('synthetic query failure');
                  return { data: fake.profile, error: fake.profileError || null };
                },
              };
            },
          };
        },
      };
    },
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
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-public-key';
const { POST } = await import('../../src/app/api/auth/login/route');

function fake(overrides: Record<string, unknown> = {}) {
  const state = {
    profile: {
      user_id: 'auth-employee',
      org_id: 'org-synthetic',
      role: 'sales',
      is_active: true,
    },
    signOutCount: 0,
    signOutScope: null,
    ...overrides,
  };
  (globalThis as any).__postAuthGateFake = state;
  return state;
}

async function attempt(payload: Record<string, unknown> | string = {
  email: ' employee@example.test ',
  password: 'not-a-real-password',
  redirect: '/global-lead-hub',
}) {
  const req = new NextRequest('https://hongda.local.invalid/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
  const response = await POST(req);
  return { response, body: await response.json() };
}

const valid = fake();
let result = await attempt();
assert.equal(result.response.status, 200);
assert.equal(result.body.ok, true);
assert.equal(result.body.redirect, '/global-lead-hub');
assert.equal(result.response.headers.get('cache-control'), 'no-store, private');
assert.equal(valid.signOutCount, 0);
assert.equal((valid as any).queriedTable, 'profiles');
assert.equal((valid as any).filterColumn, 'user_id');
assert.equal((valid as any).filterValue, 'auth-employee');
assert.equal((valid as any).lastInput.email, 'employee@example.test');

const missing = fake({ profile: null });
result = await attempt();
assert.equal(result.response.status, 403);
assert.equal(result.body.code, 'PROFILE_NOT_CONFIGURED');
assert.match(result.body.error, /权限配置/);
assert.equal(missing.signOutCount, 1);
assert.equal(missing.signOutScope, 'local');

for (const [profile, code] of [
  [{ user_id: 'auth-employee', org_id: 'org-synthetic', role: 'sales', is_active: false }, 'PROFILE_INACTIVE'],
  [{ user_id: 'auth-employee', org_id: 'org-synthetic', role: 'superadmin', is_active: true }, 'PROFILE_ROLE_INVALID'],
  [{ user_id: 'auth-employee', org_id: null, role: 'sales', is_active: true }, 'PROFILE_ORGANIZATION_MISSING'],
  [{ user_id: 'different-auth-id', org_id: 'org-synthetic', role: 'sales', is_active: true }, 'PROFILE_NOT_CONFIGURED'],
] as const) {
  const blocked = fake({ profile });
  result = await attempt();
  assert.equal(result.response.status, 403);
  assert.equal(result.body.code, code);
  assert.equal(blocked.signOutCount, 1);
}

const deniedRls = fake({ profile: null, profileError: { message: 'synthetic RLS timeout' } });
result = await attempt();
assert.equal(result.response.status, 503);
assert.equal(result.body.code, 'PROFILE_LOOKUP_UNAVAILABLE');
assert.equal(deniedRls.signOutCount, 1);
assert.equal(JSON.stringify(result.body).includes('synthetic RLS timeout'), false);

const thrownLookup = fake({ throwLookup: true });
result = await attempt();
assert.equal(result.response.status, 503);
assert.equal(result.body.code, 'PROFILE_LOOKUP_UNAVAILABLE');
assert.equal(thrownLookup.signOutCount, 1);

const invalidCredentials = fake({ signInResponse: { data: null, error: { status: 400, message: 'credentials rejected' } } });
result = await attempt();
assert.equal(result.response.status, 401);
assert.equal(result.body.error, '邮箱或密码错误');
assert.equal(invalidCredentials.signOutCount, 0);

fake({ signInResponse: { data: null, error: { status: 429 } } });
result = await attempt();
assert.equal(result.response.status, 429);

const missingSession = fake({ signInResponse: { data: { user: { id: 'auth-employee' }, session: null }, error: null } });
result = await attempt();
assert.equal(result.response.status, 503);
assert.equal(result.body.code, 'PROFILE_LOOKUP_UNAVAILABLE');
assert.equal(missingSession.signOutCount, 1);

fake();
result = await attempt('{invalid');
assert.equal(result.response.status, 400);

fake();
result = await attempt({ email: '', password: 'abc' });
assert.equal(result.response.status, 400);

fake();
result = await attempt({ email: 'employee@example.test', password: 'x', redirect: '//phishing.example' });
assert.equal(result.response.status, 200);
assert.equal(result.body.redirect, '/workspace-home');

assert.deepEqual(evaluatePostLoginProfile('id', null), {
  ok: false, code: 'PROFILE_NOT_CONFIGURED', status: 403,
  message: '密码已验证，但该账号尚未完成系统权限配置，请联系管理员',
});
assert.equal(safePostLoginRedirect('/global-lead-hub?tab=inbox'), '/global-lead-hub?tab=inbox');
assert.equal(safePostLoginRedirect('/\\outside'), '/workspace-home');
assert.equal(safePostLoginRedirect('/%2fexample.com'), '/workspace-home');
assert.equal(safePostLoginRedirect('https://attacker.test'), '/workspace-home');

const ui = readFileSync('src/app/login/LoginForm.tsx', 'utf8');
assert.match(ui, /window\.location\.assign\(/);
assert.match(ui, /credentials: 'same-origin'/);
assert.equal(/^\s*router\.refresh\(\)/m.test(ui), false, 'no router.refresh race');
console.log('Post-login profile gate / same-origin navigation regression tests PASS');
