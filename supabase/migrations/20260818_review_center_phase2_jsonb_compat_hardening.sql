-- 宏达项目复盘与改善中心 - Phase 2C.1 JSONB Compatibility Hardening
-- Purpose: replace the unavailable jsonb_object_length(jsonb) call inside
--          review_upsert_type_details with direct jsonb empty-object checks.
-- Safety: no DROP TABLE, TRUNCATE, DELETE, UPDATE of business rows, no seed.

BEGIN;

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
      AND v_additional_notes <> '{}'::jsonb
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

REVOKE EXECUTE ON FUNCTION public.review_upsert_type_details(UUID, INTEGER, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_upsert_type_details(UUID, INTEGER, JSONB)
  TO authenticated;

COMMIT;
