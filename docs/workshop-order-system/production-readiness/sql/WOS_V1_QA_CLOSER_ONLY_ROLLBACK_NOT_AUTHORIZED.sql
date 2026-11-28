-- QA closer-only public RPC removal. NOT AUTHORIZED FOR EXECUTION.
-- Audit tables and close receipts are retained.
BEGIN;

DO $guard$
DECLARE
  v_owner text;
  v_probe_oid oid;
  v_close_oid oid;
  v_heartbeat_oid oid;
  v_preflight_oid oid;
  v_status_oid oid;
  v_probe_definition_md5 text;
  v_close_definition_md5 text;
  v_heartbeat_definition_md5 text;
  v_preflight_definition_md5 text;
  v_status_definition_md5 text;
BEGIN
  IF current_setting('wos_v1.qa_closer_rollback_authorized',true)
    IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_CLOSER_ROLLBACK_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project',true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_PROJECT_MISMATCH';
  END IF;
  SELECT public_api_owner,edge_probe_oid,close_edge_oid,
    edge_heartbeat_oid,edge_preflight_oid,edge_status_oid,
    edge_probe_definition_md5,close_edge_definition_md5,
    edge_heartbeat_definition_md5,edge_preflight_definition_md5,
    edge_status_definition_md5
  INTO STRICT v_owner,v_probe_oid,v_close_oid,v_heartbeat_oid,
    v_preflight_oid,v_status_oid,
    v_probe_definition_md5,v_close_definition_md5,
    v_heartbeat_definition_md5,v_preflight_definition_md5,
    v_status_definition_md5
  FROM wos_v1_qa_closer.lifecycle
  WHERE singleton=true;
  IF v_owner<>'CLOSER_ONLY' THEN
    RAISE EXCEPTION 'WOS_V1_QA_CLOSER_PUBLIC_API_OWNER_MISMATCH';
  END IF;
  IF EXISTS(
    SELECT 1 FROM wos_v1_qa_closer.controls control
    WHERE control.db_state<>'CLOSED' OR control.edge_state<>'CLOSED'
  ) OR EXISTS(
    SELECT 1 FROM wos_v1_qa_closer.controls control
    WHERE NOT EXISTS(
      SELECT 1 FROM wos_v1_qa_closer.close_receipts receipt
      WHERE receipt.execution_id=control.execution_id
        AND receipt.closer_kind='DB'
        AND receipt.timely=true
    ) OR NOT EXISTS(
      SELECT 1 FROM wos_v1_qa_closer.close_receipts receipt
      WHERE receipt.execution_id=control.execution_id
        AND receipt.closer_kind='EDGE'
        AND receipt.timely=true
    ) OR control.edge_probe_verified_at IS NULL
      OR control.edge_probe_execution_id<>control.execution_id
  ) THEN
    RAISE EXCEPTION 'WOS_V1_QA_CLOSER_ROLLBACK_REQUIRES_VERIFIED_CLOSE';
  END IF;
  IF v_probe_oid IS NULL
    OR v_probe_oid<>
      'public.wos_v1_qa_uat_edge_probe(uuid,uuid)'::regprocedure::oid
    OR v_probe_definition_md5 IS DISTINCT FROM md5(pg_get_functiondef(
      'public.wos_v1_qa_uat_edge_probe(uuid,uuid)'::regprocedure
    ))
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_CLOSER_PUBLIC_API_OWNERSHIP_MISMATCH';
  END IF;
  IF v_close_oid IS NULL
    OR v_close_oid<>
      'public.wos_v1_qa_uat_close_edge(uuid,uuid,text)'::regprocedure::oid
    OR v_close_definition_md5 IS DISTINCT FROM md5(pg_get_functiondef(
      'public.wos_v1_qa_uat_close_edge(uuid,uuid,text)'::regprocedure
    ))
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_CLOSER_PUBLIC_API_OWNERSHIP_MISMATCH';
  END IF;
  IF v_heartbeat_oid IS NULL
    OR v_heartbeat_oid<>
      'public.wos_v1_qa_uat_edge_heartbeat(uuid,uuid,uuid)'::regprocedure::oid
    OR v_heartbeat_definition_md5 IS DISTINCT FROM md5(pg_get_functiondef(
      'public.wos_v1_qa_uat_edge_heartbeat(uuid,uuid,uuid)'::regprocedure
    ))
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_CLOSER_PUBLIC_API_OWNERSHIP_MISMATCH';
  END IF;
  IF v_preflight_oid IS NULL
    OR v_preflight_oid<>
      'public.wos_v1_qa_uat_edge_preflight(uuid,uuid,uuid)'
        ::regprocedure::oid
    OR v_preflight_definition_md5 IS DISTINCT FROM md5(pg_get_functiondef(
      'public.wos_v1_qa_uat_edge_preflight(uuid,uuid,uuid)'::regprocedure
    ))
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_CLOSER_PUBLIC_API_OWNERSHIP_MISMATCH';
  END IF;
  IF v_status_oid IS NULL
    OR v_status_oid<>
      'public.wos_v1_qa_uat_edge_control_status(text,text)'
        ::regprocedure::oid
    OR v_status_definition_md5 IS DISTINCT FROM md5(pg_get_functiondef(
      'public.wos_v1_qa_uat_edge_control_status(text,text)'::regprocedure
    ))
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_CLOSER_PUBLIC_API_OWNERSHIP_MISMATCH';
  END IF;
END;
$guard$;

DROP FUNCTION IF EXISTS public.wos_v1_qa_uat_edge_probe(uuid,uuid);
DROP FUNCTION IF EXISTS public.wos_v1_qa_uat_close_edge(uuid,uuid,text);
DROP FUNCTION IF EXISTS public.wos_v1_qa_uat_edge_heartbeat(uuid,uuid,uuid);
DROP FUNCTION IF EXISTS public.wos_v1_qa_uat_edge_preflight(uuid,uuid,uuid);
DROP FUNCTION IF EXISTS public.wos_v1_qa_uat_edge_control_status(text,text);
UPDATE wos_v1_qa_closer.lifecycle
SET public_api_owner='NONE',
    edge_probe_oid=NULL,
    close_edge_oid=NULL,
    edge_heartbeat_oid=NULL,
    edge_preflight_oid=NULL,
    edge_status_oid=NULL,
    edge_probe_definition_md5=NULL,
    close_edge_definition_md5=NULL,
    edge_heartbeat_definition_md5=NULL,
    edge_preflight_definition_md5=NULL,
    edge_status_definition_md5=NULL,
    updated_at=clock_timestamp()
WHERE singleton=true;

COMMIT;

-- Closer-only public RPCs removed; wos_v1_qa_closer audit tables retained.
