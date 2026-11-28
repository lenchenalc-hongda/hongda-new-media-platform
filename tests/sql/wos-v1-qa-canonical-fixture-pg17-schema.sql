-- EPHEMERAL PostgreSQL 17 ONLY. Never run against QA or Production.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END;
$$;

CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE SCHEMA wos_qa_safety;

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  org_id uuid NOT NULL,
  role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.wos_production_orders (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  customer_id uuid,
  customer_name_snapshot text NOT NULL,
  project_id uuid,
  project_name_snapshot text,
  order_number text NOT NULL,
  product_name text NOT NULL,
  sales_owner_profile_id uuid NOT NULL,
  project_owner_profile_id uuid NOT NULL,
  priority text NOT NULL CHECK (
    priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
  ),
  is_urgent boolean NOT NULL DEFAULT false,
  version_label text NOT NULL,
  workflow_status text NOT NULL DEFAULT 'DRAFT',
  requested_quantity integer NOT NULL,
  current_batch_quantity integer NOT NULL,
  planned_ship_date date,
  split_delivery boolean NOT NULL DEFAULT false,
  product_material text NOT NULL,
  surface_treatment text,
  pattern_scope text,
  seam_tolerance text,
  position_reference text,
  customer_acceptance_standard text,
  packaging_method text,
  carton_quantity integer,
  label_marking_rule text,
  created_by_profile_id uuid NOT NULL,
  submitted_at timestamptz,
  closed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  follow_up_batch_plan text
);

CREATE TABLE public.wos_reference_images (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  category text NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  width integer,
  height integer,
  caption text,
  version_label text NOT NULL,
  image_status text NOT NULL DEFAULT 'UPLOADING',
  supersedes_image_id uuid,
  superseded_at timestamptz,
  uploaded_by_profile_id uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_path)
);

CREATE TABLE public.wos_visual_baselines (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  version_label text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  confirmed_by_office_profile_id uuid,
  confirmed_by_workshop_profile_id uuid,
  office_confirmed_at timestamptz,
  workshop_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  office_proof_set_digest text,
  office_post_order_version integer,
  workshop_proof_set_digest text,
  workshop_post_order_version integer
);
CREATE UNIQUE INDEX wos_one_current_visual_baseline
  ON public.wos_visual_baselines(entity_type, entity_id)
  WHERE status = 'CURRENT';

CREATE TABLE public.wos_visual_baseline_items (
  baseline_id uuid NOT NULL REFERENCES public.wos_visual_baselines(id),
  reference_image_id uuid NOT NULL REFERENCES public.wos_reference_images(id),
  display_order integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT true,
  PRIMARY KEY (baseline_id, reference_image_id)
);

CREATE TABLE public.wos_resource_readiness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  resource_type text NOT NULL,
  status text NOT NULL,
  confirmed_by_profile_id uuid,
  confirmed_at timestamptz,
  version_label text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wos_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  previous_status text,
  next_status text NOT NULL,
  actor_profile_id uuid NOT NULL,
  actor_role text NOT NULL,
  reason_code text NOT NULL,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wos_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL
);

CREATE TABLE public.wos_blockers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL
);

CREATE TABLE public.wos_submission_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL
);

CREATE TABLE public.wos_qa_p2_m2_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL
);

CREATE TABLE public.wos_office_readiness_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL
);

CREATE TABLE public.wos_qa_orphan_cleanup_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  storage_object_id uuid,
  state text,
  lease_expires_at timestamptz
);

CREATE TABLE public.wos_qa_p2_action_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL
);

CREATE TABLE public.wos_qa_p2_office_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL
);

CREATE TABLE public.wos_qa_p2_review_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL
);

CREATE TABLE public.wos_qa_trusted_proof_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL
);

CREATE TABLE public.wos_workshop_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL
);

CREATE TABLE public.wos_qa_verified_image_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  storage_object_id uuid NOT NULL,
  storage_object_version text,
  storage_object_updated_at timestamptz NOT NULL,
  verified_sha256 text NOT NULL,
  verified_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE public.wos_qa_p2_execution_gate (
  gate_name text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  enabled_until timestamptz,
  approval_reference text,
  allowed_order_id uuid,
  allowed_organization_id uuid,
  allowed_profile_id uuid,
  activated_at timestamptz
);
CREATE TABLE public.wos_qa_p2_office_execution_gate (
  gate_name text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  enabled_until timestamptz,
  approval_reference text,
  allowed_order_id uuid,
  allowed_organization_id uuid,
  allowed_profile_id uuid,
  activated_at timestamptz
);
CREATE TABLE public.wos_qa_p2_m2_gate (
  gate_name text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  enabled_until timestamptz,
  approval_reference text,
  allowed_order_id uuid,
  allowed_organization_id uuid,
  allowed_profile_id uuid,
  activated_at timestamptz
);

INSERT INTO public.wos_qa_p2_execution_gate(gate_name)
VALUES ('OPERATOR_WRITES');
INSERT INTO public.wos_qa_p2_office_execution_gate(gate_name)
VALUES ('OFFICE_WRITES');
INSERT INTO public.wos_qa_p2_m2_gate(gate_name)
VALUES ('M2_OFFICE_WRITES');

CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL,
  owner uuid,
  owner_id text,
  version text,
  updated_at timestamptz,
  metadata jsonb,
  archived_at timestamptz,
  is_delete_marker boolean DEFAULT false,
  UNIQUE (bucket_id, name)
);

CREATE OR REPLACE FUNCTION public.wos_qa_p2_m2_invalidate_signoff(
  p_order_id uuid,
  p_org_id uuid,
  p_image_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.wos_production_orders%ROWTYPE;
  v_actor public.profiles%ROWTYPE;
  v_actor_user_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('wos-qa-m2:' || p_order_id::text, 0)
  );
  SELECT * INTO v_order
  FROM public.wos_production_orders
  WHERE id = p_order_id
    AND organization_id = p_org_id
    AND order_number LIKE 'QA-NONPROD-%';
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.wos_visual_baselines b
    WHERE b.organization_id = p_org_id
      AND b.entity_type = 'PRODUCTION_ORDER'
      AND b.entity_id = p_order_id
      AND b.version_label = v_order.version_label
      AND b.status = 'CURRENT'
      AND b.superseded_at IS NULL
      AND (
        b.office_proof_set_digest IS NOT NULL
        OR b.workshop_proof_set_digest IS NOT NULL
      )
  ) THEN
    RETURN false;
  END IF;
  v_actor_user_id := coalesce(
    auth.uid(),
    nullif(current_setting('wos.qa.actor_user_id', true), '')::uuid
  );
  SELECT * INTO v_actor
  FROM public.profiles
  WHERE user_id = v_actor_user_id
    AND is_active = true
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'M2_EVIDENCE_CHANGE_ACTOR_REQUIRED'
      USING ERRCODE = '42501';
  END IF;
  UPDATE public.wos_visual_baselines
  SET confirmed_by_office_profile_id = NULL,
      office_confirmed_at = NULL,
      office_proof_set_digest = NULL,
      office_post_order_version = NULL,
      confirmed_by_workshop_profile_id = NULL,
      workshop_confirmed_at = NULL,
      workshop_proof_set_digest = NULL,
      workshop_post_order_version = NULL
  WHERE id = (
    SELECT id
    FROM public.wos_visual_baselines
    WHERE organization_id = p_org_id
      AND entity_type = 'PRODUCTION_ORDER'
      AND entity_id = p_order_id
      AND version_label = v_order.version_label
      AND status = 'CURRENT'
      AND superseded_at IS NULL
  );
  RETURN true;
END;
$$;

CREATE FUNCTION public.wos_qa_p2_m2_image_change_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.entity_type = 'PRODUCTION_ORDER'
    AND NEW.image_status = 'READY' THEN
    PERFORM public.wos_qa_p2_m2_invalidate_signoff(
      NEW.entity_id,
      NEW.organization_id,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER wos_qa_p2_m2_reference_image_guard
BEFORE INSERT OR UPDATE OF
  image_status,
  version_label,
  storage_path,
  supersedes_image_id,
  superseded_at
ON public.wos_reference_images
FOR EACH ROW
EXECUTE FUNCTION public.wos_qa_p2_m2_image_change_guard();

CREATE FUNCTION wos_qa_safety.p2_single_order_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_enabled boolean;
  v_actor_profile_id uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.wos_qa_p2_execution_gate WHERE enabled
    UNION ALL
    SELECT 1 FROM public.wos_qa_p2_office_execution_gate WHERE enabled
    UNION ALL
    SELECT 1 FROM public.wos_qa_p2_m2_gate WHERE enabled
  ) INTO v_enabled;
  IF NOT v_enabled THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE'
    OR NEW.order_number NOT LIKE 'QA-%'
    OR NEW.workflow_status <> 'WAITING_MATERIAL' THEN
    RAISE EXCEPTION 'QA_P2_GATE_SINGLE_ORDER_SCOPE_REJECTED'
      USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_actor_profile_id
  FROM public.profiles
  WHERE user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'QA_P2_GATE_SINGLE_ORDER_SCOPE_REJECTED'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT enabled, allowed_order_id, allowed_organization_id,
        allowed_profile_id, enabled_until, activated_at
      FROM public.wos_qa_p2_execution_gate
      UNION ALL
      SELECT enabled, allowed_order_id, allowed_organization_id,
        allowed_profile_id, enabled_until, activated_at
      FROM public.wos_qa_p2_office_execution_gate
      UNION ALL
      SELECT enabled, allowed_order_id, allowed_organization_id,
        allowed_profile_id, enabled_until, activated_at
      FROM public.wos_qa_p2_m2_gate
    ) gate
    WHERE gate.enabled = true
      AND (
        gate.allowed_order_id IS DISTINCT FROM NEW.id
        OR gate.allowed_organization_id IS DISTINCT FROM NEW.organization_id
        OR gate.allowed_profile_id IS DISTINCT FROM v_actor_profile_id
        OR gate.enabled_until IS NULL
        OR gate.enabled_until <= clock_timestamp()
      )
  ) THEN
    RAISE EXCEPTION 'QA_P2_GATE_SINGLE_ORDER_SCOPE_REJECTED'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER wos_qa_p2_single_order_gate_guard
BEFORE INSERT OR UPDATE OR DELETE
ON public.wos_production_orders
FOR EACH ROW
EXECUTE FUNCTION wos_qa_safety.p2_single_order_write_guard();

ALTER TABLE public.wos_production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_reference_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_visual_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_visual_baseline_items ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public, storage, auth
TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles,
  public.wos_production_orders,
  public.wos_reference_images,
  public.wos_visual_baselines,
  public.wos_visual_baseline_items,
  public.wos_qa_verified_image_proofs,
  public.wos_submission_receipts,
  public.wos_qa_p2_m2_receipts,
  public.wos_office_readiness_receipts,
  public.wos_qa_orphan_cleanup_claims,
  public.wos_qa_p2_action_receipts,
  public.wos_qa_p2_office_revisions,
  public.wos_qa_p2_review_receipts,
  public.wos_qa_trusted_proof_receipts,
  public.wos_workshop_inbox,
  public.wos_confirmations,
  public.wos_blockers,
  public.wos_status_history,
  public.wos_resource_readiness,
  public.wos_qa_p2_execution_gate,
  public.wos_qa_p2_office_execution_gate,
  public.wos_qa_p2_m2_gate,
  storage.objects
TO service_role;
GRANT INSERT, DELETE ON
  public.wos_production_orders,
  public.wos_reference_images,
  public.wos_visual_baselines,
  public.wos_visual_baseline_items
TO service_role;
GRANT UPDATE ON public.wos_production_orders TO service_role;

GRANT EXECUTE ON FUNCTION
  public.wos_qa_p2_m2_invalidate_signoff(uuid, uuid, uuid),
  public.wos_qa_p2_m2_image_change_guard(),
  wos_qa_safety.p2_single_order_write_guard()
TO service_role;
