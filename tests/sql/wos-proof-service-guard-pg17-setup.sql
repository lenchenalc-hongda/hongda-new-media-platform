-- Disposable PostgreSQL 17 Fixture for Proof service guard replacement tests.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'fixture';
  END IF;
END;
$$;
GRANT anon, authenticated, service_role TO authenticator;

CREATE FUNCTION public.wos_qa_get_storage_object_for_proof(p_path text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_path IS NULL OR btrim(p_path) = '' THEN
    RAISE EXCEPTION 'INVALID_STORAGE_PATH' USING ERRCODE = '22023';
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.wos_qa_get_storage_object_for_proof(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_get_storage_object_for_proof(text)
TO service_role;

INSERT INTO public.profiles(id, user_id, org_id, role, is_active) VALUES (
  'f8adf44a-f04e-44b4-9c82-8b96508097bb',
  '3c0d8866-498a-4e61-a602-28b7a83f75f5',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  'admin',
  true
);

INSERT INTO storage.objects(
  id, bucket_id, name, owner, owner_id, version, updated_at, metadata,
  archived_at, is_delete_marker
) VALUES
(
  '5d0b0110-7f9d-4114-9f5c-866da8fbf838',
  'wos-private',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/ba38e41b-8cac-469c-aabd-00b6ada033e2/images/product/versions/QA-R1/e1768f48-43c3-40e9-8104-e5c5007c7be7/source.png',
  '3c0d8866-498a-4e61-a602-28b7a83f75f5',
  '3c0d8866-498a-4e61-a602-28b7a83f75f5',
  '416eab87-52e5-458b-b05d-48aeb12d1e5e',
  '2026-11-24T13:29:16.065939+00:00',
  '{"mimetype":"image/png","size":280}',
  NULL,
  false
),
(
  '99d6d917-7bba-43f8-9728-07a962a8d500',
  'wos-private',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/ba38e41b-8cac-469c-aabd-00b6ada033e2/images/film-pattern/versions/QA-R1/90cfc658-9297-430b-9ba7-382950e73997/source.png',
  '3c0d8866-498a-4e61-a602-28b7a83f75f5',
  '3c0d8866-498a-4e61-a602-28b7a83f75f5',
  '88b2e2d5-9c3e-46cd-9be3-835fe45dfb26',
  '2026-11-24T13:29:17.495855+00:00',
  '{"mimetype":"image/png","size":288}',
  NULL,
  false
),
(
  '561a222e-dcf0-45ff-9cd7-bdf7c184ba12',
  'wos-private',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/ba38e41b-8cac-469c-aabd-00b6ada033e2/images/customer-approved-sample/versions/QA-R1/e62c8540-4dbe-4bbb-b628-6ded3a4ef7a8/source.png',
  '3c0d8866-498a-4e61-a602-28b7a83f75f5',
  '3c0d8866-498a-4e61-a602-28b7a83f75f5',
  '8cfa5efb-2851-401a-83ca-0cd81e0fef9a',
  '2026-11-24T13:29:18.413607+00:00',
  '{"mimetype":"image/png","size":285}',
  NULL,
  false
),
(
  'dbfb23d3-8b0f-47ca-8fa3-47ba649124ce',
  'wos-private',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/ba38e41b-8cac-469c-aabd-00b6ada033e2/images/signed-sample/versions/QA-R1/3990b0b6-5220-4d68-b0f0-0ceb52fc1448/source.png',
  '3c0d8866-498a-4e61-a602-28b7a83f75f5',
  '3c0d8866-498a-4e61-a602-28b7a83f75f5',
  'f35ec83b-c8ef-498c-aaa9-8dec84da4f5b',
  '2026-11-24T13:29:19.350663+00:00',
  '{"mimetype":"image/png","size":284}',
  NULL,
  false
);

SET ROLE service_role;
SELECT public.wos_qa_create_canonical_v1_fixture(
  '{"operation":"PREPARE","requestId":"c3e8cf8d-656b-47cb-9242-21d23e53f4cc","orderId":"ba38e41b-8cac-469c-aabd-00b6ada033e2","organizationId":"0ff53d93-2b9e-48b9-8113-a4768c39cdd2","officeProfileId":"f8adf44a-f04e-44b4-9c82-8b96508097bb"}'::jsonb
);
SELECT public.wos_qa_create_canonical_v1_fixture(
  :'finalize_input'::jsonb
);
RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.wos_reference_images
    WHERE entity_id = 'ba38e41b-8cac-469c-aabd-00b6ada033e2'
      AND image_status = 'READY'
      AND superseded_at IS NULL
  ) <> 4 THEN
    RAISE EXCEPTION 'PROOF_GUARD_FIXTURE_IMAGE_SET_INVALID';
  END IF;
  IF (
    SELECT count(*)
    FROM public.wos_visual_baseline_items
    WHERE baseline_id = 'db30fc83-92c9-4ff8-bf78-3f3ad556db99'
      AND is_required
  ) <> 4 THEN
    RAISE EXCEPTION 'PROOF_GUARD_FIXTURE_BASELINE_INVALID';
  END IF;
END;
$$;

SELECT 'PROOF_GUARD_FIXTURE_SETUP=PASS' AS result;
