-- WOS P8, DISPOSABLE PostgreSQL ONLY: a candidate P7 structural contract.
-- Do not copy into supabase/migrations; this is NOT approved Production DDL.
-- No real Supabase Auth / Storage / Edge or customer data is used here.
DO $guard$
BEGIN
  IF current_database() <> 'wos_p8_ci'
     OR to_regclass('public.wos_production_orders') IS NULL
     OR to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'WOS_P8_EPHEMERAL_DATABASE_REQUIRED';
  END IF;
END $guard$;

-- Lightweight missing core prerequisite for an otherwise synthetic fixture.
CREATE TABLE public.organizations (id uuid PRIMARY KEY);

DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $role$;

-- Three P7 transactional tables, aligned with the QA structural contract.
CREATE TABLE public.wos_office_readiness_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  source_version_label text NOT NULL CHECK (length(source_version_label) BETWEEN 1 AND 120),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  note text NOT NULL CHECK (length(note) BETWEEN 10 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, source_revision)
);
CREATE TABLE public.wos_submission_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  source_version_label text NOT NULL,
  idempotency_key uuid NOT NULL UNIQUE,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, source_revision)
);
CREATE TABLE public.wos_workshop_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL UNIQUE REFERENCES public.wos_production_orders(id),
  submission_id uuid NOT NULL UNIQUE REFERENCES public.wos_submission_receipts(id),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  source_version_label text NOT NULL,
  workflow_status text NOT NULL DEFAULT 'SUBMITTED' CHECK (workflow_status='SUBMITTED'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wos_p8_ephemeral_inbox_org_created_idx
 ON public.wos_workshop_inbox (organization_id, created_at DESC);

-- Candidate production-neutral proof/lease table shape, not the QA-only
-- wos_qa_* names; these lack the eventual approved RPC/Edge integration.
CREATE TABLE public.wos_verified_image_proofs (
  image_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  actor_user_id uuid NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'wos-private' CHECK(storage_bucket='wos-private'),
  storage_path text NOT NULL UNIQUE,
  storage_object_id uuid NOT NULL,
  storage_object_version text,
  storage_object_updated_at timestamptz NOT NULL,
  verified_sha256 text NOT NULL CHECK(verified_sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK(expires_at > verified_at AND expires_at <= verified_at + interval '30 minutes')
);
CREATE INDEX wos_p8_ephemeral_proof_order_idx
  ON public.wos_verified_image_proofs(order_id, expires_at);

CREATE TABLE public.wos_orphan_cleanup_claims (
  storage_object_id uuid PRIMARY KEY,
  storage_path text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  object_version text,
  object_updated_at timestamptz NOT NULL,
  claim_token uuid NOT NULL,
  state text NOT NULL CHECK(state IN ('CLAIMED','REMOVED','RELEASED')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz NOT NULL,
  finished_at timestamptz,
  last_result text,
  CHECK(lease_expires_at > claimed_at AND lease_expires_at <= claimed_at + interval '10 minutes')
);
CREATE INDEX wos_p8_ephemeral_cleanup_lease_idx
  ON public.wos_orphan_cleanup_claims(state, lease_expires_at);

ALTER TABLE public.wos_office_readiness_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_submission_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_workshop_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_verified_image_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_orphan_cleanup_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.wos_office_readiness_receipts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.wos_submission_receipts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.wos_workshop_inbox FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.wos_verified_image_proofs FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.wos_orphan_cleanup_claims FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.wos_office_readiness_receipts TO authenticated;
GRANT SELECT ON public.wos_submission_receipts TO authenticated;
GRANT SELECT ON public.wos_workshop_inbox TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.wos_verified_image_proofs TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.wos_orphan_cleanup_claims TO service_role;

CREATE POLICY wos_p8_readiness_reader ON public.wos_office_readiness_receipts
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
    AND p.org_id=wos_office_readiness_receipts.organization_id
    AND p.role IN ('admin','manager','sales','operator','workshop','technician')));
CREATE POLICY wos_p8_submission_reader ON public.wos_submission_receipts
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
    AND p.org_id=wos_submission_receipts.organization_id
    AND p.role IN ('admin','manager','sales','operator','workshop','technician')));
CREATE POLICY wos_p8_inbox_reader ON public.wos_workshop_inbox
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
    AND p.org_id=wos_workshop_inbox.organization_id
    AND p.role IN ('admin','manager','sales','operator','workshop','technician')));

-- Restrictive gates strengthen (rather than replace) Foundation same-org SELECT.
-- Corresponds to QA P7 viewer-role hardening, but not a full production policy set.
CREATE POLICY wos_p8_orders_reader_roles ON public.wos_production_orders
 AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
   AND p.org_id=wos_production_orders.organization_id
   AND p.role IN ('admin','manager','sales','operator','workshop','technician')));
CREATE POLICY wos_p8_images_reader_roles ON public.wos_reference_images
 AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
   AND p.org_id=wos_reference_images.organization_id
   AND p.role IN ('admin','manager','sales','operator','workshop','technician')));
CREATE POLICY wos_p8_history_reader_roles ON public.wos_status_history
 AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
   AND p.org_id=wos_status_history.organization_id
   AND p.role IN ('admin','manager','sales','operator','workshop','technician')));

-- No Storage API, Edge Functions, SQL SECURITY DEFINER RPCs, cleanup workers,
-- or physical deletion is deployed/represented by this contract.
