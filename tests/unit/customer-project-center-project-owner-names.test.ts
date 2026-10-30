import assert from 'node:assert/strict';
import fs from 'node:fs';

console.log('\n=== CPC Project Owner Names / Visibility Security ===');

const migration = fs.readFileSync(
  'supabase/migrations/20261030113000_cpc_project_owner_name_for_visible_projects.sql',
  'utf8',
);
const model = fs.readFileSync('src/lib/customer-projects/list-read-models.ts', 'utf8');
const server = fs.readFileSync('src/lib/customer-projects/server-reads.ts', 'utf8');
const api = fs.readFileSync('src/app/api/customer-projects/projects/route.ts', 'utf8');
const client = fs.readFileSync('src/app/customer-projects/projects/ProjectsClient.tsx', 'utf8');

// Never expand employee profiles RLS just to show their names.
assert.match(migration, /RETURNS TABLE \(\s*project_id UUID,\s*owner_name TEXT\s*\)/);
assert.match(migration, /SECURITY DEFINER/);
assert.match(migration, /SET search_path = pg_catalog, public/);
assert.match(migration, /JOIN public\.profiles AS viewer/);
assert.match(migration, /viewer\.user_id = auth\.uid\(\)/);
assert.match(migration, /viewer\.is_active = TRUE/);
assert.match(migration, /viewer\.role IN \('admin','manager','sales'\)/);
assert.match(migration, /viewer\.org_id = project\.org_id/);
assert.match(migration, /owner\.id = project\.owner_profile_id/);
assert.match(migration, /owner\.org_id = project\.org_id/);
assert.match(migration, /public\.cpc_can_read_project\(project\.id, project\.org_id\)/);
assert.match(migration, /project\.id = ANY\(p_project_ids\)/);
assert.match(migration, /cardinality\(p_project_ids\) BETWEEN 1 AND 500/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.cpc_project_owner_names\(UUID\[\]\)/);
assert.match(migration, /FROM PUBLIC, anon, authenticated/);
assert.match(migration, /TO authenticated/);
assert.doesNotMatch(migration, /ALTER POLICY|CREATE POLICY|UPDATE public\.profiles|ALTER TABLE/i);
assert.doesNotMatch(migration, /email|salary|commission|phone|user_metadata/i);
assert.ok(migration.trimEnd().endsWith('COMMIT;'));

assert.ok(model.includes('ownerProfileId: project.owner_profile_id'));
assert.ok(model.includes('ownerName: ownerNames.get(project.id) ?? null'));
assert.ok(model.includes('row.owner_name?.trim() || null'));
assert.ok(model.includes('owners?: ListProjectOwnerRow[]'));

for (const [name,source] of [['server-first list',server],['projects GET API',api]]) {
  assert.ok(source.includes(".rpc('cpc_project_owner_names'"), name + ': calls scoped owner names RPC');
  assert.ok(source.includes('p_project_ids: projectIds'), name + ': passes only visible project IDs');
  assert.ok(source.includes('buildProjectList({ projects, workItems, customers, owners })'), name + ': joins names by project ID');
  assert.ok(!source.includes("'service_role'"), name + ': user session only, never service role');
}
assert.ok(api.includes('ownerName: project.ownerName'), 'projects API emits the owner name');
assert.ok(!api.includes('ownerProfileId: project.ownerProfileId'), 'API does not expose private employee profile IDs');
assert.ok(server.includes("Omit<ProjectListItem, 'ownerProfileId'>"), 'server DTO excludes internal employee IDs');
assert.ok(server.includes('({ ownerProfileId, ...project })'), 'server destructures internal owner ID before serializing');
assert.ok(server.includes('isOwnedByMe: ownerProfileId === profile.id'), 'owner-based mine filtering preserved');

assert.ok(client.includes('业务负责人：'), 'owner name prominently visible on every project card');
assert.ok(client.includes("project.ownerName || '待确认'"), 'missing owner is clearly marked as unknown');
assert.ok(client.includes("project.isOwnedByMe ? '（我）' : ''"), 'own project identified without hiding other names');
assert.ok(!client.includes('非我负责'), 'unhelpful anonymous non-self badge is removed');
assert.ok(client.includes('project.ownerName ??'), 'project list search matches owner names');
assert.ok(client.includes("filter === 'all'") || client.includes("{ key: 'all', label: '全部' }"),
  'all-projects filter remains available');
for (const tab of ['我负责的','推进中','等待中','需要处理','已结束','全部']) {
  assert.ok(client.includes(tab), 'existing project filter stays: ' + tab);
}

console.log('PASS: visible project owners displayed across filters and search, no broader employee access');
