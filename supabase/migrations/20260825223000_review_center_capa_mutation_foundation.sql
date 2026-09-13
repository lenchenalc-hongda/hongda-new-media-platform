-- Review Center - Phase 2N.3A CAPA Mutation Foundation
-- Scope: seven explicit Action mutation RPCs and review_close integration
--        with the OPEN_ACTIONS_EXIST prerequisite.
-- Safety: SECURITY DEFINER, hardened search_path, server-derived actor/org,
--         Review-row lock first, Action-row lock second, no direct table
--         grant expansion, no service-role business path, no triggers.

BEGIN;

-- ============ 1. RPC: review_action_create ============
CREATE OR REPLACE FUNCTION public.review_action_create(
  p_review_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_action_type TEXT,
  p_owner_profile_id UUID,
  p_due_date DATE
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
  v_owner_row public.profiles%ROWTYPE;
  v_title TEXT;
  v_description TEXT;
  v_sequence INTEGER;
  v_action_row public.review_actions%ROWTYPE;
  v_data JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF v_actor_role IS NULL OR v_actor_role = 'viewer' THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  IF v_review_row.status NOT IN ('draft', 'submitted') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改改善行动');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR (
          v_review_row.pmo_id IS NOT NULL
          AND v_review_row.pmo_id = v_actor_profile_id
        )
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  v_title := btrim(p_title);
  IF v_title IS NULL OR v_title = '' OR char_length(v_title) > 200 THEN
    RETURN public.review_rpc_error('INVALID_INPUT', 'title 必须是非空文本且不超过200字符');
  END IF;

  IF p_description IS NULL THEN
    v_description := NULL;
  ELSE
    v_description := btrim(p_description);
    IF v_description IS NULL OR v_description = '' OR char_length(v_description) > 5000 THEN
      RETURN public.review_rpc_error('INVALID_INPUT', 'description 格式无效');
    END IF;
  END IF;

  IF p_action_type IS NULL OR p_action_type NOT IN ('IMMEDIATE', 'CORRECTIVE', 'PREVENTIVE') THEN
    RETURN public.review_rpc_error('INVALID_INPUT', 'action_type 必须为 IMMEDIATE/CORRECTIVE/PREVENTIVE');
  END IF;

  IF p_owner_profile_id IS NULL THEN
    RETURN public.review_rpc_error('INVALID_OWNER', '负责人不能为空');
  END IF;
  IF p_due_date IS NULL THEN
    RETURN public.review_rpc_error('INVALID_INPUT', '截止日期不能为空');
  END IF;

  SELECT po.* INTO v_owner_row
    FROM public.profiles po
    WHERE po.id = p_owner_profile_id
      AND po.org_id = v_actor_org_id
      AND po.is_active = true;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('INVALID_OWNER', '负责人必须 active、同 org 且非 viewer');
  END IF;
  IF v_owner_row.role IS NULL OR v_owner_row.role NOT IN ('admin', 'manager', 'operator', 'sales') THEN
    RETURN public.review_rpc_error('INVALID_OWNER', '负责人必须 active、同 org 且非 viewer');
  END IF;

  SELECT COALESCE(MAX(ra.sequence), 0) + 1
    INTO v_sequence
    FROM public.review_actions ra
    WHERE ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id;

  INSERT INTO public.review_actions (
    org_id,
    review_id,
    sequence,
    title,
    description,
    action_type,
    owner_profile_id,
    due_date,
    status,
    completion_note,
    verification_note,
    verified_by_profile_id,
    verified_at,
    completed_at,
    cancelled_at,
    cancel_reason,
    created_by_profile_id,
    version,
    created_at,
    updated_at
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_sequence,
    v_title,
    v_description,
    p_action_type,
    v_owner_row.id,
    p_due_date,
    'OPEN',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    v_actor_profile_id,
    1,
    NOW(),
    NOW()
  )
  RETURNING * INTO v_action_row;

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
    'ACTION',
    v_action_row.id,
    'ACTION_CREATED',
    jsonb_build_object(
      'sequence', v_action_row.sequence,
      'title', v_action_row.title,
      'description', v_action_row.description,
      'action_type', v_action_row.action_type,
      'owner_profile_id', v_action_row.owner_profile_id,
      'due_date', v_action_row.due_date,
      'status', v_action_row.status
    ),
    NULL,
    1
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
    'ACTION_CREATED',
    v_actor_profile_id,
    jsonb_build_object(
      'action_id', v_action_row.id,
      'sequence', v_action_row.sequence,
      'title', v_action_row.title
    ),
    1
  );

  v_data := jsonb_build_object(
    'id', v_action_row.id,
    'review_id', v_action_row.review_id,
    'sequence', v_action_row.sequence,
    'status', v_action_row.status,
    'version', v_action_row.version,
    'updated_at', v_action_row.updated_at,
    'completed_at', v_action_row.completed_at,
    'verified_at', v_action_row.verified_at,
    'cancelled_at', v_action_row.cancelled_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', v_data
  );
END;
$$;

-- ============ 2. RPC: review_action_update ============
CREATE OR REPLACE FUNCTION public.review_action_update(
  p_review_id UUID,
  p_action_id UUID,
  p_expected_version INTEGER,
  p_title TEXT,
  p_description TEXT,
  p_action_type TEXT,
  p_owner_profile_id UUID,
  p_due_date DATE
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
  v_action_row public.review_actions%ROWTYPE;
  v_owner_row public.profiles%ROWTYPE;
  v_title TEXT;
  v_description TEXT;
  v_old_version INTEGER;
  v_changes JSONB := '{}'::jsonb;
  v_changed_fields JSONB := '[]'::jsonb;
  v_data JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF v_actor_role IS NULL OR v_actor_role = 'viewer' THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  IF v_review_row.status NOT IN ('draft', 'submitted') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改改善行动');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR (
          v_review_row.pmo_id IS NOT NULL
          AND v_review_row.pmo_id = v_actor_profile_id
        )
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  v_title := btrim(p_title);
  IF v_title IS NULL OR v_title = '' OR char_length(v_title) > 200 THEN
    RETURN public.review_rpc_error('INVALID_INPUT', 'title 必须是非空文本且不超过200字符');
  END IF;

  IF p_description IS NULL THEN
    v_description := NULL;
  ELSE
    v_description := btrim(p_description);
    IF v_description IS NULL OR v_description = '' OR char_length(v_description) > 5000 THEN
      RETURN public.review_rpc_error('INVALID_INPUT', 'description 格式无效');
    END IF;
  END IF;

  IF p_action_type IS NULL OR p_action_type NOT IN ('IMMEDIATE', 'CORRECTIVE', 'PREVENTIVE') THEN
    RETURN public.review_rpc_error('INVALID_INPUT', 'action_type 必须为 IMMEDIATE/CORRECTIVE/PREVENTIVE');
  END IF;

  IF p_owner_profile_id IS NULL THEN
    RETURN public.review_rpc_error('INVALID_OWNER', '负责人不能为空');
  END IF;
  IF p_due_date IS NULL THEN
    RETURN public.review_rpc_error('INVALID_INPUT', '截止日期不能为空');
  END IF;

  SELECT po.* INTO v_owner_row
    FROM public.profiles po
    WHERE po.id = p_owner_profile_id
      AND po.org_id = v_actor_org_id
      AND po.is_active = true;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('INVALID_OWNER', '负责人必须 active、同 org 且非 viewer');
  END IF;
  IF v_owner_row.role IS NULL OR v_owner_row.role NOT IN ('admin', 'manager', 'operator', 'sales') THEN
    RETURN public.review_rpc_error('INVALID_OWNER', '负责人必须 active、同 org 且非 viewer');
  END IF;

  SELECT ra.* INTO v_action_row
    FROM public.review_actions ra
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Action not found');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_action_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_action_row.status NOT IN ('OPEN', 'IN_PROGRESS') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改行动定义');
  END IF;

  IF v_title = v_action_row.title
     AND v_description IS NOT DISTINCT FROM v_action_row.description
     AND p_action_type = v_action_row.action_type
     AND v_owner_row.id = v_action_row.owner_profile_id
     AND p_due_date = v_action_row.due_date THEN
    v_data := jsonb_build_object(
      'id', v_action_row.id,
      'review_id', v_action_row.review_id,
      'sequence', v_action_row.sequence,
      'status', v_action_row.status,
      'version', v_action_row.version,
      'updated_at', v_action_row.updated_at,
      'completed_at', v_action_row.completed_at,
      'verified_at', v_action_row.verified_at,
      'cancelled_at', v_action_row.cancelled_at
    );
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', v_data
    );
  END IF;

  IF v_title IS DISTINCT FROM v_action_row.title THEN
    v_changes := v_changes || jsonb_build_object(
      'title', jsonb_build_object('before', v_action_row.title, 'after', v_title)
    );
    v_changed_fields := v_changed_fields || jsonb_build_array('title');
  END IF;
  IF v_description IS DISTINCT FROM v_action_row.description THEN
    v_changes := v_changes || jsonb_build_object(
      'description', jsonb_build_object('before', v_action_row.description, 'after', v_description)
    );
    v_changed_fields := v_changed_fields || jsonb_build_array('description');
  END IF;
  IF p_action_type IS DISTINCT FROM v_action_row.action_type THEN
    v_changes := v_changes || jsonb_build_object(
      'action_type', jsonb_build_object('before', v_action_row.action_type, 'after', p_action_type)
    );
    v_changed_fields := v_changed_fields || jsonb_build_array('action_type');
  END IF;
  IF v_owner_row.id IS DISTINCT FROM v_action_row.owner_profile_id THEN
    v_changes := v_changes || jsonb_build_object(
      'owner_profile_id', jsonb_build_object('before', v_action_row.owner_profile_id, 'after', v_owner_row.id)
    );
    v_changed_fields := v_changed_fields || jsonb_build_array('owner_profile_id');
  END IF;
  IF p_due_date IS DISTINCT FROM v_action_row.due_date THEN
    v_changes := v_changes || jsonb_build_object(
      'due_date', jsonb_build_object('before', v_action_row.due_date, 'after', p_due_date)
    );
    v_changed_fields := v_changed_fields || jsonb_build_array('due_date');
  END IF;

  v_old_version := v_action_row.version;

  UPDATE public.review_actions ra
    SET title = v_title,
        description = v_description,
        action_type = p_action_type,
        owner_profile_id = v_owner_row.id,
        due_date = p_due_date,
        version = ra.version + 1,
        updated_at = NOW()
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    RETURNING * INTO v_action_row;

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
    'ACTION',
    v_action_row.id,
    'ACTION_UPDATED',
    v_changes,
    v_old_version,
    v_action_row.version
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
    'ACTION_UPDATED',
    v_actor_profile_id,
    jsonb_build_object(
      'action_id', v_action_row.id,
      'sequence', v_action_row.sequence,
      'title', v_action_row.title,
      'changed_fields', v_changed_fields
    ),
    v_action_row.version
  );

  v_data := jsonb_build_object(
    'id', v_action_row.id,
    'review_id', v_action_row.review_id,
    'sequence', v_action_row.sequence,
    'status', v_action_row.status,
    'version', v_action_row.version,
    'updated_at', v_action_row.updated_at,
    'completed_at', v_action_row.completed_at,
    'verified_at', v_action_row.verified_at,
    'cancelled_at', v_action_row.cancelled_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', v_data
  );
END;
$$;

-- ============ 3. RPC: review_action_start ============
CREATE OR REPLACE FUNCTION public.review_action_start(
  p_review_id UUID,
  p_action_id UUID,
  p_expected_version INTEGER
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
  v_action_row public.review_actions%ROWTYPE;
  v_old_version INTEGER;
  v_data JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF v_actor_role IS NULL OR v_actor_role = 'viewer' THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  IF v_review_row.status NOT IN ('draft', 'submitted') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改改善行动');
  END IF;

  SELECT ra.* INTO v_action_row
    FROM public.review_actions ra
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Action not found');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND v_action_row.owner_profile_id = v_actor_profile_id
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_action_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_action_row.status <> 'OPEN' THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许开始行动');
  END IF;

  v_old_version := v_action_row.version;

  UPDATE public.review_actions ra
    SET status = 'IN_PROGRESS',
        version = ra.version + 1,
        updated_at = NOW()
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    RETURNING * INTO v_action_row;

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
    'ACTION',
    v_action_row.id,
    'ACTION_STARTED',
    jsonb_build_object(
      'status', jsonb_build_object('before', 'OPEN', 'after', 'IN_PROGRESS')
    ),
    v_old_version,
    v_action_row.version
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
    'ACTION_STARTED',
    v_actor_profile_id,
    jsonb_build_object(
      'action_id', v_action_row.id,
      'sequence', v_action_row.sequence,
      'title', v_action_row.title
    ),
    v_action_row.version
  );

  v_data := jsonb_build_object(
    'id', v_action_row.id,
    'review_id', v_action_row.review_id,
    'sequence', v_action_row.sequence,
    'status', v_action_row.status,
    'version', v_action_row.version,
    'updated_at', v_action_row.updated_at,
    'completed_at', v_action_row.completed_at,
    'verified_at', v_action_row.verified_at,
    'cancelled_at', v_action_row.cancelled_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', v_data
  );
END;
$$;

-- ============ 4. RPC: review_action_submit_for_verification ============
CREATE OR REPLACE FUNCTION public.review_action_submit_for_verification(
  p_review_id UUID,
  p_action_id UUID,
  p_expected_version INTEGER,
  p_completion_note TEXT
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
  v_action_row public.review_actions%ROWTYPE;
  v_completion_note TEXT;
  v_old_status TEXT;
  v_old_completion_note TEXT;
  v_old_completed_at TIMESTAMPTZ;
  v_old_version INTEGER;
  v_data JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF v_actor_role IS NULL OR v_actor_role = 'viewer' THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  IF v_review_row.status NOT IN ('draft', 'submitted') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改改善行动');
  END IF;

  SELECT ra.* INTO v_action_row
    FROM public.review_actions ra
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Action not found');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND v_action_row.owner_profile_id = v_actor_profile_id
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_action_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_action_row.status NOT IN ('OPEN', 'IN_PROGRESS') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许提交验证');
  END IF;

  v_completion_note := btrim(p_completion_note);
  IF v_completion_note IS NULL OR v_completion_note = '' OR char_length(v_completion_note) > 5000 THEN
    RETURN public.review_rpc_error('INVALID_INPUT', '完成说明必须是非空文本且不超过5000字符');
  END IF;

  v_old_status := v_action_row.status;
  v_old_completion_note := v_action_row.completion_note;
  v_old_completed_at := v_action_row.completed_at;
  v_old_version := v_action_row.version;

  UPDATE public.review_actions ra
    SET status = 'PENDING_VERIFICATION',
        completion_note = v_completion_note,
        completed_at = NOW(),
        version = ra.version + 1,
        updated_at = NOW()
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    RETURNING * INTO v_action_row;

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
    'ACTION',
    v_action_row.id,
    'ACTION_SUBMITTED_FOR_VERIFICATION',
    jsonb_build_object(
      'status', jsonb_build_object('before', v_old_status, 'after', 'PENDING_VERIFICATION'),
      'completion_note', jsonb_build_object('before', v_old_completion_note, 'after', v_completion_note),
      'completed_at', jsonb_build_object('before', v_old_completed_at, 'after', v_action_row.completed_at)
    ),
    v_old_version,
    v_action_row.version
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
    'ACTION_SUBMITTED_FOR_VERIFICATION',
    v_actor_profile_id,
    jsonb_build_object(
      'action_id', v_action_row.id,
      'sequence', v_action_row.sequence,
      'title', v_action_row.title
    ),
    v_action_row.version
  );

  v_data := jsonb_build_object(
    'id', v_action_row.id,
    'review_id', v_action_row.review_id,
    'sequence', v_action_row.sequence,
    'status', v_action_row.status,
    'version', v_action_row.version,
    'updated_at', v_action_row.updated_at,
    'completed_at', v_action_row.completed_at,
    'verified_at', v_action_row.verified_at,
    'cancelled_at', v_action_row.cancelled_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', v_data
  );
END;
$$;

-- ============ 5. RPC: review_action_verify ============
CREATE OR REPLACE FUNCTION public.review_action_verify(
  p_review_id UUID,
  p_action_id UUID,
  p_expected_version INTEGER,
  p_verification_note TEXT DEFAULT NULL
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
  v_action_row public.review_actions%ROWTYPE;
  v_verification_note TEXT;
  v_old_status TEXT;
  v_old_verification_note TEXT;
  v_old_verified_by_profile_id UUID;
  v_old_verified_at TIMESTAMPTZ;
  v_old_version INTEGER;
  v_data JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF v_actor_role IS NULL OR v_actor_role = 'viewer' THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  IF v_review_row.status NOT IN ('draft', 'submitted') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改改善行动');
  END IF;

  SELECT ra.* INTO v_action_row
    FROM public.review_actions ra
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Action not found');
  END IF;

  IF v_actor_profile_id = v_action_row.owner_profile_id THEN
    RETURN public.review_rpc_error('SELF_VERIFICATION_FORBIDDEN', '负责人不能验证自己的行动');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR (
          v_review_row.pmo_id IS NOT NULL
          AND v_review_row.pmo_id = v_actor_profile_id
        )
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_action_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_action_row.status <> 'PENDING_VERIFICATION' THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许验证');
  END IF;

  IF p_verification_note IS NULL THEN
    v_verification_note := NULL;
  ELSE
    v_verification_note := btrim(p_verification_note);
    IF v_verification_note = '' THEN
      v_verification_note := NULL;
    ELSIF char_length(v_verification_note) > 5000 THEN
      RETURN public.review_rpc_error('INVALID_INPUT', '验证反馈不能超过5000字符');
    END IF;
  END IF;

  v_old_status := v_action_row.status;
  v_old_verification_note := v_action_row.verification_note;
  v_old_verified_by_profile_id := v_action_row.verified_by_profile_id;
  v_old_verified_at := v_action_row.verified_at;
  v_old_version := v_action_row.version;

  UPDATE public.review_actions ra
    SET status = 'VERIFIED',
        verification_note = v_verification_note,
        verified_by_profile_id = v_actor_profile_id,
        verified_at = NOW(),
        version = ra.version + 1,
        updated_at = NOW()
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    RETURNING * INTO v_action_row;

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
    'ACTION',
    v_action_row.id,
    'ACTION_VERIFIED',
    jsonb_build_object(
      'status', jsonb_build_object('before', v_old_status, 'after', 'VERIFIED'),
      'verification_note', jsonb_build_object('before', v_old_verification_note, 'after', v_verification_note),
      'verified_by_profile_id', jsonb_build_object('before', v_old_verified_by_profile_id, 'after', v_action_row.verified_by_profile_id),
      'verified_at', jsonb_build_object('before', v_old_verified_at, 'after', v_action_row.verified_at)
    ),
    v_old_version,
    v_action_row.version
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
    'ACTION_VERIFIED',
    v_actor_profile_id,
    jsonb_build_object(
      'action_id', v_action_row.id,
      'sequence', v_action_row.sequence,
      'title', v_action_row.title
    ),
    v_action_row.version
  );

  v_data := jsonb_build_object(
    'id', v_action_row.id,
    'review_id', v_action_row.review_id,
    'sequence', v_action_row.sequence,
    'status', v_action_row.status,
    'version', v_action_row.version,
    'updated_at', v_action_row.updated_at,
    'completed_at', v_action_row.completed_at,
    'verified_at', v_action_row.verified_at,
    'cancelled_at', v_action_row.cancelled_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', v_data
  );
END;
$$;

-- ============ 6. RPC: review_action_return ============
CREATE OR REPLACE FUNCTION public.review_action_return(
  p_review_id UUID,
  p_action_id UUID,
  p_expected_version INTEGER,
  p_reason TEXT
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
  v_action_row public.review_actions%ROWTYPE;
  v_reason TEXT;
  v_old_status TEXT;
  v_old_verification_note TEXT;
  v_old_completed_at TIMESTAMPTZ;
  v_old_verified_by_profile_id UUID;
  v_old_verified_at TIMESTAMPTZ;
  v_old_version INTEGER;
  v_data JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF v_actor_role IS NULL OR v_actor_role = 'viewer' THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  IF v_review_row.status NOT IN ('draft', 'submitted') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改改善行动');
  END IF;

  SELECT ra.* INTO v_action_row
    FROM public.review_actions ra
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Action not found');
  END IF;

  IF v_actor_profile_id = v_action_row.owner_profile_id THEN
    RETURN public.review_rpc_error('SELF_VERIFICATION_FORBIDDEN', '负责人不能退回自己的行动');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR (
          v_review_row.pmo_id IS NOT NULL
          AND v_review_row.pmo_id = v_actor_profile_id
        )
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_action_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_action_row.status <> 'PENDING_VERIFICATION' THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许退回');
  END IF;

  v_reason := btrim(p_reason);
  IF v_reason IS NULL OR v_reason = '' OR char_length(v_reason) > 5000 THEN
    RETURN public.review_rpc_error('INVALID_REASON', '退回原因必须是非空文本且不超过5000字符');
  END IF;

  v_old_status := v_action_row.status;
  v_old_verification_note := v_action_row.verification_note;
  v_old_completed_at := v_action_row.completed_at;
  v_old_verified_by_profile_id := v_action_row.verified_by_profile_id;
  v_old_verified_at := v_action_row.verified_at;
  v_old_version := v_action_row.version;

  UPDATE public.review_actions ra
    SET status = 'IN_PROGRESS',
        verification_note = v_reason,
        completed_at = NULL,
        verified_by_profile_id = NULL,
        verified_at = NULL,
        version = ra.version + 1,
        updated_at = NOW()
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    RETURNING * INTO v_action_row;

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
    'ACTION',
    v_action_row.id,
    'ACTION_RETURNED',
    jsonb_build_object(
      'status', jsonb_build_object('before', v_old_status, 'after', 'IN_PROGRESS'),
      'verification_note', jsonb_build_object('before', v_old_verification_note, 'after', v_reason),
      'completed_at', jsonb_build_object('before', v_old_completed_at, 'after', v_action_row.completed_at),
      'verified_by_profile_id', jsonb_build_object('before', v_old_verified_by_profile_id, 'after', v_action_row.verified_by_profile_id),
      'verified_at', jsonb_build_object('before', v_old_verified_at, 'after', v_action_row.verified_at)
    ),
    v_old_version,
    v_action_row.version
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
    'ACTION_RETURNED',
    v_actor_profile_id,
    jsonb_build_object(
      'action_id', v_action_row.id,
      'sequence', v_action_row.sequence,
      'title', v_action_row.title
    ),
    v_action_row.version
  );

  v_data := jsonb_build_object(
    'id', v_action_row.id,
    'review_id', v_action_row.review_id,
    'sequence', v_action_row.sequence,
    'status', v_action_row.status,
    'version', v_action_row.version,
    'updated_at', v_action_row.updated_at,
    'completed_at', v_action_row.completed_at,
    'verified_at', v_action_row.verified_at,
    'cancelled_at', v_action_row.cancelled_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', v_data
  );
END;
$$;

-- ============ 7. RPC: review_action_cancel ============
CREATE OR REPLACE FUNCTION public.review_action_cancel(
  p_review_id UUID,
  p_action_id UUID,
  p_expected_version INTEGER,
  p_reason TEXT
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
  v_action_row public.review_actions%ROWTYPE;
  v_reason TEXT;
  v_old_status TEXT;
  v_old_cancelled_at TIMESTAMPTZ;
  v_old_cancel_reason TEXT;
  v_old_completed_at TIMESTAMPTZ;
  v_old_verified_by_profile_id UUID;
  v_old_verified_at TIMESTAMPTZ;
  v_old_version INTEGER;
  v_data JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF v_actor_role IS NULL OR v_actor_role = 'viewer' THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  IF v_review_row.status NOT IN ('draft', 'submitted') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改改善行动');
  END IF;

  SELECT ra.* INTO v_action_row
    FROM public.review_actions ra
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Action not found');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR (
          v_review_row.pmo_id IS NOT NULL
          AND v_review_row.pmo_id = v_actor_profile_id
        )
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_action_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_action_row.status NOT IN ('OPEN', 'IN_PROGRESS', 'PENDING_VERIFICATION') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许取消');
  END IF;

  v_reason := btrim(p_reason);
  IF v_reason IS NULL OR v_reason = '' OR char_length(v_reason) > 1000 THEN
    RETURN public.review_rpc_error('INVALID_REASON', '取消原因必须是非空文本且不超过1000字符');
  END IF;

  v_old_status := v_action_row.status;
  v_old_cancelled_at := v_action_row.cancelled_at;
  v_old_cancel_reason := v_action_row.cancel_reason;
  v_old_completed_at := v_action_row.completed_at;
  v_old_verified_by_profile_id := v_action_row.verified_by_profile_id;
  v_old_verified_at := v_action_row.verified_at;
  v_old_version := v_action_row.version;

  UPDATE public.review_actions ra
    SET status = 'CANCELLED',
        cancelled_at = NOW(),
        cancel_reason = v_reason,
        completed_at = NULL,
        verified_by_profile_id = NULL,
        verified_at = NULL,
        version = ra.version + 1,
        updated_at = NOW()
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    RETURNING * INTO v_action_row;

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
    'ACTION',
    v_action_row.id,
    'ACTION_CANCELLED',
    jsonb_build_object(
      'status', jsonb_build_object('before', v_old_status, 'after', 'CANCELLED'),
      'cancelled_at', jsonb_build_object('before', v_old_cancelled_at, 'after', v_action_row.cancelled_at),
      'cancel_reason', jsonb_build_object('before', v_old_cancel_reason, 'after', v_action_row.cancel_reason),
      'completed_at', jsonb_build_object('before', v_old_completed_at, 'after', v_action_row.completed_at),
      'verified_by_profile_id', jsonb_build_object('before', v_old_verified_by_profile_id, 'after', v_action_row.verified_by_profile_id),
      'verified_at', jsonb_build_object('before', v_old_verified_at, 'after', v_action_row.verified_at)
    ),
    v_old_version,
    v_action_row.version
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
    'ACTION_CANCELLED',
    v_actor_profile_id,
    jsonb_build_object(
      'action_id', v_action_row.id,
      'sequence', v_action_row.sequence,
      'title', v_action_row.title
    ),
    v_action_row.version
  );

  v_data := jsonb_build_object(
    'id', v_action_row.id,
    'review_id', v_action_row.review_id,
    'sequence', v_action_row.sequence,
    'status', v_action_row.status,
    'version', v_action_row.version,
    'updated_at', v_action_row.updated_at,
    'completed_at', v_action_row.completed_at,
    'verified_at', v_action_row.verified_at,
    'cancelled_at', v_action_row.cancelled_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', v_data
  );
END;
$$;

-- ============ 8. RPC: review_close with CAPA prerequisite ============
CREATE OR REPLACE FUNCTION public.review_close(
  p_review_id UUID,
  p_expected_version INTEGER
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
  v_old_version INTEGER;
  v_new_version INTEGER;
  v_submitted_at TIMESTAMPTZ;
  v_closed_at TIMESTAMPTZ;
  v_open_action_count INTEGER;
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

  IF v_actor_role NOT IN ('admin', 'manager') THEN
    RETURN public.review_rpc_error('FORBIDDEN', '仅管理员或主管可关闭复盘');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_review_row.status = 'closed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', jsonb_build_object(
        'status', v_review_row.status,
        'version', v_review_row.version,
        'submitted_at', v_review_row.submitted_at,
        'closed_at', v_review_row.closed_at
      )
    );
  END IF;

  IF v_review_row.status <> 'submitted' THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许关闭');
  END IF;

  SELECT COUNT(*) INTO v_open_action_count
    FROM public.review_actions ra
    WHERE ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
      AND ra.status NOT IN ('VERIFIED', 'CANCELLED');

  IF v_open_action_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'OPEN_ACTIONS_EXIST',
      'message', '存在未完成的改善行动，暂不能关闭复盘',
      'data', jsonb_build_object('openActionCount', v_open_action_count)
    );
  END IF;

  v_old_version := v_review_row.version;

  UPDATE public.review_cases rc
    SET status = 'closed',
        closed_at = NOW(),
        closed_by = v_actor_profile_id,
        version = rc.version + 1,
        updated_at = NOW()
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING version, submitted_at, closed_at
    INTO v_new_version, v_submitted_at, v_closed_at;

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
    'REVIEW_CLOSED',
    jsonb_build_object(
      'status',
      jsonb_build_object('before', 'submitted', 'after', 'closed')
    ),
    v_old_version,
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
    'REVIEW_CLOSED',
    v_actor_profile_id,
    jsonb_build_object('from_status', 'submitted', 'to_status', 'closed'),
    v_new_version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'status', 'closed',
      'version', v_new_version,
      'submitted_at', v_submitted_at,
      'closed_at', v_closed_at
    )
  );
END;
$$;

-- ============ 9. Function execute grants ============
REVOKE ALL ON FUNCTION public.review_action_create(UUID, TEXT, TEXT, TEXT, UUID, DATE)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_action_update(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, UUID, DATE)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_action_start(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_action_submit_for_verification(UUID, UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_action_verify(UUID, UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_action_return(UUID, UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_action_cancel(UUID, UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.review_action_create(UUID, TEXT, TEXT, TEXT, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_action_update(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_action_start(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_action_submit_for_verification(UUID, UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_action_verify(UUID, UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_action_return(UUID, UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_action_cancel(UUID, UUID, INTEGER, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.review_close(UUID, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_close(UUID, INTEGER) TO authenticated;

COMMIT;
