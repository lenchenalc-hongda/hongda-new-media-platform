-- WOS V1 QA-only Storage compatibility install.
-- NOT AUTHORIZED FOR EXECUTION.
--
-- Replaces only the reviewed four WOS Storage policies on the isolated QA
-- project. Non-WOS policies and all business data are preserved.

BEGIN;

DO $guard$
DECLARE
  v_policy_names name[];
  v_wos_policy_fingerprint text;
  v_non_wos_policy_fingerprint text;
  v_expected_wos_policy_fingerprint text;
  v_expected_non_wos_policy_fingerprint text;
BEGIN
  IF current_setting(
    'wos_v1.qa_storage_compat_install_authorized',
    true
  ) IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_STORAGE_COMPAT_INSTALL_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project', true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_STORAGE_PROJECT_MISMATCH';
  END IF;
  IF current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_STORAGE_REQUIRES_PG17';
  END IF;
  IF to_regclass('public.profiles') IS NULL
    OR to_regclass('public.wos_production_orders') IS NULL
    OR to_regclass('public.wos_reference_images') IS NULL
    OR to_regclass('public.wos_qa_trusted_proof_receipts') IS NULL
    OR to_regclass('storage.objects') IS NULL
    OR to_regclass('storage.buckets') IS NULL
    OR to_regclass('wos_v1_qa_uat.closeout_controls') IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_STORAGE_PREREQUISITE_MISSING';
  END IF;
  IF to_regnamespace('wos_v1_qa_storage_compat') IS NOT NULL THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_STORAGE_COMPAT_ALREADY_INSTALLED';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets bucket
    WHERE bucket.id = 'wos-private'
      AND bucket.name = 'wos-private'
      AND bucket.public = false
      AND bucket.file_size_limit = 20971520
      AND bucket.allowed_mime_types IS NOT NULL
      AND bucket.allowed_mime_types @> ARRAY['image/png']
  ) THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_PRIVATE_BUCKET_MISMATCH';
  END IF;
  SELECT array_agg(policy.policyname ORDER BY policy.policyname)
  INTO v_policy_names
  FROM pg_catalog.pg_policies policy
  WHERE policy.schemaname = 'storage'
    AND policy.tablename = 'objects'
    AND policy.policyname LIKE 'wos\_%' ESCAPE '\';
  IF v_policy_names IS DISTINCT FROM ARRAY[
    'wos_p7_private_object_insert',
    'wos_p7_private_object_select',
    'wos_p7_storage_reader_roles',
    'wos_qa_revision_object_insert'
  ]::name[] THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_STORAGE_SOURCE_POLICY_SET_MISMATCH: %',
      v_policy_names;
  END IF;
  SELECT md5(jsonb_build_object(
    'policies',(
      SELECT jsonb_agg(jsonb_build_object(
        'name',policy.policyname,
        'permissive',policy.permissive,
        'roles',policy.roles::text[],
        'command',policy.cmd,
        'qual',policy.qual,
        'withCheck',policy.with_check
      ) ORDER BY policy.policyname)
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname LIKE 'wos\_%' ESCAPE '\'
    )
  )::text)
  INTO v_wos_policy_fingerprint;
  SELECT md5(jsonb_build_object(
    'policies',(
      SELECT jsonb_agg(jsonb_build_object(
        'name',policy.policyname,
        'permissive',policy.permissive,
        'roles',policy.roles::text[],
        'command',policy.cmd,
        'qual',policy.qual,
        'withCheck',policy.with_check
      ) ORDER BY policy.policyname)
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname NOT LIKE 'wos\_%' ESCAPE '\'
    )
  )::text)
  INTO v_non_wos_policy_fingerprint;
  IF current_setting('wos_v1.qa_storage_local_test', true) = 'yes'
    AND current_database() LIKE '%\_ci' ESCAPE '\'
  THEN
    v_expected_wos_policy_fingerprint := current_setting(
      'wos_v1.qa_storage_expected_wos_fingerprint',
      true
    );
    v_expected_non_wos_policy_fingerprint := current_setting(
      'wos_v1.qa_storage_expected_non_wos_fingerprint',
      true
    );
  ELSE
    v_expected_wos_policy_fingerprint :=
      'f9759e0644e82ff4264efa42ac54e57c';
    v_expected_non_wos_policy_fingerprint :=
      'f64fe08ac8669875ee9f7f3d4bbbc60f';
  END IF;
  IF v_expected_wos_policy_fingerprint IS NULL
    OR v_expected_non_wos_policy_fingerprint IS NULL
    OR v_wos_policy_fingerprint IS DISTINCT FROM
      v_expected_wos_policy_fingerprint
    OR v_non_wos_policy_fingerprint IS DISTINCT FROM
      v_expected_non_wos_policy_fingerprint
  THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_STORAGE_SOURCE_POLICY_FINGERPRINT_MISMATCH';
  END IF;
END;
$guard$;

CREATE SCHEMA wos_v1_qa_storage_compat;
REVOKE ALL ON SCHEMA wos_v1_qa_storage_compat
  FROM PUBLIC, anon, authenticated;

CREATE TABLE wos_v1_qa_storage_compat.policy_backup (
  policy_name name PRIMARY KEY,
  permissive text NOT NULL,
  roles name[] NOT NULL,
  command text NOT NULL,
  qual text,
  with_check text,
  backup_order integer NOT NULL
);
ALTER TABLE wos_v1_qa_storage_compat.policy_backup
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wos_v1_qa_storage_compat.policy_backup
  FROM PUBLIC, anon, authenticated;

CREATE TABLE wos_v1_qa_storage_compat.install_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  authorization_id text NOT NULL,
  source_policy_fingerprint text NOT NULL,
  non_wos_policy_fingerprint text NOT NULL,
  source_policy_count integer NOT NULL CHECK (source_policy_count = 4),
  bucket_public boolean NOT NULL,
  bucket_file_size_limit bigint NOT NULL,
  bucket_allowed_mime_types text[],
  installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE wos_v1_qa_storage_compat.install_state
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wos_v1_qa_storage_compat.install_state
  FROM PUBLIC, anon, authenticated;

INSERT INTO wos_v1_qa_storage_compat.policy_backup(
  policy_name,
  permissive,
  roles,
  command,
  qual,
  with_check,
  backup_order
)
SELECT
  policy.policyname,
  policy.permissive,
  policy.roles,
  policy.cmd,
  policy.qual,
  policy.with_check,
  row_number() OVER (ORDER BY policy.policyname)
FROM pg_catalog.pg_policies policy
WHERE policy.schemaname = 'storage'
  AND policy.tablename = 'objects'
  AND policy.policyname LIKE 'wos\_%' ESCAPE '\';

INSERT INTO wos_v1_qa_storage_compat.install_state(
  authorization_id,
  source_policy_fingerprint,
  non_wos_policy_fingerprint,
  source_policy_count,
  bucket_public,
  bucket_file_size_limit,
  bucket_allowed_mime_types
)
SELECT
  'WOS-V1-PRODUCTION-M2-QA-UAT-007',
  md5(jsonb_build_object(
    'wosPolicies',(
      SELECT jsonb_agg(jsonb_build_object(
        'name',policy.policyname,
        'permissive',policy.permissive,
        'roles',policy.roles::text[],
        'command',policy.cmd,
        'qual',policy.qual,
        'withCheck',policy.with_check
      ) ORDER BY policy.policyname)
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname LIKE 'wos\_%' ESCAPE '\'
    ),
    'nonWosPolicies',(
      SELECT jsonb_agg(jsonb_build_object(
        'name',policy.policyname,
        'permissive',policy.permissive,
        'roles',policy.roles::text[],
        'command',policy.cmd,
        'qual',policy.qual,
        'withCheck',policy.with_check
      ) ORDER BY policy.policyname)
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname NOT LIKE 'wos\_%' ESCAPE '\'
    )
  )::text),
  md5(jsonb_build_object(
    'nonWosPolicies',(
      SELECT jsonb_agg(jsonb_build_object(
        'name',policy.policyname,
        'permissive',policy.permissive,
        'roles',policy.roles::text[],
        'command',policy.cmd,
        'qual',policy.qual,
        'withCheck',policy.with_check
      ) ORDER BY policy.policyname)
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname NOT LIKE 'wos\_%' ESCAPE '\'
    )
  )::text),
  4,
  (SELECT bucket.public FROM storage.buckets bucket
   WHERE bucket.id='wos-private'),
  (SELECT bucket.file_size_limit FROM storage.buckets bucket
   WHERE bucket.id='wos-private'),
  (SELECT bucket.allowed_mime_types FROM storage.buckets bucket
   WHERE bucket.id='wos-private');

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png']
WHERE id = 'wos-private';

DO $drop_source_policies$
DECLARE
  policy_name name;
BEGIN
  FOR policy_name IN
    SELECT backup.policy_name
    FROM wos_v1_qa_storage_compat.policy_backup backup
    ORDER BY backup.backup_order DESC
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON storage.objects',
      policy_name
    );
  END LOOP;
END;
$drop_source_policies$;

CREATE FUNCTION public.wos_v1_qa_storage_write_allowed(
  p_order_id uuid,
  p_version_label text,
  p_category text,
  p_storage_path text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $write_allowed$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL
    OR p_order_id IS NULL
    OR p_version_label IS NULL
    OR p_category IS NULL
    OR p_storage_path IS NULL
    OR p_category NOT IN (
      'PRODUCT',
      'FILM_PATTERN',
      'CUSTOMER_APPROVED_SAMPLE',
      'SIGNED_SAMPLE'
    )
  THEN
    RETURN false;
  END IF;
  SELECT profile.* INTO v_actor
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'sales')
  ORDER BY profile.id
  LIMIT 2;
  IF NOT FOUND OR
    (SELECT count(*) FROM public.profiles profile
     WHERE profile.user_id = auth.uid()
       AND profile.is_active = true
       AND profile.role IN ('admin', 'manager', 'sales')) <> 1
  THEN
    RETURN false;
  END IF;
  SELECT production_order.* INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
    AND production_order.organization_id = v_actor.org_id;
  IF NOT FOUND
    OR v_order.version_label IS DISTINCT FROM p_version_label
    OR NOT (
      (
        v_order.version_label = 'V1'
        AND v_order.workflow_status = 'DRAFT'
      )
      OR (
        v_order.version_label ~ '^V[2-9][0-9]{0,20}$'
        AND v_order.workflow_status = 'NEEDS_INFORMATION'
      )
    )
    OR (
      v_actor.role = 'sales'
      AND v_actor.id NOT IN (
        v_order.created_by_profile_id,
        v_order.sales_owner_profile_id
      )
    )
    OR NOT EXISTS (
      SELECT 1
      FROM wos_v1_qa_uat.closeout_controls control
      WHERE control.authorization_id =
          'WOS-V1-PRODUCTION-M2-QA-UAT-007'
        AND control.project_ref = 'xulmpqaknlwqqculbsek'
        AND control.authorized_order_id = v_order.id
        AND control.authorized_organization_id = v_actor.org_id
        AND control.authorized_actor_profile_id = v_actor.id
        AND control.db_state = 'ARMED'
        AND control.edge_state = 'ARMED'
        AND control.write_deadline_at > clock_timestamp()
        AND control.db_last_heartbeat_at >
          clock_timestamp() - interval '30 seconds'
        AND control.edge_last_heartbeat_at >
          clock_timestamp() - interval '30 seconds'
    )
    OR p_storage_path <>
      'organizations/' || v_actor.org_id::text
      || '/wos/production-order/' || v_order.id::text
      || '/images/'
      || (CASE p_category
        WHEN 'PRODUCT' THEN 'product'
        WHEN 'FILM_PATTERN' THEN 'film-pattern'
        WHEN 'CUSTOMER_APPROVED_SAMPLE' THEN
          'customer-approved-sample'
        WHEN 'SIGNED_SAMPLE' THEN 'signed-sample'
      END)
      || '/versions/' || v_order.version_label || '/'
      || (storage.foldername(p_storage_path))[10]
      || '/source.png'
  THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$write_allowed$;

CREATE FUNCTION public.wos_v1_qa_storage_read_allowed(
  p_order_id uuid,
  p_version_label text,
  p_storage_path text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $read_allowed$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
  v_image public.wos_reference_images%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL
    OR p_order_id IS NULL
    OR p_version_label IS NULL
    OR p_storage_path IS NULL
  THEN
    RETURN false;
  END IF;
  SELECT profile.* INTO v_actor
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN (
      'admin',
      'manager',
      'sales',
      'operator',
      'workshop',
      'technician'
    )
  ORDER BY profile.id
  LIMIT 2;
  IF NOT FOUND OR
    (SELECT count(*) FROM public.profiles profile
     WHERE profile.user_id = auth.uid()
       AND profile.is_active = true
       AND profile.role IN (
         'admin',
         'manager',
         'sales',
         'operator',
         'workshop',
         'technician'
       )) <> 1
  THEN
    RETURN false;
  END IF;
  SELECT production_order.* INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
    AND production_order.organization_id = v_actor.org_id;
  IF NOT FOUND
    OR v_order.version_label IS DISTINCT FROM p_version_label
    OR (
      v_actor.role = 'sales'
      AND v_actor.id NOT IN (
        v_order.created_by_profile_id,
        v_order.sales_owner_profile_id
      )
    )
    OR (
      v_actor.role IN ('operator', 'workshop', 'technician')
      AND v_order.workflow_status NOT IN (
        'SUBMITTED',
        'WORKSHOP_REVIEW',
        'WAITING_MATERIAL',
        'READINESS_CHECK'
      )
    )
    OR NOT EXISTS (
      SELECT 1
      FROM wos_v1_qa_uat.closeout_controls control
      WHERE control.authorization_id =
          'WOS-V1-PRODUCTION-M2-QA-UAT-007'
        AND control.project_ref = 'xulmpqaknlwqqculbsek'
        AND control.authorized_order_id = v_order.id
        AND control.authorized_organization_id = v_actor.org_id
        AND control.db_state = 'ARMED'
        AND control.edge_state = 'ARMED'
        AND control.write_deadline_at > clock_timestamp()
        AND control.db_last_heartbeat_at >
          clock_timestamp() - interval '30 seconds'
        AND control.edge_last_heartbeat_at >
          clock_timestamp() - interval '30 seconds'
    )
  THEN
    RETURN false;
  END IF;
  SELECT image.* INTO v_image
  FROM public.wos_reference_images image
  WHERE image.organization_id = v_actor.org_id
    AND image.entity_type = 'PRODUCTION_ORDER'
    AND image.entity_id = v_order.id
    AND image.version_label = v_order.version_label
    AND image.storage_bucket = 'wos-private'
    AND image.storage_path = p_storage_path
    AND image.image_status = 'READY'
    AND image.superseded_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF p_storage_path <>
    'organizations/' || v_actor.org_id::text
    || '/wos/production-order/' || v_order.id::text
    || '/images/'
    || (CASE v_image.category
      WHEN 'PRODUCT' THEN 'product'
      WHEN 'FILM_PATTERN' THEN 'film-pattern'
      WHEN 'CUSTOMER_APPROVED_SAMPLE' THEN
        'customer-approved-sample'
      WHEN 'SIGNED_SAMPLE' THEN 'signed-sample'
      ELSE '__unsupported__'
    END)
    || '/versions/' || v_order.version_label || '/'
    || v_image.id::text || '/source.png'
  THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.wos_qa_trusted_proof_receipts proof
    JOIN storage.objects object
      ON object.id = proof.storage_object_id
      AND object.bucket_id = 'wos-private'
      AND object.name = v_image.storage_path
    WHERE proof.organization_id = v_actor.org_id
      AND proof.order_id = v_order.id
      AND proof.image_id = v_image.id
      AND proof.proof_status = 'VERIFIED'
      AND proof.created_at >
        clock_timestamp() - interval '600 seconds'
      AND proof.storage_object_version IS NOT DISTINCT FROM object.version
      AND proof.storage_object_updated_at
        IS NOT DISTINCT FROM object.updated_at
      AND proof.after_sha256 ~ '^[a-f0-9]{64}$'
      AND proof.storage_object_version IS NOT DISTINCT FROM object.version
      AND proof.storage_object_updated_at
        IS NOT DISTINCT FROM object.updated_at
  );
END;
$read_allowed$;

REVOKE ALL ON FUNCTION public.wos_v1_qa_storage_write_allowed(
  uuid,text,text,text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wos_v1_qa_storage_read_allowed(
  uuid,text,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wos_v1_qa_storage_write_allowed(
  uuid,text,text,text
) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wos_v1_qa_storage_read_allowed(
  uuid,text,text
) TO anon, authenticated;

CREATE POLICY wos_qa_uat_private_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'wos-private'
  AND (storage.foldername(name))[1] = 'organizations'
  AND (storage.foldername(name))[2] ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (storage.foldername(name))[3] = 'wos'
  AND (storage.foldername(name))[4] = 'production-order'
  AND (storage.foldername(name))[5] ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (storage.foldername(name))[6] = 'images'
  AND (storage.foldername(name))[7] IN (
    'product',
    'film-pattern',
    'customer-approved-sample',
    'signed-sample'
  )
  AND (storage.foldername(name))[8] = 'versions'
  AND (storage.foldername(name))[9] ~ '^V[1-9][0-9]{0,20}$'
  AND (storage.foldername(name))[10] ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND storage.filename(name) = 'source.png'
  AND public.wos_v1_qa_storage_write_allowed(
    (storage.foldername(name))[5]::uuid,
    (storage.foldername(name))[9],
    CASE (storage.foldername(name))[7]
      WHEN 'product' THEN 'PRODUCT'
      WHEN 'film-pattern' THEN 'FILM_PATTERN'
      WHEN 'customer-approved-sample' THEN
        'CUSTOMER_APPROVED_SAMPLE'
      WHEN 'signed-sample' THEN 'SIGNED_SAMPLE'
    END,
    name
  )
);

CREATE POLICY wos_qa_uat_private_insert_guard
ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id IS DISTINCT FROM 'wos-private'
  OR public.wos_v1_qa_storage_write_allowed(
    CASE
      WHEN (storage.foldername(name))[5] ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (storage.foldername(name))[5]::uuid
    END,
    (storage.foldername(name))[9],
    CASE (storage.foldername(name))[7]
      WHEN 'product' THEN 'PRODUCT'
      WHEN 'film-pattern' THEN 'FILM_PATTERN'
      WHEN 'customer-approved-sample' THEN
        'CUSTOMER_APPROVED_SAMPLE'
      WHEN 'signed-sample' THEN 'SIGNED_SAMPLE'
    END,
    name
  )
);

CREATE POLICY wos_qa_uat_private_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'wos-private'
  AND (storage.foldername(name))[1] = 'organizations'
  AND (storage.foldername(name))[2] ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (storage.foldername(name))[3] = 'wos'
  AND (storage.foldername(name))[4] = 'production-order'
  AND (storage.foldername(name))[5] ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (storage.foldername(name))[6] = 'images'
  AND (storage.foldername(name))[7] IN (
    'product',
    'film-pattern',
    'customer-approved-sample',
    'signed-sample'
  )
  AND (storage.foldername(name))[8] = 'versions'
  AND (storage.foldername(name))[9] ~ '^V[1-9][0-9]{0,20}$'
  AND (storage.foldername(name))[10] ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND storage.filename(name) = 'source.png'
  AND public.wos_v1_qa_storage_read_allowed(
    (storage.foldername(name))[5]::uuid,
    (storage.foldername(name))[9],
    name
  )
);

CREATE POLICY wos_qa_uat_private_select_guard
ON storage.objects AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (
  bucket_id IS DISTINCT FROM 'wos-private'
  OR public.wos_v1_qa_storage_read_allowed(
    CASE
      WHEN (storage.foldername(name))[5] ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (storage.foldername(name))[5]::uuid
    END,
    (storage.foldername(name))[9],
    name
  )
);

DO $postcheck$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname LIKE 'wos\_%' ESCAPE '\'
  ) <> 4
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname = 'wos_qa_uat_private_insert'
        AND policy.cmd = 'INSERT'
        AND policy.permissive = 'PERMISSIVE'
        AND policy.roles = ARRAY['authenticated']::name[]
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname = 'wos_qa_uat_private_insert_guard'
        AND policy.cmd = 'INSERT'
        AND policy.permissive = 'RESTRICTIVE'
        AND policy.roles @> ARRAY['anon','authenticated']::name[]
        AND cardinality(policy.roles) = 2
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname = 'wos_qa_uat_private_select'
        AND policy.cmd = 'SELECT'
        AND policy.permissive = 'PERMISSIVE'
        AND policy.roles = ARRAY['authenticated']::name[]
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname = 'wos_qa_uat_private_select_guard'
        AND policy.cmd = 'SELECT'
        AND policy.permissive = 'RESTRICTIVE'
        AND policy.roles @> ARRAY['anon','authenticated']::name[]
        AND cardinality(policy.roles) = 2
    )
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_STORAGE_POLICY_INSTALL_INVALID';
  END IF;
  IF (
    SELECT bucket.allowed_mime_types
    FROM storage.buckets bucket
    WHERE bucket.id='wos-private'
  ) IS DISTINCT FROM ARRAY['image/png']::text[] THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_STORAGE_BUCKET_MIME_INVALID';
  END IF;
END;
$postcheck$;

COMMIT;

-- NOT_AUTHORIZED
