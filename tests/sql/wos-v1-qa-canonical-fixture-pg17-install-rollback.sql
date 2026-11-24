DO $$
BEGIN
  IF to_regprocedure(
    'public.wos_qa_create_canonical_v1_fixture(jsonb)'
  ) IS NOT NULL OR to_regprocedure(
    'public.wos_qa_rollback_canonical_v1_fixture(uuid,uuid)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'install rollback left fixture functions';
  END IF;
  IF to_regclass(
    'public.wos_qa_canonical_fixture_manifests'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'install rollback left fixture manifest table';
  END IF;
  IF (
    SELECT count(*)
    FROM public.wos_production_orders
    WHERE id = '99999999-9999-4999-8999-999999999999'
      AND order_number =
        'QA-NONPROD-88888888-8888-4888-8888-888888888888'
  ) <> 1 THEN
    RAISE EXCEPTION 'install rollback changed historical fixture row';
  END IF;
END;
$$;

SELECT 'INSTALL_ROLLBACK_ASSERTIONS=PASS' AS result;
