-- 宏达项目复盘与改善中心 - Phase 2R.6D
-- Case Core Foundation Migration A
-- Scope: review_case_number_counters, review_knowledge_cases,
--        review_knowledge_case_metadata,
--        review_knowledge_case_metadata_items, review_case_audit_logs,
--        constraints, indexes, RLS lockdown, grants.
-- Safety: schema only. No Case mutation/read RPC, no API, no UI, no DML.
--         Migration B owns all Case business functions and grants.

BEGIN;

-- ============ 1. review_case_number_counters ============
CREATE TABLE public.review_case_number_counters (
  org_id UUID NOT NULL,
  year INTEGER NOT NULL,
  last_value INTEGER NOT NULL,
  CONSTRAINT pk_review_case_number_counters
    PRIMARY KEY (org_id, year),
  CONSTRAINT fk_review_case_number_counters_org
    FOREIGN KEY (org_id)
    REFERENCES public.organizations(id),
  CONSTRAINT chk_review_case_number_counters_year
    CHECK (year >= 2000 AND year <= 9999),
  CONSTRAINT chk_review_case_number_counters_last_value
    CHECK (last_value >= 1 AND last_value <= 999999)
);

ALTER TABLE public.review_case_number_counters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.review_case_number_counters FROM PUBLIC, anon, authenticated;

-- ============ 2. review_knowledge_cases ============
CREATE TABLE public.review_knowledge_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  case_no TEXT NOT NULL,
  source_review_id UUID NOT NULL,
  source_review_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  title TEXT NOT NULL,
  summary TEXT,
  lesson_summary TEXT,
  prevention_summary TEXT,
  applicability_notes TEXT,
  review_type_snapshot TEXT,
  risk_level_snapshot TEXT,
  occurred_at_snapshot TIMESTAMPTZ,
  created_by_profile_id UUID NOT NULL,
  published_by_profile_id UUID,
  published_at TIMESTAMPTZ,
  hidden_by_profile_id UUID,
  hidden_at TIMESTAMPTZ,
  hidden_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_review_knowledge_cases_id_org
    UNIQUE (id, org_id),
  CONSTRAINT uq_review_knowledge_cases_org_case_no
    UNIQUE (org_id, case_no),
  CONSTRAINT uq_review_knowledge_cases_org_source
    UNIQUE (org_id, source_review_id),
  CONSTRAINT fk_review_knowledge_cases_org
    FOREIGN KEY (org_id)
    REFERENCES public.organizations(id),
  CONSTRAINT fk_review_knowledge_cases_source_org
    FOREIGN KEY (source_review_id, org_id)
    REFERENCES public.review_cases(id, org_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_review_knowledge_cases_created_by_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),
  CONSTRAINT fk_review_knowledge_cases_published_by_org
    FOREIGN KEY (published_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),
  CONSTRAINT fk_review_knowledge_cases_hidden_by_org
    FOREIGN KEY (hidden_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),
  CONSTRAINT chk_review_knowledge_cases_case_no
    CHECK (case_no ~ '^CASE-[0-9]{4}-[0-9]{6}$'),
  CONSTRAINT chk_review_knowledge_cases_source_version
    CHECK (source_review_version >= 1),
  CONSTRAINT chk_review_knowledge_cases_status
    CHECK (status IN ('DRAFT', 'PUBLISHED', 'HIDDEN')),
  CONSTRAINT chk_review_knowledge_cases_version
    CHECK (version >= 1),
  CONSTRAINT chk_review_knowledge_cases_title
    CHECK (
      length(btrim(title)) > 0
      AND length(title) <= 200
    ),
  CONSTRAINT chk_review_knowledge_cases_summary
    CHECK (
      summary IS NULL
      OR (
        length(btrim(summary)) > 0
        AND length(summary) <= 5000
      )
    ),
  CONSTRAINT chk_review_knowledge_cases_lesson_summary
    CHECK (
      lesson_summary IS NULL
      OR (
        length(btrim(lesson_summary)) > 0
        AND length(lesson_summary) <= 5000
      )
    ),
  CONSTRAINT chk_review_knowledge_cases_prevention_summary
    CHECK (
      prevention_summary IS NULL
      OR (
        length(btrim(prevention_summary)) > 0
        AND length(prevention_summary) <= 5000
      )
    ),
  CONSTRAINT chk_review_knowledge_cases_applicability_notes
    CHECK (
      applicability_notes IS NULL
      OR (
        length(btrim(applicability_notes)) > 0
        AND length(applicability_notes) <= 2000
      )
    ),
  CONSTRAINT chk_review_knowledge_cases_review_type_snapshot
    CHECK (
      review_type_snapshot IS NULL
      OR review_type_snapshot IN ('A', 'B', 'C')
    ),
  CONSTRAINT chk_review_knowledge_cases_risk_snapshot
    CHECK (
      risk_level_snapshot IS NULL
      OR risk_level_snapshot IN ('RED', 'YELLOW', 'GREEN')
    ),
  CONSTRAINT chk_review_knowledge_cases_hidden_reason
    CHECK (
      hidden_reason IS NULL
      OR (
        length(btrim(hidden_reason)) > 0
        AND length(hidden_reason) <= 1000
      )
    ),
  CONSTRAINT chk_review_knowledge_cases_published_pair
    CHECK (
      (published_at IS NULL AND published_by_profile_id IS NULL)
      OR
      (published_at IS NOT NULL AND published_by_profile_id IS NOT NULL)
    ),
  CONSTRAINT chk_review_knowledge_cases_hidden_triple
    CHECK (
      (hidden_at IS NULL AND hidden_by_profile_id IS NULL AND hidden_reason IS NULL)
      OR
      (hidden_at IS NOT NULL AND hidden_by_profile_id IS NOT NULL AND hidden_reason IS NOT NULL)
    ),
  CONSTRAINT chk_review_knowledge_cases_historical_snapshot
    CHECK (
      published_at IS NULL
      OR review_type_snapshot IS NOT NULL
    ),
  CONSTRAINT chk_review_knowledge_cases_status_fields
    CHECK (
      (
        status = 'PUBLISHED'
        AND published_at IS NOT NULL
        AND published_by_profile_id IS NOT NULL
        AND hidden_at IS NULL
        AND hidden_by_profile_id IS NULL
        AND hidden_reason IS NULL
        AND review_type_snapshot IS NOT NULL
      )
      OR
      (
        status = 'HIDDEN'
        AND hidden_at IS NOT NULL
        AND hidden_by_profile_id IS NOT NULL
        AND hidden_reason IS NOT NULL
      )
      OR
      (
        status = 'DRAFT'
        AND hidden_at IS NULL
        AND hidden_by_profile_id IS NULL
        AND hidden_reason IS NULL
      )
    )
);

CREATE INDEX idx_review_knowledge_cases_org_status
  ON public.review_knowledge_cases(org_id, status);

CREATE INDEX idx_review_knowledge_cases_org_status_published
  ON public.review_knowledge_cases(org_id, status, published_at DESC);

ALTER TABLE public.review_knowledge_cases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.review_knowledge_cases FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_review_knowledge_cases_set_updated_at
  BEFORE UPDATE ON public.review_knowledge_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 3. review_knowledge_case_metadata ============
CREATE TABLE public.review_knowledge_case_metadata (
  case_id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  material_other_text TEXT,
  process_other_text TEXT,
  problem_domain_other_text TEXT,
  problem_symptom_other_text TEXT,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_review_knowledge_case_metadata_case_org
    UNIQUE (case_id, org_id),
  CONSTRAINT fk_review_knowledge_case_metadata_case_org
    FOREIGN KEY (case_id, org_id)
    REFERENCES public.review_knowledge_cases(id, org_id)
    ON DELETE RESTRICT,
  CONSTRAINT chk_review_knowledge_case_metadata_material_other_text
    CHECK (
      material_other_text IS NULL
      OR (
        char_length(btrim(material_other_text)) > 0
        AND char_length(material_other_text) <= 200
      )
    ),
  CONSTRAINT chk_review_knowledge_case_metadata_process_other_text
    CHECK (
      process_other_text IS NULL
      OR (
        char_length(btrim(process_other_text)) > 0
        AND char_length(process_other_text) <= 200
      )
    ),
  CONSTRAINT chk_review_knowledge_case_metadata_domain_other_text
    CHECK (
      problem_domain_other_text IS NULL
      OR (
        char_length(btrim(problem_domain_other_text)) > 0
        AND char_length(problem_domain_other_text) <= 200
      )
    ),
  CONSTRAINT chk_review_knowledge_case_metadata_symptom_other_text
    CHECK (
      problem_symptom_other_text IS NULL
      OR (
        char_length(btrim(problem_symptom_other_text)) > 0
        AND char_length(problem_symptom_other_text) <= 200
      )
    )
);

ALTER TABLE public.review_knowledge_case_metadata ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.review_knowledge_case_metadata FROM PUBLIC, anon, authenticated;

-- ============ 4. review_knowledge_case_metadata_items ============
CREATE TABLE public.review_knowledge_case_metadata_items (
  case_id UUID NOT NULL,
  org_id UUID NOT NULL,
  metadata_type TEXT NOT NULL,
  code TEXT NOT NULL,
  label_snapshot TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_review_knowledge_case_metadata_items
    PRIMARY KEY (case_id, metadata_type, code),
  CONSTRAINT fk_review_knowledge_case_metadata_items_header
    FOREIGN KEY (case_id, org_id)
    REFERENCES public.review_knowledge_case_metadata(case_id, org_id)
    ON DELETE RESTRICT,
  CONSTRAINT chk_review_knowledge_case_metadata_items_type
    CHECK (
      metadata_type IN ('MATERIAL', 'PROCESS', 'PROBLEM_DOMAIN', 'PROBLEM_SYMPTOM')
    ),
  CONSTRAINT chk_review_knowledge_case_metadata_items_primary_scope
    CHECK (
      metadata_type = 'MATERIAL'
      OR is_primary = FALSE
    ),
  CONSTRAINT chk_review_knowledge_case_metadata_items_code
    CHECK (length(btrim(code)) > 0),
  CONSTRAINT chk_review_knowledge_case_metadata_items_label
    CHECK (length(btrim(label_snapshot)) > 0)
);

CREATE UNIQUE INDEX uq_review_knowledge_case_metadata_items_primary_material
  ON public.review_knowledge_case_metadata_items(case_id)
  WHERE metadata_type = 'MATERIAL' AND is_primary = TRUE;

CREATE INDEX idx_review_knowledge_case_metadata_items_org_type_code
  ON public.review_knowledge_case_metadata_items(org_id, metadata_type, code);

ALTER TABLE public.review_knowledge_case_metadata_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.review_knowledge_case_metadata_items FROM PUBLIC, anon, authenticated;

-- ============ 5. review_case_audit_logs ============
CREATE TABLE public.review_case_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  case_id UUID NOT NULL,
  actor_profile_id UUID NOT NULL,
  action TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  version_before INTEGER,
  version_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_review_case_audit_logs_case_org
    FOREIGN KEY (case_id, org_id)
    REFERENCES public.review_knowledge_cases(id, org_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_review_case_audit_logs_actor_org
    FOREIGN KEY (actor_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),
  CONSTRAINT chk_review_case_audit_logs_action
    CHECK (
      action IN (
        'CASE_CREATED',
        'CASE_UPDATED',
        'CASE_PUBLISHED',
        'CASE_HIDDEN',
        'CASE_REOPENED',
        'CASE_REPUBLISHED'
      )
    ),
  CONSTRAINT chk_review_case_audit_logs_changes_object
    CHECK (jsonb_typeof(changes) = 'object'),
  CONSTRAINT chk_review_case_audit_logs_version_before
    CHECK (version_before IS NULL OR version_before >= 1),
  CONSTRAINT chk_review_case_audit_logs_version_after
    CHECK (version_after >= 1),
  CONSTRAINT chk_review_case_audit_logs_version_sequence
    CHECK (
      (
        action = 'CASE_CREATED'
        AND version_before IS NULL
        AND version_after = 1
      )
      OR
      (
        action <> 'CASE_CREATED'
        AND version_before IS NOT NULL
        AND version_before >= 1
        AND version_after = version_before + 1
      )
    )
);

CREATE INDEX idx_review_case_audit_logs_org_case_created
  ON public.review_case_audit_logs(org_id, case_id, created_at DESC, id DESC);

ALTER TABLE public.review_case_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.review_case_audit_logs FROM PUBLIC, anon, authenticated;

COMMIT;
