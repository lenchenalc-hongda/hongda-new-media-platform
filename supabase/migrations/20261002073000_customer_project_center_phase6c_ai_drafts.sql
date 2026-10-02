-- Customer Project Center - Phase 6C AI suggestion persistence and review
-- Repository migration only. DO NOT execute in Production without explicit owner approval.
-- Scope:
--   - materialize the already-approved Phase 4 cpc_ai_drafts persistence contract
--   - allow human-reviewed AI WORK_ITEM suggestions for NEXT_ACTION / FOLLOW_UP only
--   - accepted suggestions must use the same controlled WorkItem creation rules
-- Safety:
--   - no AI auto-accept
--   - no order/payment/quote/ownership/owner mutation
--   - no direct authenticated table DML
--   - no Production execution in this task

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Non-authoritative AI draft staging table (approved in Phase 4)
-- ---------------------------------------------------------------------------

CREATE TABLE public.cpc_ai_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_reference_id UUID,
  project_id UUID,

  proposal_type TEXT NOT NULL
    CHECK (proposal_type IN (
      'PROJECT_EVENT',
      'WORK_ITEM',
      'PROJECT_FIELD_UPDATE',
      'CUSTOMER_REFERENCE',
      'REPORT_NARRATIVE'
    )),
  raw_input TEXT NOT NULL,
  structured_proposal JSONB NOT NULL,
  proposal_schema_version INTEGER NOT NULL DEFAULT 1
    CHECK (proposal_schema_version >= 1),

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'accepted', 'rejected', 'expired')),

  created_by_profile_id UUID NOT NULL,
  accepted_by_profile_id UUID,
  accepted_at TIMESTAMPTZ,
  rejected_by_profile_id UUID,
  rejected_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_cpc_ai_drafts_id_org UNIQUE (id, org_id),

  CONSTRAINT chk_cpc_ai_draft_raw_input
    CHECK (length(btrim(raw_input)) > 0),

  CONSTRAINT chk_cpc_ai_draft_terminal_metadata
    CHECK (
      (
        status = 'draft'
        AND accepted_by_profile_id IS NULL
        AND accepted_at IS NULL
        AND rejected_by_profile_id IS NULL
        AND rejected_at IS NULL
      )
      OR
      (
        status = 'accepted'
        AND accepted_by_profile_id IS NOT NULL
        AND accepted_at IS NOT NULL
        AND rejected_by_profile_id IS NULL
        AND rejected_at IS NULL
      )
      OR
      (
        status = 'rejected'
        AND rejected_by_profile_id IS NOT NULL
        AND rejected_at IS NOT NULL
        AND accepted_by_profile_id IS NULL
        AND accepted_at IS NULL
      )
      OR
      (
        status = 'expired'
        AND accepted_by_profile_id IS NULL
        AND accepted_at IS NULL
        AND rejected_by_profile_id IS NULL
        AND rejected_at IS NULL
      )
    ),

  CONSTRAINT fk_cpc_ai_draft_customer_org
    FOREIGN KEY (customer_reference_id, org_id)
    REFERENCES public.cpc_customer_references(id, org_id),

  CONSTRAINT fk_cpc_ai_draft_project_org
    FOREIGN KEY (project_id, org_id)
    REFERENCES public.cpc_projects(id, org_id),

  CONSTRAINT fk_cpc_ai_draft_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),

  CONSTRAINT fk_cpc_ai_draft_accepted_by_org
    FOREIGN KEY (accepted_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),

  CONSTRAINT fk_cpc_ai_draft_rejected_by_org
    FOREIGN KEY (rejected_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE INDEX idx_cpc_ai_drafts_org_status_created
  ON public.cpc_ai_drafts(org_id, status, created_at DESC);

CREATE INDEX idx_cpc_ai_drafts_org_project_status
  ON public.cpc_ai_drafts(org_id, project_id, status)
  WHERE project_id IS NOT NULL;

CREATE INDEX idx_cpc_ai_drafts_org_customer_status
  ON public.cpc_ai_drafts(org_id, customer_reference_id, status)
  WHERE customer_reference_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Read authorization helper + RLS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_can_read_ai_draft(
  p_ai_draft_id UUID,
  p_org_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID := public.auth_profile_id();
  v_actor_org_id TEXT := public.auth_org_id();
BEGIN
  IF v_actor_profile_id IS NULL
     OR v_actor_org_id IS NULL
     OR p_org_id::TEXT <> v_actor_org_id THEN
    RETURN FALSE;
  END IF;

  IF public.auth_has_role('admin') OR public.auth_has_role('manager') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cpc_ai_drafts d
      WHERE d.id = p_ai_draft_id
        AND d.org_id = p_org_id
    );
  END IF;

  IF NOT public.auth_has_role('sales') THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cpc_ai_drafts d
    WHERE d.id = p_ai_draft_id
      AND d.org_id = p_org_id
      AND (
        d.created_by_profile_id = v_actor_profile_id
        OR (
          d.project_id IS NOT NULL
          AND public.cpc_can_read_project(d.project_id, d.org_id)
        )
        OR (
          d.project_id IS NULL
          AND d.customer_reference_id IS NOT NULL
          AND public.cpc_can_read_customer_reference(
            d.customer_reference_id,
            d.org_id
          )
        )
      )
  );
END;
$$;

ALTER TABLE public.cpc_ai_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpc_ai_drafts_select"
  ON public.cpc_ai_drafts
  FOR SELECT
  USING (
    public.cpc_can_read_ai_draft(id, org_id)
  );

REVOKE ALL ON TABLE public.cpc_ai_drafts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cpc_ai_drafts TO authenticated;

REVOKE ALL ON FUNCTION public.cpc_can_read_ai_draft(UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cpc_can_read_ai_draft(UUID, UUID)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Controlled WorkItem creation used by human and accepted AI drafts
--    Phase 6C intentionally supports NEXT_ACTION / FOLLOW_UP only.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_create_work_item(
  p_customer_reference_id UUID,
  p_project_id UUID,
  p_work_item_type TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_due_at TIMESTAMPTZ DEFAULT NULL,
  p_priority TEXT DEFAULT 'medium',
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
  v_project public.cpc_projects%ROWTYPE;
  v_customer_id UUID;
  v_assignee_profile_id UUID;
  v_authorized BOOLEAN := FALSE;
  v_item_id UUID;
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

  IF p_work_item_type NOT IN ('NEXT_ACTION', 'FOLLOW_UP') THEN
    RETURN public.cpc_rpc_error(
      'INVALID_INPUT',
      'Phase 6C 仅允许创建下一步或客户回访任务'
    );
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', '任务标题不能为空');
  END IF;

  IF p_priority NOT IN ('low', 'medium', 'high', 'critical') THEN
    RETURN public.cpc_rpc_error('INVALID_PRIORITY', '任务优先级无效');
  END IF;

  IF p_work_item_type = 'NEXT_ACTION' THEN
    IF p_project_id IS NULL THEN
      RETURN public.cpc_rpc_error('INVALID_INPUT', '下一步任务必须属于具体项目');
    END IF;

    SELECT p.*
      INTO v_project
      FROM public.cpc_projects p
      WHERE p.id = p_project_id
        AND p.org_id = v_actor_org_id
      FOR UPDATE;

    IF NOT FOUND THEN
      RETURN public.cpc_rpc_error('NOT_FOUND', '项目不存在');
    END IF;

    v_authorized :=
      v_actor_role IN ('admin', 'manager')
      OR v_project.owner_profile_id = v_actor_profile_id
      OR EXISTS (
        SELECT 1
        FROM public.cpc_project_members pm
        WHERE pm.project_id = v_project.id
          AND pm.org_id = v_actor_org_id
          AND pm.profile_id = v_actor_profile_id
          AND pm.removed_at IS NULL
      );

    IF NOT v_authorized THEN
      RETURN public.cpc_rpc_error('FORBIDDEN', '无权为该项目建立下一步');
    END IF;

    IF v_project.status <> 'active' OR v_project.waiting_on <> 'none' THEN
      RETURN public.cpc_rpc_error(
        'INVALID_PROJECT_STATE',
        '只有未处于等待状态的活跃项目可新增下一步'
      );
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.cpc_work_items wi
      WHERE wi.project_id = v_project.id
        AND wi.org_id = v_actor_org_id
        AND wi.work_item_type = 'NEXT_ACTION'
        AND wi.status IN ('pending', 'in_progress', 'blocked')
    ) THEN
      RETURN public.cpc_rpc_error(
        'INVALID_NEXT_STEP',
        '项目已有未完成的下一步任务'
      );
    END IF;

    v_customer_id := v_project.customer_reference_id;
    v_assignee_profile_id := v_project.owner_profile_id;
  ELSE
    IF p_project_id IS NOT NULL OR p_customer_reference_id IS NULL THEN
      RETURN public.cpc_rpc_error(
        'INVALID_INPUT',
        '客户回访必须是 customer-level 且不能绑定项目'
      );
    END IF;

    IF NOT public.cpc_can_follow_customer(
      p_customer_reference_id,
      v_actor_org_id
    ) THEN
      RETURN public.cpc_rpc_error('FORBIDDEN', '无权维护该客户关系');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.cpc_work_items wi
      WHERE wi.org_id = v_actor_org_id
        AND wi.customer_reference_id = p_customer_reference_id
        AND wi.project_id IS NULL
        AND wi.work_item_type = 'FOLLOW_UP'
        AND wi.assignee_profile_id = v_actor_profile_id
        AND wi.status IN ('pending', 'in_progress', 'blocked')
    ) THEN
      RETURN public.cpc_rpc_error(
        'DUPLICATE_FOLLOW_UP',
        '当前客户已有未完成的回访任务'
      );
    END IF;

    v_customer_id := p_customer_reference_id;
    v_assignee_profile_id := v_actor_profile_id;
  END IF;

  INSERT INTO public.cpc_work_items (
    org_id,
    customer_reference_id,
    project_id,
    work_item_type,
    title,
    description,
    assignee_profile_id,
    created_by_profile_id,
    due_at,
    status,
    priority
  )
  VALUES (
    v_actor_org_id,
    v_customer_id,
    p_project_id,
    p_work_item_type,
    btrim(p_title),
    NULLIF(btrim(p_description), ''),
    v_assignee_profile_id,
    v_actor_profile_id,
    p_due_at,
    'pending',
    p_priority
  )
  RETURNING id INTO v_item_id;

  INSERT INTO public.cpc_audit_log (
    org_id,
    entity_type,
    entity_id,
    action,
    actor_profile_id,
    before_values,
    after_values,
    metadata,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'WORK_ITEM',
    v_item_id,
    'WORK_ITEM_CREATED',
    v_actor_profile_id,
    NULL,
    jsonb_build_object(
      'status', 'pending',
      'work_item_type', p_work_item_type,
      'due_at', p_due_at,
      'priority', p_priority,
      'version', 1
    ),
    jsonb_build_object(
      'customer_reference_id', v_customer_id,
      'project_id', p_project_id,
      'assignee_profile_id', v_assignee_profile_id
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'work_item_id', v_item_id,
      'work_item_type', p_work_item_type,
      'status', 'pending',
      'version', 1
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. AI WorkItem draft creation
--    This stages a proposal only. It does NOT create formal work.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_create_ai_work_item_draft(
  p_customer_reference_id UUID,
  p_project_id UUID,
  p_work_item_type TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_due_at TIMESTAMPTZ DEFAULT NULL,
  p_priority TEXT DEFAULT 'medium',
  p_raw_input TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
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
  v_project public.cpc_projects%ROWTYPE;
  v_customer_id UUID;
  v_authorized BOOLEAN := FALSE;
  v_draft_id UUID;
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
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效 AI 建议权限');
  END IF;

  IF p_work_item_type NOT IN ('NEXT_ACTION', 'FOLLOW_UP')
     OR p_title IS NULL
     OR btrim(p_title) = ''
     OR p_raw_input IS NULL
     OR btrim(p_raw_input) = ''
     OR p_priority NOT IN ('low', 'medium', 'high', 'critical') THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', 'AI 建议内容无效');
  END IF;

  IF p_work_item_type = 'NEXT_ACTION' THEN
    IF p_project_id IS NULL THEN
      RETURN public.cpc_rpc_error('INVALID_INPUT', '建议下一步必须属于具体项目');
    END IF;

    SELECT p.*
      INTO v_project
      FROM public.cpc_projects p
      WHERE p.id = p_project_id
        AND p.org_id = v_actor_org_id;

    IF NOT FOUND THEN
      RETURN public.cpc_rpc_error('NOT_FOUND', '项目不存在');
    END IF;

    v_authorized :=
      v_actor_role IN ('admin', 'manager')
      OR v_project.owner_profile_id = v_actor_profile_id
      OR v_project.created_by_profile_id = v_actor_profile_id
      OR EXISTS (
        SELECT 1
        FROM public.cpc_project_members pm
        WHERE pm.project_id = v_project.id
          AND pm.org_id = v_actor_org_id
          AND pm.profile_id = v_actor_profile_id
          AND pm.removed_at IS NULL
      );

    IF NOT v_authorized THEN
      RETURN public.cpc_rpc_error('FORBIDDEN', '无权为该项目创建 AI 建议');
    END IF;

    v_customer_id := v_project.customer_reference_id;
  ELSE
    IF p_project_id IS NOT NULL OR p_customer_reference_id IS NULL THEN
      RETURN public.cpc_rpc_error(
        'INVALID_INPUT',
        '建议客户回访必须保持在 customer-level'
      );
    END IF;

    IF NOT public.cpc_can_follow_customer(
      p_customer_reference_id,
      v_actor_org_id
    ) THEN
      RETURN public.cpc_rpc_error('FORBIDDEN', '无权为该客户创建 AI 建议');
    END IF;

    v_customer_id := p_customer_reference_id;
  END IF;

  INSERT INTO public.cpc_ai_drafts (
    org_id,
    customer_reference_id,
    project_id,
    proposal_type,
    raw_input,
    structured_proposal,
    proposal_schema_version,
    status,
    created_by_profile_id,
    expires_at
  )
  VALUES (
    v_actor_org_id,
    v_customer_id,
    p_project_id,
    'WORK_ITEM',
    btrim(p_raw_input),
    jsonb_build_object(
      'schemaVersion', 1,
      'action', 'CREATE_WORK_ITEM',
      'workItemType', p_work_item_type,
      'title', btrim(p_title),
      'description', NULLIF(btrim(p_description), ''),
      'dueAt', p_due_at,
      'priority', p_priority
    ),
    1,
    'draft',
    v_actor_profile_id,
    p_expires_at
  )
  RETURNING id INTO v_draft_id;

  INSERT INTO public.cpc_audit_log (
    org_id,
    entity_type,
    entity_id,
    action,
    actor_profile_id,
    before_values,
    after_values,
    metadata,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'AI_DRAFT',
    v_draft_id,
    'AI_DRAFT_CREATED',
    v_actor_profile_id,
    NULL,
    jsonb_build_object(
      'status', 'draft',
      'proposal_type', 'WORK_ITEM',
      'version', 1
    ),
    jsonb_build_object(
      'work_item_type', p_work_item_type,
      'project_id', p_project_id,
      'customer_reference_id', v_customer_id
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'ai_draft_id', v_draft_id,
      'status', 'draft',
      'version', 1
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Accept AI draft
--    Acceptance calls the same controlled cpc_create_work_item mutation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_accept_ai_draft(
  p_ai_draft_id UUID,
  p_expected_version INTEGER,
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
  v_draft public.cpc_ai_drafts%ROWTYPE;
  v_project public.cpc_projects%ROWTYPE;
  v_authorized BOOLEAN := FALSE;
  v_result JSONB;
  v_work_item_id UUID;
  v_new_version INTEGER;
  v_work_item_type TEXT;
  v_title TEXT;
  v_description TEXT;
  v_due_at TIMESTAMPTZ;
  v_priority TEXT;
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
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效 AI 建议权限');
  END IF;

  SELECT d.*
    INTO v_draft
    FROM public.cpc_ai_drafts d
    WHERE d.id = p_ai_draft_id
      AND d.org_id = v_actor_org_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.cpc_rpc_error('NOT_FOUND', 'AI 建议不存在');
  END IF;

  IF p_expected_version IS NULL
     OR p_expected_version <> v_draft.version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', 'AI 建议版本已变化');
  END IF;

  IF v_draft.status <> 'draft' THEN
    RETURN public.cpc_rpc_error('INVALID_TRANSITION', 'AI 建议已经处理');
  END IF;

  IF v_draft.expires_at IS NOT NULL AND v_draft.expires_at <= NOW() THEN
    UPDATE public.cpc_ai_drafts d
      SET status = 'expired',
          version = d.version + 1,
          updated_at = NOW()
      WHERE d.id = v_draft.id
        AND d.org_id = v_actor_org_id;

    INSERT INTO public.cpc_audit_log (
      org_id, entity_type, entity_id, action, actor_profile_id,
      before_values, after_values, request_id
    )
    VALUES (
      v_actor_org_id, 'AI_DRAFT', v_draft.id, 'AI_DRAFT_EXPIRED',
      v_actor_profile_id,
      jsonb_build_object('status', 'draft', 'version', v_draft.version),
      jsonb_build_object('status', 'expired', 'version', v_draft.version + 1),
      p_request_id
    );

    RETURN public.cpc_rpc_error('DRAFT_EXPIRED', 'AI 建议已过期');
  END IF;

  v_authorized :=
    v_actor_role IN ('admin', 'manager')
    OR v_draft.created_by_profile_id = v_actor_profile_id;

  IF NOT v_authorized AND v_draft.project_id IS NOT NULL THEN
    SELECT p.*
      INTO v_project
      FROM public.cpc_projects p
      WHERE p.id = v_draft.project_id
        AND p.org_id = v_actor_org_id;

    IF FOUND THEN
      v_authorized := v_project.owner_profile_id = v_actor_profile_id;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无权接受该 AI 建议');
  END IF;

  IF v_draft.proposal_type <> 'WORK_ITEM'
     OR v_draft.proposal_schema_version <> 1
     OR v_draft.structured_proposal ->> 'action' <> 'CREATE_WORK_ITEM' THEN
    RETURN public.cpc_rpc_error(
      'INVALID_INPUT',
      '当前 AI 建议类型不能直接接受为正式任务'
    );
  END IF;

  v_work_item_type := v_draft.structured_proposal ->> 'workItemType';
  v_title := v_draft.structured_proposal ->> 'title';
  v_description := v_draft.structured_proposal ->> 'description';
  v_priority := COALESCE(v_draft.structured_proposal ->> 'priority', 'medium');

  BEGIN
    IF NULLIF(v_draft.structured_proposal ->> 'dueAt', '') IS NULL THEN
      v_due_at := NULL;
    ELSE
      v_due_at := (v_draft.structured_proposal ->> 'dueAt')::TIMESTAMPTZ;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', 'AI 建议时间格式无效');
  END;

  v_result := public.cpc_create_work_item(
    v_draft.customer_reference_id,
    v_draft.project_id,
    v_work_item_type,
    v_title,
    v_description,
    v_due_at,
    v_priority,
    p_request_id
  );

  IF COALESCE((v_result ->> 'ok')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  v_work_item_id := (v_result -> 'data' ->> 'work_item_id')::UUID;

  UPDATE public.cpc_ai_drafts d
    SET status = 'accepted',
        accepted_by_profile_id = v_actor_profile_id,
        accepted_at = NOW(),
        version = d.version + 1,
        updated_at = NOW()
    WHERE d.id = v_draft.id
      AND d.org_id = v_actor_org_id
    RETURNING version INTO v_new_version;

  INSERT INTO public.cpc_audit_log (
    org_id,
    entity_type,
    entity_id,
    action,
    actor_profile_id,
    before_values,
    after_values,
    metadata,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'AI_DRAFT',
    v_draft.id,
    'AI_DRAFT_ACCEPTED',
    v_actor_profile_id,
    jsonb_build_object(
      'status', 'draft',
      'version', v_draft.version
    ),
    jsonb_build_object(
      'status', 'accepted',
      'version', v_new_version
    ),
    jsonb_build_object(
      'created_work_item_id', v_work_item_id,
      'work_item_type', v_work_item_type
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'ai_draft_id', v_draft.id,
      'status', 'accepted',
      'version', v_new_version,
      'created_work_item_id', v_work_item_id
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Reject AI draft
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cpc_reject_ai_draft(
  p_ai_draft_id UUID,
  p_expected_version INTEGER,
  p_reason TEXT DEFAULT NULL,
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
  v_draft public.cpc_ai_drafts%ROWTYPE;
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
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效 AI 建议权限');
  END IF;

  SELECT d.*
    INTO v_draft
    FROM public.cpc_ai_drafts d
    WHERE d.id = p_ai_draft_id
      AND d.org_id = v_actor_org_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.cpc_rpc_error('NOT_FOUND', 'AI 建议不存在');
  END IF;

  IF p_expected_version IS NULL
     OR p_expected_version <> v_draft.version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', 'AI 建议版本已变化');
  END IF;

  IF v_draft.status <> 'draft' THEN
    RETURN public.cpc_rpc_error('INVALID_TRANSITION', 'AI 建议已经处理');
  END IF;

  v_authorized :=
    v_actor_role IN ('admin', 'manager')
    OR v_draft.created_by_profile_id = v_actor_profile_id;

  IF NOT v_authorized AND v_draft.project_id IS NOT NULL THEN
    SELECT p.*
      INTO v_project
      FROM public.cpc_projects p
      WHERE p.id = v_draft.project_id
        AND p.org_id = v_actor_org_id;

    IF FOUND THEN
      v_authorized := v_project.owner_profile_id = v_actor_profile_id;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无权拒绝该 AI 建议');
  END IF;

  UPDATE public.cpc_ai_drafts d
    SET status = 'rejected',
        rejected_by_profile_id = v_actor_profile_id,
        rejected_at = NOW(),
        version = d.version + 1,
        updated_at = NOW()
    WHERE d.id = v_draft.id
      AND d.org_id = v_actor_org_id
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
    request_id
  )
  VALUES (
    v_actor_org_id,
    'AI_DRAFT',
    v_draft.id,
    'AI_DRAFT_REJECTED',
    v_actor_profile_id,
    NULLIF(btrim(p_reason), ''),
    jsonb_build_object(
      'status', 'draft',
      'version', v_draft.version
    ),
    jsonb_build_object(
      'status', 'rejected',
      'version', v_new_version
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'ai_draft_id', v_draft.id,
      'status', 'rejected',
      'version', v_new_version
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Narrow grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.cpc_create_work_item(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_create_work_item(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID
) TO authenticated;

REVOKE ALL ON FUNCTION public.cpc_create_ai_work_item_draft(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TIMESTAMPTZ, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_create_ai_work_item_draft(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TIMESTAMPTZ, UUID
) TO authenticated;

REVOKE ALL ON FUNCTION public.cpc_accept_ai_draft(
  UUID, INTEGER, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_accept_ai_draft(
  UUID, INTEGER, UUID
) TO authenticated;

REVOKE ALL ON FUNCTION public.cpc_reject_ai_draft(
  UUID, INTEGER, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_reject_ai_draft(
  UUID, INTEGER, TEXT, UUID
) TO authenticated;

COMMIT;
