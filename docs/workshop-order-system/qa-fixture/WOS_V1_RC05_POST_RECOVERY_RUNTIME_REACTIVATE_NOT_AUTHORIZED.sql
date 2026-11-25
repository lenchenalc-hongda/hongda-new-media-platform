-- WOS V1 RC05 POST-RECOVERY RUNTIME REACTIVATION
-- QA ONLY / NOT AUTHORIZED. The six V1 Runtime data tables and all their
-- existing rows are retained; this file recreates ONLY the four overridden
-- P7 API functions after exact preflight, not new tables or receipts.
-- Never apply Production Runtime Forward to this retained state.

BEGIN;

DO $rc05_runtime_reactivation_guard$
DECLARE
  v_expected jsonb;
  v_actual jsonb;
BEGIN
  IF current_setting('wos_v1.rc05_post_recovery_runtime_authorized',true)
    IS DISTINCT FROM 'yes'
    OR current_setting('wos_v1.rc05_qa_project',true)
      IS DISTINCT FROM 'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'RC05_POST_RECOVERY_RUNTIME_NOT_AUTHORIZED';
  END IF;
  IF to_regnamespace('wos_qa_safety') IS NULL
    OR to_regnamespace('wos_v1_rc03_compat') IS NULL
    OR to_regnamespace('wos_v1_rc02_safety') IS NOT NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id='0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid
    )
    OR to_regclass('public.wos_verified_image_proofs') IS NULL
    OR to_regclass('public.wos_orphan_cleanup_claims') IS NULL
    OR to_regclass('public.wos_order_create_receipts') IS NULL
    OR to_regclass('public.wos_operator_action_receipts') IS NULL
    OR to_regclass('public.wos_operator_review_receipts') IS NULL
    OR to_regclass('public.wos_office_revisions') IS NULL
    OR to_regclass('public.wos_qa_p2_execution_gate') IS NULL
    OR to_regclass('public.wos_qa_p2_office_execution_gate') IS NULL
    OR to_regclass('public.wos_qa_p2_m2_gate') IS NULL
    OR to_regprocedure(
      'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'RC05_RUNTIME_RETAINED_QA_STATE_MISMATCH';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.wos_qa_p2_m2_gate WHERE enabled
  ) OR EXISTS (
    SELECT 1 FROM public.wos_qa_p2_office_execution_gate WHERE enabled
  ) OR EXISTS (
    SELECT 1 FROM public.wos_qa_p2_execution_gate WHERE enabled
  ) OR (
    SELECT count(*) FROM public.wos_qa_p2_m2_gate
    WHERE gate_name IN ('M2_OFFICE_WRITES','M2_OPERATOR_WRITES')
      AND NOT enabled
  ) <> 2 OR (
    SELECT count(*) FROM public.wos_qa_p2_office_execution_gate
    WHERE gate_name = 'OFFICE_WRITES'
      AND NOT enabled
  ) <> 1 OR (
    SELECT count(*) FROM public.wos_qa_p2_execution_gate
    WHERE gate_name = 'OPERATOR_WRITES'
      AND NOT enabled
  ) <> 1 THEN
    RAISE EXCEPTION 'RC05_RUNTIME_RETAINED_QA_GATE_MISMATCH';
  END IF;
  IF (
    SELECT pg_catalog.pg_get_userbyid(p.proowner)
    FROM pg_catalog.pg_proc p
    WHERE p.oid = to_regprocedure(
      'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'
    )
  ) IS DISTINCT FROM 'postgres'
    OR NOT COALESCE((
      SELECT p.prosecdef
      FROM pg_catalog.pg_proc p
      WHERE p.oid = to_regprocedure(
        'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'
      )
    ), false)
    OR (
      SELECT p.proconfig
      FROM pg_catalog.pg_proc p
      WHERE p.oid = to_regprocedure(
        'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'
      )
    ) IS DISTINCT FROM ARRAY['search_path=""']::text[]
    OR (
      SELECT pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid),'UTF8')
        ),
        'hex'
      )
      FROM pg_catalog.pg_proc p
      WHERE p.oid = to_regprocedure(
        'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'
      )
    ) IS DISTINCT FROM
      'be003e28743691c216784030dcd163612185d10eae3481ab67087e566e326830'
    OR COALESCE((
      SELECT p.proacl::text
      FROM pg_catalog.pg_proc p
      WHERE p.oid = to_regprocedure(
        'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'
      )
    ), '') IS DISTINCT FROM
      '{postgres=X/postgres,service_role=X/postgres}'
    OR NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'anon',
      'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'RC05_RUNTIME_M2_IDENTITY_MISMATCH';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.wos_v1_pre_runtime_confirm_office_completeness(uuid,integer,text,text)'),
      ('public.wos_v1_pre_runtime_submit_production_order(uuid,integer,text,uuid)'),
      ('public.wos_v1_pre_runtime_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'),
      ('public.wos_v1_pre_runtime_register_uploaded_reference_image(uuid,uuid,text,text)')
    ) v(signature)
    WHERE to_regprocedure(v.signature) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'RC05_RUNTIME_PREEXISTING_P7_BACKUP';
  END IF;
  IF (
    SELECT count(*) FROM wos_v1_rc03_compat.function_definition_backup
  ) <> 5 OR (
    SELECT count(*) FROM wos_v1_rc03_compat.public_policy_backup
  ) <> 3 THEN
    RAISE EXCEPTION 'RC05_RUNTIME_COMPAT_BACKUPS_MISSING';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (
      VALUES
        ('public.wos_confirm_office_completeness(uuid,integer,text,text)'),
        ('public.wos_submit_production_order(uuid,integer,text,uuid)'),
        ('public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'),
        ('public.wos_register_uploaded_reference_image(uuid,uuid,text,text)')
    ) v(signature)
    LEFT JOIN wos_v1_rc03_compat.function_definition_backup backup
      ON backup.function_name::regprocedure = to_regprocedure(v.signature)
    LEFT JOIN pg_catalog.pg_proc p
      ON p.oid=to_regprocedure(v.signature)
    WHERE p.oid IS NULL
      OR backup.function_name IS NULL
      OR encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
         IS DISTINCT FROM backup.definition_sha256
      OR COALESCE(p.proacl::text,'') IS DISTINCT FROM backup.acl
  ) THEN
    RAISE EXCEPTION 'RC05_RUNTIME_P7_FUNCTION_DRIFT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.wos_v1_assert_current_image_set(uuid,uuid,text)', 'bcf4fdf23d0afbfefb5dbfee82258f42a78e43b1a4b2c12b01bf2db3aa1e972d'),
      ('public.wos_v1_assert_service_role_request()', '8721b150db96638ad51d19d29dbe528dda9b6eeefdc381401389e665f2371c13'),
      ('public.wos_create_production_order(uuid,jsonb)', 'cbcddbfe790cc10d51c53bcc274c485bcd03654b3c51a432128d37f8f24447fb'),
      ('public.wos_operator_order_action(uuid,integer,uuid,text,text)', '5de263f52aa72b8b6921dfe1b2caa90a1d5c81d9e31265d5e2b199e0c7f530e5'),
      ('public.wos_office_save_correction(uuid,integer,uuid,jsonb,text)', 'd1a0478dbe12c9d28cd2a1a897fcfde7182c6189c81d772e86763e361e68190f'),
      ('public.wos_office_resubmit_order(uuid,integer,uuid,text)', '0ae618b3ecb693edbd3eaaad1f8fb74cff89f643f15c554696fd6d50878de674'),
      ('public.wos_operator_review_correction(uuid,integer,uuid,text)', '5376f1d028ea9034e619c963a707a2814b1ea4daaaec6895f43fa00b3e14a0bc'),
      ('public.wos_v1_renew_expired_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)', 'b5c4ec9be8118374b374c1844b44f24d392cda265790e4a502551bdc2ff1a294')
    ) expected(signature,definition_sha)
    LEFT JOIN pg_catalog.pg_proc p
      ON p.oid=to_regprocedure(expected.signature)
    WHERE p.oid IS NULL
      OR encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
        IS DISTINCT FROM expected.definition_sha
      OR pg_catalog.has_function_privilege(
        'authenticated',p.oid,'EXECUTE'
      )
  ) THEN
    RAISE EXCEPTION 'RC05_RUNTIME_RETAINED_FUNCTION_DRIFT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (
      VALUES
        ('wos_verified_image_proofs'),
        ('wos_orphan_cleanup_claims'),
        ('wos_order_create_receipts'),
        ('wos_operator_action_receipts'),
        ('wos_operator_review_receipts'),
        ('wos_office_revisions')
    ) t(table_name)
    JOIN pg_catalog.pg_class c
      ON c.oid=to_regclass('public.'||t.table_name)
    WHERE NOT c.relrowsecurity
      OR c.relowner IS DISTINCT FROM 'postgres'::regrole
      OR pg_catalog.has_table_privilege(
        'authenticated',c.oid,'INSERT'
      )
  ) THEN
    RAISE EXCEPTION 'RC05_RUNTIME_RETAINED_TABLE_ACL_DRIFT';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets b
    WHERE b.id='wos-private'
      AND b.public=false
      AND b.allowed_mime_types=ARRAY['image/png']::text[]
  ) OR (SELECT count(*) FROM pg_catalog.pg_policies
    WHERE schemaname='storage'
      AND tablename='objects'
      AND policyname IN ('wos_p8_private_insert','wos_p8_private_select')
  ) <> 2
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies p
      JOIN wos_v1_rc03_compat.public_policy_backup b
        ON b.table_name=p.tablename AND b.policy_name=p.policyname
      WHERE p.schemaname='public'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated','public.wos_production_orders','INSERT'
    )
  THEN
    RAISE EXCEPTION 'RC05_RUNTIME_FOUNDATION_NOT_CONTAINED';
  END IF;
  v_expected:=NULLIF(
    current_setting('wos_v1.rc05_expected_runtime_counts',true),''
  )::jsonb;
  IF v_expected IS NULL OR jsonb_typeof(v_expected)<>'object' THEN
    RAISE EXCEPTION 'RC05_RUNTIME_COUNTS_NOT_PINNED';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'runtime_proofs',(SELECT count(*) FROM public.wos_verified_image_proofs),
    'orphan_claims',(SELECT count(*) FROM public.wos_orphan_cleanup_claims),
    'create_receipts',(SELECT count(*) FROM public.wos_order_create_receipts),
    'operator_action_receipts',(SELECT count(*) FROM public.wos_operator_action_receipts),
    'operator_review_receipts',(SELECT count(*) FROM public.wos_operator_review_receipts),
    'office_revisions',(SELECT count(*) FROM public.wos_office_revisions)
  ) INTO v_actual;
  IF v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'RC05_RUNTIME_RETAINED_COUNTS_CHANGED';
  END IF;
END;
$rc05_runtime_reactivation_guard$;

-- Rename original P7 functions, preserving their original definitions/ACL
-- and enabling the existing RC03 Recovery to restore them atomically.
ALTER FUNCTION public.wos_confirm_office_completeness(uuid,integer,text,text)
  RENAME TO wos_v1_pre_runtime_confirm_office_completeness;
ALTER FUNCTION public.wos_submit_production_order(uuid,integer,text,uuid)
  RENAME TO wos_v1_pre_runtime_submit_production_order;
ALTER FUNCTION public.wos_p7_record_trusted_image_proof(
  uuid,uuid,uuid,text,uuid,text,timestamptz,text
) RENAME TO wos_v1_pre_runtime_record_trusted_image_proof;
ALTER FUNCTION public.wos_register_uploaded_reference_image(
  uuid,uuid,text,text
) RENAME TO wos_v1_pre_runtime_register_uploaded_reference_image;

-- Exact four P7 replacement bodies are sourced unchanged from the reviewed
-- Production-neutral Runtime Forward at the same GitHub HEAD.
CREATE OR REPLACE FUNCTION public.wos_register_uploaded_reference_image(
  p_order_id uuid,
  p_image_id uuid,
  p_category text,
  p_storage_path text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $register_image$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
  v_object storage.objects%ROWTYPE;
  v_row public.wos_reference_images%ROWTYPE;
  v_category_slug text;
  v_prefix text;
  v_filename text;
  v_mime text;
  v_size bigint;
BEGIN
  SELECT * INTO v_actor
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'sales');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_order_id IS NULL
    OR p_image_id IS NULL
    OR p_storage_path IS NULL
    OR length(p_storage_path) > 1024
    OR p_category NOT IN (
      'PRODUCT',
      'FILM_PATTERN',
      'CUSTOMER_APPROVED_SAMPLE',
      'SIGNED_SAMPLE'
    )
  THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  v_category_slug := replace(lower(p_category), '_', '-');
  SELECT * INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_order.organization_id <> v_actor.org_id
    OR (v_actor.role = 'sales' AND v_actor.id NOT IN (
      v_order.created_by_profile_id,
      v_order.sales_owner_profile_id
    ))
  THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF v_order.workflow_status NOT IN ('DRAFT', 'NEEDS_INFORMATION')
    OR v_order.version_label !~ '^V[1-9][0-9]{0,20}$'
  THEN
    RAISE EXCEPTION 'UNSUPPORTED_ORDER_VERSION' USING ERRCODE = '23514';
  END IF;

  v_prefix := 'organizations/' || v_order.organization_id::text
    || '/wos/production-order/' || v_order.id::text
    || '/images/' || v_category_slug
    || '/versions/' || v_order.version_label || '/'
    || p_image_id::text || '/';
  IF left(p_storage_path, length(v_prefix)) <> v_prefix
    OR length(p_storage_path) <= length(v_prefix)
  THEN
    RAISE EXCEPTION 'INVALID_STORAGE_PATH' USING ERRCODE = '23514';
  END IF;
  v_filename := substring(p_storage_path FROM length(v_prefix) + 1);
  IF v_filename !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}[.]png$'
    OR position('..' in v_filename) > 0
  THEN
    RAISE EXCEPTION 'INVALID_STORAGE_FILE' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_object
  FROM storage.objects object
  WHERE object.bucket_id = 'wos-private'
    AND object.name = p_storage_path
    AND object.owner_id = auth.uid()::text
    AND object.is_delete_marker = false
    AND object.archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRIVATE_STORAGE_OBJECT_NOT_VERIFIED'
      USING ERRCODE = '23514';
  END IF;
  v_mime := v_object.metadata->>'mimetype';
  IF v_mime <> 'image/png'
    OR COALESCE(v_object.metadata->>'size', '') !~ '^[0-9]+$'
  THEN
    RAISE EXCEPTION 'TRUSTED_PNG_ONLY' USING ERRCODE = '23514';
  END IF;
  v_size := (v_object.metadata->>'size')::bigint;
  IF v_size NOT BETWEEN 60 AND 20971520 THEN
    RAISE EXCEPTION 'UNSUPPORTED_IMAGE_SIZE' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_row
  FROM public.wos_reference_images image
  WHERE image.id = p_image_id;
  IF FOUND THEN
    IF v_row.organization_id <> v_actor.org_id
      OR v_row.entity_id <> p_order_id
      OR v_row.storage_bucket <> 'wos-private'
      OR v_row.storage_path <> p_storage_path
      OR v_row.category <> p_category
      OR v_row.image_status <> 'READY'
      OR v_row.version_label <> v_order.version_label
    THEN
      RAISE EXCEPTION 'IMAGE_ID_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'status', 'REPLAYED',
      'imageId', v_row.id,
      'bucket', 'wos-private'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.wos_verified_image_proofs proof
    WHERE proof.image_id = p_image_id
      AND proof.order_id = p_order_id
      AND proof.organization_id = v_actor.org_id
      AND proof.actor_user_id = auth.uid()
      AND proof.storage_bucket = 'wos-private'
      AND proof.storage_path = p_storage_path
      AND proof.storage_object_id = v_object.id
      AND proof.storage_object_version
        IS NOT DISTINCT FROM v_object.version
      AND proof.storage_object_updated_at
        IS NOT DISTINCT FROM v_object.updated_at
      AND proof.expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'TRUSTED_BINARY_PROOF_REQUIRED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.wos_reference_images (
    id, organization_id, entity_type, entity_id, category,
    storage_bucket, storage_path, file_name, mime_type, file_size,
    version_label, image_status, uploaded_by_profile_id
  ) VALUES (
    p_image_id, v_actor.org_id, 'PRODUCTION_ORDER', p_order_id, p_category,
    'wos-private', p_storage_path, v_filename, v_mime, v_size,
    v_order.version_label, 'READY', v_actor.id
  );
  RETURN jsonb_build_object(
    'status', 'CREATED',
    'imageId', p_image_id,
    'bucket', 'wos-private'
  );
END;
$register_image$;

REVOKE ALL ON FUNCTION public.wos_register_uploaded_reference_image(
  uuid,uuid,text,text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.wos_p7_record_trusted_image_proof(
  p_image_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid,
  p_storage_path text,
  p_storage_object_id uuid,
  p_storage_object_version text,
  p_storage_object_updated_at timestamptz,
  p_sha256 text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $trusted_proof$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
  v_object storage.objects%ROWTYPE;
  v_old public.wos_verified_image_proofs%ROWTYPE;
  v_category_slug text;
  v_prefix text;
  v_size bigint;
  v_proof_id uuid;
BEGIN
  PERFORM public.wos_v1_assert_service_role_request();
  IF p_image_id IS NULL
    OR p_order_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_storage_object_id IS NULL
    OR p_storage_object_updated_at IS NULL
    OR p_storage_path IS NULL
    OR length(p_storage_path) > 600
    OR p_storage_object_version IS NULL
    OR length(btrim(p_storage_object_version)) = 0
    OR p_sha256 !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'INVALID_PROOF_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_actor
  FROM public.profiles profile
  WHERE profile.user_id = p_actor_user_id
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'sales')
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROOF_ACTOR_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
    AND production_order.organization_id = v_actor.org_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_order.workflow_status NOT IN ('DRAFT', 'NEEDS_INFORMATION')
    OR v_order.version_label !~ '^V[1-9][0-9]{0,20}$'
    OR (v_actor.role = 'sales' AND v_actor.id NOT IN (
      v_order.created_by_profile_id, v_order.sales_owner_profile_id
    ))
  THEN
    RAISE EXCEPTION 'PROOF_ORDER_NOT_EDITABLE' USING ERRCODE = '42501';
  END IF;

  v_category_slug := substring(
    p_storage_path
    FROM '/images/([a-z-]+)/versions/'
  );
  IF v_category_slug NOT IN (
    'product', 'film-pattern', 'customer-approved-sample', 'signed-sample'
  ) THEN
    RAISE EXCEPTION 'PROOF_CATEGORY_PATH_INVALID' USING ERRCODE = '23514';
  END IF;
  v_prefix := 'organizations/' || v_actor.org_id::text
    || '/wos/production-order/' || p_order_id::text
    || '/images/' || v_category_slug || '/versions/'
    || v_order.version_label || '/' || p_image_id::text || '/';
  IF left(p_storage_path, length(v_prefix)) <> v_prefix
    OR (storage.filename(p_storage_path)
      !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}[.]png$')
    OR position('..' IN storage.filename(p_storage_path)) > 0
  THEN
    RAISE EXCEPTION 'PROOF_IMAGE_PATH_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_object
  FROM storage.objects object
  WHERE object.bucket_id = 'wos-private'
    AND object.name = p_storage_path
    AND object.id = p_storage_object_id
    AND object.owner_id = p_actor_user_id::text
    AND object.is_delete_marker = false
    AND object.archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND
    OR v_object.updated_at IS DISTINCT FROM p_storage_object_updated_at
    OR v_object.version IS DISTINCT FROM p_storage_object_version
    OR v_object.metadata->>'mimetype' <> 'image/png'
    OR COALESCE(v_object.metadata->>'size', '') !~ '^[0-9]+$'
  THEN
    RAISE EXCEPTION 'STORAGE_OBJECT_NOT_TRUSTED' USING ERRCODE = '23514';
  END IF;
  v_size := (v_object.metadata->>'size')::bigint;
  IF v_size < 60 OR v_size > 20971520 THEN
    RAISE EXCEPTION 'PRIVATE_BINARY_SIZE_OUT_OF_RANGE' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.wos_orphan_cleanup_claims claim
    WHERE claim.storage_object_id = p_storage_object_id
      AND claim.state = 'CLAIMED'
      AND claim.lease_expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'OBJECT_CLEANUP_LEASE_ACTIVE' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.wos_verified_image_proofs (
    image_id, organization_id, order_id, actor_user_id, storage_bucket,
    storage_path, storage_object_id, storage_object_version,
    storage_object_updated_at, verified_sha256, verified_at, expires_at
  ) VALUES (
    p_image_id, v_actor.org_id, p_order_id, p_actor_user_id, 'wos-private',
    p_storage_path, p_storage_object_id, p_storage_object_version,
    p_storage_object_updated_at, p_sha256,
    clock_timestamp(), clock_timestamp() + interval '10 minutes'
  )
  ON CONFLICT (image_id) DO NOTHING
  RETURNING image_id INTO v_proof_id;

  IF v_proof_id IS NULL THEN
    SELECT * INTO v_old
    FROM public.wos_verified_image_proofs proof
    WHERE proof.image_id = p_image_id;
    IF NOT FOUND
      OR v_old.organization_id <> v_actor.org_id
      OR v_old.order_id <> p_order_id
      OR v_old.actor_user_id <> p_actor_user_id
      OR v_old.storage_path <> p_storage_path
      OR v_old.storage_object_id <> p_storage_object_id
      OR v_old.storage_object_version IS DISTINCT FROM p_storage_object_version
      OR v_old.storage_object_updated_at IS DISTINCT FROM p_storage_object_updated_at
      OR v_old.verified_sha256 <> p_sha256
      OR v_old.expires_at <= clock_timestamp()
    THEN
      RAISE EXCEPTION 'IMAGE_ID_ATTESTATION_CONFLICT' USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', 'VERIFIED',
    'imageId', p_image_id,
    'category', replace(v_category_slug, '-', '_'),
    'sha256', p_sha256
  );
END;
$trusted_proof$;

REVOKE ALL ON FUNCTION public.wos_p7_record_trusted_image_proof(
  uuid,uuid,uuid,text,uuid,text,timestamptz,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wos_p7_record_trusted_image_proof(
  uuid,uuid,uuid,text,uuid,text,timestamptz,text
) TO service_role;

CREATE FUNCTION public.wos_confirm_office_completeness(
  p_order_id uuid,
  p_expected_revision integer,
  p_expected_label text,
  p_note text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $confirm$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
  v_receipt_id uuid;
BEGIN
  SELECT * INTO v_actor
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'sales')
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_order_id IS NULL
    OR p_expected_revision IS NULL
    OR p_expected_revision < 1
    OR p_expected_label !~ '^V[1-9][0-9]{0,20}$'
    OR p_note IS NULL
    OR length(btrim(p_note)) NOT BETWEEN 10 AND 2000
  THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wos-v1-order:' || p_order_id::text, 0)
  );
  SELECT * INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
    AND production_order.organization_id = v_actor.org_id
  FOR UPDATE;
  IF NOT FOUND
    OR (v_actor.role = 'sales' AND v_actor.id NOT IN (
      v_order.created_by_profile_id, v_order.sales_owner_profile_id
    ))
  THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF v_order.workflow_status <> 'DRAFT'
    OR v_order.version <> p_expected_revision
    OR v_order.version_label <> p_expected_label
  THEN
    RAISE EXCEPTION 'STALE_OR_UNEDITABLE_ORDER' USING ERRCODE = 'PT409';
  END IF;

  PERFORM public.wos_v1_assert_current_image_set(
    p_order_id, v_actor.org_id, p_expected_label
  );

  INSERT INTO public.wos_office_readiness_receipts (
    organization_id, order_id, source_revision, source_version_label,
    actor_profile_id, note
  ) VALUES (
    v_actor.org_id, p_order_id, p_expected_revision, p_expected_label,
    v_actor.id, btrim(p_note)
  )
  ON CONFLICT (order_id, source_revision) DO NOTHING
  RETURNING id INTO v_receipt_id;

  IF v_receipt_id IS NULL THEN
    SELECT receipt.id INTO v_receipt_id
    FROM public.wos_office_readiness_receipts receipt
    WHERE receipt.order_id = p_order_id
      AND receipt.source_revision = p_expected_revision
      AND receipt.organization_id = v_actor.org_id
      AND receipt.source_version_label = p_expected_label
      AND receipt.actor_profile_id = v_actor.id
      AND receipt.note = btrim(p_note);
    IF v_receipt_id IS NULL THEN
      RAISE EXCEPTION 'READINESS_ALREADY_CONFIRMED_DIFFERENTLY'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN v_receipt_id;
END;
$confirm$;

CREATE FUNCTION public.wos_submit_production_order(
  p_order_id uuid,
  p_expected_revision integer,
  p_expected_label text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $submit$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
  v_receipt public.wos_submission_receipts%ROWTYPE;
  v_inbox_id uuid;
  v_readiness uuid;
  v_fingerprint text;
BEGIN
  SELECT * INTO v_actor
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'sales')
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_order_id IS NULL
    OR p_idempotency_key IS NULL
    OR p_expected_revision IS NULL
    OR p_expected_revision < 1
    OR p_expected_label !~ '^V[1-9][0-9]{0,20}$'
  THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'orderId', p_order_id,
    'version', p_expected_revision,
    'versionLabel', p_expected_label
  )::text, 'UTF8')), 'hex');

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wos-v1-submit:' || p_idempotency_key::text, 0)
  );
  SELECT * INTO v_receipt
  FROM public.wos_submission_receipts receipt
  WHERE receipt.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_receipt.organization_id <> v_actor.org_id
      OR v_receipt.actor_profile_id <> v_actor.id
      OR v_receipt.order_id <> p_order_id
      OR v_receipt.source_revision <> p_expected_revision
      OR v_receipt.source_version_label <> p_expected_label
      OR v_receipt.request_fingerprint <> v_fingerprint
    THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    SELECT inbox.id INTO v_inbox_id
    FROM public.wos_workshop_inbox inbox
    WHERE inbox.submission_id = v_receipt.id;
    IF v_inbox_id IS NULL THEN
      RAISE EXCEPTION 'INCOMPLETE_RECEIPT' USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object(
      'status', 'REPLAYED',
      'orderId', p_order_id,
      'receiptId', v_receipt.id,
      'inboxTaskId', v_inbox_id,
      'sourceRevision', v_receipt.source_revision,
      'submittedAt', v_receipt.created_at,
      'canStart', false
    );
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wos-v1-order:' || p_order_id::text, 0)
  );
  SELECT * INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_order.organization_id <> v_actor.org_id
    OR (v_actor.role = 'sales' AND v_actor.id NOT IN (
      v_order.created_by_profile_id, v_order.sales_owner_profile_id
    ))
  THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF v_order.workflow_status <> 'DRAFT'
    OR v_order.version <> p_expected_revision
    OR v_order.version_label <> p_expected_label
  THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  SELECT receipt.id INTO v_readiness
  FROM public.wos_office_readiness_receipts receipt
  WHERE receipt.organization_id = v_actor.org_id
    AND receipt.order_id = p_order_id
    AND receipt.source_revision = p_expected_revision
    AND receipt.source_version_label = p_expected_label;
  IF v_readiness IS NULL THEN
    RAISE EXCEPTION 'OFFICE_READINESS_REQUIRED' USING ERRCODE = '23514';
  END IF;
  PERFORM public.wos_v1_assert_current_image_set(
    p_order_id, v_actor.org_id, p_expected_label
  );

  IF EXISTS (
    SELECT 1
    FROM public.wos_orphan_cleanup_claims claim
    WHERE claim.order_id = p_order_id
      AND claim.state = 'CLAIMED'
      AND claim.lease_expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'ORPHAN_CLEANUP_IN_PROGRESS' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.wos_submission_receipts (
    organization_id, order_id, source_revision, source_version_label,
    idempotency_key, actor_profile_id, request_fingerprint
  ) VALUES (
    v_actor.org_id, p_order_id, p_expected_revision, p_expected_label,
    p_idempotency_key, v_actor.id, v_fingerprint
  ) RETURNING * INTO v_receipt;

  UPDATE public.wos_production_orders
  SET workflow_status = 'SUBMITTED',
      submitted_at = v_receipt.created_at,
      version = version + 1,
      updated_at = clock_timestamp()
  WHERE id = p_order_id
    AND organization_id = v_actor.org_id
    AND version = p_expected_revision
    AND workflow_status = 'DRAFT';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONCURRENT_VERSION_CHANGE' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.wos_workshop_inbox (
    organization_id, order_id, submission_id, source_revision, source_version_label
  ) VALUES (
    v_actor.org_id, p_order_id, v_receipt.id, p_expected_revision, p_expected_label
  ) RETURNING id INTO v_inbox_id;

  INSERT INTO public.wos_status_history (
    organization_id, entity_type, entity_id, previous_status, next_status,
    actor_profile_id, actor_role, reason_code, metadata
  ) VALUES (
    v_actor.org_id, 'PRODUCTION_ORDER', p_order_id, 'DRAFT', 'SUBMITTED',
    v_actor.id, v_actor.role, 'OFFICE_SUBMISSION_COMMITTED',
    jsonb_build_object(
      'readinessId', v_readiness,
      'receiptId', v_receipt.id,
      'inboxTaskId', v_inbox_id,
      'sourceRevision', p_expected_revision,
      'idempotencyKey', p_idempotency_key,
      'canStart', false
    )
  );

  RETURN jsonb_build_object(
    'status', 'CREATED',
    'orderId', p_order_id,
    'receiptId', v_receipt.id,
    'inboxTaskId', v_inbox_id,
    'sourceRevision', p_expected_revision,
    'submittedAt', v_receipt.created_at,
    'canStart', false
  );
END;
$submit$;



REVOKE EXECUTE ON FUNCTION public.wos_confirm_office_completeness(
  uuid,integer,text,text
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_submit_production_order(
  uuid,integer,text,uuid
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_register_uploaded_reference_image(
  uuid,uuid,text,text
) FROM PUBLIC, anon, authenticated;

DO $rc05_runtime_reactivation_postflight$
DECLARE
  v_expected jsonb;
  v_actual jsonb;
BEGIN
  IF to_regprocedure(
    'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'
  ) IS NULL
    OR (SELECT count(*) FROM pg_catalog.pg_proc p
     WHERE p.oid IN (
       'public.wos_v1_pre_runtime_confirm_office_completeness(uuid,integer,text,text)'::regprocedure,
       'public.wos_v1_pre_runtime_submit_production_order(uuid,integer,text,uuid)'::regprocedure,
       'public.wos_v1_pre_runtime_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'::regprocedure,
       'public.wos_v1_pre_runtime_register_uploaded_reference_image(uuid,uuid,text,text)'::regprocedure
     ))<>4
    OR NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_submit_production_order(uuid,integer,text,uuid)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_confirm_office_completeness(uuid,integer,text,text)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'anon',
      'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)',
      'EXECUTE'
    )
    OR (
      SELECT pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid),'UTF8')
        ),
        'hex'
      )
      FROM pg_catalog.pg_proc p
      WHERE p.oid = to_regprocedure(
        'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'
      )
    ) IS DISTINCT FROM
      'be003e28743691c216784030dcd163612185d10eae3481ab67087e566e326830'
    OR (
      SELECT p.proacl::text
      FROM pg_catalog.pg_proc p
      WHERE p.oid = to_regprocedure(
        'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'
      )
    ) IS DISTINCT FROM
      '{postgres=X/postgres,service_role=X/postgres}'
  THEN
    RAISE EXCEPTION 'RC05_RUNTIME_REACTIVATION_POSTFLIGHT_DENIED';
  END IF;
  v_expected:=NULLIF(
    current_setting('wos_v1.rc05_expected_runtime_counts',true),''
  )::jsonb;
  SELECT pg_catalog.jsonb_build_object(
    'runtime_proofs',(SELECT count(*) FROM public.wos_verified_image_proofs),
    'orphan_claims',(SELECT count(*) FROM public.wos_orphan_cleanup_claims),
    'create_receipts',(SELECT count(*) FROM public.wos_order_create_receipts),
    'operator_action_receipts',(SELECT count(*) FROM public.wos_operator_action_receipts),
    'operator_review_receipts',(SELECT count(*) FROM public.wos_operator_review_receipts),
    'office_revisions',(SELECT count(*) FROM public.wos_office_revisions)
  ) INTO v_actual;
  IF v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'RC05_RUNTIME_REACTIVATION_CHANGED_DATA';
  END IF;
END;
$rc05_runtime_reactivation_postflight$;

COMMIT;
