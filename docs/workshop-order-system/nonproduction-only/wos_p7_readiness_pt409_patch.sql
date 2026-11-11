-- hongda-review-dev only. Applied AFTER wos_p7_atomic_submission.sql.
-- SQLSTATE 40001 is reserved for actual serialization failures, not stale
-- order revisions. PostgREST v14 may retry 40001 indefinitely.
-- Change only the intentional stale-edit error to HTTP 409 (PT409).
DO $qa_patch$
DECLARE
  original text;
  expected text := 'ERRCODE=''40001''';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id='0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid
  ) THEN
    RAISE EXCEPTION 'REVIEW_DEV_GUARD_FAILED';
  END IF;
  SELECT pg_get_functiondef(
    'public.wos_confirm_office_completeness(uuid,integer,text,text)'::regprocedure
  ) INTO original;
  IF original IS NULL
     OR position('STALE_OR_UNEDITABLE_ORDER' IN original)=0
     OR (length(original)-length(replace(original,expected,''))) <> length(expected)
  THEN
    RAISE EXCEPTION 'READINESS_SOURCE_CHANGED_REVIEW_REQUIRED';
  END IF;
  EXECUTE replace(original,expected,'ERRCODE=''PT409''');
END;
$qa_patch$;
