import fs from 'node:fs';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

const migrationPath =
  'supabase/migrations/20261001143000_customer_project_center_phase5a_core_foundation.sql';
const sql = fs.readFileSync(migrationPath, 'utf8');
const executableSql = sql.replace(/--.*$/gm, '');

console.log('\n=== Customer Project Center Phase 5A Migration Audit ===');

const coreTables = [
  'cpc_customer_references',
  'cpc_external_profile_mappings',
  'cpc_projects',
  'cpc_project_members',
  'cpc_project_events',
  'cpc_work_items',
  'cpc_audit_log',
];

for (const table of coreTables) {
  assert(
    sql.includes(`CREATE TABLE public.${table}`),
    `creates core table: ${table}`,
  );
  assert(
    sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`),
    `RLS enabled: ${table}`,
  );
  assert(
    sql.includes(`REVOKE ALL ON TABLE public.${table}`),
    `explicit table revoke: ${table}`,
  );
  assert(
    sql.includes(`GRANT SELECT ON TABLE public.${table} TO authenticated`),
    `authenticated receives read-only grant: ${table}`,
  );
}

for (const forbiddenTable of [
  'cpc_customers',
  'cpc_customer_ownership',
  'cpc_receipts',
  'cpc_payments',
  'cpc_orders',
  'cpc_quotes',
  'cpc_leads',
]) {
  assert(
    !sql.includes(`CREATE TABLE public.${forbiddenTable} `)
      && !sql.includes(`CREATE TABLE public.${forbiddenTable}(`),
    `does not create competing SoT table: ${forbiddenTable}`,
  );
}

assert(
  !/GRANT\s+(INSERT|UPDATE|DELETE|ALL).*TO\s+authenticated/i.test(sql),
  'authenticated receives no direct DML grant',
);

for (const helper of [
  'cpc_can_read_project',
  'cpc_can_read_customer_reference',
  'cpc_can_read_work_item',
]) {
  assert(
    sql.includes(`CREATE OR REPLACE FUNCTION public.${helper}`),
    `read helper exists: ${helper}`,
  );
  assert(
    sql.includes('SECURITY DEFINER'),
    'security-definer helpers are used',
  );
  assert(
    sql.includes('SET search_path = pg_catalog, public'),
    'security-definer helpers pin search_path',
  );
}

assert(
  sql.includes('FOREIGN KEY (owner_profile_id, org_id)')
    && sql.includes('REFERENCES public.profiles(id, org_id)'),
  'Project owner uses profiles.id + org_id',
);
assert(
  sql.includes('FOREIGN KEY (assignee_profile_id, org_id)')
    && sql.includes('FOREIGN KEY (created_by_profile_id, org_id)'),
  'WorkItem actors use same-org profile foreign keys',
);
assert(!sql.includes('auth.users'), 'business foreign keys never reference auth.users');

assert(
  sql.includes('objective_summary TEXT NOT NULL'),
  'Project persists concrete objective summary',
);
assert(
  !sql.includes('next_action_summary TEXT'),
  'Project does not store a second editable next-action truth',
);
assert(
  sql.includes('uq_cpc_work_item_open_next_action')
    && sql.includes("work_item_type = 'NEXT_ACTION'")
    && sql.includes("status IN ('pending', 'in_progress', 'blocked')"),
  'one open NEXT_ACTION per Project is enforced',
);

assert(
  sql.includes('event_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL'),
  'ProjectEvent has monotonic event_seq',
);
assert(
  sql.includes('audit_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL'),
  'audit log has monotonic audit_seq',
);
assert(
  sql.includes("'ORDER_CONFIRMED'")
    && sql.includes("'COMMERCIAL_CONFIRMED'")
    && sql.includes("'PROJECT_CANCELLED'"),
  'consequential commercial/lifecycle events are represented',
);

assert(
  sql.includes('cpc_external_profile_mappings')
    && sql.includes('external_person_id TEXT NOT NULL')
    && sql.includes('profile_id UUID NOT NULL'),
  'external employee identity uses stable-id bridge',
);
assert(
  !/display_name_snapshot\s*=\s*.*profile/i.test(sql),
  'display name is not used as normal identity matching',
);

assert(
  sql.includes('CREATE POLICY "cpc_audit_log_select_management"')
    && sql.includes("public.auth_has_role('admin')")
    && sql.includes("public.auth_has_role('manager')"),
  'raw audit visibility is management-only',
);

assert(
  sql.includes('-- No INSERT / UPDATE / DELETE policies are created in Phase 5A.'),
  'Phase 5A intentionally creates no direct mutation policies',
);

assert(
  !executableSql.includes('DROP TABLE')
    && !executableSql.includes('TRUNCATE')
    && !executableSql.includes('DELETE FROM')
    && !executableSql.includes('DISABLE ROW LEVEL SECURITY'),
  'migration contains no executable destructive or RLS-bypass statements',
);

assert(
  !executableSql.includes('CREATE TABLE public.site_data')
    && !executableSql.includes('INSERT INTO public.site_data')
    && !executableSql.includes('UPDATE public.site_data')
    && !executableSql.includes('DELETE FROM public.site_data'),
  'formal CPC persistence does not read/write legacy site_data',
);

console.log(`Phase 5A migration audit: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
