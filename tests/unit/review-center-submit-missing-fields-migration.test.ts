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
  'supabase/migrations/20260916043000_review_center_submit_missing_fields.sql';
const sql = fs.readFileSync(migrationPath, 'utf8');

function countOccurrences(value: string, token: string): number {
  return value.split(token).length - 1;
}

console.log('\n=== Review Center Submit Missing Fields Migration Audit ===');

assert(sql.includes('CREATE OR REPLACE FUNCTION public.review_submit('), 'forward migration replaces review_submit');
assert(sql.includes("v_missing_fields TEXT[] := '{}'::TEXT[]"), 'missing fields accumulator exists');
assert(!sql.includes("review_rpc_error('INCOMPLETE_REVIEW'"), 'INCOMPLETE_REVIEW no longer uses data-less helper');
assert(
  countOccurrences(sql, "v_missing_fields := array_append(v_missing_fields, '") === 7,
  'all seven base fields append instead of early return',
);

for (const field of [
  'title',
  'review_type',
  'description',
  'risk_level',
  'risk_reason',
  'owner_id',
  'type_details',
]) {
  assert(
    sql.includes(`v_missing_fields := array_append(v_missing_fields, '${field}')`),
    `missing field collected: ${field}`,
  );
}

assert(
  sql.includes("v_review_row.risk_level IN ('RED', 'YELLOW')")
  && sql.includes("btrim(v_review_row.risk_reason) = ''"),
  'risk_reason remains conditional on RED/YELLOW',
);
assert(
  sql.indexOf("array_append(v_missing_fields, 'risk_level')")
    < sql.indexOf("array_append(v_missing_fields, 'risk_reason')"),
  'risk_level is collected before conditional risk_reason',
);

assert(
  sql.includes("'missing_fields', to_jsonb(v_missing_fields)"),
  'INCOMPLETE_REVIEW returns missing_fields',
);
assert(sql.includes("'missingDimensions', to_jsonb(v_missing_dimensions)"), 'METADATA_INCOMPLETE contract preserved');
assert(sql.includes('public.review_metadata_submit_missing('), 'metadata completeness helper preserved');
assert(
  sql.indexOf("'missing_fields', to_jsonb(v_missing_fields)")
    < sql.indexOf('public.review_metadata_submit_missing('),
  'base completeness returns before metadata gate',
);

for (const preserved of [
  "RETURN public.review_rpc_error('FORBIDDEN', '无提交权限')",
  "RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化')",
  "IF v_review_row.status = 'submitted' THEN",
  "IF v_review_row.status <> 'draft' THEN",
  "SET status = 'submitted'",
  'submitted_by_profile_id = v_actor_profile_id',
  'version = rc.version + 1',
  "INSERT INTO public.review_audit_logs",
  "INSERT INTO public.review_timeline_events",
  "REVOKE ALL ON FUNCTION public.review_submit(UUID, INTEGER)",
  'GRANT EXECUTE ON FUNCTION public.review_submit(UUID, INTEGER)',
  'TO authenticated',
  'SECURITY DEFINER',
  'SET search_path = pg_catalog, public',
]) {
  assert(sql.includes(preserved), 'lifecycle behavior preserved: ' + preserved);
}

assert(
  !sql.includes('DROP TABLE')
  && !sql.includes('TRUNCATE')
  && !sql.includes('DELETE FROM')
  && !sql.includes('DISABLE ROW LEVEL SECURITY'),
  'migration contains no destructive or RLS-bypass statements',
);

console.log(`Submit migration audit: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
