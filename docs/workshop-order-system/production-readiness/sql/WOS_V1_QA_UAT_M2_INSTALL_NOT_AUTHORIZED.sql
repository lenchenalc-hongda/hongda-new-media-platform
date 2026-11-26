-- QA-only adapter for the reviewed production M2 contract.
-- NOT AUTHORIZED FOR EXECUTION.
--
-- This file never grants the production M2 entry points. Authenticated callers
-- can use only the wrappers after the separate activation file is applied.
BEGIN;

DO $guard$
BEGIN
  IF current_setting('wos_v1.qa_uat_install_authorized',true)
    IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_M2_INSTALL_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project',true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_PROJECT_MISMATCH';
  END IF;
  IF to_regproc('public.wos_v1_m2_action') IS NULL
    OR to_regproc('public.wos_v1_authorize_production_start') IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_PRODUCTION_M2_NOT_INSTALLED';
  END IF;
  IF to_regprocedure(
    'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'
  ) IS NULL OR to_regclass('public.wos_qa_trusted_proof_receipts') IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_DATABASE_NOT_IDENTIFIED';
  END IF;
END;
$guard$;

CREATE SCHEMA IF NOT EXISTS wos_v1_qa_uat;
REVOKE ALL ON SCHEMA wos_v1_qa_uat FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS wos_v1_qa_uat.write_gates (
  gate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id text NOT NULL CHECK (length(btrim(authorization_id)) BETWEEN 1 AND 120),
  project_ref text NOT NULL CHECK (project_ref='xulmpqaknlwqqculbsek'),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  allowed_actions text[] NOT NULL CHECK (
    cardinality(allowed_actions) BETWEEN 1 AND 6
    AND allowed_actions <@ ARRAY[
      'MATERIAL_RECORD',
      'BASELINE_SELECT',
      'BASELINE_OFFICE_CONFIRM',
      'BASELINE_WORKSHOP_CONFIRM',
      'FINAL_READINESS_CONFIRM',
      'START_RELEASE'
    ]::text[]
  ),
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','CLOSED')),
  closed_at timestamptz,
  CHECK (expires_at>opened_at),
  CHECK (expires_at<=opened_at+interval '15 minutes'),
  CHECK ((state='OPEN' AND closed_at IS NULL)
      OR (state='CLOSED' AND closed_at IS NOT NULL)),
  UNIQUE (authorization_id,order_id,actor_profile_id)
);
ALTER TABLE wos_v1_qa_uat.write_gates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wos_v1_qa_uat.write_gates
  FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS wos_v1_qa_uat_write_gates_lookup_idx
  ON wos_v1_qa_uat.write_gates(order_id,actor_profile_id,state,expires_at);

CREATE FUNCTION public.wos_v1_qa_uat_open_gate(
  p_authorization_id text,
  p_order_id uuid,
  p_organization_id uuid,
  p_actor_profile_id uuid,
  p_allowed_actions text[],
  p_expires_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $open$
DECLARE
  v_order public.wos_production_orders%ROWTYPE;
  v_actor public.profiles%ROWTYPE;
  v_gate_id uuid;
BEGIN
  IF current_setting('wos_v1.qa_uat_gate_open_authorized',true)
    IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_GATE_OPEN_NOT_AUTHORIZED'
      USING ERRCODE='42501';
  END IF;
  IF current_setting('wos_v1.qa_project',true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_PROJECT_MISMATCH'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id=p_order_id
    AND production_order.organization_id=p_organization_id
    AND production_order.order_number LIKE 'QA-NONPROD-%'
  FOR SHARE;
  SELECT * INTO STRICT v_actor
  FROM public.profiles profile
  WHERE profile.id=p_actor_profile_id
    AND profile.org_id=p_organization_id
    AND profile.is_active=true;
  INSERT INTO wos_v1_qa_uat.write_gates(
    authorization_id,project_ref,organization_id,order_id,actor_profile_id,
    allowed_actions,expires_at
  ) VALUES(
    btrim(p_authorization_id),'xulmpqaknlwqqculbsek',p_organization_id,
    p_order_id,p_actor_profile_id,p_allowed_actions,p_expires_at
  )
  RETURNING gate_id INTO v_gate_id;
  RETURN v_gate_id;
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'WOS_V1_QA_UAT_GATE_SCOPE_INVALID'
    USING ERRCODE='42501';
END;
$open$;
REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_open_gate(
  text,uuid,uuid,uuid,text[],timestamptz
) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.wos_v1_qa_uat_m2_action(
  p_authorization_id text,
  p_order_id uuid,
  p_expected_version integer,
  p_request_id uuid,
  p_action text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $m2$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
BEGIN
  IF btrim(p_authorization_id)<>'WOS-V1-PRODUCTION-M2-QA-UAT-001' THEN
    RAISE EXCEPTION 'QA_UAT_AUTHORIZATION_ID_MISMATCH' USING ERRCODE='42501';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT v_actor
  FROM public.profiles profile
  WHERE profile.user_id=auth.uid()
    AND profile.is_active=true;
  SELECT * INTO STRICT v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id=p_order_id
    AND production_order.organization_id=v_actor.org_id
    AND production_order.order_number LIKE 'QA-NONPROD-%';
  PERFORM 1
  FROM wos_v1_qa_uat.write_gates gate
  WHERE gate.project_ref='xulmpqaknlwqqculbsek'
    AND gate.order_id=p_order_id
    AND gate.organization_id=v_actor.org_id
    AND gate.actor_profile_id=v_actor.id
    AND gate.authorization_id=p_authorization_id
    AND gate.state='OPEN'
    AND gate.opened_at<=clock_timestamp()
    AND gate.expires_at>clock_timestamp()
    AND p_action=ANY(gate.allowed_actions)
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QA_UAT_M2_GATE_CLOSED' USING ERRCODE='42501';
  END IF;
  UPDATE wos_v1_qa_uat.write_gates
  SET last_used_at=clock_timestamp()
  WHERE order_id=p_order_id
    AND project_ref='xulmpqaknlwqqculbsek'
    AND authorization_id=p_authorization_id
    AND organization_id=v_actor.org_id
    AND actor_profile_id=v_actor.id
    AND state='OPEN'
    AND opened_at<=clock_timestamp()
    AND expires_at>clock_timestamp()
    AND p_action=ANY(allowed_actions);
  RETURN public.wos_v1_m2_action(
    p_order_id,p_expected_version,p_request_id,p_action,p_payload
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';
END;
$m2$;
REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_m2_action(
  text,uuid,integer,uuid,text,jsonb
) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.wos_v1_qa_uat_authorize_production_start(
  p_authorization_id text,
  p_order_id uuid,
  p_expected_version integer,
  p_request_id uuid,
  p_baseline_id uuid,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $release$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
BEGIN
  IF btrim(p_authorization_id)<>'WOS-V1-PRODUCTION-M2-QA-UAT-001' THEN
    RAISE EXCEPTION 'QA_UAT_AUTHORIZATION_ID_MISMATCH' USING ERRCODE='42501';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT v_actor
  FROM public.profiles profile
  WHERE profile.user_id=auth.uid()
    AND profile.is_active=true;
  SELECT * INTO STRICT v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id=p_order_id
    AND production_order.organization_id=v_actor.org_id
    AND production_order.order_number LIKE 'QA-NONPROD-%';
  PERFORM 1
  FROM wos_v1_qa_uat.write_gates gate
  WHERE gate.project_ref='xulmpqaknlwqqculbsek'
    AND gate.order_id=p_order_id
    AND gate.organization_id=v_actor.org_id
    AND gate.actor_profile_id=v_actor.id
    AND gate.authorization_id=p_authorization_id
    AND gate.state='OPEN'
    AND gate.opened_at<=clock_timestamp()
    AND gate.expires_at>clock_timestamp()
    AND 'START_RELEASE'=ANY(gate.allowed_actions)
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QA_UAT_START_RELEASE_GATE_CLOSED' USING ERRCODE='42501';
  END IF;
  UPDATE wos_v1_qa_uat.write_gates
  SET last_used_at=clock_timestamp()
  WHERE order_id=p_order_id
    AND project_ref='xulmpqaknlwqqculbsek'
    AND authorization_id=p_authorization_id
    AND organization_id=v_actor.org_id
    AND actor_profile_id=v_actor.id
    AND state='OPEN'
    AND opened_at<=clock_timestamp()
    AND expires_at>clock_timestamp()
    AND 'START_RELEASE'=ANY(allowed_actions);
  RETURN public.wos_v1_authorize_production_start(
    p_order_id,p_expected_version,p_request_id,p_baseline_id,p_note
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';
END;
$release$;
REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_authorize_production_start(
  text,uuid,integer,uuid,uuid,text
) FROM PUBLIC,anon,authenticated;

COMMIT;

-- NOT_AUTHORIZED
