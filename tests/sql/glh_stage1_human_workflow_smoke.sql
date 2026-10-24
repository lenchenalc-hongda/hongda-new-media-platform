-- Disposable PostgreSQL17 human workflow smoke; no live data.
-- Runs after synthetic baseline, six migrations, and manual-intake synthetic fixture.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF has_table_privilege('anon','public.glh_manual_work_updates','SELECT')
     OR has_table_privilege('authenticated','public.glh_manual_work_updates','INSERT')
     OR has_function_privilege('anon',
        'public.glh_change_manual_lead_stage(uuid,integer,text,text)','EXECUTE')
     OR has_function_privilege('anon',
        'public.glh_finish_manual_work(text,uuid,integer)','EXECUTE')
  THEN RAISE EXCEPTION 'Manual workflow has forbidden privileges'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class
    WHERE oid='public.glh_manual_work_updates'::regclass)
  THEN RAISE EXCEPTION 'Work audit lacks RLS'; END IF;
END
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001001',false);
DO $$
DECLARE
  v_lead uuid;
  v_ver integer;
  v_result jsonb;
  v_task uuid;
  v_early uuid;
  v_later uuid;
  v_early_due timestamptz := now() + interval '1 day';
  v_later_due timestamptz := now() + interval '2 days';
BEGIN
  SELECT l.id,l.version INTO v_lead,v_ver
  FROM public.glh_leads l JOIN public.glh_contacts c ON c.id=l.contact_id
  WHERE c.normalized_email='a-synthetic@example.invalid'
    AND l.org_id='00000000-0000-4000-8000-000000000001';
  IF v_lead IS NULL THEN RAISE EXCEPTION 'Manual lead fixture not found'; END IF;

  v_result := public.glh_change_manual_lead_stage(v_lead,v_ver,'HUMAN_FOLLOWING','Initial human outreach');
  IF v_result->>'version'<>(v_ver+1)::text OR v_result->>'unchanged'<>'false'
  THEN RAISE EXCEPTION 'Human stage change did not version'; END IF;
  IF (SELECT lifecycle_state FROM public.glh_leads WHERE id=v_lead)<>'HUMAN_FOLLOWING'
     OR (SELECT conversation_mode FROM public.glh_leads WHERE id=v_lead)<>'PAUSED'
  THEN RAISE EXCEPTION 'Human stage changed provider mode'; END IF;
  BEGIN
    PERFORM public.glh_change_manual_lead_stage(v_lead,v_ver,'QUOTATION','Stale version');
    RAISE EXCEPTION 'Stale stage version passed';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
  BEGIN
    PERFORM public.glh_change_manual_lead_stage(v_lead,v_ver+1,'LOST',NULL);
    RAISE EXCEPTION 'LOST missing reason passed';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.glh_change_manual_lead_stage(v_lead,v_ver+1,'AI_QUALIFYING','Not human');
    RAISE EXCEPTION 'AI stage allowed in human-only RPC';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  v_result := public.glh_create_task_or_followup(
    p_lead_id := v_lead,
    p_work_kind := 'TASK',
    p_work_type := 'QUALIFICATION',
    p_title := 'Internal call notes'
  );
  v_task := (v_result->>'work_id')::uuid;
  v_result := public.glh_finish_manual_work('TASK',v_task,1);
  IF v_result->>'version'<>'2' OR v_result->>'idempotentReplay'<>'false'
     OR (SELECT status FROM public.glh_tasks WHERE id=v_task)<>'DONE'
  THEN RAISE EXCEPTION 'Task completion failed'; END IF;
  v_result := public.glh_finish_manual_work('TASK',v_task,1);
  IF v_result->>'idempotentReplay'<>'true'
  THEN RAISE EXCEPTION 'Done task retry was not idempotent'; END IF;

  v_result := public.glh_create_task_or_followup(
    p_lead_id := v_lead,
    p_work_kind := 'FOLLOWUP',
    p_work_type := 'QUALIFICATION',
    p_title := 'First customer meeting',
    p_due_at := v_early_due
  );
  v_early := (v_result->>'work_id')::uuid;
  v_result := public.glh_create_task_or_followup(
    p_lead_id := v_lead,
    p_work_kind := 'FOLLOWUP',
    p_work_type := 'QUOTATION',
    p_title := 'Second follow-up',
    p_due_at := v_later_due
  );
  v_later := (v_result->>'work_id')::uuid;
  IF (SELECT next_follow_up_at FROM public.glh_leads WHERE id=v_lead)<>v_early_due
  THEN RAISE EXCEPTION 'Initial followup pointer wrong'; END IF;

  BEGIN
    PERFORM public.glh_finish_manual_work('FOLLOWUP',v_early,999);
    RAISE EXCEPTION 'Stale work completion passed';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
  v_result := public.glh_finish_manual_work('FOLLOWUP',v_early,1);
  IF (SELECT next_follow_up_at FROM public.glh_leads WHERE id=v_lead)<>v_later_due
  THEN RAISE EXCEPTION 'Next followup not recalculated'; END IF;
  v_result := public.glh_finish_manual_work('FOLLOWUP',v_later,1);
  IF (SELECT next_follow_up_at FROM public.glh_leads WHERE id=v_lead) IS NOT NULL
  THEN RAISE EXCEPTION 'Completed followups still show as next'; END IF;

  IF (SELECT count(*) FROM public.glh_manual_work_updates
    WHERE lead_id=v_lead)<>3
  THEN RAISE EXCEPTION 'Work completion audit missing'; END IF;
  -- Formal glh_audit_events are intentionally manager/admin-only under RLS.
  -- Verify those rows as a privileged reviewer below; don't broaden sales access.
END
$$;

-- Preserve synthetic IDs in session-only GUCs before switching to a restricted role.
SELECT set_config('test.sales_a_lead_id',(
  SELECT l.id::text FROM public.glh_leads l
  JOIN public.glh_contacts c ON c.id=l.contact_id
  WHERE c.normalized_email='a-synthetic@example.invalid'
    AND l.org_id='00000000-0000-4000-8000-000000000001'
),false);
SELECT set_config('test.sales_a_task_id',(
  SELECT t.id::text FROM public.glh_tasks t
  WHERE t.title='Internal call notes'
),false);

-- Keep one additional OPEN task assigned to Sales A while owner later changes.
DO $$
DECLARE v_open jsonb;
BEGIN
  v_open := public.glh_create_task_or_followup(
    p_lead_id := current_setting('test.sales_a_lead_id')::uuid,
    p_work_kind := 'TASK',p_work_type := 'FOLLOW_UP',
    p_title := 'Old-owner task after reassignment'
  );
  PERFORM set_config('test.stale_assignee_task_id',v_open->>'work_id',false);
END
$$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001002',false);
DO $$
DECLARE v_lead uuid;
BEGIN
  v_lead := current_setting('test.sales_a_lead_id')::uuid;
  BEGIN
    PERFORM public.glh_change_manual_lead_stage(v_lead,1,'WON','Wrong owner');
    RAISE EXCEPTION 'Wrong-owner stage update accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.glh_finish_manual_work('TASK',
      current_setting('test.sales_a_task_id')::uuid,1);
    RAISE EXCEPTION 'Wrong-assignee closure accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001004',false);
DO $$
BEGIN
  BEGIN
    PERFORM public.glh_change_manual_lead_stage(
      current_setting('test.sales_a_lead_id')::uuid,1,'WON',NULL);
    RAISE EXCEPTION 'Cross-org stage spoof accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
-- Current lead ownership is authoritative. A former task assignee must lose
-- the SECURITY DEFINER completion power after Manager reassigns the customer.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001003',false);
DO $$
DECLARE v_cur integer;
BEGIN
  SELECT version INTO v_cur FROM public.glh_leads
    WHERE id=current_setting('test.sales_a_lead_id')::uuid;
  PERFORM public.glh_assign_lead(
    current_setting('test.sales_a_lead_id')::uuid,
    '00000000-0000-4000-8000-000000002002',
    v_cur,
    'Assignment for stale-assignee authorization test'
  );
END
$$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001001',false);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.glh_leads
    WHERE id=current_setting('test.sales_a_lead_id')::uuid)
  THEN RAISE EXCEPTION 'Old owner still has row-level lead access'; END IF;
  BEGIN
    PERFORM public.glh_finish_manual_work(
      'TASK',current_setting('test.stale_assignee_task_id')::uuid,1);
    RAISE EXCEPTION 'Old assignee completed work after owner transfer';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.glh_audit_events a
    JOIN public.glh_contacts c ON c.id=(
      SELECT l.contact_id FROM public.glh_leads l WHERE l.id=a.lead_id
    )
    WHERE c.normalized_email='a-synthetic@example.invalid'
      AND a.event_type='LEAD_STAGE_CHANGED'
      AND a.context->>'human_stage_change'='true')<>1
  THEN RAISE EXCEPTION 'Privileged audit inspection: stage-change row missing'; END IF;
  IF (SELECT count(*) FROM public.glh_ai_actions)>0
     OR (SELECT count(*) FROM public.glh_messages)>0
     OR (SELECT count(*) FROM public.glh_conversations)>0
  THEN RAISE EXCEPTION 'Human workflow unexpectedly created provider/AI messages'; END IF;
END
$$;
SELECT 'GLH_STAGE1_HUMAN_WORKFLOW_PASS' AS result;
