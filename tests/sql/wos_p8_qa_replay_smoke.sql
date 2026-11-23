-- WOS P8: execute the PINNED #213 QA SQL on a disposable PG17 Storage
-- metadata emulator, never on Production or on shared QA.
DO $pre$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN
   ('wos_office_readiness_receipts','wos_submission_receipts','wos_workshop_inbox',
    'wos_qa_verified_image_proofs','wos_qa_orphan_cleanup_claims');
  IF n<>5 THEN RAISE EXCEPTION 'WOS_P8_EXACT_QA_SQL_FIVE_TABLES_MISSING_%',n; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='wos-private' AND public=false)
  THEN RAISE EXCEPTION 'WOS_P8_PRIVATE_BUCKET_MISSING'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage'
    AND tablename='objects' AND policyname='wos_p7_storage_reader_roles'
    AND permissive='RESTRICTIVE')
  THEN RAISE EXCEPTION 'WOS_P8_STORAGE_VIEWER_RLS_MISSING'; END IF;
  IF has_table_privilege('authenticated','public.wos_qa_verified_image_proofs','INSERT')
  OR has_table_privilege('authenticated','public.wos_qa_orphan_cleanup_claims','INSERT')
  OR has_function_privilege('authenticated',
    'public.wos_qa_get_storage_object_for_proof(text)','EXECUTE')
  THEN RAISE EXCEPTION 'WOS_P8_PROOF_OR_CLEANUP_IS_PUBLICLY_MUTABLE'; END IF;
END $pre$;

SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
-- Direct PostgREST RPC without server-issued binary proof must FAIL
DO $negative$
DECLARE failed boolean:=false;
BEGIN
 BEGIN
  PERFORM public.wos_register_uploaded_reference_image(
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   '99999999-9999-9999-9999-999999999999',
   'PRODUCT',
   'organizations/aaaaaaaa-1111-1111-1111-111111111111/wos/production-order/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/images/product/versions/V1/99999999-9999-9999-9999-999999999999/qa-preview-proof.png'
  );
 EXCEPTION WHEN insufficient_privilege THEN failed:=true;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'DIRECT_RPC_BYPASSED_TRUSTED_PROOF'; END IF;
END $negative$;
RESET ROLE;

-- Synthetic metadata assertion only: this row does NOT represent real bytes.
-- It simulates the effect of the separately deployed QA Edge byte validator.
INSERT INTO public.wos_qa_verified_image_proofs(
 image_id,organization_id,order_id,actor_user_id,storage_path,
 storage_object_id,storage_object_version,storage_object_updated_at,
 verified_sha256,expires_at
)
SELECT
 '99999999-9999-9999-9999-999999999999',
 'aaaaaaaa-1111-1111-1111-111111111111',
 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
 '11111111-1111-1111-1111-111111111111',name,id,version,updated_at,
 repeat('a',64),now()+interval '10 minutes'
FROM storage.objects WHERE id='ffffffff-ffff-ffff-ffff-ffffffffffff';

SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
DO $submit$
DECLARE registered jsonb; receipt uuid; submitted jsonb; replay jsonb;
BEGIN
 registered:=public.wos_register_uploaded_reference_image(
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  '99999999-9999-9999-9999-999999999999','PRODUCT',
  'organizations/aaaaaaaa-1111-1111-1111-111111111111/wos/production-order/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/images/product/versions/V1/99999999-9999-9999-9999-999999999999/qa-preview-proof.png'
 );
 IF registered->>'status'<>'CREATED'
 THEN RAISE EXCEPTION 'TRUSTED_IMAGE_REGISTER_FAILED_%',registered; END IF;
 receipt:=public.wos_confirm_office_completeness(
 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',1,'V1','Synthetic office confirmed');
 IF receipt IS NULL THEN RAISE EXCEPTION 'OFFICE_READY_MISSING'; END IF;
 submitted:=public.wos_submit_production_order(
 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',1,'V1',
 '77777777-7777-7777-7777-777777777777');
 IF submitted->>'status'<>'CREATED'
 THEN RAISE EXCEPTION 'ATOMIC_SUBMISSION_FAILED_%',submitted; END IF;
 replay:=public.wos_submit_production_order(
 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',1,'V1',
 '77777777-7777-7777-7777-777777777777');
 IF replay->>'status'<>'REPLAYED'
 OR replay->>'receiptId'<>submitted->>'receiptId'
 THEN RAISE EXCEPTION 'IDEMPOTENT_REPLAY_FAILED_%',replay; END IF;
 IF (SELECT count(*) FROM public.wos_workshop_inbox)<>1
 OR (SELECT count(*) FROM public.wos_submission_receipts)<>1
 THEN RAISE EXCEPTION 'ATOMIC_INBOX_RECEIPT_CARDINALITY'; END IF;
END $submit$;
RESET ROLE;

SET request.jwt.claim.sub='44444444-4444-4444-4444-444444444444';
SET ROLE authenticated;
DO $operator$
BEGIN
 IF (SELECT count(*) FROM public.wos_workshop_inbox)<>1
 OR (SELECT count(*) FROM public.wos_submission_receipts)<>1
 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private')<>1
 THEN RAISE EXCEPTION 'OPERATOR_CANNOT_READ_SUBMITTED_PRIVATE_OBJECT'; END IF;
END $operator$;
RESET ROLE;

SET request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
SET ROLE authenticated;
DO $viewer$
BEGIN
 IF (SELECT count(*) FROM public.wos_production_orders)<>0
 OR (SELECT count(*) FROM public.wos_workshop_inbox)<>0
 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private')<>0
 THEN RAISE EXCEPTION 'VIEWER_ACCESS_BYPASS'; END IF;
END $viewer$;
RESET ROLE;

SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
DO $foreign$
BEGIN
 IF (SELECT count(*) FROM public.wos_production_orders)<>0
 OR (SELECT count(*) FROM public.wos_workshop_inbox)<>0
 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private')<>0
 THEN RAISE EXCEPTION 'FOREIGN_ORG_STORAGE_OR_ORDER_BYPASS'; END IF;
END $foreign$;
RESET ROLE;

-- Do not claim actual Edge byte verification: only prior protected QA browser
-- logs contain live binary upload/download proof. No delete or forced ageing.
\echo WOS_P8_PINNED_QA_P7_SQL_REPLAY=PASS
\echo WOS_P8_PINNED_QA_DIRECT_RPC_BYPASS_DENIED=PASS
\echo WOS_P8_PINNED_QA_ATOMIC_RECEIPT_INBOX_REPLAY=PASS
\echo WOS_P8_PINNED_QA_STORAGE_METADATA_RLS=PASS
\echo WOS_P8_PINNED_QA_BINARY_EDGE_HTTP=NOT_RUN
\echo WOS_P8_PINNED_QA_PRODUCTION_CLONE=NOT_RUN
