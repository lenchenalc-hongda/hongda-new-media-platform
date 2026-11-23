-- Public function catalog hashes only. No SQL source bodies or user rows.
SELECT p.proname AS name,
 pg_get_function_identity_arguments(p.oid) AS identity_args,
 pg_get_function_result(p.oid) AS result_type,
 l.lanname AS language,
 p.prosecdef AS security_definer,
 p.provolatile AS volatility,
 COALESCE(array_to_string(p.proconfig,';'),'<NULL>') AS settings,
 md5(pg_get_functiondef(p.oid)) AS definition_sig,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN pg_language l ON l.oid=p.prolang
WHERE n.nspname='public' AND p.prokind IN ('f','p')
ORDER BY p.proname,pg_get_function_identity_arguments(p.oid);
