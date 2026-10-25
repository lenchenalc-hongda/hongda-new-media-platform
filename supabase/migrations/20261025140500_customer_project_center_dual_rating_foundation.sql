-- CPC customer dual ratings | additive, review-gated, external-finance-safe.
-- DEV rehearsed before any independently approved Production migration.
-- This migration does not import receipts, assign R grades, or change the workshop customer master.
BEGIN;

CREATE TABLE public.cpc_customer_potential_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_reference_id UUID NOT NULL,
  assessor_profile_id UUID NOT NULL,
  scores JSONB NOT NULL,
  assessment_score INTEGER NOT NULL CHECK (assessment_score BETWEEN 0 AND 100),
  evidence_summary TEXT NOT NULL DEFAULT '',
  opportunity_summary TEXT NOT NULL DEFAULT '',
  estimated_annual_opportunity_cny_yuan BIGINT
    CHECK (estimated_annual_opportunity_cny_yuan >= 0),
  next_action TEXT NOT NULL DEFAULT '',
  next_check_on DATE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_review', 'approved', 'changes_requested')),
  published_grade TEXT
    CHECK (published_grade IN ('SS', 'S', 'A', 'B', 'C', 'D')),
  published_score INTEGER CHECK (published_score BETWEEN 0 AND 100),
  published_at TIMESTAMPTZ,
  reviewer_profile_id UUID,
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cpc_customer_potential_assessment_org_customer UNIQUE (org_id, customer_reference_id),
  CONSTRAINT fk_cpc_rating_customer_org FOREIGN KEY (customer_reference_id,org_id)
    REFERENCES public.cpc_customer_references(id,org_id),
  CONSTRAINT fk_cpc_rating_assessor_org FOREIGN KEY (assessor_profile_id,org_id)
    REFERENCES public.profiles(id,org_id),
  CONSTRAINT fk_cpc_rating_reviewer_org FOREIGN KEY (reviewer_profile_id,org_id)
    REFERENCES public.profiles(id,org_id),
  CONSTRAINT chk_cpc_rating_published_consistency CHECK (
    (published_grade IS NULL AND published_score IS NULL AND published_at IS NULL)
    OR (published_grade IS NOT NULL AND published_score IS NOT NULL AND published_at IS NOT NULL)
  )
);

CREATE INDEX idx_cpc_rating_review_queue
  ON public.cpc_customer_potential_assessments(org_id,status,updated_at DESC);
CREATE INDEX idx_cpc_rating_assessor
  ON public.cpc_customer_potential_assessments(org_id,assessor_profile_id);

CREATE TRIGGER trg_cpc_rating_updated_at
  BEFORE UPDATE ON public.cpc_customer_potential_assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cpc_customer_potential_assessments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cpc_customer_potential_assessments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.cpc_customer_potential_assessments TO authenticated;
CREATE POLICY cpc_potential_rating_select_authorized ON public.cpc_customer_potential_assessments
  FOR SELECT TO authenticated
  USING (public.cpc_can_read_customer_reference(customer_reference_id,org_id));

-- Sales write eligibility is strictly the externally mapped customer owner;
-- a follow-up task assignee is NOT enough to rewrite a customer's potential rating.
CREATE FUNCTION public.cpc_can_assess_customer_rating(
  p_customer_reference_id UUID, p_org_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id UUID := public.auth_profile_id();
BEGIN
  IF v_actor_id IS NULL OR public.auth_org_id() <> p_org_id::text THEN RETURN FALSE; END IF;
  IF public.auth_has_role('admin') OR public.auth_has_role('manager') THEN
    RETURN EXISTS(
      SELECT 1 FROM public.cpc_customer_references cr
      WHERE cr.id=p_customer_reference_id AND cr.org_id=p_org_id
        AND cr.status IN ('active','pending_review')
    );
  END IF;
  IF NOT public.auth_has_role('sales') THEN RETURN FALSE; END IF;
  RETURN EXISTS(
    SELECT 1 FROM public.cpc_customer_references cr
    WHERE cr.id=p_customer_reference_id AND cr.org_id=p_org_id
      AND cr.status IN ('active','pending_review')
      AND (
        (cr.reference_kind='provisional' AND cr.created_by_profile_id=v_actor_id)
        OR (
          cr.reference_kind='canonical'
          AND EXISTS (
            SELECT 1 FROM public.cpc_external_profile_mappings epm
            WHERE epm.org_id=cr.org_id
              AND epm.external_source=cr.external_source
              AND epm.external_person_id=cr.external_owner_reference
              AND epm.profile_id=v_actor_id
              AND epm.status='active'
          )
        )
      )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cpc_can_assess_customer_rating(UUID,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cpc_can_assess_customer_rating(UUID,UUID) TO authenticated;

-- Only return the owner for customers the user can already view. Ownership
-- remains authoritative in cpc_external_profile_mappings / external source.
CREATE FUNCTION public.cpc_customer_maintenance_owners(p_customer_ids UUID[])
RETURNS TABLE(customer_reference_id UUID, owner_profile_id UUID, owner_name TEXT, can_assess BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT cr.id,
         COALESCE(epm.profile_id,cr.created_by_profile_id),
         COALESCE(prof.full_name,prov.full_name,epm.display_name_snapshot),
         public.cpc_can_assess_customer_rating(cr.id,cr.org_id)
  FROM public.cpc_customer_references cr
  LEFT JOIN public.cpc_external_profile_mappings epm
    ON cr.reference_kind='canonical'
    AND epm.org_id=cr.org_id
    AND epm.external_source=cr.external_source
    AND epm.external_person_id=cr.external_owner_reference
    AND epm.status='active'
  LEFT JOIN public.profiles prof
    ON prof.org_id=cr.org_id AND prof.id=epm.profile_id AND prof.is_active=TRUE
  LEFT JOIN public.profiles prov
    ON prov.org_id=cr.org_id AND prov.id=cr.created_by_profile_id
       AND prov.is_active=TRUE
  WHERE cr.org_id::TEXT=public.auth_org_id()
    AND cr.id=ANY(p_customer_ids)
    AND cardinality(p_customer_ids) <= 500
    AND public.cpc_can_read_customer_reference(cr.id,cr.org_id);
$$;
REVOKE ALL ON FUNCTION public.cpc_customer_maintenance_owners(UUID[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cpc_customer_maintenance_owners(UUID[]) TO authenticated;

CREATE FUNCTION public.cpc_save_customer_potential_rating(
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
  v_row public.cpc_customer_potential_assessments%ROWTYPE;
  v_before JSONB;
  v_new_status TEXT;
BEGIN
  SELECT org_id INTO v_org_id FROM public.profiles
    WHERE id=v_actor_id AND user_id=auth.uid() AND is_active=TRUE
      AND role IN ('admin','manager','sales') LIMIT 1;
  IF v_org_id IS NULL OR NOT public.cpc_can_assess_customer_rating(
    p_customer_reference_id,v_org_id
  ) THEN
    RETURN public.cpc_rpc_error('FORBIDDEN','无客户潜力评估权限');
  END IF;

  IF jsonb_typeof(p_scores) IS DISTINCT FROM 'object' THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT','必须提交五项评分');
  END IF;
  FOREACH v_field IN ARRAY ARRAY[
    'purchase_scope','process_fit','project_evidence','decision_access','repeat_value'
  ] LOOP
    IF COALESCE(p_scores->>v_field,'') !~ '^[0-5]$' THEN
      RETURN public.cpc_rpc_error('INVALID_INPUT','五项评分均需为0到5分');
    END IF;
  END LOOP;
  IF (SELECT COUNT(*) FROM jsonb_object_keys(p_scores)) <> 5
    OR LENGTH(COALESCE(p_evidence_summary,''))>3000
    OR LENGTH(COALESCE(p_opportunity_summary,''))>2000
    OR LENGTH(COALESCE(p_next_action,''))>300
    OR (p_estimated_annual_opportunity_cny_yuan IS NOT NULL
        AND p_estimated_annual_opportunity_cny_yuan < 0) THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT','评分或文本内容超出允许范围');
  END IF;

  v_score:=(p_scores->>'purchase_scope')::int*6
       +(p_scores->>'process_fit')::int*5
       +(p_scores->>'project_evidence')::int*4
       +(p_scores->>'decision_access')::int*3
       +(p_scores->>'repeat_value')::int*2;
  IF p_submit AND (
    length(btrim(coalesce(p_evidence_summary,''))) < 20
    OR length(btrim(coalesce(p_opportunity_summary,''))) < 10
    OR length(btrim(coalesce(p_next_action,''))) < 5
    OR p_next_check_on IS NULL
  ) THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT','提交审核需要客观依据、机会说明、下一步动作和日期');
  END IF;

  v_new_status:=CASE WHEN p_submit THEN 'pending_review' ELSE 'draft' END;

  SELECT * INTO v_row FROM public.cpc_customer_potential_assessments
    WHERE org_id=v_org_id AND customer_reference_id=p_customer_reference_id FOR UPDATE;

  IF FOUND THEN
    IF p_expected_version IS NULL OR p_expected_version<>v_row.version THEN
      RETURN public.cpc_rpc_error('VERSION_CONFLICT','评分已被更新，请刷新后重试');
    END IF;
    v_before:=to_jsonb(v_row);
    UPDATE public.cpc_customer_potential_assessments SET
      assessor_profile_id=v_actor_id, scores=p_scores, assessment_score=v_score,
      evidence_summary=btrim(coalesce(p_evidence_summary,'')),
      opportunity_summary=btrim(coalesce(p_opportunity_summary,'')),
      estimated_annual_opportunity_cny_yuan=p_estimated_annual_opportunity_cny_yuan,
      next_action=btrim(coalesce(p_next_action,'')),next_check_on=p_next_check_on,
      status=v_new_status, reviewer_profile_id=NULL, review_note=NULL,reviewed_at=NULL,
      version=v_row.version+1
    WHERE id=v_row.id RETURNING * INTO v_row;
  ELSE
    IF p_expected_version IS NOT NULL THEN
      RETURN public.cpc_rpc_error('VERSION_CONFLICT','新评分的版本不匹配');
    END IF;
    v_before:=NULL;
    INSERT INTO public.cpc_customer_potential_assessments(
      org_id,customer_reference_id,assessor_profile_id,scores,assessment_score,
      evidence_summary,opportunity_summary,estimated_annual_opportunity_cny_yuan,
      next_action,next_check_on,status
    ) VALUES (
      v_org_id,p_customer_reference_id,v_actor_id,p_scores,v_score,
      btrim(coalesce(p_evidence_summary,'')),
      btrim(coalesce(p_opportunity_summary,'')),
      p_estimated_annual_opportunity_cny_yuan,
      btrim(coalesce(p_next_action,'')),p_next_check_on,v_new_status
    ) RETURNING * INTO v_row;
  END IF;
  INSERT INTO public.cpc_audit_log(
    org_id,entity_type,entity_id,action,actor_profile_id,reason,
    before_values,after_values,metadata,request_id
  ) VALUES (
    v_org_id,'CUSTOMER_POTENTIAL_RATING',v_row.id,
    CASE WHEN p_submit THEN 'POTENTIAL_RATING_SUBMITTED' ELSE 'POTENTIAL_RATING_DRAFT_SAVED' END,
    v_actor_id,NULL,
    v_before,
    to_jsonb(v_row),
    jsonb_build_object('customer_reference_id',p_customer_reference_id,'rating_type','potential'),
    p_request_id
  );
  RETURN jsonb_build_object('ok',TRUE,'code','OK','data',
    jsonb_build_object('id',v_row.id,'version',v_row.version,'status',v_row.status));
END;
$$;
REVOKE ALL ON FUNCTION public.cpc_save_customer_potential_rating(
  UUID,JSONB,TEXT,TEXT,BIGINT,TEXT,DATE,BOOLEAN,INTEGER,UUID
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cpc_save_customer_potential_rating(
  UUID,JSONB,TEXT,TEXT,BIGINT,TEXT,DATE,BOOLEAN,INTEGER,UUID
) TO authenticated;

CREATE FUNCTION public.cpc_review_customer_potential_rating(
  p_customer_reference_id UUID,
  p_expected_version INTEGER,
  p_decision TEXT,
  p_review_note TEXT DEFAULT NULL,
  p_request_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id UUID := public.auth_profile_id();
  v_org_id UUID;
  v_row public.cpc_customer_potential_assessments%ROWTYPE;
  v_before JSONB;
  v_grade TEXT;
BEGIN
  SELECT org_id INTO v_org_id FROM public.profiles
    WHERE id=v_actor_id AND user_id=auth.uid() AND is_active=TRUE
      AND role IN ('admin','manager') LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN public.cpc_rpc_error('FORBIDDEN','仅管理人员可审核潜力评级');
  END IF;
  IF p_decision NOT IN ('approve','request_changes') OR p_decision IS NULL
     OR length(coalesce(p_review_note,''))>1000
     OR (p_decision='request_changes' AND length(btrim(coalesce(p_review_note,'')))<5)
  THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT','审核决定或退回原因无效');
  END IF;
  SELECT * INTO v_row FROM public.cpc_customer_potential_assessments
    WHERE org_id=v_org_id AND customer_reference_id=p_customer_reference_id FOR UPDATE;
  IF NOT FOUND THEN RETURN public.cpc_rpc_error('NOT_FOUND','该客户尚未提交潜力评级'); END IF;
  IF v_row.version<>p_expected_version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT','评分已被更新，请刷新后重试');
  END IF;
  IF v_row.status<>'pending_review' THEN
    RETURN public.cpc_rpc_error('INVALID_TRANSITION','只能审核待审核评分');
  END IF;
  v_before:=to_jsonb(v_row);
  v_grade:=CASE
    WHEN v_row.assessment_score>=90 THEN 'SS'
    WHEN v_row.assessment_score>=80 THEN 'S'
    WHEN v_row.assessment_score>=70 THEN 'A'
    WHEN v_row.assessment_score>=55 THEN 'B'
    WHEN v_row.assessment_score>=35 THEN 'C'
    ELSE 'D'
  END;
  UPDATE public.cpc_customer_potential_assessments SET
    status=CASE WHEN p_decision='approve' THEN 'approved' ELSE 'changes_requested' END,
    reviewer_profile_id=v_actor_id,
    reviewed_at=NOW(),review_note=NULLIF(btrim(coalesce(p_review_note,'')),''),
    published_grade=CASE WHEN p_decision='approve' THEN v_grade ELSE published_grade END,
    published_score=CASE WHEN p_decision='approve' THEN assessment_score ELSE published_score END,
    published_at=CASE WHEN p_decision='approve' THEN NOW() ELSE published_at END,
    version=v_row.version+1
  WHERE id=v_row.id RETURNING * INTO v_row;
  INSERT INTO public.cpc_audit_log(
    org_id,entity_type,entity_id,action,actor_profile_id,reason,
    before_values,after_values,metadata,request_id
  ) VALUES (
    v_org_id,'CUSTOMER_POTENTIAL_RATING',v_row.id,
    CASE WHEN p_decision='approve' THEN 'POTENTIAL_RATING_APPROVED'
      ELSE 'POTENTIAL_RATING_CHANGES_REQUESTED' END,
    v_actor_id,p_review_note,v_before,to_jsonb(v_row),
    jsonb_build_object('customer_reference_id',p_customer_reference_id,'rating_type','potential'),
    p_request_id
  );
  RETURN jsonb_build_object('ok',TRUE,'code','OK','data',
    jsonb_build_object('id',v_row.id,'version',v_row.version,'status',v_row.status,
      'published_grade',v_row.published_grade));
END;
$$;
REVOKE ALL ON FUNCTION public.cpc_review_customer_potential_rating(
  UUID,INTEGER,TEXT,TEXT,UUID
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cpc_review_customer_potential_rating(
  UUID,INTEGER,TEXT,TEXT,UUID
) TO authenticated;

COMMIT;
