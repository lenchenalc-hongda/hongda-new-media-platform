-- WOS V1 RC02 QA BUSINESS GATE RECOVERY
-- NOT INSTALLED / NOT AUTHORIZED

BEGIN;

DO $rc02_recovery_preflight$
BEGIN
  IF current_setting('wos_v1.rc02_recovery_authorized', true)
      IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'RC02_RECOVERY_NOT_AUTHORIZED';
  END IF;
  IF to_regclass('wos_qa_safety.rc02_business_grants') IS NULL THEN
    RAISE EXCEPTION 'RC02_INSTALL_NOT_PRESENT';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM wos_qa_safety.rc02_policy_backup
  ) THEN
    RAISE EXCEPTION 'RC02_POLICY_BACKUP_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM wos_qa_safety.rc02_business_grants
    WHERE state IN ('AUTHORIZED', 'ORDER_BOUND')
  ) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'RC02_ACTIVE_GRANT_MUST_BE_CLOSED';
  END IF;
END;
$rc02_recovery_preflight$;

DROP TRIGGER IF EXISTS rc02_order_insert_guard
  ON public.wos_production_orders;
DROP TRIGGER IF EXISTS rc02_order_bind_grant
  ON public.wos_production_orders;
DROP TRIGGER IF EXISTS rc02_order_update_guard
  ON public.wos_production_orders;
DROP TRIGGER IF EXISTS rc02_reference_image_guard
  ON public.wos_reference_images;
DROP TRIGGER IF EXISTS rc02_readiness_receipt_guard
  ON public.wos_office_readiness_receipts;
DROP TRIGGER IF EXISTS rc02_submission_receipt_guard
  ON public.wos_submission_receipts;
DROP TRIGGER IF EXISTS rc02_workshop_inbox_guard
  ON public.wos_workshop_inbox;
DROP TRIGGER IF EXISTS rc02_office_revision_guard
  ON public.wos_office_revisions;
DROP TRIGGER IF EXISTS rc02_operator_action_receipt_guard
  ON public.wos_operator_action_receipts;
DROP TRIGGER IF EXISTS rc02_operator_review_receipt_guard
  ON public.wos_operator_review_receipts;
DROP TRIGGER IF EXISTS rc02_order_create_receipt_guard
  ON public.wos_order_create_receipts;
DO $proof_guards$
BEGIN
  IF to_regclass('public.wos_verified_image_proofs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS rc02_verified_proof_guard
      ON public.wos_verified_image_proofs;
  END IF;
  IF to_regclass('public.wos_qa_verified_image_proofs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS rc02_verified_proof_guard
      ON public.wos_qa_verified_image_proofs;
  END IF;
END;
$proof_guards$;
DROP TRIGGER IF EXISTS rc02_resource_guard
  ON public.wos_resource_readiness;
DROP TRIGGER IF EXISTS rc02_visual_baseline_guard
  ON public.wos_visual_baselines;
DROP TRIGGER IF EXISTS rc02_visual_baseline_item_guard
  ON public.wos_visual_baseline_items;
DROP TRIGGER IF EXISTS rc02_confirmation_guard
  ON public.wos_confirmations;
DROP TRIGGER IF EXISTS rc02_status_history_guard
  ON public.wos_status_history;
DROP TRIGGER IF EXISTS rc02_storage_no_upsert
  ON storage.objects;
DROP TRIGGER IF EXISTS rc02_storage_gate_guard
  ON storage.objects;

DROP POLICY IF EXISTS wos_qa_rc02_private_insert
  ON storage.objects;

DO $restore_policies$
DECLARE
  policy_row record;
  v_roles text;
BEGIN
  FOR policy_row IN
    SELECT *
    FROM wos_qa_safety.rc02_policy_backup
    ORDER BY policy_name
  LOOP
    SELECT string_agg(format('%I', role_name), ', ')
    INTO v_roles
    FROM unnest(policy_row.role_names) role_name;
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects AS %s FOR %s TO %s%s%s',
      policy_row.policy_name,
      policy_row.permissive,
      policy_row.command,
      v_roles,
      CASE WHEN policy_row.using_expression IS NOT NULL
        THEN ' USING (' || policy_row.using_expression || ')' ELSE '' END,
      CASE WHEN policy_row.check_expression IS NOT NULL
        THEN ' WITH CHECK (' || policy_row.check_expression || ')' ELSE '' END
    );
  END LOOP;
END;
$restore_policies$;

DROP FUNCTION IF EXISTS wos_qa_safety.rc02_storage_no_upsert();
DROP FUNCTION IF EXISTS wos_qa_safety.rc02_storage_gate_guard();
DROP FUNCTION IF EXISTS wos_qa_safety.rc02_child_order_guard();
DROP FUNCTION IF EXISTS wos_qa_safety.rc02_order_update_guard();
DROP FUNCTION IF EXISTS wos_qa_safety.rc02_order_bind_grant();
DROP FUNCTION IF EXISTS wos_qa_safety.rc02_order_insert_guard();
DROP FUNCTION IF EXISTS wos_qa_safety.rc02_storage_insert_allows(text,text);
DROP FUNCTION IF EXISTS wos_qa_safety.rc02_lock_order_grant(uuid,uuid,uuid);
DROP FUNCTION IF EXISTS wos_qa_safety.rc02_order_allows(uuid,uuid,uuid);
DROP FUNCTION IF EXISTS wos_qa_safety.rc02_create_allows(
  uuid,text,uuid,uuid,uuid,uuid,text
);

DROP TABLE IF EXISTS wos_qa_safety.rc02_policy_backup;
DROP TABLE IF EXISTS wos_qa_safety.rc02_business_grants;
DROP FUNCTION IF EXISTS wos_qa_safety.rc02_validate_grant();
DROP SCHEMA wos_qa_safety;

DO $rc02_recovery_postflight$
BEGIN
  IF to_regclass('wos_qa_safety.rc02_business_grants') IS NOT NULL
    OR to_regnamespace('wos_qa_safety') IS NOT NULL
    OR to_regprocedure(
      'wos_qa_safety.rc02_order_allows(uuid,uuid,uuid)'
    ) IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'wos_qa_rc02_private_insert'
    )
  THEN
    RAISE EXCEPTION 'RC02_RECOVERY_INCOMPLETE';
  END IF;
END;
$rc02_recovery_postflight$;

COMMIT;

-- NOT INSTALLED / NOT AUTHORIZED
