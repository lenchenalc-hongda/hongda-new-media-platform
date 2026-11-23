-- Public table effective grant signature for anon/authenticated/service_role.
-- Does not access business rows or grants outside public schema.
SELECT t.table_name,
 COUNT(g.privilege_type)::int AS grants,
 md5(COALESCE(string_agg(g.grantee||'|'||g.privilege_type,
    E'\n' ORDER BY g.grantee,g.privilege_type),'')) AS grant_sig
FROM information_schema.tables t
LEFT JOIN information_schema.role_table_grants g
 ON g.table_schema=t.table_schema AND g.table_name=t.table_name
 AND g.grantee IN ('anon','authenticated','service_role')
WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
GROUP BY t.table_name ORDER BY t.table_name;
