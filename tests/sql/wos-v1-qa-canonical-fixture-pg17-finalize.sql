SET ROLE service_role;
SET request.jwt.claim.role = 'service_role';
SELECT public.wos_qa_create_canonical_v1_fixture(
  public.test_fixture_manifest()
)->>'status';
RESET request.jwt.claim.role;
RESET ROLE;
