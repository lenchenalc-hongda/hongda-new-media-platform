-- CPC P customer potential: owner-controlled, immediately effective on saved scoring.
-- Business rule 2026-10-25: customer owner OR active project owner may self-rate.
-- No manager review, no changes to actual R grading, receipts, ownership or notes/plans.
BEGIN;

-- Keep existing customer owner/notes/plan permissions unchanged. This is
-- a separate and explicitly narrower purpose: P rating only.
CREATE OR REPLACE FUNCTION public.cpc_can_self_rate_customer(
  p_customer_reference_id UUID, p_org_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id UUID := public.auth_profile_id();
BEGIN
  IF v_actor_id IS NULL OR public.auth_org_id() IS DISTINCT FROM p_org_id::text THEN
    RETURN FALSE;
  END IF;

  -- Includes admin/manager and the legitimate mapped customer-owner/creator
  -- but does not grant them any new permissions on notes/financial data.
  IF public.cpc_can_assess_customer_rating(p_customer_reference_id,p_org_id) THEN
    RETURN TRUE;
  END IF;
  IF NOT public.auth_has_role('sales') THEN RETURN FALSE; END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.cpc_projects project
      JOIN public.cpc_customer_references customer
        ON customer.id=project.customer_reference_id
       AND customer.org_id=project.org_id
     WHERE project.customer_reference_id=p_customer_reference_id
       AND project.org_id=p_org_id
       AND project.owner_profile_id=v_actor_id
       AND project.status IN ('active','paused','won')
       AND customer.status IN ('active','pending_review')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cpc_can_self_rate_customer(UUID,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cpc_can_self_rate_customer(UUID,UUID) TO authenticated;

-- UI list/detail gets rating-write permission and the last rating author's
-- name without expanding the authority of the existing customer-owner RPC.
-- Only customers already readable under CPC RLS are returned.
CREATE FUNCTION public.cpc_customer_self_rating_access(
  p_customer_ids UUID[]
)
RETURNS TABLE(
  customer_reference_id UUID,
  can_rate BOOLEAN,
  last_rater_profile_id UUID,
  last_rater_name TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT cr.id,
         public.cpc_can_self_rate_customer(cr.id,cr.org_id),
         rating.assessor_profile_id,
         COALESCE(actor.full_name,rating.assessor_profile_id::text)
  FROM public.cpc_customer_references cr
  LEFT JOIN public.cpc_customer_potential_assessments rating
    ON rating.org_id=cr.org_id
   AND rating.customer_reference_id=cr.id
  LEFT JOIN public.profiles actor
    ON actor.org_id=cr.org_id
   AND actor.id=rating.assessor_profile_id
  WHERE cr.org_id::text=public.auth_org_id()
    AND cr.id=ANY(p_customer_ids)
    AND cardinality(p_customer_ids) BETWEEN 1 AND 500
    AND public.cpc_can_read_customer_reference(cr.id,cr.org_id);
$$;
REVOKE ALL ON FUNCTION public.cpc_customer_self_rating_access(UUID[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cpc_customer_self_rating_access(UUID[]) TO authenticated;

-- Preserve RPC signature for compatible clients, but submission now
-- publishes an owner-confirmed P grade directly and leaves R untouched.
-- Legacy draft calls (p_submit=false) remain unapproved and do not publish.
CREATE OR REPLACE FUNCTION public.cpc_save_customer_potential_rating(
  p_customer_reference_id UUID,
  p_scores JSONB,
  p_evidence_summary TEXT,
  p_opportunity_summary TEXT,
  p_estimated_annual_opportunity_cny_yuan BIGINT,
  p_next_action TEXT,
  p_next_check_on DATE,
  p_submit BOOLEAN,
  p_expected_version INTEGER DEFAULT NULL,
  p_request_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id UUID := public.auth_profile_id();
  v_org_id UUID;
  v_field TEXT;
  v_score INTEGER;
  v_grade TEXT;
  v_status TEXT;
  v_row public.cpc_customer_potential_assessments%ROWTYPE;
  v_before JSONB;
BEGIN
  SELECT org_id INTO v_org_id
  FROM public.profiles
  WHERE id=v_actor_id AND user_id=auth.uid() AND is_active=TRUE
    AND role IN ('admin','manager','sales')
  LIMIT 1;

  IF v_org_id IS NULL OR NOT public.cpc_can_self_rate_customer(
      p_customer_reference_id,v_org_id
  ) THEN
    RETURN public.cpc_rpc_error('FORBIDDEN','仅该客户负责人或项目负责人可以设定潜力评级');
  END IF;
  IF p_submit IS NULL OR jsonb_typeof(p_scores) IS DISTINCT FROM 'object' THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT','必须提交五项评分和明确保存方式');
  END IF;
  FOREACH v_field IN ARRAY ARRAY[
    'purchase_scope','process_fit','project_evidence','decision_access','repeat_value'
  ] LOOP
    IF COALESCE(p_scores->>v_field,'') !~ '^[0-5]$' THEN
      RETURN public.cpc_rpc_error('INVALID_INPUT','五项评分均需为0到5分');
    END IF;
  END LOOP;
  IF (SELECT COUNT(*) FROM jsonb_object_keys(p_scores)) <> 5
     OR char_length(coalesce(p_evidence_summary,'')) > 3000 THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT','评分或事实依据内容超出范围');
  END IF;
  IF p_submit AND char_length(btrim(coalesce(p_evidence_summary,''))) < 20 THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT','评级生效需要至少20字客户事实依据');
  END IF;

  v_score := (p_scores->>'purchase_scope')::int*6
           + (p_scores->>'process_fit')::int*5
           + (p_scores->>'project_evidence')::int*4
           + (p_scores->>'decision_access')::int*3
           + (p_scores->>'repeat_value')::int*2;

  v_grade := CASE
    WHEN v_score>=90 THEN 'SS'
    WHEN v_score>=80 THEN 'S'
    WHEN v_score>=70 THEN 'A'
    WHEN v_score>=55 THEN 'B'
    WHEN v_score>=35 THEN 'C'
    ELSE 'D'
  END;
  v_status := CASE WHEN p_submit THEN 'approved' ELSE 'draft' END;

  SELECT * INTO v_row
  FROM public.cpc_customer_potential_assessments
  WHERE org_id=v_org_id AND customer_reference_id=p_customer_reference_id
  FOR UPDATE;

  IF FOUND THEN
    IF p_expected_version IS NULL OR v_row.version<>p_expected_version THEN
      RETURN public.cpc_rpc_error('VERSION_CONFLICT','潜力评级已由其他负责人更新，请刷新后重试');
    END IF;
    v_before := to_jsonb(v_row);
    UPDATE public.cpc_customer_potential_assessments SET
      assessor_profile_id=v_actor_id,
      scores=p_scores,
      assessment_score=v_score,
      evidence_summary=btrim(coalesce(p_evidence_summary,'')),
      status=v_status,
      published_grade=CASE WHEN p_submit THEN v_grade ELSE published_grade END,
      published_score=CASE WHEN p_submit THEN v_score ELSE published_score END,
      published_at=CASE WHEN p_submit THEN now() ELSE published_at END,
      reviewer_profile_id=NULL,
      review_note=NULL,
      reviewed_at=NULL,
      version=v_row.version+1
    WHERE id=v_row.id
    RETURNING * INTO v_row;
  ELSE
    IF p_expected_version IS NOT NULL THEN
      RETURN public.cpc_rpc_error('VERSION_CONFLICT','尚无评级记录，请刷新后重试');
    END IF;
    v_before := NULL;
    INSERT INTO public.cpc_customer_potential_assessments(
      org_id,customer_reference_id,assessor_profile_id,scores,
      assessment_score,evidence_summary,status,
      published_grade,published_score,published_at
    ) VALUES (
      v_org_id,p_customer_reference_id,v_actor_id,p_scores,v_score,
      btrim(coalesce(p_evidence_summary,'')),v_status,
      CASE WHEN p_submit THEN v_grade END,
      CASE WHEN p_submit THEN v_score END,
      CASE WHEN p_submit THEN now() END
    )
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.cpc_audit_log(
    org_id,entity_type,entity_id,action,actor_profile_id,reason,
    before_values,after_values,metadata,request_id
  ) VALUES (
    v_org_id,'CUSTOMER_POTENTIAL_RATING',v_row.id,
    CASE WHEN p_submit THEN 'POTENTIAL_RATING_OWNER_PUBLISHED'
         ELSE 'POTENTIAL_RATING_DRAFT_SAVED' END,
    v_actor_id,NULL,v_before,to_jsonb(v_row),
    jsonb_build_object(
      'customer_reference_id',p_customer_reference_id,
      'rating_type','potential',
      'saved_by_profile_id',v_actor_id,
      'approval_required',FALSE,
      'actual_rating_or_receipts_changed',FALSE,
      'sales_plan_changed',FALSE
    ),
    p_request_id
  );
  RETURN jsonb_build_object('ok',TRUE,'code','OK','data',
    jsonb_build_object(
      'id',v_row.id,
      'version',v_row.version,
      'status',v_row.status,
      'published_grade',v_row.published_grade,
      'published_score',v_row.published_score,
      'published_at',v_row.published_at,
      'assessor_profile_id',v_row.assessor_profile_id
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cpc_save_customer_potential_rating(
  UUID,JSONB,TEXT,TEXT,BIGINT,TEXT,DATE,BOOLEAN,INTEGER,UUID
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cpc_save_customer_potential_rating(
  UUID,JSONB,TEXT,TEXT,BIGINT,TEXT,DATE,BOOLEAN,INTEGER,UUID
) TO authenticated;

-- Prior manager-approval RPC remains in DB for historical audit compatibility
-- but must not remain callable via Supabase Data API after self-rating launch.
REVOKE ALL ON FUNCTION public.cpc_review_customer_potential_rating(
  UUID,INTEGER,TEXT,TEXT,UUID
) FROM PUBLIC,anon,authenticated;

COMMIT;
