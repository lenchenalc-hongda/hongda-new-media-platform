-- 宏达项目复盘与改善中心 - Phase 2M.1
-- Lifecycle Foundation
-- Scope: submitted authority metadata, explicit submit/close/reopen RPCs,
--        audit/timeline status events.
-- Review CLOSED is a review lifecycle state only; it is not a production,
-- quality, or shipment release.

BEGIN;

-- ============ 1. submitted authority metadata ============
ALTER TABLE public.review_cases
  ADD COLUMN submitted_at TIMESTAMPTZ,
  ADD COLUMN submitted_by_profile_id UUID;

ALTER TABLE public.review_cases
  ADD CONSTRAINT fk_review_cases_submitted_by_org
    FOREIGN KEY (submitted_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id);

ALTER TABLE public.review_cases
  ADD CONSTRAINT chk_review_cases_submitted_pair CHECK (
    (submitted_at IS NULL AND submitted_by_profile_id IS NULL)
    OR
    (submitted_at IS NOT NULL AND submitted_by_profile_id IS NOT NULL)
  );

-- Only lock down the MVP statuses. The other six legacy statuses keep the
-- freedom to retain submitted metadata in future phases.
ALTER TABLE public.review_cases
  ADD CONSTRAINT chk_review_cases_submitted_status CHECK (
    (status IN ('submitted', 'closed')
      AND submitted_at IS NOT NULL
      AND submitted_by_profile_id IS NOT NULL)
    OR
    (status = 'draft'
      AND submitted_at IS NULL
      AND submitted_by_profile_id IS NULL)
    OR
    (status NOT IN ('draft', 'submitted', 'closed'))
  );

CREATE INDEX idx_review_cases_org_status_submitted_at
  ON public.review_cases(org_id, status, submitted_at DESC)
  WHERE submitted_at IS NOT NULL;

-- ============ 2. RPC: review_submit ============
CREATE OR REPLACE FUNCTION public.review_submit(
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
    RETURN public.review_rpc_error('FORBIDDEN', '无提交权限');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_review_row.status = 'submitted' THEN
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

  IF v_review_row.status <> 'draft' THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许提交');
  END IF;

  IF btrim(v_review_row.title) = '' THEN
    RETURN public.review_rpc_error('INCOMPLETE_REVIEW', '复盘信息不完整');
  END IF;
  IF v_review_row.review_type NOT IN ('A', 'B', 'C') THEN
    RETURN public.review_rpc_error('INCOMPLETE_REVIEW', '复盘信息不完整');
  END IF;
  IF v_review_row.description IS NULL OR btrim(v_review_row.description) = '' THEN
    RETURN public.review_rpc_error('INCOMPLETE_REVIEW', '复盘信息不完整');
  END IF;
  IF v_review_row.risk_level IS NULL THEN
    RETURN public.review_rpc_error('INCOMPLETE_REVIEW', '复盘信息不完整');
  END IF;
  IF v_review_row.risk_level IN ('RED', 'YELLOW')
    AND (v_review_row.risk_reason IS NULL OR btrim(v_review_row.risk_reason) = '') THEN
    RETURN public.review_rpc_error('INCOMPLETE_REVIEW', '复盘信息不完整');
  END IF;
  IF v_review_row.owner_id IS NULL THEN
    RETURN public.review_rpc_error('INCOMPLETE_REVIEW', '复盘信息不完整');
  END IF;

  PERFORM 1
    FROM public.review_type_details d
    WHERE d.review_id = p_review_id
      AND d.org_id = v_actor_org_id;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('INCOMPLETE_REVIEW', '复盘信息不完整');
  END IF;

  v_old_version := v_review_row.version;

  UPDATE public.review_cases rc
    SET status = 'submitted',
        submitted_at = NOW(),
        submitted_by_profile_id = v_actor_profile_id,
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
    'REVIEW_SUBMITTED',
    jsonb_build_object(
      'status',
      jsonb_build_object('before', 'draft', 'after', 'submitted')
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
    'REVIEW_SUBMITTED',
    v_actor_profile_id,
    jsonb_build_object('from_status', 'draft', 'to_status', 'submitted'),
    v_new_version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'status', 'submitted',
      'version', v_new_version,
      'submitted_at', v_submitted_at,
      'closed_at', v_closed_at
    )
  );
END;
$$;

-- ============ 3. RPC: review_close ============
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

-- ============ 4. RPC: review_reopen ============
CREATE OR REPLACE FUNCTION public.review_reopen(
  p_review_id UUID,
  p_expected_version INTEGER,
  p_reason TEXT DEFAULT NULL
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
  v_reason TEXT := NULL;
  v_from_status TEXT;
  v_changes JSONB;
  v_payload JSONB;
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

  IF p_reason IS NOT NULL THEN
    v_reason := btrim(p_reason);
    IF length(v_reason) > 1000 THEN
      RETURN public.review_rpc_error('INVALID_REASON', '重新打开理由过长');
    END IF;
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
    RETURN public.review_rpc_error('FORBIDDEN', '仅管理员或主管可重新打开复盘');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_review_row.status = 'draft' THEN
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

  IF v_review_row.status = 'closed' AND v_actor_role <> 'admin' THEN
    RETURN public.review_rpc_error('FORBIDDEN', '仅管理员可重新打开已关闭复盘');
  END IF;

  IF v_review_row.status = 'closed'
    AND (v_reason IS NULL OR v_reason = '') THEN
    RETURN public.review_rpc_error('INVALID_REASON', '关闭的复盘重新打开必须填写理由');
  END IF;

  IF v_review_row.status NOT IN ('submitted', 'closed') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许重新打开');
  END IF;

  v_old_version := v_review_row.version;
  v_from_status := v_review_row.status;
  v_changes := jsonb_build_object(
    'status',
    jsonb_build_object('before', v_from_status, 'after', 'draft')
  );
  v_payload := jsonb_build_object(
    'from_status', v_from_status,
    'to_status', 'draft'
  );
  IF v_reason IS NOT NULL AND v_reason <> '' THEN
    v_changes := v_changes || jsonb_build_object('reason', v_reason);
    v_payload := v_payload || jsonb_build_object('reason', v_reason);
  END IF;

  IF v_from_status = 'submitted' THEN
    UPDATE public.review_cases rc
      SET status = 'draft',
          submitted_at = NULL,
          submitted_by_profile_id = NULL,
          version = rc.version + 1,
          updated_at = NOW()
      WHERE rc.id = p_review_id
        AND rc.org_id = v_actor_org_id
      RETURNING version, submitted_at, closed_at
      INTO v_new_version, v_submitted_at, v_closed_at;
  ELSE
    UPDATE public.review_cases rc
      SET status = 'draft',
          submitted_at = NULL,
          submitted_by_profile_id = NULL,
          closed_at = NULL,
          closed_by = NULL,
          version = rc.version + 1,
          updated_at = NOW()
      WHERE rc.id = p_review_id
        AND rc.org_id = v_actor_org_id
      RETURNING version, submitted_at, closed_at
      INTO v_new_version, v_submitted_at, v_closed_at;
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
    'REVIEW_REOPENED',
    v_changes,
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
    'REVIEW_REOPENED',
    v_actor_profile_id,
    v_payload,
    v_new_version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'status', 'draft',
      'version', v_new_version,
      'submitted_at', v_submitted_at,
      'closed_at', v_closed_at
    )
  );
END;
$$;

-- ============ 5. Function execute grants ============
REVOKE EXECUTE ON FUNCTION public.review_submit(UUID, INTEGER)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_close(UUID, INTEGER)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_reopen(UUID, INTEGER, TEXT)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.review_submit(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_close(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_reopen(UUID, INTEGER, TEXT) TO authenticated;

COMMIT;
