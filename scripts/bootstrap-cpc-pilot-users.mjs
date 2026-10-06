import { createClient } from '@supabase/supabase-js';

const EXPECTED_URL = 'https://xulmpqaknlwqqculbsek.supabase.co';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (url !== EXPECTED_URL) {
  console.error('PILOT_BOOTSTRAP_REFUSED=WRONG_SUPABASE_TARGET');
  process.exit(2);
}
if (!anonKey || !serviceKey) {
  console.error('PILOT_BOOTSTRAP_REFUSED=MISSING_DEV_SECRET');
  process.exit(3);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const users = [
  { name: '叶展龙', email: 'pilot.yezhanlong@hongda.test', password: 'Pilot-YZL-2026!A7m3' },
  { name: '刘士玮', email: 'pilot.liushiwei@hongda.test', password: 'Pilot-LSW-2026!B8n4' },
  { name: '黄文强', email: 'pilot.huangwenqiang@hongda.test', password: 'Pilot-HWQ-2026!C9p5' },
];

const { data: org, error: orgError } = await admin
  .from('organizations')
  .select('id,name')
  .eq('name', 'PILOT-NONPROD')
  .single();

if (orgError || !org?.id) {
  console.error('PILOT_BOOTSTRAP_REFUSED=PILOT_ORG_MISSING');
  process.exit(4);
}

const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error) throw listed.error;

for (const spec of users) {
  let user = listed.data.users.find((item) => item.email === spec.email) || null;

  if (!user) {
    const created = await admin.auth.admin.createUser({
      email: spec.email,
      password: spec.password,
      email_confirm: true,
      user_metadata: { full_name: spec.name, pilot_nonprod: true },
      app_metadata: { pilot_nonprod: true },
    });
    if (created.error || !created.data.user) throw created.error || new Error('createUser failed');
    user = created.data.user;
  } else {
    const updated = await admin.auth.admin.updateUserById(user.id, {
      password: spec.password,
      user_metadata: { ...(user.user_metadata || {}), full_name: spec.name, pilot_nonprod: true },
      app_metadata: { ...(user.app_metadata || {}), pilot_nonprod: true },
    });
    if (updated.error || !updated.data.user) throw updated.error || new Error('updateUserById failed');
    user = updated.data.user;
  }

  const profile = await admin.from('profiles').upsert(
    {
      user_id: user.id,
      org_id: org.id,
      full_name: spec.name,
      email: spec.email,
      role: 'sales',
      department: 'PILOT-NONPROD',
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (profile.error) throw profile.error;

  const verifyClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const login = await verifyClient.auth.signInWithPassword({
    email: spec.email,
    password: spec.password,
  });
  if (login.error || login.data.user?.id !== user.id) {
    throw login.error || new Error('sign-in verification failed');
  }

  const resolved = await verifyClient
    .from('profiles')
    .select('full_name,role,org_id,is_active,department')
    .eq('user_id', user.id)
    .maybeSingle();
  if (
    resolved.error ||
    !resolved.data ||
    resolved.data.full_name !== spec.name ||
    resolved.data.role !== 'sales' ||
    resolved.data.org_id !== org.id ||
    resolved.data.is_active !== true ||
    resolved.data.department !== 'PILOT-NONPROD'
  ) {
    throw resolved.error || new Error('profile verification failed');
  }

  await verifyClient.auth.signOut();
  console.log('PILOT_USER_READY=' + spec.name + '|' + spec.email + '|sales|PILOT-NONPROD');
}

console.log('PILOT_BOOTSTRAP=PASS');
