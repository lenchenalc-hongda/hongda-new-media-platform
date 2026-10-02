-- Customer Project Center - Phase 7A Daily Report Snapshots
-- Repository migration only. DO NOT execute in Production without explicit owner approval.
-- Implements the Phase 4 approved cpc_reports contract for deterministic daily reports.
-- AI narrative generation is intentionally NOT included in Phase 7A.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Report persistence
-- ---------------------------------------------------------------------------

CREATE TABLE public.cpc_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  subject_profile_id UUID NOT NULL,

  period_type TEXT NOT NULL
    CHECK (period_type IN ('daily', 'weekly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted')),

  metrics_schema_version INTEGER NOT NULL DEFAULT 1
    CHECK (metrics_schema_version >= 1),
  deterministic_metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  narrative TEXT,
  unknowns JSONB NOT NULL DEFAULT '[]'::JSONB,

  source_event_seq BIGINT,
  source_audit_seq BIGINT,

  supersedes_report_id UUID,
  created_by_profile_id UUID NOT NULL,
  submitted_by_profile_id UUID,
  submitted_at TIMESTAMPTZ,

  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_cpc_reports_id_org UNIQUE (id, org_id),

  CONSTRAINT chk_cpc_report_period
    CHECK (period_start <= period_end),

  CONSTRAINT chk_cpc_report_unknowns_array
    CHECK (jsonb_typeof(unknowns) = 'array'),

  CONSTRAINT chk_cpc_report_submission
    CHECK (
      (
        status = 'draft'
        AND submitted_by_profile_id IS NULL
        AND submitted_at IS NULL
      )
      OR
      (
        status = 'submitted'
        AND submitted_by_profile_id IS NOT NULL
        AND submitted_at IS NOT NULL
      )
    ),

  CONSTRAINT fk_cpc_report_subject_org
    FOREIGN KEY (subject_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),

  CONSTRAINT fk_cpc_report_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),

  CONSTRAINT fk_cpc_report_submitted_by_org
    FOREIGN KEY (submitted_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),

  CONSTRAINT fk_cpc_report_supersedes_org
    FOREIGN KEY (supersedes_report_id, org_id)
    REFERENCES public.cpc_reports(id, org_id)
);

CREATE UNIQUE INDEX uq_cpc_report_revision
  ON public.cpc_reports(
    org_id,
    subject_profile_id,
    period_type,
    period_start,
    period_end,
    revision_no
  );

CREATE UNIQUE INDEX uq_cpc_report_active_draft
  ON public.cpc_reports(
    org_id,
    subject_profile_id,
    period_type,
    period_start,
    period_end
  )
  WHERE status = 'draft';

CREATE INDEX idx_cpc_reports_org_subject_period
  ON public.cpc_reports(
    org_id,
    subject_profile_id,
    period_type,
    period_start DESC,
    revision_no DESC
  );

-- ---------------------------------------------------------------------------
-- 2. Submitted snapshots are immutable
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_guard_submitted_report_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status = 'submitted' THEN
    RAISE EXCEPTION 'submitted CPC report snapshots are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cpc_reports_submitted_immutable
  BEFORE UPDATE OR DELETE ON public.cpc_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.cpc_guard_submitted_report_immutability();

-- ---------------------------------------------------------------------------
-- 3. Read authorization / RLS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_can_read_report(
  p_report_id UUID,
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
      FROM public.cpc_reports r
      WHERE r.id = p_report_id
        AND r.org_id = p_org_id
    );
  END IF;

  IF NOT public.auth_has_role('sales') THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cpc_reports r
    WHERE r.id = p_report_id
      AND r.org_id = p_org_id
      AND r.subject_profile_id = v_actor_profile_id
  );
END;
$$;

ALTER TABLE public.cpc_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpc_reports_select"
  ON public.cpc_reports
  FOR SELECT
  USING (
    public.cpc_can_read_report(id, org_id)
  );

REVOKE ALL ON TABLE public.cpc_reports
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cpc_reports TO authenticated;

REVOKE ALL ON FUNCTION public.cpc_can_read_report(UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cpc_can_read_report(UUID, UUID)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Internal deterministic daily metric builder
--    Only confirmed CPC facts are counted. Missing external order/payment SoTs
--    are omitted rather than represented as zero.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_build_daily_report_metrics(
  p_org_id UUID,
  p_subject_profile_id UUID,
  p_business_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;

  v_meaningful_progress INTEGER := 0;
  v_state_change INTEGER := 0;
  v_project_created INTEGER := 0;
  v_project_won INTEGER := 0;
  v_project_lost INTEGER := 0;

  v_next_created INTEGER := 0;
  v_next_completed INTEGER := 0;
  v_next_rescheduled INTEGER := 0;

  v_commitment_due INTEGER := 0;
  v_commitment_completed INTEGER := 0;
  v_commitment_overdue_end INTEGER := 0;

  v_internal_completed INTEGER := 0;
  v_management_completed INTEGER := 0;
  v_relationship_follow_up INTEGER := 0;

  v_quote_sent INTEGER := 0;
  v_sample_sent INTEGER := 0;
  v_customer_confirmed INTEGER := 0;
  v_order_confirmed INTEGER := 0;
BEGIN
  v_start := p_business_date::TIMESTAMP AT TIME ZONE 'Asia/Shanghai';
  v_end := (p_business_date + 1)::TIMESTAMP AT TIME ZONE 'Asia/Shanghai';

  SELECT COUNT(*)::INTEGER
    INTO v_meaningful_progress
    FROM public.cpc_project_events e
    WHERE e.org_id = p_org_id
      AND e.actor_profile_id = p_subject_profile_id
      AND e.occurred_at >= v_start
      AND e.occurred_at < v_end
      AND e.event_type IN (
        'EFFECTIVE_PROGRESS_RECORDED',
        'QUOTE_SENT',
        'SAMPLE_SENT',
        'CUSTOMER_CONFIRMED',
        'COMMERCIAL_CONFIRMED',
        'ORDER_CONFIRMED',
        'PROJECT_WON'
      );

  SELECT COUNT(*)::INTEGER
    INTO v_state_change
    FROM public.cpc_project_events e
    WHERE e.org_id = p_org_id
      AND e.actor_profile_id = p_subject_profile_id
      AND e.occurred_at >= v_start
      AND e.occurred_at < v_end
      AND e.event_type IN (
        'WAITING_STARTED',
        'WAITING_RESOLVED',
        'STAGE_CHANGED',
        'PROJECT_PAUSED',
        'PROJECT_REOPENED',
        'PROJECT_LOST',
        'PROJECT_CANCELLED'
      );

  SELECT COUNT(*)::INTEGER
    INTO v_project_created
    FROM public.cpc_projects p
    WHERE p.org_id = p_org_id
      AND p.created_by_profile_id = p_subject_profile_id
      AND p.created_at >= v_start
      AND p.created_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_project_won
    FROM public.cpc_project_events e
    WHERE e.org_id = p_org_id
      AND e.actor_profile_id = p_subject_profile_id
      AND e.event_type = 'PROJECT_WON'
      AND e.occurred_at >= v_start
      AND e.occurred_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_project_lost
    FROM public.cpc_project_events e
    WHERE e.org_id = p_org_id
      AND e.actor_profile_id = p_subject_profile_id
      AND e.event_type = 'PROJECT_LOST'
      AND e.occurred_at >= v_start
      AND e.occurred_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_next_created
    FROM public.cpc_work_items wi
    WHERE wi.org_id = p_org_id
      AND wi.created_by_profile_id = p_subject_profile_id
      AND wi.work_item_type = 'NEXT_ACTION'
      AND wi.created_at >= v_start
      AND wi.created_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_next_completed
    FROM public.cpc_work_items wi
    WHERE wi.org_id = p_org_id
      AND wi.completed_by_profile_id = p_subject_profile_id
      AND wi.work_item_type = 'NEXT_ACTION'
      AND wi.completed_at >= v_start
      AND wi.completed_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_next_rescheduled
    FROM public.cpc_audit_log a
    WHERE a.org_id = p_org_id
      AND a.actor_profile_id = p_subject_profile_id
      AND a.action = 'WORK_ITEM_RESCHEDULED'
      AND a.recorded_at >= v_start
      AND a.recorded_at < v_end
      AND a.metadata ->> 'work_item_type' = 'NEXT_ACTION';

  SELECT COUNT(*)::INTEGER
    INTO v_commitment_due
    FROM public.cpc_work_items wi
    WHERE wi.org_id = p_org_id
      AND wi.assignee_profile_id = p_subject_profile_id
      AND wi.work_item_type = 'CUSTOMER_COMMITMENT'
      AND wi.due_at >= v_start
      AND wi.due_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_commitment_completed
    FROM public.cpc_work_items wi
    WHERE wi.org_id = p_org_id
      AND wi.completed_by_profile_id = p_subject_profile_id
      AND wi.work_item_type = 'CUSTOMER_COMMITMENT'
      AND wi.completed_at >= v_start
      AND wi.completed_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_commitment_overdue_end
    FROM public.cpc_work_items wi
    WHERE wi.org_id = p_org_id
      AND wi.assignee_profile_id = p_subject_profile_id
      AND wi.work_item_type = 'CUSTOMER_COMMITMENT'
      AND wi.created_at < v_end
      AND wi.due_at IS NOT NULL
      AND wi.due_at < v_end
      AND (wi.completed_at IS NULL OR wi.completed_at >= v_end)
      AND (wi.cancelled_at IS NULL OR wi.cancelled_at >= v_end);

  SELECT COUNT(*)::INTEGER
    INTO v_internal_completed
    FROM public.cpc_work_items wi
    WHERE wi.org_id = p_org_id
      AND wi.completed_by_profile_id = p_subject_profile_id
      AND wi.work_item_type = 'INTERNAL_COLLABORATION'
      AND wi.completed_at >= v_start
      AND wi.completed_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_management_completed
    FROM public.cpc_work_items wi
    WHERE wi.org_id = p_org_id
      AND wi.completed_by_profile_id = p_subject_profile_id
      AND wi.work_item_type = 'MANAGEMENT_DECISION'
      AND wi.completed_at >= v_start
      AND wi.completed_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_relationship_follow_up
    FROM public.cpc_project_events e
    WHERE e.org_id = p_org_id
      AND e.actor_profile_id = p_subject_profile_id
      AND e.project_id IS NULL
      AND e.occurred_at >= v_start
      AND e.occurred_at < v_end
      AND e.payload -> 'relationship_follow_up' = 'true'::JSONB;

  SELECT
    COUNT(*) FILTER (WHERE e.event_type = 'QUOTE_SENT')::INTEGER,
    COUNT(*) FILTER (WHERE e.event_type = 'SAMPLE_SENT')::INTEGER,
    COUNT(*) FILTER (WHERE e.event_type IN ('CUSTOMER_CONFIRMED', 'COMMERCIAL_CONFIRMED'))::INTEGER,
    COUNT(*) FILTER (WHERE e.event_type = 'ORDER_CONFIRMED')::INTEGER
    INTO
      v_quote_sent,
      v_sample_sent,
      v_customer_confirmed,
      v_order_confirmed
    FROM public.cpc_project_events e
    WHERE e.org_id = p_org_id
      AND e.actor_profile_id = p_subject_profile_id
      AND e.occurred_at >= v_start
      AND e.occurred_at < v_end;

  RETURN jsonb_build_object(
    'meaningfulProgressCount', jsonb_build_object('state', 'known', 'value', v_meaningful_progress),
    'stageLifecycleWaitingChangeCount', jsonb_build_object('state', 'known', 'value', v_state_change),
    'projectCreatedCount', jsonb_build_object('state', 'known', 'value', v_project_created),
    'projectWonCount', jsonb_build_object('state', 'known', 'value', v_project_won),
    'projectLostCount', jsonb_build_object('state', 'known', 'value', v_project_lost),
    'nextActionCreatedCount', jsonb_build_object('state', 'known', 'value', v_next_created),
    'nextActionCompletedCount', jsonb_build_object('state', 'known', 'value', v_next_completed),
    'nextActionRescheduledCount', jsonb_build_object('state', 'known', 'value', v_next_rescheduled),
    'customerCommitmentDueCount', jsonb_build_object('state', 'known', 'value', v_commitment_due),
    'customerCommitmentCompletedCount', jsonb_build_object('state', 'known', 'value', v_commitment_completed),
    'customerCommitmentOverdueEndCount', jsonb_build_object('state', 'known', 'value', v_commitment_overdue_end),
    'internalCollaborationCompletedCount', jsonb_build_object('state', 'known', 'value', v_internal_completed),
    'managementDecisionCompletedCount', jsonb_build_object('state', 'known', 'value', v_management_completed),
    'oldCustomerFollowUpCount', jsonb_build_object('state', 'known', 'value', v_relationship_follow_up),
    'quoteSentCount', jsonb_build_object('state', 'known', 'value', v_quote_sent),
    'sampleSentCount', jsonb_build_object('state', 'known', 'value', v_sample_sent),
    'customerCommercialConfirmedCount', jsonb_build_object('state', 'known', 'value', v_customer_confirmed),
    'orderConfirmedCount', jsonb_build_object('state', 'known', 'value', v_order_confirmed)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cpc_build_daily_report_metrics(UUID, UUID, DATE)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Generate / refresh personal daily report draft
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_generate_daily_report_draft(
  p_business_date DATE,
  p_request_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_today DATE;
  v_existing public.cpc_reports%ROWTYPE;
  v_metrics JSONB;
  v_event_seq BIGINT;
  v_audit_seq BIGINT;
  v_revision INTEGER;
  v_report_id UUID;
  v_new_version INTEGER;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = TRUE
    LIMIT 1;

  IF NOT FOUND
     OR v_actor_role IS NULL
     OR v_actor_role NOT IN ('admin', 'manager', 'sales') THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效日报权限');
  END IF;

  IF p_business_date IS NULL THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', '日报日期不能为空');
  END IF;

  PERFORM 1
    FROM public.profiles p
    WHERE p.id = v_actor_profile_id
      AND p.org_id = v_actor_org_id
    FOR UPDATE;

  v_today := (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE;

  IF p_business_date > v_today THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', '不能生成未来日期的日报');
  END IF;

  v_metrics := public.cpc_build_daily_report_metrics(
    v_actor_org_id,
    v_actor_profile_id,
    p_business_date
  );

  SELECT COALESCE(MAX(e.event_seq), 0)
    INTO v_event_seq
    FROM public.cpc_project_events e
    WHERE e.org_id = v_actor_org_id;

  SELECT COALESCE(MAX(a.audit_seq), 0)
    INTO v_audit_seq
    FROM public.cpc_audit_log a
    WHERE a.org_id = v_actor_org_id;

  SELECT r.*
    INTO v_existing
    FROM public.cpc_reports r
    WHERE r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
      AND r.period_type = 'daily'
      AND r.period_start = p_business_date
      AND r.period_end = p_business_date
      AND r.status = 'draft'
    FOR UPDATE;

  IF FOUND THEN
    UPDATE public.cpc_reports r
      SET deterministic_metrics = v_metrics,
          metrics_schema_version = 1,
          source_event_seq = v_event_seq,
          source_audit_seq = v_audit_seq,
          version = r.version + 1,
          updated_at = NOW()
      WHERE r.id = v_existing.id
        AND r.org_id = v_actor_org_id
      RETURNING version INTO v_new_version;

    INSERT INTO public.cpc_audit_log (
      org_id,
      entity_type,
      entity_id,
      action,
      actor_profile_id,
      before_values,
      after_values,
      metadata,
      request_id
    )
    VALUES (
      v_actor_org_id,
      'REPORT',
      v_existing.id,
      'REPORT_DRAFT_REFRESHED',
      v_actor_profile_id,
      jsonb_build_object(
        'version', v_existing.version,
        'source_event_seq', v_existing.source_event_seq,
        'source_audit_seq', v_existing.source_audit_seq
      ),
      jsonb_build_object(
        'version', v_new_version,
        'source_event_seq', v_event_seq,
        'source_audit_seq', v_audit_seq
      ),
      jsonb_build_object(
        'period_type', 'daily',
        'period_start', p_business_date,
        'revision_no', v_existing.revision_no
      ),
      p_request_id
    );

    RETURN jsonb_build_object(
      'ok', TRUE,
      'code', 'OK',
      'message', 'success',
      'data', jsonb_build_object(
        'report_id', v_existing.id,
        'status', 'draft',
        'revision_no', v_existing.revision_no,
        'version', v_new_version
      )
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cpc_reports r
    WHERE r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
      AND r.period_type = 'daily'
      AND r.period_start = p_business_date
      AND r.period_end = p_business_date
      AND r.status = 'submitted'
  ) THEN
    RETURN public.cpc_rpc_error(
      'REPORT_ALREADY_SUBMITTED',
      '该日期日报已经提交；如需修改请创建更正版'
    );
  END IF;

  SELECT COALESCE(MAX(r.revision_no), 0) + 1
    INTO v_revision
    FROM public.cpc_reports r
    WHERE r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
      AND r.period_type = 'daily'
      AND r.period_start = p_business_date
      AND r.period_end = p_business_date;

  INSERT INTO public.cpc_reports (
    org_id,
    subject_profile_id,
    period_type,
    period_start,
    period_end,
    revision_no,
    status,
    metrics_schema_version,
    deterministic_metrics,
    narrative,
    unknowns,
    source_event_seq,
    source_audit_seq,
    created_by_profile_id
  )
  VALUES (
    v_actor_org_id,
    v_actor_profile_id,
    'daily',
    p_business_date,
    p_business_date,
    v_revision,
    'draft',
    1,
    v_metrics,
    NULL,
    '[]'::JSONB,
    v_event_seq,
    v_audit_seq,
    v_actor_profile_id
  )
  RETURNING id, version INTO v_report_id, v_new_version;

  INSERT INTO public.cpc_audit_log (
    org_id,
    entity_type,
    entity_id,
    action,
    actor_profile_id,
    after_values,
    metadata,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'REPORT',
    v_report_id,
    'REPORT_DRAFT_GENERATED',
    v_actor_profile_id,
    jsonb_build_object(
      'status', 'draft',
      'revision_no', v_revision,
      'version', v_new_version
    ),
    jsonb_build_object(
      'period_type', 'daily',
      'period_start', p_business_date,
      'source_event_seq', v_event_seq,
      'source_audit_seq', v_audit_seq
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'report_id', v_report_id,
      'status', 'draft',
      'revision_no', v_revision,
      'version', v_new_version
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Submit own draft; submitted snapshot then becomes immutable
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_submit_report(
  p_report_id UUID,
  p_expected_version INTEGER,
  p_request_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_report public.cpc_reports%ROWTYPE;
  v_new_version INTEGER;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = TRUE
    LIMIT 1;

  IF NOT FOUND
     OR v_actor_role IS NULL
     OR v_actor_role NOT IN ('admin', 'manager', 'sales') THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效日报权限');
  END IF;

  SELECT r.*
    INTO v_report
    FROM public.cpc_reports r
    WHERE r.id = p_report_id
      AND r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.cpc_rpc_error('NOT_FOUND', '日报不存在');
  END IF;

  IF v_report.status <> 'draft' THEN
    RETURN public.cpc_rpc_error('INVALID_TRANSITION', '只有草稿日报可以提交');
  END IF;

  IF p_expected_version IS NULL
     OR p_expected_version <> v_report.version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', '日报版本已变化');
  END IF;

  UPDATE public.cpc_reports r
    SET status = 'submitted',
        submitted_by_profile_id = v_actor_profile_id,
        submitted_at = NOW(),
        version = r.version + 1,
        updated_at = NOW()
    WHERE r.id = v_report.id
      AND r.org_id = v_actor_org_id
    RETURNING version INTO v_new_version;

  INSERT INTO public.cpc_audit_log (
    org_id,
    entity_type,
    entity_id,
    action,
    actor_profile_id,
    before_values,
    after_values,
    metadata,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'REPORT',
    v_report.id,
    'REPORT_SUBMITTED',
    v_actor_profile_id,
    jsonb_build_object(
      'status', 'draft',
      'version', v_report.version
    ),
    jsonb_build_object(
      'status', 'submitted',
      'version', v_new_version
    ),
    jsonb_build_object(
      'period_type', v_report.period_type,
      'period_start', v_report.period_start,
      'revision_no', v_report.revision_no,
      'source_event_seq', v_report.source_event_seq,
      'source_audit_seq', v_report.source_audit_seq
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'report_id', v_report.id,
      'status', 'submitted',
      'revision_no', v_report.revision_no,
      'version', v_new_version
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Explicit correction: create a new draft revision, never alter submitted row
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_create_report_correction(
  p_report_id UUID,
  p_expected_version INTEGER,
  p_reason TEXT,
  p_request_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_report public.cpc_reports%ROWTYPE;
  v_metrics JSONB;
  v_event_seq BIGINT;
  v_audit_seq BIGINT;
  v_revision INTEGER;
  v_new_report_id UUID;
  v_new_version INTEGER;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = TRUE
    LIMIT 1;

  IF NOT FOUND
     OR v_actor_role IS NULL
     OR v_actor_role NOT IN ('admin', 'manager', 'sales') THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效日报权限');
  END IF;

  PERFORM 1
    FROM public.profiles p
    WHERE p.id = v_actor_profile_id
      AND p.org_id = v_actor_org_id
    FOR UPDATE;

  SELECT r.*
    INTO v_report
    FROM public.cpc_reports r
    WHERE r.id = p_report_id
      AND r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.cpc_rpc_error('NOT_FOUND', '日报不存在');
  END IF;

  IF v_report.status <> 'submitted' THEN
    RETURN public.cpc_rpc_error(
      'INVALID_TRANSITION',
      '只有已提交日报可以创建更正版'
    );
  END IF;

  IF p_expected_version IS NULL
     OR p_expected_version <> v_report.version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', '日报版本已变化');
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RETURN public.cpc_rpc_error('REASON_REQUIRED', '创建更正版必须填写原因');
  END IF;

  IF v_report.period_type <> 'daily'
     OR v_report.period_start <> v_report.period_end THEN
    RETURN public.cpc_rpc_error(
      'INVALID_INPUT',
      'Phase 7A 仅支持日报更正'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cpc_reports r
    WHERE r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
      AND r.period_type = v_report.period_type
      AND r.period_start = v_report.period_start
      AND r.period_end = v_report.period_end
      AND r.revision_no > v_report.revision_no
  ) THEN
    RETURN public.cpc_rpc_error(
      'INVALID_TRANSITION',
      '只能从最新提交版本创建更正版'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cpc_reports r
    WHERE r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
      AND r.period_type = v_report.period_type
      AND r.period_start = v_report.period_start
      AND r.period_end = v_report.period_end
      AND r.status = 'draft'
  ) THEN
    RETURN public.cpc_rpc_error(
      'REPORT_DRAFT_EXISTS',
      '该周期已有更正草稿，请先处理现有草稿'
    );
  END IF;

  v_metrics := public.cpc_build_daily_report_metrics(
    v_actor_org_id,
    v_actor_profile_id,
    v_report.period_start
  );

  SELECT COALESCE(MAX(e.event_seq), 0)
    INTO v_event_seq
    FROM public.cpc_project_events e
    WHERE e.org_id = v_actor_org_id;

  SELECT COALESCE(MAX(a.audit_seq), 0)
    INTO v_audit_seq
    FROM public.cpc_audit_log a
    WHERE a.org_id = v_actor_org_id;

  SELECT COALESCE(MAX(r.revision_no), 0) + 1
    INTO v_revision
    FROM public.cpc_reports r
    WHERE r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
      AND r.period_type = v_report.period_type
      AND r.period_start = v_report.period_start
      AND r.period_end = v_report.period_end;

  INSERT INTO public.cpc_reports (
    org_id,
    subject_profile_id,
    period_type,
    period_start,
    period_end,
    revision_no,
    status,
    metrics_schema_version,
    deterministic_metrics,
    narrative,
    unknowns,
    source_event_seq,
    source_audit_seq,
    supersedes_report_id,
    created_by_profile_id
  )
  VALUES (
    v_actor_org_id,
    v_actor_profile_id,
    v_report.period_type,
    v_report.period_start,
    v_report.period_end,
    v_revision,
    'draft',
    1,
    v_metrics,
    v_report.narrative,
    v_report.unknowns,
    v_event_seq,
    v_audit_seq,
    v_report.id,
    v_actor_profile_id
  )
  RETURNING id, version INTO v_new_report_id, v_new_version;

  INSERT INTO public.cpc_audit_log (
    org_id,
    entity_type,
    entity_id,
    action,
    actor_profile_id,
    reason,
    after_values,
    metadata,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'REPORT',
    v_new_report_id,
    'REPORT_CORRECTION_CREATED',
    v_actor_profile_id,
    btrim(p_reason),
    jsonb_build_object(
      'status', 'draft',
      'revision_no', v_revision,
      'version', v_new_version,
      'supersedes_report_id', v_report.id
    ),
    jsonb_build_object(
      'period_type', v_report.period_type,
      'period_start', v_report.period_start,
      'source_event_seq', v_event_seq,
      'source_audit_seq', v_audit_seq
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'report_id', v_new_report_id,
      'status', 'draft',
      'revision_no', v_revision,
      'version', v_new_version,
      'supersedes_report_id', v_report.id
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Narrow grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.cpc_generate_daily_report_draft(DATE, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_generate_daily_report_draft(DATE, UUID)
  TO authenticated;

REVOKE ALL ON FUNCTION public.cpc_submit_report(UUID, INTEGER, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_submit_report(UUID, INTEGER, UUID)
  TO authenticated;

REVOKE ALL ON FUNCTION public.cpc_create_report_correction(UUID, INTEGER, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_create_report_correction(UUID, INTEGER, TEXT, UUID)
  TO authenticated;

COMMIT;
