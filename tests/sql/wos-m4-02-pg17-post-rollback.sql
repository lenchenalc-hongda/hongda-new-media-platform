\set ON_ERROR_STOP on

DO $post_rollback$
DECLARE
  v_before tests.wos_m4_preinstall_baseline%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_before FROM tests.wos_m4_preinstall_baseline;

  IF pg_catalog.to_regprocedure(
      'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
    ) IS NOT NULL
    OR pg_catalog.to_regprocedure(
      'public.wos_qa_m4_current_user_id()'
    ) IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles
      WHERE rolname = 'wos_m4_proof_verifier_owner'
    )
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies
      WHERE policyname LIKE 'wos_m4_proof_owner_%'
    )
    OR (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_policies
      WHERE policyname IN (
        'wos_p7_private_object_select',
        'wos_p7_storage_reader_roles'
      )
    ) <> 2
  THEN
    RAISE EXCEPTION 'M4_ROLLBACK_OBJECTS_REMAIN';
  END IF;

  IF (SELECT count(*) FROM public.wos_production_orders) <> v_before.orders_count
    OR (SELECT count(*) FROM public.wos_visual_baselines) <> v_before.baselines_count
    OR (SELECT count(*) FROM public.wos_visual_baseline_items)
      <> v_before.baseline_items_count
    OR (SELECT count(*) FROM public.wos_reference_images)
      <> v_before.reference_images_count
    OR (SELECT count(*) FROM public.wos_qa_verified_image_proofs)
      <> v_before.proofs_count
    OR (SELECT count(*) FROM public.wos_qa_p2_m2_receipts)
      <> v_before.receipts_count
    OR (SELECT count(*) FROM storage.objects) <> v_before.storage_objects_count
  THEN
    RAISE EXCEPTION 'M4_ROLLBACK_BUSINESS_DATA_CHANGED';
  END IF;

  IF (
    SELECT encode(sha256(convert_to(
      COALESCE(string_agg(to_jsonb(row_value)::text, E'\n' ORDER BY row_value.id), ''),
      'UTF8'
    )), 'hex')
    FROM public.wos_production_orders row_value
  ) IS DISTINCT FROM v_before.orders_hash
    OR (
      SELECT encode(sha256(convert_to(
        COALESCE(string_agg(to_jsonb(row_value)::text, E'\n' ORDER BY row_value.id), ''),
        'UTF8'
      )), 'hex')
      FROM public.wos_visual_baselines row_value
    ) IS DISTINCT FROM v_before.baselines_hash
    OR (
      SELECT encode(sha256(convert_to(
        COALESCE(string_agg(
          to_jsonb(row_value)::text,
          E'\n'
          ORDER BY row_value.baseline_id, row_value.reference_image_id
        ), ''),
        'UTF8'
      )), 'hex')
      FROM public.wos_visual_baseline_items row_value
    ) IS DISTINCT FROM v_before.baseline_items_hash
    OR (
      SELECT encode(sha256(convert_to(
        COALESCE(string_agg(to_jsonb(row_value)::text, E'\n' ORDER BY row_value.id), ''),
        'UTF8'
      )), 'hex')
      FROM public.wos_reference_images row_value
    ) IS DISTINCT FROM v_before.reference_images_hash
    OR (
      SELECT encode(sha256(convert_to(
        COALESCE(string_agg(to_jsonb(row_value)::text, E'\n' ORDER BY row_value.image_id), ''),
        'UTF8'
      )), 'hex')
      FROM public.wos_qa_verified_image_proofs row_value
    ) IS DISTINCT FROM v_before.proofs_hash
    OR (
      SELECT encode(sha256(convert_to(
        COALESCE(string_agg(to_jsonb(row_value)::text, E'\n' ORDER BY row_value.request_id), ''),
        'UTF8'
      )), 'hex')
      FROM public.wos_qa_p2_m2_receipts row_value
    ) IS DISTINCT FROM v_before.receipts_hash
    OR (
      SELECT encode(sha256(convert_to(
        COALESCE(string_agg(to_jsonb(row_value)::text, E'\n' ORDER BY row_value.id), ''),
        'UTF8'
      )), 'hex')
      FROM storage.objects row_value
    ) IS DISTINCT FROM v_before.storage_objects_hash
  THEN
    RAISE EXCEPTION 'M4_ROLLBACK_BUSINESS_CONTENT_CHANGED';
  END IF;

  IF (
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
  ) IS DISTINCT FROM v_before.table_acl_hash
    OR (
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
    ) IS DISTINCT FROM v_before.schema_acl_hash
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_qa_verified_image_proofs',
      'SELECT'
    ) IS DISTINCT FROM v_before.authenticated_proof_select
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_qa_p2_m2_receipts',
      'SELECT'
    ) IS DISTINCT FROM v_before.authenticated_receipt_select
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)',
      'EXECUTE'
    ) IS DISTINCT FROM v_before.authenticated_m2_execute
    OR tests.wos_m4_catalog_fingerprint()
      IS DISTINCT FROM v_before.catalog_hash
  THEN
    RAISE EXCEPTION 'M4_ROLLBACK_ACL_CHANGED';
  END IF;
END;
$post_rollback$;

SELECT 'WOS_M4_02_PG17_ROLLBACK=PASS';
