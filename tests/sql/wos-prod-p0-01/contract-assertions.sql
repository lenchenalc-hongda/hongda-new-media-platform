-- Must run only in a disposable PG17 DB with synthetic-foundation + draft foundation + P0-01 proposal.
\set ON_ERROR_STOP on
DO $check$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
 WHERE ns.nspname='public' AND c.relname IN (
 'wos_office_readiness_receipts','wos_submission_receipts','wos_workshop_inbox',
 'wos_operator_action_receipts','wos_office_revision_receipts','wos_operator_review_receipts'
 ) AND c.relkind='r';
 IF n<>6 THEN RAISE EXCEPTION 'FAILED_EXPECTED_SIX_MVP_RECEIPT_TABLES: %',n; END IF;
 IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND c.relname LIKE 'wos_%receipts' AND NOT c.relrowsecurity) THEN
  RAISE EXCEPTION 'FAILED_MVP_MISSING_RLS';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND c.relname IN (
   'wos_office_readiness_receipts','wos_submission_receipts','wos_workshop_inbox',
   'wos_operator_action_receipts','wos_office_revision_receipts','wos_operator_review_receipts')
  AND (has_table_privilege('anon',c.oid,'SELECT')
       OR has_table_privilege('authenticated',c.oid,'INSERT')
       OR has_table_privilege('authenticated',c.oid,'UPDATE')
       OR has_table_privilege('authenticated',c.oid,'DELETE'))) THEN
   RAISE EXCEPTION 'FAILED_MVP_EXCESSIVE_GRANTS';
 END IF;
 IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'wos_qa_%')
   THEN RAISE EXCEPTION 'FAILED_QA_OBJECT_PRESENT'; END IF;
END $check$;

INSERT INTO public.organizations(id,name) VALUES
 ('aaaaaaaa-0000-4000-8000-000000000001','Synthetic Org A'),
 ('bbbbbbbb-0000-4000-8000-000000000002','Synthetic Org B');
INSERT INTO public.profiles(id,user_id,org_id,role,is_active) VALUES
 ('11111111-0000-4000-8000-000000000001','21111111-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','sales',true),
 ('11111111-0000-4000-8000-000000000002','21111111-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000002','sales',true),
 ('11111111-0000-4000-8000-000000000003','21111111-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000001','viewer',true),
 ('11111111-0000-4000-8000-000000000004','21111111-0000-4000-8000-000000000004','aaaaaaaa-0000-4000-8000-000000000001','operator',true);
INSERT INTO public.cpc_customer_references(id,org_id,status,display_name_snapshot)
VALUES ('31111111-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','ACTIVE','Synthetic Test Customer');
INSERT INTO public.cpc_projects(id,org_id,customer_reference_id,title,owner_profile_id,status)
VALUES ('41111111-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001',
 '31111111-0000-4000-8000-000000000001','Synthetic Test Project',
 '11111111-0000-4000-8000-000000000001','ACTIVE');
INSERT INTO public.wos_production_orders (
 id,organization_id,customer_id,customer_name_snapshot,project_id,project_name_snapshot,
 order_number,product_name,sales_owner_profile_id,project_owner_profile_id,priority,
 version_label,requested_quantity,current_batch_quantity,product_material,created_by_profile_id
) VALUES (
 '51111111-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001',
 '31111111-0000-4000-8000-000000000001','Synthetic Test Customer',
 '41111111-0000-4000-8000-000000000001','Synthetic Test Project',
 'WOS-P0-01-SYNTHETIC-001','Synthetic PP bottle','11111111-0000-4000-8000-000000000001',
 '11111111-0000-4000-8000-000000000001','MEDIUM','V1',100,100,'PP','11111111-0000-4000-8000-000000000001'
);
INSERT INTO public.wos_office_readiness_receipts
(organization_id,order_id,source_revision,source_version_label,actor_profile_id,note)
VALUES ('aaaaaaaa-0000-4000-8000-000000000001','51111111-0000-4000-8000-000000000001',
 1,'V1','11111111-0000-4000-8000-000000000001','Synthetic office completeness accepted');

INSERT INTO public.wos_submission_receipts
(id,organization_id,order_id,source_revision,source_version_label,idempotency_key,
 actor_profile_id,request_fingerprint)
VALUES ('61111111-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001',
 '51111111-0000-4000-8000-000000000001',1,'V1',
 '71111111-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001',
 repeat('a',64));
INSERT INTO public.wos_workshop_inbox
(organization_id,order_id,submission_id,source_revision,source_version_label)
VALUES ('aaaaaaaa-0000-4000-8000-000000000001',
 '51111111-0000-4000-8000-000000000001',
 '61111111-0000-4000-8000-000000000001',1,'V1');

DO $negative$
BEGIN
 BEGIN
  INSERT INTO public.wos_office_readiness_receipts
   (organization_id,order_id,source_revision,source_version_label,actor_profile_id,note)
  VALUES ('bbbbbbbb-0000-4000-8000-000000000002',
          '51111111-0000-4000-8000-000000000001',2,'V2',
          '11111111-0000-4000-8000-000000000002','Wrong org should be rejected');
  RAISE EXCEPTION 'CROSS_ORG_RECEIPT_WAS_ACCEPTED';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO public.wos_submission_receipts
   (organization_id,order_id,source_revision,source_version_label,idempotency_key,
    actor_profile_id,request_fingerprint)
  VALUES ('aaaaaaaa-0000-4000-8000-000000000001',
   '51111111-0000-4000-8000-000000000001',2,'V2',
   '71111111-0000-4000-8000-000000000002','11111111-0000-4000-8000-000000000001',repeat('b',64));
  RAISE EXCEPTION 'DUPLICATE_P1_SUBMISSION_WAS_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO public.wos_workshop_inbox
   (organization_id,order_id,submission_id,source_revision,source_version_label,workflow_status)
  VALUES ('aaaaaaaa-0000-4000-8000-000000000001',
    '51111111-0000-4000-8000-000000000001',
    '61111111-0000-4000-8000-000000000001',2,'V2','IN_PRODUCTION');
  RAISE EXCEPTION 'INBOX_PRODUCTION_START_ACCEPTED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $negative$;

-- The following three distinct user identities are synthetic JWT claim contexts only.
SET ROLE authenticated;
SET request.jwt.claim.sub = '21111111-0000-4000-8000-000000000001';
DO $same_org$
BEGIN
 IF (SELECT count(*) FROM public.wos_workshop_inbox) <> 0 THEN
   RAISE EXCEPTION 'SALES_INBOX_VISIBILITY_EXCESSIVE';
 END IF;
 IF (SELECT count(*) FROM public.wos_submission_receipts) <> 1 THEN
   RAISE EXCEPTION 'SALES_CANNOT_SEE_OWN_RECEIPT';
 END IF;
END $same_org$;
SET request.jwt.claim.sub = '21111111-0000-4000-8000-000000000004';
DO $operator$
BEGIN
 IF (SELECT count(*) FROM public.wos_workshop_inbox) <> 1 THEN
   RAISE EXCEPTION 'OPERATOR_CANNOT_SEE_SAME_ORG_INBOX';
 END IF;
END $operator$;
SET request.jwt.claim.sub = '21111111-0000-4000-8000-000000000002';
DO $foreign$
BEGIN
 IF (SELECT count(*) FROM public.wos_workshop_inbox) <> 0
 OR (SELECT count(*) FROM public.wos_submission_receipts) <> 0 THEN
   RAISE EXCEPTION 'FOREIGN_ORG_COULD_READ_ORDER';
 END IF;
END $foreign$;
SET request.jwt.claim.sub = '21111111-0000-4000-8000-000000000003';
DO $viewer$
BEGIN
 IF (SELECT count(*) FROM public.wos_workshop_inbox) <> 0
 OR (SELECT count(*) FROM public.wos_submission_receipts) <> 0 THEN
   RAISE EXCEPTION 'VIEWER_COULD_READ_UNASSIGNED_ORDER';
 END IF;
END $viewer$;
RESET ROLE;

SELECT 'WOS_P0_01_SYNTHETIC_PG17_CONSTRAINT_AND_RLS=PASS' AS result;
