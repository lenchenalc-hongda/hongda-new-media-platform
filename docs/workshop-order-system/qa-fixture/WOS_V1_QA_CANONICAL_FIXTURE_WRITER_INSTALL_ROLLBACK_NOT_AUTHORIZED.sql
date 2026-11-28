-- QA ONLY / INSTALL_NOT_AUTHORIZED

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.wos_qa_canonical_fixture_manifests') IS NULL THEN
    RAISE EXCEPTION 'FIXTURE_MANIFEST_TABLE_MISSING'
      USING ERRCODE = '42P01';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.wos_qa_canonical_fixture_manifests
  ) THEN
    RAISE EXCEPTION 'FIXTURE_DATA_MUST_BE_ROLLED_BACK_BEFORE_UNINSTALL'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION
  public.wos_qa_create_canonical_v1_fixture(jsonb)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.wos_qa_rollback_canonical_v1_fixture(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS
  public.wos_qa_create_canonical_v1_fixture(jsonb);
DROP FUNCTION IF EXISTS
  public.wos_qa_rollback_canonical_v1_fixture(uuid, uuid);

DROP TABLE public.wos_qa_canonical_fixture_manifests;

COMMIT;
