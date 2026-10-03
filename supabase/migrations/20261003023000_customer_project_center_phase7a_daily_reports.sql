-- Customer Project Center - Phase 7A automatic daily reports
-- Repository migration only. DO NOT execute in Production without explicit owner approval.
-- Scope:
--   - materialize approved Phase 4 cpc_reports persistence
--   - deterministic same-day daily metrics only
--   - employee refresh + explicit submit
--   - submitted snapshots immutable
-- Not in scope:
--   - weekly reports
--   - historical backfill
--   - correction workflow (Phase 7B)
--   - AI/model narrative generation
--   - Production execution

BEGIN;

CREATE TABLE public.cpc_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  subject_profile_id UUID NOT NULL,

  period_type TEXT NOT NULL
    CHECK (period_type IN ('daily', 'weekly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  revision_no INTEGER NOT NULL DEFAULT 1
    CHECK (revision_no >= 1),

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted')),

  metrics_schema_version INTEGER NOT NULL DEFAULT 1
    CHECK (metrics_schema_version >= 1),
  deterministic_metrics JSONB NOT NULL,
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

  CONSTRAINT chk_cpc_report_daily_period
    CHECK (
      period_type <> 'daily'
      OR period_start = period_end
    ),

  CONSTRAINT chk_cpc_report_unknowns_array
    CHECK (jsonb_typeof(unknowns) = 'array'),

  CONSTRAINT chk_cpc_report_submit_metadata
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

  CONSTRAINT fk_cpc_report_submitter_org
    FOREIGN KEY (submitted_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),

  CONSTRAINT fk_cpc_report_supersedes_org
    FOREIGN KEY (supersedes_report_id, org_id)
    REFERENCES public.cpc_reports(id, org_id)
);

CREATE UNIQUE INDEX uq_cpc_reports_revision
  ON public.cpc_reports(
    org_id,
    subject_profile_id,
    period_type,
    period_start,
    period_end,
    revision_no
  );

CREATE UNIQUE INDEX uq_cpc_reports_active_draft
  ON public.cpc_reports(
    org_id,
    subject_profile_id,
    period_type,
    period_start,
    period_end
  )
  WHERE status = 'draft';

CREATE INDEX idx_cpc_reports_subject_period
  ON public.cpc_reports(
    org_id,
    subject_profile_id,
    period_type,
    period_start DESC,
    revision_no DESC
  );

CREATE OR REPLACE FUNCTION public.cpc_prevent_submitted_report_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status = 'submitted' THEN
    RAISE EXCEPTION 'submitted CPC report is immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CPC report deletion is not allowed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cpc_reports_immutable_submitted
BEFORE UPDATE OR DELETE ON public.cpc_reports
FOR EACH ROW
EXECUTE FUNCTION public.cpc_prevent_submitted_report_mutation();

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
-- Deterministic daily metrics. Read-only. Numbers come from confirmed CPC truth.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_get_daily_report_metrics(
  p_period_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_metrics JSONB;
  v_event_seq BIGINT;
  v_audit_seq BIGINT;
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

  IF p_period_date IS NULL THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', '日报日期不能为空');
  END IF;

  IF p_period_date IS DISTINCT FROM (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE THEN
    RETURN public.cpc_rpc_error(
      'INVALID_REPORT_PERIOD',
      '实时日报指标只允许计算当天；历史请读取已提交快照'
    );
  END IF;

  v_start := p_period_date::TIMESTAMP AT TIME ZONE 'Asia/Shanghai';
  v_end := v_start + INTERVAL '1 day';

  SELECT jsonb_build_object(
    'effectiveProgressCount', jsonb_build_object(
      'state', 'known',
      'value', COUNT(*) FILTER (
        WHERE e.event_type IN (
          'EFFECTIVE_PROGRESS_RECORDED',
          'QUOTE_SENT',
          'SAMPLE_SENT',
          'CUSTOMER_CONFIRMED',
          'COMMERCIAL_CONFIRMED',
          'ORDER_CONFIRMED',
          'PROJECT_WON'
        )
      )
    ),
    'meaningfulChangeCount', jsonb_build_object(
      'state', 'known',
      'value', COUNT(*) FILTER (
        WHERE e.event_type IN (
          'EFFECTIVE_PROGRESS_RECORDED',
          'QUOTE_SENT',
          'SAMPLE_SENT',
          'CUSTOMER_CONFIRMED',
          'COMMERCIAL_CONFIRMED',
          'ORDER_CONFIRMED',
          'WAITING_STARTED',
          'WAITING_RESOLVED',
          'STAGE_CHANGED',
          'PROJECT_PAUSED',
          'PROJECT_REOPENED',
          'PROJECT_WON',
          'PROJECT_LOST',
          'PROJECT_CANCELLED'
        )
      )
    ),
    'quoteSentCount', jsonb_build_object(
      'state', 'known',
      'value', COUNT(*) FILTER (WHERE e.event_type = 'QUOTE_SENT')
    ),
    'customerConfirmedCount', jsonb_build_object(
      'state', 'known',
      'value', COUNT(*) FILTER (WHERE e.event_type = 'CUSTOMER_CONFIRMED')
    ),
    'orderConfirmedCount', jsonb_build_object(
      'state', 'known',
      'value', COUNT(*) FILTER (WHERE e.event_type = 'ORDER_CONFIRMED')
    )
  )
  INTO v_metrics
  FROM public.cpc_project_events e
  WHERE e.org_id = v_actor_org_id
    AND e.actor_profile_id = v_actor_profile_id
    AND e.occurred_at >= v_start
    AND e.occurred_at < v_end;

  v_metrics := v_metrics || (
    SELECT jsonb_build_object(
      'nextActionCreatedCount', jsonb_build_object(
        'state', 'known',
        'value', COUNT(*) FILTER (
          WHERE wi.work_item_type = 'NEXT_ACTION'
            AND wi.created_by_profile_id = v_actor_profile_id
            AND wi.created_at >= v_start
            AND wi.created_at < v_end
        )
      ),
      'nextActionCompletedCount', jsonb_build_object(
        'state', 'known',
        'value', COUNT(*) FILTER (
          WHERE wi.work_item_type = 'NEXT_ACTION'
            AND wi.completed_by_profile_id = v_actor_profile_id
            AND wi.completed_at >= v_start
            AND wi.completed_at < v_end
        )
      ),
      'customerCommitmentDueCount', jsonb_build_object(
        'state', 'known',
        'value', COUNT(*) FILTER (
          WHERE wi.work_item_type = 'CUSTOMER_COMMITMENT'
            AND wi.assignee_profile_id = v_actor_profile_id
            AND wi.due_at >= v_start
            AND wi.due_at < v_end
        )
      ),
      'customerCommitmentCompletedCount', jsonb_build_object(
        'state', 'known',
        'value', COUNT(*) FILTER (
          WHERE wi.work_item_type = 'CUSTOMER_COMMITMENT'
            AND wi.completed_by_profile_id = v_actor_profile_id
            AND wi.completed_at >= v_start
            AND wi.completed_at < v_end
        )
      ),
      'internalCollaborationCompletedCount', jsonb_build_object(
        'state', 'known',
        'value', COUNT(*) FILTER (
          WHERE wi.work_item_type = 'INTERNAL_COLLABORATION'
            AND wi.completed_by_profile_id = v_actor_profile_id
            AND wi.completed_at >= v_start
            AND wi.completed_at < v_end
        )
      ),
      'customerFollowUpCompletedCount', jsonb_build_object(
        'state', 'known',
        'value', COUNT(*) FILTER (
          WHERE wi.work_item_type = 'FOLLOW_UP'
            AND wi.completed_by_profile_id = v_actor_profile_id
            AND wi.completed_at >= v_start
            AND wi.completed_at < v_end
        )
      ),
      'blockedOpenWorkItemCount', jsonb_build_object(
        'state', 'known',
        'value', COUNT(*) FILTER (
          WHERE wi.assignee_profile_id = v_actor_profile_id
            AND wi.status = 'blocked'
        )
      ),
      'openManagementDecisionCount', jsonb_build_object(
        'state', 'known',
        'value', COUNT(*) FILTER (
          WHERE wi.work_item_type = 'MANAGEMENT_DECISION'
            AND wi.assignee_profile_id = v_actor_profile_id
            AND wi.status IN ('pending', 'in_progress', 'blocked')
        )
      ),
      'customerCommitmentOverdueOpenCount', jsonb_build_object(
        'state', 'known',
        'value', COUNT(*) FILTER (
          WHERE wi.work_item_type = 'CUSTOMER_COMMITMENT'
            AND wi.assignee_profile_id = v_actor_profile_id
            AND wi.status IN ('pending', 'in_progress', 'blocked')
            AND wi.due_at IS NOT NULL
            AND wi.due_at < NOW()
        )
      )
    )
    FROM public.cpc_work_items wi
    WHERE wi.org_id = v_actor_org_id
      AND (
        wi.assignee_profile_id = v_actor_profile_id
        OR wi.created_by_profile_id = v_actor_profile_id
        OR wi.completed_by_profile_id = v_actor_profile_id
      )
  );

  v_metrics := v_metrics || jsonb_build_object(
    'workItemRescheduledCount', jsonb_build_object(
      'state', 'known',
      'value', (
        SELECT COUNT(*)
        FROM public.cpc_audit_log a
        WHERE a.org_id = v_actor_org_id
          AND a.actor_profile_id = v_actor_profile_id
          AND a.action = 'WORK_ITEM_RESCHEDULED'
          AND a.recorded_at >= v_start
          AND a.recorded_at < v_end
      )
    ),
    'activeProjectCount', jsonb_build_object(
      'state', 'known',
      'value', (
        SELECT COUNT(*)
        FROM public.cpc_projects p
        WHERE p.org_id = v_actor_org_id
          AND p.owner_profile_id = v_actor_profile_id
          AND p.status = 'active'
      )
    ),
    'activeProjectMissingNextStepCount', jsonb_build_object(
      'state', 'known',
      'value', (
        SELECT COUNT(*)
        FROM public.cpc_projects p
        WHERE p.org_id = v_actor_org_id
          AND p.owner_profile_id = v_actor_profile_id
          AND p.status = 'active'
          AND p.waiting_on = 'none'
          AND NOT EXISTS (
            SELECT 1
            FROM public.cpc_work_items wi
            WHERE wi.org_id = p.org_id
              AND wi.project_id = p.id
              AND wi.work_item_type = 'NEXT_ACTION'
              AND wi.status IN ('pending', 'in_progress', 'blocked')
          )
      )
    ),
    'waitingProjectCount', jsonb_build_object(
      'state', 'known',
      'value', (
        SELECT COUNT(*)
        FROM public.cpc_projects p
        WHERE p.org_id = v_actor_org_id
          AND p.owner_profile_id = v_actor_profile_id
          AND p.status IN ('active', 'paused')
          AND p.waiting_on <> 'none'
          AND p.next_check_at IS NOT NULL
      )
    ),
    'unresolvedAiDraftCount', jsonb_build_object(
      'state', 'known',
      'value', (
        SELECT COUNT(*)
        FROM public.cpc_ai_drafts d
        WHERE d.org_id = v_actor_org_id
          AND d.status = 'draft'
          AND (
            d.created_by_profile_id = v_actor_profile_id
            OR (
              d.project_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.cpc_projects p
                WHERE p.id = d.project_id
                  AND p.org_id = d.org_id
                  AND p.owner_profile_id = v_actor_profile_id
              )
            )
          )
      )
    )
  );

  SELECT MAX(e.event_seq)
    INTO v_event_seq
    FROM public.cpc_project_events e
    WHERE e.org_id = v_actor_org_id;

  SELECT MAX(a.audit_seq)
    INTO v_audit_seq
    FROM public.cpc_audit_log a
    WHERE a.org_id = v_actor_org_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'period_date', p_period_date,
      'timezone', 'Asia/Shanghai',
      'metrics_schema_version', 1,
      'deterministic_metrics', v_metrics,
      'unknowns', '[]'::JSONB,
      'source_event_seq', v_event_seq,
      'source_audit_seq', v_audit_seq
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cpc_get_daily_report_metrics(DATE)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cpc_get_daily_report_metrics(DATE)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Refresh today's draft. Deterministic metrics are computed inside SQL.
-- Client cannot submit metric JSON.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_refresh_daily_report_draft(
  p_period_date DATE,
  p_narrative TEXT DEFAULT NULL,
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
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE;
  v_snapshot JSONB;
  v_data JSONB;
  v_report_id UUID;
  v_version INTEGER;
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

  IF p_period_date IS DISTINCT FROM v_today THEN
    RETURN public.cpc_rpc_error(
      'INVALID_REPORT_PERIOD',
      'Phase 7A 只允许生成或刷新当天日报'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cpc_reports r
    WHERE r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
      AND r.period_type = 'daily'
      AND r.period_start = p_period_date
      AND r.period_end = p_period_date
      AND r.status = 'submitted'
  ) THEN
    RETURN public.cpc_rpc_error(
      'INVALID_TRANSITION',
      '日报已提交；Phase 7A 不允许原地重建，后续更正必须创建新 revision'
    );
  END IF;

  v_snapshot := public.cpc_get_daily_report_metrics(p_period_date);

  IF COALESCE((v_snapshot ->> 'ok')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RETURN v_snapshot;
  END IF;

  v_data := v_snapshot -> 'data';

  SELECT r.id, r.version
    INTO v_report_id, v_version
    FROM public.cpc_reports r
    WHERE r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
      AND r.period_type = 'daily'
      AND r.period_start = p_period_date
      AND r.period_end = p_period_date
      AND r.status = 'draft'
    FOR UPDATE;

  IF FOUND THEN
    UPDATE public.cpc_reports r
      SET deterministic_metrics = v_data -> 'deterministic_metrics',
          metrics_schema_version = (v_data ->> 'metrics_schema_version')::INTEGER,
          unknowns = COALESCE(v_data -> 'unknowns', '[]'::JSONB),
          narrative = NULLIF(btrim(p_narrative), ''),
          source_event_seq = NULLIF(v_data ->> 'source_event_seq', '')::BIGINT,
          source_audit_seq = NULLIF(v_data ->> 'source_audit_seq', '')::BIGINT,
          version = r.version + 1,
          updated_at = NOW()
      WHERE r.id = v_report_id
        AND r.org_id = v_actor_org_id
      RETURNING version INTO v_version;

    INSERT INTO public.cpc_audit_log (
      org_id, entity_type, entity_id, action, actor_profile_id,
      before_values, after_values, metadata, request_id
    )
    VALUES (
      v_actor_org_id, 'REPORT', v_report_id, 'REPORT_DRAFT_REFRESHED',
      v_actor_profile_id,
      jsonb_build_object('version', v_version - 1),
      jsonb_build_object('version', v_version),
      jsonb_build_object('period_type', 'daily', 'period_date', p_period_date),
      p_request_id
    );
  ELSE
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
      p_period_date,
      p_period_date,
      1,
      'draft',
      (v_data ->> 'metrics_schema_version')::INTEGER,
      v_data -> 'deterministic_metrics',
      NULLIF(btrim(p_narrative), ''),
      COALESCE(v_data -> 'unknowns', '[]'::JSONB),
      NULLIF(v_data ->> 'source_event_seq', '')::BIGINT,
      NULLIF(v_data ->> 'source_audit_seq', '')::BIGINT,
      v_actor_profile_id
    )
    RETURNING id, version
      INTO v_report_id, v_version;

    INSERT INTO public.cpc_audit_log (
      org_id, entity_type, entity_id, action, actor_profile_id,
      before_values, after_values, metadata, request_id
    )
    VALUES (
      v_actor_org_id, 'REPORT', v_report_id, 'REPORT_DRAFT_CREATED',
      v_actor_profile_id,
      NULL,
      jsonb_build_object('status', 'draft', 'version', v_version),
      jsonb_build_object('period_type', 'daily', 'period_date', p_period_date),
      p_request_id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'report_id', v_report_id,
      'status', 'draft',
      'version', v_version
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Submit: subject only. Submitted snapshot becomes immutable by trigger.
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
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.cpc_rpc_error('NOT_FOUND', '日报不存在');
  END IF;

  IF v_report.subject_profile_id <> v_actor_profile_id THEN
    RETURN public.cpc_rpc_error(
      'FORBIDDEN',
      '只能确认提交自己的日报'
    );
  END IF;

  IF v_report.status <> 'draft' THEN
    RETURN public.cpc_rpc_error('INVALID_TRANSITION', '日报已经提交');
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
    org_id, entity_type, entity_id, action, actor_profile_id,
    before_values, after_values, metadata, request_id
  )
  VALUES (
    v_actor_org_id, 'REPORT', v_report.id, 'REPORT_SUBMITTED',
    v_actor_profile_id,
    jsonb_build_object('status', 'draft', 'version', v_report.version),
    jsonb_build_object('status', 'submitted', 'version', v_new_version),
    jsonb_build_object(
      'period_type', v_report.period_type,
      'period_start', v_report.period_start,
      'period_end', v_report.period_end,
      'revision_no', v_report.revision_no
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
      'version', v_new_version
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cpc_refresh_daily_report_draft(
  DATE, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_refresh_daily_report_draft(
  DATE, TEXT, UUID
) TO authenticated;

REVOKE ALL ON FUNCTION public.cpc_submit_report(
  UUID, INTEGER, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_submit_report(
  UUID, INTEGER, UUID
) TO authenticated;

REVOKE ALL ON FUNCTION public.cpc_prevent_submitted_report_mutation()
  FROM PUBLIC, anon, authenticated;

COMMIT;
