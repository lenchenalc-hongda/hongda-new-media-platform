SET ROLE service_role;
SELECT public.wos_qa_create_canonical_v1_fixture(
  public.test_fixture_manifest()
)->>'status';
RESET ROLE;
