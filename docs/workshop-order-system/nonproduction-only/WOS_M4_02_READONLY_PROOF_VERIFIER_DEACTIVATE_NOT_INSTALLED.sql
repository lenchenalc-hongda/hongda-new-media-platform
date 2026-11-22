-- WOS M4-02 ROLLBACK STEP 1: CLOSE AUTHENTICATED EXECUTE
-- INSTALL_NOT_AUTHORIZED
--
-- This phase runs before any storage policy removal. It immediately removes
-- the two authenticated EXECUTE grants while leaving the policy definitions
-- intact for a separately owned rollback phase.

BEGIN;

DO $deactivate_preflight$
DECLARE
  v_is_disposable boolean :=
    pg_catalog.current_database() ~ '^wos_m4_02_pg17_'
    AND pg_catalog.to_regclass('tests.wos_m4_pg17_context') IS NOT NULL;
BEGIN
  IF v_is_disposable IS NOT TRUE AND CURRENT_USER <> 'postgres' THEN
    RAISE EXCEPTION 'M4_DEACTIVATE_INSTALLER_ROLE_INVALID'
      USING ERRCODE = '55000';
  END IF;
  IF pg_catalog.to_regprocedure(
      'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'public.wos_qa_m4_can_download_proof(text,text)'
    ) IS NULL
    OR pg_catalog.pg_has_role(
      CURRENT_USER,
      'wos_m4_proof_verifier_owner',
      'SET'
    )
  THEN
    RAISE EXCEPTION 'M4_DEACTIVATE_BASELINE_INVALID'
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
    RAISE EXCEPTION 'M4_DEACTIVATE_ADMIN_HANDOFF_MISSING'
      USING ERRCODE = '55000';
  END IF;
END;
$deactivate_preflight$;

GRANT wos_m4_proof_verifier_owner TO CURRENT_USER WITH SET TRUE;
SET LOCAL ROLE wos_m4_proof_verifier_owner;
REVOKE EXECUTE ON FUNCTION
  public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)
FROM authenticated;
REVOKE EXECUTE ON FUNCTION
  public.wos_qa_m4_can_download_proof(text,text)
FROM authenticated;
RESET ROLE;
REVOKE wos_m4_proof_verifier_owner
FROM CURRENT_USER GRANTED BY CURRENT_USER;

DO $deactivate_postcheck$
BEGIN
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
    RAISE EXCEPTION 'M4_DEACTIVATE_POSTCHECK_FAILED'
      USING ERRCODE = '55000';
  END IF;
END;
$deactivate_postcheck$;

COMMIT;

-- INSTALL_NOT_AUTHORIZED
