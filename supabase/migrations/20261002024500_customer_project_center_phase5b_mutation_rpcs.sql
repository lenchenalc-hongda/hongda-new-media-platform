-- Customer Project Center - Phase 5B Controlled Mutation RPCs
-- Scope: authenticated transactional mutation boundary for the Phase 5 core flow.
-- Safety:
--   - repository migration only; DO NOT execute in Production without explicit owner approval.
--   - ordinary authenticated table DML remains revoked.
--   - no customer ownership / receipt / order / quotation source-of-truth write-back.
--   - no destructive migration of existing business data.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Shared RPC helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_rpc_error(
  p_code TEXT,
  p_message TEXT,
  p_data JSONB DEFAULT NULL
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
    'data', p_data
  );
$$;

CREATE OR REPLACE FUNCTION public.cpc_stage_is_valid(
  p_project_type TEXT,
  p_stage TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE p_project_type
    WHEN 'transfer_film' THEN p_stage IN (
      'requirement_alignment',
      'artwork_material_alignment',
      'quotation',
      'sampling_or_plate',
      'customer_confirmation',
      'order_confirmed',
      'production',
      'delivery'
    )
    WHEN 'transfer_processing' THEN p_stage IN (
      'requirement_alignment',
      'material_fixture_process_alignment',
      'quotation',
      'trial_sample',
      'customer_confirmation',
      'order_confirmed',
      'production',
      'delivery'
    )
    WHEN 'equipment' THEN p_stage IN (
      'application_assessment',
      'solution_definition',
      'validation_or_demo',
      'quotation_negotiation',
      'commercial_confirmation',
      'production',
      'delivery_installation',
      'acceptance_training'
    )
    WHEN 'uv' THEN p_stage IN (
      'application_assessment',
      'sample_validation',
      'quotation',
      'customer_confirmation',
      'order_confirmed',
      'production',
      'delivery'
    )
    WHEN 'other' THEN p_stage IN (
      'qualification',
      'solution',
      'quotation',
      'validation',
      'customer_confirmation',
      'fulfillment',
      'delivery'
    )
    ELSE FALSE
  END;
$$;

CREATE OR REPLACE FUNCTION public.cpc_event_category(
  p_event_type TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_event_type IN (
      'CONTACT_LOGGED',
      'CUSTOMER_RESPONSE_RECEIVED'
    ) THEN 'CONTACT'
    WHEN p_event_type = 'EFFECTIVE_PROGRESS_RECORDED' THEN 'PROGRESS'
    WHEN p_event_type IN (
      'WAITING_STARTED',
      'WAITING_RESOLVED'
    ) THEN 'WAIT'
    WHEN p_event_type IN (
      'QUOTE_SENT',
      'SAMPLE_SENT',
      'CUSTOMER_CONFIRMED',
      'COMMERCIAL_CONFIRMED',
      'ORDER_CONFIRMED'
    ) THEN 'COMMERCIAL'
    WHEN p_event_type IN (
      'STAGE_CHANGED',
      'PROJECT_PAUSED',
      'PROJECT_REOPENED',
      'PROJECT_WON',
      'PROJECT_LOST',
      'PROJECT_CANCELLED'
    ) THEN 'LIFECYCLE'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.cpc_event_payload_is_valid(
  p_event_type TEXT,
  p_payload JSONB
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT
    COALESCE(jsonb_typeof(p_payload), 'null') = 'object'
    AND (
      p_event_type NOT IN (
        'QUOTE_SENT',
        'SAMPLE_SENT',
        'CUSTOMER_CONFIRMED',
        'COMMERCIAL_CONFIRMED',
        'ORDER_CONFIRMED'
      )
      OR (
        p_payload ? 'evidence_reference'
        AND jsonb_typeof(p_payload -> 'evidence_reference') = 'string'
        AND length(btrim(p_payload ->> 'evidence_reference')) > 0
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.cpc_work_item_transition_is_valid(
  p_from_status TEXT,
  p_to_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE p_from_status
    WHEN 'pending' THEN p_to_status IN (
      'in_progress',
      'blocked',
      'completed',
      'cancelled'
    )
    WHEN 'in_progress' THEN p_to_status IN (
      'blocked',
      'completed',
      'cancelled'
    )
    WHEN 'blocked' THEN p_to_status IN (
      'in_progress',
      'completed',
      'cancelled'
    )
    ELSE FALSE
  END;
$$;

CREATE OR REPLACE FUNCTION public.cpc_project_transition_is_valid(
  p_from_status TEXT,
  p_to_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE p_from_status
    WHEN 'active' THEN p_to_status IN (
      'paused',
      'won',
      'lost',
      'cancelled'
    )
    WHEN 'paused' THEN p_to_status IN (
      'active',
      'lost',
      'cancelled'
    )
    WHEN 'lost' THEN p_to_status IN (
      'active',
      'cancelled'
    )
    ELSE FALSE
  END;
$$;

-- Internal helpers are not callable by ordinary clients.
REVOKE ALL ON FUNCTION public.cpc_rpc_error(TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cpc_stage_is_valid(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cpc_event_category(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cpc_event_payload_is_valid(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cpc_work_item_transition_is_valid(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cpc_project_transition_is_valid(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Database-level invariant / immutability protection
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.cpc_reject_append_only_mutation()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_cpc_project_events_append_only
  BEFORE UPDATE OR DELETE ON public.cpc_project_events
  FOR EACH ROW EXECUTE FUNCTION public.cpc_reject_append_only_mutation();

CREATE TRIGGER trg_cpc_audit_log_append_only
  BEFORE UPDATE OR DELETE ON public.cpc_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.cpc_reject_append_only_mutation();

CREATE OR REPLACE FUNCTION public.cpc_enforce_active_project_invariant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_project_id UUID;
  v_project_ids UUID[];
  v_status TEXT;
  v_waiting_on TEXT;
  v_next_check_at TIMESTAMPTZ;
BEGIN
  IF TG_TABLE_NAME = 'cpc_projects' THEN
    v_project_ids := ARRAY[
      CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END
    ];
  ELSE
    v_project_ids := ARRAY[]::UUID[];

    IF TG_OP <> 'INSERT' AND OLD.project_id IS NOT NULL THEN
      v_project_ids := array_append(v_project_ids, OLD.project_id);
    END IF;

    IF TG_OP <> 'DELETE'
       AND NEW.project_id IS NOT NULL
       AND NOT NEW.project_id = ANY(v_project_ids) THEN
      v_project_ids := array_append(v_project_ids, NEW.project_id);
    END IF;
  END IF;

  FOREACH v_project_id IN ARRAY v_project_ids LOOP
    SELECT p.status, p.waiting_on, p.next_check_at
      INTO v_status, v_waiting_on, v_next_check_at
      FROM public.cpc_projects p
      WHERE p.id = v_project_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_status = 'active'
       AND NOT (
         (
           v_waiting_on <> 'none'
           AND v_next_check_at IS NOT NULL
         )
         OR EXISTS (
           SELECT 1
           FROM public.cpc_work_items wi
           WHERE wi.project_id = v_project_id
             AND wi.work_item_type = 'NEXT_ACTION'
             AND wi.status IN ('pending', 'in_progress', 'blocked')
         )
       ) THEN
      RAISE EXCEPTION
        'active project % requires one open NEXT_ACTION or waiting/check state',
        v_project_id
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.cpc_enforce_active_project_invariant()
  FROM PUBLIC, anon, authenticated;

CREATE CONSTRAINT TRIGGER cpc_active_project_invariant_project
  AFTER INSERT OR UPDATE ON public.cpc_projects
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.cpc_enforce_active_project_invariant();

CREATE CONSTRAINT TRIGGER cpc_active_project_invariant_work_items
  AFTER INSERT OR UPDATE OR DELETE ON public.cpc_work_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.cpc_enforce_active_project_invariant();

-- ---------------------------------------------------------------------------
-- 3. Create provisional CustomerReference
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_create_provisional_customer_reference(
  p_display_name_snapshot TEXT,
  p_provisional_source_reference TEXT,
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
  v_reference_id UUID;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = TRUE
    LIMIT 1;

  IF NOT FOUND OR v_actor_role NOT IN ('admin', 'manager', 'sales') THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效客户项目权限');
  END IF;

  IF p_display_name_snapshot IS NULL
     OR btrim(p_display_name_snapshot) = ''
     OR p_provisional_source_reference IS NULL
     OR btrim(p_provisional_source_reference) = '' THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', '客户名称和临时来源不能为空');
  END IF;

  INSERT INTO public.cpc_customer_references (
    org_id,
    reference_kind,
    provisional_source_reference,
    display_name_snapshot,
    status,
    created_by_profile_id
  )
  VALUES (
    v_actor_org_id,
    'provisional',
    btrim(p_provisional_source_reference),
    btrim(p_display_name_snapshot),
    'pending_review',
    v_actor_profile_id
  )
  RETURNING id INTO v_reference_id;

  INSERT INTO public.cpc_audit_log (
    org_id,
    entity_type,
    entity_id,
    action,
    actor_profile_id,
    after_values,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'CUSTOMER_REFERENCE',
    v_reference_id,
    'CUSTOMER_REFERENCE_CREATED',
    v_actor_profile_id,
    jsonb_build_object(
      'reference_kind', 'provisional',
      'display_name_snapshot', btrim(p_display_name_snapshot),
      'status', 'pending_review'
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'customer_reference_id', v_reference_id,
      'status', 'pending_review',
      'version', 1
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN public.cpc_rpc_error(
      'DUPLICATE_REFERENCE',
      '该临时客户来源已存在'
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Create Project + initial next step
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_create_project(
  p_customer_reference_id UUID,
  p_title TEXT,
  p_objective_summary TEXT,
  p_project_type TEXT,
  p_stage TEXT,
  p_priority TEXT,
  p_owner_profile_id UUID DEFAULT NULL,
  p_initial_next_action_title TEXT DEFAULT NULL,
  p_initial_next_action_due_at TIMESTAMPTZ DEFAULT NULL,
  p_waiting_on TEXT DEFAULT 'none',
  p_next_check_at TIMESTAMPTZ DEFAULT NULL,
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
  v_owner_profile_id UUID;
  v_owner_role TEXT;
  v_customer public.cpc_customer_references%ROWTYPE;
  v_project_id UUID;
  v_next_action_id UUID;
  v_next_action_title TEXT := NULLIF(btrim(p_initial_next_action_title), '');
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = TRUE
    LIMIT 1;

  IF NOT FOUND OR v_actor_role NOT IN ('admin', 'manager', 'sales') THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效项目创建权限');
  END IF;

  SELECT cr.*
    INTO v_customer
    FROM public.cpc_customer_references cr
    WHERE cr.id = p_customer_reference_id
      AND cr.org_id = v_actor_org_id
    FOR SHARE;

  IF NOT FOUND THEN
    RETURN public.cpc_rpc_error('NOT_FOUND', '客户引用不存在');
  END IF;

  IF NOT (
    (v_customer.reference_kind = 'canonical' AND v_customer.status = 'active')
    OR
    (
      v_customer.reference_kind = 'provisional'
      AND v_customer.status = 'pending_review'
    )
  ) THEN
    RETURN public.cpc_rpc_error(
      'INVALID_CUSTOMER_REFERENCE',
      '当前客户引用状态不能创建项目'
    );
  END IF;

  IF v_actor_role = 'sales'
     AND NOT public.cpc_can_read_customer_reference(
       p_customer_reference_id,
       v_actor_org_id
     ) THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无权使用该客户引用');
  END IF;

  IF p_title IS NULL
     OR btrim(p_title) = ''
     OR p_objective_summary IS NULL
     OR btrim(p_objective_summary) = '' THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', '项目标题和目标不能为空');
  END IF;

  IF p_project_type NOT IN (
    'transfer_film',
    'transfer_processing',
    'equipment',
    'uv',
    'other'
  )
  OR NOT public.cpc_stage_is_valid(p_project_type, p_stage) THEN
    RETURN public.cpc_rpc_error('INVALID_STAGE', '项目类型或阶段不合法');
  END IF;

  IF p_priority NOT IN ('low', 'medium', 'high', 'critical') THEN
    RETURN public.cpc_rpc_error('INVALID_PRIORITY', '项目优先级不合法');
  END IF;

  v_owner_profile_id := COALESCE(p_owner_profile_id, v_actor_profile_id);

  SELECT p.role
    INTO v_owner_role
    FROM public.profiles p
    WHERE p.id = v_owner_profile_id
      AND p.org_id = v_actor_org_id
      AND p.is_active = TRUE;

  IF NOT FOUND OR v_owner_role NOT IN ('admin', 'manager', 'sales') THEN
    RETURN public.cpc_rpc_error('INVALID_OWNER', '项目负责人无效');
  END IF;

  IF v_actor_role = 'sales'
     AND v_owner_profile_id <> v_actor_profile_id THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '销售只能创建自己负责的项目');
  END IF;

  IF v_next_action_title IS NOT NULL THEN
    IF COALESCE(p_waiting_on, 'none') <> 'none'
       OR p_next_check_at IS NOT NULL THEN
      RETURN public.cpc_rpc_error(
        'INVALID_NEXT_STEP',
        '下一步任务和等待状态不能同时存在'
      );
    END IF;
  ELSE
    IF p_waiting_on IS NULL
       OR p_waiting_on = 'none'
       OR p_waiting_on NOT IN (
         'customer',
         'internal',
         'supplier',
         'quality',
         'finance',
         'logistics',
         'other'
       )
       OR p_next_check_at IS NULL THEN
      RETURN public.cpc_rpc_error(
        'NEXT_STEP_REQUIRED',
        '活跃项目必须有下一步任务或明确等待/检查时间'
      );
    END IF;
  END IF;

  INSERT INTO public.cpc_projects (
    org_id,
    customer_reference_id,
    title,
    objective_summary,
    project_type,
    owner_profile_id,
    status,
    stage,
    waiting_on,
    next_check_at,
    priority,
    created_by_profile_id
  )
  VALUES (
    v_actor_org_id,
    p_customer_reference_id,
    btrim(p_title),
    btrim(p_objective_summary),
    p_project_type,
    v_owner_profile_id,
    'active',
    p_stage,
    CASE
      WHEN v_next_action_title IS NULL THEN p_waiting_on
      ELSE 'none'
    END,
    CASE
      WHEN v_next_action_title IS NULL THEN p_next_check_at
      ELSE NULL
    END,
    p_priority,
    v_actor_profile_id
  )
  RETURNING id INTO v_project_id;

  IF v_next_action_title IS NOT NULL THEN
    INSERT INTO public.cpc_work_items (
      org_id,
      customer_reference_id,
      project_id,
      work_item_type,
      title,
      assignee_profile_id,
      created_by_profile_id,
      due_at,
      status,
      priority
    )
    VALUES (
      v_actor_org_id,
      p_customer_reference_id,
      v_project_id,
      'NEXT_ACTION',
      v_next_action_title,
      v_owner_profile_id,
      v_actor_profile_id,
      p_initial_next_action_due_at,
      'pending',
      p_priority
    )
    RETURNING id INTO v_next_action_id;
  END IF;

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
    'PROJECT',
    v_project_id,
    'PROJECT_CREATED',
    v_actor_profile_id,
    jsonb_build_object(
      'status', 'active',
      'stage', p_stage,
      'owner_profile_id', v_owner_profile_id,
      'waiting_on',
        CASE
          WHEN v_next_action_title IS NULL THEN p_waiting_on
          ELSE 'none'
        END,
      'next_check_at',
        CASE
          WHEN v_next_action_title IS NULL THEN p_next_check_at
          ELSE NULL
        END,
      'version', 1
    ),
    jsonb_build_object(
      'initial_next_action_id', v_next_action_id,
      'customer_reference_id', p_customer_reference_id
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'project_id', v_project_id,
      'version', 1,
      'next_action_id', v_next_action_id
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Record meaningful progress + establish next action / waiting atomically
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_record_progress(
  p_project_id UUID,
  p_expected_version INTEGER,
  p_event_type TEXT,
  p_raw_input TEXT,
  p_payload JSONB,
  p_occurred_at TIMESTAMPTZ DEFAULT NOW(),
  p_new_stage TEXT DEFAULT NULL,
  p_next_action_title TEXT DEFAULT NULL,
  p_next_action_due_at TIMESTAMPTZ DEFAULT NULL,
  p_waiting_on TEXT DEFAULT NULL,
  p_next_check_at TIMESTAMPTZ DEFAULT NULL,
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
  v_project public.cpc_projects%ROWTYPE;
  v_old_next public.cpc_work_items%ROWTYPE;
  v_old_next_found BOOLEAN := FALSE;
  v_event_id UUID;
  v_stage_event_id UUID;
  v_wait_event_id UUID;
  v_new_next_action_id UUID;
  v_next_action_title TEXT := NULLIF(btrim(p_next_action_title), '');
  v_target_stage TEXT;
  v_target_waiting_on TEXT;
  v_target_next_check_at TIMESTAMPTZ;
  v_replace_next BOOLEAN := FALSE;
  v_new_version INTEGER;
  v_event_category TEXT;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = TRUE
    LIMIT 1;

  IF NOT FOUND OR v_actor_role NOT IN ('admin', 'manager', 'sales') THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效项目权限');
  END IF;

  SELECT p.*
    INTO v_project
    FROM public.cpc_projects p
    WHERE p.id = p_project_id
      AND p.org_id = v_actor_org_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.cpc_rpc_error('NOT_FOUND', '项目不存在');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR v_project.owner_profile_id = v_actor_profile_id
  ) THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '只有项目负责人或管理角色可推进项目');
  END IF;

  IF p_expected_version IS NULL
     OR p_expected_version <> v_project.version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', '项目版本已变化');
  END IF;

  IF v_project.status <> 'active' THEN
    RETURN public.cpc_rpc_error(
      'INVALID_PROJECT_STATE',
      '只有活跃项目可记录推进'
    );
  END IF;

  IF p_event_type NOT IN (
    'CONTACT_LOGGED',
    'EFFECTIVE_PROGRESS_RECORDED',
    'CUSTOMER_RESPONSE_RECEIVED',
    'QUOTE_SENT',
    'SAMPLE_SENT',
    'CUSTOMER_CONFIRMED',
    'COMMERCIAL_CONFIRMED',
    'ORDER_CONFIRMED'
  ) THEN
    RETURN public.cpc_rpc_error('INVALID_EVENT_TYPE', '当前事件类型不属于推进记录');
  END IF;

  v_event_category := public.cpc_event_category(p_event_type);

  IF v_event_category IS NULL
     OR NOT public.cpc_event_payload_is_valid(
       p_event_type,
       COALESCE(p_payload, '{}'::JSONB)
     ) THEN
    RETURN public.cpc_rpc_error(
      'INVALID_EVENT_PAYLOAD',
      '事件证据或载荷不完整'
    );
  END IF;

  v_target_stage := COALESCE(p_new_stage, v_project.stage);

  IF NOT public.cpc_stage_is_valid(v_project.project_type, v_target_stage) THEN
    RETURN public.cpc_rpc_error('INVALID_STAGE', '目标阶段不适用于当前项目类型');
  END IF;

  SELECT wi.*
    INTO v_old_next
    FROM public.cpc_work_items wi
    WHERE wi.project_id = v_project.id
      AND wi.work_item_type = 'NEXT_ACTION'
      AND wi.status IN ('pending', 'in_progress', 'blocked')
    FOR UPDATE;

  v_old_next_found := FOUND;

  v_target_waiting_on := v_project.waiting_on;
  v_target_next_check_at := v_project.next_check_at;

  IF v_next_action_title IS NOT NULL THEN
    IF p_waiting_on IS NOT NULL AND p_waiting_on <> 'none' THEN
      RETURN public.cpc_rpc_error(
        'INVALID_NEXT_STEP',
        '下一步任务和等待状态不能同时存在'
      );
    END IF;

    IF p_next_check_at IS NOT NULL THEN
      RETURN public.cpc_rpc_error(
        'INVALID_NEXT_STEP',
        '创建下一步任务时不能同时设置等待检查时间'
      );
    END IF;

    v_target_waiting_on := 'none';
    v_target_next_check_at := NULL;
    v_replace_next := TRUE;
  ELSIF p_waiting_on IS NOT NULL THEN
    IF p_waiting_on NOT IN (
      'none',
      'customer',
      'internal',
      'supplier',
      'quality',
      'finance',
      'logistics',
      'other'
    ) THEN
      RETURN public.cpc_rpc_error('INVALID_WAITING_STATE', '等待对象不合法');
    END IF;

    IF p_waiting_on <> 'none' AND p_next_check_at IS NULL THEN
      RETURN public.cpc_rpc_error(
        'INVALID_WAITING_STATE',
        '等待状态必须设置检查时间'
      );
    END IF;

    v_target_waiting_on := p_waiting_on;
    v_target_next_check_at := CASE
      WHEN p_waiting_on = 'none' THEN NULL
      ELSE p_next_check_at
    END;

    IF p_waiting_on <> 'none' THEN
      v_replace_next := TRUE;
    ELSIF NOT v_old_next_found THEN
      RETURN public.cpc_rpc_error(
        'NEXT_STEP_REQUIRED',
        '清除等待状态前必须已有下一步任务'
      );
    END IF;
  END IF;

  IF v_replace_next AND v_old_next_found THEN
    UPDATE public.cpc_work_items wi
      SET status = 'completed',
          blocked_reason = NULL,
          completed_at = NOW(),
          completed_by_profile_id = v_actor_profile_id,
          version = wi.version + 1,
          updated_at = NOW()
      WHERE wi.id = v_old_next.id
        AND wi.org_id = v_actor_org_id;
  END IF;

  IF v_next_action_title IS NOT NULL THEN
    INSERT INTO public.cpc_work_items (
      org_id,
      customer_reference_id,
      project_id,
      work_item_type,
      title,
      assignee_profile_id,
      created_by_profile_id,
      due_at,
      status,
      priority
    )
    VALUES (
      v_actor_org_id,
      v_project.customer_reference_id,
      v_project.id,
      'NEXT_ACTION',
      v_next_action_title,
      v_project.owner_profile_id,
      v_actor_profile_id,
      p_next_action_due_at,
      'pending',
      v_project.priority
    )
    RETURNING id INTO v_new_next_action_id;
  END IF;

  IF v_project.waiting_on <> 'none'
     AND v_target_waiting_on = 'none' THEN
    INSERT INTO public.cpc_project_events (
      org_id,
      customer_reference_id,
      project_id,
      event_type,
      event_category,
      occurred_at,
      actor_profile_id,
      source,
      payload_schema_version,
      payload,
      request_id
    )
    VALUES (
      v_actor_org_id,
      v_project.customer_reference_id,
      v_project.id,
      'WAITING_RESOLVED',
      'WAIT',
      p_occurred_at,
      v_actor_profile_id,
      'user',
      1,
      jsonb_build_object(
        'from_waiting_on', v_project.waiting_on
      ),
      p_request_id
    )
    RETURNING id INTO v_wait_event_id;
  END IF;

  INSERT INTO public.cpc_project_events (
    org_id,
    customer_reference_id,
    project_id,
    event_type,
    event_category,
    occurred_at,
    actor_profile_id,
    source,
    raw_input,
    payload_schema_version,
    payload,
    request_id
  )
  VALUES (
    v_actor_org_id,
    v_project.customer_reference_id,
    v_project.id,
    p_event_type,
    v_event_category,
    p_occurred_at,
    v_actor_profile_id,
    'user',
    NULLIF(btrim(p_raw_input), ''),
    1,
    COALESCE(p_payload, '{}'::JSONB),
    p_request_id
  )
  RETURNING id INTO v_event_id;

  IF v_target_stage <> v_project.stage THEN
    INSERT INTO public.cpc_project_events (
      org_id,
      customer_reference_id,
      project_id,
      event_type,
      event_category,
      occurred_at,
      actor_profile_id,
      source,
      payload_schema_version,
      payload,
      request_id
    )
    VALUES (
      v_actor_org_id,
      v_project.customer_reference_id,
      v_project.id,
      'STAGE_CHANGED',
      'LIFECYCLE',
      p_occurred_at,
      v_actor_profile_id,
      'user',
      1,
      jsonb_build_object(
        'from_stage', v_project.stage,
        'to_stage', v_target_stage
      ),
      p_request_id
    )
    RETURNING id INTO v_stage_event_id;
  END IF;

  UPDATE public.cpc_projects p
    SET stage = v_target_stage,
        waiting_on = v_target_waiting_on,
        next_check_at = v_target_next_check_at,
        version = p.version + 1,
        updated_at = NOW()
    WHERE p.id = v_project.id
      AND p.org_id = v_actor_org_id
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
    'PROJECT',
    v_project.id,
    'PROJECT_PROGRESS_RECORDED',
    v_actor_profile_id,
    jsonb_build_object(
      'stage', v_project.stage,
      'waiting_on', v_project.waiting_on,
      'next_check_at', v_project.next_check_at,
      'version', v_project.version
    ),
    jsonb_build_object(
      'stage', v_target_stage,
      'waiting_on', v_target_waiting_on,
      'next_check_at', v_target_next_check_at,
      'version', v_new_version
    ),
    jsonb_build_object(
      'event_id', v_event_id,
      'stage_event_id', v_stage_event_id,
      'waiting_event_id', v_wait_event_id,
      'completed_next_action_id',
        CASE WHEN v_replace_next AND v_old_next_found THEN v_old_next.id ELSE NULL END,
      'new_next_action_id', v_new_next_action_id
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'project_id', v_project.id,
      'version', v_new_version,
      'event_id', v_event_id,
      'next_action_id', v_new_next_action_id,
      'waiting_on', v_target_waiting_on,
      'next_check_at', v_target_next_check_at
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Enter / change explicit waiting state
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_set_waiting_state(
  p_project_id UUID,
  p_expected_version INTEGER,
  p_waiting_on TEXT,
  p_next_check_at TIMESTAMPTZ,
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
  v_project public.cpc_projects%ROWTYPE;
  v_old_next public.cpc_work_items%ROWTYPE;
  v_old_next_found BOOLEAN := FALSE;
  v_event_id UUID;
  v_new_version INTEGER;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = TRUE
    LIMIT 1;

  IF NOT FOUND OR v_actor_role NOT IN ('admin', 'manager', 'sales') THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效项目权限');
  END IF;

  SELECT p.*
    INTO v_project
    FROM public.cpc_projects p
    WHERE p.id = p_project_id
      AND p.org_id = v_actor_org_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.cpc_rpc_error('NOT_FOUND', '项目不存在');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR v_project.owner_profile_id = v_actor_profile_id
  ) THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '只有项目负责人或管理角色可设置等待');
  END IF;

  IF p_expected_version IS NULL
     OR p_expected_version <> v_project.version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', '项目版本已变化');
  END IF;

  IF v_project.status <> 'active' THEN
    RETURN public.cpc_rpc_error(
      'INVALID_PROJECT_STATE',
      '只有活跃项目可进入等待状态'
    );
  END IF;

  IF p_waiting_on NOT IN (
    'customer',
    'internal',
    'supplier',
    'quality',
    'finance',
    'logistics',
    'other'
  )
  OR p_next_check_at IS NULL
  OR p_reason IS NULL
  OR btrim(p_reason) = '' THEN
    RETURN public.cpc_rpc_error(
      'INVALID_WAITING_STATE',
      '等待对象、检查时间和原因必须完整'
    );
  END IF;

  SELECT wi.*
    INTO v_old_next
    FROM public.cpc_work_items wi
    WHERE wi.project_id = v_project.id
      AND wi.work_item_type = 'NEXT_ACTION'
      AND wi.status IN ('pending', 'in_progress', 'blocked')
    FOR UPDATE;

  v_old_next_found := FOUND;

  IF v_old_next_found THEN
    UPDATE public.cpc_work_items wi
      SET status = 'completed',
          blocked_reason = NULL,
          completed_at = NOW(),
          completed_by_profile_id = v_actor_profile_id,
          version = wi.version + 1,
          updated_at = NOW()
      WHERE wi.id = v_old_next.id
        AND wi.org_id = v_actor_org_id;
  END IF;

  INSERT INTO public.cpc_project_events (
    org_id,
    customer_reference_id,
    project_id,
    event_type,
    event_category,
    occurred_at,
    actor_profile_id,
    source,
    payload_schema_version,
    payload,
    request_id
  )
  VALUES (
    v_actor_org_id,
    v_project.customer_reference_id,
    v_project.id,
    'WAITING_STARTED',
    'WAIT',
    NOW(),
    v_actor_profile_id,
    'user',
    1,
    jsonb_build_object(
      'from_waiting_on', v_project.waiting_on,
      'to_waiting_on', p_waiting_on,
      'next_check_at', p_next_check_at,
      'reason', btrim(p_reason)
    ),
    p_request_id
  )
  RETURNING id INTO v_event_id;

  UPDATE public.cpc_projects p
    SET waiting_on = p_waiting_on,
        next_check_at = p_next_check_at,
        version = p.version + 1,
        updated_at = NOW()
    WHERE p.id = v_project.id
      AND p.org_id = v_actor_org_id
    RETURNING version INTO v_new_version;

  INSERT INTO public.cpc_audit_log (
    org_id,
    entity_type,
    entity_id,
    action,
    actor_profile_id,
    reason,
    before_values,
    after_values,
    metadata,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'PROJECT',
    v_project.id,
    'PROJECT_WAITING_SET',
    v_actor_profile_id,
    btrim(p_reason),
    jsonb_build_object(
      'waiting_on', v_project.waiting_on,
      'next_check_at', v_project.next_check_at,
      'version', v_project.version
    ),
    jsonb_build_object(
      'waiting_on', p_waiting_on,
      'next_check_at', p_next_check_at,
      'version', v_new_version
    ),
    jsonb_build_object(
      'event_id', v_event_id,
      'completed_next_action_id',
        CASE WHEN v_old_next_found THEN v_old_next.id ELSE NULL END
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'project_id', v_project.id,
      'version', v_new_version,
      'waiting_on', p_waiting_on,
      'next_check_at', p_next_check_at,
      'event_id', v_event_id
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Transition WorkItem state with optimistic concurrency
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_transition_work_item(
  p_work_item_id UUID,
  p_expected_version INTEGER,
  p_to_status TEXT,
  p_reason TEXT DEFAULT NULL,
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
  v_item public.cpc_work_items%ROWTYPE;
  v_project public.cpc_projects%ROWTYPE;
  v_authorized BOOLEAN := FALSE;
  v_new_version INTEGER;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = TRUE
    LIMIT 1;

  IF NOT FOUND OR v_actor_role NOT IN ('admin', 'manager', 'sales') THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效任务权限');
  END IF;

  SELECT wi.*
    INTO v_item
    FROM public.cpc_work_items wi
    WHERE wi.id = p_work_item_id
      AND wi.org_id = v_actor_org_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.cpc_rpc_error('NOT_FOUND', '任务不存在');
  END IF;

  v_authorized :=
    v_actor_role IN ('admin', 'manager')
    OR v_item.assignee_profile_id = v_actor_profile_id
    OR v_item.created_by_profile_id = v_actor_profile_id;

  IF NOT v_authorized AND v_item.project_id IS NOT NULL THEN
    SELECT p.*
      INTO v_project
      FROM public.cpc_projects p
      WHERE p.id = v_item.project_id
        AND p.org_id = v_actor_org_id;

    IF FOUND THEN
      v_authorized :=
        v_project.owner_profile_id = v_actor_profile_id
        OR EXISTS (
          SELECT 1
          FROM public.cpc_project_members pm
          WHERE pm.project_id = v_project.id
            AND pm.org_id = v_actor_org_id
            AND pm.profile_id = v_actor_profile_id
            AND pm.removed_at IS NULL
        );
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无权更新该任务');
  END IF;

  IF p_expected_version IS NULL
     OR p_expected_version <> v_item.version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', '任务版本已变化');
  END IF;

  IF NOT public.cpc_work_item_transition_is_valid(
    v_item.status,
    p_to_status
  ) THEN
    RETURN public.cpc_rpc_error('INVALID_TRANSITION', '任务状态流转不合法');
  END IF;

  IF p_to_status IN ('blocked', 'cancelled')
     AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RETURN public.cpc_rpc_error(
      'REASON_REQUIRED',
      '阻塞或取消任务必须填写原因'
    );
  END IF;

  IF v_item.work_item_type = 'NEXT_ACTION'
     AND p_to_status IN ('completed', 'cancelled')
     AND v_item.project_id IS NOT NULL THEN
    SELECT p.*
      INTO v_project
      FROM public.cpc_projects p
      WHERE p.id = v_item.project_id
        AND p.org_id = v_actor_org_id
      FOR UPDATE;

    IF FOUND
       AND v_project.status = 'active'
       AND v_project.waiting_on = 'none' THEN
      RETURN public.cpc_rpc_error(
        'NEXT_STEP_REQUIRED',
        '活跃项目完成当前下一步时，必须同时建立新的下一步或等待状态'
      );
    END IF;
  END IF;

  UPDATE public.cpc_work_items wi
    SET status = p_to_status,
        blocked_reason = CASE
          WHEN p_to_status = 'blocked' THEN btrim(p_reason)
          ELSE NULL
        END,
        completed_at = CASE
          WHEN p_to_status = 'completed' THEN NOW()
          ELSE NULL
        END,
        completed_by_profile_id = CASE
          WHEN p_to_status = 'completed' THEN v_actor_profile_id
          ELSE NULL
        END,
        cancelled_at = CASE
          WHEN p_to_status = 'cancelled' THEN NOW()
          ELSE NULL
        END,
        cancelled_by_profile_id = CASE
          WHEN p_to_status = 'cancelled' THEN v_actor_profile_id
          ELSE NULL
        END,
        cancellation_reason = CASE
          WHEN p_to_status = 'cancelled' THEN btrim(p_reason)
          ELSE NULL
        END,
        version = wi.version + 1,
        updated_at = NOW()
    WHERE wi.id = v_item.id
      AND wi.org_id = v_actor_org_id
    RETURNING version INTO v_new_version;

  INSERT INTO public.cpc_audit_log (
    org_id,
    entity_type,
    entity_id,
    action,
    actor_profile_id,
    reason,
    before_values,
    after_values,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'WORK_ITEM',
    v_item.id,
    'WORK_ITEM_STATUS_CHANGED',
    v_actor_profile_id,
    NULLIF(btrim(p_reason), ''),
    jsonb_build_object(
      'status', v_item.status,
      'version', v_item.version
    ),
    jsonb_build_object(
      'status', p_to_status,
      'version', v_new_version
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'work_item_id', v_item.id,
      'status', p_to_status,
      'version', v_new_version
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Project lifecycle transition
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_transition_project(
  p_project_id UUID,
  p_expected_version INTEGER,
  p_to_status TEXT,
  p_reason TEXT DEFAULT NULL,
  p_pause_next_check_at TIMESTAMPTZ DEFAULT NULL,
  p_reopen_next_action_title TEXT DEFAULT NULL,
  p_reopen_next_action_due_at TIMESTAMPTZ DEFAULT NULL,
  p_reopen_waiting_on TEXT DEFAULT NULL,
  p_reopen_next_check_at TIMESTAMPTZ DEFAULT NULL,
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
  v_project public.cpc_projects%ROWTYPE;
  v_customer public.cpc_customer_references%ROWTYPE;
  v_old_next public.cpc_work_items%ROWTYPE;
  v_old_next_found BOOLEAN := FALSE;
  v_event_type TEXT;
  v_event_id UUID;
  v_new_next_action_id UUID;
  v_new_version INTEGER;
  v_reopen_next_title TEXT := NULLIF(btrim(p_reopen_next_action_title), '');
  v_target_waiting_on TEXT := 'none';
  v_target_next_check_at TIMESTAMPTZ := NULL;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = TRUE
    LIMIT 1;

  IF NOT FOUND OR v_actor_role NOT IN ('admin', 'manager', 'sales') THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效项目权限');
  END IF;

  SELECT p.*
    INTO v_project
    FROM public.cpc_projects p
    WHERE p.id = p_project_id
      AND p.org_id = v_actor_org_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.cpc_rpc_error('NOT_FOUND', '项目不存在');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR v_project.owner_profile_id = v_actor_profile_id
  ) THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '只有项目负责人或管理角色可变更生命周期');
  END IF;

  IF p_expected_version IS NULL
     OR p_expected_version <> v_project.version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', '项目版本已变化');
  END IF;

  IF NOT public.cpc_project_transition_is_valid(
    v_project.status,
    p_to_status
  ) THEN
    RETURN public.cpc_rpc_error('INVALID_TRANSITION', '项目状态流转不合法');
  END IF;

  IF p_to_status IN ('paused', 'lost', 'cancelled', 'active')
     AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RETURN public.cpc_rpc_error('REASON_REQUIRED', '该状态变化必须填写原因');
  END IF;

  IF p_to_status = 'paused' AND p_pause_next_check_at IS NULL THEN
    RETURN public.cpc_rpc_error(
      'NEXT_CHECK_REQUIRED',
      '暂停项目必须设置下一次检查时间'
    );
  END IF;

  IF p_to_status = 'won' THEN
    SELECT cr.*
      INTO v_customer
      FROM public.cpc_customer_references cr
      WHERE cr.id = v_project.customer_reference_id
        AND cr.org_id = v_actor_org_id;

    IF NOT FOUND OR v_customer.reference_kind <> 'canonical' THEN
      RETURN public.cpc_rpc_error(
        'CANONICAL_CUSTOMER_REQUIRED',
        '临时客户引用不能直接标记项目成交'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.cpc_project_events pe
      WHERE pe.project_id = v_project.id
        AND pe.org_id = v_actor_org_id
        AND pe.event_type = 'ORDER_CONFIRMED'
    ) THEN
      RETURN public.cpc_rpc_error(
        'ORDER_CONFIRMATION_REQUIRED',
        '项目成交前必须先有人确认订单证据'
      );
    END IF;
  END IF;

  SELECT wi.*
    INTO v_old_next
    FROM public.cpc_work_items wi
    WHERE wi.project_id = v_project.id
      AND wi.work_item_type = 'NEXT_ACTION'
      AND wi.status IN ('pending', 'in_progress', 'blocked')
    FOR UPDATE;

  v_old_next_found := FOUND;

  IF p_to_status = 'active' THEN
    IF v_reopen_next_title IS NOT NULL THEN
      IF p_reopen_waiting_on IS NOT NULL
         AND p_reopen_waiting_on <> 'none' THEN
        RETURN public.cpc_rpc_error(
          'INVALID_NEXT_STEP',
          '重启项目的下一步任务和等待状态不能同时存在'
        );
      END IF;

      v_target_waiting_on := 'none';
      v_target_next_check_at := NULL;
    ELSE
      IF p_reopen_waiting_on IS NULL
         OR p_reopen_waiting_on = 'none'
         OR p_reopen_waiting_on NOT IN (
           'customer',
           'internal',
           'supplier',
           'quality',
           'finance',
           'logistics',
           'other'
         )
         OR p_reopen_next_check_at IS NULL THEN
        RETURN public.cpc_rpc_error(
          'NEXT_STEP_REQUIRED',
          '重启项目必须建立下一步任务或等待/检查状态'
        );
      END IF;

      v_target_waiting_on := p_reopen_waiting_on;
      v_target_next_check_at := p_reopen_next_check_at;
    END IF;
  END IF;

  IF v_old_next_found
     AND p_to_status IN ('paused', 'won', 'lost', 'cancelled') THEN
    UPDATE public.cpc_work_items wi
      SET status = 'cancelled',
          blocked_reason = NULL,
          cancelled_at = NOW(),
          cancelled_by_profile_id = v_actor_profile_id,
          cancellation_reason = 'Project status changed to ' || p_to_status,
          version = wi.version + 1,
          updated_at = NOW()
      WHERE wi.id = v_old_next.id
        AND wi.org_id = v_actor_org_id;
  END IF;

  IF p_to_status = 'active' AND v_reopen_next_title IS NOT NULL THEN
    INSERT INTO public.cpc_work_items (
      org_id,
      customer_reference_id,
      project_id,
      work_item_type,
      title,
      assignee_profile_id,
      created_by_profile_id,
      due_at,
      status,
      priority
    )
    VALUES (
      v_actor_org_id,
      v_project.customer_reference_id,
      v_project.id,
      'NEXT_ACTION',
      v_reopen_next_title,
      v_project.owner_profile_id,
      v_actor_profile_id,
      p_reopen_next_action_due_at,
      'pending',
      v_project.priority
    )
    RETURNING id INTO v_new_next_action_id;
  END IF;

  v_event_type := CASE p_to_status
    WHEN 'paused' THEN 'PROJECT_PAUSED'
    WHEN 'active' THEN 'PROJECT_REOPENED'
    WHEN 'won' THEN 'PROJECT_WON'
    WHEN 'lost' THEN 'PROJECT_LOST'
    WHEN 'cancelled' THEN 'PROJECT_CANCELLED'
    ELSE NULL
  END;

  INSERT INTO public.cpc_project_events (
    org_id,
    customer_reference_id,
    project_id,
    event_type,
    event_category,
    occurred_at,
    actor_profile_id,
    source,
    payload_schema_version,
    payload,
    request_id
  )
  VALUES (
    v_actor_org_id,
    v_project.customer_reference_id,
    v_project.id,
    v_event_type,
    'LIFECYCLE',
    NOW(),
    v_actor_profile_id,
    'user',
    1,
    jsonb_build_object(
      'from_status', v_project.status,
      'to_status', p_to_status,
      'reason', NULLIF(btrim(p_reason), ''),
      'pause_next_check_at', p_pause_next_check_at
    )
    ||
    CASE p_to_status
      WHEN 'paused' THEN jsonb_build_object(
        'pause_reason', btrim(p_reason)
      )
      WHEN 'active' THEN jsonb_build_object(
        'reopen_reason', btrim(p_reason)
      )
      WHEN 'lost' THEN jsonb_build_object(
        'loss_reason', btrim(p_reason)
      )
      WHEN 'cancelled' THEN jsonb_build_object(
        'cancellation_reason', btrim(p_reason)
      )
      ELSE '{}'::JSONB
    END,
    p_request_id
  )
  RETURNING id INTO v_event_id;

  UPDATE public.cpc_projects p
    SET status = p_to_status,
        waiting_on = CASE
          WHEN p_to_status = 'active' THEN v_target_waiting_on
          ELSE 'none'
        END,
        next_check_at = CASE
          WHEN p_to_status = 'paused' THEN p_pause_next_check_at
          WHEN p_to_status = 'active' THEN v_target_next_check_at
          ELSE NULL
        END,
        version = p.version + 1,
        updated_at = NOW()
    WHERE p.id = v_project.id
      AND p.org_id = v_actor_org_id
    RETURNING version INTO v_new_version;

  INSERT INTO public.cpc_audit_log (
    org_id,
    entity_type,
    entity_id,
    action,
    actor_profile_id,
    reason,
    before_values,
    after_values,
    metadata,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'PROJECT',
    v_project.id,
    'PROJECT_STATUS_CHANGED',
    v_actor_profile_id,
    NULLIF(btrim(p_reason), ''),
    jsonb_build_object(
      'status', v_project.status,
      'waiting_on', v_project.waiting_on,
      'next_check_at', v_project.next_check_at,
      'version', v_project.version
    ),
    jsonb_build_object(
      'status', p_to_status,
      'waiting_on',
        CASE
          WHEN p_to_status = 'active' THEN v_target_waiting_on
          ELSE 'none'
        END,
      'next_check_at',
        CASE
          WHEN p_to_status = 'paused' THEN p_pause_next_check_at
          WHEN p_to_status = 'active' THEN v_target_next_check_at
          ELSE NULL
        END,
      'version', v_new_version
    ),
    jsonb_build_object(
      'event_id', v_event_id,
      'closed_next_action_id',
        CASE WHEN v_old_next_found THEN v_old_next.id ELSE NULL END,
      'new_next_action_id', v_new_next_action_id
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'project_id', v_project.id,
      'status', p_to_status,
      'version', v_new_version,
      'event_id', v_event_id,
      'next_action_id', v_new_next_action_id
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Function grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.cpc_create_provisional_customer_reference(
  TEXT, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_create_provisional_customer_reference(
  TEXT, TEXT, UUID
) TO authenticated;

REVOKE ALL ON FUNCTION public.cpc_create_project(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_create_project(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, UUID
) TO authenticated;

REVOKE ALL ON FUNCTION public.cpc_record_progress(
  UUID, INTEGER, TEXT, TEXT, JSONB, TIMESTAMPTZ, TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_record_progress(
  UUID, INTEGER, TEXT, TEXT, JSONB, TIMESTAMPTZ, TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, UUID
) TO authenticated;

REVOKE ALL ON FUNCTION public.cpc_set_waiting_state(
  UUID, INTEGER, TEXT, TIMESTAMPTZ, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_set_waiting_state(
  UUID, INTEGER, TEXT, TIMESTAMPTZ, TEXT, UUID
) TO authenticated;

REVOKE ALL ON FUNCTION public.cpc_transition_work_item(
  UUID, INTEGER, TEXT, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_transition_work_item(
  UUID, INTEGER, TEXT, TEXT, UUID
) TO authenticated;

REVOKE ALL ON FUNCTION public.cpc_transition_project(
  UUID, INTEGER, TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_transition_project(
  UUID, INTEGER, TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, UUID
) TO authenticated;

COMMIT;
