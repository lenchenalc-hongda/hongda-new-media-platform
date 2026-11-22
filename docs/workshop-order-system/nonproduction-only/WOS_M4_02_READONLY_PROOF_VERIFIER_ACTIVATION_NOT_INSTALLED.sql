-- WOS M4-02 PHASE 3 OF 3: ATOMIC AUTHENTICATED EXECUTE ACTIVATION
-- INSTALL_NOT_AUTHORIZED
--
-- This phase is the first point at which an authenticated QA user can invoke
-- the read-only RPC or use the Storage guard through PostgREST. It must run
-- only after Phase 1 and the storage-owner Phase 2 both pass catalog readback.

BEGIN;

DO $activation_preflight$
DECLARE
  v_is_disposable boolean :=
    pg_catalog.current_database() ~ '^wos_m4_02_pg17_'
    AND pg_catalog.to_regclass('tests.wos_m4_pg17_context') IS NOT NULL;
BEGIN
  IF v_is_disposable IS NOT TRUE AND CURRENT_USER <> 'postgres' THEN
    RAISE EXCEPTION 'M4_ACTIVATION_INSTALLER_ROLE_INVALID'
      USING ERRCODE = '55000';
  END IF;

  IF pg_catalog.to_regprocedure(
      'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'public.wos_qa_m4_can_download_proof(text,text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'public.wos_qa_m4_current_user_id()'
    ) IS NULL
    OR pg_catalog.pg_get_userbyid((
      SELECT p.proowner
      FROM pg_catalog.pg_proc p
      WHERE p.oid = pg_catalog.to_regprocedure(
        'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
      )
    )) <> 'wos_m4_proof_verifier_owner'
    OR pg_catalog.pg_get_userbyid((
      SELECT p.proowner
      FROM pg_catalog.pg_proc p
      WHERE p.oid = pg_catalog.to_regprocedure(
        'public.wos_qa_m4_can_download_proof(text,text)'
      )
    )) <> 'wos_m4_proof_verifier_owner'
  THEN
    RAISE EXCEPTION 'M4_ACTIVATION_FUNCTION_BASELINE_INVALID'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid = pg_catalog.to_regprocedure(
        'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
      )
      AND pg_catalog.pg_get_userbyid(procedure.proowner) =
        'wos_m4_proof_verifier_owner'
      AND procedure.prosecdef IS TRUE
      AND procedure.proconfig IS NOT DISTINCT FROM
        ARRAY['search_path=""']::text[]
      AND pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(
          pg_catalog.pg_get_functiondef(procedure.oid),
          'UTF8'
        )),
        'hex'
      ) = '6bed433d79370f50b48be3e12c108c202343f31868c0d4eb0aa36e9eab1443f0'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid = pg_catalog.to_regprocedure(
        'public.wos_qa_m4_can_download_proof(text,text)'
      )
      AND pg_catalog.pg_get_userbyid(procedure.proowner) =
        'wos_m4_proof_verifier_owner'
      AND procedure.prosecdef IS TRUE
      AND procedure.proconfig IS NOT DISTINCT FROM
        ARRAY['search_path=""']::text[]
      AND pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(
          pg_catalog.pg_get_functiondef(procedure.oid),
          'UTF8'
        )),
        'hex'
      ) = 'c547983e9c34f03d73bad40c6c53d96b528feaf0f10e8bff324da332c30d7589'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid = pg_catalog.to_regprocedure(
        'public.wos_qa_m4_current_user_id()'
      )
      AND pg_catalog.pg_get_userbyid(procedure.proowner) = CURRENT_USER
      AND procedure.prosecdef IS TRUE
      AND procedure.proconfig IS NOT DISTINCT FROM
        ARRAY['search_path=""']::text[]
      AND pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(
          pg_catalog.pg_get_functiondef(procedure.oid),
          'UTF8'
        )),
        'hex'
      ) = 'c4bffcc159132f8018d22dcdfbf48b45421f92483b998db8e8a93ca2a689c887'
  ) THEN
    RAISE EXCEPTION 'M4_ACTIVATION_FUNCTION_FINGERPRINT_MISMATCH'
      USING ERRCODE = '55000';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname IN (
        'wos_m4_proof_owner_storage_read',
        'wos_m4_proof_verifier_storage_read'
      )
      AND policy.cmd = 'SELECT'
  ) <> 2 THEN
    RAISE EXCEPTION 'M4_ACTIVATION_STORAGE_PHASE_MISSING'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy policy
    WHERE policy.polrelid = 'storage.objects'::regclass
      AND policy.polname = 'wos_m4_proof_owner_storage_read'
      AND policy.polcmd = 'r'
      AND policy.polpermissive IS TRUE
      AND policy.polroles =
        ARRAY['wos_m4_proof_verifier_owner'::regrole::oid]
      AND pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
        = '(bucket_id = ''wos-private''::text)'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy policy
    WHERE policy.polrelid = 'storage.objects'::regclass
      AND policy.polname = 'wos_m4_proof_verifier_storage_read'
      AND policy.polcmd = 'r'
      AND policy.polpermissive IS TRUE
      AND policy.polroles = ARRAY['authenticated'::regrole::oid]
      AND pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
        = 'wos_qa_m4_can_download_proof(bucket_id, name)'
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policy policy
    WHERE policy.polrelid = 'storage.objects'::regclass
      AND policy.polname LIKE 'wos_m4_%'
  ) <> 2 THEN
    RAISE EXCEPTION 'M4_ACTIVATION_STORAGE_POLICY_MISMATCH'
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
    RAISE EXCEPTION 'M4_ACTIVATION_PRIVILEGE_ALREADY_OPEN'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members membership
    WHERE membership.member = CURRENT_USER::regrole
      AND membership.roleid = 'wos_m4_proof_verifier_owner'::regrole
      AND membership.admin_option IS TRUE
      AND membership.inherit_option IS FALSE
      AND membership.set_option IS FALSE
  ) THEN
    RAISE EXCEPTION 'M4_ACTIVATION_ADMIN_HANDOFF_MISSING'
      USING ERRCODE = '55000';
  END IF;
END;
$activation_preflight$;

GRANT wos_m4_proof_verifier_owner TO CURRENT_USER WITH SET TRUE;
SET LOCAL ROLE wos_m4_proof_verifier_owner;
GRANT EXECUTE ON FUNCTION
  public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)
TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.wos_qa_m4_can_download_proof(text,text)
TO authenticated;
RESET ROLE;
REVOKE wos_m4_proof_verifier_owner
FROM CURRENT_USER GRANTED BY CURRENT_USER;

DO $activation_postcheck$
BEGIN
  IF pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)',
      'EXECUTE'
    ) IS NOT TRUE
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_qa_m4_can_download_proof(text,text)',
      'EXECUTE'
    ) IS NOT TRUE
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_qa_m4_current_user_id()',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'anon',
      'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)',
      'EXECUTE'
    )
    OR pg_catalog.pg_has_role(
      CURRENT_USER,
      'wos_m4_proof_verifier_owner',
      'SET'
    )
  THEN
    RAISE EXCEPTION 'M4_ACTIVATION_POSTCHECK_FAILED'
      USING ERRCODE = '55000';
  END IF;
END;
$activation_postcheck$;

COMMIT;

-- INSTALL_NOT_AUTHORIZED: activation creates immediate direct-RPC access for
-- authenticated QA users and requires a separate Owner authorization.
