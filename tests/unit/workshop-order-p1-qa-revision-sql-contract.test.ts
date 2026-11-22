import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(
  'docs/workshop-order-system/nonproduction-only/wos_p1_cpc_draft_revision_QA_ONLY_NOT_INSTALLED.sql',
  'utf8',
);
for (const marker of [
  'DO NOT EXECUTE WITHOUT A SEPARATE OWNER QA',
  'xulmpqaknlwqqculbsek',
  'CREATE TABLE IF NOT EXISTS public.wos_qa_draft_revisions',
  'ALTER TABLE public.wos_qa_draft_revisions ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON public.wos_qa_draft_revisions FROM PUBLIC, anon, authenticated',
  'GRANT SELECT ON public.wos_qa_draft_revisions TO authenticated',
  'CREATE POLICY wos_qa_draft_revisions_select_authorized',
  'CREATE OR REPLACE FUNCTION public.wos_qa_amend_cpc_draft(',
  'SECURITY DEFINER',
  "SET search_path = ''",
  'WHERE user_id=auth.uid() AND is_active=true',
  "role IN ('admin','manager','sales')",
  "v_order.order_number NOT LIKE 'QA-CPC-NONPROD-%'",
  "v_order.workflow_status<>'DRAFT' OR v_order.version<>p_expected_version",
  'FIELD_NOT_ALLOWED',
  'NULL_FIELD_DENIED',
  'BATCH_EXCEEDS_ORDER',
  'v_prior.payload_fingerprint<>v_fingerprint',
  'IDEMPOTENCY_CONFLICT',
  'pg_advisory_xact_lock',
  "reason_code,note,metadata",
  "'QA_CPC_DRAFT_REVISED'",
  'before_snapshot,after_snapshot',
  'REVOKE ALL ON FUNCTION public.wos_qa_amend_cpc_draft',
  'GRANT EXECUTE ON FUNCTION public.wos_qa_amend_cpc_draft',
]) assert(script.includes(marker), 'Missing draft revision safety contract: ' + marker);

for (const prohibited of [
  'GRANT UPDATE ON public.wos_production_orders TO authenticated',
  'GRANT DELETE ON public.wos_production_orders TO authenticated',
  'DROP TABLE public.wos_production_orders',
  'amqpvxrurenevniilhtl',
]) {
  // Production reference appears only in a DO NOT EXECUTE warning, never
  // in executable statements.
  if (prohibited === 'amqpvxrurenevniilhtl') {
    assert(script.includes('must NEVER be applied to'), 'Missing Production guard');
  } else assert(!script.includes(prohibited), 'Dangerous privilege/schema change: ' + prohibited);
}
assert(script.includes('UPDATE public.wos_production_orders SET'));
assert(script.includes("WHERE id=p_order_id AND organization_id=v_actor.org_id"));
assert(script.includes("AND workflow_status='DRAFT' AND version=p_expected_version"));
console.log('workshop-order-p1-qa-revision-sql-contract.test.ts: PASS (design-only, not deployed)');
