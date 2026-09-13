-- 宏达项目复盘与改善中心 - Phase 2R.7C
-- Case Mutation & Publication Foundation Migration B
-- Scope: Case private helpers, 10 public Case RPCs, function grants.
-- Safety: no new tables, no ALTER TABLE on Case Core/Metadata,
--         no API/UI, no data inserts, no Production.

BEGIN;

-- ============ 1. Private helper: case number allocator ============
CREATE FUNCTION public.review_case_allocate_number(
  p_org_id UUID,
  p_year INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_value INTEGER;
BEGIN
  INSERT INTO public.review_case_number_counters(org_id, year, last_value)
  VALUES (p_org_id, p_year, 1)
  ON CONFLICT (org_id, year)
  DO UPDATE SET last_value = public.review_case_number_counters.last_value + 1
  WHERE public.review_case_number_counters.last_value < 999999
  RETURNING last_value INTO v_value;

  IF v_value IS NULL THEN
    RETURN public.review_rpc_error('CASE_NUMBER_EXHAUSTED', '编号已用尽');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'caseNo', 'CASE-' || p_year::text || '-' || lpad(v_value::text, 6, '0')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_case_allocate_number(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_case_allocate_number(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.review_case_allocate_number(UUID, INTEGER) FROM authenticated;

-- ============ 2. Private helper: publish metadata validator ============
CREATE FUNCTION public.review_case_validate_publish_metadata(
  p_review_id UUID,
  p_org_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_review_type TEXT;
  v_domains TEXT[];
  v_symptoms TEXT[];
  v_materials TEXT[];
  v_processes TEXT[];
  v_primary_count INTEGER;
  v_other_material TEXT;
  v_other_process TEXT;
  v_other_domain TEXT;
  v_other_symptom TEXT;
  v_missing TEXT[] := '{}'::TEXT[];
  v_invalid_dict BOOLEAN;
  v_domain_count INTEGER;
  v_symptom_count INTEGER;
  v_material_count INTEGER;
  v_process_count INTEGER;
BEGIN
  SELECT review_type
    INTO v_review_type
    FROM public.review_cases
   WHERE id = p_review_id
     AND org_id = p_org_id;

  IF v_review_type IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.review_metadata_items mi
      JOIN public.review_dict_items d
        ON d.id = mi.dict_item_id
       AND d.dict_type = mi.metadata_type
     WHERE mi.review_id = p_review_id
       AND mi.org_id = p_org_id
       AND (
         d.org_id IS NOT NULL
         OR d.is_system = FALSE
         OR d.enabled = FALSE
       )
  ) INTO v_invalid_dict;

  IF v_invalid_dict THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_DICTIONARY',
      'message', '包含无效分类字典',
      'data', null
    );
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE metadata_type = 'PROBLEM_DOMAIN'),
    COUNT(*) FILTER (WHERE metadata_type = 'PROBLEM_SYMPTOM'),
    COUNT(*) FILTER (WHERE metadata_type = 'MATERIAL'),
    COUNT(*) FILTER (WHERE metadata_type = 'PROCESS')
  INTO v_domain_count, v_symptom_count, v_material_count, v_process_count
  FROM public.review_metadata_items mi
  JOIN public.review_dict_items d
    ON d.id = mi.dict_item_id
   AND d.dict_type = mi.metadata_type
 WHERE mi.review_id = p_review_id
   AND mi.org_id = p_org_id;

  SELECT COALESCE(array_agg(d.code) FILTER (WHERE mi.metadata_type = 'PROBLEM_DOMAIN'), '{}'::TEXT[]),
         COALESCE(array_agg(d.code) FILTER (WHERE mi.metadata_type = 'PROBLEM_SYMPTOM'), '{}'::TEXT[]),
         COALESCE(array_agg(d.code) FILTER (WHERE mi.metadata_type = 'MATERIAL'), '{}'::TEXT[]),
         COALESCE(array_agg(d.code) FILTER (WHERE mi.metadata_type = 'PROCESS'), '{}'::TEXT[])
  INTO v_domains, v_symptoms, v_materials, v_processes
  FROM public.review_metadata_items mi
  JOIN public.review_dict_items d
    ON d.id = mi.dict_item_id
   AND d.dict_type = mi.metadata_type
 WHERE mi.review_id = p_review_id
   AND mi.org_id = p_org_id;

  SELECT COUNT(*) INTO v_primary_count
    FROM public.review_metadata_items
   WHERE review_id = p_review_id
     AND org_id = p_org_id
     AND metadata_type = 'MATERIAL'
     AND is_primary = TRUE;

  SELECT material_other_text, process_other_text,
         problem_domain_other_text, problem_symptom_other_text
    INTO v_other_material, v_other_process, v_other_domain, v_other_symptom
    FROM public.review_metadata
   WHERE review_id = p_review_id
     AND org_id = p_org_id;

  IF v_domain_count < 1 THEN
    v_missing := array_append(v_missing, 'PROBLEM_DOMAIN');
  END IF;
  IF v_symptom_count < 1 THEN
    v_missing := array_append(v_missing, 'PROBLEM_SYMPTOM');
  END IF;
  IF v_material_count > 0 AND v_primary_count <> 1 THEN
    v_missing := array_append(v_missing, 'PRIMARY_MATERIAL');
  END IF;
  IF v_review_type IN ('B', 'C') AND v_primary_count <> 1 THEN
    v_missing := array_append(v_missing, 'PRIMARY_MATERIAL');
  END IF;
  IF v_review_type IN ('B', 'C')
     AND v_domains && ARRAY['PROCESS', 'EQUIPMENT_FIXTURE', 'PLATE_FILM']
     AND v_process_count < 1 THEN
    v_missing := array_append(v_missing, 'PROCESS');
  END IF;
  IF 'OTHER' = ANY(v_materials) AND NULLIF(btrim(v_other_material), '') IS NULL THEN
    v_missing := array_append(v_missing, 'MATERIAL_OTHER_TEXT');
  END IF;
  IF 'OTHER' = ANY(v_processes) AND NULLIF(btrim(v_other_process), '') IS NULL THEN
    v_missing := array_append(v_missing, 'PROCESS_OTHER_TEXT');
  END IF;
  IF 'OTHER' = ANY(v_domains) AND NULLIF(btrim(v_other_domain), '') IS NULL THEN
    v_missing := array_append(v_missing, 'PROBLEM_DOMAIN_OTHER_TEXT');
  END IF;
  IF 'OTHER' = ANY(v_symptoms) AND NULLIF(btrim(v_other_symptom), '') IS NULL THEN
    v_missing := array_append(v_missing, 'PROBLEM_SYMPTOM_OTHER_TEXT');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'CASE_METADATA_INCOMPLETE',
      'message', '分类信息不完整',
      'data', jsonb_build_object('missingDimensions', v_missing)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'OK', 'data', null);
END;
$$;

REVOKE ALL ON FUNCTION public.review_case_validate_publish_metadata(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_case_validate_publish_metadata(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.review_case_validate_publish_metadata(UUID, UUID) FROM authenticated;

-- ============ 3. Private helper: snapshot replacer ============
CREATE FUNCTION public.review_case_replace_snapshot(
  p_case_id UUID,
  p_org_id UUID,
  p_review_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.review_knowledge_case_metadata_items
   WHERE case_id = p_case_id
     AND org_id = p_org_id;

  DELETE FROM public.review_knowledge_case_metadata
   WHERE case_id = p_case_id
     AND org_id = p_org_id;

  INSERT INTO public.review_knowledge_case_metadata (
    case_id, org_id, material_other_text, process_other_text,
    problem_domain_other_text, problem_symptom_other_text, refreshed_at
  )
  SELECT p_case_id, p_org_id, material_other_text, process_other_text,
         problem_domain_other_text, problem_symptom_other_text, NOW()
    FROM public.review_metadata
   WHERE review_id = p_review_id
     AND org_id = p_org_id;

  INSERT INTO public.review_knowledge_case_metadata_items (
    case_id, org_id, metadata_type, code, label_snapshot, is_primary
  )
  SELECT p_case_id, p_org_id, mi.metadata_type, d.code, d.label, mi.is_primary
    FROM public.review_metadata_items mi
    JOIN public.review_dict_items d
      ON d.id = mi.dict_item_id
     AND d.dict_type = mi.metadata_type
   WHERE mi.review_id = p_review_id
     AND mi.org_id = p_org_id
     AND d.org_id IS NULL
     AND d.is_system = TRUE
     AND d.enabled = TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.review_case_replace_snapshot(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_case_replace_snapshot(UUID, UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.review_case_replace_snapshot(UUID, UUID, UUID) FROM authenticated;

-- ============ 4. Private helper: safe mutation DTO ============
CREATE FUNCTION public.review_case_safe_mutation_dto(
  p_case_id UUID,
  p_org_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', id,
    'caseNo', case_no,
    'status', status,
    'version', version,
    'sourceReviewVersion', source_review_version
  ) INTO v_result
    FROM public.review_knowledge_cases
   WHERE id = p_case_id
     AND org_id = p_org_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.review_case_safe_mutation_dto(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_case_safe_mutation_dto(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.review_case_safe_mutation_dto(UUID, UUID) FROM authenticated;

-- ============ 5. Public RPC: create case from review ============
CREATE FUNCTION public.review_case_create_from_review(
  p_review_id UUID,
  p_expected_review_version INTEGER,
  p_title TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  v_review_status TEXT;
  v_review_version INTEGER;
  v_case_id UUID := gen_random_uuid();
  v_title TEXT;
  v_case_no TEXT;
  v_alloc JSONB;
  v_year INTEGER;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无权执行');
  END IF;

  SELECT status, version
    INTO v_review_status, v_review_version
    FROM public.review_cases
   WHERE id = p_review_id
     AND org_id = v_org_id
   FOR UPDATE;

  IF v_review_status IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;
  IF v_review_version IS DISTINCT FROM p_expected_review_version THEN
    RETURN public.review_rpc_error('SOURCE_VERSION_CONFLICT', '复盘版本已变化');
  END IF;
  IF v_review_status <> 'closed' THEN
    RETURN public.review_rpc_error('SOURCE_NOT_CLOSED', '复盘未关闭');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.review_knowledge_cases
    WHERE org_id = v_org_id AND source_review_id = p_review_id
  ) THEN
    RETURN public.review_rpc_error('ALREADY_EXISTS', '该复盘已有案例');
  END IF;

  v_title := NULLIF(btrim(p_title), '');
  IF v_title IS NULL OR length(v_title) > 200 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'CASE_CURATION_INCOMPLETE',
      'message', '案例标题不完整',
      'data', jsonb_build_object('missingFields', jsonb_build_array('TITLE'))
    );
  END IF;

  v_year := EXTRACT(YEAR FROM timezone('Asia/Shanghai', NOW()))::int;
  v_alloc := public.review_case_allocate_number(v_org_id, v_year);
  IF NOT COALESCE(v_alloc->>'ok', 'false') = 'true' THEN
    RETURN v_alloc;
  END IF;
  v_case_no := v_alloc->>'caseNo';

  INSERT INTO public.review_knowledge_cases (
    id, org_id, case_no, source_review_id, source_review_version,
    status, title, created_by_profile_id, version
  )
  VALUES (
    v_case_id, v_org_id, v_case_no, p_review_id, v_review_version,
    'DRAFT', v_title, v_actor_profile_id, 1
  );

  INSERT INTO public.review_case_audit_logs (
    org_id, case_id, actor_profile_id, action, changes,
    version_before, version_after
  )
  VALUES (
    v_org_id, v_case_id, v_actor_profile_id, 'CASE_CREATED',
    jsonb_build_object('status', 'DRAFT'), NULL, 1
  );

  RETURN public.review_case_safe_mutation_dto(v_case_id, v_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.review_case_create_from_review(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_case_create_from_review(UUID, INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_case_create_from_review(UUID, INTEGER, TEXT) TO authenticated;

-- ============ 6. Public RPC: update draft ============
CREATE FUNCTION public.review_case_update_draft(
  p_case_id UUID,
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
  v_org_id UUID;
  v_case_status TEXT;
  v_version INTEGER;
  v_title TEXT;
  v_summary TEXT;
  v_lesson TEXT;
  v_prevention TEXT;
  v_applicability TEXT;
  v_changed TEXT[] := '{}'::TEXT[];
  v_key TEXT;
  v_new_title TEXT;
  v_new_summary TEXT;
  v_new_lesson TEXT;
  v_new_prevention TEXT;
  v_new_applicability TEXT;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无权执行');
  END IF;

  SELECT status, version, title, summary, lesson_summary,
         prevention_summary, applicability_notes
    INTO v_case_status, v_version, v_title, v_summary, v_lesson,
         v_prevention, v_applicability
    FROM public.review_knowledge_cases
   WHERE id = p_case_id
     AND org_id = v_org_id
   FOR UPDATE;

  IF v_case_status IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '案例不存在');
  END IF;
  IF v_version IS DISTINCT FROM p_expected_version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '案例版本已变化');
  END IF;
  IF v_case_status <> 'DRAFT' THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改');
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN public.review_rpc_error('INVALID_CASE', '修改内容无效');
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch)
  LOOP
    IF v_key NOT IN ('title', 'summary', 'lessonSummary', 'preventionSummary', 'applicabilityNotes') THEN
      RETURN public.review_rpc_error('INVALID_CASE', '包含不允许的字段');
    END IF;
  END LOOP;

  IF p_patch ? 'title' THEN
    IF jsonb_typeof(p_patch->'title') = 'null' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'CASE_CURATION_INCOMPLETE',
        'message', '案例标题不完整',
        'data', jsonb_build_object('missingFields', jsonb_build_array('TITLE'))
      );
    END IF;
    IF jsonb_typeof(p_patch->'title') <> 'string' THEN
      RETURN public.review_rpc_error('INVALID_CASE', '修改内容格式无效');
    END IF;
    v_new_title := NULLIF(btrim(p_patch->>'title'), '');
    IF v_new_title IS NULL THEN
      RETURN public.review_rpc_error('INVALID_CASE', '案例标题不能为空');
    END IF;
  ELSE
    v_new_title := v_title;
  END IF;
  IF p_patch ? 'summary' THEN
    IF jsonb_typeof(p_patch->'summary') NOT IN ('string', 'null') THEN
      RETURN public.review_rpc_error('INVALID_CASE', '修改内容格式无效');
    END IF;
    v_new_summary := NULLIF(btrim(p_patch->>'summary'), '');
  ELSE
    v_new_summary := v_summary;
  END IF;
  IF p_patch ? 'lessonSummary' THEN
    IF jsonb_typeof(p_patch->'lessonSummary') NOT IN ('string', 'null') THEN
      RETURN public.review_rpc_error('INVALID_CASE', '修改内容格式无效');
    END IF;
    v_new_lesson := NULLIF(btrim(p_patch->>'lessonSummary'), '');
  ELSE
    v_new_lesson := v_lesson;
  END IF;
  IF p_patch ? 'preventionSummary' THEN
    IF jsonb_typeof(p_patch->'preventionSummary') NOT IN ('string', 'null') THEN
      RETURN public.review_rpc_error('INVALID_CASE', '修改内容格式无效');
    END IF;
    v_new_prevention := NULLIF(btrim(p_patch->>'preventionSummary'), '');
  ELSE
    v_new_prevention := v_prevention;
  END IF;
  IF p_patch ? 'applicabilityNotes' THEN
    IF jsonb_typeof(p_patch->'applicabilityNotes') NOT IN ('string', 'null') THEN
      RETURN public.review_rpc_error('INVALID_CASE', '修改内容格式无效');
    END IF;
    v_new_applicability := NULLIF(btrim(p_patch->>'applicabilityNotes'), '');
  ELSE
    v_new_applicability := v_applicability;
  END IF;

  IF v_new_title IS NULL OR length(v_new_title) > 200
     OR length(v_new_summary) > 5000 OR length(v_new_lesson) > 5000
     OR length(v_new_prevention) > 5000 OR length(v_new_applicability) > 2000 THEN
    RETURN public.review_rpc_error('INVALID_CASE', '修改内容不符合长度要求');
  END IF;

  IF v_new_title IS DISTINCT FROM v_title THEN
    v_changed := array_append(v_changed, 'title');
  END IF;
  IF v_new_summary IS DISTINCT FROM v_summary THEN
    v_changed := array_append(v_changed, 'summary');
  END IF;
  IF v_new_lesson IS DISTINCT FROM v_lesson THEN
    v_changed := array_append(v_changed, 'lessonSummary');
  END IF;
  IF v_new_prevention IS DISTINCT FROM v_prevention THEN
    v_changed := array_append(v_changed, 'preventionSummary');
  END IF;
  IF v_new_applicability IS DISTINCT FROM v_applicability THEN
    v_changed := array_append(v_changed, 'applicabilityNotes');
  END IF;

  IF array_length(v_changed, 1) IS NULL THEN
    RETURN public.review_case_safe_mutation_dto(p_case_id, v_org_id);
  END IF;

  UPDATE public.review_knowledge_cases
     SET title = v_new_title,
         summary = v_new_summary,
         lesson_summary = v_new_lesson,
         prevention_summary = v_new_prevention,
         applicability_notes = v_new_applicability,
         version = version + 1,
         updated_at = NOW()
   WHERE id = p_case_id
     AND org_id = v_org_id;

  INSERT INTO public.review_case_audit_logs (
    org_id, case_id, actor_profile_id, action, changes,
    version_before, version_after
  )
  VALUES (
    v_org_id, p_case_id, v_actor_profile_id, 'CASE_UPDATED',
    jsonb_build_object('changedFields', to_jsonb(v_changed)),
    v_version, v_version + 1
  );

  RETURN public.review_case_safe_mutation_dto(p_case_id, v_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.review_case_update_draft(UUID, INTEGER, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_case_update_draft(UUID, INTEGER, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_case_update_draft(UUID, INTEGER, JSONB) TO authenticated;

-- ============ 7. Public RPC: publish ============
CREATE FUNCTION public.review_case_publish(
  p_case_id UUID,
  p_expected_version INTEGER,
  p_expected_source_review_version INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  v_case_status TEXT;
  v_version INTEGER;
  v_source_review_id UUID;
  v_source_status TEXT;
  v_source_version INTEGER;
  v_review_type TEXT;
  v_risk TEXT;
  v_occurred_at TIMESTAMPTZ;
  v_prev_published_at TIMESTAMPTZ;
  v_curation_missing TEXT[] := '{}'::TEXT[];
  v_curation_title TEXT;
  v_curation_summary TEXT;
  v_curation_lesson TEXT;
  v_curation_prevention TEXT;
  v_meta JSONB;
  v_audit_action TEXT;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无权执行');
  END IF;

  SELECT status, version, source_review_id, published_at, title,
         summary, lesson_summary, prevention_summary
    INTO v_case_status, v_version, v_source_review_id, v_prev_published_at,
         v_curation_title, v_curation_summary, v_curation_lesson, v_curation_prevention
    FROM public.review_knowledge_cases
   WHERE id = p_case_id
     AND org_id = v_org_id
   FOR UPDATE;

  IF v_case_status IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '案例不存在');
  END IF;
  IF v_version IS DISTINCT FROM p_expected_version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '案例版本已变化');
  END IF;
  IF v_case_status <> 'DRAFT' THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许发布');
  END IF;

  SELECT status, version, review_type, risk_level, occurred_at
    INTO v_source_status, v_source_version, v_review_type, v_risk, v_occurred_at
    FROM public.review_cases
   WHERE id = v_source_review_id
     AND org_id = v_org_id
   FOR UPDATE;

  IF v_source_status IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '源复盘不存在');
  END IF;
  IF v_source_version IS DISTINCT FROM p_expected_source_review_version THEN
    RETURN public.review_rpc_error('SOURCE_VERSION_CONFLICT', '源复盘版本已变化');
  END IF;
  IF v_source_status <> 'closed' THEN
    RETURN public.review_rpc_error('SOURCE_NOT_CLOSED', '源复盘未关闭');
  END IF;

  IF NULLIF(btrim(v_curation_title), '') IS NULL THEN v_curation_missing := array_append(v_curation_missing, 'TITLE'); END IF;
  IF NULLIF(btrim(v_curation_summary), '') IS NULL THEN v_curation_missing := array_append(v_curation_missing, 'SUMMARY'); END IF;
  IF NULLIF(btrim(v_curation_lesson), '') IS NULL THEN v_curation_missing := array_append(v_curation_missing, 'LESSON_SUMMARY'); END IF;
  IF NULLIF(btrim(v_curation_prevention), '') IS NULL THEN v_curation_missing := array_append(v_curation_missing, 'PREVENTION_SUMMARY'); END IF;

  IF array_length(v_curation_missing, 1) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'CASE_CURATION_INCOMPLETE',
      'message', '案例策展内容不完整',
      'data', jsonb_build_object('missingFields', to_jsonb(v_curation_missing))
    );
  END IF;

  v_meta := public.review_case_validate_publish_metadata(v_source_review_id, v_org_id);
  IF NOT COALESCE(v_meta->>'ok', 'false') = 'true' THEN
    RETURN v_meta;
  END IF;

  PERFORM public.review_case_replace_snapshot(p_case_id, v_org_id, v_source_review_id);

  v_audit_action := CASE WHEN v_prev_published_at IS NULL THEN 'CASE_PUBLISHED' ELSE 'CASE_REPUBLISHED' END;

  UPDATE public.review_knowledge_cases
     SET status = 'PUBLISHED',
         source_review_version = v_source_version,
         review_type_snapshot = v_review_type,
         risk_level_snapshot = v_risk,
         occurred_at_snapshot = v_occurred_at,
         published_by_profile_id = v_actor_profile_id,
         published_at = NOW(),
         hidden_by_profile_id = NULL,
         hidden_at = NULL,
         hidden_reason = NULL,
         version = version + 1,
         updated_at = NOW()
   WHERE id = p_case_id
     AND org_id = v_org_id;

  INSERT INTO public.review_case_audit_logs (
    org_id, case_id, actor_profile_id, action, changes,
    version_before, version_after
  )
  VALUES (
    v_org_id, p_case_id, v_actor_profile_id, v_audit_action,
    jsonb_build_object(
      'fromStatus', 'DRAFT',
      'toStatus', 'PUBLISHED',
      'sourceReviewVersion', v_source_version,
      'publishKind', v_audit_action
    ),
    v_version, v_version + 1
  );

  RETURN public.review_case_safe_mutation_dto(p_case_id, v_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.review_case_publish(UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_case_publish(UUID, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_case_publish(UUID, INTEGER, INTEGER) TO authenticated;

-- ============ 8. Public RPC: hide ============
CREATE FUNCTION public.review_case_hide(
  p_case_id UUID,
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
  v_org_id UUID;
  v_case_status TEXT;
  v_version INTEGER;
  v_reason TEXT;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无权执行');
  END IF;

  SELECT status, version
    INTO v_case_status, v_version
    FROM public.review_knowledge_cases
   WHERE id = p_case_id
     AND org_id = v_org_id
   FOR UPDATE;

  IF v_case_status IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '案例不存在');
  END IF;
  IF v_version IS DISTINCT FROM p_expected_version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '案例版本已变化');
  END IF;
  IF v_case_status NOT IN ('DRAFT', 'PUBLISHED') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许下架');
  END IF;

  v_reason := NULLIF(btrim(p_reason), '');
  IF v_reason IS NULL OR length(v_reason) > 1000 THEN
    RETURN public.review_rpc_error('INVALID_CASE', '下架原因无效');
  END IF;

  UPDATE public.review_knowledge_cases
     SET status = 'HIDDEN',
         hidden_by_profile_id = v_actor_profile_id,
         hidden_at = NOW(),
         hidden_reason = v_reason,
         version = version + 1,
         updated_at = NOW()
   WHERE id = p_case_id
     AND org_id = v_org_id;

  INSERT INTO public.review_case_audit_logs (
    org_id, case_id, actor_profile_id, action, changes,
    version_before, version_after
  )
  VALUES (
    v_org_id, p_case_id, v_actor_profile_id, 'CASE_HIDDEN',
    jsonb_build_object('fromStatus', v_case_status, 'toStatus', 'HIDDEN'),
    v_version, v_version + 1
  );

  RETURN public.review_case_safe_mutation_dto(p_case_id, v_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.review_case_hide(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_case_hide(UUID, INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_case_hide(UUID, INTEGER, TEXT) TO authenticated;

-- ============ 9. Public RPC: reopen curation ============
CREATE FUNCTION public.review_case_reopen_curation(
  p_case_id UUID,
  p_expected_version INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  v_case_status TEXT;
  v_version INTEGER;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无权执行');
  END IF;

  SELECT status, version
    INTO v_case_status, v_version
    FROM public.review_knowledge_cases
   WHERE id = p_case_id
     AND org_id = v_org_id
   FOR UPDATE;

  IF v_case_status IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '案例不存在');
  END IF;
  IF v_version IS DISTINCT FROM p_expected_version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '案例版本已变化');
  END IF;
  IF v_case_status <> 'HIDDEN' THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许重新策展');
  END IF;

  UPDATE public.review_knowledge_cases
     SET status = 'DRAFT',
         hidden_by_profile_id = NULL,
         hidden_at = NULL,
         hidden_reason = NULL,
         version = version + 1,
         updated_at = NOW()
   WHERE id = p_case_id
     AND org_id = v_org_id;

  INSERT INTO public.review_case_audit_logs (
    org_id, case_id, actor_profile_id, action, changes,
    version_before, version_after
  )
  VALUES (
    v_org_id, p_case_id, v_actor_profile_id, 'CASE_REOPENED',
    jsonb_build_object('fromStatus', 'HIDDEN', 'toStatus', 'DRAFT'),
    v_version, v_version + 1
  );

  RETURN public.review_case_safe_mutation_dto(p_case_id, v_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.review_case_reopen_curation(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_case_reopen_curation(UUID, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_case_reopen_curation(UUID, INTEGER) TO authenticated;

-- ============ 10. Public RPC: library ============
CREATE FUNCTION public.review_case_library(
  p_query TEXT DEFAULT NULL,
  p_material_codes TEXT[] DEFAULT NULL,
  p_process_codes TEXT[] DEFAULT NULL,
  p_problem_domain_codes TEXT[] DEFAULT NULL,
  p_problem_symptom_codes TEXT[] DEFAULT NULL,
  p_review_types TEXT[] DEFAULT NULL,
  p_risk_levels TEXT[] DEFAULT NULL,
  p_published_from TIMESTAMPTZ DEFAULT NULL,
  p_published_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  v_query TEXT;
  v_materials TEXT[] := COALESCE(p_material_codes, ARRAY[]::TEXT[]);
  v_processes TEXT[] := COALESCE(p_process_codes, ARRAY[]::TEXT[]);
  v_domains TEXT[] := COALESCE(p_problem_domain_codes, ARRAY[]::TEXT[]);
  v_symptoms TEXT[] := COALESCE(p_problem_symptom_codes, ARRAY[]::TEXT[]);
  v_types TEXT[] := COALESCE(p_review_types, ARRAY[]::TEXT[]);
  v_risks TEXT[] := COALESCE(p_risk_levels, ARRAY[]::TEXT[]);
  v_total INTEGER;
  v_items JSONB := '[]'::jsonb;
  rec RECORD;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 100000 THEN
    RETURN public.review_rpc_error('INVALID_CASE', '分页参数无效');
  END IF;
  v_query := NULLIF(btrim(p_query), '');
  IF v_query IS NOT NULL AND length(v_query) > 200 THEN
    RETURN public.review_rpc_error('INVALID_CASE', '搜索内容过长');
  END IF;
  IF array_length(v_materials, 1) > 50 OR array_length(v_processes, 1) > 50
     OR array_length(v_domains, 1) > 50 OR array_length(v_symptoms, 1) > 50
     OR array_length(v_types, 1) > 50 OR array_length(v_risks, 1) > 50 THEN
    RETURN public.review_rpc_error('INVALID_CASE', '筛选条件过多');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_materials) t WHERE t IS NULL)
     OR EXISTS (SELECT 1 FROM unnest(v_processes) t WHERE t IS NULL)
     OR EXISTS (SELECT 1 FROM unnest(v_domains) t WHERE t IS NULL)
     OR EXISTS (SELECT 1 FROM unnest(v_symptoms) t WHERE t IS NULL)
     OR EXISTS (SELECT 1 FROM unnest(v_types) t WHERE t IS NULL)
     OR EXISTS (SELECT 1 FROM unnest(v_risks) t WHERE t IS NULL) THEN
    RETURN public.review_rpc_error('INVALID_CASE', '筛选条件不能为空元素');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_types) t WHERE t NOT IN ('A','B','C')) THEN
    RETURN public.review_rpc_error('INVALID_CASE', '复盘类型无效');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_risks) t WHERE t NOT IN ('RED','YELLOW','GREEN')) THEN
    RETURN public.review_rpc_error('INVALID_CASE', '风险等级无效');
  END IF;

  v_materials := ARRAY(SELECT DISTINCT x FROM unnest(v_materials) x ORDER BY x);
  v_processes := ARRAY(SELECT DISTINCT x FROM unnest(v_processes) x ORDER BY x);
  v_domains := ARRAY(SELECT DISTINCT x FROM unnest(v_domains) x ORDER BY x);
  v_symptoms := ARRAY(SELECT DISTINCT x FROM unnest(v_symptoms) x ORDER BY x);
  v_types := ARRAY(SELECT DISTINCT x FROM unnest(v_types) x ORDER BY x);
  v_risks := ARRAY(SELECT DISTINCT x FROM unnest(v_risks) x ORDER BY x);

  SELECT COUNT(*) INTO v_total
    FROM public.review_knowledge_cases c
    JOIN public.review_cases rc
      ON rc.id = c.source_review_id
     AND rc.org_id = c.org_id
    LEFT JOIN public.review_knowledge_case_metadata h
      ON h.case_id = c.id
     AND h.org_id = c.org_id
   WHERE c.org_id = v_org_id
     AND c.status = 'PUBLISHED'
     AND rc.status = 'closed'
     AND rc.version = c.source_review_version
     AND (v_query IS NULL OR POSITION(lower(v_query) IN lower(concat_ws(' ', c.case_no, c.title, COALESCE(c.summary,''), COALESCE(c.lesson_summary,''), COALESCE(c.prevention_summary,''), COALESCE(c.applicability_notes,'')))) > 0)
     AND (array_length(v_materials, 1) IS NULL OR EXISTS (SELECT 1 FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id=c.id AND mi.metadata_type='MATERIAL' AND mi.code = ANY(v_materials)))
     AND (array_length(v_processes, 1) IS NULL OR EXISTS (SELECT 1 FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id=c.id AND mi.metadata_type='PROCESS' AND mi.code = ANY(v_processes)))
     AND (array_length(v_domains, 1) IS NULL OR EXISTS (SELECT 1 FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id=c.id AND mi.metadata_type='PROBLEM_DOMAIN' AND mi.code = ANY(v_domains)))
     AND (array_length(v_symptoms, 1) IS NULL OR EXISTS (SELECT 1 FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id=c.id AND mi.metadata_type='PROBLEM_SYMPTOM' AND mi.code = ANY(v_symptoms)))
     AND (array_length(v_types, 1) IS NULL OR c.review_type_snapshot = ANY(v_types))
     AND (array_length(v_risks, 1) IS NULL OR c.risk_level_snapshot = ANY(v_risks))
     AND (p_published_from IS NULL OR c.published_at >= p_published_from)
     AND (p_published_to IS NULL OR c.published_at <= p_published_to);

  FOR rec IN
    SELECT c.id AS case_id, c.case_no, c.title, c.summary, c.lesson_summary, c.prevention_summary,
           c.applicability_notes, c.review_type_snapshot, c.risk_level_snapshot,
           c.occurred_at_snapshot, c.published_at,
           h.material_other_text, h.process_other_text,
           h.problem_domain_other_text, h.problem_symptom_other_text
      FROM public.review_knowledge_cases c
      JOIN public.review_cases rc
        ON rc.id = c.source_review_id
       AND rc.org_id = c.org_id
      LEFT JOIN public.review_knowledge_case_metadata h
        ON h.case_id = c.id
       AND h.org_id = c.org_id
     WHERE c.org_id = v_org_id
       AND c.status = 'PUBLISHED'
       AND rc.status = 'closed'
       AND rc.version = c.source_review_version
       AND (v_query IS NULL OR POSITION(lower(v_query) IN lower(concat_ws(' ', c.case_no, c.title, COALESCE(c.summary,''), COALESCE(c.lesson_summary,''), COALESCE(c.prevention_summary,''), COALESCE(c.applicability_notes,'')))) > 0)
       AND (array_length(v_materials, 1) IS NULL OR EXISTS (SELECT 1 FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id=c.id AND mi.metadata_type='MATERIAL' AND mi.code = ANY(v_materials)))
       AND (array_length(v_processes, 1) IS NULL OR EXISTS (SELECT 1 FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id=c.id AND mi.metadata_type='PROCESS' AND mi.code = ANY(v_processes)))
       AND (array_length(v_domains, 1) IS NULL OR EXISTS (SELECT 1 FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id=c.id AND mi.metadata_type='PROBLEM_DOMAIN' AND mi.code = ANY(v_domains)))
       AND (array_length(v_symptoms, 1) IS NULL OR EXISTS (SELECT 1 FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id=c.id AND mi.metadata_type='PROBLEM_SYMPTOM' AND mi.code = ANY(v_symptoms)))
       AND (array_length(v_types, 1) IS NULL OR c.review_type_snapshot = ANY(v_types))
       AND (array_length(v_risks, 1) IS NULL OR c.risk_level_snapshot = ANY(v_risks))
       AND (p_published_from IS NULL OR c.published_at >= p_published_from)
       AND (p_published_to IS NULL OR c.published_at <= p_published_to)
     ORDER BY c.published_at DESC, c.case_no DESC
     LIMIT p_limit OFFSET p_offset
  LOOP
    v_items := v_items || jsonb_build_object(
      'caseNo', rec.case_no,
      'title', rec.title,
      'summary', rec.summary,
      'lessonSummary', rec.lesson_summary,
      'preventionSummary', rec.prevention_summary,
      'applicabilityNotes', rec.applicability_notes,
      'reviewType', rec.review_type_snapshot,
      'risk', rec.risk_level_snapshot,
      'occurredAt', rec.occurred_at_snapshot,
      'publishedAt', rec.published_at,
      'metadata', jsonb_build_object(
        'materials', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot, 'isPrimary', mi.is_primary) ORDER BY mi.is_primary DESC, mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = rec.case_id AND mi.metadata_type = 'MATERIAL'), '[]'::jsonb),
        'processes', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = rec.case_id AND mi.metadata_type = 'PROCESS'), '[]'::jsonb),
        'problemDomains', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = rec.case_id AND mi.metadata_type = 'PROBLEM_DOMAIN'), '[]'::jsonb),
        'problemSymptoms', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = rec.case_id AND mi.metadata_type = 'PROBLEM_SYMPTOM'), '[]'::jsonb),
        'materialOtherText', rec.material_other_text,
        'processOtherText', rec.process_other_text,
        'problemDomainOtherText', rec.problem_domain_other_text,
        'problemSymptomOtherText', rec.problem_symptom_other_text
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'items', v_items,
      'limit', p_limit,
      'offset', p_offset,
      'hasMore', (p_offset + p_limit) < v_total
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_case_library(TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_case_library(TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_case_library(TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated;

-- ============ 11. Public RPC: public detail ============
CREATE FUNCTION public.review_case_detail(
  p_case_no TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  rec RECORD;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF p_case_no IS NULL OR p_case_no !~ '^CASE-[0-9]{4}-[0-9]{6}$' THEN
    RETURN public.review_rpc_error('INVALID_CASE', '案例编号无效');
  END IF;

  SELECT c.id AS case_id, c.case_no, c.title, c.summary, c.lesson_summary, c.prevention_summary,
         c.applicability_notes, c.review_type_snapshot, c.risk_level_snapshot,
         c.occurred_at_snapshot, c.published_at,
         h.material_other_text, h.process_other_text,
         h.problem_domain_other_text, h.problem_symptom_other_text
    INTO rec
    FROM public.review_knowledge_cases c
    JOIN public.review_cases rc
      ON rc.id = c.source_review_id
     AND rc.org_id = c.org_id
    LEFT JOIN public.review_knowledge_case_metadata h
      ON h.case_id = c.id
     AND h.org_id = c.org_id
   WHERE c.org_id = v_org_id
     AND c.case_no = p_case_no
     AND c.status = 'PUBLISHED'
     AND rc.status = 'closed'
     AND rc.version = c.source_review_version;

  IF rec.case_no IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '案例不存在');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'caseNo', rec.case_no,
      'title', rec.title,
      'summary', rec.summary,
      'lessonSummary', rec.lesson_summary,
      'preventionSummary', rec.prevention_summary,
      'applicabilityNotes', rec.applicability_notes,
      'reviewType', rec.review_type_snapshot,
      'risk', rec.risk_level_snapshot,
      'occurredAt', rec.occurred_at_snapshot,
      'publishedAt', rec.published_at,
      'metadata', jsonb_build_object(
        'materials', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot, 'isPrimary', mi.is_primary) ORDER BY mi.is_primary DESC, mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = rec.case_id AND mi.metadata_type = 'MATERIAL'), '[]'::jsonb),
        'processes', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = rec.case_id AND mi.metadata_type = 'PROCESS'), '[]'::jsonb),
        'problemDomains', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = rec.case_id AND mi.metadata_type = 'PROBLEM_DOMAIN'), '[]'::jsonb),
        'problemSymptoms', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = rec.case_id AND mi.metadata_type = 'PROBLEM_SYMPTOM'), '[]'::jsonb),
        'materialOtherText', rec.material_other_text,
        'processOtherText', rec.process_other_text,
        'problemDomainOtherText', rec.problem_domain_other_text,
        'problemSymptomOtherText', rec.problem_symptom_other_text
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_case_detail(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_case_detail(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_case_detail(TEXT) TO authenticated;

-- ============ 12. Public RPC: candidates ============
CREATE FUNCTION public.review_case_candidates(
  p_limit INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0,
  p_query TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  v_query TEXT;
  v_total INTEGER;
  v_items JSONB := '[]'::jsonb;
  rec RECORD;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无权执行');
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 100000 THEN
    RETURN public.review_rpc_error('INVALID_CASE', '分页参数无效');
  END IF;
  v_query := NULLIF(btrim(p_query), '');
  IF v_query IS NOT NULL AND length(v_query) > 200 THEN
    RETURN public.review_rpc_error('INVALID_CASE', '搜索内容过长');
  END IF;

  SELECT COUNT(*) INTO v_total
    FROM public.review_cases rc
   WHERE rc.org_id = v_org_id
     AND rc.status = 'closed'
     AND (v_query IS NULL OR POSITION(lower(v_query) IN lower(rc.review_no)) > 0);

  FOR rec IN
    SELECT rc.id AS source_review_id, rc.review_no, rc.review_type, rc.risk_level,
           rc.occurred_at, rc.version AS source_version,
           c.id AS existing_case_id, c.case_no AS existing_case_no,
           c.status AS existing_status, c.version AS existing_version,
           c.source_review_version AS case_source_version
      FROM public.review_cases rc
      LEFT JOIN public.review_knowledge_cases c
        ON c.org_id = rc.org_id
       AND c.source_review_id = rc.id
     WHERE rc.org_id = v_org_id
       AND rc.status = 'closed'
       AND (v_query IS NULL OR POSITION(lower(v_query) IN lower(rc.review_no)) > 0)
     ORDER BY rc.occurred_at DESC NULLS LAST, rc.review_no DESC
     LIMIT p_limit OFFSET p_offset
  LOOP
    v_items := v_items || jsonb_build_object(
      'sourceReviewId', rec.source_review_id,
      'reviewNo', rec.review_no,
      'reviewType', rec.review_type,
      'risk', rec.risk_level,
      'occurredAt', rec.occurred_at,
      'sourceVersion', rec.source_version,
      'metadataSummary', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'metadataType', mi.metadata_type,
          'code', d.code,
          'label', CASE WHEN d.code = 'OTHER' THEN '其他' ELSE d.label END,
          'isPrimary', mi.is_primary
        ) ORDER BY mi.metadata_type, d.code)
        FROM public.review_metadata_items mi
        JOIN public.review_dict_items d
          ON d.id = mi.dict_item_id
         AND d.dict_type = mi.metadata_type
        WHERE mi.review_id = rec.source_review_id
          AND mi.org_id = v_org_id
      ), '[]'::jsonb),
      'existingCase', CASE
        WHEN rec.existing_case_id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'id', rec.existing_case_id,
          'caseNo', rec.existing_case_no,
          'status', rec.existing_status,
          'version', rec.existing_version,
          'isSourceChanged', (rec.source_version IS DISTINCT FROM rec.case_source_version)
        )
      END
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'items', v_items,
      'limit', p_limit,
      'offset', p_offset,
      'hasMore', (p_offset + p_limit) < v_total
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_case_candidates(INTEGER, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_case_candidates(INTEGER, INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_case_candidates(INTEGER, INTEGER, TEXT) TO authenticated;

-- ============ 13. Public RPC: admin detail ============
CREATE FUNCTION public.review_case_admin_detail(
  p_case_no TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  v_case_id UUID;
  v_case_status TEXT;
  v_version INTEGER;
  v_source_review_id UUID;
  v_source_status TEXT;
  v_source_version INTEGER;
  v_case_source_version INTEGER;
  v_source_review_no TEXT;
  v_published_at TIMESTAMPTZ;
  v_hidden_at TIMESTAMPTZ;
  v_hidden_reason TEXT;
  v_title TEXT;
  v_summary TEXT;
  v_lesson TEXT;
  v_prevention TEXT;
  v_applicability TEXT;
  v_review_type_snapshot TEXT;
  v_risk_snapshot TEXT;
  v_occurred_at_snapshot TIMESTAMPTZ;
  v_is_stale BOOLEAN;
  v_reasons TEXT[] := '{}'::TEXT[];
  v_source_changed BOOLEAN;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无权执行');
  END IF;
  IF p_case_no IS NULL OR p_case_no !~ '^CASE-[0-9]{4}-[0-9]{6}$' THEN
    RETURN public.review_rpc_error('INVALID_CASE', '案例编号无效');
  END IF;

  SELECT c.id, c.status, c.version, c.source_review_id, c.source_review_version,
         c.published_at, c.hidden_at, c.hidden_reason, c.title, c.summary,
         c.lesson_summary, c.prevention_summary, c.applicability_notes,
         c.review_type_snapshot, c.risk_level_snapshot, c.occurred_at_snapshot,
         rc.status AS source_status, rc.version AS source_version,
         rc.review_no AS source_review_no
    INTO v_case_id, v_case_status, v_version, v_source_review_id, v_case_source_version,
         v_published_at, v_hidden_at, v_hidden_reason, v_title, v_summary,
         v_lesson, v_prevention, v_applicability,
         v_review_type_snapshot, v_risk_snapshot, v_occurred_at_snapshot,
         v_source_status, v_source_version, v_source_review_no
    FROM public.review_knowledge_cases c
    LEFT JOIN public.review_cases rc
      ON rc.id = c.source_review_id
     AND rc.org_id = c.org_id
   WHERE c.org_id = v_org_id
     AND c.case_no = p_case_no;

  IF v_case_id IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '案例不存在');
  END IF;

  v_source_changed := v_source_version IS DISTINCT FROM v_case_source_version;
  IF v_case_status = 'PUBLISHED' THEN
    IF v_source_status <> 'closed' THEN
      v_is_stale := TRUE;
      v_reasons := array_append(v_reasons, 'SOURCE_NOT_CLOSED');
    END IF;
    IF v_source_changed THEN
      v_is_stale := TRUE;
      v_reasons := array_append(v_reasons, 'SOURCE_VERSION_CHANGED');
    END IF;
    v_is_stale := COALESCE(v_is_stale, FALSE);
  ELSE
    v_is_stale := FALSE;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'id', v_case_id,
      'caseNo', p_case_no,
      'status', v_case_status,
      'version', v_version,
      'title', v_title,
      'summary', v_summary,
      'lessonSummary', v_lesson,
      'preventionSummary', v_prevention,
      'applicabilityNotes', v_applicability,
      'reviewTypeSnapshot', v_review_type_snapshot,
      'riskSnapshot', v_risk_snapshot,
      'occurredAtSnapshot', v_occurred_at_snapshot,
      'publishedAt', v_published_at,
      'hiddenAt', v_hidden_at,
      'hiddenReason', v_hidden_reason,
      'sourceReviewId', v_source_review_id,
      'sourceReviewNo', v_source_review_no,
      'sourceCurrentStatus', v_source_status,
      'sourceCurrentVersion', v_source_version,
      'caseSourceReviewVersion', v_case_source_version,
      'sourceChangedSinceSnapshot', v_source_changed,
      'isStale', v_is_stale,
      'staleReasons', v_reasons,
      'currentSourceMetadata', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'metadataType', mi.metadata_type,
          'code', d.code,
          'label', d.label,
          'isPrimary', mi.is_primary
        ) ORDER BY mi.metadata_type, d.code)
        FROM public.review_metadata_items mi
        JOIN public.review_dict_items d
          ON d.id = mi.dict_item_id
         AND d.dict_type = mi.metadata_type
        WHERE mi.review_id = v_source_review_id
          AND mi.org_id = v_org_id
      ), '[]'::jsonb),
      'caseSnapshotMetadata', jsonb_build_object(
        'materials', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot, 'isPrimary', mi.is_primary) ORDER BY mi.is_primary DESC, mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = v_case_id AND mi.metadata_type = 'MATERIAL'), '[]'::jsonb),
        'processes', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = v_case_id AND mi.metadata_type = 'PROCESS'), '[]'::jsonb),
        'problemDomains', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = v_case_id AND mi.metadata_type = 'PROBLEM_DOMAIN'), '[]'::jsonb),
        'problemSymptoms', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = v_case_id AND mi.metadata_type = 'PROBLEM_SYMPTOM'), '[]'::jsonb)
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_case_admin_detail(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_case_admin_detail(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_case_admin_detail(TEXT) TO authenticated;

-- ============ 14. Public RPC: audit read ============
CREATE FUNCTION public.review_case_audit(
  p_case_id UUID,
  p_limit INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  v_total INTEGER;
  v_items JSONB := '[]'::jsonb;
  rec RECORD;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无权执行');
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 100000 THEN
    RETURN public.review_rpc_error('INVALID_CASE', '分页参数无效');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.review_knowledge_cases
    WHERE id = p_case_id AND org_id = v_org_id
  ) THEN
    RETURN public.review_rpc_error('NOT_FOUND', '案例不存在');
  END IF;

  SELECT COUNT(*) INTO v_total
    FROM public.review_case_audit_logs
   WHERE case_id = p_case_id
     AND org_id = v_org_id;

  FOR rec IN
    SELECT a.action, a.version_before, a.version_after, a.created_at, a.changes,
           COALESCE(NULLIF(btrim(p.full_name), ''), '未知用户') AS actor_name
      FROM public.review_case_audit_logs a
      LEFT JOIN public.profiles p
        ON p.id = a.actor_profile_id
       AND p.org_id = a.org_id
     WHERE a.case_id = p_case_id
       AND a.org_id = v_org_id
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT p_limit OFFSET p_offset
  LOOP
    v_items := v_items || jsonb_build_object(
      'action', rec.action,
      'versionBefore', rec.version_before,
      'versionAfter', rec.version_after,
      'actorDisplayName', rec.actor_name,
      'createdAt', rec.created_at,
      'safeChangeSummary', jsonb_build_object(
        'changedFields', rec.changes->'changedFields',
        'fromStatus', rec.changes->'fromStatus',
        'toStatus', rec.changes->'toStatus',
        'sourceReviewVersion', rec.changes->'sourceReviewVersion',
        'publishKind', rec.changes->'publishKind',
        'status', rec.changes->'status'
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'items', v_items,
      'limit', p_limit,
      'offset', p_offset,
      'hasMore', (p_offset + p_limit) < v_total
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_case_audit(UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_case_audit(UUID, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_case_audit(UUID, INTEGER, INTEGER) TO authenticated;

COMMIT;
