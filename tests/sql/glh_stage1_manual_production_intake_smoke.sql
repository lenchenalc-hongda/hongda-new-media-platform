-- Disposable PostgreSQL 17 only, after Stage 1 synthetic baseline and all five migrations.
-- Test real role/organization authorization, idempotency, contact conflict, provenance,
-- audit events, RLS and disabled channel side effects. NO real user/customer data.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF has_table_privilege('anon','public.glh_manual_intake_requests','SELECT')
     OR has_table_privilege('authenticated','public.glh_manual_intake_requests','SELECT')
     OR has_table_privilege('authenticated','public.glh_manual_intake_requests','INSERT')
     OR has_table_privilege('anon','public.glh_leads','INSERT')
  THEN RAISE EXCEPTION 'Private idempotency ledger or GLH writes exposed to browser roles'; END IF;
  IF has_function_privilege('anon',
      'public.glh_create_manual_production_lead(uuid,text,text,text,text,text,text,uuid,text,text,text,text,text)',
      'EXECUTE')
  THEN RAISE EXCEPTION 'Anonymous manual intake RPC exposed'; END IF;
  IF NOT has_function_privilege('authenticated',
      'public.glh_create_manual_production_lead(uuid,text,text,text,text,text,text,uuid,text,text,text,text,text)',
      'EXECUTE')
  THEN RAISE EXCEPTION 'Authorized intake RPC grant missing'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.glh_manual_intake_requests'::regclass)
  THEN RAISE EXCEPTION 'Private idempotency ledger missing RLS'; END IF;
END
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001001',false);
DO $$
DECLARE
  v_one jsonb;
  v_retry jsonb;
BEGIN
  v_one := public.glh_create_manual_production_lead(
    p_request_key := '00000000-0000-4000-8000-000000009101',
    p_display_name := 'Synthetic Buyer A',
    p_company_name := 'Synthetic Co A',
    p_country_code := 'VN',
    p_whatsapp := '+84 900 111 222',
    p_email := 'a-synthetic@example.invalid',
    p_requirement_type := 'FILM',
    p_product := 'Plastic bottle film',
    p_notes := 'No AI messages; manual followup only',
    p_source_detail := 'EXHIBITION'
  );
  IF v_one->>'leadId' IS NULL
     OR v_one->>'ownerProfileId' <> '00000000-0000-4000-8000-000000002001'
     OR v_one->>'idempotentReplay' <> 'false'
  THEN RAISE EXCEPTION 'Sales A own lead creation failed'; END IF;
  v_retry := public.glh_create_manual_production_lead(
    p_request_key := '00000000-0000-4000-8000-000000009101',
    p_display_name := 'Synthetic Buyer A',
    p_company_name := 'Synthetic Co A',
    p_country_code := 'VN',
    p_whatsapp := '+84 900 111 222',
    p_email := 'a-synthetic@example.invalid',
    p_requirement_type := 'FILM',
    p_product := 'Plastic bottle film',
    p_notes := 'No AI messages; manual followup only',
    p_source_detail := 'EXHIBITION'
  );
  IF v_retry->>'leadId' <> v_one->>'leadId'
     OR v_retry->>'idempotentReplay' <> 'true'
  THEN RAISE EXCEPTION 'Identical retry duplicated lead'; END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.glh_create_manual_production_lead(
      p_request_key := '00000000-0000-4000-8000-000000009101',
      p_display_name := 'Changed payload',
      p_email := 'a-synthetic@example.invalid'
    );
    RAISE EXCEPTION 'Changed payload/key should conflict';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
  BEGIN
    PERFORM public.glh_create_manual_production_lead(
      p_request_key := '00000000-0000-4000-8000-000000009102',
      p_display_name := 'Duplicate Contact A',
      p_email := 'a-synthetic@example.invalid'
    );
    RAISE EXCEPTION 'Duplicate email should be blocked';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.glh_create_manual_production_lead(
      p_request_key := '00000000-0000-4000-8000-000000009103',
      p_display_name := 'Duplicate phone A',
      p_whatsapp := '84 (900) 111-222'
    );
    RAISE EXCEPTION 'Duplicate normalized phone should be blocked';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.glh_create_manual_production_lead(
      p_request_key := '00000000-0000-4000-8000-000000009104',
      p_display_name := 'Invalid assignment',
      p_email := 'forbidden1@example.invalid',
      p_owner_profile_id := '00000000-0000-4000-8000-000000002002'
    );
    RAISE EXCEPTION 'Sales A cannot assign Sales B';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.glh_create_manual_production_lead(
      p_request_key := '00000000-0000-4000-8000-000000009105',
      p_display_name := 'Cross-org assignment',
      p_email := 'forbidden2@example.invalid',
      p_owner_profile_id := '00000000-0000-4000-8000-000000002004'
    );
    RAISE EXCEPTION 'Sales A cannot assign Org B';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.glh_create_manual_production_lead(
      p_request_key := '00000000-0000-4000-8000-000000009106',
      p_display_name := 'Missing contact method'
    );
    RAISE EXCEPTION 'A contact method is mandatory';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END
$$;

-- Manager can explicitly assign within own organization only.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001003',false);
DO $$
DECLARE v_created jsonb;
BEGIN
  v_created := public.glh_create_manual_production_lead(
    p_request_key := '00000000-0000-4000-8000-000000009201',
    p_display_name := 'Synthetic Buyer B',
    p_email := 'b-synthetic@example.invalid',
    p_owner_profile_id := '00000000-0000-4000-8000-000000002002',
    p_source_detail := 'OUTREACH'
  );
  IF v_created->>'ownerProfileId' <> '00000000-0000-4000-8000-000000002002'
  THEN RAISE EXCEPTION 'Manager cannot assign Sales B'; END IF;
  BEGIN
    PERFORM public.glh_create_manual_production_lead(
      p_request_key := '00000000-0000-4000-8000-000000009202',
      p_display_name := 'Cross-org manager spoof',
      p_email := 'forbidden-manager@example.invalid',
      p_owner_profile_id := '00000000-0000-4000-8000-000000002004'
    );
    RAISE EXCEPTION 'Manager cannot assign into Org B';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

-- Sales B cannot view Sales A's created row. RLS still owns the read boundary.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001002',false);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.glh_leads l JOIN public.glh_contacts c ON c.id=l.contact_id
      WHERE c.normalized_email='a-synthetic@example.invalid') <> 0
  THEN RAISE EXCEPTION 'Sales B can read Sales A manual lead'; END IF;
  IF (SELECT count(*) FROM public.glh_leads l JOIN public.glh_contacts c ON c.id=l.contact_id
      WHERE c.normalized_email='b-synthetic@example.invalid') <> 1
  THEN RAISE EXCEPTION 'Sales B cannot read manager-assigned lead'; END IF;
END
$$;

-- Org B can independently record the same contact (no cross-org dedup/info leak).
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001004',false);
DO $$
DECLARE v_created jsonb;
BEGIN
  v_created := public.glh_create_manual_production_lead(
    p_request_key := '00000000-0000-4000-8000-000000009301',
    p_display_name := 'Synthetic Org B Buyer',
    p_email := 'a-synthetic@example.invalid',
    p_source_detail := 'REFERRAL'
  );
  IF v_created->>'leadId' IS NULL THEN RAISE EXCEPTION 'Org B independent creation failed'; END IF;
END
$$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.glh_manual_intake_requests) <> 3
     OR (SELECT count(*) FROM public.glh_contacts WHERE normalized_email='a-synthetic@example.invalid') <> 2
     OR (SELECT count(*) FROM public.glh_leads) <> 6
  THEN RAISE EXCEPTION 'Unexpected duplicate or missing manual intake records'; END IF;
  IF (SELECT count(*) FROM public.glh_activity_events
       WHERE activity_type='LEAD_CREATED' AND context->>'origin'='MANUAL_PRODUCTION') <> 3
     OR (SELECT count(*) FROM public.glh_audit_events
       WHERE reason='MANUAL_PRODUCTION_LEAD_CREATED' AND event_type='LEAD_ASSIGNED') <> 3
     OR (SELECT count(*) FROM public.glh_assignments
       WHERE reason='MANUAL_PRODUCTION_LEAD_CREATED' AND status='ACTIVE') <> 3
  THEN RAISE EXCEPTION 'Manual lead ownership/audit history incomplete'; END IF;
  IF (SELECT count(*) FROM public.glh_conversations) <> 0
     OR (SELECT count(*) FROM public.glh_messages) <> 0
     OR (SELECT count(*) FROM public.glh_channel_accounts) <> 0
     OR (SELECT count(*) FROM public.glh_ai_actions) <> 0
  THEN RAISE EXCEPTION 'Manual intake created external-channel or AI-side effects'; END IF;
  IF (SELECT count(*) FROM public.profiles) <> 4
  THEN RAISE EXCEPTION 'Manual intake changed existing business profiles'; END IF;
END
$$;
SELECT 'GLH_STAGE1_MANUAL_PRODUCTION_INTAKE_PASS' AS result;
