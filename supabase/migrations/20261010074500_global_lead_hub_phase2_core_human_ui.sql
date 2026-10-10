-- Global Lead Hub Phase 2 Core Human UI
-- Additive, forward-only controlled mutations for manual test/dev lead
-- creation, Manager/Admin assignment, and authorized human work creation.
-- No Production SQL/RLS/environment execution is performed by this repository.
-- No DROP, TRUNCATE, DELETE, or direct authenticated DML grant is included.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Append-only activity history for human-created work
-- ---------------------------------------------------------------------------

CREATE TABLE public.glh_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  lead_id UUID NOT NULL,
  actor_profile_id UUID,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('HUMAN', 'AI', 'SYSTEM')),
  activity_type TEXT NOT NULL
    CHECK (activity_type IN ('LEAD_CREATED', 'TASK_CREATED', 'FOLLOWUP_CREATED')),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(context) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_glh_activity_events_id_org UNIQUE (id, org_id),
  CONSTRAINT chk_glh_activity_entity
    CHECK (length(btrim(entity_type)) > 0),
  CONSTRAINT chk_glh_activity_actor
    CHECK (actor_kind <> 'HUMAN' OR actor_profile_id IS NOT NULL),
  CONSTRAINT fk_glh_activity_events_lead_org
    FOREIGN KEY (lead_id, org_id)
    REFERENCES public.glh_leads(id, org_id),
  CONSTRAINT fk_glh_activity_events_actor_org
    FOREIGN KEY (actor_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE INDEX idx_glh_activity_events_org_lead_created
  ON public.glh_activity_events(org_id, lead_id, created_at DESC);

ALTER TABLE public.glh_activity_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.glh_activity_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.glh_activity_events TO authenticated;

CREATE POLICY "glh_activity_events_select" ON public.glh_activity_events
  FOR SELECT TO authenticated
  USING (public.glh_can_access_lead(lead_id));

-- ---------------------------------------------------------------------------
-- 2. Guarded manual test/dev lead creation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.glh_create_manual_test_lead(
  p_manual_creation_guard TEXT,
  p_display_name TEXT,
  p_company_name TEXT DEFAULT NULL,
  p_country_code TEXT DEFAULT NULL,
  p_whatsapp TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_source_platform TEXT DEFAULT 'UNKNOWN',
  p_requirement_type TEXT DEFAULT NULL,
  p_lifecycle_state TEXT DEFAULT 'NEW',
  p_conversation_mode TEXT DEFAULT 'AI_ACTIVE',
  p_priority_grade TEXT DEFAULT NULL,
  p_score INTEGER DEFAULT 0,
  p_completeness INTEGER DEFAULT 0,
  p_owner_profile_id UUID DEFAULT NULL,
  p_product TEXT DEFAULT NULL,
  p_material TEXT DEFAULT NULL,
  p_quantity TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_owner public.profiles%ROWTYPE;
  v_actor_profile_id UUID;
  v_owner_profile_id UUID;
  v_contact_id UUID := gen_random_uuid();
  v_lead_id UUID := gen_random_uuid();
  v_expected_grade TEXT;
  v_manual_environment TEXT;
  v_expected_guard TEXT;
BEGIN
  SELECT *
  INTO v_actor
  FROM public.profiles
  WHERE user_id = auth.uid()
    AND is_active = true;

  IF NOT FOUND OR v_actor.role NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  v_actor_profile_id := v_actor.id;

  v_manual_environment := current_setting('app.environment', true);
  v_expected_guard := current_setting('app.glh_manual_creation_guard', true);
  IF COALESCE(v_manual_environment, '') NOT IN ('test', 'development')
     OR v_expected_guard IS NULL
     OR length(btrim(v_expected_guard)) = 0
     OR p_manual_creation_guard IS DISTINCT FROM v_expected_guard THEN
    RAISE EXCEPTION 'MANUAL_CREATION_DISABLED' USING ERRCODE = '42501';
  END IF;

  IF p_display_name IS NULL
     OR length(btrim(p_display_name)) = 0
     OR length(btrim(p_display_name)) > 200 THEN
    RAISE EXCEPTION 'INVALID_DISPLAY_NAME' USING ERRCODE = '22023';
  END IF;
  IF p_source_platform IS NULL
     OR p_source_platform NOT IN ('WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'UNKNOWN') THEN
    RAISE EXCEPTION 'INVALID_SOURCE_PLATFORM' USING ERRCODE = '22023';
  END IF;
  IF p_requirement_type IS NOT NULL
     AND p_requirement_type NOT IN (
       'FILM', 'PROCESSING', 'MACHINE', 'PROCESS_CONSULT', 'UNCLEAR'
     ) THEN
    RAISE EXCEPTION 'INVALID_REQUIREMENT_TYPE' USING ERRCODE = '22023';
  END IF;
  IF p_lifecycle_state IS NULL OR p_lifecycle_state NOT IN (
    'NEW', 'AI_QUALIFYING', 'WAITING_CUSTOMER', 'READY_FOR_HUMAN',
    'HUMAN_FOLLOWING', 'QUOTATION', 'SAMPLE', 'NEGOTIATION',
    'WON', 'LOST', 'DORMANT', 'INVALID'
  ) THEN
    RAISE EXCEPTION 'INVALID_LIFECYCLE_STATE' USING ERRCODE = '22023';
  END IF;
  IF p_conversation_mode IS NULL OR p_conversation_mode NOT IN (
    'AI_ACTIVE', 'HANDOFF_PENDING', 'HUMAN_ACTIVE', 'PAUSED'
  ) THEN
    RAISE EXCEPTION 'INVALID_CONVERSATION_MODE' USING ERRCODE = '22023';
  END IF;
  IF p_score IS NULL OR p_score < 0 OR p_score > 100
     OR p_completeness IS NULL OR p_completeness < 0 OR p_completeness > 100 THEN
    RAISE EXCEPTION 'INVALID_SCORE_OR_COMPLETENESS' USING ERRCODE = '22023';
  END IF;

  IF p_priority_grade IS NOT NULL THEN
    IF p_priority_grade NOT IN ('A', 'B', 'C', 'D') THEN
      RAISE EXCEPTION 'INVALID_PRIORITY_GRADE' USING ERRCODE = '22023';
    END IF;
    v_expected_grade := CASE
      WHEN p_score >= 80 THEN 'A'
      WHEN p_score >= 60 THEN 'B'
      WHEN p_score >= 30 THEN 'C'
      ELSE 'D'
    END;
    IF p_priority_grade <> v_expected_grade THEN
      RAISE EXCEPTION 'GRADE_SCORE_MISMATCH' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_owner_profile_id := COALESCE(p_owner_profile_id, v_actor.id);
  IF p_owner_profile_id IS NOT NULL
     AND p_owner_profile_id <> v_actor.id
     AND v_actor.role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_owner
  FROM public.profiles
  WHERE id = v_owner_profile_id
    AND org_id = v_actor.org_id
    AND is_active = true;

  IF NOT FOUND OR v_owner.role NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.glh_contacts (
    id, org_id, display_name, company_name, country_code,
    normalized_whatsapp, normalized_email, source_platform,
    created_by_profile_id
  ) VALUES (
    v_contact_id, v_actor.org_id, btrim(p_display_name),
    NULLIF(btrim(COALESCE(p_company_name, '')), ''),
    NULLIF(upper(btrim(COALESCE(p_country_code, ''))), ''),
    NULLIF(regexp_replace(COALESCE(p_whatsapp, ''), '[^0-9+]', '', 'g'), ''),
    NULLIF(lower(btrim(COALESCE(p_email, ''))), ''),
    p_source_platform, v_actor.id
  );

  INSERT INTO public.glh_leads (
    id, org_id, contact_id, owner_profile_id, lifecycle_state,
    conversation_mode, priority_grade, score, completeness,
    source_platform, created_by_profile_id
  ) VALUES (
    v_lead_id, v_actor.org_id, v_contact_id, v_owner_profile_id,
    p_lifecycle_state, p_conversation_mode, p_priority_grade,
    p_score, p_completeness, p_source_platform, v_actor.id
  );

  INSERT INTO public.glh_lead_profiles (
    lead_id, org_id, customer_company_name, country_code, whatsapp, email,
    product, material, quantity, requirement_type, ai_summary,
    extracted_facts, created_by_profile_id
  ) VALUES (
    v_lead_id, v_actor.org_id,
    NULLIF(btrim(COALESCE(p_company_name, '')), ''),
    NULLIF(upper(btrim(COALESCE(p_country_code, ''))), ''),
    NULLIF(btrim(COALESCE(p_whatsapp, '')), ''),
    NULLIF(lower(btrim(COALESCE(p_email, ''))), ''),
    NULLIF(btrim(COALESCE(p_product, '')), ''),
    NULLIF(btrim(COALESCE(p_material, '')), ''),
    NULLIF(btrim(COALESCE(p_quantity, '')), ''),
    p_requirement_type,
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    jsonb_build_object('source', 'MANUAL_TEST_DEV'),
    v_actor.id
  );

  INSERT INTO public.glh_assignments (
    org_id, lead_id, assignee_profile_id, assignment_type,
    assigned_by_profile_id, status, reason
  ) VALUES (
    v_actor.org_id, v_lead_id, v_owner_profile_id, 'PRIMARY',
    v_actor.id, 'ACTIVE', 'MANUAL_TEST_DEV_LEAD_CREATED'
  );

  INSERT INTO public.glh_audit_events (
    org_id, lead_id, actor_profile_id, actor_kind, event_type,
    entity_type, entity_id, previous_state, next_state, reason, context
  ) VALUES (
    v_actor.org_id, v_lead_id, v_actor.id, 'HUMAN', 'LEAD_STAGE_CHANGED',
    'glh_leads', v_lead_id, NULL, p_lifecycle_state,
    'MANUAL_TEST_DEV_LEAD_CREATED',
    jsonb_build_object(
      'activity_type', 'LEAD_CREATED',
      'manual_test_dev', true,
      'organization_id', v_actor.org_id
    )
  );

  INSERT INTO public.glh_audit_events (
    org_id, lead_id, actor_profile_id, actor_kind, event_type,
    entity_type, entity_id, previous_state, next_state, reason, context
  ) VALUES (
    v_actor.org_id, v_lead_id, v_actor.id, 'HUMAN', 'LEAD_ASSIGNED',
    'glh_leads', v_lead_id, NULL, v_owner_profile_id::TEXT,
    'MANUAL_TEST_DEV_LEAD_CREATED',
    jsonb_build_object('assignee_profile_id', v_owner_profile_id)
  );

  INSERT INTO public.glh_activity_events (
    org_id, lead_id, actor_profile_id, actor_kind, activity_type,
    entity_type, entity_id, context
  ) VALUES (
    v_actor.org_id, v_lead_id, v_actor.id, 'HUMAN', 'LEAD_CREATED',
    'glh_leads', v_lead_id,
    jsonb_build_object('manual_test_dev', true)
  );

  RETURN jsonb_build_object(
    'lead_id', v_lead_id,
    'contact_id', v_contact_id,
    'owner_profile_id', v_owner_profile_id,
    'version', 1
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Manager/Admin assignment with append-only history
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.glh_assign_lead(
  p_lead_id UUID,
  p_assignee_profile_id UUID,
  p_expected_version INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_assignee public.profiles%ROWTYPE;
  v_lead public.glh_leads%ROWTYPE;
  v_actor_profile_id UUID;
  v_previous_owner_profile_id UUID;
BEGIN
  SELECT *
  INTO v_actor
  FROM public.profiles
  WHERE user_id = auth.uid()
    AND is_active = true;

  IF NOT FOUND OR v_actor.role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  v_actor_profile_id := v_actor.id;

  IF p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'INVALID_EXPECTED_VERSION' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_lead
  FROM public.glh_leads
  WHERE id = p_lead_id
    AND org_id = v_actor.org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF v_lead.version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;

  SELECT *
  INTO v_assignee
  FROM public.profiles
  WHERE id = p_assignee_profile_id
    AND org_id = v_actor.org_id
    AND is_active = true;

  IF NOT FOUND OR v_assignee.role NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  v_previous_owner_profile_id := v_lead.owner_profile_id;

  UPDATE public.glh_assignments
  SET status = 'ENDED',
      ended_at = NOW()
  WHERE org_id = v_actor.org_id
    AND lead_id = v_lead.id
    AND assignment_type = 'PRIMARY'
    AND status = 'ACTIVE';

  INSERT INTO public.glh_assignments (
    org_id, lead_id, assignee_profile_id, assignment_type,
    assigned_by_profile_id, status, reason
  ) VALUES (
    v_actor.org_id, v_lead.id, p_assignee_profile_id, 'PRIMARY',
    v_actor.id, 'ACTIVE',
    NULLIF(btrim(COALESCE(p_reason, '')), '')
  );

  UPDATE public.glh_leads
  SET owner_profile_id = p_assignee_profile_id,
      version = version + 1,
      updated_at = NOW()
  WHERE id = v_lead.id
    AND org_id = v_actor.org_id;

  INSERT INTO public.glh_audit_events (
    org_id, lead_id, actor_profile_id, actor_kind, event_type,
    entity_type, entity_id, previous_state, next_state, reason, context
  ) VALUES (
    v_actor.org_id, v_lead.id, v_actor.id, 'HUMAN', 'LEAD_ASSIGNED',
    'glh_leads', v_lead.id,
    v_previous_owner_profile_id::TEXT,
    p_assignee_profile_id::TEXT,
    NULLIF(btrim(COALESCE(p_reason, '')), ''),
    jsonb_build_object(
      'previous_owner_profile_id', v_previous_owner_profile_id,
      'assignee_profile_id', p_assignee_profile_id
    )
  );

  RETURN jsonb_build_object(
    'lead_id', v_lead.id,
    'owner_profile_id', p_assignee_profile_id,
    'version', v_lead.version + 1
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Authorized task/follow-up creation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.glh_create_task_or_followup(
  p_lead_id UUID,
  p_work_kind TEXT,
  p_work_type TEXT,
  p_title TEXT,
  p_due_at TIMESTAMPTZ DEFAULT NULL,
  p_assignee_profile_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_assignee public.profiles%ROWTYPE;
  v_lead public.glh_leads%ROWTYPE;
  v_actor_profile_id UUID;
  v_assignee_profile_id UUID;
  v_work_id UUID := gen_random_uuid();
  v_can_access BOOLEAN := false;
  v_activity_type TEXT;
BEGIN
  SELECT *
  INTO v_actor
  FROM public.profiles
  WHERE user_id = auth.uid()
    AND is_active = true;

  IF NOT FOUND OR v_actor.role NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  v_actor_profile_id := v_actor.id;
  SELECT *
  INTO v_lead
  FROM public.glh_leads
  WHERE id = p_lead_id
    AND org_id = v_actor.org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  v_can_access := v_actor.role IN ('admin', 'manager')
    OR v_lead.owner_profile_id = v_actor.id
    OR EXISTS (
      SELECT 1
      FROM public.glh_assignments a
      WHERE a.org_id = v_actor.org_id
        AND a.lead_id = v_lead.id
        AND a.assignee_profile_id = v_actor.id
        AND a.status = 'ACTIVE'
    );

  IF NOT v_can_access THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  v_assignee_profile_id := COALESCE(p_assignee_profile_id, v_actor.id);
  IF p_assignee_profile_id IS NOT NULL
     AND p_assignee_profile_id <> v_actor.id
     AND v_actor.role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_assignee
  FROM public.profiles
  WHERE id = v_assignee_profile_id
    AND org_id = v_actor.org_id
    AND is_active = true;

  IF NOT FOUND OR v_assignee.role NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  IF p_work_kind IS NULL OR p_work_kind NOT IN ('TASK', 'FOLLOWUP') THEN
    RAISE EXCEPTION 'INVALID_WORK_KIND' USING ERRCODE = '22023';
  END IF;
  IF p_title IS NULL
     OR length(btrim(p_title)) = 0
     OR length(btrim(p_title)) > 300 THEN
    RAISE EXCEPTION 'INVALID_WORK_TITLE' USING ERRCODE = '22023';
  END IF;

  IF p_work_kind = 'TASK' THEN
    IF p_work_type IS NULL OR p_work_type NOT IN (
      'QUALIFICATION', 'FOLLOW_UP', 'QUOTATION', 'SAMPLE',
      'NEGOTIATION', 'HANDOFF', 'OTHER'
    ) THEN
      RAISE EXCEPTION 'INVALID_TASK_TYPE' USING ERRCODE = '22023';
    END IF;
    v_activity_type := 'TASK_CREATED';

    INSERT INTO public.glh_tasks (
      id, org_id, lead_id, assignee_profile_id, task_type, title,
      due_at, status, source, created_by_profile_id
    ) VALUES (
      v_work_id, v_actor.org_id, v_lead.id, v_assignee_profile_id,
      p_work_type, btrim(p_title), p_due_at, 'OPEN', 'HUMAN', v_actor.id
    );
  ELSE
    IF p_due_at IS NULL THEN
      RAISE EXCEPTION 'FOLLOWUP_DUE_AT_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF p_work_type IS NULL OR p_work_type NOT IN (
      'QUALIFICATION', 'QUOTATION', 'SAMPLE',
      'NEGOTIATION', 'DORMANT_REVIVAL', 'OTHER'
    ) THEN
      RAISE EXCEPTION 'INVALID_FOLLOWUP_TYPE' USING ERRCODE = '22023';
    END IF;
    v_activity_type := 'FOLLOWUP_CREATED';

    INSERT INTO public.glh_followups (
      id, org_id, lead_id, assigned_profile_id, followup_type,
      next_action, due_at, status, created_by_profile_id
    ) VALUES (
      v_work_id, v_actor.org_id, v_lead.id, v_assignee_profile_id,
      p_work_type, btrim(p_title), p_due_at, 'OPEN', v_actor.id
    );

    UPDATE public.glh_leads
    SET next_follow_up_at = CASE
          WHEN next_follow_up_at IS NULL OR p_due_at < next_follow_up_at THEN p_due_at
          ELSE next_follow_up_at
        END,
        version = version + 1,
        updated_at = NOW()
    WHERE id = v_lead.id
      AND org_id = v_actor.org_id;
  END IF;

  INSERT INTO public.glh_activity_events (
    org_id, lead_id, actor_profile_id, actor_kind, activity_type,
    entity_type, entity_id, context
  ) VALUES (
    v_actor.org_id, v_lead.id, v_actor.id, 'HUMAN', v_activity_type,
    CASE WHEN p_work_kind = 'TASK' THEN 'glh_tasks' ELSE 'glh_followups' END,
    v_work_id,
    jsonb_build_object(
      'work_kind', p_work_kind,
      'work_type', p_work_type,
      'assignee_profile_id', v_assignee_profile_id,
      'due_at', p_due_at
    )
  );

  RETURN jsonb_build_object(
    'work_id', v_work_id,
    'work_kind', p_work_kind,
    'lead_id', v_lead.id,
    'assignee_profile_id', v_assignee_profile_id,
    'version', 1
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Exact authenticated execute grants; anon remains denied
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.glh_create_manual_test_lead(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, INTEGER, INTEGER, UUID, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.glh_assign_lead(
  UUID, UUID, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.glh_create_task_or_followup(
  UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.glh_create_manual_test_lead(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, INTEGER, INTEGER, UUID, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.glh_assign_lead(
  UUID, UUID, INTEGER, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.glh_create_task_or_followup(
  UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID
) TO authenticated;

COMMIT;
