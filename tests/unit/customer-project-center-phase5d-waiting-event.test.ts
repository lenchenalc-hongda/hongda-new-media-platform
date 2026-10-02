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

console.log('\n=== Customer Project Center Phase 5D Waiting Event Fix ===');

const migrationPath =
  'supabase/migrations/20261002033500_customer_project_center_phase5d_progress_waiting_event.sql';
const sql = fs.readFileSync(migrationPath, 'utf8');
const executableSql = sql.replace(/--.*$/gm, '');

assert(
  sql.includes('CREATE OR REPLACE FUNCTION public.cpc_record_progress'),
  'migration replaces only cpc_record_progress',
);
assert(
  sql.includes("'WAITING_STARTED'")
    && sql.includes("'WAITING_RESOLVED'"),
  'progress mutation emits both waiting start/change and waiting resolved events',
);
assert(
  sql.includes("v_target_waiting_on <> 'none'")
    && sql.includes('IS DISTINCT FROM v_target_waiting_on')
    && sql.includes('IS DISTINCT FROM v_target_next_check_at'),
  'waiting event is emitted only when waiting/check state materially changes',
);
assert(
  sql.includes("p_raw_input IS NULL OR btrim(p_raw_input) = ''")
    && sql.includes('进入或更新等待状态时必须说明实际原因'),
  'entering/updating waiting through progress requires a human reason',
);
assert(
  sql.includes("'from_waiting_on', v_project.waiting_on")
    && sql.includes("'to_waiting_on', v_target_waiting_on")
    && sql.includes("'next_check_at', v_target_next_check_at")
    && sql.includes("'reason', btrim(p_raw_input)"),
  'WAITING_STARTED payload is traceable and report-ready',
);
assert(
  sql.includes('p_request_id')
    && sql.includes("'PROJECT_PROGRESS_RECORDED'"),
  'waiting event remains within the same audited progress mutation',
);
assert(
  sql.includes("p_event_type,\n    v_event_category,\n    COALESCE(p_occurred_at, NOW()),"),
  'progress event defaults occurred_at server-side when API omits a timestamp',
);
assert(
  !executableSql.includes('DROP TABLE')
    && !executableSql.includes('TRUNCATE')
    && !executableSql.includes('DELETE FROM public.cpc_')
    && !executableSql.includes('DISABLE ROW LEVEL SECURITY'),
  'fix is non-destructive and does not weaken RLS',
);
assert(
  !executableSql.includes('UPDATE public.site_data')
    && !executableSql.includes('UPDATE public.leads')
    && !executableSql.includes('UPDATE public.ai_jobs'),
  'fix does not touch legacy generic/acquisition stores',
);

console.log('Phase 5D waiting-event tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
