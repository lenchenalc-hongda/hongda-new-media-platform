-- 宏达项目复盘与改善中心 - Phase 2B Migration 2
-- Draft Mutation Foundation
-- Scope: audit/timeline, six controlled SECURITY DEFINER mutation RPCs,
--        review creation audit trigger, direct child DML removal.
-- Safety: no DROP TABLE, TRUNCATE, DELETE, UPDATE of existing business rows,
--         no seed data, no service role key, no backfill of legacy rows.

BEGIN;

-- ============ 1. review_audit_logs ============
CREATE TABLE public.review_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  review_id UUID NOT NULL,
  actor_profile_id UUID,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  version_before INTEGER,
  version_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_review_audit_entity_type CHECK (
    entity_type IN ('REVIEW', 'TYPE_DETAILS', 'MEMBER', 'ASSIGNMENT')
  ),
  CONSTRAINT chk_review_audit_action_nonblank CHECK (
    length(btrim(action)) > 0
  ),
  CONSTRAINT chk_review_audit_version_before CHECK (
    version_before IS NULL OR version_before >= 1
  ),
  CONSTRAINT chk_review_audit_version_after CHECK (
    version_after >= 1
  ),
  CONSTRAINT fk_review_audit_case_org
    FOREIGN KEY (review_id, org_id)
    REFERENCES public.review_cases(id, org_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_review_audit_actor_org
    FOREIGN KEY (actor_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_review_audit_logs_org_review
  ON public.review_audit_logs(org_id, review_id, created_at DESC);
CREATE INDEX idx_review_audit_logs_org_entity
  ON public.review_audit_logs(org_id, entity_type, created_at DESC);
CREATE INDEX idx_review_audit_logs_org_actor
  ON public.review_audit_logs(org_id, actor_profile_id);

ALTER TABLE public.review_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_audit_logs_select_admin_manager"
  ON public.review_audit_logs
  FOR SELECT TO authenticated
  USING (
    org_id::text = public.auth_org_id()
    AND (
      public.auth_has_role('admin')
      OR public.auth_has_role('manager')
    )
  );

-- ============ 2. review_timeline_events ============
CREATE TABLE public.review_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  review_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_profile_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_review_timeline_event_type_nonblank CHECK (
    length(btrim(event_type)) > 0
  ),
  CONSTRAINT chk_review_timeline_version CHECK (
    version >= 1
  ),
  CONSTRAINT fk_review_timeline_case_org
    FOREIGN KEY (review_id, org_id)
    REFERENCES public.review_cases(id, org_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_review_timeline_actor_org
    FOREIGN KEY (actor_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_review_timeline_events_org_review
  ON public.review_timeline_events(org_id, review_id, created_at ASC);
CREATE INDEX idx_review_timeline_events_org_type
  ON public.review_timeline_events(org_id, event_type, created_at DESC);

ALTER TABLE public.review_timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_timeline_events_select_org"
  ON public.review_timeline_events
  FOR SELECT TO authenticated
  USING (
    org_id::text = public.auth_org_id()
    AND public.auth_profile_id() IS NOT NULL
  );

-- ============ 3. Internal result/helper functions ============
-- These are not public business RPCs and are not executable by clients.
CREATE OR REPLACE FUNCTION public.review_rpc_error(
  p_code TEXT,
  p_message TEXT
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'ok', false,
    'code', p_code,
    'message', p_message,
    'data', null::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.review_type_details_key_allowed(
  p_review_type TEXT,
  p_key TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE p_review_type
    WHEN 'A' THEN p_key IN (
      'additional_notes',
      'pre_production_stage',
      'problem_found_stage',
      'order_loss_reason',
      'customer_trust_impact',
      'customer_notified'
    )
    WHEN 'B' THEN p_key IN (
      'additional_notes',
      'abnormal_phase',
      'abnormal_phenomenon',
      'defect_rate',
      'defect_items',
      'delivery_impact',
      'onsite_records'
    )
    WHEN 'C' THEN p_key IN (
      'additional_notes',
      'pre_production_stage',
      'problem_found_stage',
      'order_loss_reason',
      'customer_trust_impact',
      'customer_notified',
      'abnormal_phase',
      'abnormal_phenomenon',
      'defect_rate',
      'defect_items',
      'delivery_impact',
      'onsite_records',
      'frontend_stage',
      'production_stage',
      'root_cause_summary',
      'responsibility',
      'improvement_advice'
    )
    ELSE false
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_rpc_error(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.review_type_details_key_allowed(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

-- ============ 4. RPC: review_update_draft_public ============
CREATE OR REPLACE FUNCTION public.review_update_draft_public(
  p_review_id UUID,
  p_expected_version INTEGER,
  p_patch JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_old_row public.review_cases%ROWTYPE;
  v_review_row public.review_cases%ROWTYPE;
  v_title TEXT;
  v_review_type TEXT;
  v_occurred_at TIMESTAMPTZ;
  v_customer_name TEXT;
  v_order_no TEXT;
  v_project_name TEXT;
  v_product_name TEXT;
  v_process_name TEXT;
  v_description TEXT;
  v_impact_summary TEXT;
  v_risk_level TEXT;
  v_risk_reason TEXT;
  v_has_unknown BOOLEAN;
  v_changed BOOLEAN;
  v_changes JSONB := '{}'::jsonb;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_review_row.status <> 'draft' THEN
    RETURN public.review_rpc_error('DRAFT_ONLY', '仅草稿可编辑');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR v_review_row.pmo_id = v_actor_profile_id
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无编辑权限');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN public.review_rpc_error('INVALID_PATCH', 'patch 必须是 JSON 对象');
  END IF;

  SELECT bool_or(
    key NOT IN (
      'title',
      'review_type',
      'occurred_at',
      'customer_name',
      'order_no',
      'project_name',
      'product_name',
      'process_name',
      'description',
      'impact_summary',
      'risk_level',
      'risk_reason'
    )
  )
  INTO v_has_unknown
  FROM jsonb_object_keys(p_patch) AS k(key);
  IF COALESCE(v_has_unknown, false) THEN
    RETURN public.review_rpc_error('INVALID_PATCH', '包含不允许的字段');
  END IF;

  v_title := v_review_row.title;
  v_review_type := v_review_row.review_type;
  v_occurred_at := v_review_row.occurred_at;
  v_customer_name := v_review_row.customer_name;
  v_order_no := v_review_row.order_no;
  v_project_name := v_review_row.project_name;
  v_product_name := v_review_row.product_name;
  v_process_name := v_review_row.process_name;
  v_description := v_review_row.description;
  v_impact_summary := v_review_row.impact_summary;
  v_risk_level := v_review_row.risk_level;
  v_risk_reason := v_review_row.risk_reason;

  IF p_patch ? 'title' THEN
    IF p_patch->'title' = 'null'::jsonb OR jsonb_typeof(p_patch->'title') <> 'string' THEN
      RETURN public.review_rpc_error('INVALID_PATCH', 'title 必须是非空文本');
    END IF;
    v_title := trim(both from p_patch->>'title');
    IF v_title = '' THEN
      RETURN public.review_rpc_error('INVALID_PATCH', 'title 必须是非空文本');
    END IF;
  END IF;

  IF p_patch ? 'review_type' THEN
    IF p_patch->'review_type' = 'null'::jsonb OR jsonb_typeof(p_patch->'review_type') <> 'string' THEN
      RETURN public.review_rpc_error('INVALID_PATCH', 'review_type 必须为 A/B/C');
    END IF;
    IF p_patch->>'review_type' NOT IN ('A', 'B', 'C') THEN
      RETURN public.review_rpc_error('INVALID_PATCH', 'review_type 必须为 A/B/C');
    END IF;
    v_review_type := p_patch->>'review_type';
    IF v_review_type <> v_review_row.review_type THEN
      PERFORM 1
        FROM public.review_type_details d
        WHERE d.review_id = p_review_id
          AND d.org_id = v_actor_org_id;
      IF FOUND THEN
        RETURN public.review_rpc_error('TYPE_MISMATCH', '已存在专项内容，复盘类型已锁定');
      END IF;
    END IF;
  END IF;

  IF p_patch ? 'occurred_at' THEN
    IF p_patch->'occurred_at' = 'null'::jsonb OR p_patch->>'occurred_at' = '' THEN
      v_occurred_at := NULL;
    ELSIF jsonb_typeof(p_patch->'occurred_at') = 'string' THEN
      BEGIN
        v_occurred_at := (p_patch->>'occurred_at')::timestamptz;
      EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
        RETURN public.review_rpc_error('INVALID_PATCH', 'occurred_at 格式无效');
      END;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'occurred_at 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'customer_name' THEN
    IF p_patch->'customer_name' = 'null'::jsonb OR p_patch->>'customer_name' = '' THEN
      v_customer_name := NULL;
    ELSIF jsonb_typeof(p_patch->'customer_name') = 'string' THEN
      v_customer_name := trim(both from p_patch->>'customer_name');
      IF v_customer_name = '' THEN v_customer_name := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'customer_name 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'order_no' THEN
    IF p_patch->'order_no' = 'null'::jsonb OR p_patch->>'order_no' = '' THEN
      v_order_no := NULL;
    ELSIF jsonb_typeof(p_patch->'order_no') = 'string' THEN
      v_order_no := trim(both from p_patch->>'order_no');
      IF v_order_no = '' THEN v_order_no := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'order_no 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'project_name' THEN
    IF p_patch->'project_name' = 'null'::jsonb OR p_patch->>'project_name' = '' THEN
      v_project_name := NULL;
    ELSIF jsonb_typeof(p_patch->'project_name') = 'string' THEN
      v_project_name := trim(both from p_patch->>'project_name');
      IF v_project_name = '' THEN v_project_name := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'project_name 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'product_name' THEN
    IF p_patch->'product_name' = 'null'::jsonb OR p_patch->>'product_name' = '' THEN
      v_product_name := NULL;
    ELSIF jsonb_typeof(p_patch->'product_name') = 'string' THEN
      v_product_name := trim(both from p_patch->>'product_name');
      IF v_product_name = '' THEN v_product_name := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'product_name 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'process_name' THEN
    IF p_patch->'process_name' = 'null'::jsonb OR p_patch->>'process_name' = '' THEN
      v_process_name := NULL;
    ELSIF jsonb_typeof(p_patch->'process_name') = 'string' THEN
      v_process_name := trim(both from p_patch->>'process_name');
      IF v_process_name = '' THEN v_process_name := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'process_name 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'description' THEN
    IF p_patch->'description' = 'null'::jsonb OR p_patch->>'description' = '' THEN
      v_description := NULL;
    ELSIF jsonb_typeof(p_patch->'description') = 'string' THEN
      v_description := trim(both from p_patch->>'description');
      IF v_description = '' THEN v_description := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'description 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'impact_summary' THEN
    IF p_patch->'impact_summary' = 'null'::jsonb OR p_patch->>'impact_summary' = '' THEN
      v_impact_summary := NULL;
    ELSIF jsonb_typeof(p_patch->'impact_summary') = 'string' THEN
      v_impact_summary := trim(both from p_patch->>'impact_summary');
      IF v_impact_summary = '' THEN v_impact_summary := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'impact_summary 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'risk_level' THEN
    IF p_patch->'risk_level' = 'null'::jsonb THEN
      v_risk_level := NULL;
    ELSIF jsonb_typeof(p_patch->'risk_level') = 'string' THEN
      IF p_patch->>'risk_level' NOT IN ('RED', 'YELLOW', 'GREEN') THEN
        RETURN public.review_rpc_error('INVALID_PATCH', 'risk_level 必须为 RED/YELLOW/GREEN');
      END IF;
      v_risk_level := p_patch->>'risk_level';
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'risk_level 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'risk_reason' THEN
    IF p_patch->'risk_reason' = 'null'::jsonb OR p_patch->>'risk_reason' = '' THEN
      v_risk_reason := NULL;
    ELSIF jsonb_typeof(p_patch->'risk_reason') = 'string' THEN
      v_risk_reason := trim(both from p_patch->>'risk_reason');
      IF v_risk_reason = '' THEN v_risk_reason := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'risk_reason 格式无效');
    END IF;
  END IF;

  IF v_risk_level IS NULL THEN
    v_risk_reason := NULL;
  ELSIF v_risk_reason IS NULL OR btrim(v_risk_reason) = '' THEN
    RETURN public.review_rpc_error('INVALID_PATCH', 'risk_level 必须配套 risk_reason');
  END IF;

  v_changed := (
    v_title IS DISTINCT FROM v_review_row.title
    OR v_review_type IS DISTINCT FROM v_review_row.review_type
    OR v_occurred_at IS DISTINCT FROM v_review_row.occurred_at
    OR v_customer_name IS DISTINCT FROM v_review_row.customer_name
    OR v_order_no IS DISTINCT FROM v_review_row.order_no
    OR v_project_name IS DISTINCT FROM v_review_row.project_name
    OR v_product_name IS DISTINCT FROM v_review_row.product_name
    OR v_process_name IS DISTINCT FROM v_review_row.process_name
    OR v_description IS DISTINCT FROM v_review_row.description
    OR v_impact_summary IS DISTINCT FROM v_review_row.impact_summary
    OR v_risk_level IS DISTINCT FROM v_review_row.risk_level
    OR v_risk_reason IS DISTINCT FROM v_review_row.risk_reason
  );

  IF NOT v_changed THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', to_jsonb(v_review_row)
    );
  END IF;

  v_old_row := v_review_row;

  UPDATE public.review_cases rc
    SET title = v_title,
        review_type = v_review_type,
        occurred_at = v_occurred_at,
        customer_name = v_customer_name,
        order_no = v_order_no,
        project_name = v_project_name,
        product_name = v_product_name,
        process_name = v_process_name,
        description = v_description,
        impact_summary = v_impact_summary,
        risk_level = v_risk_level,
        risk_reason = v_risk_reason,
        version = rc.version + 1
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING * INTO v_review_row;

  IF v_old_row.title IS DISTINCT FROM v_review_row.title THEN
    v_changes := v_changes || jsonb_build_object(
      'title', jsonb_build_object('before', v_old_row.title, 'after', v_review_row.title)
    );
  END IF;
  IF v_old_row.review_type IS DISTINCT FROM v_review_row.review_type THEN
    v_changes := v_changes || jsonb_build_object(
      'review_type', jsonb_build_object('before', v_old_row.review_type, 'after', v_review_row.review_type)
    );
  END IF;
  IF v_old_row.occurred_at IS DISTINCT FROM v_review_row.occurred_at THEN
    v_changes := v_changes || jsonb_build_object(
      'occurred_at', jsonb_build_object('before', v_old_row.occurred_at, 'after', v_review_row.occurred_at)
    );
  END IF;
  IF v_old_row.customer_name IS DISTINCT FROM v_review_row.customer_name THEN
    v_changes := v_changes || jsonb_build_object(
      'customer_name', jsonb_build_object('before', v_old_row.customer_name, 'after', v_review_row.customer_name)
    );
  END IF;
  IF v_old_row.order_no IS DISTINCT FROM v_review_row.order_no THEN
    v_changes := v_changes || jsonb_build_object(
      'order_no', jsonb_build_object('before', v_old_row.order_no, 'after', v_review_row.order_no)
    );
  END IF;
  IF v_old_row.project_name IS DISTINCT FROM v_review_row.project_name THEN
    v_changes := v_changes || jsonb_build_object(
      'project_name', jsonb_build_object('before', v_old_row.project_name, 'after', v_review_row.project_name)
    );
  END IF;
  IF v_old_row.product_name IS DISTINCT FROM v_review_row.product_name THEN
    v_changes := v_changes || jsonb_build_object(
      'product_name', jsonb_build_object('before', v_old_row.product_name, 'after', v_review_row.product_name)
    );
  END IF;
  IF v_old_row.process_name IS DISTINCT FROM v_review_row.process_name THEN
    v_changes := v_changes || jsonb_build_object(
      'process_name', jsonb_build_object('before', v_old_row.process_name, 'after', v_review_row.process_name)
    );
  END IF;
  IF v_old_row.description IS DISTINCT FROM v_review_row.description THEN
    v_changes := v_changes || jsonb_build_object(
      'description', jsonb_build_object('before', v_old_row.description, 'after', v_review_row.description)
    );
  END IF;
  IF v_old_row.impact_summary IS DISTINCT FROM v_review_row.impact_summary THEN
    v_changes := v_changes || jsonb_build_object(
      'impact_summary', jsonb_build_object('before', v_old_row.impact_summary, 'after', v_review_row.impact_summary)
    );
  END IF;
  IF v_old_row.risk_level IS DISTINCT FROM v_review_row.risk_level THEN
    v_changes := v_changes || jsonb_build_object(
      'risk_level', jsonb_build_object('before', v_old_row.risk_level, 'after', v_review_row.risk_level)
    );
  END IF;
  IF v_old_row.risk_reason IS DISTINCT FROM v_review_row.risk_reason THEN
    v_changes := v_changes || jsonb_build_object(
      'risk_reason', jsonb_build_object('before', v_old_row.risk_reason, 'after', v_review_row.risk_reason)
    );
  END IF;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'REVIEW',
    p_review_id,
    'REVIEW_UPDATED',
    v_changes,
    v_old_row.version,
    v_review_row.version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'REVIEW_UPDATED',
    v_actor_profile_id,
    jsonb_build_object('changes', v_changes),
    v_review_row.version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', to_jsonb(v_review_row)
  );
END;
$$;

-- ============ 5. RPC: review_upsert_type_details ============
CREATE OR REPLACE FUNCTION public.review_upsert_type_details(
  p_review_id UUID,
  p_expected_version INTEGER,
  p_patch JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_details_row public.review_type_details%ROWTYPE;
  v_old_details public.review_type_details%ROWTYPE;
  v_details_exists BOOLEAN := false;
  v_has_unknown BOOLEAN;
  v_has_business_value BOOLEAN;
  v_additional_notes JSONB := '{}'::jsonb;
  v_pre_production_stage TEXT;
  v_problem_found_stage TEXT;
  v_order_loss_reason TEXT;
  v_customer_trust_impact TEXT;
  v_customer_notified BOOLEAN;
  v_abnormal_phase TEXT;
  v_abnormal_phenomenon TEXT;
  v_defect_rate NUMERIC(7,4);
  v_defect_items TEXT;
  v_delivery_impact TEXT;
  v_onsite_records TEXT;
  v_frontend_stage TEXT;
  v_production_stage TEXT;
  v_root_cause_summary TEXT;
  v_responsibility TEXT;
  v_improvement_advice TEXT;
  v_changed BOOLEAN;
  v_new_version INTEGER;
  v_changes JSONB := '{}'::jsonb;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_review_row.status <> 'draft' THEN
    RETURN public.review_rpc_error('DRAFT_ONLY', '仅草稿可编辑');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR v_review_row.pmo_id = v_actor_profile_id
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无编辑权限');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN public.review_rpc_error('INVALID_PATCH', 'patch 必须是 JSON 对象');
  END IF;

  SELECT bool_or(
    NOT public.review_type_details_key_allowed(v_review_row.review_type, key)
  )
  INTO v_has_unknown
  FROM jsonb_object_keys(p_patch) AS k(key);
  IF COALESCE(v_has_unknown, false) THEN
    RETURN public.review_rpc_error('INVALID_PATCH', '包含当前类型不允许的字段');
  END IF;

  SELECT d.* INTO v_details_row
    FROM public.review_type_details d
    WHERE d.review_id = p_review_id
      AND d.org_id = v_actor_org_id;
  v_details_exists := FOUND;

  IF v_details_exists THEN
    v_additional_notes := v_details_row.additional_notes;
    v_pre_production_stage := v_details_row.pre_production_stage;
    v_problem_found_stage := v_details_row.problem_found_stage;
    v_order_loss_reason := v_details_row.order_loss_reason;
    v_customer_trust_impact := v_details_row.customer_trust_impact;
    v_customer_notified := v_details_row.customer_notified;
    v_abnormal_phase := v_details_row.abnormal_phase;
    v_abnormal_phenomenon := v_details_row.abnormal_phenomenon;
    v_defect_rate := v_details_row.defect_rate;
    v_defect_items := v_details_row.defect_items;
    v_delivery_impact := v_details_row.delivery_impact;
    v_onsite_records := v_details_row.onsite_records;
    v_frontend_stage := v_details_row.frontend_stage;
    v_production_stage := v_details_row.production_stage;
    v_root_cause_summary := v_details_row.root_cause_summary;
    v_responsibility := v_details_row.responsibility;
    v_improvement_advice := v_details_row.improvement_advice;
  END IF;

  IF p_patch ? 'additional_notes' THEN
    IF p_patch->'additional_notes' = 'null'::jsonb THEN
      v_additional_notes := '{}'::jsonb;
    ELSIF jsonb_typeof(p_patch->'additional_notes') = 'object' THEN
      v_additional_notes := p_patch->'additional_notes';
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'additional_notes 必须是 JSON 对象');
    END IF;
  END IF;

  IF p_patch ? 'pre_production_stage' THEN
    IF p_patch->'pre_production_stage' = 'null'::jsonb OR p_patch->>'pre_production_stage' = '' THEN
      v_pre_production_stage := NULL;
    ELSIF jsonb_typeof(p_patch->'pre_production_stage') = 'string' THEN
      v_pre_production_stage := trim(both from p_patch->>'pre_production_stage');
      IF v_pre_production_stage = '' THEN v_pre_production_stage := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'pre_production_stage 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'problem_found_stage' THEN
    IF p_patch->'problem_found_stage' = 'null'::jsonb OR p_patch->>'problem_found_stage' = '' THEN
      v_problem_found_stage := NULL;
    ELSIF jsonb_typeof(p_patch->'problem_found_stage') = 'string' THEN
      v_problem_found_stage := trim(both from p_patch->>'problem_found_stage');
      IF v_problem_found_stage = '' THEN v_problem_found_stage := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'problem_found_stage 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'order_loss_reason' THEN
    IF p_patch->'order_loss_reason' = 'null'::jsonb OR p_patch->>'order_loss_reason' = '' THEN
      v_order_loss_reason := NULL;
    ELSIF jsonb_typeof(p_patch->'order_loss_reason') = 'string' THEN
      v_order_loss_reason := trim(both from p_patch->>'order_loss_reason');
      IF v_order_loss_reason = '' THEN v_order_loss_reason := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'order_loss_reason 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'customer_trust_impact' THEN
    IF p_patch->'customer_trust_impact' = 'null'::jsonb OR p_patch->>'customer_trust_impact' = '' THEN
      v_customer_trust_impact := NULL;
    ELSIF jsonb_typeof(p_patch->'customer_trust_impact') = 'string' THEN
      v_customer_trust_impact := trim(both from p_patch->>'customer_trust_impact');
      IF v_customer_trust_impact = '' THEN v_customer_trust_impact := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'customer_trust_impact 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'customer_notified' THEN
    IF p_patch->'customer_notified' = 'null'::jsonb THEN
      v_customer_notified := NULL;
    ELSIF jsonb_typeof(p_patch->'customer_notified') = 'boolean' THEN
      v_customer_notified := (p_patch->>'customer_notified')::boolean;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'customer_notified 必须是布尔值');
    END IF;
  END IF;

  IF p_patch ? 'abnormal_phase' THEN
    IF p_patch->'abnormal_phase' = 'null'::jsonb OR p_patch->>'abnormal_phase' = '' THEN
      v_abnormal_phase := NULL;
    ELSIF jsonb_typeof(p_patch->'abnormal_phase') = 'string' THEN
      v_abnormal_phase := trim(both from p_patch->>'abnormal_phase');
      IF v_abnormal_phase = '' THEN v_abnormal_phase := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'abnormal_phase 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'abnormal_phenomenon' THEN
    IF p_patch->'abnormal_phenomenon' = 'null'::jsonb OR p_patch->>'abnormal_phenomenon' = '' THEN
      v_abnormal_phenomenon := NULL;
    ELSIF jsonb_typeof(p_patch->'abnormal_phenomenon') = 'string' THEN
      v_abnormal_phenomenon := trim(both from p_patch->>'abnormal_phenomenon');
      IF v_abnormal_phenomenon = '' THEN v_abnormal_phenomenon := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'abnormal_phenomenon 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'defect_rate' THEN
    IF p_patch->'defect_rate' = 'null'::jsonb THEN
      v_defect_rate := NULL;
    ELSIF jsonb_typeof(p_patch->'defect_rate') IN ('number', 'string') THEN
      BEGIN
        v_defect_rate := (p_patch->>'defect_rate')::numeric(7,4);
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RETURN public.review_rpc_error('INVALID_PATCH', 'defect_rate 格式无效');
      END;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'defect_rate 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'defect_items' THEN
    IF p_patch->'defect_items' = 'null'::jsonb OR p_patch->>'defect_items' = '' THEN
      v_defect_items := NULL;
    ELSIF jsonb_typeof(p_patch->'defect_items') = 'string' THEN
      v_defect_items := trim(both from p_patch->>'defect_items');
      IF v_defect_items = '' THEN v_defect_items := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'defect_items 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'delivery_impact' THEN
    IF p_patch->'delivery_impact' = 'null'::jsonb OR p_patch->>'delivery_impact' = '' THEN
      v_delivery_impact := NULL;
    ELSIF jsonb_typeof(p_patch->'delivery_impact') = 'string' THEN
      v_delivery_impact := trim(both from p_patch->>'delivery_impact');
      IF v_delivery_impact = '' THEN v_delivery_impact := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'delivery_impact 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'onsite_records' THEN
    IF p_patch->'onsite_records' = 'null'::jsonb OR p_patch->>'onsite_records' = '' THEN
      v_onsite_records := NULL;
    ELSIF jsonb_typeof(p_patch->'onsite_records') = 'string' THEN
      v_onsite_records := trim(both from p_patch->>'onsite_records');
      IF v_onsite_records = '' THEN v_onsite_records := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'onsite_records 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'frontend_stage' THEN
    IF p_patch->'frontend_stage' = 'null'::jsonb OR p_patch->>'frontend_stage' = '' THEN
      v_frontend_stage := NULL;
    ELSIF jsonb_typeof(p_patch->'frontend_stage') = 'string' THEN
      v_frontend_stage := trim(both from p_patch->>'frontend_stage');
      IF v_frontend_stage = '' THEN v_frontend_stage := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'frontend_stage 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'production_stage' THEN
    IF p_patch->'production_stage' = 'null'::jsonb OR p_patch->>'production_stage' = '' THEN
      v_production_stage := NULL;
    ELSIF jsonb_typeof(p_patch->'production_stage') = 'string' THEN
      v_production_stage := trim(both from p_patch->>'production_stage');
      IF v_production_stage = '' THEN v_production_stage := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'production_stage 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'root_cause_summary' THEN
    IF p_patch->'root_cause_summary' = 'null'::jsonb OR p_patch->>'root_cause_summary' = '' THEN
      v_root_cause_summary := NULL;
    ELSIF jsonb_typeof(p_patch->'root_cause_summary') = 'string' THEN
      v_root_cause_summary := trim(both from p_patch->>'root_cause_summary');
      IF v_root_cause_summary = '' THEN v_root_cause_summary := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'root_cause_summary 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'responsibility' THEN
    IF p_patch->'responsibility' = 'null'::jsonb OR p_patch->>'responsibility' = '' THEN
      v_responsibility := NULL;
    ELSIF jsonb_typeof(p_patch->'responsibility') = 'string' THEN
      v_responsibility := trim(both from p_patch->>'responsibility');
      IF v_responsibility = '' THEN v_responsibility := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'responsibility 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'improvement_advice' THEN
    IF p_patch->'improvement_advice' = 'null'::jsonb OR p_patch->>'improvement_advice' = '' THEN
      v_improvement_advice := NULL;
    ELSIF jsonb_typeof(p_patch->'improvement_advice') = 'string' THEN
      v_improvement_advice := trim(both from p_patch->>'improvement_advice');
      IF v_improvement_advice = '' THEN v_improvement_advice := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'improvement_advice 格式无效');
    END IF;
  END IF;

  v_has_business_value := (
    v_pre_production_stage IS NOT NULL
    OR v_problem_found_stage IS NOT NULL
    OR v_order_loss_reason IS NOT NULL
    OR v_customer_trust_impact IS NOT NULL
    OR v_customer_notified IS NOT NULL
    OR v_abnormal_phase IS NOT NULL
    OR v_abnormal_phenomenon IS NOT NULL
    OR v_defect_rate IS NOT NULL
    OR v_defect_items IS NOT NULL
    OR v_delivery_impact IS NOT NULL
    OR v_onsite_records IS NOT NULL
    OR v_frontend_stage IS NOT NULL
    OR v_production_stage IS NOT NULL
    OR v_root_cause_summary IS NOT NULL
    OR v_responsibility IS NOT NULL
    OR v_improvement_advice IS NOT NULL
    OR (
      jsonb_typeof(v_additional_notes) = 'object'
      AND jsonb_object_length(v_additional_notes) > 0
    )
  );

  v_changed := (
    (NOT v_details_exists AND v_has_business_value)
    OR (
      v_details_exists
      AND (
        v_additional_notes IS DISTINCT FROM v_details_row.additional_notes
        OR v_pre_production_stage IS DISTINCT FROM v_details_row.pre_production_stage
        OR v_problem_found_stage IS DISTINCT FROM v_details_row.problem_found_stage
        OR v_order_loss_reason IS DISTINCT FROM v_details_row.order_loss_reason
        OR v_customer_trust_impact IS DISTINCT FROM v_details_row.customer_trust_impact
        OR v_customer_notified IS DISTINCT FROM v_details_row.customer_notified
        OR v_abnormal_phase IS DISTINCT FROM v_details_row.abnormal_phase
        OR v_abnormal_phenomenon IS DISTINCT FROM v_details_row.abnormal_phenomenon
        OR v_defect_rate IS DISTINCT FROM v_details_row.defect_rate
        OR v_defect_items IS DISTINCT FROM v_details_row.defect_items
        OR v_delivery_impact IS DISTINCT FROM v_details_row.delivery_impact
        OR v_onsite_records IS DISTINCT FROM v_details_row.onsite_records
        OR v_frontend_stage IS DISTINCT FROM v_details_row.frontend_stage
        OR v_production_stage IS DISTINCT FROM v_details_row.production_stage
        OR v_root_cause_summary IS DISTINCT FROM v_details_row.root_cause_summary
        OR v_responsibility IS DISTINCT FROM v_details_row.responsibility
        OR v_improvement_advice IS DISTINCT FROM v_details_row.improvement_advice
      )
    )
  );

  v_new_version := v_review_row.version;

  IF NOT v_changed THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', jsonb_build_object(
        'type_details',
        CASE WHEN v_details_exists THEN to_jsonb(v_details_row) ELSE null::jsonb END,
        'version', v_new_version
      )
    );
  END IF;

  IF NOT v_details_exists THEN
    INSERT INTO public.review_type_details (
      review_id,
      org_id,
      review_type,
      created_by,
      pre_production_stage,
      problem_found_stage,
      order_loss_reason,
      customer_trust_impact,
      customer_notified,
      abnormal_phase,
      abnormal_phenomenon,
      defect_rate,
      defect_items,
      delivery_impact,
      onsite_records,
      frontend_stage,
      production_stage,
      root_cause_summary,
      responsibility,
      improvement_advice,
      additional_notes
    )
    VALUES (
      p_review_id,
      v_actor_org_id,
      v_review_row.review_type,
      v_actor_profile_id,
      v_pre_production_stage,
      v_problem_found_stage,
      v_order_loss_reason,
      v_customer_trust_impact,
      v_customer_notified,
      v_abnormal_phase,
      v_abnormal_phenomenon,
      v_defect_rate,
      v_defect_items,
      v_delivery_impact,
      v_onsite_records,
      v_frontend_stage,
      v_production_stage,
      v_root_cause_summary,
      v_responsibility,
      v_improvement_advice,
      v_additional_notes
    )
    RETURNING * INTO v_details_row;
    v_changes := jsonb_build_object('created', true, 'review_type', v_review_row.review_type);
  ELSE
    v_old_details := v_details_row;
    UPDATE public.review_type_details d
      SET pre_production_stage = v_pre_production_stage,
          problem_found_stage = v_problem_found_stage,
          order_loss_reason = v_order_loss_reason,
          customer_trust_impact = v_customer_trust_impact,
          customer_notified = v_customer_notified,
          abnormal_phase = v_abnormal_phase,
          abnormal_phenomenon = v_abnormal_phenomenon,
          defect_rate = v_defect_rate,
          defect_items = v_defect_items,
          delivery_impact = v_delivery_impact,
          onsite_records = v_onsite_records,
          frontend_stage = v_frontend_stage,
          production_stage = v_production_stage,
          root_cause_summary = v_root_cause_summary,
          responsibility = v_responsibility,
          improvement_advice = v_improvement_advice,
          additional_notes = v_additional_notes
      WHERE d.review_id = p_review_id
        AND d.org_id = v_actor_org_id
      RETURNING * INTO v_details_row;

    IF v_old_details.additional_notes IS DISTINCT FROM v_details_row.additional_notes THEN
      v_changes := v_changes || jsonb_build_object(
        'additional_notes', jsonb_build_object('before', v_old_details.additional_notes, 'after', v_details_row.additional_notes)
      );
    END IF;
    IF v_old_details.pre_production_stage IS DISTINCT FROM v_details_row.pre_production_stage THEN
      v_changes := v_changes || jsonb_build_object(
        'pre_production_stage', jsonb_build_object('before', v_old_details.pre_production_stage, 'after', v_details_row.pre_production_stage)
      );
    END IF;
    IF v_old_details.problem_found_stage IS DISTINCT FROM v_details_row.problem_found_stage THEN
      v_changes := v_changes || jsonb_build_object(
        'problem_found_stage', jsonb_build_object('before', v_old_details.problem_found_stage, 'after', v_details_row.problem_found_stage)
      );
    END IF;
    IF v_old_details.order_loss_reason IS DISTINCT FROM v_details_row.order_loss_reason THEN
      v_changes := v_changes || jsonb_build_object(
        'order_loss_reason', jsonb_build_object('before', v_old_details.order_loss_reason, 'after', v_details_row.order_loss_reason)
      );
    END IF;
    IF v_old_details.customer_trust_impact IS DISTINCT FROM v_details_row.customer_trust_impact THEN
      v_changes := v_changes || jsonb_build_object(
        'customer_trust_impact', jsonb_build_object('before', v_old_details.customer_trust_impact, 'after', v_details_row.customer_trust_impact)
      );
    END IF;
    IF v_old_details.customer_notified IS DISTINCT FROM v_details_row.customer_notified THEN
      v_changes := v_changes || jsonb_build_object(
        'customer_notified', jsonb_build_object('before', v_old_details.customer_notified, 'after', v_details_row.customer_notified)
      );
    END IF;
    IF v_old_details.abnormal_phase IS DISTINCT FROM v_details_row.abnormal_phase THEN
      v_changes := v_changes || jsonb_build_object(
        'abnormal_phase', jsonb_build_object('before', v_old_details.abnormal_phase, 'after', v_details_row.abnormal_phase)
      );
    END IF;
    IF v_old_details.abnormal_phenomenon IS DISTINCT FROM v_details_row.abnormal_phenomenon THEN
      v_changes := v_changes || jsonb_build_object(
        'abnormal_phenomenon', jsonb_build_object('before', v_old_details.abnormal_phenomenon, 'after', v_details_row.abnormal_phenomenon)
      );
    END IF;
    IF v_old_details.defect_rate IS DISTINCT FROM v_details_row.defect_rate THEN
      v_changes := v_changes || jsonb_build_object(
        'defect_rate', jsonb_build_object('before', v_old_details.defect_rate, 'after', v_details_row.defect_rate)
      );
    END IF;
    IF v_old_details.defect_items IS DISTINCT FROM v_details_row.defect_items THEN
      v_changes := v_changes || jsonb_build_object(
        'defect_items', jsonb_build_object('before', v_old_details.defect_items, 'after', v_details_row.defect_items)
      );
    END IF;
    IF v_old_details.delivery_impact IS DISTINCT FROM v_details_row.delivery_impact THEN
      v_changes := v_changes || jsonb_build_object(
        'delivery_impact', jsonb_build_object('before', v_old_details.delivery_impact, 'after', v_details_row.delivery_impact)
      );
    END IF;
    IF v_old_details.onsite_records IS DISTINCT FROM v_details_row.onsite_records THEN
      v_changes := v_changes || jsonb_build_object(
        'onsite_records', jsonb_build_object('before', v_old_details.onsite_records, 'after', v_details_row.onsite_records)
      );
    END IF;
    IF v_old_details.frontend_stage IS DISTINCT FROM v_details_row.frontend_stage THEN
      v_changes := v_changes || jsonb_build_object(
        'frontend_stage', jsonb_build_object('before', v_old_details.frontend_stage, 'after', v_details_row.frontend_stage)
      );
    END IF;
    IF v_old_details.production_stage IS DISTINCT FROM v_details_row.production_stage THEN
      v_changes := v_changes || jsonb_build_object(
        'production_stage', jsonb_build_object('before', v_old_details.production_stage, 'after', v_details_row.production_stage)
      );
    END IF;
    IF v_old_details.root_cause_summary IS DISTINCT FROM v_details_row.root_cause_summary THEN
      v_changes := v_changes || jsonb_build_object(
        'root_cause_summary', jsonb_build_object('before', v_old_details.root_cause_summary, 'after', v_details_row.root_cause_summary)
      );
    END IF;
    IF v_old_details.responsibility IS DISTINCT FROM v_details_row.responsibility THEN
      v_changes := v_changes || jsonb_build_object(
        'responsibility', jsonb_build_object('before', v_old_details.responsibility, 'after', v_details_row.responsibility)
      );
    END IF;
    IF v_old_details.improvement_advice IS DISTINCT FROM v_details_row.improvement_advice THEN
      v_changes := v_changes || jsonb_build_object(
        'improvement_advice', jsonb_build_object('before', v_old_details.improvement_advice, 'after', v_details_row.improvement_advice)
      );
    END IF;
  END IF;

  UPDATE public.review_cases rc
    SET version = rc.version + 1
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING version INTO v_new_version;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'TYPE_DETAILS',
    p_review_id,
    'TYPE_DETAILS_SAVED',
    v_changes,
    v_review_row.version,
    v_new_version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'TYPE_DETAILS_SAVED',
    v_actor_profile_id,
    jsonb_build_object('changes', v_changes),
    v_new_version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'type_details', to_jsonb(v_details_row),
      'version', v_new_version
    )
  );
END;
$$;

-- ============ 6. RPC: review_add_member ============
CREATE OR REPLACE FUNCTION public.review_add_member(
  p_review_id UUID,
  p_expected_version INTEGER,
  p_profile_id UUID,
  p_member_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_member_row public.review_members%ROWTYPE;
  v_member_active BOOLEAN;
  v_new_version INTEGER;
  v_changes JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_review_row.status <> 'draft' THEN
    RETURN public.review_rpc_error('DRAFT_ONLY', '仅草稿可编辑');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR v_review_row.pmo_id = v_actor_profile_id
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无成员管理权限');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF p_profile_id IS NULL THEN
    RETURN public.review_rpc_error('INVALID_MEMBER', '成员档案无效');
  END IF;

  IF p_member_role IS NULL OR p_member_role NOT IN (
    'TECH_PROCESS',
    'DESIGN_PLATE',
    'PRODUCTION',
    'QUALITY',
    'EXPERT_REVIEWER',
    'OTHER'
  ) THEN
    RETURN public.review_rpc_error('INVALID_MEMBER', '成员角色无效');
  END IF;

  SELECT p.is_active INTO v_member_active
    FROM public.profiles p
    WHERE p.id = p_profile_id
      AND p.org_id = v_actor_org_id;
  IF NOT FOUND OR NOT v_member_active THEN
    RETURN public.review_rpc_error('INVALID_MEMBER', '成员必须 active 且同 org');
  END IF;

  BEGIN
    INSERT INTO public.review_members (
      org_id,
      review_id,
      profile_id,
      member_role,
      is_primary,
      created_by
    )
    VALUES (
      v_actor_org_id,
      p_review_id,
      p_profile_id,
      p_member_role,
      false,
      v_actor_profile_id
    )
    RETURNING * INTO v_member_row;
  EXCEPTION WHEN unique_violation THEN
    RETURN public.review_rpc_error('UNIQUE_CONFLICT', '该成员角色已存在');
  END;

  UPDATE public.review_cases rc
    SET version = rc.version + 1
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING version INTO v_new_version;

  v_changes := jsonb_build_object(
    'member_id', v_member_row.id,
    'profile_id', v_member_row.profile_id,
    'member_role', v_member_row.member_role,
    'is_primary', v_member_row.is_primary
  );

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'MEMBER',
    v_member_row.id,
    'MEMBER_ADDED',
    v_changes,
    v_review_row.version,
    v_new_version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'MEMBER_ADDED',
    v_actor_profile_id,
    v_changes,
    v_new_version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'member', to_jsonb(v_member_row),
      'version', v_new_version
    )
  );
END;
$$;

-- ============ 7. RPC: review_remove_member ============
CREATE OR REPLACE FUNCTION public.review_remove_member(
  p_review_id UUID,
  p_expected_version INTEGER,
  p_member_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_member_row public.review_members%ROWTYPE;
  v_new_version INTEGER;
  v_changes JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_review_row.status <> 'draft' THEN
    RETURN public.review_rpc_error('DRAFT_ONLY', '仅草稿可编辑');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR v_review_row.pmo_id = v_actor_profile_id
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无成员管理权限');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  SELECT m.* INTO v_member_row
    FROM public.review_members m
    WHERE m.id = p_member_id
      AND m.review_id = p_review_id
      AND m.org_id = v_actor_org_id;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '成员不存在');
  END IF;

  DELETE FROM public.review_members m
    WHERE m.id = p_member_id
      AND m.review_id = p_review_id
      AND m.org_id = v_actor_org_id;

  UPDATE public.review_cases rc
    SET version = rc.version + 1
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING version INTO v_new_version;

  v_changes := jsonb_build_object(
    'member_id', v_member_row.id,
    'profile_id', v_member_row.profile_id,
    'member_role', v_member_row.member_role,
    'is_primary', v_member_row.is_primary
  );

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'MEMBER',
    p_member_id,
    'MEMBER_REMOVED',
    v_changes,
    v_review_row.version,
    v_new_version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'MEMBER_REMOVED',
    v_actor_profile_id,
    v_changes,
    v_new_version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'member_id', p_member_id,
      'removed', true,
      'version', v_new_version
    )
  );
END;
$$;

-- ============ 8. RPC: review_set_primary_member ============
CREATE OR REPLACE FUNCTION public.review_set_primary_member(
  p_review_id UUID,
  p_expected_version INTEGER,
  p_member_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_target public.review_members%ROWTYPE;
  v_prev_primary_id UUID;
  v_prev_primary_profile_id UUID;
  v_new_version INTEGER;
  v_changes JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_review_row.status <> 'draft' THEN
    RETURN public.review_rpc_error('DRAFT_ONLY', '仅草稿可编辑');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR v_review_row.pmo_id = v_actor_profile_id
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无成员管理权限');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  SELECT m.* INTO v_target
    FROM public.review_members m
    WHERE m.id = p_member_id
      AND m.review_id = p_review_id
      AND m.org_id = v_actor_org_id;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '成员不存在');
  END IF;

  IF v_target.is_primary THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', jsonb_build_object(
        'member', to_jsonb(v_target),
        'version', v_review_row.version
      )
    );
  END IF;

  SELECT m.id, m.profile_id
    INTO v_prev_primary_id, v_prev_primary_profile_id
    FROM public.review_members m
    WHERE m.review_id = p_review_id
      AND m.org_id = v_actor_org_id
      AND m.member_role = v_target.member_role
      AND m.is_primary = true
    LIMIT 1;

  UPDATE public.review_members m
    SET is_primary = false
    WHERE m.review_id = p_review_id
      AND m.org_id = v_actor_org_id
      AND m.member_role = v_target.member_role
      AND m.is_primary = true;

  UPDATE public.review_members m
    SET is_primary = true
    WHERE m.id = p_member_id
      AND m.review_id = p_review_id
      AND m.org_id = v_actor_org_id
    RETURNING * INTO v_target;

  UPDATE public.review_cases rc
    SET version = rc.version + 1
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING version INTO v_new_version;

  v_changes := jsonb_build_object(
    'member_role', v_target.member_role,
    'previous_primary_id', v_prev_primary_id,
    'previous_primary_profile_id', v_prev_primary_profile_id,
    'new_primary_id', v_target.id,
    'new_primary_profile_id', v_target.profile_id
  );

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'MEMBER',
    v_target.id,
    'MEMBER_PRIMARY_SET',
    v_changes,
    v_review_row.version,
    v_new_version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'MEMBER_PRIMARY_SET',
    v_actor_profile_id,
    v_changes,
    v_new_version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'member', to_jsonb(v_target),
      'version', v_new_version
    )
  );
END;
$$;

-- ============ 9. RPC: review_set_draft_assignments ============
CREATE OR REPLACE FUNCTION public.review_set_draft_assignments(
  p_review_id UUID,
  p_expected_version INTEGER,
  p_owner_profile_id UUID,
  p_pmo_profile_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_old_row public.review_cases%ROWTYPE;
  v_review_row public.review_cases%ROWTYPE;
  v_owner_active BOOLEAN;
  v_owner_role TEXT;
  v_pmo_active BOOLEAN;
  v_pmo_role TEXT;
  v_changed BOOLEAN;
  v_changes JSONB := '{}'::jsonb;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_review_row.status <> 'draft' THEN
    RETURN public.review_rpc_error('DRAFT_ONLY', '仅草稿可编辑');
  END IF;

  IF v_actor_role NOT IN ('admin', 'manager') THEN
    RETURN public.review_rpc_error('FORBIDDEN', '仅管理员或主管可分配负责人');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF p_owner_profile_id IS NULL THEN
    RETURN public.review_rpc_error('INVALID_MEMBER', 'owner 不能为空');
  END IF;

  SELECT p.is_active, p.role
    INTO v_owner_active, v_owner_role
    FROM public.profiles p
    WHERE p.id = p_owner_profile_id
      AND p.org_id = v_actor_org_id;
  IF NOT FOUND OR NOT v_owner_active OR v_owner_role = 'viewer' THEN
    RETURN public.review_rpc_error('INVALID_MEMBER', 'owner 必须 active、同 org 且非 viewer');
  END IF;

  IF p_pmo_profile_id IS NOT NULL THEN
    SELECT p.is_active, p.role
      INTO v_pmo_active, v_pmo_role
      FROM public.profiles p
      WHERE p.id = p_pmo_profile_id
        AND p.org_id = v_actor_org_id;
    IF NOT FOUND OR NOT v_pmo_active OR v_pmo_role = 'viewer' THEN
      RETURN public.review_rpc_error('INVALID_MEMBER', 'pmo 必须 active、同 org 且非 viewer');
    END IF;
  END IF;

  v_changed := (
    v_review_row.owner_id IS DISTINCT FROM p_owner_profile_id
    OR v_review_row.pmo_id IS DISTINCT FROM p_pmo_profile_id
  );

  IF NOT v_changed THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', to_jsonb(v_review_row)
    );
  END IF;

  v_old_row := v_review_row;

  UPDATE public.review_cases rc
    SET owner_id = p_owner_profile_id,
        pmo_id = p_pmo_profile_id,
        version = rc.version + 1
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING * INTO v_review_row;

  IF v_old_row.owner_id IS DISTINCT FROM v_review_row.owner_id THEN
    v_changes := v_changes || jsonb_build_object(
      'owner_id', jsonb_build_object('before', v_old_row.owner_id, 'after', v_review_row.owner_id)
    );
  END IF;
  IF v_old_row.pmo_id IS DISTINCT FROM v_review_row.pmo_id THEN
    v_changes := v_changes || jsonb_build_object(
      'pmo_id', jsonb_build_object('before', v_old_row.pmo_id, 'after', v_review_row.pmo_id)
    );
  END IF;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'ASSIGNMENT',
    p_review_id,
    'ASSIGNMENT_UPDATED',
    v_changes,
    v_old_row.version,
    v_review_row.version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'ASSIGNMENT_UPDATED',
    v_actor_profile_id,
    v_changes,
    v_review_row.version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', to_jsonb(v_review_row)
  );
END;
$$;

-- ============ 10. Review creation audit trigger ============
CREATE OR REPLACE FUNCTION public.review_create_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id UUID;
BEGIN
  SELECT p.id INTO v_actor_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
      AND p.org_id = NEW.org_id
    LIMIT 1;
  IF v_actor_id IS NULL THEN
    v_actor_id := NEW.created_by;
  END IF;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    NEW.org_id,
    NEW.id,
    v_actor_id,
    'REVIEW',
    NEW.id,
    'REVIEW_CREATED',
    jsonb_build_object(
      'review_no', NEW.review_no,
      'review_type', NEW.review_type,
      'title', NEW.title
    ),
    NULL,
    NEW.version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    NEW.org_id,
    NEW.id,
    'REVIEW_CREATED',
    v_actor_id,
    jsonb_build_object(
      'review_no', NEW.review_no,
      'review_type', NEW.review_type,
      'title', NEW.title
    ),
    NEW.version
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_review_cases_create_audit
  AFTER INSERT ON public.review_cases
  FOR EACH ROW EXECUTE FUNCTION public.review_create_audit_trigger();

-- ============ 11. Remove direct child DML policies ============
DROP POLICY IF EXISTS "review_type_details_insert_draft" ON public.review_type_details;
DROP POLICY IF EXISTS "review_type_details_delete_draft" ON public.review_type_details;
DROP POLICY IF EXISTS "review_members_insert_draft" ON public.review_members;
DROP POLICY IF EXISTS "review_members_delete_draft" ON public.review_members;

-- ============ 12. Table privilege hardening ============
REVOKE ALL ON public.review_cases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.review_cases TO authenticated;

REVOKE ALL ON public.review_type_details FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.review_type_details TO authenticated;

REVOKE ALL ON public.review_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.review_members TO authenticated;

REVOKE ALL ON public.review_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.review_audit_logs TO authenticated;

REVOKE ALL ON public.review_timeline_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.review_timeline_events TO authenticated;

-- ============ 13. Function execute grants ============
REVOKE EXECUTE ON FUNCTION public.review_update_draft_public(UUID, INTEGER, JSONB)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_upsert_type_details(UUID, INTEGER, JSONB)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_add_member(UUID, INTEGER, UUID, TEXT)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_remove_member(UUID, INTEGER, UUID)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_set_primary_member(UUID, INTEGER, UUID)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_set_draft_assignments(UUID, INTEGER, UUID, UUID)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_create_audit_trigger()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.review_update_draft_public(UUID, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_upsert_type_details(UUID, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_add_member(UUID, INTEGER, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_remove_member(UUID, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_set_primary_member(UUID, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_set_draft_assignments(UUID, INTEGER, UUID, UUID) TO authenticated;

COMMIT;
