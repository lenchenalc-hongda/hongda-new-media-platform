// WOS P8: zero-credential, zero-network static migration entrypoint contract.
// This is NOT a database migration and does NOT claim a completed restore/rollback rehearsal.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const migration = 'supabase/migrations/20261014102000_workshop_order_system_foundation.sql';
const foundation = readFileSync(migration, 'utf8');
const expectedTables = [
  'wos_production_orders',
  'wos_sampling_requests',
  'wos_resource_readiness',
  'wos_reference_images',
  'wos_visual_baselines',
  'wos_visual_baseline_items',
  'wos_blockers',
  'wos_confirmations',
  'wos_sampling_technical_records',
  'wos_status_history'
];
const forbiddenQaFilesOnMaster = [
  'docs/workshop-order-system/nonproduction-only/wos_p7_atomic_submission.sql',
  'docs/workshop-order-system/nonproduction-only/wos_p7_private_storage.sql',
  'docs/workshop-order-system/nonproduction-only/wos_p7_qa_orphan_claims_20261108.sql'
];

function assertSchema(sql) {
  const defined = [...sql.matchAll(/\bcreate\s+table\s+if\s+not\s+exists\s+public\.(wos_[a-z_]+)\s*\(/gi)].map(m => m[1]);
  assert.deepEqual(defined, expectedTables, 'FOUNDATION_TABLE_DRIFT');
  assert(!/\bdrop\s+(?:table|schema)\b/i.test(sql), 'DESTRUCTIVE_FOUNDATION_DDL');
  assert(!/\btruncate\b/i.test(sql), 'FOUNDATION_DATA_LOSS');
  assert(!/\bxulmpqaknlwqqculbsek\b|\bQA-NONPROD-\b|WOS_P7_QA_ORPHAN_DELETE_ENABLED/i.test(sql), 'QA_ONLY_LEAK_IN_FOUNDATION');
  assert(/\breferences\s+public\.profiles\s*\(\s*id\s*\)/i.test(sql), 'PROFILE_CONTRACT_MISSING');
  for (const table of expectedTables) {
    const safe = table.replace(/[^a-z_]/g, '');
    assert(new RegExp('\\balter\\s+table\\s+public\\.'+safe+'\\s+enable\\s+row\\s+level\\s+security\\s*;', 'i').test(sql), 'MISSING_RLS_'+safe);
    assert(new RegExp('\\brevoke\\s+all\\s+on\\s+table\\s+public\\.'+safe+'\\s+from\\s+anon\\s*,\\s*authenticated\\s*;', 'i').test(sql), 'MISSING_REVOKE_'+safe);
  }
}
assertSchema(foundation);
for (const path of forbiddenQaFilesOnMaster) {
  assert(!existsSync(path), 'QA_ONLY_MIGRATION_COPIED_TO_PROTECTED_MASTER_'+path);
}
const negative = [
  foundation.replace(/alter table public\.wos_production_orders enable row level security;/i, '-- removed RLS'),
  foundation.replace(/revoke all on table public\.wos_production_orders from anon, authenticated;/i, '-- removed revoke'),
  foundation + '\nDROP TABLE public.wos_production_orders;'
];
for (let i=0;i<negative.length;i++) {
  let blocked=false;
  try { assertSchema(negative[i]); } catch { blocked=true; }
  assert(blocked,'FAILED_NEGATIVE_SECURITY_CASE_'+i);
}
console.log('WOS_P8_BASE_SCHEMA_TABLE_COUNT=' + expectedTables.length);
console.log('WOS_P8_FOUNDATION_ALL_TABLES_RLS_AND_REVOKES=PASS');
console.log('WOS_P8_PROFILE_PREREQUISITE_STATIC=PASS');
console.log('WOS_P8_QA_ONLY_SQL_NOT_ON_MASTER=PASS');
console.log('WOS_P8_NEGATIVE_SECURITY_CASES=' + negative.length);
console.log('WOS_P8_DATABASE_CLONE_RESTORE_APPLY_ROLLBACK=NOT_RUN');
console.log('WOS_P8_PRODUCTION_DDL_APPLIED=NO');
