CREATE OR REPLACE FUNCTION public.wos_v1_assert_service_role_request()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $service_role_request$
DECLARE
  v_claims text;
  v_claims_json jsonb;
  v_transaction_role text;
BEGIN
  v_claims := NULLIF(current_setting('request.jwt.claims', true), '');
  v_transaction_role := NULLIF(current_setting('role', true), '');
  BEGIN
    v_claims_json := v_claims::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END;
  IF v_claims_json IS NULL
    OR length(v_claims) > 16384
    OR jsonb_typeof(v_claims_json) <> 'object'
    OR v_claims_json->>'role' IS DISTINCT FROM 'service_role'
    OR v_transaction_role IS DISTINCT FROM 'service_role'
    OR (
      session_user = 'authenticator'
      AND (
        NULLIF(current_setting('request.method', true), '') IS NULL
        OR NULLIF(current_setting('request.path', true), '') NOT LIKE '/rpc/%'
      )
    )
    OR (
      session_user NOT IN ('authenticator', 'postgres', 'supabase_admin')
    )
    OR (
      session_user IN ('postgres', 'supabase_admin')
      AND current_database() NOT LIKE '%\_ci' ESCAPE '\'
    )
  THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
END;
$service_role_request$;

REVOKE ALL ON FUNCTION public.wos_v1_assert_service_role_request()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.wos_qa_verified_image_proofs (
  image_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'wos-private'
    CHECK (storage_bucket='wos-private'),
  storage_path text NOT NULL UNIQUE,
  storage_object_id uuid NOT NULL,
  storage_object_version text,
  storage_object_updated_at timestamptz NOT NULL,
  verified_sha256 text NOT NULL CHECK (verified_sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at>verified_at AND expires_at<=verified_at+interval '30 minutes')
);
ALTER TABLE public.wos_qa_verified_image_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_qa_verified_image_proofs
FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.wos_qa_verified_image_proofs
TO service_role;

CREATE OR REPLACE FUNCTION public.wos_p7_record_trusted_image_proof(
  p_image_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid,
  p_storage_path text,
  p_storage_object_id uuid,
  p_storage_object_version text,
  p_storage_object_updated_at timestamptz,
  p_sha256 text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $proof_writer_presence_stub$
BEGIN
  RAISE EXCEPTION 'TEST_PROOF_WRITER_NOT_CALLED' USING ERRCODE = '42501';
END;
$proof_writer_presence_stub$;
