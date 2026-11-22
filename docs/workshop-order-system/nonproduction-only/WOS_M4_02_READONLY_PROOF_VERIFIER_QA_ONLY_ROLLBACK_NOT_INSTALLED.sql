-- WOS M4-02 READ-ONLY PRIVATE PROOF VERIFIER ROLLBACK / NOT INSTALLED
-- INSTALL_NOT_AUTHORIZED
--
-- Drops only the verifier function, owner-only policies, owner grants and the
-- dedicated NOLOGIN role introduced by the forward draft. It never drops a
-- business table or deletes Proof, Receipt, image, baseline or order history.

BEGIN;

DO $rollback_preflight$
DECLARE
  v_function_owner text;
  v_function_comment text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner),
         pg_catalog.obj_description(p.oid, 'pg_proc')
    INTO v_function_owner, v_function_comment
  FROM pg_catalog.pg_proc p
  WHERE p.oid = pg_catalog.to_regprocedure(
    'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
  );

  IF FOUND THEN
    IF v_function_owner <> 'wos_m4_proof_verifier_owner'
      OR v_function_comment <>
         'WOS_M4_02_READONLY_PROOF_VERIFIER_SNAPSHOT_V1'
    THEN
      RAISE EXCEPTION 'M4_ROLLBACK_FUNCTION_IDENTITY_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT pg_catalog.pg_get_userbyid(p.proowner),
         pg_catalog.obj_description(p.oid, 'pg_proc')
    INTO v_function_owner, v_function_comment
  FROM pg_catalog.pg_proc p
  WHERE p.oid = pg_catalog.to_regprocedure(
    'public.wos_qa_m4_can_download_proof(text,text)'
  );

  IF FOUND THEN
    IF v_function_owner <> 'wos_m4_proof_verifier_owner'
      OR v_function_comment <>
         'WOS_M4_02_READONLY_PROOF_DOWNLOAD_GUARD_V1'
    THEN
      RAISE EXCEPTION 'M4_ROLLBACK_DOWNLOAD_GUARD_IDENTITY_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
             WHERE rolname = 'wos_m4_proof_verifier_owner')
    AND pg_catalog.shobj_description(
      (SELECT oid FROM pg_catalog.pg_roles
       WHERE rolname = 'wos_m4_proof_verifier_owner'),
      'pg_authid'
    ) IS DISTINCT FROM 'WOS_M4_02_READONLY_PROOF_VERIFIER_OWNER_V1'
  THEN
    RAISE EXCEPTION 'M4_ROLLBACK_OWNER_ROLE_IDENTITY_MISMATCH'
      USING ERRCODE = '42501';
  END IF;
END;
$rollback_preflight$;

DROP POLICY IF EXISTS wos_m4_proof_verifier_storage_read
  ON storage.objects;

DO $drop_function$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.wos_qa_m4_can_download_proof(text,text)'
  ) IS NOT NULL THEN
    EXECUTE
      'DROP FUNCTION public.wos_qa_m4_can_download_proof(text,text)';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
  ) IS NOT NULL THEN
    EXECUTE
      'DROP FUNCTION public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)';
  END IF;
END;
$drop_function$;

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
DROP POLICY IF EXISTS wos_m4_proof_owner_storage_read ON storage.objects;

DO $revoke_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
             WHERE rolname = 'wos_m4_proof_verifier_owner') THEN
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

    REVOKE EXECUTE ON FUNCTION auth.uid()
      FROM wos_m4_proof_verifier_owner;
    REVOKE USAGE ON SCHEMA public, auth, storage
      FROM wos_m4_proof_verifier_owner;

    DROP ROLE wos_m4_proof_verifier_owner;
  END IF;
END;
$revoke_owner$;

COMMIT;

-- INSTALL_NOT_AUTHORIZED: rollback is also a separate database operation and
-- must be authorized against the exact installed forward SQL fingerprint.
