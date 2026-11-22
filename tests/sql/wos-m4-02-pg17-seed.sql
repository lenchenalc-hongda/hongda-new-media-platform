-- Synthetic M4-02 state only. Applied only to a disposable PostgreSQL 17 DB.

ALTER TABLE public.wos_visual_baselines
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

ALTER TABLE public.wos_qa_verified_image_proofs
  ALTER COLUMN storage_object_version DROP NOT NULL;
ALTER TABLE storage.objects
  ALTER COLUMN version DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.wos_qa_p2_execution_gate (
  gate_name text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  enabled_until timestamptz,
  approval_reference text,
  allowed_order_id uuid,
  allowed_organization_id uuid
);
CREATE TABLE IF NOT EXISTS public.wos_qa_p2_office_execution_gate (
  gate_name text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  enabled_until timestamptz,
  approval_reference text,
  allowed_order_id uuid,
  allowed_organization_id uuid
);
INSERT INTO public.wos_qa_p2_execution_gate(
  gate_name, enabled, enabled_until, approval_reference,
  allowed_order_id, allowed_organization_id
) VALUES(
  'OPERATOR_WRITES', false, NULL, 'NOT_AUTHORIZED', NULL, NULL
) ON CONFLICT(gate_name) DO NOTHING;
INSERT INTO public.wos_qa_p2_office_execution_gate(
  gate_name, enabled, enabled_until, approval_reference,
  allowed_order_id, allowed_organization_id
) VALUES(
  'OFFICE_WRITES', false, NULL, 'NOT_AUTHORIZED', NULL, NULL
) ON CONFLICT(gate_name) DO NOTHING;

INSERT INTO public.profiles(id,user_id,org_id,role,is_active)
VALUES(
  '66666666-6666-4666-8666-666666666666',
  '60606060-6060-4060-8060-606060606060',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'sales',
  true
)
ON CONFLICT(id) DO NOTHING;

UPDATE public.wos_production_orders
SET version_label = 'QA-R6',
    order_number = 'QA-NONPROD-' || id::text
WHERE id = '33333333-3333-4333-8333-333333333333';
UPDATE public.wos_reference_images
SET version_label = 'QA-R6'
WHERE entity_id = '33333333-3333-4333-8333-333333333333';

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_visual_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_visual_baseline_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_reference_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_qa_verified_image_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_qa_p2_m2_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

REVOKE SELECT ON public.wos_qa_verified_image_proofs
  FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.wos_qa_p2_m2_receipts
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;

UPDATE public.wos_reference_images im
SET storage_path = pg_catalog.format(
  'organizations/%s/wos/production-order/%s/images/%s/versions/%s/%s/qa-preview-proof.png',
  im.organization_id,
  im.entity_id,
  CASE im.category
    WHEN 'PRODUCT' THEN 'product'
    WHEN 'FILM_PATTERN' THEN 'film-pattern'
    WHEN 'CUSTOMER_APPROVED_SAMPLE' THEN 'customer-approved-sample'
    WHEN 'SIGNED_SAMPLE' THEN 'signed-sample'
  END,
  im.version_label,
  im.id
)
WHERE im.entity_id = '33333333-3333-4333-8333-333333333333';

UPDATE public.wos_qa_verified_image_proofs pf
SET storage_path = im.storage_path,
    expires_at = now() + interval '20 minutes',
    verified_at = now() - interval '1 minute'
FROM public.wos_reference_images im
WHERE pf.image_id = im.id
  AND pf.order_id = '33333333-3333-4333-8333-333333333333';

UPDATE storage.objects ob
SET name = im.storage_path
FROM public.wos_reference_images im
WHERE ob.id IN (
  SELECT pf.storage_object_id
  FROM public.wos_qa_verified_image_proofs pf
  WHERE pf.image_id = im.id
);

UPDATE public.wos_qa_verified_image_proofs pf
SET storage_object_updated_at = ob.updated_at
FROM storage.objects ob
WHERE pf.storage_object_id = ob.id
  AND pf.order_id = '33333333-3333-4333-8333-333333333333';

UPDATE public.wos_qa_p2_m2_gate
SET enabled = true,
    enabled_until = clock_timestamp() + interval '10 minutes',
    approval_reference = 'WOS_M4_02_PG17_SYNTHETIC_ONLY',
    allowed_order_id = '33333333-3333-4333-8333-333333333333',
    allowed_organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    updated_at = clock_timestamp()
WHERE gate_name IN ('M2_OFFICE_WRITES','M2_OPERATOR_WRITES');

SELECT set_config(
  'request.jwt.claim.sub',
  '10101010-1010-4010-8010-101010101010',
  false
);
SELECT public.wos_qa_p2_m2_action(
  '33333333-3333-4333-8333-333333333333',
  7,
  '71000000-0000-4000-8000-000000000001',
  'BASELINE_SELECT',
  pg_catalog.jsonb_build_object(
    'productionVersionLabel', 'QA-R6',
    'note', 'Synthetic M4-02 exact four-image baseline selection.',
    'imageIds', pg_catalog.jsonb_build_array(
      '41111111-1111-4111-8111-111111111111',
      '42222222-2222-4222-8222-222222222222',
      '43333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444'
    )
  )
) AS baseline_select;

SELECT public.wos_qa_p2_m2_action(
  '33333333-3333-4333-8333-333333333333',
  8,
  '71000000-0000-4000-8000-000000000002',
  'BASELINE_OFFICE_CONFIRM',
  pg_catalog.jsonb_build_object(
    'productionVersionLabel', 'QA-R6',
    'note', 'Synthetic M4-02 Office confirmation.',
    'baselineId', (
      SELECT id FROM public.wos_visual_baselines
      WHERE entity_id = '33333333-3333-4333-8333-333333333333'
        AND status = 'DRAFT'
    )
  )
) AS office_confirm;

SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SELECT public.wos_qa_p2_m2_action(
  '33333333-3333-4333-8333-333333333333',
  9,
  '71000000-0000-4000-8000-000000000003',
  'BASELINE_WORKSHOP_CONFIRM',
  pg_catalog.jsonb_build_object(
    'productionVersionLabel', 'QA-R6',
    'note', 'Synthetic M4-02 Workshop confirmation.',
    'baselineId', (
      SELECT id FROM public.wos_visual_baselines
      WHERE entity_id = '33333333-3333-4333-8333-333333333333'
        AND status = 'CURRENT'
    )
  )
) AS workshop_confirm;

SELECT public.wos_qa_p2_m2_action(
  '33333333-3333-4333-8333-333333333333',
  10,
  '71000000-0000-4000-8000-000000000004',
  'FINAL_READINESS_CONFIRM',
  pg_catalog.jsonb_build_object(
    'productionVersionLabel', 'QA-R6',
    'note', 'Synthetic M4-02 final readiness confirmation.',
    'baselineId', (
      SELECT id FROM public.wos_visual_baselines
      WHERE entity_id = '33333333-3333-4333-8333-333333333333'
        AND status = 'CURRENT'
    ),
    'physicalCheckAttested', true,
    'filmArrivedAt', clock_timestamp() - interval '8 minutes',
    'fixtureArrivedAt', clock_timestamp() - interval '7 minutes',
    'incomingArrivedAt', clock_timestamp() - interval '6 minutes',
    'signedSampleArrivedAt', clock_timestamp() - interval '5 minutes',
    'quantityExpected', 100,
    'quantityArrived', 100
  )
) AS final_readiness;

UPDATE public.wos_qa_p2_m2_gate
SET enabled = false,
    enabled_until = NULL,
    approval_reference = 'NOT_AUTHORIZED',
    allowed_order_id = NULL,
    allowed_organization_id = NULL,
    updated_at = clock_timestamp()
WHERE gate_name IN ('M2_OFFICE_WRITES','M2_OPERATOR_WRITES');

DO $seed_check$
BEGIN
  IF (SELECT workflow_status || ':' || version
      FROM public.wos_production_orders
      WHERE id = '33333333-3333-4333-8333-333333333333')
      <> 'READINESS_CHECK:11'
    OR (SELECT count(*) FROM public.wos_qa_p2_m2_receipts
        WHERE order_id = '33333333-3333-4333-8333-333333333333') <> 4
    OR (SELECT count(*) FROM public.wos_qa_verified_image_proofs
        WHERE order_id = '33333333-3333-4333-8333-333333333333') <> 4
  THEN
    RAISE EXCEPTION 'M4_PG17_SEED_FAILED';
  END IF;
END;
$seed_check$;
