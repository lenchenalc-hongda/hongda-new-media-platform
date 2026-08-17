-- 宏达项目复盘与改善中心 - Phase 2 Migration 1
-- Tenant / Core Review Foundation
-- Scope: organizations RLS, profiles composite unique, review_dict_items,
--        review_cases, review_type_details, review_members
-- Safety: no DROP, TRUNCATE, DELETE, or UPDATE of existing rows; no seed data.

BEGIN;

-- ============ 1. organizations RLS ============
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizations_select_own" ON organizations
  FOR SELECT
  USING (id::text = auth_org_id());

CREATE POLICY "organizations_update_admin_own" ON organizations
  FOR UPDATE
  USING (auth_has_role('admin') AND id::text = auth_org_id())
  WITH CHECK (auth_has_role('admin') AND id::text = auth_org_id());

-- No INSERT / DELETE policy for authenticated users.

-- ============ 2. profiles composite unique ============
-- Supports cross-org composite FKs: (profile_id, org_id) -> profiles(id, org_id).
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_id_org
  ON profiles(id, org_id);

-- ============ 2.1 updated_at helper ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============ 2.2 organizations immutable guard ============
CREATE OR REPLACE FUNCTION public.organizations_protect_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'organizations.id and organizations.created_at are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_organizations_set_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_organizations_protect_immutable
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_protect_immutable();

-- ============ 3. review_dict_items ============
CREATE TABLE review_dict_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  dict_type TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_review_dict_org_system CHECK (
    (is_system = TRUE AND org_id IS NULL AND created_by IS NULL)
    OR
    (is_system = FALSE AND org_id IS NOT NULL AND created_by IS NOT NULL)
  ),
  CONSTRAINT chk_review_dict_type_nonempty CHECK (
    length(btrim(dict_type)) > 0
  ),
  CONSTRAINT chk_review_dict_code_nonempty CHECK (
    length(btrim(code)) > 0
  ),
  CONSTRAINT chk_review_dict_label_nonempty CHECK (
    length(btrim(label)) > 0
  ),
  CONSTRAINT fk_review_dict_created_by_org
    FOREIGN KEY (created_by, org_id) REFERENCES profiles(id, org_id)
);

CREATE UNIQUE INDEX uq_review_dict_items_org
  ON review_dict_items(org_id, dict_type, code)
  WHERE org_id IS NOT NULL;

CREATE UNIQUE INDEX uq_review_dict_items_system
  ON review_dict_items(dict_type, code)
  WHERE org_id IS NULL;

CREATE INDEX idx_review_dict_items_org_enabled
  ON review_dict_items(org_id, enabled);

ALTER TABLE review_dict_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_dict_items_select" ON review_dict_items
  FOR SELECT
  USING (
    auth_profile_id() IS NOT NULL
    AND (org_id IS NULL OR org_id::text = auth_org_id())
  );

CREATE POLICY "review_dict_items_insert_org_admin" ON review_dict_items
  FOR INSERT
  WITH CHECK (
    auth_has_role('admin')
    AND org_id::text = auth_org_id()
    AND created_by = auth_profile_id()
    AND is_system = FALSE
  );

-- ============ 4. review_cases ============
CREATE TABLE review_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  review_no TEXT NOT NULL,
  review_type TEXT NOT NULL CHECK (review_type IN ('A', 'B', 'C')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'submitted', 'in_review', 'action_required', 'verifying',
      'closed', 'archived', 'rejected', 'cancelled'
    )),
  risk_level TEXT CHECK (risk_level IN ('RED', 'YELLOW', 'GREEN')),
  risk_reason TEXT,
  occurred_at TIMESTAMPTZ,
  customer_name TEXT,
  order_no TEXT,
  project_name TEXT,
  product_name TEXT,
  process_name TEXT,
  description TEXT,
  impact_summary TEXT,
  created_by UUID NOT NULL,
  owner_id UUID NOT NULL,
  pmo_id UUID,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  close_override_reason TEXT,
  report_generated_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_review_cases_no UNIQUE (org_id, review_no),
  CONSTRAINT uq_review_cases_id_org UNIQUE (id, org_id),
  CONSTRAINT uq_review_cases_id_org_type UNIQUE (id, org_id, review_type),
  CONSTRAINT chk_review_cases_version CHECK (version >= 1),
  CONSTRAINT chk_review_cases_review_no CHECK (
    review_no ~ '^REV-[0-9]{4}-[0-9]{6}$'
  ),
  CONSTRAINT chk_review_cases_risk_reason CHECK (
    (risk_level IS NULL AND risk_reason IS NULL)
    OR
    (
      risk_level IS NOT NULL
      AND risk_reason IS NOT NULL
      AND length(btrim(risk_reason)) > 0
    )
  ),
  CONSTRAINT chk_review_cases_closed_pair CHECK (
    (closed_at IS NULL AND closed_by IS NULL)
    OR
    (closed_at IS NOT NULL AND closed_by IS NOT NULL)
  ),
  CONSTRAINT chk_review_cases_required_text CHECK (
    length(btrim(review_no)) > 0 AND length(btrim(title)) > 0
  ),
  CONSTRAINT chk_review_cases_closed_status CHECK (
    (status = 'closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL)
    OR
    (
      status IN ('draft', 'submitted', 'in_review', 'action_required',
                 'verifying', 'rejected', 'cancelled')
      AND closed_at IS NULL AND closed_by IS NULL
    )
    OR
    (status = 'archived')
  ),
  CONSTRAINT chk_review_cases_archived_status CHECK (
    (status = 'archived' AND archived_at IS NOT NULL)
    OR
    (status <> 'archived' AND archived_at IS NULL)
  ),
  CONSTRAINT fk_review_cases_created_by_org
    FOREIGN KEY (created_by, org_id) REFERENCES profiles(id, org_id),
  CONSTRAINT fk_review_cases_owner_org
    FOREIGN KEY (owner_id, org_id) REFERENCES profiles(id, org_id),
  CONSTRAINT fk_review_cases_pmo_org
    FOREIGN KEY (pmo_id, org_id) REFERENCES profiles(id, org_id),
  CONSTRAINT fk_review_cases_closed_by_org
    FOREIGN KEY (closed_by, org_id) REFERENCES profiles(id, org_id)
);

CREATE INDEX idx_review_cases_org_status ON review_cases(org_id, status);
CREATE INDEX idx_review_cases_org_type ON review_cases(org_id, review_type);
CREATE INDEX idx_review_cases_org_created ON review_cases(org_id, created_at DESC);
CREATE INDEX idx_review_cases_org_risk ON review_cases(org_id, risk_level);
CREATE INDEX idx_review_cases_org_owner ON review_cases(org_id, owner_id);
CREATE INDEX idx_review_cases_org_created_by ON review_cases(org_id, created_by);

ALTER TABLE review_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_cases_select_org" ON review_cases
  FOR SELECT
  USING (
    org_id::text = auth_org_id()
    AND (
      auth_has_role('admin') OR auth_has_role('manager')
      OR auth_has_role('operator') OR auth_has_role('sales')
      OR auth_has_role('viewer')
    )
  );

CREATE POLICY "review_cases_insert" ON review_cases
  FOR INSERT
  WITH CHECK (
    org_id::text = auth_org_id()
    AND created_by = auth_profile_id()
    AND status = 'draft'
    AND version = 1
    AND closed_at IS NULL
    AND closed_by IS NULL
    AND close_override_reason IS NULL
    AND archived_at IS NULL
    AND report_generated_at IS NULL
    AND (
      auth_has_role('admin') OR auth_has_role('manager')
      OR auth_has_role('operator') OR auth_has_role('sales')
    )
  );

-- ============ 5. review_type_details ============
CREATE TABLE review_type_details (
  review_id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  review_type TEXT NOT NULL CHECK (review_type IN ('A', 'B', 'C')),
  -- A-specific
  pre_production_stage TEXT,
  problem_found_stage TEXT,
  order_loss_reason TEXT,
  customer_trust_impact TEXT,
  customer_notified BOOLEAN,
  -- B-specific
  abnormal_phase TEXT,
  abnormal_phenomenon TEXT,
  defect_rate NUMERIC(7, 4),
  defect_items TEXT,
  delivery_impact TEXT,
  onsite_records TEXT,
  -- C integrated analysis
  frontend_stage TEXT,
  production_stage TEXT,
  root_cause_summary TEXT,
  responsibility TEXT,
  improvement_advice TEXT,
  -- Non-statistical extension
  additional_notes JSONB NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_review_type_details_case
    FOREIGN KEY (review_id, org_id, review_type)
    REFERENCES review_cases(id, org_id, review_type),
  CONSTRAINT fk_review_type_details_created_by_org
    FOREIGN KEY (created_by, org_id) REFERENCES profiles(id, org_id),
  CONSTRAINT chk_review_type_details_a_scope CHECK (
    review_type <> 'A'
    OR (
      abnormal_phase IS NULL
      AND abnormal_phenomenon IS NULL
      AND defect_rate IS NULL
      AND defect_items IS NULL
      AND delivery_impact IS NULL
      AND onsite_records IS NULL
      AND frontend_stage IS NULL
      AND production_stage IS NULL
      AND root_cause_summary IS NULL
      AND responsibility IS NULL
      AND improvement_advice IS NULL
    )
  ),
  CONSTRAINT chk_review_type_details_b_scope CHECK (
    review_type <> 'B'
    OR (
      pre_production_stage IS NULL
      AND problem_found_stage IS NULL
      AND order_loss_reason IS NULL
      AND customer_trust_impact IS NULL
      AND customer_notified IS NULL
      AND frontend_stage IS NULL
      AND production_stage IS NULL
      AND root_cause_summary IS NULL
      AND responsibility IS NULL
      AND improvement_advice IS NULL
    )
  )
);

CREATE INDEX idx_review_type_details_org_type
  ON review_type_details(org_id, review_type);

ALTER TABLE review_type_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_type_details_select_org" ON review_type_details
  FOR SELECT
  USING (org_id::text = auth_org_id());

CREATE POLICY "review_type_details_insert_draft" ON review_type_details
  FOR INSERT
  WITH CHECK (
    org_id::text = auth_org_id()
    AND created_by = auth_profile_id()
    AND EXISTS (
      SELECT 1 FROM review_cases rc
      WHERE rc.id = review_id
        AND rc.org_id = org_id
        AND rc.status = 'draft'
        AND (
          auth_has_role('admin') OR auth_has_role('manager')
          OR rc.created_by = auth_profile_id()
          OR rc.owner_id = auth_profile_id()
        )
    )
  );

CREATE POLICY "review_type_details_delete_draft" ON review_type_details
  FOR DELETE
  USING (
    org_id::text = auth_org_id()
    AND EXISTS (
      SELECT 1 FROM review_cases rc
      WHERE rc.id = review_id
        AND rc.org_id = org_id
        AND rc.status = 'draft'
        AND (
          auth_has_role('admin') OR auth_has_role('manager')
          OR rc.created_by = auth_profile_id()
          OR rc.owner_id = auth_profile_id()
        )
    )
  );

-- ============ 6. review_members ============
CREATE TABLE review_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  review_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  member_role TEXT NOT NULL CHECK (member_role IN (
    'TECH_PROCESS', 'DESIGN_PLATE', 'PRODUCTION', 'QUALITY',
    'EXPERT_REVIEWER', 'OTHER'
  )),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_review_members_role
    UNIQUE (review_id, profile_id, member_role),
  CONSTRAINT fk_review_members_case_org
    FOREIGN KEY (review_id, org_id)
    REFERENCES review_cases(id, org_id) ON DELETE CASCADE,
  CONSTRAINT fk_review_members_profile_org
    FOREIGN KEY (profile_id, org_id)
    REFERENCES profiles(id, org_id) ON DELETE NO ACTION,
  CONSTRAINT fk_review_members_created_by_org
    FOREIGN KEY (created_by, org_id)
    REFERENCES profiles(id, org_id)
);

CREATE UNIQUE INDEX uq_review_members_primary_role
  ON review_members(review_id, member_role)
  WHERE is_primary = TRUE;

CREATE INDEX idx_review_members_review ON review_members(review_id);
CREATE INDEX idx_review_members_org_profile ON review_members(org_id, profile_id);
CREATE INDEX idx_review_members_role ON review_members(member_role);

ALTER TABLE review_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_members_select_org" ON review_members
  FOR SELECT
  USING (org_id::text = auth_org_id());

CREATE POLICY "review_members_insert_draft" ON review_members
  FOR INSERT
  WITH CHECK (
    org_id::text = auth_org_id()
    AND created_by = auth_profile_id()
    AND EXISTS (
      SELECT 1 FROM review_cases rc
      WHERE rc.id = review_id
        AND rc.org_id = org_id
        AND rc.status = 'draft'
        AND (
          auth_has_role('admin') OR auth_has_role('manager')
          OR rc.created_by = auth_profile_id()
          OR rc.owner_id = auth_profile_id()
        )
    )
  );

CREATE POLICY "review_members_delete_draft" ON review_members
  FOR DELETE
  USING (
    org_id::text = auth_org_id()
    AND EXISTS (
      SELECT 1 FROM review_cases rc
      WHERE rc.id = review_id
        AND rc.org_id = org_id
        AND rc.status = 'draft'
        AND (
          auth_has_role('admin') OR auth_has_role('manager')
          OR rc.created_by = auth_profile_id()
          OR rc.owner_id = auth_profile_id()
        )
    )
  );

-- ============ 7. updated_at triggers ============
CREATE TRIGGER trg_review_dict_items_set_updated_at
  BEFORE UPDATE ON review_dict_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_review_cases_set_updated_at
  BEFORE UPDATE ON review_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_review_type_details_set_updated_at
  BEFORE UPDATE ON review_type_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
