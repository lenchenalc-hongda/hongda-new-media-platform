import fs from 'node:fs';
import path from 'node:path';

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

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ');
}

console.log('\n=== Customer Project Center Pilot Environment Hardening Contract ===');

const migrationsDir = 'supabase/migrations';
const requiredSequence = [
  '20261001143000_customer_project_center_phase5a_core_foundation.sql',
  '20261002024500_customer_project_center_phase5b_mutation_rpcs.sql',
  '20261002033500_customer_project_center_phase5d_progress_waiting_event.sql',
  '20261002050000_customer_project_center_phase5f_customer_followup.sql',
  '20261002065000_customer_project_center_phase6b_reschedule_rpc.sql',
  '20261002073000_customer_project_center_phase6c_ai_drafts.sql',
  '20261002090000_customer_project_center_phase7a_reports.sql',
  '20261006140000_customer_project_center_pilot_env_hardening.sql',
];

const migrationNames = fs.readdirSync(migrationsDir).sort();
let previousIndex = -1;
for (const name of requiredSequence) {
  const index = migrationNames.indexOf(name);
  assert(index >= 0, 'required pilot migration exists: ' + name);
  assert(index > previousIndex, 'required pilot migration order is stable: ' + name);
  previousIndex = index;
}

const productionProjectId = 'amqpvxrurenevniilhtl';
const destructivePatterns: Array<[RegExp, string]> = [
  [/\bDROP\s+TABLE\b/i, 'DROP TABLE'],
  [/\bTRUNCATE\b/i, 'TRUNCATE'],
  [/\bDELETE\s+FROM\b/i, 'DELETE FROM'],
  [/\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i, 'DISABLE ROW LEVEL SECURITY'],
];

for (const name of requiredSequence) {
  const sql = fs.readFileSync(path.join(migrationsDir, name), 'utf8');
  const executable = stripComments(sql);

  assert(
    !sql.includes(productionProjectId),
    name + ' does not reference the Production Supabase project',
  );

  for (const [pattern, label] of destructivePatterns) {
    assert(!pattern.test(executable), name + ' does not contain ' + label);
  }

  assert(
    !/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)\b[\s\S]{0,160}\bON\s+(?:TABLE\s+)?public\.cpc_/i.test(
      executable,
    ),
    name + ' does not grant direct authenticated-style CPC table DML',
  );
}

const hardeningName =
  '20261006140000_customer_project_center_pilot_env_hardening.sql';
const hardening = fs.readFileSync(
  path.join(migrationsDir, hardeningName),
  'utf8',
);
const hardeningExecutable = stripComments(hardening);

for (const statement of [
  'REVOKE ALL ON FUNCTION public.auth_has_role(text) FROM PUBLIC;',
  'REVOKE ALL ON FUNCTION public.auth_has_role(text) FROM anon;',
  'REVOKE ALL ON FUNCTION public.auth_org_id() FROM PUBLIC;',
  'REVOKE ALL ON FUNCTION public.auth_org_id() FROM anon;',
  'REVOKE ALL ON FUNCTION public.auth_profile_id() FROM PUBLIC;',
  'REVOKE ALL ON FUNCTION public.auth_profile_id() FROM anon;',
  'GRANT EXECUTE ON FUNCTION public.auth_has_role(text) TO authenticated;',
  'GRANT EXECUTE ON FUNCTION public.auth_org_id() TO authenticated;',
  'GRANT EXECUTE ON FUNCTION public.auth_profile_id() TO authenticated;',
]) {
  assert(
    hardeningExecutable.includes(statement),
    'hardening migration contains: ' + statement,
  );
}

assert(
  hardeningExecutable.includes("to_regclass('public.cpc_projects')")
    && hardeningExecutable.includes("p.proname = 'cpc_record_customer_follow_up'")
    && hardeningExecutable.includes("p.proname = 'cpc_reschedule_work_item'")
    && hardeningExecutable.includes("to_regclass('public.cpc_ai_drafts')")
    && hardeningExecutable.includes("to_regclass('public.cpc_reports')"),
  'hardening migration fails closed when required CPC phases are missing',
);

assert(
  !/GRANT\s+EXECUTE[\s\S]{0,120}\bTO\s+(?:PUBLIC|anon)\b/i.test(
    hardeningExecutable,
  ),
  'hardening migration never re-grants helper execution to PUBLIC or anon',
);

assert(
  hardeningExecutable.includes('BEGIN;')
    && hardeningExecutable.includes('COMMIT;'),
  'hardening migration is transactional',
);

console.log(
  'Pilot environment hardening tests: ' + passed + ' passed, ' + failed + ' failed',
);
if (failed > 0) process.exit(1);
