-- READ ONLY: fingerprints are for externally saving before/after install.
-- Avoid dumping business customer names, user IDs, or Storage file paths.
BEGIN READ ONLY;
SELECT jsonb_build_object(
 'orders_count',(SELECT count(*) FROM public.wos_production_orders),
 'legacy_null_pairs',(SELECT count(*) FROM public.wos_production_orders WHERE customer_id IS NULL OR project_id IS NULL),
 'orders_fingerprint',(SELECT md5(coalesce(string_agg(
   id::text||'|'||organization_id::text||'|'||coalesce(customer_id::text,'NULL')||'|'||
   coalesce(project_id::text,'NULL')||'|'||version::text||'|'||workflow_status||'|'||version_label,
   E'\n' ORDER BY id),''))
  FROM public.wos_production_orders),
 'history_count',(SELECT count(*) FROM public.wos_status_history),
 'history_fingerprint',(SELECT md5(coalesce(string_agg(
   id::text||'|'||entity_id::text||'|'||next_status,
   E'\n' ORDER BY id),''))
   FROM public.wos_status_history),
 'inbox_count',(SELECT count(*) FROM public.wos_workshop_inbox),
 'receipts_count',(SELECT count(*) FROM public.wos_submission_receipts),
 'private_objects_count',(SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private'),
 'storage_policies_fingerprint',(SELECT md5(coalesce(string_agg(
  policyname||'|'||cmd||'|'||permissive||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),
  E'\n' ORDER BY policyname),''))
  FROM pg_policies WHERE schemaname='storage' AND tablename='objects'),
 'wos_rpc_fingerprint',(SELECT md5(coalesce(string_agg(
  p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_functiondef(p.oid),
  E'\n' ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)),''))
  FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
  AND (p.proname LIKE 'wos_qa_%' OR p.proname IN ('wos_submit_production_order',
    'wos_register_uploaded_reference_image','wos_confirm_office_completeness'))),
 'p2_operator_off',(SELECT enabled=false FROM public.wos_qa_p2_execution_gate WHERE gate_name='OPERATOR_WRITES'),
 'p2_office_off',(SELECT enabled=false FROM public.wos_qa_p2_office_execution_gate WHERE gate_name='OFFICE_WRITES')
) AS wos_qa_overlay_fingerprint;
COMMIT;