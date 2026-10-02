-- Customer Project Center - Phase 6B WorkItem reschedule RPC
-- Repository migration only. DO NOT execute in Production without explicit owner approval.
-- Uses existing append-only cpc_audit_log for reschedule history; no second reminder/task truth.

BEGIN;

CREATE OR REPLACE FUNCTION public.cpc_reschedule_work_item(
  p_work_item_id UUID,
  p_expected_version INTEGER,
  p_to_due_at TIMESTAMPTZ,
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

  IF NOT FOUND
     OR v_actor_role IS NULL
     OR v_actor_role NOT IN ('admin', 'manager', 'sales') THEN
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

  IF v_item.status NOT IN ('pending', 'in_progress', 'blocked') THEN
    RETURN public.cpc_rpc_error('INVALID_TRANSITION', '已结束任务不能改期');
  END IF;

  v_authorized :=
    v_actor_role IN ('admin', 'manager')
    OR v_item.assignee_profile_id = v_actor_profile_id;

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
    RETURN public.cpc_rpc_error('FORBIDDEN', '无权调整该任务时间');
  END IF;

  IF p_expected_version IS NULL
     OR p_expected_version <> v_item.version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', '任务版本已变化');
  END IF;

  IF p_to_due_at IS NULL THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', '改期后时间不能为空');
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RETURN public.cpc_rpc_error('REASON_REQUIRED', '任务改期必须填写原因');
  END IF;

  IF v_item.due_at IS NOT DISTINCT FROM p_to_due_at THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', '新时间必须与当前时间不同');
  END IF;

  UPDATE public.cpc_work_items wi
    SET due_at = p_to_due_at,
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
    metadata,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'WORK_ITEM',
    v_item.id,
    'WORK_ITEM_RESCHEDULED',
    v_actor_profile_id,
    btrim(p_reason),
    jsonb_build_object(
      'due_at', v_item.due_at,
      'version', v_item.version
    ),
    jsonb_build_object(
      'due_at', p_to_due_at,
      'version', v_new_version
    ),
    jsonb_build_object(
      'work_item_type', v_item.work_item_type,
      'status', v_item.status,
      'blocked_status_preserved', v_item.status = 'blocked'
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'work_item_id', v_item.id,
      'due_at', p_to_due_at,
      'version', v_new_version
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cpc_reschedule_work_item(
  UUID, INTEGER, TIMESTAMPTZ, TEXT, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cpc_reschedule_work_item(
  UUID, INTEGER, TIMESTAMPTZ, TEXT, UUID
) TO authenticated;

COMMIT;
