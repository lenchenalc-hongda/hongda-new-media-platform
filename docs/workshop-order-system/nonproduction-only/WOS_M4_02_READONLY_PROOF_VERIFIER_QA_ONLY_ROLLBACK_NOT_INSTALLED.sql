-- WOS M4-02 ROLLBACK STEP 2: DATABASE OBJECT CLEANUP
-- ARCHITECTURE_STATUS=OFFICE_ONLY_INFEASIBLE_FAIL_CLOSED
-- INSTALL_NOT_AUTHORIZED
--
-- This removes only objects created by the Office-only fallback. It does not
-- touch storage.objects, Storage policies, business rows or existing P7 RLS.

BEGIN;

DO $rollback_preflight$
BEGIN
  IF pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)',
      'EXECUTE'
    )
    OR pg_catalog.pg_has_role(
      CURRENT_USER,
      'wos_m4_proof_verifier_owner',
      'SET'
    )
  THEN
    RAISE EXCEPTION 'M4_DB_ROLLBACK_ACCESS_STILL_OPEN'
      USING ERRCODE = '55000';
  END IF;

  IF pg_catalog.to_regprocedure(
      'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
    ) IS NOT NULL
    AND pg_catalog.pg_get_userbyid((
      SELECT procedure.proowner
      FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid = pg_catalog.to_regprocedure(
        'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
      )
    )) <> 'wos_m4_proof_verifier_owner'
  THEN
    RAISE EXCEPTION 'M4_ROLLBACK_SNAPSHOT_OWNER_MISMATCH'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.to_regprocedure(
      'public.wos_qa_m4_current_user_id()'
    ) IS NOT NULL
    AND (
      pg_catalog.pg_get_userbyid((
        SELECT procedure.proowner
        FROM pg_catalog.pg_proc procedure
        WHERE procedure.oid = pg_catalog.to_regprocedure(
          'public.wos_qa_m4_current_user_id()'
        )
      )) <> CURRENT_USER
      OR pg_catalog.obj_description((
        SELECT procedure.oid
        FROM pg_catalog.pg_proc procedure
        WHERE procedure.oid = pg_catalog.to_regprocedure(
          'public.wos_qa_m4_current_user_id()'
        )
      ), 'pg_proc') <> 'WOS_M4_02_PRIVATE_CALLER_UID_BRIDGE_V1'
    )
  THEN
    RAISE EXCEPTION 'M4_ROLLBACK_CALLER_BRIDGE_MISMATCH'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.to_regprocedure(
      'public.wos_qa_m4_can_download_proof(text,text)'
    ) IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.policyname LIKE 'wos_m4_%'
    )
  THEN
    RAISE EXCEPTION 'M4_ROLLBACK_STORAGE_POLICY_PATH_PRESENT'
      USING ERRCODE = '55000';
  END IF;
END;
$rollback_preflight$;

GRANT wos_m4_proof_verifier_owner TO CURRENT_USER WITH SET TRUE;
SET LOCAL ROLE wos_m4_proof_verifier_owner;
DROP FUNCTION IF EXISTS
  public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text);
RESET ROLE;
REVOKE wos_m4_proof_verifier_owner
FROM CURRENT_USER GRANTED BY CURRENT_USER;

DROP POLICY IF EXISTS wos_m4_proof_owner_profiles_read ON public.profiles;
DROP POLICY IF EXISTS wos_m4_proof_owner_orders_read
  ON public.wos_production_orders;
DROP POLICY IF EXISTS wos_m4_proof_owner_baselines_read
  ON public.wos_visual_baselines;
DROP POLICY IF EXISTS wos_m4_proof_owner_baseline_items_read
  ON public.wos_visual_baseline_items;
DROP POLICY IF EXISTS wos_m4_proof_owner_images_read
  ON public.wos_reference_images;
DROP POLICY IF EXISTS wos_m4_proof_owner_proofs_read
  ON public.wos_qa_verified_image_proofs;
DROP POLICY IF EXISTS wos_m4_proof_owner_receipts_read
  ON public.wos_qa_p2_m2_receipts;

REVOKE ALL ON TABLE
  public.profiles,
  public.wos_production_orders,
  public.wos_visual_baselines,
  public.wos_visual_baseline_items,
  public.wos_reference_images,
  public.wos_qa_verified_image_proofs,
  public.wos_qa_p2_m2_receipts
FROM wos_m4_proof_verifier_owner;
REVOKE EXECUTE ON FUNCTION public.wos_qa_p2_m2_spec_digest(uuid)
FROM wos_m4_proof_verifier_owner;
REVOKE EXECUTE ON FUNCTION public.wos_qa_m4_current_user_id()
FROM wos_m4_proof_verifier_owner;
REVOKE USAGE ON SCHEMA public
FROM wos_m4_proof_verifier_owner;

DROP FUNCTION IF EXISTS public.wos_qa_m4_current_user_id();
DROP ROLE IF EXISTS wos_m4_proof_verifier_owner;

DO $rollback_postcheck$
BEGIN
  IF pg_catalog.to_regprocedure(
      'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
    ) IS NOT NULL
    OR pg_catalog.to_regprocedure(
      'public.wos_qa_m4_can_download_proof(text,text)'
    ) IS NOT NULL
    OR pg_catalog.to_regprocedure(
      'public.wos_qa_m4_current_user_id()'
    ) IS NOT NULL
    OR pg_catalog.to_regrole('wos_m4_proof_verifier_owner') IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies policy
      WHERE policy.policyname LIKE 'wos_m4_%'
    )
  THEN
    RAISE EXCEPTION 'M4_DB_ROLLBACK_POSTCHECK_FAILED'
      USING ERRCODE = '55000';
  END IF;
END;
$rollback_postcheck$;

COMMIT;

-- INSTALL_NOT_AUTHORIZED
