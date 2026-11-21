-- QA-ONLY / NOT INSTALLED / NOT AUTHORIZED.
-- Replaces the historical fixed-order write guard with one dynamic,
-- organization+order-scoped guard across Office, Operator and M2 gates.
BEGIN;

CREATE SCHEMA IF NOT EXISTS wos_qa_safety;
REVOKE ALL ON SCHEMA wos_qa_safety FROM PUBLIC,anon,authenticated;

ALTER TABLE public.wos_qa_p2_execution_gate
  ADD COLUMN IF NOT EXISTS allowed_order_id uuid,
  ADD COLUMN IF NOT EXISTS allowed_organization_id uuid;
ALTER TABLE public.wos_qa_p2_office_execution_gate
  ADD COLUMN IF NOT EXISTS allowed_order_id uuid,
  ADD COLUMN IF NOT EXISTS allowed_organization_id uuid;

CREATE OR REPLACE FUNCTION wos_qa_safety.p2_single_order_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,wos_qa_safety
AS $guard$
DECLARE
 v_scope_count integer;
 v_allowed_order uuid;
 v_allowed_org uuid;
 v_order_id uuid;
 v_org_id uuid;
 v_order_number text;
BEGIN
 IF TG_OP='DELETE' THEN
   v_order_id:=OLD.id;
   v_org_id:=OLD.organization_id;
   v_order_number:=OLD.order_number;
 ELSE
   v_order_id:=NEW.id;
   v_org_id:=NEW.organization_id;
   v_order_number:=NEW.order_number;
 END IF;

 IF EXISTS (
   SELECT 1
   FROM (
     SELECT enabled,enabled_until,approval_reference FROM public.wos_qa_p2_execution_gate
     UNION ALL
     SELECT enabled,enabled_until,approval_reference FROM public.wos_qa_p2_office_execution_gate
     UNION ALL
     SELECT enabled,enabled_until,approval_reference FROM public.wos_qa_p2_m2_gate
   ) gate
   WHERE gate.enabled=true
     AND (gate.enabled_until IS NULL OR gate.enabled_until<=clock_timestamp())
) THEN RAISE EXCEPTION 'QA_GATE_EXPIRED_STILL_ENABLED' USING ERRCODE='42501'; END IF;

 WITH active_scopes AS (
   SELECT DISTINCT allowed_order_id,allowed_organization_id
   FROM (
     SELECT allowed_order_id,allowed_organization_id,enabled,enabled_until,
       approval_reference
     FROM public.wos_qa_p2_execution_gate
     UNION ALL
     SELECT allowed_order_id,allowed_organization_id,enabled,enabled_until,
       approval_reference
     FROM public.wos_qa_p2_office_execution_gate
     UNION ALL
     SELECT allowed_order_id,allowed_organization_id,enabled,enabled_until,
       approval_reference
     FROM public.wos_qa_p2_m2_gate
   ) gate
   WHERE gate.enabled=true
     AND gate.enabled_until>clock_timestamp()
     AND gate.enabled_until<=clock_timestamp()+interval '15 minutes'
     AND gate.approval_reference<>'NOT_AUTHORIZED'
     AND gate.allowed_order_id IS NOT NULL
     AND gate.allowed_organization_id IS NOT NULL
 )
 SELECT count(*),min(allowed_order_id::text)::uuid,
   min(allowed_organization_id::text)::uuid
 INTO v_scope_count,v_allowed_order,v_allowed_org
 FROM active_scopes;

 IF v_scope_count=0 THEN
   IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF v_scope_count<>1 OR v_allowed_order<>v_order_id
   OR v_allowed_org<>v_org_id OR v_order_number NOT LIKE 'QA-NONPROD-%'
 THEN RAISE EXCEPTION 'QA_P2_GATE_ORDER_SCOPE_REJECTED' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$guard$;
REVOKE ALL ON FUNCTION wos_qa_safety.p2_single_order_write_guard()
 FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS wos_qa_p2_single_order_gate_guard
 ON public.wos_production_orders;
CREATE TRIGGER wos_qa_p2_single_order_gate_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.wos_production_orders
FOR EACH ROW EXECUTE FUNCTION wos_qa_safety.p2_single_order_write_guard();
COMMIT;
