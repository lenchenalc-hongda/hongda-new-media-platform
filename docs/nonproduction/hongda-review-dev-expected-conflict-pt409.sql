-- ISOLATED TEST DATABASE ONLY: hongda-review-dev (xulmpqaknlwqqculbsek)
-- Repair intentional application conflicts: SQLSTATE 40001 is reserved for a
-- real serialization_failure and causes repeated PostgREST retries in v14.
-- For expected idempotency/version conflicts PostgREST maps PT409 to HTTP 409.
-- Fail-closed checks; neither the Production database nor unrelated functions
-- are targeted. Permissions and SECURITY DEFINER/search_path are preserved.
DO $qa_conflicts$
DECLARE
  glh_ddl text;
  wos_ddl text;
  glh_old text := 'ERRCODE = ''40001''';
  wos_old text := 'ERRCODE=''40001''';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id='0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid
  ) OR NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id='fbdb0989-ae25-4ba4-92f9-3266cc845977'::uuid
  ) THEN
    RAISE EXCEPTION 'ISOLATED_REVIEW_DEV_ORGANIZATION_GUARD_FAILED';
  END IF;

  SELECT pg_get_functiondef(
    'public.glh_create_manual_production_lead(uuid,text,text,text,text,text,text,uuid,text,text,text,text,text)'::regprocedure
  ) INTO glh_ddl;
  SELECT pg_get_functiondef(
    'public.wos_submit_production_order(uuid,integer,text,uuid)'::regprocedure
  ) INTO wos_ddl;

  IF glh_ddl IS NULL OR wos_ddl IS NULL
    OR (length(glh_ddl)-length(replace(glh_ddl,glh_old,''))) <> length(glh_old)
    OR (length(wos_ddl)-length(replace(wos_ddl,wos_old,''))) <> 2*length(wos_old)
    OR position('IDEMPOTENCY_CONFLICT' IN glh_ddl)=0
    OR position('VERSION_CONFLICT' IN wos_ddl)=0
    OR position('CONCURRENT_VERSION_CHANGE' IN wos_ddl)=0
  THEN
    RAISE EXCEPTION 'EXPECTED_FUNCTION_SOURCE_OR_CONFLICT_COUNTS_CHANGED';
  END IF;

  EXECUTE replace(glh_ddl, glh_old, 'ERRCODE = ''PT409''');
  EXECUTE replace(wos_ddl, wos_old, 'ERRCODE=''PT409''');
END;
$qa_conflicts$;
