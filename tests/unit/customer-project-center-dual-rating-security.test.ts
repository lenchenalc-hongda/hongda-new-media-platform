import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20261025140500_customer_project_center_dual_rating_foundation.sql',
  'utf8',
);
const api = fs.readFileSync('src/app/api/customer-projects/customer-ratings/route.ts', 'utf8');
const panel = fs.readFileSync('src/components/customer-projects/CustomerRatingPanel.tsx', 'utf8');
const list = fs.readFileSync('src/app/customer-projects/customers/CustomersClient.tsx', 'utf8');

console.log('\n=== CPC Dual Rating Persistence, Authorization and UX Contracts ===');

assert.ok(migration.includes('CREATE TABLE public.cpc_customer_potential_assessments'));
assert.ok(migration.includes('ALTER TABLE public.cpc_customer_potential_assessments ENABLE ROW LEVEL SECURITY'));
assert.ok(migration.includes('GRANT SELECT ON TABLE public.cpc_customer_potential_assessments TO authenticated'));
assert.ok(!migration.includes('GRANT INSERT ON TABLE public.cpc_customer_potential_assessments TO authenticated'));
assert.ok(!migration.includes('GRANT UPDATE ON TABLE public.cpc_customer_potential_assessments TO authenticated'));
assert.ok(migration.includes('FOR SELECT TO authenticated'));
assert.ok(migration.includes('public.cpc_can_read_customer_reference(customer_reference_id,org_id)'));

assert.ok(migration.includes('CREATE FUNCTION public.cpc_can_assess_customer_rating'));
assert.ok(migration.includes('cr.reference_kind=\'canonical\''));
assert.ok(migration.includes('epm.profile_id=v_actor_id'));
assert.ok(migration.includes('epm.status=\'active\''));
assert.ok(migration.includes('cr.reference_kind=\'provisional\''));
assert.ok(migration.includes('cr.created_by_profile_id=v_actor_id'));
assert.ok(!migration.includes('created_by_profile_id=v_actor_id OR TRUE'));
assert.ok(migration.includes('auth.uid()'));
assert.ok(migration.includes('p_expected_version'));
assert.ok(migration.includes('VERSION_CONFLICT'));
assert.ok(migration.includes('TO authenticated'));
assert.ok(migration.includes('FROM PUBLIC,anon'));
assert.ok(migration.includes('POTENTIAL_RATING_SUBMITTED'));
assert.ok(migration.includes('POTENTIAL_RATING_APPROVED'));
assert.ok(migration.includes('POTENTIAL_RATING_CHANGES_REQUESTED'));
assert.ok(migration.includes('INSERT INTO public.cpc_audit_log'));
assert.ok(migration.includes('published_grade=CASE WHEN p_decision=\'approve\''));
assert.ok(!migration.includes('UPDATE public.cpc_customer_references SET'));

assert.ok(api.includes("actualGrade = 'N' as const"));
assert.ok(api.includes("actualEvidenceState: 'ungraded' as const"));
assert.ok(api.includes('cpc_customer_maintenance_owners'));
assert.ok(api.includes('cpc_save_customer_potential_rating'));
assert.ok(api.includes('cpc_review_customer_potential_rating'));
assert.ok(api.includes('profile.role !== \'admin\''));
assert.ok(api.includes('profile.role !== \'manager\''));
assert.ok(!api.includes("from('receiptRecords')"));
assert.ok(api.includes("Cache-Control': 'private, no-store"));
assert.ok(panel.includes('提交管理者审核'));
assert.ok(panel.includes('批准并生效'));
assert.ok(panel.includes('退回补充'));
assert.ok(panel.includes('不允许'));
assert.ok(list.includes('高潜力客户'));
assert.ok(list.includes('评级待审核'));
assert.ok(list.includes('开发动作到期检查'));
assert.ok(list.includes('维护人：'));

console.log('PASS: tenant isolation, controlled write, finance N, approval audit, owner and sales action UI');
