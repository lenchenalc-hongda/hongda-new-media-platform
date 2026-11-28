-- PostgreSQL 17 effective-role guard assertions.

SET request.jwt.claim.role = 'service_role';
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(NULL);
    RAISE EXCEPTION 'expected forged-claim role rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_SERVICE_ROLE_REQUIRED' THEN RAISE; END IF;
  END;
END;
$$;
RESET request.jwt.claim.role;

SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(NULL);
    RAISE EXCEPTION 'expected invalid PREPARE input';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'INVALID_FIXTURE_INPUT' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.wos_qa_rollback_canonical_v1_fixture(NULL, NULL);
    RAISE EXCEPTION 'expected invalid rollback input';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'INVALID_ROLLBACK_INPUT' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.role = 'service_role';
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(NULL);
    RAISE EXCEPTION 'expected authenticated ACL rejection';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;
RESET request.jwt.claim.role;

SET ROLE anon;
SET request.jwt.claim.role = 'service_role';
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_rollback_canonical_v1_fixture(NULL, NULL);
    RAISE EXCEPTION 'expected anon ACL rejection';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;
RESET request.jwt.claim.role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.wos_qa_canonical_fixture_manifests
  ) THEN
    RAISE EXCEPTION 'guard test created a manifest row';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.wos_production_orders
    WHERE order_number LIKE 'QA-NONPROD-%'
  ) THEN
    RAISE EXCEPTION 'guard test created an order';
  END IF;
END;
$$;

SELECT 'CURRENT_USER_GUARD_ASSERTIONS=PASS' AS result;
