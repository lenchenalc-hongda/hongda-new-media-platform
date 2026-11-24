SET ROLE service_role;
SELECT public.wos_qa_create_canonical_v1_fixture(
  CASE :'fixture_name'
    WHEN 'B' THEN public.test_fixture_prepare_b()
    WHEN 'C' THEN public.test_fixture_prepare_c()
  END
)->>'status';
RESET ROLE;
