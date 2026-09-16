import fs from 'node:fs';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + msg);
  }
}

const migrationPath =
  'supabase/migrations/20260916053000_review_center_return_reason_required.sql';
const sql = fs.readFileSync(migrationPath, 'utf8');

console.log('\n=== Review Center Return Reason Migration Audit ===');

assert(sql.includes('CREATE OR REPLACE FUNCTION public.review_reopen('), 'forward migration replaces review_reopen');
assert(sql.includes('v_reason := btrim(p_reason)'), 'reason is trimmed in SQL');
assert(sql.includes('length(v_reason) > 1000'), 'reason length limit preserved');
assert(
  sql.includes("v_review_row.status IN ('submitted', 'closed')")
  && sql.includes("v_reason IS NULL OR v_reason = ''"),
  'submitted and closed both require a non-empty reason',
);
assert(sql.includes("THEN '退回修改必须填写原因'"), 'submitted invalid reason message is distinct');
assert(sql.includes("ELSE '重新打开必须填写原因'"), 'closed invalid reason message is distinct');
assert(sql.includes("RETURN public.review_rpc_error(\n      'INVALID_REASON'"), 'RPC keeps INVALID_REASON code');

for (const preserved of [
  "IF v_actor_role NOT IN ('admin', 'manager')",
  "IF v_review_row.status = 'closed' AND v_actor_role <> 'admin'",
  "RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在')",
  "RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化')",
  "IF v_review_row.status = 'draft' THEN",
  "IF v_review_row.status NOT IN ('submitted', 'closed') THEN",
  'submitted_at = NULL',
  'submitted_by_profile_id = NULL',
  'closed_at = NULL',
  'closed_by = NULL',
  'version = rc.version + 1',
  "INSERT INTO public.review_audit_logs",
  "INSERT INTO public.review_timeline_events",
  "v_changes := v_changes || jsonb_build_object('reason', v_reason)",
  "v_payload := v_payload || jsonb_build_object('reason', v_reason)",
  'SECURITY DEFINER',
  'SET search_path = pg_catalog, public',
  'REVOKE ALL ON FUNCTION public.review_reopen(UUID, INTEGER, TEXT)',
  'GRANT EXECUTE ON FUNCTION public.review_reopen(UUID, INTEGER, TEXT)',
  'TO authenticated',
]) {
  assert(sql.includes(preserved), 'reopen behavior preserved: ' + preserved);
}

assert(
  !sql.includes('DROP TABLE')
  && !sql.includes('TRUNCATE')
  && !sql.includes('DELETE FROM')
  && !sql.includes('DISABLE ROW LEVEL SECURITY')
  && !sql.includes('CREATE TABLE'),
  'migration has no destructive schema or RLS changes',
);

console.log(`Return reason migration audit: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
