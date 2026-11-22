-- WOS M4-02 ROLLBACK STEP 3: DATABASE OBJECT CLEANUP
-- INSTALL_NOT_AUTHORIZED
--
-- Execute only after:
--   1. authenticated EXECUTE has been closed by the deactivation phase; and
--   2. the storage.objects owner removed both M4 Storage policies.
-- This file drops only Phase 1 database objects. It never drops a business
-- table or deletes Proof, Receipt, image, baseline or order history.

BEGIN;

DO $rollback_preflight$
DECLARE
  v_membership_count integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname IN (
        'wos_m4_proof_owner_storage_read',
        'wos_m4_proof_verifier_storage_read'
      )
  ) THEN
    RAISE EXCEPTION 'M4_DB_ROLLBACK_STORAGE_PHASE_STILL_PRESENT'
      USING ERRCODE = '55000';
  END IF;

  IF pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_qa_m4_can_download_proof(text,text)',
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
      SELECT p.proowner
      FROM pg_catalog.pg_proc p
      WHERE p.oid = pg_catalog.to_regprocedure(
        'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
      )
    )) <> 'wos_m4_proof_verifier_owner'
  THEN
    RAISE EXCEPTION 'M4_ROLLBACK_SNAPSHOT_OWNER_MISMATCH'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.to_regprocedure(
      'public.wos_qa_m4_can_download_proof(text,text)'
    ) IS NOT NULL
    AND pg_catalog.pg_get_userbyid((
      SELECT p.proowner
      FROM pg_catalog.pg_proc p
      WHERE p.oid = pg_catalog.to_regprocedure(
        'public.wos_qa_m4_can_download_proof(text,text)'
      )
    )) <> 'wos_m4_proof_verifier_owner'
  THEN
    RAISE EXCEPTION 'M4_ROLLBACK_GUARD_OWNER_MISMATCH'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.to_regprocedure(
      'public.wos_qa_m4_current_user_id()'
    ) IS NOT NULL
    AND (
      pg_catalog.pg_get_userbyid((
        SELECT p.proowner
        FROM pg_catalog.pg_proc p
        WHERE p.oid = pg_catalog.to_regprocedure(
          'public.wos_qa_m4_current_user_id()'
        )
      )) <> CURRENT_USER
      OR pg_catalog.obj_description((
        SELECT p.oid
        FROM pg_catalog.pg_proc p
        WHERE p.oid = pg_catalog.to_regprocedure(
          'public.wos_qa_m4_current_user_id()'
        )
      ), 'pg_proc') <> 'WOS_M4_02_PRIVATE_CALLER_UID_BRIDGE_V1'
    )
  THEN
    RAISE EXCEPTION 'M4_ROLLBACK_CALLER_BRIDGE_MISMATCH'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles role
    WHERE role.rolname = 'wos_m4_proof_verifier_owner'
  ) THEN
    IF pg_catalog.shobj_description(
        (SELECT role.oid
         FROM pg_catalog.pg_roles role
         WHERE role.rolname = 'wos_m4_proof_verifier_owner'),
        'pg_authid'
      ) <> 'WOS_M4_02_READONLY_PROOF_VERIFIER_OWNER_V1'
    THEN
      RAISE EXCEPTION 'M4_ROLLBACK_OWNER_ROLE_IDENTITY_MISMATCH'
        USING ERRCODE = '42501';
    END IF;

    SELECT pg_catalog.count(*)::integer
      INTO v_membership_count
    FROM pg_catalog.pg_auth_members membership
    WHERE membership.member = CURRENT_USER::regrole
      AND membership.roleid = 'wos_m4_proof_verifier_owner'::regrole
      AND membership.admin_option IS TRUE
      AND membership.inherit_option IS FALSE
      AND membership.set_option IS FALSE;
    IF v_membership_count <> 1 THEN
      RAISE EXCEPTION 'M4_ROLLBACK_ADMIN_HANDOFF_MISSING'
        USING ERRCODE = '55000';
    END IF;
  END IF;
END;
$rollback_preflight$;

GRANT wos_m4_proof_verifier_owner TO CURRENT_USER WITH SET TRUE;
SET LOCAL ROLE wos_m4_proof_verifier_owner;
DROP FUNCTION IF EXISTS
  public.wos_qa_m4_can_download_proof(text,text);
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
  public.wos_qa_p2_m2_receipts,
  storage.objects
FROM wos_m4_proof_verifier_owner;
REVOKE EXECUTE ON FUNCTION public.wos_qa_p2_m2_spec_digest(uuid)
FROM wos_m4_proof_verifier_owner;
REVOKE EXECUTE ON FUNCTION public.wos_qa_m4_current_user_id()
FROM wos_m4_proof_verifier_owner;
REVOKE USAGE ON SCHEMA public, storage
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
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles role
      WHERE role.rolname = 'wos_m4_proof_verifier_owner'
    )
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
