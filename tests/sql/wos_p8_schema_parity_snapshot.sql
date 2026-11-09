-- WOS P8 read-only structural fingerprint and migration/rollback gate.
-- Safe for Production read-only inspection or an isolated branch.
-- Do not use this output as a substitute for Auth/Storage/Edge byte tests.
-- Compare non_wos_structure_sig before WOS Foundation, after P7 and after teardown.
BEGIN TRANSACTION READ ONLY;

WITH base_tables AS (
  SELECT c.relname AS name, c.relrowsecurity AS rls,
    COALESCE((
      SELECT string_agg(
        a.attname || ':' ||
        pg_catalog.format_type(a.atttypid,a.atttypmod) || ':' ||
        a.attnotnull::text,
        ',' ORDER BY a.attnum
      )
      FROM pg_attribute a
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    ), '') AS columns_signature
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r'
    AND c.relname NOT LIKE 'wos_%'
),
base_indexes AS (
  SELECT tablename, string_agg(indexname || ':' || indexdef, ',' ORDER BY indexname) AS definitions
  FROM pg_indexes
  WHERE schemaname='public' AND tablename NOT LIKE 'wos_%'
  GROUP BY tablename
)
SELECT 'non_wos_structure' AS gate,
  count(*)::bigint AS public_base_tables,
  md5(string_agg(
    t.name || ':' || t.rls::text || ':' || t.columns_signature || ':' ||
    COALESCE(i.definitions,''),
    '|' ORDER BY t.name
  )) AS non_wos_structure_sig
FROM base_tables t
LEFT JOIN base_indexes i ON i.tablename=t.name;

SELECT 'wos_inventory' AS gate,
 (SELECT count(*) FROM information_schema.tables
   WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name LIKE 'wos_%') AS wos_tables,
 (SELECT count(*) FROM pg_policies
   WHERE schemaname='public' AND tablename LIKE 'wos_%') AS wos_table_policies,
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r'
   AND c.relname LIKE 'wos_%' AND c.relrowsecurity) AS wos_rls_enabled_tables,
 (SELECT count(*) FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
   AND policyname LIKE 'wos_%') AS wos_storage_policies,
 (SELECT count(*) FROM storage.buckets WHERE id='wos-private') AS wos_private_buckets,
 (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private') AS wos_private_objects,
 to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS has_migration_history_table;

-- This is an intentional security-drift diagnostic: never automatically copy
-- permissive Production site_data policies into an otherwise isolated branch.
SELECT 'legacy_site_data_access' AS gate,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='site_data'
    AND roles @> ARRAY['public']::name[]
    AND (COALESCE(qual,'')='true' OR COALESCE(with_check,'')='true')) AS public_allow_all_policies;

COMMIT;
