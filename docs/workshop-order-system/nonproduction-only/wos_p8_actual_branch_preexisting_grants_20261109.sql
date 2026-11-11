-- WOS P8 real development BRANCH ONLY: align three pre-existing Production
-- privilege grants; no original Production or shared QA access changes.
-- Do not put this in deployable supabase/migrations.
BEGIN;
DO $wos_p8_guard$
BEGIN
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>0
    OR (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')<>67
    OR (SELECT count(*) FROM auth.users)<>0
    OR (SELECT count(*) FROM public.organizations)<>0
    OR (SELECT count(*) FROM public.profiles)<>0
    OR (SELECT count(*) FROM storage.objects)<>0
    OR (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'wos_%')<>0
    OR (SELECT relrowsecurity FROM pg_class WHERE oid='public.profiles'::regclass) IS NOT TRUE
    OR (SELECT relrowsecurity FROM pg_class WHERE oid='public.review_dict_items'::regclass) IS NOT TRUE
    OR has_table_privilege('authenticated','public.profiles','SELECT')
    OR has_table_privilege('authenticated','public.review_dict_items','SELECT')
    OR has_function_privilege('service_role','public.review_event_actor_directory(uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'WOS_P8_EMPTY_BRANCH_ONLY_EXACT_ROLE_DELTA'; END IF;
END $wos_p8_guard$;
GRANT SELECT ON TABLE public.profiles,public.review_dict_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_event_actor_directory(uuid,text) TO service_role;
COMMIT;
