-- WOS M4-02 PHASE 2 OF 2: ATOMIC AUTHENTICATED EXECUTE ACTIVATION
-- ARCHITECTURE_STATUS=OFFICE_ONLY_INFEASIBLE_FAIL_CLOSED
-- INSTALL_NOT_AUTHORIZED
--
-- This phase opens only the safe snapshot DTO. It creates no Storage policy,
-- grants no direct Proof/Receipt table access and does not expose the private
-- caller-UID bridge. The caller's existing Storage RLS remains unchanged.

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
      'public.wos_qa_m4_current_user_id()'
    ) IS NULL
    OR NOT EXISTS (
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
        ) = '22d0f4b09891414be8dfb7353b97bac95f259a450ed697ee8528631b595a9361'
    )
    OR NOT EXISTS (
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
    )
  THEN
    RAISE EXCEPTION 'M4_ACTIVATION_FUNCTION_BASELINE_INVALID'
      USING ERRCODE = '55000';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname IN (
        'wos_p7_private_object_select',
        'wos_p7_storage_reader_roles'
      )
  ) <> 2
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'storage'
        AND relation.relname = 'objects'
        AND pg_catalog.has_table_privilege(
          'authenticated',
          relation.oid,
          'SELECT'
        )
    )
  THEN
    RAISE EXCEPTION 'M4_EXISTING_P7_STORAGE_RLS_MISSING'
      USING ERRCODE = '55000';
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
    RAISE EXCEPTION 'M4_ACTIVATION_STORAGE_POLICY_PATH_PRESENT'
      USING ERRCODE = '55000';
  END IF;

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

-- INSTALL_NOT_AUTHORIZED: authenticated direct-RPC access becomes immediate
-- after this transaction and requires a separate exact-SQL Owner authorization.
