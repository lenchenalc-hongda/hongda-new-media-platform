-- WOS P0-01: PRODUCTION-NEUTRAL *DRAFT* for isolated PostgreSQL 17 rehearsal ONLY.
-- NOT a Supabase migration; NOT approved for either hosted Supabase project.
-- This file intentionally contains no business RPC implementation and enables NO production writes.
-- Future Production migration must be created with a pinned Supabase CLI and separate Owner authorization.
-- Rehearsal guard below is defense-in-depth, NOT a substitute for project/account authorization.
BEGIN;
SET LOCAL statement_timeout = '12s';
DO $wos_rehearsal$
BEGIN
  IF current_setting('wos.p0_01_ephemeral_rehearsal',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'WOS_PROPOSAL_ONLY_NO_HOSTED_EXECUTION';
  END IF;
  IF to_regclass('public.wos_production_orders') IS NULL
    OR to_regclass('public.cpc_customer_references') IS NULL
    OR to_regclass('public.cpc_projects') IS NULL
    OR to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'WOS_MVP_FOUNDATION_OR_CPC_MISSING';
  END IF;
END $wos_rehearsal$;

-- The foundation draft has PK(id) but no composite order/org key.
-- Composite FK below prevents creating a receipt for an order of another organization.
CREATE UNIQUE INDEX IF NOT EXISTS wos_mvp_order_id_org_unique
  ON public.wos_production_orders(id, organization_id);

CREATE TABLE public.wos_office_readiness_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK(source_revision>0),
  source_version_label text NOT NULL CHECK(length(btrim(source_version_label)) BETWEEN 1 AND 120),
  actor_profile_id uuid NOT NULL,
  note text NOT NULL CHECK(length(btrim(note)) BETWEEN 10 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,source_revision),
  FOREIGN KEY (order_id,organization_id) REFERENCES public.wos_production_orders(id,organization_id),
  FOREIGN KEY (actor_profile_id,organization_id) REFERENCES public.profiles(id,org_id)
);
CREATE TABLE public.wos_submission_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK(source_revision>0),
  source_version_label text NOT NULL CHECK(length(btrim(source_version_label)) BETWEEN 1 AND 120),
  idempotency_key uuid NOT NULL,
  actor_profile_id uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id), -- initial P1 submission is immutable; P2 resubmission creates NO new P1 receipt
  UNIQUE(organization_id,idempotency_key),
  UNIQUE(id,organization_id,order_id),
  FOREIGN KEY (order_id,organization_id) REFERENCES public.wos_production_orders(id,organization_id),
  FOREIGN KEY (actor_profile_id,organization_id) REFERENCES public.profiles(id,org_id)
);
CREATE TABLE public.wos_workshop_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL UNIQUE,
  submission_id uuid NOT NULL UNIQUE,
  source_revision integer NOT NULL CHECK(source_revision>0),
  source_version_label text NOT NULL CHECK(length(btrim(source_version_label)) BETWEEN 1 AND 120),
  workflow_status text NOT NULL DEFAULT 'SUBMITTED' CHECK(workflow_status='SUBMITTED'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (order_id,organization_id) REFERENCES public.wos_production_orders(id,organization_id),
  FOREIGN KEY (submission_id,organization_id,order_id)
    REFERENCES public.wos_submission_receipts(id,organization_id,order_id)
);

-- P2 audit is append-only. No QA Gate, Owner CAS, synthetic record or client write grant.
CREATE TABLE public.wos_operator_action_receipts (
  request_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL,
  actor_profile_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN ('ACCEPT','RETURN_FOR_INFORMATION')),
  expected_version integer NOT NULL CHECK(expected_version>=2),
  new_version integer NOT NULL CHECK(new_version=expected_version+1),
  payload_fingerprint text NOT NULL CHECK(payload_fingerprint ~ '^[a-f0-9]{64}$'),
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(order_id,organization_id) REFERENCES public.wos_production_orders(id,organization_id),
  FOREIGN KEY(actor_profile_id,organization_id) REFERENCES public.profiles(id,org_id)
);
CREATE TABLE public.wos_office_revision_receipts (
  request_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL,
  actor_profile_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN ('SAVE_CORRECTION','RESUBMIT_CORRECTION')),
  expected_version integer NOT NULL CHECK(expected_version>=2),
  new_version integer NOT NULL CHECK(new_version=expected_version+1),
  payload_fingerprint text NOT NULL CHECK(payload_fingerprint ~ '^[a-f0-9]{64}$'),
  reason text NOT NULL,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,new_version),
  UNIQUE(request_id,organization_id,order_id),
  FOREIGN KEY(order_id,organization_id) REFERENCES public.wos_production_orders(id,organization_id),
  FOREIGN KEY(actor_profile_id,organization_id) REFERENCES public.profiles(id,org_id)
);
CREATE TABLE public.wos_operator_review_receipts (
  request_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL,
  actor_profile_id uuid NOT NULL,
  office_revision_request_id uuid NOT NULL,
  expected_version integer NOT NULL CHECK(expected_version>=3),
  new_version integer NOT NULL CHECK(new_version=expected_version+1),
  payload_fingerprint text NOT NULL CHECK(payload_fingerprint ~ '^[a-f0-9]{64}$'),
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,expected_version),
  FOREIGN KEY(order_id,organization_id) REFERENCES public.wos_production_orders(id,organization_id),
  FOREIGN KEY(actor_profile_id,organization_id) REFERENCES public.profiles(id,org_id),
  FOREIGN KEY(office_revision_request_id,organization_id,order_id)
    REFERENCES public.wos_office_revision_receipts(request_id,organization_id,order_id)
);

CREATE INDEX wos_mvp_inbox_org_created ON public.wos_workshop_inbox(organization_id,created_at DESC);
CREATE INDEX wos_mvp_operator_order_created ON public.wos_operator_action_receipts(order_id,created_at DESC);
CREATE INDEX wos_mvp_office_order_created ON public.wos_office_revision_receipts(order_id,created_at DESC);
CREATE INDEX wos_mvp_review_order_created ON public.wos_operator_review_receipts(order_id,created_at DESC);

-- All six tables: direct client writes denied; eventual mutating RPCs require separate
-- exact-head security audit and a narrowly authorized executor with role/org checks.
ALTER TABLE public.wos_office_readiness_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_submission_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_workshop_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_operator_action_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_office_revision_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_operator_review_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_office_readiness_receipts,public.wos_submission_receipts,
 public.wos_workshop_inbox,public.wos_operator_action_receipts,
 public.wos_office_revision_receipts,public.wos_operator_review_receipts
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.wos_office_readiness_receipts,public.wos_submission_receipts,
 public.wos_workshop_inbox,public.wos_operator_action_receipts,
 public.wos_office_revision_receipts,public.wos_operator_review_receipts
 TO authenticated;
-- These SELECT policies are preliminary. Before Production, restrict order assignment
-- and owner-scoped visibility using a separately reviewed role matrix.
CREATE POLICY wos_mvp_office_read ON public.wos_office_readiness_receipts FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
  AND p.org_id=organization_id AND p.role IN('admin','manager','sales')));
CREATE POLICY wos_mvp_submission_read ON public.wos_submission_receipts FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
  AND p.org_id=organization_id AND p.role IN('admin','manager','sales','operator')));
CREATE POLICY wos_mvp_inbox_read ON public.wos_workshop_inbox FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
  AND p.org_id=organization_id AND p.role IN('admin','manager','operator')));
CREATE POLICY wos_mvp_operator_action_read ON public.wos_operator_action_receipts FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
  AND p.org_id=organization_id AND p.role IN('admin','manager','operator','sales')));
CREATE POLICY wos_mvp_office_revision_read ON public.wos_office_revision_receipts FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
  AND p.org_id=organization_id AND p.role IN('admin','manager','operator','sales')));
CREATE POLICY wos_mvp_operator_review_read ON public.wos_operator_review_receipts FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
  AND p.org_id=organization_id AND p.role IN('admin','manager','operator','sales')));
COMMIT;
