-- Disposable PG17 only: P7 structural assertions and true RLS role tests.
DO $assert$
DECLARE n integer; r integer; bad integer;
BEGIN
 SELECT count(*) INTO n FROM information_schema.tables WHERE table_schema='public'
   AND table_name IN ('wos_office_readiness_receipts','wos_submission_receipts',
                      'wos_workshop_inbox','wos_verified_image_proofs','wos_orphan_cleanup_claims');
 IF n <> 5 THEN RAISE EXCEPTION 'P7_INCREMENTAL_TABLE_COUNT_%',n; END IF;
 SELECT count(*) INTO r FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
 WHERE ns.nspname='public' AND c.relname IN
 ('wos_office_readiness_receipts','wos_submission_receipts','wos_workshop_inbox',
  'wos_verified_image_proofs','wos_orphan_cleanup_claims') AND c.relrowsecurity;
 IF r <> 5 THEN RAISE EXCEPTION 'P7_INCREMENTAL_RLS_%',r; END IF;
 SELECT count(*) INTO bad FROM information_schema.role_table_grants
 WHERE table_schema='public'
 AND table_name IN ('wos_office_readiness_receipts','wos_submission_receipts',
  'wos_workshop_inbox','wos_verified_image_proofs','wos_orphan_cleanup_claims')
 AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE');
 IF bad<>0 THEN RAISE EXCEPTION 'CLIENT_MUTATION_PRIVILEGE_%',bad; END IF;
 IF has_table_privilege('authenticated','public.wos_verified_image_proofs','INSERT')
 OR has_table_privilege('authenticated','public.wos_orphan_cleanup_claims','UPDATE')
 THEN RAISE EXCEPTION 'CLIENT_PRIVILEGED_PROOF_OR_CLAIM'; END IF;
END $assert$;

INSERT INTO public.organizations (id) VALUES
('aaaaaaaa-1111-1111-1111-111111111111'),
('bbbbbbbb-2222-2222-2222-222222222222');
INSERT INTO public.profiles(id,user_id,org_id,role,is_active) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','aaaaaaaa-1111-1111-1111-111111111111','admin',true),
('cccccccc-cccc-cccc-cccc-cccccccccccc','33333333-3333-3333-3333-333333333333','aaaaaaaa-1111-1111-1111-111111111111','viewer',true),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','bbbbbbbb-2222-2222-2222-222222222222','admin',true),
('dddddddd-dddd-dddd-dddd-dddddddddddd','44444444-4444-4444-4444-444444444444','aaaaaaaa-1111-1111-1111-111111111111','operator',true);

INSERT INTO public.wos_production_orders (
 organization_id,customer_name_snapshot,order_number,product_name,
 sales_owner_profile_id,project_owner_profile_id,priority,version_label,
 requested_quantity,current_batch_quantity,product_material,created_by_profile_id
) VALUES (
 'aaaaaaaa-1111-1111-1111-111111111111','QA SYNTHETIC','WOS-P8-EPHEMERAL-P7','Synthetic Film',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 'LOW','V1',10,10,'SYNTHETIC','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

DO $seed$
DECLARE oid uuid; rid uuid;
BEGIN
 SELECT id INTO oid FROM public.wos_production_orders WHERE order_number='WOS-P8-EPHEMERAL-P7';
 INSERT INTO public.wos_office_readiness_receipts
 (organization_id,order_id,source_revision,source_version_label,actor_profile_id,note)
 VALUES ('aaaaaaaa-1111-1111-1111-111111111111',oid,1,'V1',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Synthetic readiness approval');
 INSERT INTO public.wos_submission_receipts
 (organization_id,order_id,source_revision,source_version_label,idempotency_key,
 actor_profile_id,request_fingerprint)
 VALUES ('aaaaaaaa-1111-1111-1111-111111111111',oid,1,'V1',
 '77777777-7777-7777-7777-777777777777','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 repeat('a',64)) RETURNING id INTO rid;
 INSERT INTO public.wos_workshop_inbox
 (organization_id,order_id,submission_id,source_revision,source_version_label)
 VALUES ('aaaaaaaa-1111-1111-1111-111111111111',oid,rid,1,'V1');
 INSERT INTO public.wos_verified_image_proofs
 (image_id,organization_id,order_id,actor_user_id,storage_path,storage_object_id,
 storage_object_updated_at,verified_sha256,expires_at)
 VALUES ('66666666-6666-6666-6666-666666666666','aaaaaaaa-1111-1111-1111-111111111111',
 oid,'11111111-1111-1111-1111-111111111111','synthetic/path',
 '55555555-5555-5555-5555-555555555555',now(),repeat('b',64),now()+interval '15 minutes');
 INSERT INTO public.wos_orphan_cleanup_claims
 (storage_object_id,storage_path,order_id,organization_id,object_updated_at,claim_token,
 state,lease_expires_at)
 VALUES ('55555555-5555-5555-5555-555555555555','synthetic/path',oid,
 'aaaaaaaa-1111-1111-1111-111111111111',now(),
 '88888888-8888-8888-8888-888888888888','CLAIMED',now()+interval '5 minutes');
END $seed$;

SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
DO $admin$
BEGIN
 IF (SELECT count(*) FROM public.wos_office_readiness_receipts)<>1
 OR (SELECT count(*) FROM public.wos_submission_receipts)<>1
 OR (SELECT count(*) FROM public.wos_workshop_inbox)<>1
 OR (SELECT count(*) FROM public.wos_production_orders)<>1
 THEN RAISE EXCEPTION 'SAME_ORG_ADMIN_READER_FAILED'; END IF;
END $admin$;
RESET ROLE;

SET request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
SET ROLE authenticated;
DO $operator$
BEGIN
 IF (SELECT count(*) FROM public.wos_workshop_inbox)<>1
 OR (SELECT count(*) FROM public.wos_submission_receipts)<>1
 THEN RAISE EXCEPTION 'OPERATOR_READ_FAILED'; END IF;
END $operator$;
RESET ROLE;

SET request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
SET ROLE authenticated;
DO $viewer$
BEGIN
 IF (SELECT count(*) FROM public.wos_production_orders)<>0
 OR (SELECT count(*) FROM public.wos_office_readiness_receipts)<>0
 OR (SELECT count(*) FROM public.wos_submission_receipts)<>0
 OR (SELECT count(*) FROM public.wos_workshop_inbox)<>0
 THEN RAISE EXCEPTION 'SAME_ORG_VIEWER_ACCESS_BYPASS'; END IF;
END $viewer$;
RESET ROLE;

SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
DO $foreign$
BEGIN
 IF (SELECT count(*) FROM public.wos_production_orders)<>0
 OR (SELECT count(*) FROM public.wos_office_readiness_receipts)<>0
 OR (SELECT count(*) FROM public.wos_submission_receipts)<>0
 OR (SELECT count(*) FROM public.wos_workshop_inbox)<>0
 THEN RAISE EXCEPTION 'FOREIGN_ORG_ACCESS_BYPASS'; END IF;
END $foreign$;
RESET ROLE;

-- Negative constraints use SAVEPOINTs, so expected errors cannot mask a failed job.
BEGIN;
SAVEPOINT invalid_proof;
DO $proof$
DECLARE oid uuid; failed boolean := false;
BEGIN
 SELECT id INTO oid FROM public.wos_production_orders LIMIT 1;
 BEGIN
 INSERT INTO public.wos_verified_image_proofs
 (image_id,organization_id,order_id,actor_user_id,storage_path,
  storage_object_id,storage_object_updated_at,verified_sha256,expires_at)
 VALUES ('99999999-9999-9999-9999-999999999999',
 'aaaaaaaa-1111-1111-1111-111111111111',oid,
 '11111111-1111-1111-1111-111111111111','invalid',
 '99999999-9999-9999-9999-999999999999',now(),'notsha',now()+interval '15 minutes');
 EXCEPTION WHEN check_violation THEN failed:=true;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'INVALID_SHA_ACCEPTED'; END IF;
END $proof$;
ROLLBACK TO SAVEPOINT invalid_proof;
SAVEPOINT invalid_lease;
DO $lease$
DECLARE oid uuid; failed boolean := false;
BEGIN
 SELECT id INTO oid FROM public.wos_production_orders LIMIT 1;
 BEGIN
 INSERT INTO public.wos_orphan_cleanup_claims
 (storage_object_id,storage_path,order_id,organization_id,object_updated_at,
 claim_token,state,lease_expires_at)
 VALUES ('99999999-9999-9999-9999-999999999999','bad-lease',oid,
 'aaaaaaaa-1111-1111-1111-111111111111',now(),
 'aaaaaaaa-2222-2222-2222-222222222222','CLAIMED',now()+interval '1 hour');
 EXCEPTION WHEN check_violation THEN failed:=true;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'OVERLONG_LEASE_ACCEPTED'; END IF;
END $lease$;
ROLLBACK TO SAVEPOINT invalid_lease;
ROLLBACK;
\echo WOS_P8_P7_FIVE_INCREMENTAL_TABLES=PASS
\echo WOS_P8_P7_RLS_AND_NO_CLIENT_MUTATION=PASS
\echo WOS_P8_P7_SAME_ORG_OPERATOR_VIEWER_FOREIGN_ORG=PASS
\echo WOS_P8_P7_INVALID_PROOF_AND_LEASE_REJECTED=PASS
\echo WOS_P8_P7_STORAGE_EDGE_RPC=NOT_RUN
\echo WOS_P8_P7_PRODUCTION_COMPATIBILITY=NOT_VERIFIED
