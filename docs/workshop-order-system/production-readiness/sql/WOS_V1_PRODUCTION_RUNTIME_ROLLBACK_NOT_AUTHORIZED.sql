-- WOS V1 PRODUCTION RUNTIME ROLLBACK DRAFT
-- INSTALL_NOT_AUTHORIZED
--
-- Removes only the Production-neutral V1 runtime added after Foundation and
-- P7. A full rollback must then run the reviewed P7 disposable rollback to
-- remove all WOS schema and return to the 67-table Production baseline.

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'wos_prod_bootstrap_ci'
    AND current_setting('wos_v1.production_rollback_authorized', true)
      IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_PRODUCTION_ROLLBACK_NOT_AUTHORIZED';
  END IF;
  IF to_regprocedure(
      'public.wos_v1_pre_runtime_confirm_office_completeness(uuid,integer,text,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_submit_production_order(uuid,integer,text,uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_RUNTIME_ROLLBACK_BACKUP_MISSING';
  END IF;
END;
$guard$;

DROP FUNCTION IF EXISTS public.wos_operator_review_correction(
  uuid,integer,uuid,text
);
DROP FUNCTION IF EXISTS public.wos_office_resubmit_order(
  uuid,integer,uuid,text
);
DROP FUNCTION IF EXISTS public.wos_office_save_correction(
  uuid,integer,uuid,jsonb,text
);
DROP FUNCTION IF EXISTS public.wos_operator_order_action(
  uuid,integer,uuid,text,text
);
DROP FUNCTION IF EXISTS public.wos_create_production_order(uuid,jsonb);
DROP FUNCTION IF EXISTS public.wos_v1_assert_current_image_set(
  uuid,uuid,text
);
DROP FUNCTION public.wos_confirm_office_completeness(
  uuid,integer,text,text
);
DROP FUNCTION public.wos_submit_production_order(
  uuid,integer,text,uuid
);
DROP FUNCTION public.wos_p7_record_trusted_image_proof(
  uuid,uuid,uuid,text,uuid,text,timestamptz,text
);

ALTER FUNCTION public.wos_v1_pre_runtime_confirm_office_completeness(
  uuid,integer,text,text
) RENAME TO wos_confirm_office_completeness;
ALTER FUNCTION public.wos_v1_pre_runtime_submit_production_order(
  uuid,integer,text,uuid
) RENAME TO wos_submit_production_order;
ALTER FUNCTION public.wos_v1_pre_runtime_record_trusted_image_proof(
  uuid,uuid,uuid,text,uuid,text,timestamptz,text
) RENAME TO wos_p7_record_trusted_image_proof;

DROP TABLE IF EXISTS public.wos_operator_review_receipts;
DROP TABLE IF EXISTS public.wos_office_revisions;
DROP TABLE IF EXISTS public.wos_operator_action_receipts;
DROP TABLE IF EXISTS public.wos_order_create_receipts;

DO $postcheck$
BEGIN
  IF to_regclass('public.wos_operator_review_receipts') IS NOT NULL
    OR to_regclass('public.wos_office_revisions') IS NOT NULL
    OR to_regclass('public.wos_operator_action_receipts') IS NOT NULL
    OR to_regclass('public.wos_order_create_receipts') IS NOT NULL
    OR to_regprocedure('public.wos_create_production_order(uuid,jsonb)')
      IS NOT NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_confirm_office_completeness(uuid,integer,text,text)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_submit_production_order(uuid,integer,text,uuid)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.wos_confirm_office_completeness(uuid,integer,text,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_submit_production_order(uuid,integer,text,uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_RUNTIME_ROLLBACK_INCOMPLETE';
  END IF;
END;
$postcheck$;

COMMIT;

SELECT 'WOS_V1_RUNTIME_ROLLBACK=PASS' AS check_name;
