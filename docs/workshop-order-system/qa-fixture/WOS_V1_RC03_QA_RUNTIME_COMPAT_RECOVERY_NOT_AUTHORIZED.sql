-- WOS V1 RC03 QA RUNTIME COMPATIBILITY RECOVERY
-- DATA-RETENTION MODE / NOT INSTALLED / NOT AUTHORIZED
--
-- This restores the original QA Storage Policies, bucket MIME list and table
-- grants, removes the compatibility bridge, and revokes V1 write RPC execution.
-- New V1 runtime tables and their audit/business rows are retained.

BEGIN;

DO $rc03_compat_recovery_preflight$
BEGIN
  IF current_setting('wos_v1.rc03_compat_recovery_authorized', true)
      IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'RC03_COMPAT_RECOVERY_NOT_AUTHORIZED';
  END IF;
  IF to_regnamespace('wos_v1_rc03_compat') IS NULL THEN
    RAISE EXCEPTION 'RC03_COMPAT_INSTALL_NOT_PRESENT';
  END IF;
  IF to_regnamespace('wos_v1_rc02_safety') IS NOT NULL THEN
    RAISE EXCEPTION 'RC02_RECOVERY_MUST_RUN_FIRST';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM wos_v1_rc03_compat.bucket_backup
  ) OR NOT EXISTS (
    SELECT 1 FROM wos_v1_rc03_compat.storage_policy_backup
  ) OR NOT EXISTS (
    SELECT 1 FROM wos_v1_rc03_compat.function_definition_backup
  ) THEN
    RAISE EXCEPTION 'RC03_COMPAT_BACKUP_MISSING';
  END IF;
  IF to_regprocedure(
      'wos_v1_rc03_compat.wos_qa_proof_write_guard_original()'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_confirm_office_completeness(uuid,integer,text,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_submit_production_order(uuid,integer,text,uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_register_uploaded_reference_image(uuid,uuid,text,text)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'RC03_COMPAT_P7_BACKUP_MISSING';
  END IF;
END;
$rc03_compat_recovery_preflight$;

REVOKE EXECUTE ON FUNCTION public.wos_create_production_order(uuid,jsonb)
FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_register_uploaded_reference_image(
  uuid,uuid,text,text
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_confirm_office_completeness(
  uuid,integer,text,text
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_submit_production_order(
  uuid,integer,text,uuid
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_operator_order_action(
  uuid,integer,uuid,text,text
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_office_save_correction(
  uuid,integer,uuid,jsonb,text
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_office_resubmit_order(
  uuid,integer,uuid,text
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_operator_review_correction(
  uuid,integer,uuid,text
) FROM authenticated;

DROP TRIGGER IF EXISTS rc03_mirror_verified_proof
  ON public.wos_verified_image_proofs;
DROP TRIGGER IF EXISTS rc03_reject_verified_proof_update
  ON public.wos_verified_image_proofs;
DROP FUNCTION IF EXISTS wos_v1_rc03_compat.mirror_verified_proof();
DROP FUNCTION IF EXISTS wos_v1_rc03_compat.reject_verified_proof_update();

DROP TRIGGER IF EXISTS wos_qa_trusted_proof_guard
  ON public.wos_qa_verified_image_proofs;
DROP FUNCTION public.wos_qa_proof_write_guard();
ALTER FUNCTION wos_v1_rc03_compat.wos_qa_proof_write_guard_original()
  SET SCHEMA public;
ALTER FUNCTION public.wos_qa_proof_write_guard_original()
  RENAME TO wos_qa_proof_write_guard;
CREATE TRIGGER wos_qa_trusted_proof_guard
BEFORE INSERT OR UPDATE ON public.wos_qa_verified_image_proofs
FOR EACH ROW EXECUTE FUNCTION public.wos_qa_proof_write_guard();

DROP FUNCTION public.wos_confirm_office_completeness(
  uuid,integer,text,text
);
DROP FUNCTION public.wos_submit_production_order(
  uuid,integer,text,uuid
);
DROP FUNCTION public.wos_p7_record_trusted_image_proof(
  uuid,uuid,uuid,text,uuid,text,timestamptz,text
);
DROP FUNCTION public.wos_register_uploaded_reference_image(
  uuid,uuid,text,text
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
ALTER FUNCTION public.wos_v1_pre_runtime_register_uploaded_reference_image(
  uuid,uuid,text,text
) RENAME TO wos_register_uploaded_reference_image;

DO $verify_historical_rows$
DECLARE
  backup_row record;
  current_hash text;
  v_bucket text;
  v_name text;
  v_baseline text;
  v_image text;
BEGIN
  FOR backup_row IN
    SELECT *
    FROM wos_v1_rc03_compat.historical_rows
    ORDER BY object_kind, row_key
  LOOP
    current_hash := NULL;
    IF backup_row.object_kind = 'order' THEN
      SELECT md5(to_jsonb(source_row)::text) INTO current_hash
      FROM public.wos_production_orders source_row
      WHERE source_row.id = backup_row.row_key::uuid;
    ELSIF backup_row.object_kind = 'image' THEN
      SELECT md5(to_jsonb(source_row)::text) INTO current_hash
      FROM public.wos_reference_images source_row
      WHERE source_row.id = backup_row.row_key::uuid;
    ELSIF backup_row.object_kind = 'proof' THEN
      SELECT md5(to_jsonb(source_row)::text) INTO current_hash
      FROM public.wos_qa_verified_image_proofs source_row
      WHERE source_row.image_id = backup_row.row_key::uuid;
    ELSIF backup_row.object_kind = 'trusted_receipt' THEN
      SELECT md5(to_jsonb(source_row)::text) INTO current_hash
      FROM public.wos_qa_trusted_proof_receipts source_row
      WHERE source_row.request_id = backup_row.row_key::uuid;
    ELSIF backup_row.object_kind = 'storage_object' THEN
      v_bucket := split_part(backup_row.row_key, '/', 1);
      v_name := substr(
        backup_row.row_key,
        length(v_bucket) + 2
      );
      SELECT md5(to_jsonb(source_row)::text) INTO current_hash
      FROM storage.objects source_row
      WHERE source_row.bucket_id = v_bucket
        AND source_row.name = v_name;
    ELSIF backup_row.object_kind = 'baseline' THEN
      SELECT md5(to_jsonb(source_row)::text) INTO current_hash
      FROM public.wos_visual_baselines source_row
      WHERE source_row.id = backup_row.row_key::uuid;
    ELSIF backup_row.object_kind = 'baseline_item' THEN
      v_baseline := split_part(backup_row.row_key, '/', 1);
      v_image := split_part(backup_row.row_key, '/', 2);
      SELECT md5(to_jsonb(source_row)::text) INTO current_hash
      FROM public.wos_visual_baseline_items source_row
      WHERE source_row.baseline_id = v_baseline::uuid
        AND source_row.reference_image_id = v_image::uuid;
    END IF;
    IF current_hash IS DISTINCT FROM backup_row.row_hash THEN
      RAISE EXCEPTION 'RC03_COMPAT_HISTORICAL_ROW_CHANGED: %/%',
        backup_row.object_kind, backup_row.row_key;
    END IF;
  END LOOP;
END;
$verify_historical_rows$;

DO $verify_restored_p7_interfaces$
DECLARE
  backup_row record;
  current_sha256 text;
  current_acl text;
BEGIN
  FOR backup_row IN
    SELECT *
    FROM wos_v1_rc03_compat.function_definition_backup
    ORDER BY function_name
  LOOP
    SELECT
      encode(
        sha256(convert_to(pg_get_functiondef(procedure_row.oid), 'UTF8')),
        'hex'
      ),
      COALESCE(procedure_row.proacl::text, '')
    INTO current_sha256, current_acl
    FROM pg_proc procedure_row
    WHERE procedure_row.oid = backup_row.function_name::regprocedure;
    IF current_sha256 IS DISTINCT FROM backup_row.definition_sha256
      OR current_acl IS DISTINCT FROM backup_row.acl
    THEN
      RAISE EXCEPTION 'RC03_COMPAT_P7_INTERFACE_RESTORE_MISMATCH: %',
        backup_row.function_name;
    END IF;
  END LOOP;
END;
$verify_restored_p7_interfaces$;

DO $restore_storage_policies$
DECLARE
  policy_row record;
  policy_name text;
  v_roles text;
BEGIN
  FOR policy_name IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname LIKE 'wos\_%' ESCAPE '\'
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON storage.objects',
      policy_name
    );
  END LOOP;

  FOR policy_row IN
    SELECT *
    FROM wos_v1_rc03_compat.storage_policy_backup
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
$restore_storage_policies$;

UPDATE storage.buckets bucket
SET file_size_limit = backup_row.file_size_limit,
    allowed_mime_types = backup_row.allowed_mime_types
FROM wos_v1_rc03_compat.bucket_backup backup_row
WHERE bucket.id = 'wos-private'
  AND backup_row.singleton = true;

DO $restore_table_acl$
DECLARE
  acl_row record;
BEGIN
  FOR acl_row IN
    SELECT *
    FROM wos_v1_rc03_compat.table_acl_backup
  LOOP
    IF acl_row.table_name NOT IN (
      'wos_production_orders',
      'wos_reference_images'
    ) OR acl_row.grantee NOT IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'RC03_COMPAT_ACL_BACKUP_INVALID';
    END IF;
    EXECUTE format(
      'GRANT %s ON TABLE public.%I TO %I',
      acl_row.privilege_type,
      acl_row.table_name,
      acl_row.grantee
    );
  END LOOP;
END;
$restore_table_acl$;

DROP TABLE wos_v1_rc03_compat.historical_rows;
DROP TABLE wos_v1_rc03_compat.function_definition_backup;
DROP TABLE wos_v1_rc03_compat.table_acl_backup;
DROP TABLE wos_v1_rc03_compat.bucket_backup;
DROP TABLE wos_v1_rc03_compat.storage_policy_backup;
DROP SCHEMA wos_v1_rc03_compat;

DO $rc03_compat_recovery_postflight$
BEGIN
  IF to_regnamespace('wos_v1_rc03_compat') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'wos_v1_rc02_operator_private_select'
    )
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
      'public.wos_v1_pre_runtime_register_uploaded_reference_image(uuid,uuid,text,text)'
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
    OR to_regprocedure(
      'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'
    ) IS NULL
    OR EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgname IN (
          'rc03_mirror_verified_proof',
          'rc03_reject_verified_proof_update'
        )
    )
  THEN
    RAISE EXCEPTION 'RC03_COMPAT_RECOVERY_INCOMPLETE';
  END IF;
END;
$rc03_compat_recovery_postflight$;

COMMIT;

-- DATA_RETENTION_MODE: V1 runtime tables and rows intentionally retained.
