-- Customer Project Center - Phase 5F Customer Relationship Follow-up RPC
-- Repository migration only. DO NOT execute in Production without explicit owner approval.
-- Purpose:
--   - keep routine old-customer follow-up at Customer level
--   - atomically record one confirmed relationship interaction
--   - optionally complete the current customer-level FOLLOW_UP
--   - optionally create the next customer-level FOLLOW_UP
-- Safety:
--   - no Project creation/promotion is automatic
--   - no customer ownership/external SoT mutation
--   - no direct authenticated table DML is granted

BEGIN;

CREATE OR REPLACE FUNCTION public.cpc_can_follow_customer(
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
        OR (
          cr.reference_kind = 'canonical'
          AND cr.external_source IS NOT NULL
          AND cr.external_owner_reference IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.cpc_external_profile_mappings epm
            WHERE epm.org_id = cr.org_id
              AND epm.external_source = cr.external_source
              AND epm.external_person_id = cr.external_owner_reference
              AND epm.profile_id = v_actor_profile_id
              AND epm.status = 'active'
          )
        )
        OR EXISTS (
          SELECT 1
          FROM public.cpc_work_items wi
          WHERE wi.org_id = cr.org_id
            AND wi.customer_reference_id = cr.id
            AND wi.project_id IS NULL
            AND wi.work_item_type = 'FOLLOW_UP'
            AND wi.assignee_profile_id = v_actor_profile_id
            AND wi.status IN ('pending', 'in_progress', 'blocked')
        )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cpc_can_follow_customer(UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cpc_can_follow_customer(UUID, UUID)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.cpc_record_customer_follow_up(
  p_customer_reference_id UUID,
  p_event_type TEXT,
  p_result_summary TEXT,
  p_occurred_at TIMESTAMPTZ DEFAULT NULL,
  p_current_follow_up_id UUID DEFAULT NULL,
  p_next_follow_up_title TEXT DEFAULT NULL,
  p_next_follow_up_due_at TIMESTAMPTZ DEFAULT NULL,
  p_next_follow_up_priority TEXT DEFAULT 'medium',
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
  v_customer public.cpc_customer_references%ROWTYPE;
  v_current_follow_up public.cpc_work_items%ROWTYPE;
  v_current_follow_up_found BOOLEAN := FALSE;
  v_event_id UUID;
  v_next_follow_up_id UUID;
  v_next_title TEXT := NULLIF(btrim(p_next_follow_up_title), '');
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
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效客户跟进权限');
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
      '当前客户引用状态不能继续关系跟进'
    );
  END IF;

  IF NOT public.cpc_can_follow_customer(
    p_customer_reference_id,
    v_actor_org_id
  ) THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无权维护该客户的关系回访');
  END IF;

  IF p_event_type NOT IN (
    'CONTACT_LOGGED',
    'CUSTOMER_RESPONSE_RECEIVED'
  ) THEN
    RETURN public.cpc_rpc_error(
      'INVALID_EVENT_TYPE',
      '客户级回访只允许联系记录或客户反馈'
    );
  END IF;

  IF p_result_summary IS NULL OR btrim(p_result_summary) = '' THEN
    RETURN public.cpc_rpc_error(
      'INVALID_INPUT',
      '客户回访结果不能为空'
    );
  END IF;

  IF p_next_follow_up_priority IS NULL
     OR p_next_follow_up_priority NOT IN ('low', 'medium', 'high', 'critical') THEN
    RETURN public.cpc_rpc_error(
      'INVALID_PRIORITY',
      '下一次回访优先级不合法'
    );
  END IF;

  IF v_next_title IS NULL AND p_next_follow_up_due_at IS NOT NULL THEN
    RETURN public.cpc_rpc_error(
      'INVALID_NEXT_STEP',
      '未设置下一次回访动作时不能单独设置到期时间'
    );
  END IF;

  IF v_next_title IS NOT NULL AND p_next_follow_up_due_at IS NULL THEN
    RETURN public.cpc_rpc_error(
      'NEXT_CHECK_REQUIRED',
      '设置下一次客户回访时必须指定时间'
    );
  END IF;

  IF p_current_follow_up_id IS NOT NULL THEN
    SELECT wi.*
      INTO v_current_follow_up
      FROM public.cpc_work_items wi
      WHERE wi.id = p_current_follow_up_id
        AND wi.org_id = v_actor_org_id
        AND wi.customer_reference_id = p_customer_reference_id
        AND wi.project_id IS NULL
        AND wi.work_item_type = 'FOLLOW_UP'
        AND wi.status IN ('pending', 'in_progress', 'blocked')
      FOR UPDATE;

    v_current_follow_up_found := FOUND;

    IF NOT v_current_follow_up_found THEN
      RETURN public.cpc_rpc_error(
        'NOT_FOUND',
        '当前客户回访任务不存在或已结束'
      );
    END IF;

    IF NOT (
      v_actor_role IN ('admin', 'manager')
      OR v_current_follow_up.assignee_profile_id = v_actor_profile_id
    ) THEN
      RETURN public.cpc_rpc_error(
        'FORBIDDEN',
        '只有当前回访执行人或管理角色可结束该任务'
      );
    END IF;

    UPDATE public.cpc_work_items wi
      SET status = 'completed',
          blocked_reason = NULL,
          completed_at = NOW(),
          completed_by_profile_id = v_actor_profile_id,
          version = wi.version + 1,
          updated_at = NOW()
      WHERE wi.id = v_current_follow_up.id
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
    raw_input,
    payload_schema_version,
    payload,
    request_id
  )
  VALUES (
    v_actor_org_id,
    p_customer_reference_id,
    NULL,
    p_event_type,
    'CONTACT',
    COALESCE(p_occurred_at, NOW()),
    v_actor_profile_id,
    'user',
    btrim(p_result_summary),
    1,
    jsonb_build_object(
      'relationship_follow_up', TRUE
    ),
    p_request_id
  )
  RETURNING id INTO v_event_id;

  IF v_next_title IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.cpc_work_items wi
      WHERE wi.org_id = v_actor_org_id
        AND wi.customer_reference_id = p_customer_reference_id
        AND wi.project_id IS NULL
        AND wi.work_item_type = 'FOLLOW_UP'
        AND wi.assignee_profile_id = v_actor_profile_id
        AND wi.status IN ('pending', 'in_progress', 'blocked')
    ) THEN
      RETURN public.cpc_rpc_error(
        'DUPLICATE_FOLLOW_UP',
        '当前客户已有未完成的回访任务，请先处理或明确替换'
      );
    END IF;

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
      NULL,
      'FOLLOW_UP',
      v_next_title,
      v_actor_profile_id,
      v_actor_profile_id,
      p_next_follow_up_due_at,
      'pending',
      p_next_follow_up_priority
    )
    RETURNING id INTO v_next_follow_up_id;
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
    'CUSTOMER_REFERENCE',
    p_customer_reference_id,
    'CUSTOMER_FOLLOW_UP_RECORDED',
    v_actor_profile_id,
    jsonb_build_object(
      'event_type', p_event_type,
      'occurred_at', COALESCE(p_occurred_at, NOW()),
      'next_follow_up_due_at', p_next_follow_up_due_at
    ),
    jsonb_build_object(
      'event_id', v_event_id,
      'completed_follow_up_id',
        CASE
          WHEN v_current_follow_up_found THEN v_current_follow_up.id
          ELSE NULL
        END,
      'next_follow_up_id', v_next_follow_up_id
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'customer_reference_id', p_customer_reference_id,
      'event_id', v_event_id,
      'completed_follow_up_id',
        CASE
          WHEN v_current_follow_up_found THEN v_current_follow_up.id
          ELSE NULL
        END,
      'next_follow_up_id', v_next_follow_up_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cpc_record_customer_follow_up(
  UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TIMESTAMPTZ, TEXT, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cpc_record_customer_follow_up(
  UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TIMESTAMPTZ, TEXT, UUID
) TO authenticated;

COMMIT;
