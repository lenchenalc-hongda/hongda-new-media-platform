BEGIN;

-- Disposable PostgreSQL 17 only. Applies the four exact Production function
-- definitions whose historical source differs by formatting/search_path, or
-- whose bodies/functions were manually edited outside the recorded lineage.
DO $guard$
BEGIN
  IF current_database() <> 'wos_p8_replay_ci'
    OR (SELECT count(*) FROM auth.users) <> 0
    OR (
      SELECT count(*)
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ) <> 67
  THEN
    RAISE EXCEPTION 'WOS_P8_HISTORICAL_FUNCTION_COMPENSATION_GUARD_FAILED';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.auth_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.review_reopen(p_review_id uuid, p_expected_version integer, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
      RETURN public.review_rpc_error(
        'INVALID_REASON',
        '退回或重新打开原因过长'
      );
    END IF;
  END IF;

  SELECT rc.*
    INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_actor_role NOT IN ('admin', 'manager') THEN
    RETURN public.review_rpc_error(
      'FORBIDDEN',
      '仅管理员或主管可重新打开复盘'
    );
  END IF;

  IF p_expected_version IS NULL
    OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error(
      'VERSION_CONFLICT',
      '版本已变化'
    );
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

  IF v_review_row.status = 'closed'
    AND v_actor_role <> 'admin' THEN
    RETURN public.review_rpc_error(
      'FORBIDDEN',
      '仅管理员可重新打开已关闭复盘'
    );
  END IF;

  IF v_review_row.status IN ('submitted', 'closed')
    AND (v_reason IS NULL OR v_reason = '') THEN
    RETURN public.review_rpc_error(
      'INVALID_REASON',
      CASE
        WHEN v_review_row.status = 'submitted'
          THEN '退回修改必须填写原因'
        ELSE '重新打开必须填写原因'
      END
    );
  END IF;

  IF v_review_row.status NOT IN ('submitted', 'closed') THEN
    RETURN public.review_rpc_error(
      'INVALID_TRANSITION',
      '当前状态不允许重新打开'
    );
  END IF;

  v_old_version := v_review_row.version;
  v_from_status := v_review_row.status;

  v_changes := jsonb_build_object(
    'status',
    jsonb_build_object(
      'before', v_from_status,
      'after', 'draft'
    )
  );

  v_payload := jsonb_build_object(
    'from_status', v_from_status,
    'to_status', 'draft'
  );

  IF v_reason IS NOT NULL
    AND v_reason <> '' THEN
    v_changes :=
      v_changes || jsonb_build_object(
        'reason',
        v_reason
      );

    v_payload :=
      v_payload || jsonb_build_object(
        'reason',
        v_reason
      );
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
      RETURNING
        version,
        submitted_at,
        closed_at
      INTO
        v_new_version,
        v_submitted_at,
        v_closed_at;

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
      RETURNING
        version,
        submitted_at,
        closed_at
      INTO
        v_new_version,
        v_submitted_at,
        v_closed_at;

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
$function$
;

CREATE OR REPLACE FUNCTION public.review_submit(p_review_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_old_version INTEGER;
  v_new_version INTEGER;
  v_submitted_at TIMESTAMPTZ;
  v_closed_at TIMESTAMPTZ;
  v_missing_fields TEXT[] := '{}'::TEXT[];
  v_missing_dimensions TEXT[] := '{}'::TEXT[];
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

  IF p_expected_version IS NULL
    OR p_expected_version <> v_review_row.version THEN
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
    RETURN public.review_rpc_error(
      'INVALID_TRANSITION',
      '当前状态不允许提交'
    );
  END IF;

  IF v_review_row.title IS NULL
    OR btrim(v_review_row.title) = '' THEN
    v_missing_fields := array_append(
      v_missing_fields,
      'title'
    );
  END IF;

  IF v_review_row.review_type IS NULL
    OR v_review_row.review_type NOT IN ('A', 'B', 'C') THEN
    v_missing_fields := array_append(
      v_missing_fields,
      'review_type'
    );
  END IF;

  IF v_review_row.description IS NULL
    OR btrim(v_review_row.description) = '' THEN
    v_missing_fields := array_append(
      v_missing_fields,
      'description'
    );
  END IF;

  IF v_review_row.risk_level IS NULL THEN
    v_missing_fields := array_append(
      v_missing_fields,
      'risk_level'
    );
  END IF;

  IF v_review_row.risk_level IN ('RED', 'YELLOW')
    AND (
      v_review_row.risk_reason IS NULL
      OR btrim(v_review_row.risk_reason) = ''
    ) THEN
    v_missing_fields := array_append(
      v_missing_fields,
      'risk_reason'
    );
  END IF;

  IF v_review_row.owner_id IS NULL THEN
    v_missing_fields := array_append(
      v_missing_fields,
      'owner_id'
    );
  END IF;

  PERFORM 1
    FROM public.review_type_details d
    WHERE d.review_id = p_review_id
      AND d.org_id = v_actor_org_id;

  IF NOT FOUND THEN
    v_missing_fields := array_append(
      v_missing_fields,
      'type_details'
    );
  END IF;

  IF v_missing_fields <> '{}'::TEXT[] THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INCOMPLETE_REVIEW',
      'message', '复盘信息不完整',
      'data', jsonb_build_object(
        'missing_fields',
        to_jsonb(v_missing_fields)
      )
    );
  END IF;

  v_missing_dimensions := public.review_metadata_submit_missing(
    p_review_id,
    v_actor_org_id
  );

  IF v_missing_dimensions <> '{}'::TEXT[] THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'METADATA_INCOMPLETE',
      'message', '复盘分类信息不完整，暂不能提交',
      'data', jsonb_build_object(
        'missingDimensions',
        to_jsonb(v_missing_dimensions)
      )
    );
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
    RETURNING
      version,
      submitted_at,
      closed_at
    INTO
      v_new_version,
      v_submitted_at,
      v_closed_at;

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
      jsonb_build_object(
        'before', 'draft',
        'after', 'submitted'
      )
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
    jsonb_build_object(
      'from_status', 'draft',
      'to_status', 'submitted'
    ),
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_site_data_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $function$
;

GRANT EXECUTE ON FUNCTION
  public.review_event_actor_directory(uuid, text)
TO service_role;

COMMIT;

SELECT 'WOS_P8_HISTORICAL_FUNCTION_COMPENSATION=PASS' AS check_name;
