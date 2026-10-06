-- Customer Project Center - Phase 12 project-create replay guard
-- Forward-only, non-destructive.
-- Production execution is NOT part of this repository task.

BEGIN;

DO $cpc_project_replay_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.cpc_audit_log al
    WHERE al.action = 'PROJECT_CREATED'
      AND al.request_id IS NOT NULL
      AND al.actor_profile_id IS NOT NULL
    GROUP BY al.org_id, al.actor_profile_id, al.request_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'cannot install project-create replay guard: duplicate PROJECT_CREATED request ids already exist';
  END IF;
END;
$cpc_project_replay_preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cpc_project_created_request_replay
  ON public.cpc_audit_log (org_id, actor_profile_id, request_id)
  WHERE action = 'PROJECT_CREATED'
    AND request_id IS NOT NULL
    AND actor_profile_id IS NOT NULL;

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
  v_replay_project_id UUID;
  v_replay_next_action_id UUID;
  v_replay_version INTEGER;
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
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效项目创建权限');
  END IF;

  IF p_request_id IS NOT NULL THEN
    SELECT
      al.entity_id,
      NULLIF(al.metadata ->> 'initial_next_action_id', '')::UUID,
      COALESCE(NULLIF(al.after_values ->> 'version', '')::INTEGER, 1)
      INTO v_replay_project_id, v_replay_next_action_id, v_replay_version
      FROM public.cpc_audit_log al
      WHERE al.org_id = v_actor_org_id
        AND al.actor_profile_id = v_actor_profile_id
        AND al.action = 'PROJECT_CREATED'
        AND al.request_id = p_request_id
      LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', TRUE,
        'code', 'OK',
        'message', 'success',
        'data', jsonb_build_object(
          'project_id', v_replay_project_id,
          'version', v_replay_version,
          'next_action_id', v_replay_next_action_id
        )
      );
    END IF;
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

  IF p_priority IS NULL
     OR p_priority NOT IN ('low', 'medium', 'high', 'critical') THEN
    RETURN public.cpc_rpc_error('INVALID_PRIORITY', '项目优先级不合法');
  END IF;

  v_owner_profile_id := COALESCE(p_owner_profile_id, v_actor_profile_id);

  SELECT p.role
    INTO v_owner_role
    FROM public.profiles p
    WHERE p.id = v_owner_profile_id
      AND p.org_id = v_actor_org_id
      AND p.is_active = TRUE;

  IF NOT FOUND
     OR v_owner_role IS NULL
     OR v_owner_role NOT IN ('admin', 'manager', 'sales') THEN
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

EXCEPTION
  WHEN unique_violation THEN
    IF p_request_id IS NOT NULL THEN
      SELECT
        al.entity_id,
        NULLIF(al.metadata ->> 'initial_next_action_id', '')::UUID,
        COALESCE(NULLIF(al.after_values ->> 'version', '')::INTEGER, 1)
        INTO v_replay_project_id, v_replay_next_action_id, v_replay_version
        FROM public.cpc_audit_log al
        WHERE al.org_id = v_actor_org_id
          AND al.actor_profile_id = v_actor_profile_id
          AND al.action = 'PROJECT_CREATED'
          AND al.request_id = p_request_id
        LIMIT 1;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'ok', TRUE,
          'code', 'OK',
          'message', 'success',
          'data', jsonb_build_object(
            'project_id', v_replay_project_id,
            'version', v_replay_version,
            'next_action_id', v_replay_next_action_id
          )
        );
      END IF;
    END IF;

    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.cpc_create_project(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cpc_create_project(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, UUID
) TO authenticated;

COMMIT;
