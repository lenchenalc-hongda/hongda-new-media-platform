import assert from 'node:assert/strict';
import fs from 'node:fs';

console.log('\n=== CPC Repeatable Customer Acquisition Channel Regression ===');

const migration = fs.readFileSync(
  'supabase/migrations/20261027175500_cpc_provisional_source_channel_separation.sql','utf8',
);
const newProjectPage = fs.readFileSync(
  'src/app/customer-projects/projects/new/page.tsx','utf8',
);
const mutationApi = fs.readFileSync('src/lib/customer-projects/api.ts','utf8');
const selector = fs.readFileSync('src/app/api/customer-projects/customer-references/route.ts','utf8');
const customerList = fs.readFileSync('src/app/api/customer-projects/customers/route.ts','utf8');
const customerDetail = fs.readFileSync('src/app/api/customer-projects/customers/[id]/route.ts','utf8');
const readModel = fs.readFileSync('src/lib/customer-projects/customer-read-models.ts','utf8');
const serverReads = fs.readFileSync('src/lib/customer-projects/server-reads.ts','utf8');

assert.match(migration,/ALTER TABLE public\.cpc_customer_references\s+ADD COLUMN provisional_source_label TEXT/);
assert.match(migration,/CHECK \(\s*provisional_source_label IS NULL/);
assert.match(migration,/provisional_source_label IS NULL\s+OR/);
assert.ok(migration.includes('char_length(btrim(provisional_source_label)) BETWEEN 1 AND 300'));
assert.ok(migration.includes("v_reference_id UUID := gen_random_uuid();"));
assert.ok(migration.includes("v_internal_reference TEXT := 'CPC-PROV-' || v_reference_id::text;"));
assert.ok(migration.includes('v_source_label TEXT := btrim(coalesce(p_provisional_source_reference'));
assert.ok(migration.includes('v_internal_reference, v_source_label, v_customer_name'));
assert.ok(migration.includes("'source_channel', v_source_label"));
assert.ok(migration.includes('WHERE p.user_id = auth.uid()'));
assert.ok(migration.includes('AND p.is_active = TRUE'));
assert.ok(migration.includes("v_actor_role NOT IN ('admin','manager','sales')"));
assert.ok(migration.includes('INSERT INTO public.cpc_audit_log'));
assert.ok(migration.includes('REVOKE ALL ON FUNCTION public.cpc_create_provisional_customer_reference'));
assert.ok(migration.includes('FROM PUBLIC, anon, authenticated'));
assert.ok(migration.includes('TO authenticated'));
assert.ok(migration.includes("系统生成的客户编号冲突，请重试"));
assert.ok(!migration.includes('该临时客户来源已存在'));

assert.ok(migration.startsWith('-- CPC:'));
assert.ok(migration.includes('BEGIN;'));
assert.ok(migration.trimEnd().endsWith('COMMIT;'));
assert.doesNotMatch(migration,/\bDROP\s+(?:TABLE|INDEX|SCHEMA)\b/i);
assert.doesNotMatch(migration,/\bUPDATE\s+public\.cpc_customer_references\b/i);
assert.doesNotMatch(migration,/DELETE\s+FROM\s+public\.cpc_customer_references/i);
assert.doesNotMatch(migration,/\bTRUNCATE\b/i);
assert.doesNotMatch(migration,/\bALTER TABLE\s+public\.cpc_projects\b/i);
assert.doesNotMatch(migration,/\bALTER TABLE\s+public\.cpc_external_profile_mappings\b/i);

// Keep old API argument (client and SQL signature) compatible, while fixing its semantics.
assert.ok(mutationApi.includes('p_provisional_source_reference: body.provisionalSourceReference'));
assert.ok(!mutationApi.includes("DUPLICATE_REFERENCE: '该临时客户来源已存在'"));
assert.ok(newProjectPage.includes('获客渠道 / 来源'));
assert.ok(newProjectPage.includes('获客渠道可以重复'));
assert.ok(newProjectPage.includes('provisionalSourceReference: source'));
assert.ok(newProjectPage.includes('setSelectedCustomerId(id)'));
assert.ok(newProjectPage.includes('添加到客户池并选中'));
assert.ok(newProjectPage.includes('创建项目并开始推进'));

for (const [label,source] of [
  ['customer selector',selector],
  ['customer list',customerList],
  ['customer detail',customerDetail],
  ['server customer summary',serverReads],
]) {
  assert.ok(source.includes('provisional_source_reference,provisional_source_label'),
    label + ': source label column included in SELECT');
}
assert.ok(selector.includes('row.provisional_source_label ?? row.provisional_source_reference'));
assert.ok(customerDetail.includes('customer.provisional_source_label ?? customer.provisional_source_reference'));
assert.ok(readModel.includes('provisional_source_label?: string | null;'));
assert.ok(readModel.includes('customer.provisional_source_label ?? customer.provisional_source_reference'));
assert.ok(!selector.includes('sourceLabel: row.provisional_source_reference'));
assert.ok(!customerDetail.includes('sourceLabel: customer.provisional_source_reference'));

console.log('PASS: repeated source labels, unique internal references, auth/permissions, read model and project form');
