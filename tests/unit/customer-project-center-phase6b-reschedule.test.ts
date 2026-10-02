import fs from 'node:fs';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

console.log('\n=== Customer Project Center Phase 6B Reschedule Contract ===');

const path = 'supabase/migrations/20261002065000_customer_project_center_phase6b_reschedule_rpc.sql';
const sql = fs.readFileSync(path, 'utf8');
const executable = sql.replace(/--.*$/gm, '');

assert(
  sql.includes('CREATE OR REPLACE FUNCTION public.cpc_reschedule_work_item'),
  'reschedule RPC exists',
);
assert(
  sql.includes('SECURITY DEFINER')
    && sql.includes('SET search_path = pg_catalog, public'),
  'reschedule RPC is pinned SECURITY DEFINER',
);
assert(
  sql.includes("v_item.status NOT IN ('pending', 'in_progress', 'blocked')"),
  'only open WorkItems may be rescheduled',
);
assert(
  sql.includes('p_expected_version <> v_item.version'),
  'reschedule uses optimistic concurrency',
);
assert(
  sql.includes("RETURN public.cpc_rpc_error('REASON_REQUIRED'")
    && sql.includes('p_to_due_at IS NULL'),
  'new due time and reason are mandatory',
);
assert(
  sql.includes('SET due_at = p_to_due_at')
    && sql.includes('version = wi.version + 1')
    && !sql.includes("SET status = 'pending'"),
  'reschedule changes due_at/version without changing task status',
);
assert(
  sql.includes("'WORK_ITEM_RESCHEDULED'")
    && sql.includes("'due_at', v_item.due_at")
    && sql.includes("'due_at', p_to_due_at")
    && sql.includes('btrim(p_reason)'),
  'old/new due dates and reason are persisted in append-only audit',
);
assert(
  sql.includes("'blocked_status_preserved', v_item.status = 'blocked'"),
  'audit explicitly records blocked status preservation',
);
assert(
  !executable.includes('CREATE TABLE')
    && !executable.includes('cpc_reminders')
    && !executable.includes('cpc_work_item_reschedules'),
  'Phase 6B creates no second reminder/reschedule business table',
);
assert(
  !/GRANT\s+(INSERT|UPDATE|DELETE|ALL).*TO\s+authenticated/i.test(executable),
  'authenticated direct table DML is not restored',
);
assert(
  sql.includes('GRANT EXECUTE ON FUNCTION public.cpc_reschedule_work_item')
    && sql.includes('TO authenticated'),
  'authenticated users only receive narrow RPC execute',
);
assert(
  !executable.includes('DROP TABLE')
    && !executable.includes('TRUNCATE')
    && !executable.includes('DISABLE ROW LEVEL SECURITY'),
  'migration is non-destructive and does not weaken RLS',
);

console.log('Phase 6B reschedule tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
