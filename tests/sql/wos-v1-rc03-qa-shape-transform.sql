-- Disposable PG17 only. Transforms the P7-compatible base into the current QA
-- object names, policies, MIME configuration and legacy write grant.

BEGIN;

ALTER TABLE public.wos_verified_image_proofs
  RENAME TO wos_qa_verified_image_proofs;
ALTER TABLE public.wos_orphan_cleanup_claims
  RENAME TO wos_qa_orphan_cleanup_claims;

CREATE TABLE public.wos_qa_trusted_proof_receipts (
  request_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  image_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_profile_id uuid NOT NULL,
  expected_version integer NOT NULL,
  payload_fingerprint text NOT NULL,
  proof_status text NOT NULL,
  after_sha256 text NOT NULL,
  storage_object_id uuid NOT NULL,
  storage_object_version text NOT NULL,
  storage_object_updated_at timestamptz NOT NULL,
  result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.wos_qa_trusted_proof_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_qa_trusted_proof_receipts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.wos_qa_trusted_proof_receipts
  TO service_role;

DROP POLICY IF EXISTS wos_p8_private_insert ON storage.objects;
DROP POLICY IF EXISTS wos_p8_private_select ON storage.objects;

CREATE POLICY wos_p7_private_object_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'wos-private'
  AND (storage.foldername(name))[1] = 'organizations'
  AND (storage.foldername(name))[3] = 'wos'
  AND (storage.foldername(name))[4] = 'production-order'
  AND (storage.foldername(name))[6] = 'images'
  AND (storage.foldername(name))[7] IN (
    'film-pattern',
    'product',
    'customer-approved-sample',
    'signed-sample',
    'packaging-label',
    'defect-risk',
    'other'
  )
  AND (storage.foldername(name))[8] = 'versions'
  AND (storage.foldername(name))[9] ~ '^V[1-9][0-9]{0,20}$'
  AND (storage.foldername(name))[10] ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND storage.filename(name) ~
    '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}[.](jpg|jpeg|png|webp)$'
  AND EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN public.wos_production_orders production_order
      ON production_order.organization_id = profile.org_id
    WHERE profile.user_id = auth.uid()
      AND profile.is_active
      AND profile.role IN ('admin', 'manager', 'sales')
      AND profile.org_id::text = (storage.foldername(name))[2]
      AND production_order.id::text = (storage.foldername(name))[5]
      AND production_order.workflow_status = 'DRAFT'
      AND production_order.version_label = (storage.foldername(name))[9]
  )
);

CREATE POLICY wos_p7_private_object_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'wos-private'
  AND (storage.foldername(name))[1] = 'organizations'
  AND (storage.foldername(name))[3] = 'wos'
  AND (storage.foldername(name))[4] = 'production-order'
  AND EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN public.wos_production_orders production_order
      ON production_order.organization_id = profile.org_id
    WHERE profile.user_id = auth.uid()
      AND profile.is_active
      AND profile.org_id::text = (storage.foldername(name))[2]
      AND production_order.id::text = (storage.foldername(name))[5]
      AND (
        profile.role IN ('admin', 'manager')
        OR (
          profile.role = 'operator'
          AND production_order.workflow_status = 'SUBMITTED'
        )
      )
  )
);

CREATE POLICY wos_p7_storage_reader_roles
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IS DISTINCT FROM 'wos-private'
  OR EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.user_id = auth.uid()
      AND profile.is_active
      AND profile.role IN (
        'admin', 'manager', 'sales', 'operator', 'workshop', 'technician'
      )
      AND profile.org_id::text = (storage.foldername(name))[2]
  )
);

CREATE POLICY wos_qa_revision_object_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'wos-private'
  AND (storage.foldername(name))[1] = 'organizations'
  AND (storage.foldername(name))[3] = 'wos'
  AND (storage.foldername(name))[4] = 'production-order'
  AND (storage.foldername(name))[6] = 'images'
  AND (storage.foldername(name))[7] IN (
    'film-pattern',
    'product',
    'customer-approved-sample',
    'signed-sample'
  )
  AND (storage.foldername(name))[8] = 'versions'
  AND (storage.foldername(name))[9] ~ '^QA-R[1-9][0-9]*$'
  AND storage.filename(name) ~
    '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}[.]png$'
  AND EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN public.wos_production_orders production_order
      ON production_order.organization_id = profile.org_id
    WHERE profile.user_id = auth.uid()
      AND profile.is_active
      AND profile.role IN ('admin', 'manager', 'sales')
      AND profile.org_id::text = (storage.foldername(name))[2]
      AND production_order.id::text = (storage.foldername(name))[5]
      AND production_order.workflow_status IN (
        'WAITING_MATERIAL',
        'READINESS_CHECK'
      )
      AND production_order.version_label = (storage.foldername(name))[9]
  )
);

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'wos-private';

GRANT INSERT ON public.wos_production_orders TO authenticated;

INSERT INTO auth.users(id,email) VALUES (
  '10101010-1010-4010-8010-101010101010',
  'rc03-historical-office@example.test'
)
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.profiles(
  id, user_id, org_id, full_name, role, is_active
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  '10101010-1010-4010-8010-101010101010',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  'RC03 Historical Office',
  'admin',
  true
)
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.wos_production_orders(
  id, organization_id, customer_id, customer_name_snapshot,
  project_id, project_name_snapshot, order_number, product_name,
  sales_owner_profile_id, project_owner_profile_id, priority,
  version_label, workflow_status, requested_quantity,
  current_batch_quantity, split_delivery, product_material,
  created_by_profile_id, version
) VALUES (
  '70000000-0000-4000-8000-000000000001',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  NULL,
  'RC03 Pre-existing Customer',
  NULL,
  'RC03 Pre-existing Project',
  'WOS-PROD-RC03-PREEXISTING-001',
  'RC03 Pre-existing Product',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'MEDIUM',
  'V1',
  'DRAFT',
  10,
  10,
  false,
  'RC03 Historical Material',
  '11111111-1111-4111-8111-111111111111',
  1
);

INSERT INTO storage.objects(
  id, bucket_id, name, owner_id, metadata, version, updated_at
) VALUES (
  '70000000-0000-4000-8000-000000000011',
  'wos-private',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || '70000000-0000-4000-8000-000000000001/images/product/versions/V1/'
    || '70000000-0000-4000-8000-000000000012/source.png',
  '10101010-1010-4010-8010-101010101010',
  '{"mimetype":"image/png","size":"100"}'::jsonb,
  'rc03-preexisting-proof',
  '2026-11-20T00:00:00.123456Z'
);

INSERT INTO public.wos_qa_verified_image_proofs(
  image_id, organization_id, order_id, actor_user_id,
  storage_bucket, storage_path, storage_object_id,
  storage_object_version, storage_object_updated_at,
  verified_sha256, verified_at, expires_at
) VALUES (
  '70000000-0000-4000-8000-000000000012',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  '70000000-0000-4000-8000-000000000001',
  '10101010-1010-4010-8010-101010101010',
  'wos-private',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || '70000000-0000-4000-8000-000000000001/images/product/versions/V1/'
    || '70000000-0000-4000-8000-000000000012/source.png',
  '70000000-0000-4000-8000-000000000011',
  'rc03-preexisting-proof',
  '2026-11-20T00:00:00.123456Z',
  repeat('7', 64),
  '2026-11-20T00:00:00.123456Z',
  '2026-11-20T00:10:00.123456Z'
);

INSERT INTO public.wos_qa_trusted_proof_receipts(
  request_id, organization_id, order_id, image_id,
  actor_user_id, actor_profile_id, expected_version,
  payload_fingerprint, proof_status, after_sha256,
  storage_object_id, storage_object_version, storage_object_updated_at,
  result_json
) VALUES (
  '70000000-0000-4000-8000-000000000013',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  '70000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000012',
  '10101010-1010-4010-8010-101010101010',
  '11111111-1111-4111-8111-111111111111',
  1,
  repeat('8', 64),
  'VERIFIED',
  repeat('7', 64),
  '70000000-0000-4000-8000-000000000011',
  'rc03-preexisting-proof',
  '2026-11-20T00:00:00.123456Z',
  '{"status":"VERIFIED"}'::jsonb
);

INSERT INTO public.wos_production_orders(
  id, organization_id, customer_id, customer_name_snapshot,
  project_id, project_name_snapshot, order_number, product_name,
  sales_owner_profile_id, project_owner_profile_id, priority,
  version_label, workflow_status, requested_quantity,
  current_batch_quantity, split_delivery, product_material,
  created_by_profile_id, version
)
SELECT
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'rc03-seed-order-' || series.value
  ),
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  NULL,
  'RC03 Synthetic Historical Customer',
  NULL,
  'RC03 Synthetic Historical Project',
  'WOS-PROD-RC03-HISTORICAL-' || lpad(series.value::text, 3, '0'),
  'RC03 Synthetic Historical Product',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'MEDIUM',
  'V1',
  'DRAFT',
  10,
  10,
  false,
  'RC03 Synthetic Historical Material',
  '11111111-1111-4111-8111-111111111111',
  1
FROM generate_series(2, 85) AS series(value);

INSERT INTO public.wos_reference_images(
  id, organization_id, entity_type, entity_id, category,
  storage_bucket, storage_path, file_name, mime_type, file_size,
  version_label, image_status, uploaded_by_profile_id
)
SELECT
  image_id,
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  'PRODUCTION_ORDER',
  '70000000-0000-4000-8000-000000000001'::uuid,
  CASE ((image_seed.value - 1) % 4)
    WHEN 0 THEN 'PRODUCT'
    WHEN 1 THEN 'FILM_PATTERN'
    WHEN 2 THEN 'CUSTOMER_APPROVED_SAMPLE'
    ELSE 'SIGNED_SAMPLE'
  END,
  'wos-private',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2'
    || '/wos/production-order/'
    || '70000000-0000-4000-8000-000000000001'
    || '/images/'
    || CASE ((image_seed.value - 1) % 4)
      WHEN 0 THEN 'product'
      WHEN 1 THEN 'film-pattern'
      WHEN 2 THEN 'customer-approved-sample'
      ELSE 'signed-sample'
    END
    || '/versions/V1/' || image_id::text || '/source.png',
  'source.png',
  'image/png',
  100,
  'V1',
  CASE WHEN image_seed.value <= 8 THEN 'READY' ELSE 'UPLOADING' END,
  '11111111-1111-4111-8111-111111111111'
FROM (
  SELECT
    series.value,
    extensions.uuid_generate_v5(
      extensions.uuid_ns_url(),
      'rc03-seed-image-' || series.value
    ) AS image_id
  FROM generate_series(1, 90) AS series(value)
) image_seed;

INSERT INTO storage.objects(
  id, bucket_id, name, owner_id, metadata, version, updated_at
)
SELECT
  image.id,
  'wos-private',
  image.storage_path,
  '10101010-1010-4010-8010-101010101010',
  '{"mimetype":"image/png","size":"100"}'::jsonb,
  'rc03-seed-' || image.id::text,
  '2026-11-20T00:00:00.123456Z'
FROM public.wos_reference_images image
WHERE image.id IN (
  SELECT extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'rc03-seed-image-' || series.value
  )
  FROM generate_series(1, 90) AS series(value)
);

INSERT INTO public.wos_qa_verified_image_proofs(
  image_id, organization_id, order_id, actor_user_id,
  storage_bucket, storage_path, storage_object_id,
  storage_object_version, storage_object_updated_at,
  verified_sha256, verified_at, expires_at
)
SELECT
  image.id,
  image.organization_id,
  image.entity_id,
  '10101010-1010-4010-8010-101010101010',
  'wos-private',
  image.storage_path,
  image.id,
  'rc03-seed-' || image.id::text,
  '2026-11-20T00:00:00.123456Z',
  repeat('6', 64),
  '2026-11-20T00:00:00.123456Z',
  '2026-11-20T00:10:00.123456Z'
FROM public.wos_reference_images image
WHERE image.id IN (
  SELECT extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'rc03-seed-image-' || series.value
  )
  FROM generate_series(1, 34) AS series(value)
);

INSERT INTO public.wos_qa_trusted_proof_receipts(
  request_id, organization_id, order_id, image_id,
  actor_user_id, actor_profile_id, expected_version,
  payload_fingerprint, proof_status, after_sha256,
  storage_object_id, storage_object_version, storage_object_updated_at,
  result_json
)
SELECT
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'rc03-seed-receipt-' || series.value
  ),
  image.organization_id,
  image.entity_id,
  image.id,
  '10101010-1010-4010-8010-101010101010',
  '11111111-1111-4111-8111-111111111111',
  1,
  repeat('8', 64),
  'VERIFIED',
  repeat('6', 64),
  image.id,
  'rc03-seed-' || image.id::text,
  '2026-11-20T00:00:00.123456Z',
  '{"status":"VERIFIED"}'::jsonb
FROM public.wos_reference_images image
JOIN generate_series(1, 7) AS series(value)
  ON image.id = extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'rc03-seed-image-' || series.value
  );

INSERT INTO public.wos_visual_baselines(
  id, organization_id, entity_type, entity_id,
  version_label, status
)
SELECT
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'rc03-seed-baseline-' || series.value
  ),
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  'PRODUCTION_ORDER',
  CASE series.value
    WHEN 1 THEN '70000000-0000-4000-8000-000000000001'::uuid
    ELSE extensions.uuid_generate_v5(
      extensions.uuid_ns_url(),
      'rc03-seed-order-2'
    )
  END,
  'V1',
  'CURRENT'
FROM generate_series(1, 2) AS series(value);

INSERT INTO public.wos_visual_baseline_items(
  baseline_id, reference_image_id, display_order, is_required
)
SELECT
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'rc03-seed-baseline-' || baseline_series.value
  ),
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'rc03-seed-image-' || image_series.value
  ),
  image_series.value - ((baseline_series.value - 1) * 4),
  true
FROM generate_series(1, 2) AS baseline_series(value)
CROSS JOIN LATERAL generate_series(
  ((baseline_series.value - 1) * 4) + 1,
  baseline_series.value * 4
) AS image_series(value);

COMMIT;
