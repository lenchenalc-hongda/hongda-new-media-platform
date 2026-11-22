-- QA-ONLY / NOT INSTALLED / ROLLBACK ONLY.
-- Removes the revision-image entrypoints and restores pre-install triggers,
-- function definitions, Storage policy and ACL snapshots. It must run before
-- the M2 rollback because revision-image functions depend on the M2 order lock.
BEGIN;

DO $preconditions$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM wos_qa_safety.wos_revision_install_marker
   WHERE install_key='revision-images-v1'
 ) THEN
   RAISE EXCEPTION 'REVISION_ROLLBACK_BACKUP_MISSING';
 END IF;
 IF pg_catalog.to_regprocedure(
   'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'
 ) IS NULL THEN
   RAISE EXCEPTION 'REVISION_ROLLBACK_REQUIRES_M2_INSTALLED';
 END IF;
 IF EXISTS (SELECT 1 FROM public.wos_qa_p2_m2_gate WHERE enabled) THEN
   RAISE EXCEPTION 'REVISION_ROLLBACK_REFUSED_M2_GATE_ENABLED';
 END IF;
END $preconditions$;

-- Close every new authenticated entrypoint before removing definitions.
REVOKE ALL ON FUNCTION public.wos_register_qa_revision_image(uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.wos_qa_revision_gate_allows(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.wos_qa_p2_m2_record_trusted_proof(
 uuid,uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,text)
 FROM PUBLIC,anon,authenticated,service_role;

DROP POLICY IF EXISTS wos_qa_revision_object_insert ON storage.objects;
DROP TRIGGER IF EXISTS wos_qa_trusted_proof_guard
 ON public.wos_qa_verified_image_proofs;
DROP TRIGGER IF EXISTS wos_qa_trusted_proof_write_guard
 ON public.wos_qa_verified_image_proofs;
DROP TRIGGER IF EXISTS wos_qa_p2_m2_verified_proof_guard
 ON public.wos_qa_verified_image_proofs;
DROP FUNCTION IF EXISTS public.wos_qa_p2_m2_record_trusted_proof(
 uuid,uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,text);
DROP FUNCTION IF EXISTS public.wos_register_qa_revision_image(uuid,uuid,text,text);
DROP FUNCTION IF EXISTS public.wos_qa_revision_gate_allows(uuid,uuid,uuid);

-- Restore the pre-install trusted proof guard definition.
DO $restore_guard$
DECLARE v_definition text;
BEGIN
 SELECT function_definition INTO v_definition
 FROM wos_qa_safety.wos_proof_guard_backup
 WHERE function_oid=(
   SELECT p.oid
   FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='wos_qa_proof_write_guard'
     AND p.pronargs=0
   LIMIT 1
 )
 ORDER BY captured_at
 LIMIT 1;
 IF v_definition IS NULL THEN
   RAISE EXCEPTION 'ORIGINAL_PROOF_GUARD_BACKUP_MISSING';
 END IF;
 EXECUTE v_definition;
END $restore_guard$;

-- Recreate any revision-related function that existed before the first install.
DO $restore_functions$
DECLARE v_function record;
BEGIN
 FOR v_function IN
   SELECT function_definition FROM wos_qa_safety.wos_function_backup
   ORDER BY function_identity
 LOOP
   EXECUTE v_function.function_definition;
 END LOOP;
END $restore_functions$;

-- Restore the exact pre-install trigger set on the proof table.
DO $restore_triggers$
DECLARE v_trigger record;
BEGIN
 FOR v_trigger IN
   SELECT tgname
   FROM pg_catalog.pg_trigger
   WHERE tgrelid='public.wos_qa_verified_image_proofs'::regclass
     AND NOT tgisinternal
 LOOP
   EXECUTE pg_catalog.format(
     'DROP TRIGGER %I ON public.wos_qa_verified_image_proofs',
     v_trigger.tgname);
 END LOOP;
 FOR v_trigger IN
   SELECT trigger_definition
   FROM wos_qa_safety.wos_trigger_backup
   ORDER BY trigger_name
 LOOP
   EXECUTE v_trigger.trigger_definition;
 END LOOP;
END $restore_triggers$;

-- Restore the pre-install policy when one existed. On the normal QA baseline
-- the candidate policy was new, so rollback leaves it absent.
DO $restore_policy$
DECLARE
 v_policy wos_qa_safety.wos_policy_backup%ROWTYPE;
 v_roles text;
 v_sql text;
BEGIN
 SELECT * INTO v_policy
 FROM wos_qa_safety.wos_policy_backup
 WHERE policy_name='wos_qa_revision_object_insert';
 IF NOT FOUND THEN RETURN; END IF;
 SELECT pg_catalog.string_agg(
   CASE WHEN role_name='PUBLIC' THEN 'PUBLIC'
     ELSE pg_catalog.quote_ident(role_name) END, ',')
 INTO v_roles
 FROM pg_catalog.unnest(v_policy.role_names) AS roles(role_name);
 v_sql:=pg_catalog.format(
   'CREATE POLICY %I ON storage.objects AS %s FOR %s TO %s',
   v_policy.policy_name,
   CASE WHEN v_policy.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
   v_policy.command,v_roles);
 IF v_policy.using_expression IS NOT NULL THEN
   v_sql:=v_sql||' USING ('||v_policy.using_expression||')';
 END IF;
 IF v_policy.check_expression IS NOT NULL THEN
   v_sql:=v_sql||' WITH CHECK ('||v_policy.check_expression||')';
 END IF;
 EXECUTE v_sql;
END $restore_policy$;

-- Restore table/function ACLs captured before the first installation.
DO $restore_acl$
DECLARE
 v_object record;
 v_acl record;
 v_role text;
BEGIN
 FOR v_object IN
   SELECT DISTINCT object_kind,object_identity
   FROM wos_qa_safety.wos_acl_backup
 LOOP
   IF v_object.object_kind='TABLE' THEN
     EXECUTE pg_catalog.format(
       'REVOKE ALL ON TABLE %s FROM PUBLIC,anon,authenticated,service_role',
       v_object.object_identity);
   ELSE
     EXECUTE pg_catalog.format(
       'REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',
       v_object.object_identity);
   END IF;
 END LOOP;
 FOR v_acl IN
   SELECT * FROM wos_qa_safety.wos_acl_backup
   ORDER BY object_kind,object_identity,grantee,privilege_type
 LOOP
   v_role:=CASE WHEN v_acl.grantee='PUBLIC' THEN 'PUBLIC'
     ELSE pg_catalog.quote_ident(v_acl.grantee) END;
   IF v_acl.object_kind='TABLE' THEN
     EXECUTE pg_catalog.format(
       'GRANT %s ON TABLE %s TO %s%s',
       v_acl.privilege_type,v_acl.object_identity,v_role,
       CASE WHEN v_acl.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
   ELSE
     EXECUTE pg_catalog.format(
       'GRANT %s ON FUNCTION %s TO %s%s',
       v_acl.privilege_type,v_acl.object_identity,v_role,
       CASE WHEN v_acl.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
   END IF;
 END LOOP;
END $restore_acl$;

-- Receipts are audit data. Drop an empty candidate table, otherwise retain it
-- with RLS and all application/service-role access closed.
DO $receipts$
DECLARE v_rows bigint;
BEGIN
 IF pg_catalog.to_regclass('public.wos_qa_trusted_proof_receipts') IS NULL THEN
   RETURN;
 END IF;
 EXECUTE 'SELECT count(*) FROM public.wos_qa_trusted_proof_receipts' INTO v_rows;
 IF v_rows=0 THEN
   DROP TABLE public.wos_qa_trusted_proof_receipts;
 ELSE
   ALTER TABLE public.wos_qa_trusted_proof_receipts ENABLE ROW LEVEL SECURITY;
   REVOKE ALL ON public.wos_qa_trusted_proof_receipts
    FROM PUBLIC,anon,authenticated,service_role;
 END IF;
END $receipts$;

INSERT INTO wos_qa_safety.wos_revision_rollback_marker(install_key)
VALUES('revision-images-v1')
ON CONFLICT(install_key) DO UPDATE
SET completed_at=pg_catalog.clock_timestamp();

COMMIT;
