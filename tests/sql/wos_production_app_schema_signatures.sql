-- Metadata-only signature for Production application schemas.
-- No business rows and no Storage object paths are returned.
WITH app_schemas AS (
  SELECT n.oid, n.nspname, n.nspowner, n.nspacl
  FROM pg_catalog.pg_namespace n
  WHERE n.nspname IN ('public', 'commercial_private', 'commercial_audit')
),
signature_rows AS (
  SELECT
    'schema'::text AS category,
    n.nspname::text AS object_name,
    pg_catalog.jsonb_build_object(
      'owner', pg_catalog.pg_get_userbyid(n.nspowner),
      'acl', n.nspacl::text,
      'usage_anon', pg_catalog.has_schema_privilege('anon', n.oid, 'USAGE'),
      'usage_auth', pg_catalog.has_schema_privilege('authenticated', n.oid, 'USAGE'),
      'usage_service', pg_catalog.has_schema_privilege('service_role', n.oid, 'USAGE'),
      'create_auth', pg_catalog.has_schema_privilege('authenticated', n.oid, 'CREATE')
    ) AS details
  FROM app_schemas n

  UNION ALL

  SELECT
    'table',
    n.nspname || '.' || c.relname,
    pg_catalog.jsonb_build_object(
      'owner', pg_catalog.pg_get_userbyid(c.relowner),
      'rls_enabled', c.relrowsecurity,
      'rls_forced', c.relforcerowsecurity,
      'columns', (
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'ordinal', a.attnum,
          'name', a.attname,
          'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
          'not_null', a.attnotnull,
          'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid),
          'identity', a.attidentity,
          'generated', a.attgenerated
        ) ORDER BY a.attnum)
        FROM pg_catalog.pg_attribute a
        LEFT JOIN pg_catalog.pg_attrdef d
          ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      ),
      'indexes', (
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'name', index_class.relname,
          'definition', pg_catalog.pg_get_indexdef(index_class.oid)
        ) ORDER BY index_class.relname)
        FROM pg_catalog.pg_index i
        JOIN pg_catalog.pg_class index_class ON index_class.oid = i.indexrelid
        WHERE i.indrelid = c.oid
      ),
      'constraints', (
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'name', con.conname,
          'type', con.contype,
          'definition', pg_catalog.pg_get_constraintdef(con.oid, true),
          'validated', con.convalidated,
          'deferrable', con.condeferrable,
          'deferred', con.condeferred
        ) ORDER BY con.conname)
        FROM pg_catalog.pg_constraint con
        WHERE con.conrelid = c.oid
      ),
      'policies', (
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'name', pol.policyname,
          'permissive', pol.permissive,
          'roles', pol.roles,
          'cmd', pol.cmd,
          'qual', pol.qual,
          'with_check', pol.with_check
        ) ORDER BY pol.policyname)
        FROM pg_catalog.pg_policies pol
        WHERE pol.schemaname = n.nspname AND pol.tablename = c.relname
      ),
      'grants', (
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'grantee', grant_row.grantee,
          'privilege', grant_row.privilege_type,
          'grantable', grant_row.is_grantable
        ) ORDER BY grant_row.grantee, grant_row.privilege_type)
        FROM information_schema.role_table_grants grant_row
        WHERE grant_row.table_schema = n.nspname
          AND grant_row.table_name = c.relname
          AND grant_row.grantee IN ('anon', 'authenticated', 'service_role', 'postgres')
      ),
      'select_anon', pg_catalog.has_table_privilege('anon', c.oid, 'SELECT'),
      'select_auth', pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT'),
      'insert_auth', pg_catalog.has_table_privilege('authenticated', c.oid, 'INSERT'),
      'update_auth', pg_catalog.has_table_privilege('authenticated', c.oid, 'UPDATE'),
      'delete_auth', pg_catalog.has_table_privilege('authenticated', c.oid, 'DELETE')
    )
  FROM app_schemas n
  JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid
  WHERE c.relkind IN ('r', 'p')

  UNION ALL

  SELECT
    'table_acl',
    n.nspname || '.' || c.relname,
    pg_catalog.jsonb_build_object(
      'effective_acl', (
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'grantor', pg_catalog.pg_get_userbyid(acl.grantor),
          'grantee', CASE
            WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl.grantee)
          END,
          'privilege', acl.privilege_type,
          'grantable', acl.is_grantable
        ) ORDER BY
          CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl.grantee) END,
          acl.privilege_type,
          acl.is_grantable)
        FROM aclexplode(
          COALESCE(c.relacl, acldefault('r', c.relowner))
        ) acl
      )
    )
  FROM app_schemas n
  JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid
  WHERE c.relkind IN ('r', 'p')

  UNION ALL

  SELECT
    'column_acl',
    n.nspname || '.' || c.relname || '.' || a.attname,
    pg_catalog.jsonb_build_object(
      'grants', (
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'grantor', pg_catalog.pg_get_userbyid(acl.grantor),
          'grantee', CASE
            WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl.grantee)
          END,
          'privilege', acl.privilege_type,
          'grantable', acl.is_grantable
        ) ORDER BY
          CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl.grantee) END,
          acl.privilege_type,
          acl.is_grantable)
        FROM aclexplode(a.attacl) acl
      )
    )
  FROM app_schemas n
  JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid
  JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
  WHERE c.relkind IN ('r', 'p')
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attacl IS NOT NULL

  UNION ALL

  SELECT
    'function',
    n.nspname || '.' || p.proname || '(' ||
      pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
    pg_catalog.jsonb_build_object(
      'owner', pg_catalog.pg_get_userbyid(p.proowner),
      'result', pg_catalog.pg_get_function_result(p.oid),
      'language', l.lanname,
      'security_definer', p.prosecdef,
      'leakproof', p.proleakproof,
      'strict', p.proisstrict,
      'volatility', p.provolatile,
      'parallel', p.proparallel,
      'config', p.proconfig,
      'definition', pg_catalog.pg_get_functiondef(p.oid),
      'exec_anon', pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'),
      'exec_auth', pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      'exec_service', pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
    )
  FROM app_schemas n
  JOIN pg_catalog.pg_proc p ON p.pronamespace = n.oid
  JOIN pg_catalog.pg_language l ON l.oid = p.prolang
  WHERE p.prokind IN ('f', 'p')

  UNION ALL

  SELECT
    'function_acl',
    n.nspname || '.' || p.proname || '(' ||
      pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
    pg_catalog.jsonb_build_object(
      'effective_acl', (
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'grantor', pg_catalog.pg_get_userbyid(acl.grantor),
          'grantee', CASE
            WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl.grantee)
          END,
          'privilege', acl.privilege_type,
          'grantable', acl.is_grantable
        ) ORDER BY
          CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl.grantee) END,
          acl.privilege_type,
          acl.is_grantable)
        FROM aclexplode(
          COALESCE(p.proacl, acldefault('f', p.proowner))
        ) acl
      )
    )
  FROM app_schemas n
  JOIN pg_catalog.pg_proc p ON p.pronamespace = n.oid
  WHERE p.prokind IN ('f', 'p')

  UNION ALL

  SELECT
    'trigger',
    n.nspname || '.' || c.relname || '.' || t.tgname,
    pg_catalog.jsonb_build_object(
      'definition', pg_catalog.pg_get_triggerdef(t.oid, true),
      'enabled', t.tgenabled
    )
  FROM app_schemas n
  JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid
  JOIN pg_catalog.pg_trigger t ON t.tgrelid = c.oid
  WHERE NOT t.tgisinternal

  UNION ALL

  SELECT
    'default_acl',
    pg_catalog.pg_get_userbyid(d.defaclrole) || ':' || n.nspname || ':' ||
      d.defaclobjtype::text,
    pg_catalog.jsonb_build_object('acl', d.defaclacl::text)
  FROM pg_catalog.pg_default_acl d
  JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
  WHERE n.nspname IN ('public', 'commercial_private', 'commercial_audit')
)
SELECT pg_catalog.row_to_json(signature_rows)::text AS row_json
FROM signature_rows
ORDER BY category, object_name;
