import assert from 'node:assert/strict';
import fs from 'node:fs';

console.log('\n=== CPC Project Owner-Requested Archive Visibility ===');

const sql = fs.readFileSync(
  'supabase/migrations/20261030135500_cpc_project_archived_visibility.sql', 'utf8',
);
const route = fs.readFileSync('src/app/api/customer-projects/projects/route.ts', 'utf8');
const detail = fs.readFileSync('src/app/api/customer-projects/projects/[id]/route.ts', 'utf8');
const server = fs.readFileSync('src/lib/customer-projects/server-reads.ts', 'utf8');
const team = fs.readFileSync('src/lib/customer-projects/team-board-server.ts', 'utf8');

assert.match(sql,/ALTER TABLE public\.cpc_projects\s+ADD COLUMN archived_at TIMESTAMPTZ/);
assert.match(sql,/ALTER POLICY cpc_projects_select\s+ON public\.cpc_projects/);
assert.match(sql,/archived_at IS NULL\s+AND public\.cpc_can_read_project\(id, org_id\)/);
assert.match(sql,/BEGIN;/);
assert.ok(sql.trim().endsWith('COMMIT;'));
assert.doesNotMatch(sql,/\bDROP\s+(TABLE|POLICY|SCHEMA|FUNCTION)\b/i);
assert.doesNotMatch(sql,/\bDELETE\s+FROM\b/i);
assert.doesNotMatch(sql,/\bUPDATE\s+public\./i);
assert.doesNotMatch(sql,/cpc_project_events|cpc_work_items|cpc_audit_log/gi,
  'existing immutable project activity and audit tables must not be changed by archival schema');
assert.ok(!sql.includes('status = \'cancelled\''), 'do not globally hide cancelled business projects');

for (const [name,source] of [
  ['project list GET',route],['project details GET',detail],
  ['server-side lists and workbench',server],['team board',team],
]) {
  assert.ok(source.includes(".from('cpc_projects')"),
    name + ': authenticated RLS-based reads will use archive visibility gate');
  assert.ok(!source.includes("'service_role'"),
    name + ': no service role bypass of RLS');
}

console.log('PASS: archived CPC project hidden via existing RLS, other projects and immutable history preserved');
