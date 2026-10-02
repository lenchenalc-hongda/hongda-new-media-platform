-- Customer Project Center - Phase 5A Persistence Foundation
-- Scope: additive core CPC tables, read-only RLS, relation read helpers, grants.
-- Safety:
--   - NO Production execution in this task.
--   - NO DROP / TRUNCATE / DELETE of existing business data.
--   - NO legacy leads/site_data/ai_jobs changes.
--   - Ordinary authenticated writes are NOT enabled; Phase 5B will add narrow RPC mutations.
--   - Customer / ownership / receipt / order / quote master truth is NOT duplicated.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Existing shared prerequisites
-- ---------------------------------------------------------------------------
-- Reuse:
--   public.organizations
--   public.profiles
--   public.auth_profile_id()
--   public.auth_org_id()
--   public.auth_has_role(TEXT)
--   public.set_updated_at()
--
-- Review Center migrations already established uq_profiles_id_org on
-- profiles(id, org_id). CPC business FKs therefore use profiles.id + org_id.

-- ---------------------------------------------------------------------------
-- 1. Customer reference mapping (NOT a customer master)
-- ---------------------------------------------------------------------------

CREATE TABLE public.cpc_customer_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  reference_kind TEXT NOT NULL
    CHECK (reference_kind IN ('canonical', 'provisional')),

  external_source TEXT,
  external_customer_id TEXT,
  provisional_source_reference TEXT,

  display_name_snapshot TEXT NOT NULL,
  external_owner_reference TEXT,
  source_synced_at TIMESTAMPTZ,

  status TEXT NOT NULL,
  mapped_canonical_reference_id UUID,
  created_by_profile_id UUID,

  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_cpc_customer_references_id_org UNIQUE (id, org_id),

  CONSTRAINT chk_cpc_customer_reference_display_name
    CHECK (length(btrim(display_name_snapshot)) > 0),

  CONSTRAINT chk_cpc_customer_reference_kind_fields
    CHECK (
      (
        reference_kind = 'canonical'
        AND external_source IS NOT NULL
        AND length(btrim(external_source)) > 0
        AND external_customer_id IS NOT NULL
        AND length(btrim(external_customer_id)) > 0
        AND source_synced_at IS NOT NULL
        AND provisional_source_reference IS NULL
        AND created_by_profile_id IS NULL
        AND mapped_canonical_reference_id IS NULL
        AND status IN ('active', 'inactive')
      )
      OR
      (
        reference_kind = 'provisional'
        AND external_source IS NULL
        AND external_customer_id IS NULL
        AND source_synced_at IS NULL
        AND provisional_source_reference IS NOT NULL
        AND length(btrim(provisional_source_reference)) > 0
        AND created_by_profile_id IS NOT NULL
        AND status IN ('pending_review', 'mapped', 'inactive')
      )
    ),

  CONSTRAINT chk_cpc_customer_reference_mapping_status
    CHECK (
      (
        reference_kind = 'provisional'
        AND status = 'mapped'
        AND mapped_canonical_reference_id IS NOT NULL
      )
      OR
      (
        reference_kind = 'provisional'
        AND status = 'pending_review'
        AND mapped_canonical_reference_id IS NULL
      )
      OR
      (
        reference_kind = 'provisional'
        AND status = 'inactive'
      )
      OR
      reference_kind = 'canonical'
    ),

  CONSTRAINT fk_cpc_customer_reference_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),

  CONSTRAINT fk_cpc_customer_reference_mapped_org
    FOREIGN KEY (mapped_canonical_reference_id, org_id)
    REFERENCES public.cpc_customer_references(id, org_id)
);

CREATE UNIQUE INDEX uq_cpc_customer_reference_canonical
  ON public.cpc_customer_references(org_id, external_source, external_customer_id)
  WHERE reference_kind = 'canonical';

CREATE UNIQUE INDEX uq_cpc_customer_reference_provisional_source
  ON public.cpc_customer_references(org_id, provisional_source_reference)
  WHERE reference_kind = 'provisional';

CREATE INDEX idx_cpc_customer_reference_org_status
  ON public.cpc_customer_references(org_id, status);

CREATE INDEX idx_cpc_customer_reference_external_owner
  ON public.cpc_customer_references(org_id, external_owner_reference)
  WHERE external_owner_reference IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. External employee/profile identity mapping
-- ---------------------------------------------------------------------------

CREATE TABLE public.cpc_external_profile_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  external_source TEXT NOT NULL,
  external_person_id TEXT NOT NULL,
  profile_id UUID NOT NULL,
  display_name_snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  mapped_by_profile_id UUID NOT NULL,
  mapped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),

  CONSTRAINT uq_cpc_external_profile_mapping_id_org UNIQUE (id, org_id),

  CONSTRAINT chk_cpc_external_profile_mapping_source
    CHECK (length(btrim(external_source)) > 0),

  CONSTRAINT chk_cpc_external_profile_mapping_person
    CHECK (length(btrim(external_person_id)) > 0),

  CONSTRAINT fk_cpc_external_profile_mapping_profile_org
    FOREIGN KEY (profile_id, org_id)
    REFERENCES public.profiles(id, org_id),

  CONSTRAINT fk_cpc_external_profile_mapping_actor_org
    FOREIGN KEY (mapped_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE UNIQUE INDEX uq_cpc_external_profile_mapping_external
  ON public.cpc_external_profile_mappings(
    org_id,
    external_source,
    external_person_id
  );

CREATE UNIQUE INDEX uq_cpc_external_profile_mapping_active_profile
  ON public.cpc_external_profile_mappings(
    org_id,
    external_source,
    profile_id
  )
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 3. Project
-- ---------------------------------------------------------------------------

CREATE TABLE public.cpc_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_reference_id UUID NOT NULL,

  title TEXT NOT NULL,
  objective_summary TEXT NOT NULL,
  project_type TEXT NOT NULL
    CHECK (project_type IN (
      'transfer_film',
      'transfer_processing',
      'equipment',
      'uv',
      'other'
    )),

  owner_profile_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'won', 'lost', 'cancelled')),
  stage TEXT NOT NULL,
  waiting_on TEXT NOT NULL DEFAULT 'none'
    CHECK (waiting_on IN (
      'none',
      'customer',
      'internal',
      'supplier',
      'quality',
      'finance',
      'logistics',
      'other'
    )),
  next_check_at TIMESTAMPTZ,

  risk_level TEXT
    CHECK (risk_level IS NULL OR risk_level IN ('low', 'medium', 'high')),
  priority TEXT NOT NULL
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),

  expected_amount_minor BIGINT,
  currency TEXT,
  expected_close_date DATE,

  created_by_profile_id UUID NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_cpc_projects_id_org UNIQUE (id, org_id),

  CONSTRAINT chk_cpc_project_required_text
    CHECK (
      length(btrim(title)) > 0
      AND length(btrim(objective_summary)) > 0
      AND length(btrim(stage)) > 0
    ),

  CONSTRAINT chk_cpc_project_amount_currency
    CHECK (
      (
        expected_amount_minor IS NULL
        AND currency IS NULL
      )
      OR
      (
        expected_amount_minor IS NOT NULL
        AND expected_amount_minor >= 0
        AND currency IS NOT NULL
        AND currency ~ '^[A-Z]{3}$'
      )
    ),

  CONSTRAINT chk_cpc_project_paused_check
    CHECK (status <> 'paused' OR next_check_at IS NOT NULL),

  CONSTRAINT fk_cpc_project_customer_org
    FOREIGN KEY (customer_reference_id, org_id)
    REFERENCES public.cpc_customer_references(id, org_id),

  CONSTRAINT fk_cpc_project_owner_org
    FOREIGN KEY (owner_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),

  CONSTRAINT fk_cpc_project_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE INDEX idx_cpc_projects_org_status
  ON public.cpc_projects(org_id, status);

CREATE INDEX idx_cpc_projects_org_owner
  ON public.cpc_projects(org_id, owner_profile_id);

CREATE INDEX idx_cpc_projects_org_customer
  ON public.cpc_projects(org_id, customer_reference_id);

CREATE INDEX idx_cpc_projects_org_waiting_check
  ON public.cpc_projects(org_id, next_check_at)
  WHERE waiting_on <> 'none' AND next_check_at IS NOT NULL;

CREATE INDEX idx_cpc_projects_org_priority
  ON public.cpc_projects(org_id, priority);

-- ---------------------------------------------------------------------------
-- 4. Project collaborators
-- ---------------------------------------------------------------------------

CREATE TABLE public.cpc_project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  project_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  collaborator_role TEXT NOT NULL
    CHECK (collaborator_role IN (
      'technical',
      'design',
      'quality',
      'management',
      'support'
    )),
  added_by_profile_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ,
  removed_by_profile_id UUID,

  CONSTRAINT uq_cpc_project_members_id_org UNIQUE (id, org_id),

  CONSTRAINT fk_cpc_project_member_project_org
    FOREIGN KEY (project_id, org_id)
    REFERENCES public.cpc_projects(id, org_id),

  CONSTRAINT fk_cpc_project_member_profile_org
    FOREIGN KEY (profile_id, org_id)
    REFERENCES public.profiles(id, org_id),

  CONSTRAINT fk_cpc_project_member_added_by_org
    FOREIGN KEY (added_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),

  CONSTRAINT fk_cpc_project_member_removed_by_org
    FOREIGN KEY (removed_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),

  CONSTRAINT chk_cpc_project_member_removal_pair
    CHECK (
      (removed_at IS NULL AND removed_by_profile_id IS NULL)
      OR
      (removed_at IS NOT NULL AND removed_by_profile_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_cpc_project_member_active
  ON public.cpc_project_members(project_id, profile_id)
  WHERE removed_at IS NULL;

CREATE INDEX idx_cpc_project_members_org_profile
  ON public.cpc_project_members(org_id, profile_id)
  WHERE removed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Append-only Project / Customer event ledger
-- ---------------------------------------------------------------------------

CREATE TABLE public.cpc_project_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,

  org_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_reference_id UUID,
  project_id UUID,

  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'CONTACT_LOGGED',
      'EFFECTIVE_PROGRESS_RECORDED',
      'CUSTOMER_RESPONSE_RECEIVED',
      'WAITING_STARTED',
      'WAITING_RESOLVED',
      'QUOTE_SENT',
      'SAMPLE_SENT',
      'CUSTOMER_CONFIRMED',
      'COMMERCIAL_CONFIRMED',
      'ORDER_CONFIRMED',
      'STAGE_CHANGED',
      'PROJECT_PAUSED',
      'PROJECT_REOPENED',
      'PROJECT_WON',
      'PROJECT_LOST',
      'PROJECT_CANCELLED'
    )),
  event_category TEXT NOT NULL
    CHECK (event_category IN (
      'CONTACT',
      'PROGRESS',
      'WAIT',
      'COMMERCIAL',
      'LIFECYCLE'
    )),

  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_profile_id UUID,

  source TEXT NOT NULL
    CHECK (source IN (
      'user',
      'accepted_ai_draft',
      'integration',
      'system'
    )),
  source_reference_id TEXT,
  raw_input TEXT,

  payload_schema_version INTEGER NOT NULL
    CHECK (payload_schema_version >= 1),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,

  correction_of_event_id UUID,
  request_id UUID,

  CONSTRAINT uq_cpc_project_events_id_org UNIQUE (id, org_id),

  CONSTRAINT chk_cpc_project_event_parent
    CHECK (customer_reference_id IS NOT NULL OR project_id IS NOT NULL),

  CONSTRAINT chk_cpc_project_event_source_actor
    CHECK (
      (source = 'user' AND actor_profile_id IS NOT NULL)
      OR
      (
        source = 'accepted_ai_draft'
        AND actor_profile_id IS NOT NULL
        AND source_reference_id IS NOT NULL
        AND length(btrim(source_reference_id)) > 0
      )
      OR
      (
        source = 'integration'
        AND source_reference_id IS NOT NULL
        AND length(btrim(source_reference_id)) > 0
      )
      OR
      source = 'system'
    ),

  CONSTRAINT fk_cpc_project_event_customer_org
    FOREIGN KEY (customer_reference_id, org_id)
    REFERENCES public.cpc_customer_references(id, org_id),

  CONSTRAINT fk_cpc_project_event_project_org
    FOREIGN KEY (project_id, org_id)
    REFERENCES public.cpc_projects(id, org_id),

  CONSTRAINT fk_cpc_project_event_actor_org
    FOREIGN KEY (actor_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),

  CONSTRAINT fk_cpc_project_event_correction_org
    FOREIGN KEY (correction_of_event_id, org_id)
    REFERENCES public.cpc_project_events(id, org_id)
);

CREATE INDEX idx_cpc_project_events_org_seq
  ON public.cpc_project_events(org_id, event_seq);

CREATE INDEX idx_cpc_project_events_org_project_seq
  ON public.cpc_project_events(org_id, project_id, event_seq)
  WHERE project_id IS NOT NULL;

CREATE INDEX idx_cpc_project_events_org_customer_seq
  ON public.cpc_project_events(org_id, customer_reference_id, event_seq)
  WHERE customer_reference_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. Work Items
-- ---------------------------------------------------------------------------

CREATE TABLE public.cpc_work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_reference_id UUID,
  project_id UUID,

  work_item_type TEXT NOT NULL
    CHECK (work_item_type IN (
      'NEXT_ACTION',
      'CUSTOMER_COMMITMENT',
      'INTERNAL_COLLABORATION',
      'FOLLOW_UP',
      'MANAGEMENT_DECISION'
    )),

  title TEXT NOT NULL,
  description TEXT,

  assignee_profile_id UUID NOT NULL,
  created_by_profile_id UUID NOT NULL,
  due_at TIMESTAMPTZ,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'in_progress',
      'blocked',
      'completed',
      'cancelled'
    )),

  priority TEXT NOT NULL
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),

  blocked_reason TEXT,

  completed_at TIMESTAMPTZ,
  completed_by_profile_id UUID,

  cancelled_at TIMESTAMPTZ,
  cancelled_by_profile_id UUID,
  cancellation_reason TEXT,

  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_cpc_work_items_id_org UNIQUE (id, org_id),

  CONSTRAINT chk_cpc_work_item_title
    CHECK (length(btrim(title)) > 0),

  CONSTRAINT chk_cpc_work_item_blocked
    CHECK (
      status <> 'blocked'
      OR (
        blocked_reason IS NOT NULL
        AND length(btrim(blocked_reason)) > 0
      )
    ),

  CONSTRAINT chk_cpc_work_item_completed
    CHECK (
      (
        status = 'completed'
        AND completed_at IS NOT NULL
        AND completed_by_profile_id IS NOT NULL
        AND cancelled_at IS NULL
        AND cancelled_by_profile_id IS NULL
      )
      OR
      (
        status <> 'completed'
        AND completed_at IS NULL
        AND completed_by_profile_id IS NULL
      )
    ),

  CONSTRAINT chk_cpc_work_item_cancelled
    CHECK (
      (
        status = 'cancelled'
        AND cancelled_at IS NOT NULL
        AND cancelled_by_profile_id IS NOT NULL
      )
      OR
      (
        status <> 'cancelled'
        AND cancelled_at IS NULL
        AND cancelled_by_profile_id IS NULL
        AND cancellation_reason IS NULL
      )
    ),

  CONSTRAINT fk_cpc_work_item_customer_org
    FOREIGN KEY (customer_reference_id, org_id)
    REFERENCES public.cpc_customer_references(id, org_id),

  CONSTRAINT fk_cpc_work_item_project_org
    FOREIGN KEY (project_id, org_id)
    REFERENCES public.cpc_projects(id, org_id),

  CONSTRAINT fk_cpc_work_item_assignee_org
    FOREIGN KEY (assignee_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),

  CONSTRAINT fk_cpc_work_item_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),

  CONSTRAINT fk_cpc_work_item_completed_by_org
    FOREIGN KEY (completed_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),

  CONSTRAINT fk_cpc_work_item_cancelled_by_org
    FOREIGN KEY (cancelled_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE UNIQUE INDEX uq_cpc_work_item_open_next_action
  ON public.cpc_work_items(project_id)
  WHERE work_item_type = 'NEXT_ACTION'
    AND project_id IS NOT NULL
    AND status IN ('pending', 'in_progress', 'blocked');

CREATE INDEX idx_cpc_work_items_org_assignee_status_due
  ON public.cpc_work_items(org_id, assignee_profile_id, status, due_at);

CREATE INDEX idx_cpc_work_items_org_project
  ON public.cpc_work_items(org_id, project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX idx_cpc_work_items_org_customer
  ON public.cpc_work_items(org_id, customer_reference_id)
  WHERE customer_reference_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. Strong append-only audit log
-- ---------------------------------------------------------------------------

CREATE TABLE public.cpc_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,

  org_id UUID NOT NULL REFERENCES public.organizations(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_profile_id UUID,

  reason TEXT,
  before_values JSONB,
  after_values JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  request_id UUID,

  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_cpc_audit_required_text
    CHECK (
      length(btrim(entity_type)) > 0
      AND length(btrim(action)) > 0
    ),

  CONSTRAINT fk_cpc_audit_actor_org
    FOREIGN KEY (actor_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE INDEX idx_cpc_audit_org_seq
  ON public.cpc_audit_log(org_id, audit_seq);

CREATE INDEX idx_cpc_audit_org_entity
  ON public.cpc_audit_log(org_id, entity_type, entity_id, audit_seq);

-- ---------------------------------------------------------------------------
-- 8. updated_at triggers for mutable rows
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_cpc_customer_references_updated_at
  BEFORE UPDATE ON public.cpc_customer_references
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_cpc_external_profile_mappings_updated_at
  BEFORE UPDATE ON public.cpc_external_profile_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_cpc_projects_updated_at
  BEFORE UPDATE ON public.cpc_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_cpc_work_items_updated_at
  BEFORE UPDATE ON public.cpc_work_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. Relation-based read helpers
-- ---------------------------------------------------------------------------
-- These helpers derive actor identity from the authenticated session.
-- Caller-supplied profile ids are never treated as authority.

CREATE OR REPLACE FUNCTION public.cpc_can_read_project(
  p_project_id UUID,
  p_org_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID := public.auth_profile_id();
  v_actor_org_id TEXT := public.auth_org_id();
BEGIN
  IF v_actor_profile_id IS NULL
     OR v_actor_org_id IS NULL
     OR p_org_id::TEXT <> v_actor_org_id THEN
    RETURN FALSE;
  END IF;

  IF public.auth_has_role('admin') OR public.auth_has_role('manager') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cpc_projects p
      WHERE p.id = p_project_id
        AND p.org_id = p_org_id
    );
  END IF;

  IF NOT public.auth_has_role('sales') THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cpc_projects p
    WHERE p.id = p_project_id
      AND p.org_id = p_org_id
      AND (
        p.owner_profile_id = v_actor_profile_id
        OR p.created_by_profile_id = v_actor_profile_id
        OR EXISTS (
          SELECT 1
          FROM public.cpc_project_members pm
          WHERE pm.project_id = p.id
            AND pm.org_id = p.org_id
            AND pm.profile_id = v_actor_profile_id
            AND pm.removed_at IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM public.cpc_work_items wi
          WHERE wi.project_id = p.id
            AND wi.org_id = p.org_id
            AND (
              wi.assignee_profile_id = v_actor_profile_id
              OR wi.created_by_profile_id = v_actor_profile_id
            )
        )
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cpc_can_read_customer_reference(
  p_customer_reference_id UUID,
  p_org_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID := public.auth_profile_id();
  v_actor_org_id TEXT := public.auth_org_id();
BEGIN
  IF v_actor_profile_id IS NULL
     OR v_actor_org_id IS NULL
     OR p_org_id::TEXT <> v_actor_org_id THEN
    RETURN FALSE;
  END IF;

  IF public.auth_has_role('admin') OR public.auth_has_role('manager') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cpc_customer_references cr
      WHERE cr.id = p_customer_reference_id
        AND cr.org_id = p_org_id
    );
  END IF;

  IF NOT public.auth_has_role('sales') THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cpc_customer_references cr
    WHERE cr.id = p_customer_reference_id
      AND cr.org_id = p_org_id
      AND (
        (
          cr.reference_kind = 'provisional'
          AND cr.created_by_profile_id = v_actor_profile_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.cpc_projects p
          WHERE p.customer_reference_id = cr.id
            AND p.org_id = cr.org_id
            AND public.cpc_can_read_project(p.id, p.org_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.cpc_work_items wi
          WHERE wi.customer_reference_id = cr.id
            AND wi.org_id = cr.org_id
            AND wi.project_id IS NULL
            AND (
              wi.assignee_profile_id = v_actor_profile_id
              OR wi.created_by_profile_id = v_actor_profile_id
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.cpc_external_profile_mappings epm
          WHERE epm.org_id = cr.org_id
            AND epm.external_source = cr.external_source
            AND epm.external_person_id = cr.external_owner_reference
            AND epm.profile_id = v_actor_profile_id
            AND epm.status = 'active'
        )
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cpc_can_read_work_item(
  p_work_item_id UUID,
  p_org_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID := public.auth_profile_id();
  v_actor_org_id TEXT := public.auth_org_id();
BEGIN
  IF v_actor_profile_id IS NULL
     OR v_actor_org_id IS NULL
     OR p_org_id::TEXT <> v_actor_org_id THEN
    RETURN FALSE;
  END IF;

  IF public.auth_has_role('admin') OR public.auth_has_role('manager') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cpc_work_items wi
      WHERE wi.id = p_work_item_id
        AND wi.org_id = p_org_id
    );
  END IF;

  IF NOT public.auth_has_role('sales') THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cpc_work_items wi
    WHERE wi.id = p_work_item_id
      AND wi.org_id = p_org_id
      AND (
        wi.assignee_profile_id = v_actor_profile_id
        OR wi.created_by_profile_id = v_actor_profile_id
        OR (
          wi.project_id IS NOT NULL
          AND public.cpc_can_read_project(wi.project_id, wi.org_id)
        )
        OR (
          wi.project_id IS NULL
          AND wi.customer_reference_id IS NOT NULL
          AND public.cpc_can_read_customer_reference(
            wi.customer_reference_id,
            wi.org_id
          )
        )
      )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. RLS enablement
-- ---------------------------------------------------------------------------

ALTER TABLE public.cpc_customer_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpc_external_profile_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpc_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpc_project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpc_project_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpc_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpc_audit_log ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 11. Read-only RLS policies
-- ---------------------------------------------------------------------------

CREATE POLICY "cpc_customer_references_select"
  ON public.cpc_customer_references
  FOR SELECT
  USING (
    public.cpc_can_read_customer_reference(id, org_id)
  );

CREATE POLICY "cpc_external_profile_mappings_select_management"
  ON public.cpc_external_profile_mappings
  FOR SELECT
  USING (
    org_id::TEXT = public.auth_org_id()
    AND (
      public.auth_has_role('admin')
      OR public.auth_has_role('manager')
    )
  );

CREATE POLICY "cpc_projects_select"
  ON public.cpc_projects
  FOR SELECT
  USING (
    public.cpc_can_read_project(id, org_id)
  );

CREATE POLICY "cpc_project_members_select"
  ON public.cpc_project_members
  FOR SELECT
  USING (
    public.cpc_can_read_project(project_id, org_id)
  );

CREATE POLICY "cpc_project_events_select"
  ON public.cpc_project_events
  FOR SELECT
  USING (
    org_id::TEXT = public.auth_org_id()
    AND (
      public.auth_has_role('admin')
      OR public.auth_has_role('manager')
      OR (
        project_id IS NOT NULL
        AND public.cpc_can_read_project(project_id, org_id)
      )
      OR (
        project_id IS NULL
        AND customer_reference_id IS NOT NULL
        AND public.cpc_can_read_customer_reference(
          customer_reference_id,
          org_id
        )
      )
    )
  );

CREATE POLICY "cpc_work_items_select"
  ON public.cpc_work_items
  FOR SELECT
  USING (
    public.cpc_can_read_work_item(id, org_id)
  );

CREATE POLICY "cpc_audit_log_select_management"
  ON public.cpc_audit_log
  FOR SELECT
  USING (
    org_id::TEXT = public.auth_org_id()
    AND (
      public.auth_has_role('admin')
      OR public.auth_has_role('manager')
    )
  );

-- No INSERT / UPDATE / DELETE policies are created in Phase 5A.
-- Phase 5B will add narrow RPC mutations; ordinary users will still not receive
-- direct table mutation privileges.

-- ---------------------------------------------------------------------------
-- 12. Explicit grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.cpc_customer_references
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.cpc_external_profile_mappings
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.cpc_projects
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.cpc_project_members
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.cpc_project_events
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.cpc_work_items
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.cpc_audit_log
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.cpc_customer_references TO authenticated;
GRANT SELECT ON TABLE public.cpc_external_profile_mappings TO authenticated;
GRANT SELECT ON TABLE public.cpc_projects TO authenticated;
GRANT SELECT ON TABLE public.cpc_project_members TO authenticated;
GRANT SELECT ON TABLE public.cpc_project_events TO authenticated;
GRANT SELECT ON TABLE public.cpc_work_items TO authenticated;
GRANT SELECT ON TABLE public.cpc_audit_log TO authenticated;

REVOKE ALL ON FUNCTION public.cpc_can_read_project(UUID, UUID)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cpc_can_read_customer_reference(UUID, UUID)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cpc_can_read_work_item(UUID, UUID)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.cpc_can_read_project(UUID, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_can_read_customer_reference(UUID, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_can_read_work_item(UUID, UUID)
  TO authenticated;

COMMIT;
