/**
 * QA-only login credential preflight; genuinely calls Supabase Auth with the
 * protected GitHub Environment credentials. Never logs email/password/JWT,
 * raw Supabase error, or response bodies.
 *
 * READ-ONLY: no synthetic orders, contacts, or Storage uploads.
 * Pinned to the isolated hongda-review-dev project.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const QA_URL = 'https://xulmpqaknlwqqculbsek.supabase.co';
const prefix = 'REVIEW_DEV_';
type TestRole = 'ADMIN' | 'VIEWER' | 'SALES' | 'OPERATOR' | 'FOREIGN';
const testRoles: readonly { name: TestRole; expectedRole: string; foreign: boolean }[] = [
  { name: 'ADMIN', expectedRole: 'admin', foreign: false },
  { name: 'VIEWER', expectedRole: 'viewer', foreign: false },
  { name: 'SALES', expectedRole: 'sales', foreign: false },
  { name: 'OPERATOR', expectedRole: 'operator', foreign: false },
  { name: 'FOREIGN', expectedRole: 'sales', foreign: true },
];

type TestOutcome = {
  name: TestRole;
  login: boolean;
  profile: boolean;
  org: boolean;
  sessionUserId?: string;
};

function announce(name: string, ok: boolean): void {
  console.log('QA_' + name + '=' + (ok ? 'PASS' : 'FAIL'));
}

async function checkRole(
  anonKey: string,
  expectedOrgId: string,
  role: (typeof testRoles)[number],
): Promise<TestOutcome> {
  const result: TestOutcome = {
    name: role.name, login: false, profile: false, org: false,
  };
  const email = process.env[prefix + role.name + '_EMAIL'];
  const password = process.env[prefix + role.name + '_PASSWORD'];
  if (!email || !password) {
    announce(role.name + '_LOGIN', false);
    return result;
  }

  let client: SupabaseClient | null = null;
  let signedIn = false;
  let stage: 'CLIENT_INIT' | 'AUTH_REQUEST' | 'PROFILE_READ' = 'CLIENT_INIT';
  try {
    client = createClient(QA_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    stage = 'AUTH_REQUEST';
    // The only network destination is the exact isolated Supabase project.
    const auth = await client.auth.signInWithPassword({ email, password });
    if (auth.error || !auth.data.session?.access_token || !auth.data.user?.id) {
      announce(role.name + '_LOGIN', false);
      return result;
    }
    signedIn = true;
    result.login = true;
    result.sessionUserId = auth.data.user.id;
    announce(role.name + '_LOGIN', true);

    stage = 'PROFILE_READ';
    const profile = await client.from('profiles')
      .select('role,org_id,is_active')
      .eq('user_id', auth.data.user.id)
      .maybeSingle();

    result.profile = !profile.error && profile.data?.is_active === true &&
      profile.data?.role === role.expectedRole;
    result.org = result.profile && typeof profile.data?.org_id === 'string' &&
      (role.foreign
        ? profile.data.org_id !== expectedOrgId
        : profile.data.org_id === expectedOrgId);
    announce(role.name + '_PROFILE', result.profile);
    announce(role.name + '_ORG', result.org);
    return result;
  } catch (caught: unknown) {
    // Output only allowlisted error *classes*, not messages. No credentials,
    // raw HTTP bodies, email addresses, user IDs, or JWTs reach logs.
    const category = caught instanceof TypeError ? 'TYPE_ERROR' :
      caught instanceof RangeError ? 'RANGE_ERROR' :
      caught instanceof Error ? 'GENERIC_ERROR' : 'NON_ERROR';
    const msg = caught instanceof Error ? caught.message.toLowerCase() : '';
    // Error text is intentionally NOT logged. Only broad allowlisted buckets.
    const group = /supabasekey|api key|apikey|publishable|jwt|key missing/.test(msg)
      ? 'KEY_RELATED' : /url|hostname|domain/.test(msg)
      ? 'URL_RELATED' : /fetch|network|timeout|connect/.test(msg)
      ? 'NETWORK_RELATED' : /crypto|webcrypto/.test(msg)
      ? 'CRYPTO_RELATED' : 'UNCLASSIFIED';
    announce(role.name + '_' + stage, false);
    console.log('QA_' + role.name + '_EXCEPTION_CLASS=' + category);
    console.log('QA_' + role.name + '_EXCEPTION_GROUP=' + group);
    return result;
  } finally {
    if (signedIn && client) await client.auth.signOut().catch(() => undefined);
  }
}

async function main() {
  const anonKey = process.env.REVIEW_DEV_SUPABASE_ANON_KEY;
  const expectedOrg = process.env.REVIEW_DEV_EXPECTED_ORG_ID;
  const validOrg = !!expectedOrg &&
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(expectedOrg);
  const validKeyShape = !!anonKey && (
    /^sb_publishable_[a-zA-Z0-9_-]{12,}$/.test(anonKey) ||
    /^eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(anonKey)
  );
  announce('EXPECTED_ORG_UUID_SHAPE', validOrg);
  announce('ANON_KEY_FORMAT', validKeyShape);
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== QA_URL ||
      !validKeyShape || !validOrg) {
    console.error('QA_PINNED_PROJECT_OR_REQUIRED_CONFIGURATION=FAIL');
    process.exitCode = 1;
    return;
  }

  // Safe constructor-only control using a known fake publishable-shaped key.
  // This does not sign in, connect to an API, or inspect any real secret value.
  let dummyClientBuild = false;
  try {
    createClient(QA_URL, 'sb_publishable_FAKEDIAGNOSTICONLYNOTAREALKEY12345', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    dummyClientBuild = true;
  } catch {
    dummyClientBuild = false;
  }
  announce('PUBLIC_FAKE_KEY_CLIENT_INIT', dummyClientBuild);

  const outcomes: TestOutcome[] = [];
  for (const role of testRoles) {
    outcomes.push(await checkRole(anonKey, expectedOrg!, role));
  }
  const ids = outcomes.map(o => o.sessionUserId);
  const allDistinct = ids.every(Boolean) && new Set(ids).size === testRoles.length;
  announce('FIVE_DISTINCT_AUTH_USERS', allDistinct);
  const passed = outcomes.every(o => o.login && o.profile && o.org) && allDistinct;
  console.log('QA_PROTECTED_AUTH_READ_ONLY=' + (passed ? 'PASS' : 'FAIL'));
  if (!passed) process.exitCode = 1;
}

main().catch(() => {
  console.error('QA_PROTECTED_AUTH_READ_ONLY=FAIL');
  process.exitCode = 1;
});
