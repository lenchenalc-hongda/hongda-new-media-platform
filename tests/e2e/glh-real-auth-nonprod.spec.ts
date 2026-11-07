// REAL Supabase Auth/JWT E2E for *isolated* hongda-review-dev only.
// Never run against Production. Creates one clearly synthetic .invalid lead
// and immutable audit facts in the isolated project after 3 real passwords.
// The QA harness intentionally does not print credentials, users or tokens.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const QA_REF = 'xulmpqaknlwqqculbsek';
const QA_URL = 'https://' + QA_REF + '.supabase.co';
type Role = 'admin' | 'sales' | 'foreign_sales';
type EnvName = 'LIVE_TEST_ADMIN_EMAIL' | 'LIVE_TEST_ADMIN_PASSWORD'
  | 'LIVE_TEST_SALES_EMAIL' | 'LIVE_TEST_SALES_PASSWORD'
  | 'LIVE_TEST_FOREIGN_EMAIL' | 'LIVE_TEST_FOREIGN_PASSWORD';
const credentials: readonly EnvName[] = [
  'LIVE_TEST_ADMIN_EMAIL', 'LIVE_TEST_ADMIN_PASSWORD',
  'LIVE_TEST_SALES_EMAIL', 'LIVE_TEST_SALES_PASSWORD',
  'LIVE_TEST_FOREIGN_EMAIL', 'LIVE_TEST_FOREIGN_PASSWORD',
];

function failClosed(message: string): never { throw new Error(message); }
function check(ok: unknown, label: string): asserts ok {
  if (!ok) failClosed('QA_CHECK_FAILED:' + label);
}
function newClient(key: string): SupabaseClient {
  return createClient(QA_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
type Identity = { client: SupabaseClient; userId: string; profileId: string; orgId: string; token: string };
async function signIn(
  key: string, role: Role, envEmail: EnvName, envPassword: EnvName,
): Promise<Identity> {
  const client = newClient(key);
  const login = await client.auth.signInWithPassword({
    email: process.env[envEmail]!, password: process.env[envPassword]!,
  });
  if (login.error || !login.data.user?.id || !login.data.session?.access_token) {
    failClosed('REAL_AUTH_SIGN_IN_UNAVAILABLE:' + role);
  }
  const userId = login.data.user.id;
  const profile = await client.from('profiles')
    .select('id,org_id,role,is_active').eq('user_id', userId).single();
  check(!profile.error && profile.data?.role === (role === 'foreign_sales' ? 'sales' : role)
    && profile.data?.is_active === true && !!profile.data?.org_id && !!profile.data?.id,
    'SIGNED_IN_PROFILE_' + role);
  return {
    client, userId, profileId: profile.data.id,
    orgId: profile.data.org_id, token: login.data.session.access_token,
  };
}
async function run() {
  // The login gate is checked BEFORE constructing any client or issuing network requests.
  check(process.env.LIVE_TEST === 'true'
    && process.env.GLH_ACK_SYNTHETIC_LEAD === 'true'
    && process.env.NEXT_PUBLIC_SUPABASE_URL === QA_URL
    && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    && credentials.every(name => !!process.env[name]),
  'MISSING_PROTECTED_NONPROD_LOGIN_INPUTS');
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const admin = await signIn(key,'admin','LIVE_TEST_ADMIN_EMAIL','LIVE_TEST_ADMIN_PASSWORD');
  const sales = await signIn(key,'sales','LIVE_TEST_SALES_EMAIL','LIVE_TEST_SALES_PASSWORD');
  const foreign = await signIn(key,'foreign_sales','LIVE_TEST_FOREIGN_EMAIL','LIVE_TEST_FOREIGN_PASSWORD');
  try {
    check(admin.orgId === sales.orgId && admin.orgId !== foreign.orgId
      && new Set([admin.userId,sales.userId,foreign.userId]).size === 3
      && new Set([admin.token,sales.token,foreign.token]).size === 3,
      'THREE_DISTINCT_REAL_AUTH_SESSIONS_AND_ORGS');

    const requestKey = randomUUID();
    const name = 'QA NONPRODUCTION LEAD ' + randomUUID().slice(0,8);
    const email = 'qa-glh-' + randomUUID().replace(/-/g,'') + '@example.invalid';
    const args = {
      p_request_key: requestKey, p_display_name: name,
      p_company_name: 'QA NONPRODUCTION ONLY', p_country_code: null,
      p_whatsapp: null, p_email: email, p_requirement_type: 'FILM',
      p_owner_profile_id: admin.profileId, p_product: 'Heat Transfer Film',
      p_material: 'Plastic', p_quantity: '1000', p_notes: 'QA only; no external sends',
      p_source_detail: 'OTHER',
    };
    const first = await admin.client.rpc('glh_create_manual_production_lead', args);
    const leadId = first.data?.leadId as string | undefined;
    check(!first.error && !!leadId && first.data?.idempotentReplay === false,
      'CREATED_REAL_AUTH_MANUAL_LEAD');
    const repeat = await admin.client.rpc('glh_create_manual_production_lead', args);
    check(!repeat.error && repeat.data?.leadId === leadId &&
      repeat.data?.idempotentReplay === true, 'REPLAY_SAME_REAL_AUTH_LEAD');
    const collision = await admin.client.rpc('glh_create_manual_production_lead', {
      ...args, p_display_name: 'MUTATED QA KEY',
    });
    check(!!collision.error && collision.error.message.includes('IDEMPOTENCY_CONFLICT'),
      'CHANGED_REPLAY_DENIED');
    const assign = await admin.client.rpc('glh_assign_lead', {
      p_lead_id: leadId, p_assignee_profile_id: sales.profileId,
      p_expected_version: 1, p_reason: 'QA_REAL_AUTH_TEST',
    });
    check(!assign.error && assign.data?.owner_profile_id === sales.profileId &&
      assign.data?.version === 2,'ADMIN_ASSIGNMENT_AND_CAS');
    const salesLead = await sales.client.from('glh_leads')
      .select('id,owner_profile_id,version').eq('id', leadId).single();
    check(!salesLead.error && salesLead.data?.id === leadId &&
      salesLead.data?.owner_profile_id === sales.profileId &&
      salesLead.data?.version === 2, 'SALES_SEES_ASSIGNED_LEAD');
    const foreignRead = await foreign.client.from('glh_leads')
      .select('id').eq('id', leadId);
    check(!foreignRead.error && Array.isArray(foreignRead.data) &&
      foreignRead.data.length === 0,'FOREIGN_ORG_RLS_DENY');
    const foreignAssign = await foreign.client.rpc('glh_assign_lead', {
      p_lead_id: leadId,p_assignee_profile_id: foreign.profileId,
      p_expected_version: 2,p_reason: 'DENY_QA_CROSS_ORG',
    });
    check(!!foreignAssign.error && foreignAssign.error.code === '42501',
      'FOREIGN_ORG_WRITE_DENY');
    console.log('GLH_REAL_AUTH_E2E=PASS');
    console.log('GLH_QA_EVIDENCE=' + JSON.stringify({
      projectRef: QA_REF, independentPasswordSessions: 3,
      leadCreated: true, replay: true, mutatedReplayDenied: true,
      assignmentVerifiedBySales: true, crossOrgRlsDenied: true,
      crossOrgRpcDenied: true, externalMessages: 0,
      syntheticLeadPersistedInIsolatedProject: true,
    }));
  } finally {
    await Promise.allSettled([admin.client.auth.signOut(), sales.client.auth.signOut(), foreign.client.auth.signOut()]);
  }
}
run().catch(() => {
  // No untrusted error objects, raw HTTP responses or credentials in CI logs.
  console.error('GLH_REAL_AUTH_E2E=NOT_VERIFIED_OR_FAIL');
  process.exitCode=1;
});
