-- WOS P8 | NONPRODUCTION STAGING BRANCH ONLY | 2026-11-08
-- Candidate P7 structural design against a production-core-derived Supabase branch.
-- Do NOT copy to supabase/migrations or apply to actual Production.
-- This migration intentionally contains a fail-closed branch-only fixture guard.
-- No customer, staff, or private Storage binary data may be imported.
BEGIN;
DO $guard$
BEGIN
  IF to_regclass('public.wos_production_orders') IS NULL
    OR to_regclass('public.profiles') IS NULL
    OR to_regclass('public.organizations') IS NULL
    OR to_regclass('public.wos_submission_receipts') IS NOT NULL
    OR (SELECT count(*) FROM public.profiles)<>0
    OR (SELECT count(*) FROM public.organizations)<>0
  THEN RAISE EXCEPTION 'WOS_P8_STAGING_EMPTY_CORE_BRANCH_REQUIRED'; END IF;
END $guard$;

CREATE TABLE public.wos_office_readiness_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  source_revision integer NOT NULL CHECK(source_revision>0),
  source_version_label text NOT NULL CHECK(length(source_version_label) BETWEEN 1 AND 120),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  note text NOT NULL CHECK(length(note) BETWEEN 10 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,source_revision)
);
CREATE TABLE public.wos_submission_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  source_revision integer NOT NULL CHECK(source_revision>0),
  source_version_label text NOT NULL,
  idempotency_key uuid NOT NULL UNIQUE,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,source_revision)
);
CREATE TABLE public.wos_workshop_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL UNIQUE REFERENCES public.wos_production_orders(id),
  submission_id uuid NOT NULL UNIQUE REFERENCES public.wos_submission_receipts(id),
  source_revision integer NOT NULL CHECK(source_revision>0),
  source_version_label text NOT NULL,
  workflow_status text NOT NULL DEFAULT 'SUBMITTED' CHECK(workflow_status='SUBMITTED'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wos_p8_stage_inbox_org_created_idx ON public.wos_workshop_inbox(organization_id,created_at DESC);

-- Trusted binary proof table is server-writable only.
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
  CHECK(expires_at>verified_at AND expires_at<=verified_at+interval '30 minutes')
);
CREATE INDEX wos_p8_stage_proofs_order_idx ON public.wos_verified_image_proofs(order_id,expires_at);

-- Service-only lease metadata. This NEVER deletes actual Storage objects.
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
  CHECK(lease_expires_at>claimed_at AND lease_expires_at<=claimed_at+interval '10 minutes')
);
CREATE INDEX wos_p8_stage_cleanup_lease_idx ON public.wos_orphan_cleanup_claims(state,lease_expires_at);

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
GRANT SELECT ON public.wos_office_readiness_receipts,public.wos_submission_receipts,
 public.wos_workshop_inbox TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.wos_verified_image_proofs,public.wos_orphan_cleanup_claims TO service_role;

CREATE POLICY wos_p8_stage_readiness_select ON public.wos_office_readiness_receipts
 FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
  AND p.org_id=wos_office_readiness_receipts.organization_id
  AND p.role IN ('admin','manager','sales','operator')));
CREATE POLICY wos_p8_stage_receipts_select ON public.wos_submission_receipts
 FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
  AND p.org_id=wos_submission_receipts.organization_id
  AND p.role IN ('admin','manager','sales','operator')));
CREATE POLICY wos_p8_stage_inbox_select ON public.wos_workshop_inbox
 FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
  AND p.org_id=wos_workshop_inbox.organization_id
  AND p.role IN ('admin','manager','sales','operator')));

-- Reader hardening supplements the baseline same-org permissive RLS.
-- Actual Production profiles.role CHECK only accepts five roles; no unapproved
-- workshop/technician values are introduced by this staging migration.
CREATE POLICY wos_p8_stage_orders_read_roles ON public.wos_production_orders
 AS RESTRICTIVE FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
  AND p.org_id=wos_production_orders.organization_id
  AND p.role IN ('admin','manager','sales','operator')));
CREATE POLICY wos_p8_stage_images_read_roles ON public.wos_reference_images
 AS RESTRICTIVE FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
  AND p.org_id=wos_reference_images.organization_id
  AND p.role IN ('admin','manager','sales','operator')));
CREATE POLICY wos_p8_stage_history_read_roles ON public.wos_status_history
 AS RESTRICTIVE FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
  AND p.org_id=wos_status_history.organization_id
  AND p.role IN ('admin','manager','sales','operator')));
COMMIT;
