-- Normalize the disposable fixture to the retained UAT-006 starting shape:
-- V2/version 7/WAITING_MATERIAL with four current images and one Baseline.

BEGIN;

ALTER TABLE public.wos_production_orders DISABLE TRIGGER USER;
ALTER TABLE public.wos_reference_images DISABLE TRIGGER USER;
ALTER TABLE public.wos_verified_image_proofs DISABLE TRIGGER USER;
ALTER TABLE public.wos_visual_baselines DISABLE TRIGGER USER;
ALTER TABLE public.wos_visual_baseline_items DISABLE TRIGGER USER;
ALTER TABLE storage.objects DISABLE TRIGGER USER;

UPDATE public.wos_production_orders
SET workflow_status = 'WAITING_MATERIAL',
    version = 7,
    version_label = 'V2',
    created_by_profile_id = '11111111-1111-4111-8111-111111111111',
    sales_owner_profile_id = '11111111-1111-4111-8111-111111111111'
WHERE id = '33333333-3333-4333-8333-333333333333';

UPDATE storage.objects object
SET name =
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  || '/wos/production-order/33333333-3333-4333-8333-333333333333'
  || '/images/'
  || CASE object.id
    WHEN '51111111-1111-4111-8111-111111111111' THEN 'product'
    WHEN '52222222-2222-4222-8222-222222222222' THEN 'film-pattern'
    WHEN '53333333-3333-4333-8333-333333333333' THEN 'signed-sample'
    WHEN '54444444-4444-4444-8444-444444444444' THEN
      'customer-approved-sample'
  END
  || '/versions/V2/'
  || CASE object.id
    WHEN '51111111-1111-4111-8111-111111111111' THEN
      '41111111-1111-4111-8111-111111111111'
    WHEN '52222222-2222-4222-8222-222222222222' THEN
      '42222222-2222-4222-8222-222222222222'
    WHEN '53333333-3333-4333-8333-333333333333' THEN
      '43333333-3333-4333-8333-333333333333'
    WHEN '54444444-4444-4444-8444-444444444444' THEN
      '44444444-4444-4444-8444-444444444444'
  END
  || '/source.png',
    version = 'v2-uat006',
    updated_at = clock_timestamp(),
    metadata = jsonb_build_object(
      'mimetype','image/png',
      'size','100'
    )
WHERE object.id IN (
  '51111111-1111-4111-8111-111111111111',
  '52222222-2222-4222-8222-222222222222',
  '53333333-3333-4333-8333-333333333333',
  '54444444-4444-4444-8444-444444444444'
);

UPDATE public.wos_reference_images image
SET version_label = 'V2',
    image_status = 'READY',
    storage_path = object.name,
    file_name = 'source.png',
    mime_type = 'image/png',
    file_size = 100,
    superseded_at = NULL,
    uploaded_by_profile_id =
      '11111111-1111-4111-8111-111111111111'
FROM storage.objects object
WHERE object.id = CASE image.id
    WHEN '41111111-1111-4111-8111-111111111111' THEN
      '51111111-1111-4111-8111-111111111111'::uuid
    WHEN '42222222-2222-4222-8222-222222222222' THEN
      '52222222-2222-4222-8222-222222222222'::uuid
    WHEN '43333333-3333-4333-8333-333333333333' THEN
      '53333333-3333-4333-8333-333333333333'::uuid
    WHEN '44444444-4444-4444-8444-444444444444' THEN
      '54444444-4444-4444-8444-444444444444'::uuid
  END
  AND image.entity_id =
    '33333333-3333-4333-8333-333333333333'::uuid;

UPDATE public.wos_verified_image_proofs proof
SET storage_path = image.storage_path,
    storage_object_id = object.id,
    storage_object_version = object.version,
    storage_object_updated_at = object.updated_at,
    verified_at = clock_timestamp(),
    expires_at = clock_timestamp() + interval '10 minutes'
FROM public.wos_reference_images image
JOIN storage.objects object
  ON object.name = image.storage_path
WHERE proof.image_id = image.id
  AND proof.order_id =
    '33333333-3333-4333-8333-333333333333'::uuid;

UPDATE public.wos_visual_baselines
SET status = 'SUPERSEDED',
    superseded_at = clock_timestamp()
WHERE entity_id = '33333333-3333-4333-8333-333333333333'
  AND status = 'CURRENT';

INSERT INTO public.wos_visual_baselines(
  id,organization_id,entity_type,entity_id,version_label,status
) VALUES(
  'a6200000-0000-4000-8000-000000000000',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'PRODUCTION_ORDER',
  '33333333-3333-4333-8333-333333333333',
  'V2',
  'CURRENT'
);
INSERT INTO public.wos_visual_baseline_items(
  baseline_id,reference_image_id,display_order,is_required
) VALUES
  (
    'a6200000-0000-4000-8000-000000000000',
    '41111111-1111-4111-8111-111111111111',0,true
  ),
  (
    'a6200000-0000-4000-8000-000000000000',
    '42222222-2222-4222-8222-222222222222',1,true
  ),
  (
    'a6200000-0000-4000-8000-000000000000',
    '43333333-3333-4333-8333-333333333333',2,true
  ),
  (
    'a6200000-0000-4000-8000-000000000000',
    '44444444-4444-4444-8444-444444444444',3,true
  );

ALTER TABLE public.wos_visual_baseline_items ENABLE TRIGGER USER;
ALTER TABLE public.wos_visual_baselines ENABLE TRIGGER USER;
ALTER TABLE storage.objects ENABLE TRIGGER USER;
ALTER TABLE public.wos_verified_image_proofs ENABLE TRIGGER USER;
ALTER TABLE public.wos_reference_images ENABLE TRIGGER USER;
ALTER TABLE public.wos_production_orders ENABLE TRIGGER USER;

DO $assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.wos_production_orders
    WHERE id = '33333333-3333-4333-8333-333333333333'
      AND version = 7
      AND version_label = 'V2'
      AND workflow_status = 'WAITING_MATERIAL'
  ) THEN
    RAISE EXCEPTION 'UAT006_RETAINED_STATE_INVALID';
  END IF;
END;
$assertions$;

COMMIT;

SELECT 'WOS_V1_UAT006_RETAINED_STATE=PASS' AS evidence;
