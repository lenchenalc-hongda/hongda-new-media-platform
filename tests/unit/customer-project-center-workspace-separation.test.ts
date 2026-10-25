import assert from 'node:assert/strict';
import fs from 'node:fs';

console.log('\n=== CPC Customer Notes / Rating / Development Plan Separation ===');

const migration = fs.readFileSync(
  'supabase/migrations/20261025161000_cpc_customer_notes_and_development_plan.sql', 'utf8',
);
const ratingApi = fs.readFileSync(
  'src/app/api/customer-projects/customer-ratings/route.ts', 'utf8',
);
const workspaceApi = fs.readFileSync(
  'src/app/api/customer-projects/customer-workspace/route.ts', 'utf8',
);
const detail = fs.readFileSync(
  'src/components/customer-projects/CustomerRatingPanel.tsx', 'utf8',
);
const customerPage = fs.readFileSync(
  'src/app/customer-projects/customers/[id]/page.tsx', 'utf8',
);

assert.ok(migration.includes('CREATE TABLE public.cpc_customer_workspaces'));
assert.ok(migration.includes('ALTER TABLE public.cpc_customer_workspaces ENABLE ROW LEVEL SECURITY'));
assert.ok(migration.includes('public.cpc_can_read_customer_reference(customer_reference_id, org_id)'));
assert.ok(migration.includes('GRANT SELECT ON TABLE public.cpc_customer_workspaces TO authenticated'));
assert.ok(!migration.includes('GRANT UPDATE ON TABLE public.cpc_customer_workspaces TO authenticated'));
assert.ok(!migration.includes('GRANT INSERT ON TABLE public.cpc_customer_workspaces TO authenticated'));
assert.ok(migration.includes('REVOKE ALL ON TABLE public.cpc_customer_workspaces FROM PUBLIC, anon, authenticated'));
assert.ok(migration.includes('CREATE FUNCTION public.cpc_save_customer_note'));
assert.ok(migration.includes('CREATE FUNCTION public.cpc_save_customer_development_plan'));
assert.ok(migration.includes('public.cpc_can_assess_customer_rating('));
assert.ok(migration.includes('auth.uid()'));
assert.ok(migration.includes('note_version=public.cpc_customer_workspaces.note_version+1'));
assert.ok(migration.includes('plan_version=public.cpc_customer_workspaces.plan_version+1'));
assert.ok(migration.includes('ON CONFLICT (org_id, customer_reference_id)'));
assert.ok(migration.includes('CUSTOMER_NOTE_SAVED'));
assert.ok(migration.includes('CUSTOMER_DEVELOPMENT_PLAN_SAVED'));
assert.ok(migration.includes('INSERT INTO public.cpc_audit_log'));
assert.ok(migration.includes('ON CONFLICT (org_id, customer_reference_id) DO NOTHING'));
assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.cpc_save_customer_potential_rating'));

const separatedSaveRpc = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.cpc_save_customer_potential_rating'),
);
assert.ok(separatedSaveRpc.includes('p_opportunity_summary TEXT'), 'RPC signature kept for compatibility');
assert.ok(!separatedSaveRpc.includes('opportunity_summary=btrim('), 'scoring must not rewrite plan');
assert.ok(!separatedSaveRpc.includes('next_check_on=p_next_check_on'), 'scoring must not rewrite plan dates');
assert.ok(separatedSaveRpc.includes('evidence_summary=btrim('));
assert.ok(separatedSaveRpc.includes('POTENTIAL_RATING_SUBMITTED'));
assert.ok(!migration.includes('UPDATE public.cpc_customer_references SET'));
assert.ok(!migration.includes('TRUNCATE'));

assert.ok(workspaceApi.includes('z.discriminatedUnion'));
assert.ok(workspaceApi.includes("section: z.literal('note')"));
assert.ok(workspaceApi.includes("section: z.literal('plan')"));
assert.ok(workspaceApi.includes("supabase.rpc('cpc_save_customer_note'"));
assert.ok(workspaceApi.includes("supabase.rpc('cpc_save_customer_development_plan'"));
assert.ok(workspaceApi.includes('resolveCpcProfile'));
assert.ok(workspaceApi.includes('expectedVersion'));
assert.ok(ratingApi.includes("from('cpc_customer_workspaces')"));
assert.ok(ratingApi.includes('workspaceResult.error'), 'no fabricated empty workspace on DB errors');
assert.ok(ratingApi.includes('workspaceByCustomer'));
assert.ok(ratingApi.includes('customerNote: rawWorkspace?.customer_note'));
assert.ok(ratingApi.includes('nextAction: workspace?.next_action'));
assert.ok(ratingApi.includes("p_opportunity_summary: ''"));
assert.ok(!ratingApi.includes('p_opportunity_summary: input.opportunitySummary'));

assert.ok(customerPage.includes('<CustomerRatingPanel customerReferenceId={customer.id} />'));
assert.ok(detail.includes('客户备注'));
assert.ok(detail.includes('客户开发机会与销售行动'));
assert.ok(detail.includes('潜力评级 · 五项评分与事实依据'));
assert.ok(detail.includes('ratingExpanded && ('));
assert.ok(detail.includes('setRatingExpanded(false)'));
assert.ok(detail.includes('setRatingExpanded(true)'));
assert.ok(detail.includes('aria-expanded={ratingExpanded}'));
assert.ok(detail.includes('保存评级草稿并收起'));
assert.ok(detail.includes('提交管理者审核并收起'));
assert.ok(detail.includes('saveCustomerNote()'));
assert.ok(detail.includes('saveDevelopmentPlan()'));
assert.ok(detail.includes("section: 'note'"));
assert.ok(detail.includes("section: 'plan'"));
assert.ok(detail.includes('保存开发机会与销售计划'));
assert.ok(detail.includes('已提交管理者审核'));
assert.ok(detail.includes('setRatingExpanded(false);'));
assert.ok(detail.indexOf('客户开发机会与销售行动') > detail.indexOf('{ratingExpanded && ('),
  'sales plan must be outside foldable rating editor');
assert.ok(detail.indexOf('>客户备注</h3>') > detail.indexOf('{ratingExpanded && ('),
  'customer notes must be outside foldable rating editor');

console.log('PASS: separate notes, folded scoring, persistent sales plan, independent RPC versions and audit');
