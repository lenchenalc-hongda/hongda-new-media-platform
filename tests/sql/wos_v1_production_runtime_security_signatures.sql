\pset format unaligned
\pset tuples_only on

-- Stable, source-free fingerprints for the disposable Production rehearsal.
-- Output intentionally excludes function bodies, object owners' secrets,
-- Storage paths and business rows.
WITH function_rows AS (
  SELECT jsonb_build_object(
    'kind', 'function',
    'name', procedure.proname || '('
      || replace(
        pg_catalog.oidvectortypes(procedure.proargtypes),
        ', ',
        ','
      ) || ')',
    'definition_md5', md5(pg_catalog.pg_get_functiondef(procedure.oid)),
    'security_definer', procedure.prosecdef,
    'owner', pg_catalog.pg_get_userbyid(procedure.proowner),
    'config', COALESCE(to_jsonb(procedure.proconfig), '[]'::jsonb),
    'acl', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'grantee', CASE
          WHEN acl.grantee = 0 THEN 'PUBLIC'
          ELSE pg_catalog.pg_get_userbyid(acl.grantee)
        END,
        'privilege', acl.privilege_type
      ) ORDER BY
        CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
          ELSE pg_catalog.pg_get_userbyid(acl.grantee) END,
        acl.privilege_type)
      FROM aclexplode(
        COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
      ) acl
    ), '[]'::jsonb)
  ) AS row
  FROM pg_catalog.pg_proc procedure
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname LIKE 'wos\_%' ESCAPE '\'
),
table_rows AS (
  SELECT jsonb_build_object(
    'kind', 'table',
    'name', relation.relname,
    'row_security', relation.relrowsecurity,
    'acl', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'grantee', CASE
          WHEN acl.grantee = 0 THEN 'PUBLIC'
          ELSE pg_catalog.pg_get_userbyid(acl.grantee)
        END,
        'privilege', acl.privilege_type
      ) ORDER BY
        CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
          ELSE pg_catalog.pg_get_userbyid(acl.grantee) END,
        acl.privilege_type)
      FROM aclexplode(
        COALESCE(relation.relacl, acldefault('r', relation.relowner))
      ) acl
    ), '[]'::jsonb)
  ) AS row
  FROM pg_catalog.pg_class relation
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'r'
    AND relation.relname LIKE 'wos\_%' ESCAPE '\'
),
policy_rows AS (
  SELECT jsonb_build_object(
    'kind', 'policy',
    'name', policy.schemaname || '.' || policy.tablename || '.'
      || policy.policyname,
    'command', policy.cmd,
    'roles', policy.roles,
    'permissive', policy.permissive,
    'using_expression_md5',
      md5(COALESCE(policy.qual, '')),
    'check_expression_md5',
      md5(COALESCE(policy.with_check, ''))
  ) AS row
  FROM pg_catalog.pg_policies policy
  WHERE policy.schemaname = 'public'
    AND policy.tablename LIKE 'wos\_%' ESCAPE '\'
),
storage_policy_rows AS (
  SELECT jsonb_build_object(
    'kind', 'storage_policy',
    'name', policy.schemaname || '.' || policy.tablename || '.'
      || policy.policyname,
    'command', policy.cmd,
    'roles', policy.roles,
    'permissive', policy.permissive,
    'using_expression_md5',
      md5(COALESCE(policy.qual, '')),
    'check_expression_md5',
      md5(COALESCE(policy.with_check, ''))
  ) AS row
  FROM pg_catalog.pg_policies policy
  WHERE policy.schemaname = 'storage'
    AND policy.tablename = 'objects'
    AND policy.policyname LIKE 'wos\_%' ESCAPE '\'
),
summary_rows AS (
  SELECT jsonb_build_object(
    'kind', 'summary',
    'name', 'qa_gate_and_m2_absence',
    'qa_operator_gate_present',
      to_regclass('public.wos_qa_p2_execution_gate') IS NOT NULL,
    'qa_office_gate_present',
      to_regclass('public.wos_qa_p2_office_execution_gate') IS NOT NULL,
    'qa_named_object_count', (
      SELECT count(*)
      FROM (
        SELECT procedure.oid::regprocedure::text AS object_name
        FROM pg_catalog.pg_proc procedure
        JOIN pg_catalog.pg_namespace namespace
          ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public'
          AND procedure.proname LIKE 'wos_qa\_%' ESCAPE '\'
        UNION ALL
        SELECT relation.oid::regclass::text
        FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_namespace namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname LIKE 'wos_qa\_%' ESCAPE '\'
      ) qa_objects
    )
  ) AS row
  UNION ALL
  SELECT jsonb_build_object(
    'kind', 'summary',
    'name', 'private_bucket_contract',
    'bucket_count', (
      SELECT count(*)
      FROM storage.buckets
      WHERE id = 'wos-private'
        AND name = 'wos-private'
        AND public = false
        AND file_size_limit = 20971520
        AND allowed_mime_types = ARRAY['image/png']
    ),
    'storage_policy_count', (
      SELECT count(*)
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname LIKE 'wos\_%' ESCAPE '\'
    )
  ) AS row
)
SELECT row::text
FROM (
  SELECT row FROM function_rows
  UNION ALL
  SELECT row FROM table_rows
  UNION ALL
  SELECT row FROM policy_rows
  UNION ALL
  SELECT row FROM storage_policy_rows
  UNION ALL
  SELECT row FROM summary_rows
) signatures
ORDER BY row->>'kind', row->>'name';
