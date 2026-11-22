\set ON_ERROR_STOP on

CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO hosted_wos_installer;

CREATE FUNCTION tests.wos_m4_hosted_expect_error(
  p_sql text,
  p_sqlstate text,
  p_message text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $expect$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate
      OR (p_message IS NOT NULL AND SQLERRM <> p_message)
    THEN
      RAISE EXCEPTION
        'UNEXPECTED_ERROR expected_state=% actual_state=% expected_message=% actual_message=%',
        p_sqlstate, SQLSTATE, p_message, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED state=% message=%',
    p_sqlstate, p_message;
END;
$expect$;
GRANT EXECUTE ON FUNCTION tests.wos_m4_hosted_expect_error(text,text,text)
  TO hosted_wos_installer;

DO $preinstall_check$
DECLARE
  v_active_gates integer;
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer
      NOT BETWEEN 170000 AND 179999
    OR pg_catalog.to_regrole('wos_m4_proof_verifier_owner') IS NOT NULL
    OR pg_catalog.to_regprocedure(
      'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
    ) IS NOT NULL
    OR pg_catalog.to_regprocedure(
      'public.wos_qa_m4_can_download_proof(text,text)'
    ) IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies
      WHERE policyname LIKE 'wos_m4_%'
    )
  THEN
    RAISE EXCEPTION 'M4_PG17_PREINSTALL_STATE_INVALID';
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO v_active_gates
  FROM (
    SELECT enabled, enabled_until, allowed_order_id, allowed_organization_id
    FROM public.wos_qa_p2_execution_gate
    UNION ALL
    SELECT enabled, enabled_until, allowed_order_id, allowed_organization_id
    FROM public.wos_qa_p2_office_execution_gate
    UNION ALL
    SELECT enabled, enabled_until, allowed_order_id, allowed_organization_id
    FROM public.wos_qa_p2_m2_gate
  ) gate
  WHERE gate.enabled IS NOT FALSE
    OR gate.enabled_until IS NOT NULL
    OR gate.allowed_order_id IS NOT NULL
    OR gate.allowed_organization_id IS NOT NULL;
  IF v_active_gates <> 0 THEN
    RAISE EXCEPTION 'M4_PG17_PREINSTALL_GATE_NOT_CLOSED';
  END IF;
END;
$preinstall_check$;

CREATE TABLE tests.wos_m4_pg17_context AS
SELECT
  '33333333-3333-4333-8333-333333333333'::uuid AS expected_order_id,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid AS expected_org_id,
  11::integer AS expected_version,
  'QA-R6'::text AS expected_version_label;
GRANT SELECT ON tests.wos_m4_pg17_context TO hosted_wos_installer;

CREATE FUNCTION tests.wos_m4_catalog_fingerprint()
RETURNS text
LANGUAGE sql
STABLE
AS $catalog_fingerprint$
  SELECT pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'policies', (
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'schema', policy.schemaname,
              'table', policy.tablename,
              'name', policy.policyname,
              'permissive', policy.permissive,
              'roles', pg_catalog.to_jsonb(policy.roles),
              'cmd', policy.cmd,
              'qual', policy.qual,
              'withCheck', policy.with_check
            )
            ORDER BY policy.schemaname, policy.tablename, policy.policyname
          )
          FROM pg_catalog.pg_policies policy
          WHERE policy.schemaname IN ('public', 'storage')
        ),
        'memberships', (
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'role', membership.roleid::regrole::text,
              'member', membership.member::regrole::text,
              'grantor', membership.grantor::regrole::text,
              'admin', membership.admin_option,
              'inherit', membership.inherit_option,
              'set', membership.set_option
            )
            ORDER BY membership.roleid::regrole::text,
                     membership.member::regrole::text,
                     membership.grantor::regrole::text
          )
          FROM pg_catalog.pg_auth_members membership
        ),
        'roles', (
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'name', role.rolname,
              'super', role.rolsuper,
              'inherit', role.rolinherit,
              'createRole', role.rolcreaterole,
              'createDb', role.rolcreatedb,
              'login', role.rolcanlogin,
              'replication', role.rolreplication,
              'bypassRls', role.rolbypassrls
            )
            ORDER BY role.rolname
          )
          FROM pg_catalog.pg_roles role
        ),
        'functions', (
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'identity', procedure.oid::regprocedure::text,
              'owner', pg_catalog.pg_get_userbyid(procedure.proowner),
              'securityDefiner', procedure.prosecdef,
              'config', procedure.proconfig,
              'acl', procedure.proacl::text,
              'definitionSha256', pg_catalog.encode(
                pg_catalog.sha256(pg_catalog.convert_to(
                  pg_catalog.pg_get_functiondef(procedure.oid),
                  'UTF8'
                )),
                'hex'
              )
            )
            ORDER BY procedure.oid::regprocedure::text
          )
          FROM pg_catalog.pg_proc procedure
          WHERE procedure.oid IN (
            'auth.uid()'::regprocedure,
            'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'::regprocedure,
            'public.wos_qa_p2_m2_checked_proof_set(uuid,uuid,uuid,text)'::regprocedure,
            'public.wos_qa_p2_m2_spec_digest(uuid)'::regprocedure
          )
        ),
        'dependencies', (
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'class', dependency.classid::regclass::text,
              'object', dependency.objid,
              'refClass', dependency.refclassid::regclass::text,
              'refObject', dependency.refobjid,
              'type', dependency.deptype
            )
            ORDER BY dependency.classid::regclass::text,
                     dependency.objid,
                     dependency.refclassid::regclass::text,
                     dependency.refobjid,
                     dependency.deptype
          )
          FROM pg_catalog.pg_depend dependency
          WHERE (
            dependency.refclassid = 'pg_catalog.pg_class'::regclass
            AND dependency.refobjid IN (
              'public.profiles'::regclass,
              'public.wos_production_orders'::regclass,
              'public.wos_visual_baselines'::regclass,
              'public.wos_visual_baseline_items'::regclass,
              'public.wos_reference_images'::regclass,
              'public.wos_qa_verified_image_proofs'::regclass,
              'public.wos_qa_p2_m2_receipts'::regclass,
              'storage.objects'::regclass
            )
          ) OR (
            dependency.refclassid = 'pg_catalog.pg_proc'::regclass
            AND dependency.refobjid IN (
              'auth.uid()'::regprocedure,
              'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'::regprocedure,
              'public.wos_qa_p2_m2_checked_proof_set(uuid,uuid,uuid,text)'::regprocedure,
              'public.wos_qa_p2_m2_spec_digest(uuid)'::regprocedure
            )
          )
        )
      )::text,
      'UTF8'
    )),
    'hex'
  )
$catalog_fingerprint$;

CREATE TABLE tests.wos_m4_preinstall_baseline AS
SELECT
  (SELECT count(*) FROM public.wos_production_orders) AS orders_count,
  (SELECT count(*) FROM public.wos_visual_baselines) AS baselines_count,
  (SELECT count(*) FROM public.wos_visual_baseline_items) AS baseline_items_count,
  (SELECT count(*) FROM public.wos_reference_images) AS reference_images_count,
  (SELECT count(*) FROM public.wos_qa_verified_image_proofs) AS proofs_count,
  (SELECT count(*) FROM public.wos_qa_p2_m2_receipts) AS receipts_count,
  (SELECT count(*) FROM storage.objects) AS storage_objects_count,
  (
    SELECT encode(sha256(convert_to(
      COALESCE(string_agg(to_jsonb(row_value)::text, E'\n' ORDER BY row_value.id), ''),
      'UTF8'
    )), 'hex')
    FROM public.wos_production_orders row_value
  ) AS orders_hash,
  (
    SELECT encode(sha256(convert_to(
      COALESCE(string_agg(to_jsonb(row_value)::text, E'\n' ORDER BY row_value.id), ''),
      'UTF8'
    )), 'hex')
    FROM public.wos_visual_baselines row_value
  ) AS baselines_hash,
  (
    SELECT encode(sha256(convert_to(
      COALESCE(string_agg(
        to_jsonb(row_value)::text,
        E'\n'
        ORDER BY row_value.baseline_id, row_value.reference_image_id
      ), ''),
      'UTF8'
    )), 'hex')
    FROM public.wos_visual_baseline_items row_value
  ) AS baseline_items_hash,
  (
    SELECT encode(sha256(convert_to(
      COALESCE(string_agg(to_jsonb(row_value)::text, E'\n' ORDER BY row_value.id), ''),
      'UTF8'
    )), 'hex')
    FROM public.wos_reference_images row_value
  ) AS reference_images_hash,
  (
    SELECT encode(sha256(convert_to(
      COALESCE(string_agg(to_jsonb(row_value)::text, E'\n' ORDER BY row_value.image_id), ''),
      'UTF8'
    )), 'hex')
    FROM public.wos_qa_verified_image_proofs row_value
  ) AS proofs_hash,
  (
    SELECT encode(sha256(convert_to(
      COALESCE(string_agg(to_jsonb(row_value)::text, E'\n' ORDER BY row_value.request_id), ''),
      'UTF8'
    )), 'hex')
    FROM public.wos_qa_p2_m2_receipts row_value
  ) AS receipts_hash,
  (
    SELECT encode(sha256(convert_to(
      COALESCE(string_agg(to_jsonb(row_value)::text, E'\n' ORDER BY row_value.id), ''),
      'UTF8'
    )), 'hex')
    FROM storage.objects row_value
  ) AS storage_objects_hash,
  (
    SELECT encode(sha256(convert_to(
      COALESCE(string_agg(
        namespace.nspname || '.' || relation.relname || '='
          || COALESCE(relation.relacl::text, 'NULL'),
        E'\n'
        ORDER BY namespace.nspname, relation.relname
      ), ''),
      'UTF8'
    )), 'hex')
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = relation.relnamespace
    WHERE (
      namespace.nspname = 'public'
      AND relation.relname IN (
        'profiles',
        'wos_production_orders',
        'wos_visual_baselines',
        'wos_visual_baseline_items',
        'wos_reference_images',
        'wos_qa_verified_image_proofs',
        'wos_qa_p2_m2_receipts'
      )
    ) OR (
      namespace.nspname = 'storage'
      AND relation.relname = 'objects'
    )
  ) AS table_acl_hash,
  (
    SELECT encode(sha256(convert_to(
      COALESCE(string_agg(
        namespace.nspname || '=' || COALESCE(namespace.nspacl::text, 'NULL'),
        E'\n'
        ORDER BY namespace.nspname
      ), ''),
      'UTF8'
    )), 'hex')
    FROM pg_catalog.pg_namespace namespace
    WHERE namespace.nspname IN ('public', 'auth', 'storage')
  ) AS schema_acl_hash,
  pg_catalog.has_table_privilege(
    'authenticated',
    'public.wos_qa_verified_image_proofs',
    'SELECT'
  ) AS authenticated_proof_select,
  pg_catalog.has_table_privilege(
    'authenticated',
    'public.wos_qa_p2_m2_receipts',
    'SELECT'
  ) AS authenticated_receipt_select,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)',
    'EXECUTE'
  ) AS authenticated_m2_execute,
  tests.wos_m4_catalog_fingerprint() AS catalog_hash;
