-- CPC customer notes and commercial development plan, deliberately separate from P grading.
-- Additive only. Apply to Dev before Production approval, never changes external customer master or finance.
BEGIN;

CREATE TABLE public.cpc_customer_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_reference_id UUID NOT NULL,
  customer_note TEXT NOT NULL DEFAULT '' CHECK (char_length(customer_note) <= 3000),
  note_version INTEGER NOT NULL DEFAULT 0 CHECK (note_version >= 0),
  note_updated_by UUID,
  note_updated_at TIMESTAMPTZ,
  opportunity_summary TEXT NOT NULL DEFAULT '' CHECK (char_length(opportunity_summary) <= 2000),
  estimated_annual_opportunity_cny_yuan BIGINT
    CHECK (estimated_annual_opportunity_cny_yuan >= 0 AND estimated_annual_opportunity_cny_yuan <= 1000000000),
  next_action TEXT NOT NULL DEFAULT '' CHECK (char_length(next_action) <= 300),
  next_check_on DATE,
  plan_version INTEGER NOT NULL DEFAULT 0 CHECK (plan_version >= 0),
  plan_updated_by UUID,
  plan_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cpc_customer_workspaces_org_ref UNIQUE (org_id, customer_reference_id),
  CONSTRAINT fk_cpc_workspaces_reference_org
    FOREIGN KEY (customer_reference_id, org_id)
    REFERENCES public.cpc_customer_references(id, org_id),
  CONSTRAINT fk_cpc_workspaces_note_actor_org
    FOREIGN KEY (note_updated_by, org_id)
    REFERENCES public.profiles(id, org_id),
  CONSTRAINT fk_cpc_workspaces_plan_actor_org
    FOREIGN KEY (plan_updated_by, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE TRIGGER trg_cpc_workspace_updated_at
  BEFORE UPDATE ON public.cpc_customer_workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cpc_customer_workspaces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cpc_customer_workspaces FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cpc_customer_workspaces TO authenticated;
CREATE POLICY cpc_customer_workspace_select_authorized
  ON public.cpc_customer_workspaces FOR SELECT TO authenticated
  USING (public.cpc_can_read_customer_reference(customer_reference_id, org_id));

-- Preserve any sales plan entered before the split, without changing P rating records.
-- This has no effect where existing opportunity fields were empty.
INSERT INTO public.cpc_customer_workspaces (
  org_id, customer_reference_id, opportunity_summary,
  estimated_annual_opportunity_cny_yuan, next_action, next_check_on,
  plan_version, plan_updated_by, plan_updated_at
)
SELECT
  a.org_id, a.customer_reference_id, a.opportunity_summary,
  a.estimated_annual_opportunity_cny_yuan, a.next_action, a.next_check_on,
  1, a.assessor_profile_id, a.updated_at
FROM public.cpc_customer_potential_assessments AS a
WHERE a.opportunity_summary <> ''
   OR a.estimated_annual_opportunity_cny_yuan IS NOT NULL
   OR a.next_action <> '' OR a.next_check_on IS NOT NULL
ON CONFLICT (org_id, customer_reference_id) DO NOTHING;

-- Notes are CPC-only internal observations; they do not overwrite the customer master.
CREATE FUNCTION public.cpc_save_customer_note(
  p_customer_reference_id UUID,
  p_note TEXT,
  p_expected_version INTEGER,
  p_request_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id UUID := public.auth_profile_id();
  v_org_id UUID;
  v_old public.cpc_customer_workspaces%ROWTYPE;
  v_new public.cpc_customer_workspaces%ROWTYPE;
  v_exists BOOLEAN := FALSE;
BEGIN
  SELECT org_id INTO v_org_id FROM public.profiles
  WHERE id=v_actor_id AND user_id=auth.uid() AND is_active=TRUE
    AND role IN ('admin','manager','sales') LIMIT 1;
  IF v_org_id IS NULL OR NOT public.cpc_can_assess_customer_rating(
    p_customer_reference_id, v_org_id
  ) THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无权限修改客户备注');
  END IF;
  IF p_expected_version IS NULL OR p_expected_version < 0
     OR char_length(coalesce(p_note,'')) > 3000 THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', '备注长度或版本不正确');
  END IF;

  SELECT * INTO v_old FROM public.cpc_customer_workspaces
    WHERE org_id=v_org_id AND customer_reference_id=p_customer_reference_id FOR UPDATE;
  v_exists := FOUND;
  IF (v_exists AND v_old.note_version <> p_expected_version)
     OR (NOT v_exists AND p_expected_version <> 0) THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', '备注版本已变化，请刷新重试');
  END IF;

  INSERT INTO public.cpc_customer_workspaces (
    org_id, customer_reference_id, customer_note, note_version, note_updated_by, note_updated_at
  ) VALUES (
    v_org_id, p_customer_reference_id, coalesce(p_note,''), 1, v_actor_id, now()
  )
  ON CONFLICT (org_id, customer_reference_id)
  DO UPDATE SET
    customer_note=EXCLUDED.customer_note,
    note_version=public.cpc_customer_workspaces.note_version+1,
    note_updated_by=v_actor_id,
    note_updated_at=now()
  WHERE public.cpc_customer_workspaces.note_version=p_expected_version
  RETURNING * INTO v_new;

  IF v_new.id IS NULL THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT','客户备注已被其他人更新');
  END IF;

  INSERT INTO public.cpc_audit_log (
    org_id, entity_type, entity_id, action, actor_profile_id, reason,
    before_values, after_values, metadata, request_id
  ) VALUES (
    v_org_id, 'CUSTOMER_WORKSPACE', v_new.id, 'CUSTOMER_NOTE_SAVED', v_actor_id, NULL,
    CASE WHEN v_exists THEN jsonb_build_object('note',v_old.customer_note,'version',v_old.note_version) END,
    jsonb_build_object('note',v_new.customer_note,'version',v_new.note_version),
    jsonb_build_object('customer_reference_id',p_customer_reference_id,'section','note'),
    p_request_id
  );
  RETURN jsonb_build_object('ok',TRUE,'code','OK','data',
    jsonb_build_object('version',v_new.note_version));
END;
$$;
REVOKE ALL ON FUNCTION public.cpc_save_customer_note(UUID,TEXT,INTEGER,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cpc_save_customer_note(UUID,TEXT,INTEGER,UUID) TO authenticated;

-- The commercial plan is a live owner-maintained section, not a scoring requirement.
-- Saving it must NOT reset approved P grades or pending manager reviews.
CREATE FUNCTION public.cpc_save_customer_development_plan(
  p_customer_reference_id UUID,
  p_opportunity_summary TEXT,
  p_estimated_annual_opportunity_cny_yuan BIGINT,
  p_next_action TEXT,
  p_next_check_on DATE,
  p_expected_version INTEGER,
  p_request_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id UUID := public.auth_profile_id();
  v_org_id UUID;
  v_old public.cpc_customer_workspaces%ROWTYPE;
  v_new public.cpc_customer_workspaces%ROWTYPE;
  v_exists BOOLEAN := FALSE;
BEGIN
  SELECT org_id INTO v_org_id FROM public.profiles
  WHERE id=v_actor_id AND user_id=auth.uid() AND is_active=TRUE
    AND role IN ('admin','manager','sales') LIMIT 1;
  IF v_org_id IS NULL OR NOT public.cpc_can_assess_customer_rating(
    p_customer_reference_id, v_org_id
  ) THEN
    RETURN public.cpc_rpc_error('FORBIDDEN','无权限修改客户开发计划');
  END IF;
  IF p_expected_version IS NULL OR p_expected_version < 0
    OR char_length(coalesce(p_opportunity_summary,'')) > 2000
    OR char_length(coalesce(p_next_action,'')) > 300
    OR (p_estimated_annual_opportunity_cny_yuan IS NOT NULL
      AND (p_estimated_annual_opportunity_cny_yuan < 0
         OR p_estimated_annual_opportunity_cny_yuan > 1000000000)) THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT','开发计划内容、金额或版本不正确');
  END IF;

  SELECT * INTO v_old FROM public.cpc_customer_workspaces
    WHERE org_id=v_org_id AND customer_reference_id=p_customer_reference_id FOR UPDATE;
  v_exists := FOUND;
  IF (v_exists AND v_old.plan_version <> p_expected_version)
    OR (NOT v_exists AND p_expected_version <> 0) THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT','开发计划版本已变化，请刷新重试');
  END IF;

  INSERT INTO public.cpc_customer_workspaces (
    org_id, customer_reference_id, opportunity_summary,
    estimated_annual_opportunity_cny_yuan, next_action, next_check_on,
    plan_version, plan_updated_by, plan_updated_at
  ) VALUES (
    v_org_id, p_customer_reference_id, btrim(coalesce(p_opportunity_summary,'')),
    p_estimated_annual_opportunity_cny_yuan, btrim(coalesce(p_next_action,'')),
    p_next_check_on, 1, v_actor_id, now()
  )
  ON CONFLICT (org_id, customer_reference_id)
  DO UPDATE SET
    opportunity_summary=EXCLUDED.opportunity_summary,
    estimated_annual_opportunity_cny_yuan=EXCLUDED.estimated_annual_opportunity_cny_yuan,
    next_action=EXCLUDED.next_action,
    next_check_on=EXCLUDED.next_check_on,
    plan_version=public.cpc_customer_workspaces.plan_version+1,
    plan_updated_by=v_actor_id,
    plan_updated_at=now()
  WHERE public.cpc_customer_workspaces.plan_version=p_expected_version
  RETURNING * INTO v_new;

  IF v_new.id IS NULL THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT','客户开发计划已被其他人更新');
  END IF;

  INSERT INTO public.cpc_audit_log (
    org_id, entity_type, entity_id, action, actor_profile_id, reason,
    before_values, after_values, metadata, request_id
  ) VALUES (
    v_org_id, 'CUSTOMER_WORKSPACE', v_new.id, 'CUSTOMER_DEVELOPMENT_PLAN_SAVED',
    v_actor_id, NULL,
    CASE WHEN v_exists THEN jsonb_build_object(
      'opportunity_summary',v_old.opportunity_summary,
      'estimated_annual_opportunity_cny_yuan',v_old.estimated_annual_opportunity_cny_yuan,
      'next_action',v_old.next_action,'next_check_on',v_old.next_check_on,'version',v_old.plan_version
    ) END,
    jsonb_build_object(
      'opportunity_summary',v_new.opportunity_summary,
      'estimated_annual_opportunity_cny_yuan',v_new.estimated_annual_opportunity_cny_yuan,
      'next_action',v_new.next_action,'next_check_on',v_new.next_check_on,'version',v_new.plan_version
    ),
    jsonb_build_object('customer_reference_id',p_customer_reference_id,'section','development_plan'),
    p_request_id
  );
  RETURN jsonb_build_object('ok',TRUE,'code','OK','data',
    jsonb_build_object('version',v_new.plan_version));
END;
$$;
REVOKE ALL ON FUNCTION public.cpc_save_customer_development_plan(
  UUID,TEXT,BIGINT,TEXT,DATE,INTEGER,UUID
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cpc_save_customer_development_plan(
  UUID,TEXT,BIGINT,TEXT,DATE,INTEGER,UUID
) TO authenticated;

-- Keep the existing RPC signature for compatibility, but score and save
-- ONLY scoring + evidence. Deprecated sales-plan arguments are ignored.
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
  IF (SELECT count(*) FROM jsonb_object_keys(p_scores)) <> 5
     OR char_length(coalesce(p_evidence_summary,'')) > 3000 THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT','评分或事实依据内容超出范围');
  END IF;
  IF p_submit AND char_length(btrim(coalesce(p_evidence_summary,''))) < 20 THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT','提交审核需至少20字事实依据');
  END IF;

  v_score := (p_scores->>'purchase_scope')::int*6
           + (p_scores->>'process_fit')::int*5
           + (p_scores->>'project_evidence')::int*4
           + (p_scores->>'decision_access')::int*3
           + (p_scores->>'repeat_value')::int*2;
  v_new_status:=CASE WHEN p_submit THEN 'pending_review' ELSE 'draft' END;
  SELECT * INTO v_row FROM public.cpc_customer_potential_assessments
    WHERE org_id=v_org_id AND customer_reference_id=p_customer_reference_id FOR UPDATE;
  IF FOUND THEN
    IF p_expected_version IS NULL OR v_row.version<>p_expected_version THEN
      RETURN public.cpc_rpc_error('VERSION_CONFLICT','评分已变化，请刷新后重试');
    END IF;
    v_before:=to_jsonb(v_row);
    UPDATE public.cpc_customer_potential_assessments SET
      assessor_profile_id=v_actor_id,scores=p_scores,assessment_score=v_score,
      evidence_summary=btrim(coalesce(p_evidence_summary,'')),
      status=v_new_status,reviewer_profile_id=NULL,review_note=NULL,reviewed_at=NULL,
      version=v_row.version+1
    WHERE id=v_row.id RETURNING * INTO v_row;
  ELSE
    IF p_expected_version IS NOT NULL THEN
      RETURN public.cpc_rpc_error('VERSION_CONFLICT','新评分的版本不匹配');
    END IF;
    v_before:=NULL;
    INSERT INTO public.cpc_customer_potential_assessments(
      org_id,customer_reference_id,assessor_profile_id,scores,assessment_score,
      evidence_summary,status
    ) VALUES (
      v_org_id,p_customer_reference_id,v_actor_id,p_scores,v_score,
      btrim(coalesce(p_evidence_summary,'')),v_new_status
    ) RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.cpc_audit_log(
    org_id,entity_type,entity_id,action,actor_profile_id,reason,
    before_values,after_values,metadata,request_id
  ) VALUES (
    v_org_id,'CUSTOMER_POTENTIAL_RATING',v_row.id,
    CASE WHEN p_submit THEN 'POTENTIAL_RATING_SUBMITTED' ELSE 'POTENTIAL_RATING_DRAFT_SAVED' END,
    v_actor_id,NULL,
    v_before,to_jsonb(v_row),
    jsonb_build_object('customer_reference_id',p_customer_reference_id,
      'rating_type','potential','sales_plan_changed',FALSE),
    p_request_id
  );
  RETURN jsonb_build_object('ok',TRUE,'code','OK','data',
    jsonb_build_object('id',v_row.id,'version',v_row.version,'status',v_row.status));
END;
$$;

COMMIT;
