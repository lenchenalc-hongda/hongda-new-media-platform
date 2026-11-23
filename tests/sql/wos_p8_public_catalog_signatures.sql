-- Catalog metadata only. No business rows, no SQL function bodies, no secrets.
SELECT t.table_name,
  COALESCE((SELECT count(*)::int FROM information_schema.columns c
            WHERE c.table_schema='public' AND c.table_name=t.table_name),0) AS columns,
  md5(COALESCE((SELECT string_agg(
    concat_ws('|',c.column_name,c.data_type,c.udt_name,c.is_nullable,COALESCE(c.column_default,'<NULL>')),
    E'\n' ORDER BY c.ordinal_position)
    FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.table_name),'')) AS column_sig,
  COALESCE((SELECT count(*)::int FROM pg_indexes ix WHERE ix.schemaname='public'
    AND ix.tablename=t.table_name),0) AS indexes,
  md5(COALESCE((SELECT string_agg(ix.indexname||'='||ix.indexdef,E'\n' ORDER BY ix.indexname)
    FROM pg_indexes ix WHERE ix.schemaname='public' AND ix.tablename=t.table_name),'')) AS index_sig,
  COALESCE((SELECT count(*)::int FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid
    JOIN pg_namespace ns ON ns.oid=rel.relnamespace
    WHERE ns.nspname='public' AND rel.relname=t.table_name),0) AS constraints,
  md5(COALESCE((SELECT string_agg(con.conname||'='||pg_get_constraintdef(con.oid,true),
    E'\n' ORDER BY con.conname)
    FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid
    JOIN pg_namespace ns ON ns.oid=rel.relnamespace
    WHERE ns.nspname='public' AND rel.relname=t.table_name),'')) AS constraint_sig,
  COALESCE((SELECT count(*)::int FROM pg_policies pol WHERE pol.schemaname='public'
    AND pol.tablename=t.table_name),0) AS policies,
  md5(COALESCE((SELECT string_agg(
    concat_ws('|',pol.policyname,pol.cmd,pol.permissive,array_to_string(pol.roles,','),
     COALESCE(pol.qual,'<NULL>'),COALESCE(pol.with_check,'<NULL>')),
    E'\n' ORDER BY pol.policyname)
    FROM pg_policies pol WHERE pol.schemaname='public' AND pol.tablename=t.table_name),'')) AS policy_sig
FROM information_schema.tables t
WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
ORDER BY t.table_name;
