import assert from 'node:assert/strict';
import fs from 'node:fs';

console.log('\n=== CPC Project Owner Self-Rating / No Manager Gate ===');
const migration = fs.readFileSync(
  'supabase/migrations/20261025183000_cpc_potential_owner_self_publish.sql', 'utf8',
);
const route = fs.readFileSync(
  'src/app/api/customer-projects/customer-ratings/route.ts', 'utf8',
);
const panel = fs.readFileSync(
  'src/components/customer-projects/CustomerRatingPanel.tsx', 'utf8',
);
const list = fs.readFileSync(
  'src/app/customer-projects/customers/CustomersClient.tsx', 'utf8',
);
const workspaceApi = fs.readFileSync(
  'src/app/api/customer-projects/customer-workspace/route.ts', 'utf8',
);

assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.cpc_can_self_rate_customer'));
assert.ok(migration.includes('public.cpc_can_assess_customer_rating('),
  'pre-existing customer owners and admins preserve their rights');
assert.ok(migration.includes('project.owner_profile_id=v_actor_id'),
  'only assigned project owner gets additional P rating rights');
assert.ok(migration.includes("project.status IN ('active','paused','won')"),
  'lost/cancelled projects do not grant rating rights');
assert.ok(migration.includes("customer.status IN ('active','pending_review')"),
  'only valid customers can be rated');
assert.ok(migration.includes('project.org_id=p_org_id'),
  'project must belong to same organization');
assert.ok(migration.includes('auth_org_id() IS DISTINCT FROM p_org_id::text'),
  'cross tenant denial');
assert.ok(migration.includes("IF NOT public.auth_has_role('sales') THEN RETURN FALSE; END IF;"),
  'unsupported roles cannot rate by project membership');

assert.ok(migration.includes('CREATE FUNCTION public.cpc_customer_self_rating_access'));
assert.ok(migration.includes('public.cpc_can_read_customer_reference(cr.id,cr.org_id)'),
  'authorization and customer visibility cannot be bypassed by listing');
assert.ok(migration.includes('last_rater_name TEXT'),
  'audit author surfaced to client');
assert.ok(migration.includes('cardinality(p_customer_ids) BETWEEN 1 AND 500'));

assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.cpc_save_customer_potential_rating'));
assert.ok(migration.includes('public.cpc_can_self_rate_customer('));
assert.ok(migration.includes("v_status := CASE WHEN p_submit THEN 'approved' ELSE 'draft' END"));
assert.ok(migration.includes("published_grade=CASE WHEN p_submit THEN v_grade ELSE published_grade END"));
assert.ok(migration.includes("published_score=CASE WHEN p_submit THEN v_score ELSE published_score END"));
assert.ok(migration.includes("published_at=CASE WHEN p_submit THEN now() ELSE published_at END"));
assert.ok(migration.includes('POTENTIAL_RATING_OWNER_PUBLISHED'));
assert.ok(migration.includes("'approval_required',FALSE"));
assert.ok(migration.includes("assessor_profile_id=v_actor_id"));
assert.ok(migration.includes("reviewer_profile_id=NULL"));
assert.ok(migration.includes("IF p_expected_version IS NULL OR v_row.version<>p_expected_version"));
assert.ok(migration.includes("RETURN public.cpc_rpc_error('VERSION_CONFLICT'"));
assert.ok(!migration.includes('UPDATE public.cpc_customer_references SET'),
  'external customer master never modified');
assert.ok(!migration.includes('UPDATE public.cpc_customer_workspaces SET'),
  'notes and sales plan unaffected');
assert.ok(!migration.includes('UPDATE public.receiptRecords'),
  'finance authority untouched');
assert.ok(migration.includes('REVOKE ALL ON FUNCTION public.cpc_review_customer_potential_rating'));
assert.ok(migration.includes('FROM PUBLIC,anon,authenticated'),
  'old review RPC no longer accessible to either user role');
assert.ok(migration.includes('SET search_path = pg_catalog, public'));

assert.ok(route.includes('cpc_customer_self_rating_access'));
assert.ok(route.includes('canRate: ratingAccess?.can_rate === true'));
assert.ok(route.includes('lastRaterName: ratingAccess?.last_rater_name ?? null'));
assert.ok(route.includes('p_submit: true'));
assert.ok(!route.includes('export async function PATCH('),
  'manager PATCH endpoint must return default 405');
assert.ok(!route.includes('cpc_review_customer_potential_rating'));
assert.ok(route.includes('actualGrade = \'N\' as const'),
  'unknown financial receipts never guessed');

assert.ok(panel.includes('保存潜力评级并生效'));
assert.ok(panel.includes('潜力评级保存成功，已直接生效'));
assert.ok(panel.includes('summary.canRate && ('));
assert.ok(panel.includes('summary?.canRate'));
assert.ok(panel.includes('summary.canAssess && ('), 'note and plan permissions remain separate');
assert.ok(!panel.includes('onClick={() => void review('));
assert.ok(!panel.includes('提交管理者审核并收起'));
assert.ok(panel.includes('setRatingExpanded(false);'), 'editor automatically collapses after save');
assert.ok(panel.includes('saveCustomerNote()'));
assert.ok(panel.includes('saveDevelopmentPlan()'));
assert.ok(panel.includes('最近评级人'));
assert.ok(list.includes('潜力未评级'));
assert.ok(!list.includes('潜力评级待审核'));
assert.ok(list.includes('潜力评分人：'));
assert.ok(workspaceApi.includes("supabase.rpc('cpc_save_customer_note'"));
assert.ok(workspaceApi.includes("supabase.rpc('cpc_save_customer_development_plan'"));

console.log('PASS: owner/project owner self-publish, audit, version locks, no review and separate notes/plan');
