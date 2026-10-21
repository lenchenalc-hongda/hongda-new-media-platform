-- GLH Stage 1 human workflow closure for manual leads only.
-- Additive forward migration. Production schema requires separately approved exact-SHA release.
-- No Meta/WhatsApp calls, customer canonical ownership or finance changes.
BEGIN;

CREATE TABLE public.glh_manual_work_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  lead_id uuid NOT NULL,
  work_id uuid NOT NULL,
  work_kind text NOT NULL CHECK (work_kind IN ('TASK','FOLLOWUP')),
  actor_profile_id uuid NOT NULL,
  previous_status text NOT NULL,
  next_status text NOT NULL CHECK (next_status = 'DONE'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_glh_manual_work_lead_org
    FOREIGN KEY (lead_id,org_id) REFERENCES public.glh_leads(id,org_id),
  CONSTRAINT fk_glh_manual_work_actor_org
    FOREIGN KEY (actor_profile_id,org_id) REFERENCES public.profiles(id,org_id)
);
CREATE INDEX idx_glh_manual_work_history
  ON public.glh_manual_work_updates(org_id,lead_id,created_at DESC);
ALTER TABLE public.glh_manual_work_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY glh_manual_work_updates_read
  ON public.glh_manual_work_updates
  FOR SELECT TO authenticated USING (public.glh_can_access_lead(lead_id));
REVOKE ALL ON public.glh_manual_work_updates FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.glh_manual_work_updates TO authenticated;

-- No arbitrary stage mutation. Only authenticated staff who can access a manual
-- lead may change human stages. Expected version prevents stale overwrite.
CREATE OR REPLACE FUNCTION public.glh_change_manual_lead_stage(
  p_lead_id uuid, p_expected_version integer, p_stage text, p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog,public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_lead public.glh_leads%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(p_reason,'')),'');
BEGIN
  SELECT * INTO v_actor
    FROM public.profiles WHERE user_id = auth.uid() AND is_active = true;
  IF NOT FOUND OR v_actor.role NOT IN ('admin','manager','sales') THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_lead_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_stage NOT IN (
       'NEW','HUMAN_FOLLOWING','QUOTATION','SAMPLE','NEGOTIATION',
       'WON','LOST','DORMANT','INVALID'
     ) OR p_stage IS NULL OR length(COALESCE(v_reason,'')) > 500
     OR (p_stage IN ('LOST','INVALID') AND length(COALESCE(v_reason,'')) < 4)
  THEN
    RAISE EXCEPTION 'INVALID_HUMAN_STAGE' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_lead FROM public.glh_leads
    WHERE id = p_lead_id AND org_id = v_actor.org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    v_actor.role IN ('admin','manager')
    OR v_lead.owner_profile_id = v_actor.id
    OR EXISTS (SELECT 1 FROM public.glh_assignments a
       WHERE a.org_id = v_actor.org_id AND a.lead_id = v_lead.id
         AND a.assignee_profile_id = v_actor.id AND a.status = 'ACTIVE')
  ) OR NOT EXISTS (
    SELECT 1 FROM public.glh_lead_profiles lp
    WHERE lp.lead_id = v_lead.id AND lp.org_id = v_actor.org_id
      AND lp.extracted_facts->>'origin' = 'MANUAL_PRODUCTION'
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF v_lead.version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF v_lead.lifecycle_state = p_stage THEN
    RETURN jsonb_build_object('leadId',v_lead.id,'version',v_lead.version,'unchanged',true);
  END IF;
  UPDATE public.glh_leads SET lifecycle_state=p_stage, version=version+1, updated_at=now()
    WHERE id=v_lead.id AND org_id=v_actor.org_id;
  INSERT INTO public.glh_audit_events (
    org_id,lead_id,actor_profile_id,actor_kind,event_type,
    entity_type,entity_id,previous_state,next_state,reason,context
  ) VALUES (
    v_actor.org_id,v_lead.id,v_actor.id,'HUMAN','LEAD_STAGE_CHANGED',
    'glh_leads',v_lead.id,v_lead.lifecycle_state,p_stage,v_reason,
    jsonb_build_object('origin','MANUAL_PRODUCTION','human_stage_change',true)
  );
  RETURN jsonb_build_object('leadId',v_lead.id,'version',v_lead.version+1,'unchanged',false);
END;
$$;

-- Only task assignee or current org Admin/Manager may finish work. A dedicated
-- append-only history table avoids overloading the existing lead-stage audit enum.
CREATE OR REPLACE FUNCTION public.glh_finish_manual_work(
  p_work_kind text, p_work_id uuid, p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog,public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_task public.glh_tasks%ROWTYPE;
  v_followup public.glh_followups%ROWTYPE;
  v_lead_id uuid;
  v_assignee uuid;
  v_status text;
  v_version integer;
BEGIN
  SELECT * INTO v_actor
    FROM public.profiles WHERE user_id=auth.uid() AND is_active=true;
  IF NOT FOUND OR v_actor.role NOT IN ('admin','manager','sales') THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_work_id IS NULL OR p_work_kind NOT IN ('TASK','FOLLOWUP')
      OR p_work_kind IS NULL OR p_expected_version IS NULL
      OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'INVALID_WORK' USING ERRCODE = '22023';
  END IF;
  IF p_work_kind = 'TASK' THEN
    SELECT * INTO v_task FROM public.glh_tasks
      WHERE id=p_work_id AND org_id=v_actor.org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501'; END IF;
    v_lead_id := v_task.lead_id;
    v_assignee := v_task.assignee_profile_id;
    v_status := v_task.status;
    v_version := v_task.version;
  ELSE
    SELECT * INTO v_followup FROM public.glh_followups
      WHERE id=p_work_id AND org_id=v_actor.org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501'; END IF;
    v_lead_id := v_followup.lead_id;
    v_assignee := v_followup.assigned_profile_id;
    v_status := v_followup.status;
    v_version := v_followup.version;
  END IF;
  -- SECURITY DEFINER must not let an old task assignee mutate a lead
  -- after the owner has been reassigned. Match glh_tasks/followups SELECT RLS.
  IF NOT (
    v_actor.role IN ('admin','manager') OR v_assignee=v_actor.id
  ) OR NOT public.glh_can_access_lead(v_lead_id) OR NOT EXISTS (
    SELECT 1 FROM public.glh_lead_profiles lp
      WHERE lp.org_id=v_actor.org_id AND lp.lead_id=v_lead_id
        AND lp.extracted_facts->>'origin'='MANUAL_PRODUCTION'
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF v_status='DONE' THEN
    RETURN jsonb_build_object('workId',p_work_id,'workKind',p_work_kind,
      'version',v_version,'idempotentReplay',true);
  END IF;
  IF v_version<>p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF v_status NOT IN ('OPEN','IN_PROGRESS','OVERDUE') THEN
    RAISE EXCEPTION 'INVALID_WORK_STATUS' USING ERRCODE = '22023';
  END IF;
  IF p_work_kind='TASK' THEN
    UPDATE public.glh_tasks SET status='DONE', completed_at=now(),
      version=version+1,updated_at=now()
      WHERE id=p_work_id AND org_id=v_actor.org_id;
  ELSE
    UPDATE public.glh_followups SET status='DONE', completed_at=now(),
      version=version+1,updated_at=now()
      WHERE id=p_work_id AND org_id=v_actor.org_id;
    -- Do not keep a completed followup as the next overdue customer action.
    UPDATE public.glh_leads SET
      next_follow_up_at=(
        SELECT min(f.due_at) FROM public.glh_followups f
        WHERE f.org_id=v_actor.org_id AND f.lead_id=v_lead_id
          AND f.status IN ('OPEN','OVERDUE')
      ),
      version=version+1,updated_at=now()
      WHERE id=v_lead_id AND org_id=v_actor.org_id;
  END IF;
  INSERT INTO public.glh_manual_work_updates (
    org_id,lead_id,work_id,work_kind,actor_profile_id,previous_status,next_status
  ) VALUES (
    v_actor.org_id,v_lead_id,p_work_id,p_work_kind,v_actor.id,v_status,'DONE'
  );
  RETURN jsonb_build_object('workId',p_work_id,'workKind',p_work_kind,
    'version',v_version+1,'idempotentReplay',false);
END;
$$;

REVOKE ALL ON FUNCTION public.glh_change_manual_lead_stage(
  uuid,integer,text,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.glh_change_manual_lead_stage(
  uuid,integer,text,text
) TO authenticated;

REVOKE ALL ON FUNCTION public.glh_finish_manual_work(
  text,uuid,integer
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.glh_finish_manual_work(
  text,uuid,integer
) TO authenticated;

COMMIT;
