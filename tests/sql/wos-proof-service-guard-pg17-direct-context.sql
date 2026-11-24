-- Direct database contexts must not satisfy the hosted service-role guard.

SET request.jwt.claims = '{"role":"service_role"}';
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_p7_record_trusted_image_proof(
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    );
    RAISE EXCEPTION 'expected direct postgres context rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'SERVICE_ROLE_REQUIRED' THEN RAISE; END IF;
  END;
END;
$$;
RESET request.jwt.claims;

SET ROLE service_role;
SET request.jwt.claims = '{"role":"service_role"}';
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_p7_record_trusted_image_proof(
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    );
    RAISE EXCEPTION 'expected direct service_role context rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'SERVICE_ROLE_REQUIRED' THEN RAISE; END IF;
  END;
END;
$$;
RESET request.jwt.claims;
RESET ROLE;

SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_p7_record_trusted_image_proof(
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    );
    RAISE EXCEPTION 'expected authenticated ACL rejection';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_p7_service_storage_snapshot(NULL);
    RAISE EXCEPTION 'expected anon ACL rejection';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.wos_qa_verified_image_proofs
    WHERE order_id = 'ba38e41b-8cac-469c-aabd-00b6ada033e2'
  ) OR EXISTS (
    SELECT 1 FROM public.wos_qa_trusted_proof_receipts
    WHERE order_id = 'ba38e41b-8cac-469c-aabd-00b6ada033e2'
  ) THEN
    RAISE EXCEPTION 'proof guard direct tests created rows';
  END IF;
END;
$$;

SELECT 'PROOF_GUARD_DIRECT_CONTEXT=PASS' AS result;
