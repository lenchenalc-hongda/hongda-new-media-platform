-- User-defined public trigger metadata only; no business rows.
SELECT rel.relname AS table_name, tg.tgname AS trigger_name,
 md5(pg_get_triggerdef(tg.oid,true)) AS definition_sig,
 tg.tgenabled AS enabled_state
FROM pg_trigger tg
JOIN pg_class rel ON rel.oid=tg.tgrelid
JOIN pg_namespace n ON n.oid=rel.relnamespace
WHERE n.nspname='public' AND NOT tg.tgisinternal
ORDER BY rel.relname,tg.tgname;
