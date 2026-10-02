-- Phase 5D cross-layer consistency fix.
-- Repository migration only. Do not execute in Production without explicit owner approval.
-- Ensures record_progress emits WAITING_STARTED when a confirmed progress update
-- moves or changes an active Project into a waiting/check state.

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

  IF NOT FOUND
     OR v_actor_role IS NULL
     OR v_actor_role NOT IN ('admin', 'manager', 'sales') THEN
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
      COALESCE(p_occurred_at, NOW()),
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

  IF v_target_waiting_on <> 'none'
     AND (
       v_project.waiting_on IS DISTINCT FROM v_target_waiting_on
       OR v_project.next_check_at IS DISTINCT FROM v_target_next_check_at
     ) THEN
    IF p_raw_input IS NULL OR btrim(p_raw_input) = '' THEN
      RETURN public.cpc_rpc_error(
        'INVALID_WAITING_STATE',
        '进入或更新等待状态时必须说明实际原因'
      );
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
      COALESCE(p_occurred_at, NOW()),
      v_actor_profile_id,
      'user',
      1,
      jsonb_build_object(
        'from_waiting_on', v_project.waiting_on,
        'to_waiting_on', v_target_waiting_on,
        'next_check_at', v_target_next_check_at,
        'reason', btrim(p_raw_input)
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
      COALESCE(p_occurred_at, NOW()),
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
