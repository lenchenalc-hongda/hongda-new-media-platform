-- Transactional WOS P8 schema-only cleanup for disposable CI.
-- On a real Supabase branch Storage buckets must be deleted via official Storage API,
-- never with DELETE FROM storage.buckets or storage.objects.
BEGIN;
DO $gate$ BEGIN
 IF current_database()<>'wos_p8_replay_ci'
 THEN RAISE EXCEPTION 'P8_DISPOSABLE_CI_ONLY'; END IF;
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='wos-private')
 THEN RAISE EXCEPTION 'P8_BINARY_OBJECTS_PRESENT'; END IF;
END $gate$;
DROP POLICY wos_p8_private_insert ON storage.objects;
DROP POLICY wos_p8_private_select ON storage.objects;
DROP FUNCTION public.wos_confirm_office_completeness(uuid,integer,text,text) RESTRICT;
DROP FUNCTION public.wos_submit_production_order(uuid,integer,text,uuid) RESTRICT;
DROP FUNCTION public.wos_p7_service_storage_snapshot(text) RESTRICT;
DROP FUNCTION public.wos_register_uploaded_reference_image(uuid,uuid,text,text) RESTRICT;
DROP FUNCTION public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text) RESTRICT;
DROP FUNCTION public.wos_p7_claim_orphan_cleanup(uuid,uuid,uuid,integer) RESTRICT;
DROP FUNCTION public.wos_p7_predelete_orphan(uuid,uuid) RESTRICT;
DROP FUNCTION public.wos_p7_finish_orphan_cleanup(uuid,uuid,boolean,text) RESTRICT;
DROP FUNCTION public.wos_p7_release_expired_claims(integer) RESTRICT;
DROP TABLE
 public.wos_orphan_cleanup_claims,
 public.wos_verified_image_proofs,
 public.wos_workshop_inbox,
 public.wos_submission_receipts,
 public.wos_office_readiness_receipts,
 public.wos_status_history,
 public.wos_sampling_technical_records,
 public.wos_confirmations,
 public.wos_blockers,
 public.wos_visual_baseline_items,
 public.wos_visual_baselines,
 public.wos_reference_images,
 public.wos_resource_readiness,
 public.wos_sampling_requests,
 public.wos_production_orders
RESTRICT;
DO $assert$ DECLARE t integer; f integer; p integer;
BEGIN
 SELECT count(*) INTO t FROM information_schema.tables
 WHERE table_schema='public' AND table_type='BASE TABLE';
 SELECT count(*) INTO f FROM pg_proc x JOIN pg_namespace n ON n.oid=x.pronamespace
 WHERE n.nspname='public' AND x.proname LIKE 'wos_%';
 SELECT count(*) INTO p FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
 AND policyname LIKE 'wos_%';
 IF t<>67 OR f<>0 OR p<>0
 THEN RAISE EXCEPTION 'P8_ROLLBACK_PARITY_FAILED tables=%,functions=%,storage_policies=%',t,f,p; END IF;
END $assert$;
COMMIT;
\echo WOS_P8_P07_SCHEMA_ROLLBACK_67_TABLES=PASS
