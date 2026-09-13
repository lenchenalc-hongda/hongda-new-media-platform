-- 宏达项目复盘与改善中心 - Phase 2M.1a
-- Lifecycle Permission NULL-Safety Fix
-- Scope: replace review_submit with a strict boolean authorization predicate.
-- Root cause: when pmo_id is NULL, `owner_id = actor OR pmo_id = actor`
-- evaluates to NULL, and `IF NOT (NULL)` is treated as false by PL/pgSQL,
-- allowing non-owner/non-pmo non-viewer callers to pass the permission gate.
-- This migration only changes review_submit; review_close and review_reopen
-- already use non-null role checks and have no equivalent NULL boolean risk.

BEGIN;

-- ============ 1. RPC: review_submit (NULL-safe permission) ============
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

  IF NOT COALESCE(
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND v_actor_profile_id IS NOT NULL
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR (
          v_review_row.pmo_id IS NOT NULL
          AND v_review_row.pmo_id = v_actor_profile_id
        )
      )
    ),
    FALSE
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

-- ============ 2. Function execute grants ============
REVOKE EXECUTE ON FUNCTION public.review_submit(UUID, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_submit(UUID, INTEGER) TO authenticated;

COMMIT;
