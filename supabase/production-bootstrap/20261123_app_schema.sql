

-- WOS V1 PRODUCTION READINESS / APPLICATION SCHEMA-ONLY BOOTSTRAP
-- Source: Supabase Production amqpvxrurenevniilhtl.
-- Schemas: public, commercial_private, commercial_audit.
-- Captured read-only: 2026-11-23. No table rows or Auth users.
-- Supabase-managed auth/storage schemas are emulated separately for offline tests.
-- This file is a review artifact and is NOT an authorized Production migration.


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "commercial_audit";


ALTER SCHEMA "commercial_audit" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "commercial_private";


ALTER SCHEMA "commercial_private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "commercial_audit"."record_commercial_draft_revision"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
  if TG_OP='UPDATE' then
    if old.org_id<>new.org_id or old.owner_profile_id<>new.owner_profile_id or old.id<>new.id
      or new.revision<>old.revision+1 or new.updated_at<=old.updated_at
      or old.status<>'active' then
      raise exception 'Invalid quotation draft revision/owner transition';
    end if;
  elsif TG_OP='INSERT' and (new.revision<>1 or new.status<>'active') then
    raise exception 'Invalid initial quotation draft revision';
  end if;
  insert into public.commercial_quotation_draft_revisions
    (draft_id,org_id,owner_profile_id,editor_profile_id,revision,status,snapshot)
  values
    (new.id,new.org_id,new.owner_profile_id,new.updated_by_profile_id,
     new.revision,new.status,new.draft_json);
  return new;
end;
$$;


ALTER FUNCTION "commercial_audit"."record_commercial_draft_revision"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "commercial_private"."freeze_confirmed_payment_method"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
declare v_id text; v_method public.commercial_payment_methods%rowtype;
 v_members jsonb; v_count int;
begin
 v_id=coalesce(new.snapshot->>'paymentMethodId','');
 if v_id='' then
   new.payment_snapshot='{}'::jsonb;
 elsif v_id='wechat_alipay' then
   select count(*),jsonb_agg(jsonb_build_object(
     'methodKey',method_key,'labelZh',label_zh,'labelEn',label_en,
     'beneficiary',beneficiary,'qrSha256',qr_sha256) order by method_key)
   into v_count,v_members from public.commercial_payment_methods
   where org_id=new.org_id and approved=true
   and method_key in('wechat_qr','alipay_qr') and qr_sha256 is not null;
   if v_count<>2 then raise exception 'PAYMENT_METHOD_NOT_APPROVED';end if;
   new.payment_snapshot=jsonb_build_object('kind','qr_pair','members',v_members);
 else
   if v_id !~ '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
     raise exception 'INVALID_PAYMENT_METHOD';end if;
   select * into v_method from public.commercial_payment_methods
   where id=v_id::uuid and org_id=new.org_id and approved=true;
   if not found or v_method.kind<>'bank' then
     raise exception 'PAYMENT_METHOD_NOT_APPROVED';end if;
   new.payment_snapshot=jsonb_build_object(
     'kind','bank','methodKey',v_method.method_key,
     'labelZh',v_method.label_zh,'labelEn',v_method.label_en,
     'beneficiary',v_method.beneficiary,'bankName',v_method.bank_name,
     'accountNo',v_method.account_no,'notes',v_method.notes);
 end if;
 return new;
end $_$;


ALTER FUNCTION "commercial_private"."freeze_confirmed_payment_method"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "commercial_private"."guard_confirmed_quote_header"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
 if TG_OP='DELETE' then raise exception 'CONFIRMED_QUOTES_ARE_IMMUTABLE';end if;
 if TG_OP='UPDATE' then
  if new.id<>old.id or new.org_id<>old.org_id
    or new.owner_profile_id<>old.owner_profile_id
    or new.document_no<>old.document_no
    or new.latest_version<>old.latest_version+1
  then raise exception 'INVALID_CONFIRMED_QUOTE_TRANSITION';end if;
 end if;
 return new;
end $$;


ALTER FUNCTION "commercial_private"."guard_confirmed_quote_header"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "commercial_private"."guard_confirmed_quote_version"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
declare v_section jsonb; v_line jsonb; v_total numeric:=0;
 v_price text; v_qty text; v_name text; v_mode text; v_lines integer:=0;
begin
 if TG_OP <> 'INSERT' then raise exception 'CONFIRMED_VERSIONS_ARE_IMMUTABLE'; end if;
 if new.snapshot->>'kind'<>'quotation'
 or new.snapshot->>'language' not in ('zh','en')
 or new.snapshot->>'currency'<>new.currency
 or new.snapshot->>'buyerName'<>new.buyer_name
 or btrim(coalesce(new.snapshot->>'buyerName',''))=''
 or new.snapshot->>'documentNo' is null
 or new.snapshot->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 or coalesce(jsonb_typeof(new.snapshot->'sections'),'')<>'array'
 or jsonb_array_length(new.snapshot->'sections')=0
 then raise exception 'INVALID_CONFIRMED_QUOTE'; end if;
 if not exists(select 1 from public.commercial_confirmed_quotes q
   where q.id=new.quote_id and q.org_id=new.org_id
   and q.document_no=new.snapshot->>'documentNo')
 then raise exception 'CONFIRMED_QUOTE_NUMBER_MISMATCH'; end if;
 for v_section in select value from jsonb_array_elements(new.snapshot->'sections') loop
  if btrim(coalesce(v_section->>'title',''))='' or
     coalesce(jsonb_typeof(v_section->'items'),'')<>'array' or
     jsonb_array_length(v_section->'items')=0
  then raise exception 'INVALID_SECTION';end if;
  for v_line in select value from jsonb_array_elements(v_section->'items') loop
   v_lines:=v_lines+1;
   v_name:=btrim(coalesce(v_line->>'name',''));
   v_mode:=v_line->>'mode';
   v_price:=coalesce(v_line->>'unitPrice','');
   v_qty:=coalesce(v_line->>'quantity','');
   if v_name='' or v_mode not in ('amount','catalog') or
     v_price !~ '^[0-9]{1,11}([.][0-9]{1,4})?$'
   then raise exception 'INVALID_LINE';end if;
   if v_mode='amount' then
    if v_qty !~ '^[0-9]{1,9}([.][0-9]{1,3})?$' or v_qty::numeric<=0
    then raise exception 'INVALID_QUANTITY'; end if;
    v_total:=v_total+round(v_price::numeric*v_qty::numeric,3);
   end if;
  end loop;
 end loop;
 if v_lines>1000 or v_total*1000<>new.amount_thousandths or
 v_total>9007199254740.991
 then raise exception 'AMOUNT_MISMATCH';end if;
 return new;
end $_$;


ALTER FUNCTION "commercial_private"."guard_confirmed_quote_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_has_role"("required_role" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND is_active = true
      AND role = required_role
  );
$$;


ALTER FUNCTION "public"."auth_has_role"("required_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_org_id"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT org_id::text FROM public.profiles
      WHERE user_id = auth.uid() AND is_active = true
      LIMIT 1),
    ''
  );
$$;


ALTER FUNCTION "public"."auth_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_profile_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id
  FROM public.profiles
  WHERE user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;


ALTER FUNCTION "public"."auth_profile_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_user_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT auth.uid();
$$;


ALTER FUNCTION "public"."auth_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_commercial_quote"("p_request_id" "uuid", "p_quote_id" "uuid", "p_expected_version" integer, "p_draft_id" "uuid", "p_snapshot" "jsonb", "p_amount_thousandths" bigint) RETURNS TABLE("quote_id" "uuid", "version" integer, "version_id" "uuid", "confirmed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare v_profile public.profiles%rowtype; v_quote public.commercial_confirmed_quotes%rowtype;
 v_no text; v_existing public.commercial_confirmed_quote_versions%rowtype; v_record public.commercial_confirmed_quote_versions%rowtype;
begin
 select * into v_profile from public.profiles where user_id=auth.uid() and is_active
 and role in('admin','manager','operator','sales') limit 1;
 if v_profile.id is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
 if p_request_id is null or p_snapshot is null or jsonb_typeof(p_snapshot)<>'object'
 or p_amount_thousandths is null or p_amount_thousandths<0
 or p_amount_thousandths>9007199254740991 then raise exception 'INVALID_CONFIRMATION'; end if;
 if p_snapshot->>'kind'<>'quotation' or p_snapshot->>'language' not in('zh','en')
 or p_snapshot->>'currency' not in('CNY','USD','EUR') then raise exception 'INVALID_QUOTATION'; end if;
 v_no=btrim(coalesce(p_snapshot->>'documentNo',''));
 if length(v_no) not between 1 and 80 or length(btrim(coalesce(p_snapshot->>'buyerName','')))=0
 then raise exception 'MISSING_FIELDS'; end if;
 -- Avoid double-write on timeout/retry using an organization-scoped idempotency key.
 select * into v_existing from public.commercial_confirmed_quote_versions
 where org_id=v_profile.org_id and request_id=p_request_id;
 if found then
  if not exists(select 1 from public.commercial_confirmed_quotes prior
    where prior.id=v_existing.quote_id and prior.org_id=v_profile.org_id
      and prior.owner_profile_id=v_profile.id)
  then raise exception 'REQUEST_FORBIDDEN' using errcode='42501'; end if;
  if p_quote_id is distinct from v_existing.quote_id and p_quote_id is not null
  then raise exception 'REQUEST_CONFLICT'; end if;
  if p_snapshot is distinct from v_existing.snapshot or
     p_amount_thousandths is distinct from v_existing.amount_thousandths
  then raise exception 'REQUEST_PAYLOAD_CONFLICT'; end if;
  return query select v_existing.quote_id,v_existing.version,v_existing.id,v_existing.confirmed_at; return;
 end if;
 if p_draft_id is not null and not exists(
 select 1 from public.commercial_quotation_drafts d
 where d.id=p_draft_id and d.org_id=v_profile.org_id
 and d.owner_profile_id=v_profile.id and d.status='active')
 then raise exception 'DRAFT_UNAVAILABLE' using errcode='42501'; end if;
 -- Lock per organization/number for parallel initial creates and sequential versions.
 perform pg_advisory_xact_lock(hashtextextended(v_profile.org_id::text||':'||v_no,0));
 if p_quote_id is null then
  if coalesce(p_expected_version,0)<>0 then raise exception 'VERSION_CONFLICT'; end if;
  insert into public.commercial_confirmed_quotes(org_id,owner_profile_id,document_no)
   values(v_profile.org_id,v_profile.id,v_no)
   on conflict(org_id,document_no) do nothing;
  select * into v_quote from public.commercial_confirmed_quotes
   where org_id=v_profile.org_id and document_no=v_no for update;
  if v_quote.latest_version<>0 then raise exception 'VERSION_CONFLICT'; end if;
 else
  select * into v_quote from public.commercial_confirmed_quotes
  where id=p_quote_id and org_id=v_profile.org_id for update;
  if not found or v_quote.owner_profile_id<>v_profile.id then raise exception 'QUOTE_FORBIDDEN' using errcode='42501'; end if;
  if v_quote.document_no<>v_no then raise exception 'NUMBER_MISMATCH'; end if;
  if v_quote.latest_version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
 end if;
 insert into public.commercial_confirmed_quote_versions
 (quote_id,org_id,version,request_id,snapshot,amount_thousandths,currency,buyer_name,project_name,confirmed_by_profile_id)
 values(v_quote.id,v_profile.org_id,v_quote.latest_version+1,p_request_id,p_snapshot,p_amount_thousandths,
  p_snapshot->>'currency',p_snapshot->>'buyerName',coalesce(p_snapshot->>'projectName',''),v_profile.id)
 returning * into v_record;
 update public.commercial_confirmed_quotes set latest_version=v_record.version where id=v_quote.id;
 if p_draft_id is not null then
  update public.commercial_quotation_drafts set status='archived',revision=revision+1,updated_at=now(),updated_by_profile_id=v_profile.id
  where id=p_draft_id and org_id=v_profile.org_id and owner_profile_id=v_profile.id and status='active';
 end if;
 return query select v_record.quote_id,v_record.version,v_record.id,v_record.confirmed_at;
end $$;


ALTER FUNCTION "public"."confirm_commercial_quote"("p_request_id" "uuid", "p_quote_id" "uuid", "p_expected_version" integer, "p_draft_id" "uuid", "p_snapshot" "jsonb", "p_amount_thousandths" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_accept_ai_draft"("p_ai_draft_id" "uuid", "p_expected_version" integer, "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."cpc_accept_ai_draft"("p_ai_draft_id" "uuid", "p_expected_version" integer, "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_build_daily_report_metrics"("p_org_id" "uuid", "p_subject_profile_id" "uuid", "p_business_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;

  v_meaningful_progress INTEGER := 0;
  v_state_change INTEGER := 0;
  v_project_created INTEGER := 0;
  v_project_won INTEGER := 0;
  v_project_lost INTEGER := 0;

  v_next_created INTEGER := 0;
  v_next_completed INTEGER := 0;
  v_next_rescheduled INTEGER := 0;

  v_commitment_due INTEGER := 0;
  v_commitment_completed INTEGER := 0;
  v_commitment_overdue_end INTEGER := 0;

  v_internal_completed INTEGER := 0;
  v_management_completed INTEGER := 0;
  v_relationship_follow_up INTEGER := 0;

  v_quote_sent INTEGER := 0;
  v_sample_sent INTEGER := 0;
  v_customer_confirmed INTEGER := 0;
  v_order_confirmed INTEGER := 0;
BEGIN
  v_start := p_business_date::TIMESTAMP AT TIME ZONE 'Asia/Shanghai';
  v_end := (p_business_date + 1)::TIMESTAMP AT TIME ZONE 'Asia/Shanghai';

  SELECT COUNT(*)::INTEGER
    INTO v_meaningful_progress
    FROM public.cpc_project_events e
    WHERE e.org_id = p_org_id
      AND e.actor_profile_id = p_subject_profile_id
      AND e.occurred_at >= v_start
      AND e.occurred_at < v_end
      AND e.event_type IN (
        'EFFECTIVE_PROGRESS_RECORDED',
        'QUOTE_SENT',
        'SAMPLE_SENT',
        'CUSTOMER_CONFIRMED',
        'COMMERCIAL_CONFIRMED',
        'ORDER_CONFIRMED',
        'PROJECT_WON'
      );

  SELECT COUNT(*)::INTEGER
    INTO v_state_change
    FROM public.cpc_project_events e
    WHERE e.org_id = p_org_id
      AND e.actor_profile_id = p_subject_profile_id
      AND e.occurred_at >= v_start
      AND e.occurred_at < v_end
      AND e.event_type IN (
        'WAITING_STARTED',
        'WAITING_RESOLVED',
        'STAGE_CHANGED',
        'PROJECT_PAUSED',
        'PROJECT_REOPENED',
        'PROJECT_LOST',
        'PROJECT_CANCELLED'
      );

  SELECT COUNT(*)::INTEGER
    INTO v_project_created
    FROM public.cpc_projects p
    WHERE p.org_id = p_org_id
      AND p.created_by_profile_id = p_subject_profile_id
      AND p.created_at >= v_start
      AND p.created_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_project_won
    FROM public.cpc_project_events e
    WHERE e.org_id = p_org_id
      AND e.actor_profile_id = p_subject_profile_id
      AND e.event_type = 'PROJECT_WON'
      AND e.occurred_at >= v_start
      AND e.occurred_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_project_lost
    FROM public.cpc_project_events e
    WHERE e.org_id = p_org_id
      AND e.actor_profile_id = p_subject_profile_id
      AND e.event_type = 'PROJECT_LOST'
      AND e.occurred_at >= v_start
      AND e.occurred_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_next_created
    FROM public.cpc_work_items wi
    WHERE wi.org_id = p_org_id
      AND wi.created_by_profile_id = p_subject_profile_id
      AND wi.work_item_type = 'NEXT_ACTION'
      AND wi.created_at >= v_start
      AND wi.created_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_next_completed
    FROM public.cpc_work_items wi
    WHERE wi.org_id = p_org_id
      AND wi.completed_by_profile_id = p_subject_profile_id
      AND wi.work_item_type = 'NEXT_ACTION'
      AND wi.completed_at >= v_start
      AND wi.completed_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_next_rescheduled
    FROM public.cpc_audit_log a
    WHERE a.org_id = p_org_id
      AND a.actor_profile_id = p_subject_profile_id
      AND a.action = 'WORK_ITEM_RESCHEDULED'
      AND a.recorded_at >= v_start
      AND a.recorded_at < v_end
      AND a.metadata ->> 'work_item_type' = 'NEXT_ACTION';

  SELECT COUNT(*)::INTEGER
    INTO v_commitment_due
    FROM public.cpc_work_items wi
    WHERE wi.org_id = p_org_id
      AND wi.assignee_profile_id = p_subject_profile_id
      AND wi.work_item_type = 'CUSTOMER_COMMITMENT'
      AND wi.due_at >= v_start
      AND wi.due_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_commitment_completed
    FROM public.cpc_work_items wi
    WHERE wi.org_id = p_org_id
      AND wi.completed_by_profile_id = p_subject_profile_id
      AND wi.work_item_type = 'CUSTOMER_COMMITMENT'
      AND wi.completed_at >= v_start
      AND wi.completed_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_commitment_overdue_end
    FROM public.cpc_work_items wi
    WHERE wi.org_id = p_org_id
      AND wi.assignee_profile_id = p_subject_profile_id
      AND wi.work_item_type = 'CUSTOMER_COMMITMENT'
      AND wi.created_at < v_end
      AND wi.due_at IS NOT NULL
      AND wi.due_at < v_end
      AND (wi.completed_at IS NULL OR wi.completed_at >= v_end)
      AND (wi.cancelled_at IS NULL OR wi.cancelled_at >= v_end);

  SELECT COUNT(*)::INTEGER
    INTO v_internal_completed
    FROM public.cpc_work_items wi
    WHERE wi.org_id = p_org_id
      AND wi.completed_by_profile_id = p_subject_profile_id
      AND wi.work_item_type = 'INTERNAL_COLLABORATION'
      AND wi.completed_at >= v_start
      AND wi.completed_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_management_completed
    FROM public.cpc_work_items wi
    WHERE wi.org_id = p_org_id
      AND wi.completed_by_profile_id = p_subject_profile_id
      AND wi.work_item_type = 'MANAGEMENT_DECISION'
      AND wi.completed_at >= v_start
      AND wi.completed_at < v_end;

  SELECT COUNT(*)::INTEGER
    INTO v_relationship_follow_up
    FROM public.cpc_project_events e
    WHERE e.org_id = p_org_id
      AND e.actor_profile_id = p_subject_profile_id
      AND e.project_id IS NULL
      AND e.occurred_at >= v_start
      AND e.occurred_at < v_end
      AND e.payload -> 'relationship_follow_up' = 'true'::JSONB;

  SELECT
    COUNT(*) FILTER (WHERE e.event_type = 'QUOTE_SENT')::INTEGER,
    COUNT(*) FILTER (WHERE e.event_type = 'SAMPLE_SENT')::INTEGER,
    COUNT(*) FILTER (WHERE e.event_type IN ('CUSTOMER_CONFIRMED', 'COMMERCIAL_CONFIRMED'))::INTEGER,
    COUNT(*) FILTER (WHERE e.event_type = 'ORDER_CONFIRMED')::INTEGER
    INTO
      v_quote_sent,
      v_sample_sent,
      v_customer_confirmed,
      v_order_confirmed
    FROM public.cpc_project_events e
    WHERE e.org_id = p_org_id
      AND e.actor_profile_id = p_subject_profile_id
      AND e.occurred_at >= v_start
      AND e.occurred_at < v_end;

  RETURN jsonb_build_object(
    'meaningfulProgressCount', jsonb_build_object('state', 'known', 'value', v_meaningful_progress),
    'stageLifecycleWaitingChangeCount', jsonb_build_object('state', 'known', 'value', v_state_change),
    'projectCreatedCount', jsonb_build_object('state', 'known', 'value', v_project_created),
    'projectWonCount', jsonb_build_object('state', 'known', 'value', v_project_won),
    'projectLostCount', jsonb_build_object('state', 'known', 'value', v_project_lost),
    'nextActionCreatedCount', jsonb_build_object('state', 'known', 'value', v_next_created),
    'nextActionCompletedCount', jsonb_build_object('state', 'known', 'value', v_next_completed),
    'nextActionRescheduledCount', jsonb_build_object('state', 'known', 'value', v_next_rescheduled),
    'customerCommitmentDueCount', jsonb_build_object('state', 'known', 'value', v_commitment_due),
    'customerCommitmentCompletedCount', jsonb_build_object('state', 'known', 'value', v_commitment_completed),
    'customerCommitmentOverdueEndCount', jsonb_build_object('state', 'known', 'value', v_commitment_overdue_end),
    'internalCollaborationCompletedCount', jsonb_build_object('state', 'known', 'value', v_internal_completed),
    'managementDecisionCompletedCount', jsonb_build_object('state', 'known', 'value', v_management_completed),
    'oldCustomerFollowUpCount', jsonb_build_object('state', 'known', 'value', v_relationship_follow_up),
    'quoteSentCount', jsonb_build_object('state', 'known', 'value', v_quote_sent),
    'sampleSentCount', jsonb_build_object('state', 'known', 'value', v_sample_sent),
    'customerCommercialConfirmedCount', jsonb_build_object('state', 'known', 'value', v_customer_confirmed),
    'orderConfirmedCount', jsonb_build_object('state', 'known', 'value', v_order_confirmed)
  );
END;
$$;


ALTER FUNCTION "public"."cpc_build_daily_report_metrics"("p_org_id" "uuid", "p_subject_profile_id" "uuid", "p_business_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_can_assess_customer_rating"("p_customer_reference_id" "uuid", "p_org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."cpc_can_assess_customer_rating"("p_customer_reference_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_can_follow_customer"("p_customer_reference_id" "uuid", "p_org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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
      FROM public.cpc_customer_references cr
      WHERE cr.id = p_customer_reference_id
        AND cr.org_id = p_org_id
    );
  END IF;

  IF NOT public.auth_has_role('sales') THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cpc_customer_references cr
    WHERE cr.id = p_customer_reference_id
      AND cr.org_id = p_org_id
      AND (
        (
          cr.reference_kind = 'provisional'
          AND cr.created_by_profile_id = v_actor_profile_id
        )
        OR (
          cr.reference_kind = 'canonical'
          AND cr.external_source IS NOT NULL
          AND cr.external_owner_reference IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.cpc_external_profile_mappings epm
            WHERE epm.org_id = cr.org_id
              AND epm.external_source = cr.external_source
              AND epm.external_person_id = cr.external_owner_reference
              AND epm.profile_id = v_actor_profile_id
              AND epm.status = 'active'
          )
        )
        OR EXISTS (
          SELECT 1
          FROM public.cpc_work_items wi
          WHERE wi.org_id = cr.org_id
            AND wi.customer_reference_id = cr.id
            AND wi.project_id IS NULL
            AND wi.work_item_type = 'FOLLOW_UP'
            AND wi.assignee_profile_id = v_actor_profile_id
            AND wi.status IN ('pending', 'in_progress', 'blocked')
        )
      )
  );
END;
$$;


ALTER FUNCTION "public"."cpc_can_follow_customer"("p_customer_reference_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_can_read_ai_draft"("p_ai_draft_id" "uuid", "p_org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."cpc_can_read_ai_draft"("p_ai_draft_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_can_read_customer_reference"("p_customer_reference_id" "uuid", "p_org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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
      FROM public.cpc_customer_references cr
      WHERE cr.id = p_customer_reference_id
        AND cr.org_id = p_org_id
    );
  END IF;

  IF NOT public.auth_has_role('sales') THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cpc_customer_references cr
    WHERE cr.id = p_customer_reference_id
      AND cr.org_id = p_org_id
      AND (
        (
          cr.reference_kind = 'provisional'
          AND cr.created_by_profile_id = v_actor_profile_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.cpc_projects p
          WHERE p.customer_reference_id = cr.id
            AND p.org_id = cr.org_id
            AND public.cpc_can_read_project(p.id, p.org_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.cpc_work_items wi
          WHERE wi.customer_reference_id = cr.id
            AND wi.org_id = cr.org_id
            AND wi.project_id IS NULL
            AND (
              wi.assignee_profile_id = v_actor_profile_id
              OR wi.created_by_profile_id = v_actor_profile_id
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.cpc_external_profile_mappings epm
          WHERE epm.org_id = cr.org_id
            AND epm.external_source = cr.external_source
            AND epm.external_person_id = cr.external_owner_reference
            AND epm.profile_id = v_actor_profile_id
            AND epm.status = 'active'
        )
      )
  );
END;
$$;


ALTER FUNCTION "public"."cpc_can_read_customer_reference"("p_customer_reference_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_can_read_project"("p_project_id" "uuid", "p_org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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
      FROM public.cpc_projects p
      WHERE p.id = p_project_id
        AND p.org_id = p_org_id
    );
  END IF;

  IF NOT public.auth_has_role('sales') THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cpc_projects p
    WHERE p.id = p_project_id
      AND p.org_id = p_org_id
      AND (
        p.owner_profile_id = v_actor_profile_id
        OR p.created_by_profile_id = v_actor_profile_id
        OR EXISTS (
          SELECT 1
          FROM public.cpc_project_members pm
          WHERE pm.project_id = p.id
            AND pm.org_id = p.org_id
            AND pm.profile_id = v_actor_profile_id
            AND pm.removed_at IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM public.cpc_work_items wi
          WHERE wi.project_id = p.id
            AND wi.org_id = p.org_id
            AND (
              wi.assignee_profile_id = v_actor_profile_id
              OR wi.created_by_profile_id = v_actor_profile_id
            )
        )
      )
  );
END;
$$;


ALTER FUNCTION "public"."cpc_can_read_project"("p_project_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_can_read_report"("p_report_id" "uuid", "p_org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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
      FROM public.cpc_reports r
      WHERE r.id = p_report_id
        AND r.org_id = p_org_id
    );
  END IF;

  IF NOT public.auth_has_role('sales') THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cpc_reports r
    WHERE r.id = p_report_id
      AND r.org_id = p_org_id
      AND r.subject_profile_id = v_actor_profile_id
  );
END;
$$;


ALTER FUNCTION "public"."cpc_can_read_report"("p_report_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_can_read_work_item"("p_work_item_id" "uuid", "p_org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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
      FROM public.cpc_work_items wi
      WHERE wi.id = p_work_item_id
        AND wi.org_id = p_org_id
    );
  END IF;

  IF NOT public.auth_has_role('sales') THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cpc_work_items wi
    WHERE wi.id = p_work_item_id
      AND wi.org_id = p_org_id
      AND (
        wi.assignee_profile_id = v_actor_profile_id
        OR wi.created_by_profile_id = v_actor_profile_id
        OR (
          wi.project_id IS NOT NULL
          AND public.cpc_can_read_project(wi.project_id, wi.org_id)
        )
        OR (
          wi.project_id IS NULL
          AND wi.customer_reference_id IS NOT NULL
          AND public.cpc_can_read_customer_reference(
            wi.customer_reference_id,
            wi.org_id
          )
        )
      )
  );
END;
$$;


ALTER FUNCTION "public"."cpc_can_read_work_item"("p_work_item_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_can_self_rate_customer"("p_customer_reference_id" "uuid", "p_org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_id UUID := public.auth_profile_id();
BEGIN
  IF v_actor_id IS NULL OR public.auth_org_id() IS DISTINCT FROM p_org_id::text THEN
    RETURN FALSE;
  END IF;

  -- Includes admin/manager and the legitimate mapped customer-owner/creator
  -- but does not grant them any new permissions on notes/financial data.
  IF public.cpc_can_assess_customer_rating(p_customer_reference_id,p_org_id) THEN
    RETURN TRUE;
  END IF;
  IF NOT public.auth_has_role('sales') THEN RETURN FALSE; END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.cpc_projects project
      JOIN public.cpc_customer_references customer
        ON customer.id=project.customer_reference_id
       AND customer.org_id=project.org_id
     WHERE project.customer_reference_id=p_customer_reference_id
       AND project.org_id=p_org_id
       AND project.owner_profile_id=v_actor_id
       AND project.status IN ('active','paused','won')
       AND customer.status IN ('active','pending_review')
  );
END;
$$;


ALTER FUNCTION "public"."cpc_can_self_rate_customer"("p_customer_reference_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_create_ai_work_item_draft"("p_customer_reference_id" "uuid", "p_project_id" "uuid", "p_work_item_type" "text", "p_title" "text", "p_description" "text" DEFAULT NULL::"text", "p_due_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_priority" "text" DEFAULT 'medium'::"text", "p_raw_input" "text" DEFAULT NULL::"text", "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."cpc_create_ai_work_item_draft"("p_customer_reference_id" "uuid", "p_project_id" "uuid", "p_work_item_type" "text", "p_title" "text", "p_description" "text", "p_due_at" timestamp with time zone, "p_priority" "text", "p_raw_input" "text", "p_expires_at" timestamp with time zone, "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_create_project"("p_customer_reference_id" "uuid", "p_title" "text", "p_objective_summary" "text", "p_project_type" "text", "p_stage" "text", "p_priority" "text", "p_owner_profile_id" "uuid" DEFAULT NULL::"uuid", "p_initial_next_action_title" "text" DEFAULT NULL::"text", "p_initial_next_action_due_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_waiting_on" "text" DEFAULT 'none'::"text", "p_next_check_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_owner_profile_id UUID;
  v_owner_role TEXT;
  v_customer public.cpc_customer_references%ROWTYPE;
  v_project_id UUID;
  v_next_action_id UUID;
  v_next_action_title TEXT := NULLIF(btrim(p_initial_next_action_title), '');
  v_replay_project_id UUID;
  v_replay_next_action_id UUID;
  v_replay_version INTEGER;
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
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效项目创建权限');
  END IF;

  IF p_request_id IS NOT NULL THEN
    SELECT
      al.entity_id,
      NULLIF(al.metadata ->> 'initial_next_action_id', '')::UUID,
      COALESCE(NULLIF(al.after_values ->> 'version', '')::INTEGER, 1)
      INTO v_replay_project_id, v_replay_next_action_id, v_replay_version
      FROM public.cpc_audit_log al
      WHERE al.org_id = v_actor_org_id
        AND al.actor_profile_id = v_actor_profile_id
        AND al.action = 'PROJECT_CREATED'
        AND al.request_id = p_request_id
      LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', TRUE,
        'code', 'OK',
        'message', 'success',
        'data', jsonb_build_object(
          'project_id', v_replay_project_id,
          'version', v_replay_version,
          'next_action_id', v_replay_next_action_id
        )
      );
    END IF;
  END IF;

  SELECT cr.*
    INTO v_customer
    FROM public.cpc_customer_references cr
    WHERE cr.id = p_customer_reference_id
      AND cr.org_id = v_actor_org_id
    FOR SHARE;

  IF NOT FOUND THEN
    RETURN public.cpc_rpc_error('NOT_FOUND', '客户引用不存在');
  END IF;

  IF NOT (
    (v_customer.reference_kind = 'canonical' AND v_customer.status = 'active')
    OR
    (
      v_customer.reference_kind = 'provisional'
      AND v_customer.status = 'pending_review'
    )
  ) THEN
    RETURN public.cpc_rpc_error(
      'INVALID_CUSTOMER_REFERENCE',
      '当前客户引用状态不能创建项目'
    );
  END IF;

  IF v_actor_role = 'sales'
     AND NOT public.cpc_can_read_customer_reference(
       p_customer_reference_id,
       v_actor_org_id
     ) THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无权使用该客户引用');
  END IF;

  IF p_title IS NULL
     OR btrim(p_title) = ''
     OR p_objective_summary IS NULL
     OR btrim(p_objective_summary) = '' THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', '项目标题和目标不能为空');
  END IF;

  IF p_project_type NOT IN (
    'transfer_film',
    'transfer_processing',
    'equipment',
    'uv',
    'other'
  )
  OR NOT public.cpc_stage_is_valid(p_project_type, p_stage) THEN
    RETURN public.cpc_rpc_error('INVALID_STAGE', '项目类型或阶段不合法');
  END IF;

  IF p_priority IS NULL
     OR p_priority NOT IN ('low', 'medium', 'high', 'critical') THEN
    RETURN public.cpc_rpc_error('INVALID_PRIORITY', '项目优先级不合法');
  END IF;

  v_owner_profile_id := COALESCE(p_owner_profile_id, v_actor_profile_id);

  SELECT p.role
    INTO v_owner_role
    FROM public.profiles p
    WHERE p.id = v_owner_profile_id
      AND p.org_id = v_actor_org_id
      AND p.is_active = TRUE;

  IF NOT FOUND
     OR v_owner_role IS NULL
     OR v_owner_role NOT IN ('admin', 'manager', 'sales') THEN
    RETURN public.cpc_rpc_error('INVALID_OWNER', '项目负责人无效');
  END IF;

  IF v_actor_role = 'sales'
     AND v_owner_profile_id <> v_actor_profile_id THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '销售只能创建自己负责的项目');
  END IF;

  IF v_next_action_title IS NOT NULL THEN
    IF COALESCE(p_waiting_on, 'none') <> 'none'
       OR p_next_check_at IS NOT NULL THEN
      RETURN public.cpc_rpc_error(
        'INVALID_NEXT_STEP',
        '下一步任务和等待状态不能同时存在'
      );
    END IF;
  ELSE
    IF p_waiting_on IS NULL
       OR p_waiting_on = 'none'
       OR p_waiting_on NOT IN (
         'customer',
         'internal',
         'supplier',
         'quality',
         'finance',
         'logistics',
         'other'
       )
       OR p_next_check_at IS NULL THEN
      RETURN public.cpc_rpc_error(
        'NEXT_STEP_REQUIRED',
        '活跃项目必须有下一步任务或明确等待/检查时间'
      );
    END IF;
  END IF;

  INSERT INTO public.cpc_projects (
    org_id,
    customer_reference_id,
    title,
    objective_summary,
    project_type,
    owner_profile_id,
    status,
    stage,
    waiting_on,
    next_check_at,
    priority,
    created_by_profile_id
  )
  VALUES (
    v_actor_org_id,
    p_customer_reference_id,
    btrim(p_title),
    btrim(p_objective_summary),
    p_project_type,
    v_owner_profile_id,
    'active',
    p_stage,
    CASE
      WHEN v_next_action_title IS NULL THEN p_waiting_on
      ELSE 'none'
    END,
    CASE
      WHEN v_next_action_title IS NULL THEN p_next_check_at
      ELSE NULL
    END,
    p_priority,
    v_actor_profile_id
  )
  RETURNING id INTO v_project_id;

  IF v_next_action_title IS NOT NULL THEN
    INSERT INTO public.cpc_work_items (
      org_id,
      customer_reference_id,
      project_id,
      work_item_type,
      title,
      assignee_profile_id,
      created_by_profile_id,
      due_at,
      status,
      priority
    )
    VALUES (
      v_actor_org_id,
      p_customer_reference_id,
      v_project_id,
      'NEXT_ACTION',
      v_next_action_title,
      v_owner_profile_id,
      v_actor_profile_id,
      p_initial_next_action_due_at,
      'pending',
      p_priority
    )
    RETURNING id INTO v_next_action_id;
  END IF;

  INSERT INTO public.cpc_audit_log (
    org_id,
    entity_type,
    entity_id,
    action,
    actor_profile_id,
    after_values,
    metadata,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'PROJECT',
    v_project_id,
    'PROJECT_CREATED',
    v_actor_profile_id,
    jsonb_build_object(
      'status', 'active',
      'stage', p_stage,
      'owner_profile_id', v_owner_profile_id,
      'waiting_on',
        CASE
          WHEN v_next_action_title IS NULL THEN p_waiting_on
          ELSE 'none'
        END,
      'next_check_at',
        CASE
          WHEN v_next_action_title IS NULL THEN p_next_check_at
          ELSE NULL
        END,
      'version', 1
    ),
    jsonb_build_object(
      'initial_next_action_id', v_next_action_id,
      'customer_reference_id', p_customer_reference_id
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'project_id', v_project_id,
      'version', 1,
      'next_action_id', v_next_action_id
    )
  );

EXCEPTION
  WHEN unique_violation THEN
    IF p_request_id IS NOT NULL THEN
      SELECT
        al.entity_id,
        NULLIF(al.metadata ->> 'initial_next_action_id', '')::UUID,
        COALESCE(NULLIF(al.after_values ->> 'version', '')::INTEGER, 1)
        INTO v_replay_project_id, v_replay_next_action_id, v_replay_version
        FROM public.cpc_audit_log al
        WHERE al.org_id = v_actor_org_id
          AND al.actor_profile_id = v_actor_profile_id
          AND al.action = 'PROJECT_CREATED'
          AND al.request_id = p_request_id
        LIMIT 1;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'ok', TRUE,
          'code', 'OK',
          'message', 'success',
          'data', jsonb_build_object(
            'project_id', v_replay_project_id,
            'version', v_replay_version,
            'next_action_id', v_replay_next_action_id
          )
        );
      END IF;
    END IF;

    RAISE;
END;
$$;


ALTER FUNCTION "public"."cpc_create_project"("p_customer_reference_id" "uuid", "p_title" "text", "p_objective_summary" "text", "p_project_type" "text", "p_stage" "text", "p_priority" "text", "p_owner_profile_id" "uuid", "p_initial_next_action_title" "text", "p_initial_next_action_due_at" timestamp with time zone, "p_waiting_on" "text", "p_next_check_at" timestamp with time zone, "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_create_provisional_customer_reference"("p_display_name_snapshot" "text", "p_provisional_source_reference" "text", "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_reference_id UUID := gen_random_uuid();
  v_source_label TEXT := btrim(coalesce(p_provisional_source_reference, ''));
  v_customer_name TEXT := btrim(coalesce(p_display_name_snapshot, ''));
  v_internal_reference TEXT := 'CPC-PROV-' || v_reference_id::text;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = TRUE
    LIMIT 1;

  IF NOT FOUND OR v_actor_role NOT IN ('admin','manager','sales') THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效客户项目权限');
  END IF;

  IF v_customer_name = '' OR v_source_label = ''
     OR char_length(v_customer_name) > 300
     OR char_length(v_source_label) > 300 THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', '客户名称和来源渠道均需填写，最多300字');
  END IF;

  INSERT INTO public.cpc_customer_references (
    id, org_id, reference_kind, provisional_source_reference,
    provisional_source_label, display_name_snapshot, status,
    created_by_profile_id
  ) VALUES (
    v_reference_id, v_actor_org_id, 'provisional',
    v_internal_reference, v_source_label, v_customer_name,
    'pending_review', v_actor_profile_id
  );

  INSERT INTO public.cpc_audit_log (
    org_id, entity_type, entity_id, action,
    actor_profile_id, after_values, request_id
  ) VALUES (
    v_actor_org_id, 'CUSTOMER_REFERENCE', v_reference_id,
    'CUSTOMER_REFERENCE_CREATED', v_actor_profile_id,
    jsonb_build_object(
      'reference_kind', 'provisional',
      'display_name_snapshot', v_customer_name,
      'provisional_source_reference', v_internal_reference,
      'source_channel', v_source_label,
      'status', 'pending_review'
    ), p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE, 'code', 'OK', 'message', 'success',
    'data', jsonb_build_object(
      'customer_reference_id', v_reference_id,
      'status', 'pending_review',
      'version', 1
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    -- A UUID/ref collision or unexpected integrity conflict, NOT a repeated channel.
    RETURN public.cpc_rpc_error('DUPLICATE_REFERENCE', '系统生成的客户编号冲突，请重试');
END;
$$;


ALTER FUNCTION "public"."cpc_create_provisional_customer_reference"("p_display_name_snapshot" "text", "p_provisional_source_reference" "text", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_create_report_correction"("p_report_id" "uuid", "p_expected_version" integer, "p_reason" "text", "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_report public.cpc_reports%ROWTYPE;
  v_metrics JSONB;
  v_event_seq BIGINT;
  v_audit_seq BIGINT;
  v_revision INTEGER;
  v_new_report_id UUID;
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
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效日报权限');
  END IF;

  PERFORM 1
    FROM public.profiles p
    WHERE p.id = v_actor_profile_id
      AND p.org_id = v_actor_org_id
    FOR UPDATE;

  SELECT r.*
    INTO v_report
    FROM public.cpc_reports r
    WHERE r.id = p_report_id
      AND r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.cpc_rpc_error('NOT_FOUND', '日报不存在');
  END IF;

  IF v_report.status <> 'submitted' THEN
    RETURN public.cpc_rpc_error(
      'INVALID_TRANSITION',
      '只有已提交日报可以创建更正版'
    );
  END IF;

  IF p_expected_version IS NULL
     OR p_expected_version <> v_report.version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', '日报版本已变化');
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RETURN public.cpc_rpc_error('REASON_REQUIRED', '创建更正版必须填写原因');
  END IF;

  IF v_report.period_type <> 'daily'
     OR v_report.period_start <> v_report.period_end THEN
    RETURN public.cpc_rpc_error(
      'INVALID_INPUT',
      'Phase 7A 仅支持日报更正'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cpc_reports r
    WHERE r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
      AND r.period_type = v_report.period_type
      AND r.period_start = v_report.period_start
      AND r.period_end = v_report.period_end
      AND r.revision_no > v_report.revision_no
  ) THEN
    RETURN public.cpc_rpc_error(
      'INVALID_TRANSITION',
      '只能从最新提交版本创建更正版'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cpc_reports r
    WHERE r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
      AND r.period_type = v_report.period_type
      AND r.period_start = v_report.period_start
      AND r.period_end = v_report.period_end
      AND r.status = 'draft'
  ) THEN
    RETURN public.cpc_rpc_error(
      'REPORT_DRAFT_EXISTS',
      '该周期已有更正草稿，请先处理现有草稿'
    );
  END IF;

  v_metrics := public.cpc_build_daily_report_metrics(
    v_actor_org_id,
    v_actor_profile_id,
    v_report.period_start
  );

  SELECT COALESCE(MAX(e.event_seq), 0)
    INTO v_event_seq
    FROM public.cpc_project_events e
    WHERE e.org_id = v_actor_org_id;

  SELECT COALESCE(MAX(a.audit_seq), 0)
    INTO v_audit_seq
    FROM public.cpc_audit_log a
    WHERE a.org_id = v_actor_org_id;

  SELECT COALESCE(MAX(r.revision_no), 0) + 1
    INTO v_revision
    FROM public.cpc_reports r
    WHERE r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
      AND r.period_type = v_report.period_type
      AND r.period_start = v_report.period_start
      AND r.period_end = v_report.period_end;

  INSERT INTO public.cpc_reports (
    org_id,
    subject_profile_id,
    period_type,
    period_start,
    period_end,
    revision_no,
    status,
    metrics_schema_version,
    deterministic_metrics,
    narrative,
    unknowns,
    source_event_seq,
    source_audit_seq,
    supersedes_report_id,
    created_by_profile_id
  )
  VALUES (
    v_actor_org_id,
    v_actor_profile_id,
    v_report.period_type,
    v_report.period_start,
    v_report.period_end,
    v_revision,
    'draft',
    1,
    v_metrics,
    v_report.narrative,
    v_report.unknowns,
    v_event_seq,
    v_audit_seq,
    v_report.id,
    v_actor_profile_id
  )
  RETURNING id, version INTO v_new_report_id, v_new_version;

  INSERT INTO public.cpc_audit_log (
    org_id,
    entity_type,
    entity_id,
    action,
    actor_profile_id,
    reason,
    after_values,
    metadata,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'REPORT',
    v_new_report_id,
    'REPORT_CORRECTION_CREATED',
    v_actor_profile_id,
    btrim(p_reason),
    jsonb_build_object(
      'status', 'draft',
      'revision_no', v_revision,
      'version', v_new_version,
      'supersedes_report_id', v_report.id
    ),
    jsonb_build_object(
      'period_type', v_report.period_type,
      'period_start', v_report.period_start,
      'source_event_seq', v_event_seq,
      'source_audit_seq', v_audit_seq
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'report_id', v_new_report_id,
      'status', 'draft',
      'revision_no', v_revision,
      'version', v_new_version,
      'supersedes_report_id', v_report.id
    )
  );
END;
$$;


ALTER FUNCTION "public"."cpc_create_report_correction"("p_report_id" "uuid", "p_expected_version" integer, "p_reason" "text", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_create_work_item"("p_customer_reference_id" "uuid", "p_project_id" "uuid", "p_work_item_type" "text", "p_title" "text", "p_description" "text" DEFAULT NULL::"text", "p_due_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_priority" "text" DEFAULT 'medium'::"text", "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."cpc_create_work_item"("p_customer_reference_id" "uuid", "p_project_id" "uuid", "p_work_item_type" "text", "p_title" "text", "p_description" "text", "p_due_at" timestamp with time zone, "p_priority" "text", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_customer_maintenance_owners"("p_customer_ids" "uuid"[]) RETURNS TABLE("customer_reference_id" "uuid", "owner_profile_id" "uuid", "owner_name" "text", "can_assess" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."cpc_customer_maintenance_owners"("p_customer_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_customer_self_rating_access"("p_customer_ids" "uuid"[]) RETURNS TABLE("customer_reference_id" "uuid", "can_rate" boolean, "last_rater_profile_id" "uuid", "last_rater_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT cr.id,
         public.cpc_can_self_rate_customer(cr.id,cr.org_id),
         rating.assessor_profile_id,
         COALESCE(actor.full_name,rating.assessor_profile_id::text)
  FROM public.cpc_customer_references cr
  LEFT JOIN public.cpc_customer_potential_assessments rating
    ON rating.org_id=cr.org_id
   AND rating.customer_reference_id=cr.id
  LEFT JOIN public.profiles actor
    ON actor.org_id=cr.org_id
   AND actor.id=rating.assessor_profile_id
  WHERE cr.org_id::text=public.auth_org_id()
    AND cr.id=ANY(p_customer_ids)
    AND cardinality(p_customer_ids) BETWEEN 1 AND 500
    AND public.cpc_can_read_customer_reference(cr.id,cr.org_id);
$$;


ALTER FUNCTION "public"."cpc_customer_self_rating_access"("p_customer_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_enforce_active_project_invariant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_project_id UUID;
  v_project_ids UUID[];
  v_status TEXT;
  v_waiting_on TEXT;
  v_next_check_at TIMESTAMPTZ;
BEGIN
  IF TG_TABLE_NAME = 'cpc_projects' THEN
    v_project_ids := ARRAY[
      CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END
    ];
  ELSE
    v_project_ids := ARRAY[]::UUID[];

    IF TG_OP <> 'INSERT' AND OLD.project_id IS NOT NULL THEN
      v_project_ids := array_append(v_project_ids, OLD.project_id);
    END IF;

    IF TG_OP <> 'DELETE'
       AND NEW.project_id IS NOT NULL
       AND NOT (NEW.project_id = ANY(v_project_ids)) THEN
      v_project_ids := array_append(v_project_ids, NEW.project_id);
    END IF;
  END IF;

  FOREACH v_project_id IN ARRAY v_project_ids LOOP
    SELECT p.status, p.waiting_on, p.next_check_at
      INTO v_status, v_waiting_on, v_next_check_at
      FROM public.cpc_projects p
      WHERE p.id = v_project_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_status = 'active'
       AND NOT (
         (
           v_waiting_on <> 'none'
           AND v_next_check_at IS NOT NULL
         )
         OR EXISTS (
           SELECT 1
           FROM public.cpc_work_items wi
           WHERE wi.project_id = v_project_id
             AND wi.work_item_type = 'NEXT_ACTION'
             AND wi.status IN ('pending', 'in_progress', 'blocked')
         )
       ) THEN
      RAISE EXCEPTION
        'active project % requires one open NEXT_ACTION or waiting/check state',
        v_project_id
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."cpc_enforce_active_project_invariant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_event_category"("p_event_type" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT CASE
    WHEN p_event_type IN (
      'CONTACT_LOGGED',
      'CUSTOMER_RESPONSE_RECEIVED'
    ) THEN 'CONTACT'
    WHEN p_event_type = 'EFFECTIVE_PROGRESS_RECORDED' THEN 'PROGRESS'
    WHEN p_event_type IN (
      'WAITING_STARTED',
      'WAITING_RESOLVED'
    ) THEN 'WAIT'
    WHEN p_event_type IN (
      'QUOTE_SENT',
      'SAMPLE_SENT',
      'CUSTOMER_CONFIRMED',
      'COMMERCIAL_CONFIRMED',
      'ORDER_CONFIRMED'
    ) THEN 'COMMERCIAL'
    WHEN p_event_type IN (
      'STAGE_CHANGED',
      'PROJECT_PAUSED',
      'PROJECT_REOPENED',
      'PROJECT_WON',
      'PROJECT_LOST',
      'PROJECT_CANCELLED'
    ) THEN 'LIFECYCLE'
    ELSE NULL
  END;
$$;


ALTER FUNCTION "public"."cpc_event_category"("p_event_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_event_payload_is_valid"("p_event_type" "text", "p_payload" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT
    COALESCE(jsonb_typeof(p_payload), 'null') = 'object'
    AND (
      p_event_type NOT IN (
        'QUOTE_SENT',
        'SAMPLE_SENT',
        'CUSTOMER_CONFIRMED',
        'COMMERCIAL_CONFIRMED',
        'ORDER_CONFIRMED'
      )
      OR (
        p_payload ? 'evidence_reference'
        AND jsonb_typeof(p_payload -> 'evidence_reference') = 'string'
        AND length(btrim(p_payload ->> 'evidence_reference')) > 0
      )
    );
$$;


ALTER FUNCTION "public"."cpc_event_payload_is_valid"("p_event_type" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_generate_daily_report_draft"("p_business_date" "date", "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_today DATE;
  v_existing public.cpc_reports%ROWTYPE;
  v_metrics JSONB;
  v_event_seq BIGINT;
  v_audit_seq BIGINT;
  v_revision INTEGER;
  v_report_id UUID;
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
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效日报权限');
  END IF;

  IF p_business_date IS NULL THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', '日报日期不能为空');
  END IF;

  PERFORM 1
    FROM public.profiles p
    WHERE p.id = v_actor_profile_id
      AND p.org_id = v_actor_org_id
    FOR UPDATE;

  v_today := (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE;

  IF p_business_date > v_today THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', '不能生成未来日期的日报');
  END IF;

  v_metrics := public.cpc_build_daily_report_metrics(
    v_actor_org_id,
    v_actor_profile_id,
    p_business_date
  );

  SELECT COALESCE(MAX(e.event_seq), 0)
    INTO v_event_seq
    FROM public.cpc_project_events e
    WHERE e.org_id = v_actor_org_id;

  SELECT COALESCE(MAX(a.audit_seq), 0)
    INTO v_audit_seq
    FROM public.cpc_audit_log a
    WHERE a.org_id = v_actor_org_id;

  SELECT r.*
    INTO v_existing
    FROM public.cpc_reports r
    WHERE r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
      AND r.period_type = 'daily'
      AND r.period_start = p_business_date
      AND r.period_end = p_business_date
      AND r.status = 'draft'
    FOR UPDATE;

  IF FOUND THEN
    UPDATE public.cpc_reports r
      SET deterministic_metrics = v_metrics,
          metrics_schema_version = 1,
          source_event_seq = v_event_seq,
          source_audit_seq = v_audit_seq,
          version = r.version + 1,
          updated_at = NOW()
      WHERE r.id = v_existing.id
        AND r.org_id = v_actor_org_id
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
      'REPORT',
      v_existing.id,
      'REPORT_DRAFT_REFRESHED',
      v_actor_profile_id,
      jsonb_build_object(
        'version', v_existing.version,
        'source_event_seq', v_existing.source_event_seq,
        'source_audit_seq', v_existing.source_audit_seq
      ),
      jsonb_build_object(
        'version', v_new_version,
        'source_event_seq', v_event_seq,
        'source_audit_seq', v_audit_seq
      ),
      jsonb_build_object(
        'period_type', 'daily',
        'period_start', p_business_date,
        'revision_no', v_existing.revision_no
      ),
      p_request_id
    );

    RETURN jsonb_build_object(
      'ok', TRUE,
      'code', 'OK',
      'message', 'success',
      'data', jsonb_build_object(
        'report_id', v_existing.id,
        'status', 'draft',
        'revision_no', v_existing.revision_no,
        'version', v_new_version
      )
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cpc_reports r
    WHERE r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
      AND r.period_type = 'daily'
      AND r.period_start = p_business_date
      AND r.period_end = p_business_date
      AND r.status = 'submitted'
  ) THEN
    RETURN public.cpc_rpc_error(
      'REPORT_ALREADY_SUBMITTED',
      '该日期日报已经提交；如需修改请创建更正版'
    );
  END IF;

  SELECT COALESCE(MAX(r.revision_no), 0) + 1
    INTO v_revision
    FROM public.cpc_reports r
    WHERE r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
      AND r.period_type = 'daily'
      AND r.period_start = p_business_date
      AND r.period_end = p_business_date;

  INSERT INTO public.cpc_reports (
    org_id,
    subject_profile_id,
    period_type,
    period_start,
    period_end,
    revision_no,
    status,
    metrics_schema_version,
    deterministic_metrics,
    narrative,
    unknowns,
    source_event_seq,
    source_audit_seq,
    created_by_profile_id
  )
  VALUES (
    v_actor_org_id,
    v_actor_profile_id,
    'daily',
    p_business_date,
    p_business_date,
    v_revision,
    'draft',
    1,
    v_metrics,
    NULL,
    '[]'::JSONB,
    v_event_seq,
    v_audit_seq,
    v_actor_profile_id
  )
  RETURNING id, version INTO v_report_id, v_new_version;

  INSERT INTO public.cpc_audit_log (
    org_id,
    entity_type,
    entity_id,
    action,
    actor_profile_id,
    after_values,
    metadata,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'REPORT',
    v_report_id,
    'REPORT_DRAFT_GENERATED',
    v_actor_profile_id,
    jsonb_build_object(
      'status', 'draft',
      'revision_no', v_revision,
      'version', v_new_version
    ),
    jsonb_build_object(
      'period_type', 'daily',
      'period_start', p_business_date,
      'source_event_seq', v_event_seq,
      'source_audit_seq', v_audit_seq
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'report_id', v_report_id,
      'status', 'draft',
      'revision_no', v_revision,
      'version', v_new_version
    )
  );
END;
$$;


ALTER FUNCTION "public"."cpc_generate_daily_report_draft"("p_business_date" "date", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_guard_submitted_report_immutability"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF OLD.status = 'submitted' THEN
    RAISE EXCEPTION 'submitted CPC report snapshots are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."cpc_guard_submitted_report_immutability"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_project_owner_names"("p_project_ids" "uuid"[]) RETURNS TABLE("project_id" "uuid", "owner_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT project.id AS project_id,
         NULLIF(btrim(owner.full_name), '')::TEXT AS owner_name
  FROM public.cpc_projects AS project
  JOIN public.profiles AS viewer
    ON viewer.org_id = project.org_id
   AND viewer.user_id = auth.uid()
   AND viewer.is_active = TRUE
   AND viewer.role IN ('admin','manager','sales')
  JOIN public.profiles AS owner
    ON owner.org_id = project.org_id
   AND owner.id = project.owner_profile_id
  WHERE cardinality(p_project_ids) BETWEEN 1 AND 500
    AND project.id = ANY(p_project_ids)
    AND public.cpc_can_read_project(project.id, project.org_id)
  ORDER BY project.id;
$$;


ALTER FUNCTION "public"."cpc_project_owner_names"("p_project_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cpc_project_owner_names"("p_project_ids" "uuid"[]) IS 'Read-only project-owner display names for up to 500 projects already visible to the authenticated CPC user; never returns employee private fields or other organizations projects.';



CREATE OR REPLACE FUNCTION "public"."cpc_project_transition_is_valid"("p_from_status" "text", "p_to_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT CASE p_from_status
    WHEN 'active' THEN p_to_status IN (
      'paused',
      'won',
      'lost',
      'cancelled'
    )
    WHEN 'paused' THEN p_to_status IN (
      'active',
      'lost',
      'cancelled'
    )
    WHEN 'lost' THEN p_to_status IN (
      'active',
      'cancelled'
    )
    ELSE FALSE
  END;
$$;


ALTER FUNCTION "public"."cpc_project_transition_is_valid"("p_from_status" "text", "p_to_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_record_customer_follow_up"("p_customer_reference_id" "uuid", "p_event_type" "text", "p_result_summary" "text", "p_occurred_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_current_follow_up_id" "uuid" DEFAULT NULL::"uuid", "p_next_follow_up_title" "text" DEFAULT NULL::"text", "p_next_follow_up_due_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_next_follow_up_priority" "text" DEFAULT 'medium'::"text", "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_customer public.cpc_customer_references%ROWTYPE;
  v_current_follow_up public.cpc_work_items%ROWTYPE;
  v_current_follow_up_found BOOLEAN := FALSE;
  v_event_id UUID;
  v_next_follow_up_id UUID;
  v_next_title TEXT := NULLIF(btrim(p_next_follow_up_title), '');
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
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效客户跟进权限');
  END IF;

  SELECT cr.*
    INTO v_customer
    FROM public.cpc_customer_references cr
    WHERE cr.id = p_customer_reference_id
      AND cr.org_id = v_actor_org_id
    FOR SHARE;

  IF NOT FOUND THEN
    RETURN public.cpc_rpc_error('NOT_FOUND', '客户引用不存在');
  END IF;

  IF NOT (
    (v_customer.reference_kind = 'canonical' AND v_customer.status = 'active')
    OR
    (
      v_customer.reference_kind = 'provisional'
      AND v_customer.status = 'pending_review'
    )
  ) THEN
    RETURN public.cpc_rpc_error(
      'INVALID_CUSTOMER_REFERENCE',
      '当前客户引用状态不能继续关系跟进'
    );
  END IF;

  IF NOT public.cpc_can_follow_customer(
    p_customer_reference_id,
    v_actor_org_id
  ) THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无权维护该客户的关系回访');
  END IF;

  IF p_event_type NOT IN (
    'CONTACT_LOGGED',
    'CUSTOMER_RESPONSE_RECEIVED'
  ) THEN
    RETURN public.cpc_rpc_error(
      'INVALID_EVENT_TYPE',
      '客户级回访只允许联系记录或客户反馈'
    );
  END IF;

  IF p_result_summary IS NULL OR btrim(p_result_summary) = '' THEN
    RETURN public.cpc_rpc_error(
      'INVALID_INPUT',
      '客户回访结果不能为空'
    );
  END IF;

  IF p_next_follow_up_priority IS NULL
     OR p_next_follow_up_priority NOT IN ('low', 'medium', 'high', 'critical') THEN
    RETURN public.cpc_rpc_error(
      'INVALID_PRIORITY',
      '下一次回访优先级不合法'
    );
  END IF;

  IF v_next_title IS NULL AND p_next_follow_up_due_at IS NOT NULL THEN
    RETURN public.cpc_rpc_error(
      'INVALID_NEXT_STEP',
      '未设置下一次回访动作时不能单独设置到期时间'
    );
  END IF;

  IF v_next_title IS NOT NULL AND p_next_follow_up_due_at IS NULL THEN
    RETURN public.cpc_rpc_error(
      'NEXT_CHECK_REQUIRED',
      '设置下一次客户回访时必须指定时间'
    );
  END IF;

  IF p_current_follow_up_id IS NOT NULL THEN
    SELECT wi.*
      INTO v_current_follow_up
      FROM public.cpc_work_items wi
      WHERE wi.id = p_current_follow_up_id
        AND wi.org_id = v_actor_org_id
        AND wi.customer_reference_id = p_customer_reference_id
        AND wi.project_id IS NULL
        AND wi.work_item_type = 'FOLLOW_UP'
        AND wi.status IN ('pending', 'in_progress', 'blocked')
      FOR UPDATE;

    v_current_follow_up_found := FOUND;

    IF NOT v_current_follow_up_found THEN
      RETURN public.cpc_rpc_error(
        'NOT_FOUND',
        '当前客户回访任务不存在或已结束'
      );
    END IF;

    IF NOT (
      v_actor_role IN ('admin', 'manager')
      OR v_current_follow_up.assignee_profile_id = v_actor_profile_id
    ) THEN
      RETURN public.cpc_rpc_error(
        'FORBIDDEN',
        '只有当前回访执行人或管理角色可结束该任务'
      );
    END IF;

    UPDATE public.cpc_work_items wi
      SET status = 'completed',
          blocked_reason = NULL,
          completed_at = NOW(),
          completed_by_profile_id = v_actor_profile_id,
          version = wi.version + 1,
          updated_at = NOW()
      WHERE wi.id = v_current_follow_up.id
        AND wi.org_id = v_actor_org_id;
  END IF;

  INSERT INTO public.cpc_project_events (
    org_id,
    customer_reference_id,
    project_id,
    event_type,
    event_category,
    occurred_at,
    actor_profile_id,
    source,
    raw_input,
    payload_schema_version,
    payload,
    request_id
  )
  VALUES (
    v_actor_org_id,
    p_customer_reference_id,
    NULL,
    p_event_type,
    'CONTACT',
    COALESCE(p_occurred_at, NOW()),
    v_actor_profile_id,
    'user',
    btrim(p_result_summary),
    1,
    jsonb_build_object(
      'relationship_follow_up', TRUE
    ),
    p_request_id
  )
  RETURNING id INTO v_event_id;

  IF v_next_title IS NOT NULL THEN
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
        '当前客户已有未完成的回访任务，请先处理或明确替换'
      );
    END IF;

    INSERT INTO public.cpc_work_items (
      org_id,
      customer_reference_id,
      project_id,
      work_item_type,
      title,
      assignee_profile_id,
      created_by_profile_id,
      due_at,
      status,
      priority
    )
    VALUES (
      v_actor_org_id,
      p_customer_reference_id,
      NULL,
      'FOLLOW_UP',
      v_next_title,
      v_actor_profile_id,
      v_actor_profile_id,
      p_next_follow_up_due_at,
      'pending',
      p_next_follow_up_priority
    )
    RETURNING id INTO v_next_follow_up_id;
  END IF;

  INSERT INTO public.cpc_audit_log (
    org_id,
    entity_type,
    entity_id,
    action,
    actor_profile_id,
    after_values,
    metadata,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'CUSTOMER_REFERENCE',
    p_customer_reference_id,
    'CUSTOMER_FOLLOW_UP_RECORDED',
    v_actor_profile_id,
    jsonb_build_object(
      'event_type', p_event_type,
      'occurred_at', COALESCE(p_occurred_at, NOW()),
      'next_follow_up_due_at', p_next_follow_up_due_at
    ),
    jsonb_build_object(
      'event_id', v_event_id,
      'completed_follow_up_id',
        CASE
          WHEN v_current_follow_up_found THEN v_current_follow_up.id
          ELSE NULL
        END,
      'next_follow_up_id', v_next_follow_up_id
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'customer_reference_id', p_customer_reference_id,
      'event_id', v_event_id,
      'completed_follow_up_id',
        CASE
          WHEN v_current_follow_up_found THEN v_current_follow_up.id
          ELSE NULL
        END,
      'next_follow_up_id', v_next_follow_up_id
    )
  );
END;
$$;


ALTER FUNCTION "public"."cpc_record_customer_follow_up"("p_customer_reference_id" "uuid", "p_event_type" "text", "p_result_summary" "text", "p_occurred_at" timestamp with time zone, "p_current_follow_up_id" "uuid", "p_next_follow_up_title" "text", "p_next_follow_up_due_at" timestamp with time zone, "p_next_follow_up_priority" "text", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_record_progress"("p_project_id" "uuid", "p_expected_version" integer, "p_event_type" "text", "p_raw_input" "text", "p_payload" "jsonb", "p_occurred_at" timestamp with time zone DEFAULT "now"(), "p_new_stage" "text" DEFAULT NULL::"text", "p_next_action_title" "text" DEFAULT NULL::"text", "p_next_action_due_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_waiting_on" "text" DEFAULT NULL::"text", "p_next_check_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_project public.cpc_projects%ROWTYPE;
  v_old_next public.cpc_work_items%ROWTYPE;
  v_old_next_found BOOLEAN := FALSE;
  v_event_id UUID;
  v_stage_event_id UUID;
  v_wait_event_id UUID;
  v_new_next_action_id UUID;
  v_next_action_title TEXT := NULLIF(btrim(p_next_action_title), '');
  v_target_stage TEXT;
  v_target_waiting_on TEXT;
  v_target_next_check_at TIMESTAMPTZ;
  v_replace_next BOOLEAN := FALSE;
  v_new_version INTEGER;
  v_event_category TEXT;
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
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效项目权限');
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

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR v_project.owner_profile_id = v_actor_profile_id
  ) THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '只有项目负责人或管理角色可推进项目');
  END IF;

  IF p_expected_version IS NULL
     OR p_expected_version <> v_project.version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', '项目版本已变化');
  END IF;

  IF v_project.status <> 'active' THEN
    RETURN public.cpc_rpc_error(
      'INVALID_PROJECT_STATE',
      '只有活跃项目可记录推进'
    );
  END IF;

  IF p_event_type NOT IN (
    'CONTACT_LOGGED',
    'EFFECTIVE_PROGRESS_RECORDED',
    'CUSTOMER_RESPONSE_RECEIVED',
    'QUOTE_SENT',
    'SAMPLE_SENT',
    'CUSTOMER_CONFIRMED',
    'COMMERCIAL_CONFIRMED',
    'ORDER_CONFIRMED'
  ) THEN
    RETURN public.cpc_rpc_error('INVALID_EVENT_TYPE', '当前事件类型不属于推进记录');
  END IF;

  v_event_category := public.cpc_event_category(p_event_type);

  IF v_event_category IS NULL
     OR NOT public.cpc_event_payload_is_valid(
       p_event_type,
       COALESCE(p_payload, '{}'::JSONB)
     ) THEN
    RETURN public.cpc_rpc_error(
      'INVALID_EVENT_PAYLOAD',
      '事件证据或载荷不完整'
    );
  END IF;

  v_target_stage := COALESCE(p_new_stage, v_project.stage);

  IF NOT public.cpc_stage_is_valid(v_project.project_type, v_target_stage) THEN
    RETURN public.cpc_rpc_error('INVALID_STAGE', '目标阶段不适用于当前项目类型');
  END IF;

  SELECT wi.*
    INTO v_old_next
    FROM public.cpc_work_items wi
    WHERE wi.project_id = v_project.id
      AND wi.work_item_type = 'NEXT_ACTION'
      AND wi.status IN ('pending', 'in_progress', 'blocked')
    FOR UPDATE;

  v_old_next_found := FOUND;

  v_target_waiting_on := v_project.waiting_on;
  v_target_next_check_at := v_project.next_check_at;

  IF v_next_action_title IS NOT NULL THEN
    IF p_waiting_on IS NOT NULL AND p_waiting_on <> 'none' THEN
      RETURN public.cpc_rpc_error(
        'INVALID_NEXT_STEP',
        '下一步任务和等待状态不能同时存在'
      );
    END IF;

    IF p_next_check_at IS NOT NULL THEN
      RETURN public.cpc_rpc_error(
        'INVALID_NEXT_STEP',
        '创建下一步任务时不能同时设置等待检查时间'
      );
    END IF;

    v_target_waiting_on := 'none';
    v_target_next_check_at := NULL;
    v_replace_next := TRUE;
  ELSIF p_waiting_on IS NOT NULL THEN
    IF p_waiting_on NOT IN (
      'none',
      'customer',
      'internal',
      'supplier',
      'quality',
      'finance',
      'logistics',
      'other'
    ) THEN
      RETURN public.cpc_rpc_error('INVALID_WAITING_STATE', '等待对象不合法');
    END IF;

    IF p_waiting_on <> 'none' AND p_next_check_at IS NULL THEN
      RETURN public.cpc_rpc_error(
        'INVALID_WAITING_STATE',
        '等待状态必须设置检查时间'
      );
    END IF;

    v_target_waiting_on := p_waiting_on;
    v_target_next_check_at := CASE
      WHEN p_waiting_on = 'none' THEN NULL
      ELSE p_next_check_at
    END;

    IF p_waiting_on <> 'none' THEN
      v_replace_next := TRUE;
    ELSIF NOT v_old_next_found THEN
      RETURN public.cpc_rpc_error(
        'NEXT_STEP_REQUIRED',
        '清除等待状态前必须已有下一步任务'
      );
    END IF;
  END IF;

  IF v_replace_next AND v_old_next_found THEN
    UPDATE public.cpc_work_items wi
      SET status = 'completed',
          blocked_reason = NULL,
          completed_at = NOW(),
          completed_by_profile_id = v_actor_profile_id,
          version = wi.version + 1,
          updated_at = NOW()
      WHERE wi.id = v_old_next.id
        AND wi.org_id = v_actor_org_id;
  END IF;

  IF v_next_action_title IS NOT NULL THEN
    INSERT INTO public.cpc_work_items (
      org_id,
      customer_reference_id,
      project_id,
      work_item_type,
      title,
      assignee_profile_id,
      created_by_profile_id,
      due_at,
      status,
      priority
    )
    VALUES (
      v_actor_org_id,
      v_project.customer_reference_id,
      v_project.id,
      'NEXT_ACTION',
      v_next_action_title,
      v_project.owner_profile_id,
      v_actor_profile_id,
      p_next_action_due_at,
      'pending',
      v_project.priority
    )
    RETURNING id INTO v_new_next_action_id;
  END IF;

  IF v_project.waiting_on <> 'none'
     AND v_target_waiting_on = 'none' THEN
    INSERT INTO public.cpc_project_events (
      org_id,
      customer_reference_id,
      project_id,
      event_type,
      event_category,
      occurred_at,
      actor_profile_id,
      source,
      payload_schema_version,
      payload,
      request_id
    )
    VALUES (
      v_actor_org_id,
      v_project.customer_reference_id,
      v_project.id,
      'WAITING_RESOLVED',
      'WAIT',
      COALESCE(p_occurred_at, NOW()),
      v_actor_profile_id,
      'user',
      1,
      jsonb_build_object(
        'from_waiting_on', v_project.waiting_on
      ),
      p_request_id
    )
    RETURNING id INTO v_wait_event_id;
  END IF;

  IF v_target_waiting_on <> 'none'
     AND (
       v_project.waiting_on IS DISTINCT FROM v_target_waiting_on
       OR v_project.next_check_at IS DISTINCT FROM v_target_next_check_at
     ) THEN
    IF p_raw_input IS NULL OR btrim(p_raw_input) = '' THEN
      RETURN public.cpc_rpc_error(
        'INVALID_WAITING_STATE',
        '进入或更新等待状态时必须说明实际原因'
      );
    END IF;

    INSERT INTO public.cpc_project_events (
      org_id,
      customer_reference_id,
      project_id,
      event_type,
      event_category,
      occurred_at,
      actor_profile_id,
      source,
      payload_schema_version,
      payload,
      request_id
    )
    VALUES (
      v_actor_org_id,
      v_project.customer_reference_id,
      v_project.id,
      'WAITING_STARTED',
      'WAIT',
      COALESCE(p_occurred_at, NOW()),
      v_actor_profile_id,
      'user',
      1,
      jsonb_build_object(
        'from_waiting_on', v_project.waiting_on,
        'to_waiting_on', v_target_waiting_on,
        'next_check_at', v_target_next_check_at,
        'reason', btrim(p_raw_input)
      ),
      p_request_id
    )
    RETURNING id INTO v_wait_event_id;
  END IF;

  INSERT INTO public.cpc_project_events (
    org_id,
    customer_reference_id,
    project_id,
    event_type,
    event_category,
    occurred_at,
    actor_profile_id,
    source,
    raw_input,
    payload_schema_version,
    payload,
    request_id
  )
  VALUES (
    v_actor_org_id,
    v_project.customer_reference_id,
    v_project.id,
    p_event_type,
    v_event_category,
    COALESCE(p_occurred_at, NOW()),
    v_actor_profile_id,
    'user',
    NULLIF(btrim(p_raw_input), ''),
    1,
    COALESCE(p_payload, '{}'::JSONB),
    p_request_id
  )
  RETURNING id INTO v_event_id;

  IF v_target_stage <> v_project.stage THEN
    INSERT INTO public.cpc_project_events (
      org_id,
      customer_reference_id,
      project_id,
      event_type,
      event_category,
      occurred_at,
      actor_profile_id,
      source,
      payload_schema_version,
      payload,
      request_id
    )
    VALUES (
      v_actor_org_id,
      v_project.customer_reference_id,
      v_project.id,
      'STAGE_CHANGED',
      'LIFECYCLE',
      COALESCE(p_occurred_at, NOW()),
      v_actor_profile_id,
      'user',
      1,
      jsonb_build_object(
        'from_stage', v_project.stage,
        'to_stage', v_target_stage
      ),
      p_request_id
    )
    RETURNING id INTO v_stage_event_id;
  END IF;

  UPDATE public.cpc_projects p
    SET stage = v_target_stage,
        waiting_on = v_target_waiting_on,
        next_check_at = v_target_next_check_at,
        version = p.version + 1,
        updated_at = NOW()
    WHERE p.id = v_project.id
      AND p.org_id = v_actor_org_id
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
    'PROJECT',
    v_project.id,
    'PROJECT_PROGRESS_RECORDED',
    v_actor_profile_id,
    jsonb_build_object(
      'stage', v_project.stage,
      'waiting_on', v_project.waiting_on,
      'next_check_at', v_project.next_check_at,
      'version', v_project.version
    ),
    jsonb_build_object(
      'stage', v_target_stage,
      'waiting_on', v_target_waiting_on,
      'next_check_at', v_target_next_check_at,
      'version', v_new_version
    ),
    jsonb_build_object(
      'event_id', v_event_id,
      'stage_event_id', v_stage_event_id,
      'waiting_event_id', v_wait_event_id,
      'completed_next_action_id',
        CASE WHEN v_replace_next AND v_old_next_found THEN v_old_next.id ELSE NULL END,
      'new_next_action_id', v_new_next_action_id
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'project_id', v_project.id,
      'version', v_new_version,
      'event_id', v_event_id,
      'next_action_id', v_new_next_action_id,
      'waiting_on', v_target_waiting_on,
      'next_check_at', v_target_next_check_at
    )
  );
END;
$$;


ALTER FUNCTION "public"."cpc_record_progress"("p_project_id" "uuid", "p_expected_version" integer, "p_event_type" "text", "p_raw_input" "text", "p_payload" "jsonb", "p_occurred_at" timestamp with time zone, "p_new_stage" "text", "p_next_action_title" "text", "p_next_action_due_at" timestamp with time zone, "p_waiting_on" "text", "p_next_check_at" timestamp with time zone, "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_reject_ai_draft"("p_ai_draft_id" "uuid", "p_expected_version" integer, "p_reason" "text" DEFAULT NULL::"text", "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."cpc_reject_ai_draft"("p_ai_draft_id" "uuid", "p_expected_version" integer, "p_reason" "text", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_reject_append_only_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;


ALTER FUNCTION "public"."cpc_reject_append_only_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_reschedule_work_item"("p_work_item_id" "uuid", "p_expected_version" integer, "p_to_due_at" timestamp with time zone, "p_reason" "text", "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_item public.cpc_work_items%ROWTYPE;
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
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效任务权限');
  END IF;

  SELECT wi.*
    INTO v_item
    FROM public.cpc_work_items wi
    WHERE wi.id = p_work_item_id
      AND wi.org_id = v_actor_org_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.cpc_rpc_error('NOT_FOUND', '任务不存在');
  END IF;

  IF v_item.status NOT IN ('pending', 'in_progress', 'blocked') THEN
    RETURN public.cpc_rpc_error('INVALID_TRANSITION', '已结束任务不能改期');
  END IF;

  v_authorized :=
    v_actor_role IN ('admin', 'manager')
    OR v_item.assignee_profile_id = v_actor_profile_id;

  IF NOT v_authorized AND v_item.project_id IS NOT NULL THEN
    SELECT p.*
      INTO v_project
      FROM public.cpc_projects p
      WHERE p.id = v_item.project_id
        AND p.org_id = v_actor_org_id;

    IF FOUND THEN
      v_authorized :=
        v_project.owner_profile_id = v_actor_profile_id
        OR EXISTS (
          SELECT 1
          FROM public.cpc_project_members pm
          WHERE pm.project_id = v_project.id
            AND pm.org_id = v_actor_org_id
            AND pm.profile_id = v_actor_profile_id
            AND pm.removed_at IS NULL
        );
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无权调整该任务时间');
  END IF;

  IF p_expected_version IS NULL
     OR p_expected_version <> v_item.version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', '任务版本已变化');
  END IF;

  IF p_to_due_at IS NULL THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', '改期后时间不能为空');
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RETURN public.cpc_rpc_error('REASON_REQUIRED', '任务改期必须填写原因');
  END IF;

  IF v_item.due_at IS NOT DISTINCT FROM p_to_due_at THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', '新时间必须与当前时间不同');
  END IF;

  UPDATE public.cpc_work_items wi
    SET due_at = p_to_due_at,
        version = wi.version + 1,
        updated_at = NOW()
    WHERE wi.id = v_item.id
      AND wi.org_id = v_actor_org_id
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
    metadata,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'WORK_ITEM',
    v_item.id,
    'WORK_ITEM_RESCHEDULED',
    v_actor_profile_id,
    btrim(p_reason),
    jsonb_build_object(
      'due_at', v_item.due_at,
      'version', v_item.version
    ),
    jsonb_build_object(
      'due_at', p_to_due_at,
      'version', v_new_version
    ),
    jsonb_build_object(
      'work_item_type', v_item.work_item_type,
      'status', v_item.status,
      'blocked_status_preserved', v_item.status = 'blocked'
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'work_item_id', v_item.id,
      'due_at', p_to_due_at,
      'version', v_new_version
    )
  );
END;
$$;


ALTER FUNCTION "public"."cpc_reschedule_work_item"("p_work_item_id" "uuid", "p_expected_version" integer, "p_to_due_at" timestamp with time zone, "p_reason" "text", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_review_customer_potential_rating"("p_customer_reference_id" "uuid", "p_expected_version" integer, "p_decision" "text", "p_review_note" "text" DEFAULT NULL::"text", "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."cpc_review_customer_potential_rating"("p_customer_reference_id" "uuid", "p_expected_version" integer, "p_decision" "text", "p_review_note" "text", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_rpc_error"("p_code" "text", "p_message" "text", "p_data" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT jsonb_build_object(
    'ok', false,
    'code', p_code,
    'message', p_message,
    'data', p_data
  );
$$;


ALTER FUNCTION "public"."cpc_rpc_error"("p_code" "text", "p_message" "text", "p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_save_customer_development_plan"("p_customer_reference_id" "uuid", "p_opportunity_summary" "text", "p_estimated_annual_opportunity_cny_yuan" bigint, "p_next_action" "text", "p_next_check_on" "date", "p_expected_version" integer, "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."cpc_save_customer_development_plan"("p_customer_reference_id" "uuid", "p_opportunity_summary" "text", "p_estimated_annual_opportunity_cny_yuan" bigint, "p_next_action" "text", "p_next_check_on" "date", "p_expected_version" integer, "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_save_customer_note"("p_customer_reference_id" "uuid", "p_note" "text", "p_expected_version" integer, "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."cpc_save_customer_note"("p_customer_reference_id" "uuid", "p_note" "text", "p_expected_version" integer, "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_save_customer_potential_rating"("p_customer_reference_id" "uuid", "p_scores" "jsonb", "p_evidence_summary" "text", "p_opportunity_summary" "text", "p_estimated_annual_opportunity_cny_yuan" bigint, "p_next_action" "text", "p_next_check_on" "date", "p_submit" boolean, "p_expected_version" integer DEFAULT NULL::integer, "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  v_actor_id UUID := public.auth_profile_id();
  v_org_id UUID;
  v_field TEXT;
  v_score INTEGER;
  v_grade TEXT;
  v_status TEXT;
  v_row public.cpc_customer_potential_assessments%ROWTYPE;
  v_before JSONB;
BEGIN
  SELECT org_id INTO v_org_id
  FROM public.profiles
  WHERE id=v_actor_id AND user_id=auth.uid() AND is_active=TRUE
    AND role IN ('admin','manager','sales')
  LIMIT 1;

  IF v_org_id IS NULL OR NOT public.cpc_can_self_rate_customer(
      p_customer_reference_id,v_org_id
  ) THEN
    RETURN public.cpc_rpc_error('FORBIDDEN','仅该客户负责人或项目负责人可以设定潜力评级');
  END IF;
  IF p_submit IS NULL OR jsonb_typeof(p_scores) IS DISTINCT FROM 'object' THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT','必须提交五项评分和明确保存方式');
  END IF;
  FOREACH v_field IN ARRAY ARRAY[
    'purchase_scope','process_fit','project_evidence','decision_access','repeat_value'
  ] LOOP
    IF COALESCE(p_scores->>v_field,'') !~ '^[0-5]$' THEN
      RETURN public.cpc_rpc_error('INVALID_INPUT','五项评分均需为0到5分');
    END IF;
  END LOOP;
  IF (SELECT COUNT(*) FROM jsonb_object_keys(p_scores)) <> 5
     OR char_length(coalesce(p_evidence_summary,'')) > 3000 THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT','评分或事实依据内容超出范围');
  END IF;
  IF p_submit AND char_length(btrim(coalesce(p_evidence_summary,''))) < 20 THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT','评级生效需要至少20字客户事实依据');
  END IF;

  v_score := (p_scores->>'purchase_scope')::int*6
           + (p_scores->>'process_fit')::int*5
           + (p_scores->>'project_evidence')::int*4
           + (p_scores->>'decision_access')::int*3
           + (p_scores->>'repeat_value')::int*2;

  v_grade := CASE
    WHEN v_score>=90 THEN 'SS'
    WHEN v_score>=80 THEN 'S'
    WHEN v_score>=70 THEN 'A'
    WHEN v_score>=55 THEN 'B'
    WHEN v_score>=35 THEN 'C'
    ELSE 'D'
  END;
  v_status := CASE WHEN p_submit THEN 'approved' ELSE 'draft' END;

  SELECT * INTO v_row
  FROM public.cpc_customer_potential_assessments
  WHERE org_id=v_org_id AND customer_reference_id=p_customer_reference_id
  FOR UPDATE;

  IF FOUND THEN
    IF p_expected_version IS NULL OR v_row.version<>p_expected_version THEN
      RETURN public.cpc_rpc_error('VERSION_CONFLICT','潜力评级已由其他负责人更新，请刷新后重试');
    END IF;
    v_before := to_jsonb(v_row);
    UPDATE public.cpc_customer_potential_assessments SET
      assessor_profile_id=v_actor_id,
      scores=p_scores,
      assessment_score=v_score,
      evidence_summary=btrim(coalesce(p_evidence_summary,'')),
      status=v_status,
      published_grade=CASE WHEN p_submit THEN v_grade ELSE published_grade END,
      published_score=CASE WHEN p_submit THEN v_score ELSE published_score END,
      published_at=CASE WHEN p_submit THEN now() ELSE published_at END,
      reviewer_profile_id=NULL,
      review_note=NULL,
      reviewed_at=NULL,
      version=v_row.version+1
    WHERE id=v_row.id
    RETURNING * INTO v_row;
  ELSE
    IF p_expected_version IS NOT NULL THEN
      RETURN public.cpc_rpc_error('VERSION_CONFLICT','尚无评级记录，请刷新后重试');
    END IF;
    v_before := NULL;
    INSERT INTO public.cpc_customer_potential_assessments(
      org_id,customer_reference_id,assessor_profile_id,scores,
      assessment_score,evidence_summary,status,
      published_grade,published_score,published_at
    ) VALUES (
      v_org_id,p_customer_reference_id,v_actor_id,p_scores,v_score,
      btrim(coalesce(p_evidence_summary,'')),v_status,
      CASE WHEN p_submit THEN v_grade END,
      CASE WHEN p_submit THEN v_score END,
      CASE WHEN p_submit THEN now() END
    )
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.cpc_audit_log(
    org_id,entity_type,entity_id,action,actor_profile_id,reason,
    before_values,after_values,metadata,request_id
  ) VALUES (
    v_org_id,'CUSTOMER_POTENTIAL_RATING',v_row.id,
    CASE WHEN p_submit THEN 'POTENTIAL_RATING_OWNER_PUBLISHED'
         ELSE 'POTENTIAL_RATING_DRAFT_SAVED' END,
    v_actor_id,NULL,v_before,to_jsonb(v_row),
    jsonb_build_object(
      'customer_reference_id',p_customer_reference_id,
      'rating_type','potential',
      'saved_by_profile_id',v_actor_id,
      'approval_required',FALSE,
      'actual_rating_or_receipts_changed',FALSE,
      'sales_plan_changed',FALSE
    ),
    p_request_id
  );
  RETURN jsonb_build_object('ok',TRUE,'code','OK','data',
    jsonb_build_object(
      'id',v_row.id,
      'version',v_row.version,
      'status',v_row.status,
      'published_grade',v_row.published_grade,
      'published_score',v_row.published_score,
      'published_at',v_row.published_at,
      'assessor_profile_id',v_row.assessor_profile_id
    )
  );
END;
$_$;


ALTER FUNCTION "public"."cpc_save_customer_potential_rating"("p_customer_reference_id" "uuid", "p_scores" "jsonb", "p_evidence_summary" "text", "p_opportunity_summary" "text", "p_estimated_annual_opportunity_cny_yuan" bigint, "p_next_action" "text", "p_next_check_on" "date", "p_submit" boolean, "p_expected_version" integer, "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_set_waiting_state"("p_project_id" "uuid", "p_expected_version" integer, "p_waiting_on" "text", "p_next_check_at" timestamp with time zone, "p_reason" "text", "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_project public.cpc_projects%ROWTYPE;
  v_old_next public.cpc_work_items%ROWTYPE;
  v_old_next_found BOOLEAN := FALSE;
  v_event_id UUID;
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
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效项目权限');
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

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR v_project.owner_profile_id = v_actor_profile_id
  ) THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '只有项目负责人或管理角色可设置等待');
  END IF;

  IF p_expected_version IS NULL
     OR p_expected_version <> v_project.version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', '项目版本已变化');
  END IF;

  IF v_project.status <> 'active' THEN
    RETURN public.cpc_rpc_error(
      'INVALID_PROJECT_STATE',
      '只有活跃项目可进入等待状态'
    );
  END IF;

  IF p_waiting_on NOT IN (
    'customer',
    'internal',
    'supplier',
    'quality',
    'finance',
    'logistics',
    'other'
  )
  OR p_next_check_at IS NULL
  OR p_reason IS NULL
  OR btrim(p_reason) = '' THEN
    RETURN public.cpc_rpc_error(
      'INVALID_WAITING_STATE',
      '等待对象、检查时间和原因必须完整'
    );
  END IF;

  SELECT wi.*
    INTO v_old_next
    FROM public.cpc_work_items wi
    WHERE wi.project_id = v_project.id
      AND wi.work_item_type = 'NEXT_ACTION'
      AND wi.status IN ('pending', 'in_progress', 'blocked')
    FOR UPDATE;

  v_old_next_found := FOUND;

  IF v_old_next_found THEN
    UPDATE public.cpc_work_items wi
      SET status = 'completed',
          blocked_reason = NULL,
          completed_at = NOW(),
          completed_by_profile_id = v_actor_profile_id,
          version = wi.version + 1,
          updated_at = NOW()
      WHERE wi.id = v_old_next.id
        AND wi.org_id = v_actor_org_id;
  END IF;

  INSERT INTO public.cpc_project_events (
    org_id,
    customer_reference_id,
    project_id,
    event_type,
    event_category,
    occurred_at,
    actor_profile_id,
    source,
    payload_schema_version,
    payload,
    request_id
  )
  VALUES (
    v_actor_org_id,
    v_project.customer_reference_id,
    v_project.id,
    'WAITING_STARTED',
    'WAIT',
    NOW(),
    v_actor_profile_id,
    'user',
    1,
    jsonb_build_object(
      'from_waiting_on', v_project.waiting_on,
      'to_waiting_on', p_waiting_on,
      'next_check_at', p_next_check_at,
      'reason', btrim(p_reason)
    ),
    p_request_id
  )
  RETURNING id INTO v_event_id;

  UPDATE public.cpc_projects p
    SET waiting_on = p_waiting_on,
        next_check_at = p_next_check_at,
        version = p.version + 1,
        updated_at = NOW()
    WHERE p.id = v_project.id
      AND p.org_id = v_actor_org_id
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
    metadata,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'PROJECT',
    v_project.id,
    'PROJECT_WAITING_SET',
    v_actor_profile_id,
    btrim(p_reason),
    jsonb_build_object(
      'waiting_on', v_project.waiting_on,
      'next_check_at', v_project.next_check_at,
      'version', v_project.version
    ),
    jsonb_build_object(
      'waiting_on', p_waiting_on,
      'next_check_at', p_next_check_at,
      'version', v_new_version
    ),
    jsonb_build_object(
      'event_id', v_event_id,
      'completed_next_action_id',
        CASE WHEN v_old_next_found THEN v_old_next.id ELSE NULL END
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'project_id', v_project.id,
      'version', v_new_version,
      'waiting_on', p_waiting_on,
      'next_check_at', p_next_check_at,
      'event_id', v_event_id
    )
  );
END;
$$;


ALTER FUNCTION "public"."cpc_set_waiting_state"("p_project_id" "uuid", "p_expected_version" integer, "p_waiting_on" "text", "p_next_check_at" timestamp with time zone, "p_reason" "text", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_stage_is_valid"("p_project_type" "text", "p_stage" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT CASE p_project_type
    WHEN 'transfer_film' THEN p_stage IN (
      'requirement_alignment',
      'artwork_material_alignment',
      'quotation',
      'sampling_or_plate',
      'customer_confirmation',
      'order_confirmed',
      'production',
      'delivery'
    )
    WHEN 'transfer_processing' THEN p_stage IN (
      'requirement_alignment',
      'material_fixture_process_alignment',
      'quotation',
      'trial_sample',
      'customer_confirmation',
      'order_confirmed',
      'production',
      'delivery'
    )
    WHEN 'equipment' THEN p_stage IN (
      'application_assessment',
      'solution_definition',
      'validation_or_demo',
      'quotation_negotiation',
      'commercial_confirmation',
      'production',
      'delivery_installation',
      'acceptance_training'
    )
    WHEN 'uv' THEN p_stage IN (
      'application_assessment',
      'sample_validation',
      'quotation',
      'customer_confirmation',
      'order_confirmed',
      'production',
      'delivery'
    )
    WHEN 'other' THEN p_stage IN (
      'qualification',
      'solution',
      'quotation',
      'validation',
      'customer_confirmation',
      'fulfillment',
      'delivery'
    )
    ELSE FALSE
  END;
$$;


ALTER FUNCTION "public"."cpc_stage_is_valid"("p_project_type" "text", "p_stage" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_submit_report"("p_report_id" "uuid", "p_expected_version" integer, "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_report public.cpc_reports%ROWTYPE;
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
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效日报权限');
  END IF;

  SELECT r.*
    INTO v_report
    FROM public.cpc_reports r
    WHERE r.id = p_report_id
      AND r.org_id = v_actor_org_id
      AND r.subject_profile_id = v_actor_profile_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.cpc_rpc_error('NOT_FOUND', '日报不存在');
  END IF;

  IF v_report.status <> 'draft' THEN
    RETURN public.cpc_rpc_error('INVALID_TRANSITION', '只有草稿日报可以提交');
  END IF;

  IF p_expected_version IS NULL
     OR p_expected_version <> v_report.version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', '日报版本已变化');
  END IF;

  UPDATE public.cpc_reports r
    SET status = 'submitted',
        submitted_by_profile_id = v_actor_profile_id,
        submitted_at = NOW(),
        version = r.version + 1,
        updated_at = NOW()
    WHERE r.id = v_report.id
      AND r.org_id = v_actor_org_id
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
    'REPORT',
    v_report.id,
    'REPORT_SUBMITTED',
    v_actor_profile_id,
    jsonb_build_object(
      'status', 'draft',
      'version', v_report.version
    ),
    jsonb_build_object(
      'status', 'submitted',
      'version', v_new_version
    ),
    jsonb_build_object(
      'period_type', v_report.period_type,
      'period_start', v_report.period_start,
      'revision_no', v_report.revision_no,
      'source_event_seq', v_report.source_event_seq,
      'source_audit_seq', v_report.source_audit_seq
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'report_id', v_report.id,
      'status', 'submitted',
      'revision_no', v_report.revision_no,
      'version', v_new_version
    )
  );
END;
$$;


ALTER FUNCTION "public"."cpc_submit_report"("p_report_id" "uuid", "p_expected_version" integer, "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_transition_project"("p_project_id" "uuid", "p_expected_version" integer, "p_to_status" "text", "p_reason" "text" DEFAULT NULL::"text", "p_pause_next_check_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_reopen_next_action_title" "text" DEFAULT NULL::"text", "p_reopen_next_action_due_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_reopen_waiting_on" "text" DEFAULT NULL::"text", "p_reopen_next_check_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_project public.cpc_projects%ROWTYPE;
  v_customer public.cpc_customer_references%ROWTYPE;
  v_old_next public.cpc_work_items%ROWTYPE;
  v_old_next_found BOOLEAN := FALSE;
  v_event_type TEXT;
  v_event_id UUID;
  v_new_next_action_id UUID;
  v_new_version INTEGER;
  v_reopen_next_title TEXT := NULLIF(btrim(p_reopen_next_action_title), '');
  v_target_waiting_on TEXT := 'none';
  v_target_next_check_at TIMESTAMPTZ := NULL;
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
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效项目权限');
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

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR v_project.owner_profile_id = v_actor_profile_id
  ) THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '只有项目负责人或管理角色可变更生命周期');
  END IF;

  IF p_expected_version IS NULL
     OR p_expected_version <> v_project.version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', '项目版本已变化');
  END IF;

  IF NOT public.cpc_project_transition_is_valid(
    v_project.status,
    p_to_status
  ) THEN
    RETURN public.cpc_rpc_error('INVALID_TRANSITION', '项目状态流转不合法');
  END IF;

  IF p_to_status IN ('paused', 'lost', 'cancelled', 'active')
     AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RETURN public.cpc_rpc_error('REASON_REQUIRED', '该状态变化必须填写原因');
  END IF;

  IF p_to_status = 'paused' AND p_pause_next_check_at IS NULL THEN
    RETURN public.cpc_rpc_error(
      'NEXT_CHECK_REQUIRED',
      '暂停项目必须设置下一次检查时间'
    );
  END IF;

  IF p_to_status = 'won' THEN
    SELECT cr.*
      INTO v_customer
      FROM public.cpc_customer_references cr
      WHERE cr.id = v_project.customer_reference_id
        AND cr.org_id = v_actor_org_id;

    IF NOT FOUND OR v_customer.reference_kind <> 'canonical' THEN
      RETURN public.cpc_rpc_error(
        'CANONICAL_CUSTOMER_REQUIRED',
        '临时客户引用不能直接标记项目成交'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.cpc_project_events pe
      WHERE pe.project_id = v_project.id
        AND pe.org_id = v_actor_org_id
        AND pe.event_type = 'ORDER_CONFIRMED'
    ) THEN
      RETURN public.cpc_rpc_error(
        'ORDER_CONFIRMATION_REQUIRED',
        '项目成交前必须先有人确认订单证据'
      );
    END IF;
  END IF;

  SELECT wi.*
    INTO v_old_next
    FROM public.cpc_work_items wi
    WHERE wi.project_id = v_project.id
      AND wi.work_item_type = 'NEXT_ACTION'
      AND wi.status IN ('pending', 'in_progress', 'blocked')
    FOR UPDATE;

  v_old_next_found := FOUND;

  IF p_to_status = 'active' THEN
    IF v_reopen_next_title IS NOT NULL THEN
      IF p_reopen_waiting_on IS NOT NULL
         AND p_reopen_waiting_on <> 'none' THEN
        RETURN public.cpc_rpc_error(
          'INVALID_NEXT_STEP',
          '重启项目的下一步任务和等待状态不能同时存在'
        );
      END IF;

      v_target_waiting_on := 'none';
      v_target_next_check_at := NULL;
    ELSE
      IF p_reopen_waiting_on IS NULL
         OR p_reopen_waiting_on = 'none'
         OR p_reopen_waiting_on NOT IN (
           'customer',
           'internal',
           'supplier',
           'quality',
           'finance',
           'logistics',
           'other'
         )
         OR p_reopen_next_check_at IS NULL THEN
        RETURN public.cpc_rpc_error(
          'NEXT_STEP_REQUIRED',
          '重启项目必须建立下一步任务或等待/检查状态'
        );
      END IF;

      v_target_waiting_on := p_reopen_waiting_on;
      v_target_next_check_at := p_reopen_next_check_at;
    END IF;
  END IF;

  IF v_old_next_found
     AND p_to_status IN ('paused', 'won', 'lost', 'cancelled') THEN
    UPDATE public.cpc_work_items wi
      SET status = 'cancelled',
          blocked_reason = NULL,
          cancelled_at = NOW(),
          cancelled_by_profile_id = v_actor_profile_id,
          cancellation_reason = 'Project status changed to ' || p_to_status,
          version = wi.version + 1,
          updated_at = NOW()
      WHERE wi.id = v_old_next.id
        AND wi.org_id = v_actor_org_id;
  END IF;

  IF p_to_status = 'active' AND v_reopen_next_title IS NOT NULL THEN
    INSERT INTO public.cpc_work_items (
      org_id,
      customer_reference_id,
      project_id,
      work_item_type,
      title,
      assignee_profile_id,
      created_by_profile_id,
      due_at,
      status,
      priority
    )
    VALUES (
      v_actor_org_id,
      v_project.customer_reference_id,
      v_project.id,
      'NEXT_ACTION',
      v_reopen_next_title,
      v_project.owner_profile_id,
      v_actor_profile_id,
      p_reopen_next_action_due_at,
      'pending',
      v_project.priority
    )
    RETURNING id INTO v_new_next_action_id;
  END IF;

  v_event_type := CASE p_to_status
    WHEN 'paused' THEN 'PROJECT_PAUSED'
    WHEN 'active' THEN 'PROJECT_REOPENED'
    WHEN 'won' THEN 'PROJECT_WON'
    WHEN 'lost' THEN 'PROJECT_LOST'
    WHEN 'cancelled' THEN 'PROJECT_CANCELLED'
    ELSE NULL
  END;

  INSERT INTO public.cpc_project_events (
    org_id,
    customer_reference_id,
    project_id,
    event_type,
    event_category,
    occurred_at,
    actor_profile_id,
    source,
    payload_schema_version,
    payload,
    request_id
  )
  VALUES (
    v_actor_org_id,
    v_project.customer_reference_id,
    v_project.id,
    v_event_type,
    'LIFECYCLE',
    NOW(),
    v_actor_profile_id,
    'user',
    1,
    jsonb_build_object(
      'from_status', v_project.status,
      'to_status', p_to_status,
      'reason', NULLIF(btrim(p_reason), ''),
      'pause_next_check_at', p_pause_next_check_at
    )
    ||
    CASE p_to_status
      WHEN 'paused' THEN jsonb_build_object(
        'pause_reason', btrim(p_reason)
      )
      WHEN 'active' THEN jsonb_build_object(
        'reopen_reason', btrim(p_reason)
      )
      WHEN 'lost' THEN jsonb_build_object(
        'loss_reason', btrim(p_reason)
      )
      WHEN 'cancelled' THEN jsonb_build_object(
        'cancellation_reason', btrim(p_reason)
      )
      ELSE '{}'::JSONB
    END,
    p_request_id
  )
  RETURNING id INTO v_event_id;

  UPDATE public.cpc_projects p
    SET status = p_to_status,
        waiting_on = CASE
          WHEN p_to_status = 'active' THEN v_target_waiting_on
          ELSE 'none'
        END,
        next_check_at = CASE
          WHEN p_to_status = 'paused' THEN p_pause_next_check_at
          WHEN p_to_status = 'active' THEN v_target_next_check_at
          ELSE NULL
        END,
        version = p.version + 1,
        updated_at = NOW()
    WHERE p.id = v_project.id
      AND p.org_id = v_actor_org_id
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
    metadata,
    request_id
  )
  VALUES (
    v_actor_org_id,
    'PROJECT',
    v_project.id,
    'PROJECT_STATUS_CHANGED',
    v_actor_profile_id,
    NULLIF(btrim(p_reason), ''),
    jsonb_build_object(
      'status', v_project.status,
      'waiting_on', v_project.waiting_on,
      'next_check_at', v_project.next_check_at,
      'version', v_project.version
    ),
    jsonb_build_object(
      'status', p_to_status,
      'waiting_on',
        CASE
          WHEN p_to_status = 'active' THEN v_target_waiting_on
          ELSE 'none'
        END,
      'next_check_at',
        CASE
          WHEN p_to_status = 'paused' THEN p_pause_next_check_at
          WHEN p_to_status = 'active' THEN v_target_next_check_at
          ELSE NULL
        END,
      'version', v_new_version
    ),
    jsonb_build_object(
      'event_id', v_event_id,
      'closed_next_action_id',
        CASE WHEN v_old_next_found THEN v_old_next.id ELSE NULL END,
      'new_next_action_id', v_new_next_action_id
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'project_id', v_project.id,
      'status', p_to_status,
      'version', v_new_version,
      'event_id', v_event_id,
      'next_action_id', v_new_next_action_id
    )
  );
END;
$$;


ALTER FUNCTION "public"."cpc_transition_project"("p_project_id" "uuid", "p_expected_version" integer, "p_to_status" "text", "p_reason" "text", "p_pause_next_check_at" timestamp with time zone, "p_reopen_next_action_title" "text", "p_reopen_next_action_due_at" timestamp with time zone, "p_reopen_waiting_on" "text", "p_reopen_next_check_at" timestamp with time zone, "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_transition_work_item"("p_work_item_id" "uuid", "p_expected_version" integer, "p_to_status" "text", "p_reason" "text" DEFAULT NULL::"text", "p_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_item public.cpc_work_items%ROWTYPE;
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
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效任务权限');
  END IF;

  SELECT wi.*
    INTO v_item
    FROM public.cpc_work_items wi
    WHERE wi.id = p_work_item_id
      AND wi.org_id = v_actor_org_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.cpc_rpc_error('NOT_FOUND', '任务不存在');
  END IF;

  v_authorized :=
    v_actor_role IN ('admin', 'manager')
    OR v_item.assignee_profile_id = v_actor_profile_id;

  IF NOT v_authorized AND v_item.project_id IS NOT NULL THEN
    SELECT p.*
      INTO v_project
      FROM public.cpc_projects p
      WHERE p.id = v_item.project_id
        AND p.org_id = v_actor_org_id;

    IF FOUND THEN
      v_authorized :=
        v_project.owner_profile_id = v_actor_profile_id
        OR EXISTS (
          SELECT 1
          FROM public.cpc_project_members pm
          WHERE pm.project_id = v_project.id
            AND pm.org_id = v_actor_org_id
            AND pm.profile_id = v_actor_profile_id
            AND pm.removed_at IS NULL
        );
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无权更新该任务');
  END IF;

  IF p_expected_version IS NULL
     OR p_expected_version <> v_item.version THEN
    RETURN public.cpc_rpc_error('VERSION_CONFLICT', '任务版本已变化');
  END IF;

  IF NOT public.cpc_work_item_transition_is_valid(
    v_item.status,
    p_to_status
  ) THEN
    RETURN public.cpc_rpc_error('INVALID_TRANSITION', '任务状态流转不合法');
  END IF;

  IF p_to_status IN ('blocked', 'cancelled')
     AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RETURN public.cpc_rpc_error(
      'REASON_REQUIRED',
      '阻塞或取消任务必须填写原因'
    );
  END IF;

  IF v_item.work_item_type = 'NEXT_ACTION'
     AND p_to_status IN ('completed', 'cancelled')
     AND v_item.project_id IS NOT NULL THEN
    SELECT p.*
      INTO v_project
      FROM public.cpc_projects p
      WHERE p.id = v_item.project_id
        AND p.org_id = v_actor_org_id
      FOR UPDATE;

    IF FOUND
       AND v_project.status = 'active'
       AND v_project.waiting_on = 'none' THEN
      RETURN public.cpc_rpc_error(
        'NEXT_STEP_REQUIRED',
        '活跃项目完成当前下一步时，必须同时建立新的下一步或等待状态'
      );
    END IF;
  END IF;

  UPDATE public.cpc_work_items wi
    SET status = p_to_status,
        blocked_reason = CASE
          WHEN p_to_status = 'blocked' THEN btrim(p_reason)
          ELSE NULL
        END,
        completed_at = CASE
          WHEN p_to_status = 'completed' THEN NOW()
          ELSE NULL
        END,
        completed_by_profile_id = CASE
          WHEN p_to_status = 'completed' THEN v_actor_profile_id
          ELSE NULL
        END,
        cancelled_at = CASE
          WHEN p_to_status = 'cancelled' THEN NOW()
          ELSE NULL
        END,
        cancelled_by_profile_id = CASE
          WHEN p_to_status = 'cancelled' THEN v_actor_profile_id
          ELSE NULL
        END,
        cancellation_reason = CASE
          WHEN p_to_status = 'cancelled' THEN btrim(p_reason)
          ELSE NULL
        END,
        version = wi.version + 1,
        updated_at = NOW()
    WHERE wi.id = v_item.id
      AND wi.org_id = v_actor_org_id
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
    'WORK_ITEM',
    v_item.id,
    'WORK_ITEM_STATUS_CHANGED',
    v_actor_profile_id,
    NULLIF(btrim(p_reason), ''),
    jsonb_build_object(
      'status', v_item.status,
      'version', v_item.version
    ),
    jsonb_build_object(
      'status', p_to_status,
      'version', v_new_version
    ),
    p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'work_item_id', v_item.id,
      'status', p_to_status,
      'version', v_new_version
    )
  );
END;
$$;


ALTER FUNCTION "public"."cpc_transition_work_item"("p_work_item_id" "uuid", "p_expected_version" integer, "p_to_status" "text", "p_reason" "text", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpc_work_item_transition_is_valid"("p_from_status" "text", "p_to_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT CASE p_from_status
    WHEN 'pending' THEN p_to_status IN (
      'in_progress',
      'blocked',
      'completed',
      'cancelled'
    )
    WHEN 'in_progress' THEN p_to_status IN (
      'blocked',
      'completed',
      'cancelled'
    )
    WHEN 'blocked' THEN p_to_status IN (
      'in_progress',
      'completed',
      'cancelled'
    )
    ELSE FALSE
  END;
$$;


ALTER FUNCTION "public"."cpc_work_item_transition_is_valid"("p_from_status" "text", "p_to_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."glh_assign_lead"("p_lead_id" "uuid", "p_assignee_profile_id" "uuid", "p_expected_version" integer, "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."glh_assign_lead"("p_lead_id" "uuid", "p_assignee_profile_id" "uuid", "p_expected_version" integer, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."glh_can_access_contact"("p_contact_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.glh_contacts c
    WHERE c.id = p_contact_id
      AND (
        public.glh_can_manage_org(c.org_id)
        OR EXISTS (
          SELECT 1
          FROM public.glh_leads l
          WHERE l.contact_id = c.id
            AND l.org_id = c.org_id
            AND public.glh_can_access_lead(l.id)
        )
      )
  );
$$;


ALTER FUNCTION "public"."glh_can_access_contact"("p_contact_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."glh_can_access_conversation"("p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.glh_conversations c
    WHERE c.id = p_conversation_id
      AND public.glh_can_access_lead(c.lead_id)
  );
$$;


ALTER FUNCTION "public"."glh_can_access_conversation"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."glh_can_access_lead"("p_lead_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.glh_leads l
    JOIN public.profiles p
      ON p.user_id = auth.uid()
     AND p.is_active = true
     AND p.org_id = l.org_id
    WHERE l.id = p_lead_id
      AND p.role IN ('admin', 'manager', 'sales')
      AND (
        p.role IN ('admin', 'manager')
        OR l.owner_profile_id = p.id
        OR EXISTS (
          SELECT 1
          FROM public.glh_assignments a
          WHERE a.lead_id = l.id
            AND a.org_id = l.org_id
            AND a.assignee_profile_id = p.id
            AND a.status = 'ACTIVE'
        )
      )
  );
$$;


ALTER FUNCTION "public"."glh_can_access_lead"("p_lead_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."glh_can_manage_org"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
      AND p.org_id = p_org_id
      AND p.role IN ('admin', 'manager')
  );
$$;


ALTER FUNCTION "public"."glh_can_manage_org"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."glh_change_manual_lead_stage"("p_lead_id" "uuid", "p_expected_version" integer, "p_stage" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."glh_change_manual_lead_stage"("p_lead_id" "uuid", "p_expected_version" integer, "p_stage" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."glh_create_manual_production_lead"("p_request_key" "uuid", "p_display_name" "text", "p_company_name" "text" DEFAULT NULL::"text", "p_country_code" "text" DEFAULT NULL::"text", "p_whatsapp" "text" DEFAULT NULL::"text", "p_email" "text" DEFAULT NULL::"text", "p_requirement_type" "text" DEFAULT NULL::"text", "p_owner_profile_id" "uuid" DEFAULT NULL::"uuid", "p_product" "text" DEFAULT NULL::"text", "p_material" "text" DEFAULT NULL::"text", "p_quantity" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text", "p_source_detail" "text" DEFAULT 'OTHER'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_owner public.profiles%ROWTYPE;
  v_prior public.glh_manual_intake_requests%ROWTYPE;
  v_contact_id uuid := gen_random_uuid();
  v_lead_id uuid := gen_random_uuid();
  v_owner_id uuid;
  v_name text := NULLIF(btrim(COALESCE(p_display_name,'')),'');
  v_company text := NULLIF(btrim(COALESCE(p_company_name,'')),'');
  v_country text := NULLIF(upper(btrim(COALESCE(p_country_code,''))),'');
  v_phone text := NULLIF(regexp_replace(COALESCE(p_whatsapp,''),'[^0-9]','','g'),'');
  v_email text := NULLIF(lower(btrim(COALESCE(p_email,''))),'');
  v_product text := NULLIF(btrim(COALESCE(p_product,'')),'');
  v_material text := NULLIF(btrim(COALESCE(p_material,'')),'');
  v_quantity text := NULLIF(btrim(COALESCE(p_quantity,'')),'');
  v_notes text := NULLIF(btrim(COALESCE(p_notes,'')),'');
  v_source text := COALESCE(p_source_detail,'OTHER');
  v_hash text;
BEGIN
  -- Trust auth.uid and the live active business profile; no request-supplied org or actor ID.
  SELECT * INTO v_actor
  FROM public.profiles
  WHERE user_id = auth.uid() AND is_active = true;

  IF NOT FOUND OR v_actor.role NOT IN ('admin','manager','sales') THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_request_key IS NULL OR v_name IS NULL OR length(v_name) > 200
     OR length(COALESCE(v_company,'')) > 300
     OR length(COALESCE(v_country,'')) > 16
     OR length(COALESCE(p_whatsapp,'')) > 64
     OR (v_phone IS NOT NULL AND (length(v_phone) < 7 OR length(v_phone) > 15))
     OR length(COALESCE(v_email,'')) > 320
     OR length(COALESCE(v_product,'')) > 300
     OR length(COALESCE(v_material,'')) > 300
     OR length(COALESCE(v_quantity,'')) > 200
     OR length(COALESCE(v_notes,'')) > 2000
     OR v_source NOT IN ('EXHIBITION','WEBSITE','REFERRAL','OUTREACH','SOCIAL','OTHER')
     OR (p_requirement_type IS NOT NULL AND p_requirement_type NOT IN
         ('FILM','PROCESSING','MACHINE','PROCESS_CONSULT','UNCLEAR'))
  THEN
    RAISE EXCEPTION 'INVALID_MANUAL_LEAD' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NULL AND v_phone IS NULL THEN
    RAISE EXCEPTION 'CONTACT_METHOD_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NOT NULL AND (position('@' in v_email) < 2
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') THEN
    RAISE EXCEPTION 'INVALID_EMAIL' USING ERRCODE = '22023';
  END IF;

  v_owner_id := COALESCE(p_owner_profile_id,v_actor.id);
  IF v_actor.role = 'sales' AND v_owner_id <> v_actor.id THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_owner FROM public.profiles
    WHERE id = v_owner_id
      AND org_id = v_actor.org_id
      AND is_active = true
      AND role IN ('admin','manager','sales');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  -- Hash only normalized fields to distinguish safe replay from modified-key reuse.
  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'name',v_name,'company',v_company,'country',v_country,
    'phone',v_phone,'email',v_email,'requirement',p_requirement_type,
    'owner',v_owner_id,'product',v_product,'material',v_material,
    'quantity',v_quantity,'notes',v_notes,'origin',v_source
  )::text,'UTF8')),'hex');

  -- Serialize retries by this user/key; no user-controlled lock key escapes this org.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_actor.org_id::text || ':' || v_actor.id::text || ':' || p_request_key::text,0
  ));
  SELECT * INTO v_prior FROM public.glh_manual_intake_requests
    WHERE org_id = v_actor.org_id
      AND actor_profile_id = v_actor.id AND request_key = p_request_key;
  IF FOUND THEN
    IF v_prior.request_hash <> v_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '40001';
    END IF;
    RETURN jsonb_build_object(
      'leadId',v_prior.lead_id,'contactId',v_prior.contact_id,
      'ownerProfileId',v_owner_id,'idempotentReplay',true
    );
  END IF;

  -- Guard two near-simultaneous human submissions using the same email/phone.
  -- Without per-contact transaction locks both can pass the EXISTS check before
  -- either transaction inserts; serialization by request key alone is insufficient.
  -- Identical emails/phones always lock the same keys, in a stable order to avoid
  -- deadlocks when one request contains both contact fields.
  IF v_email IS NOT NULL AND v_phone IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(k.key)
    FROM (SELECT DISTINCT hashtextextended(
      v_actor.org_id::text || ':glh:contact:' || token, 0
    ) AS key
      FROM (VALUES ('email:' || v_email),('phone:' || v_phone)) AS contact(token)
    ) AS k
    ORDER BY k.key;
  ELSIF v_email IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      v_actor.org_id::text || ':glh:contact:email:' || v_email,0
    ));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(
      v_actor.org_id::text || ':glh:contact:phone:' || v_phone,0
    ));
  END IF;

  -- A prior contact owned by another Sales must never be silently reassigned.
  -- Generic conflict response deliberately does not expose that user's identity.
  IF EXISTS (
    SELECT 1 FROM public.glh_contacts c
    WHERE c.org_id = v_actor.org_id
      AND ((v_email IS NOT NULL AND c.normalized_email = v_email)
        OR (v_phone IS NOT NULL
          AND regexp_replace(COALESCE(c.normalized_whatsapp,''),'[^0-9]','','g') = v_phone))
  ) THEN
    RAISE EXCEPTION 'CONTACT_ALREADY_EXISTS' USING ERRCODE = '23505';
  END IF;

  -- MANUAL is provenance in immutable activity/extracted facts, NOT an invented
  -- external WhatsApp/Facebook channel. No channel account or conversation created.
  INSERT INTO public.glh_contacts (
    id,org_id,display_name,company_name,country_code,
    normalized_whatsapp,normalized_email,source_platform,created_by_profile_id
  ) VALUES (
    v_contact_id,v_actor.org_id,v_name,v_company,v_country,
    v_phone,v_email,'UNKNOWN',v_actor.id
  );

  INSERT INTO public.glh_leads (
    id,org_id,contact_id,owner_profile_id,lifecycle_state,
    conversation_mode,score,completeness,source_platform,created_by_profile_id
  ) VALUES (
    v_lead_id,v_actor.org_id,v_contact_id,v_owner_id,'NEW',
    'PAUSED',0,0,'UNKNOWN',v_actor.id
  );

  INSERT INTO public.glh_lead_profiles (
    lead_id,org_id,customer_company_name,country_code,whatsapp,email,
    product,material,quantity,requirement_type,extracted_facts,created_by_profile_id
  ) VALUES (
    v_lead_id,v_actor.org_id,v_company,v_country,
    NULLIF(btrim(COALESCE(p_whatsapp,'')),''),v_email,
    v_product,v_material,v_quantity,p_requirement_type,
    jsonb_build_object(
      'origin','MANUAL_PRODUCTION','source_detail',v_source,
      'sales_notes',v_notes,'recorded_by_profile_id',v_actor.id
    ),v_actor.id
  );

  INSERT INTO public.glh_assignments (
    org_id,lead_id,assignee_profile_id,assignment_type,
    assigned_by_profile_id,status,reason
  ) VALUES (
    v_actor.org_id,v_lead_id,v_owner_id,'PRIMARY',
    v_actor.id,'ACTIVE','MANUAL_PRODUCTION_LEAD_CREATED'
  );

  INSERT INTO public.glh_audit_events (
    org_id,lead_id,actor_profile_id,actor_kind,event_type,
    entity_type,entity_id,previous_state,next_state,reason,context
  ) VALUES (
    v_actor.org_id,v_lead_id,v_actor.id,'HUMAN','LEAD_STAGE_CHANGED',
    'glh_leads',v_lead_id,NULL,'NEW','MANUAL_PRODUCTION_LEAD_CREATED',
    jsonb_build_object('origin','MANUAL_PRODUCTION','source_detail',v_source)
  );
  INSERT INTO public.glh_audit_events (
    org_id,lead_id,actor_profile_id,actor_kind,event_type,
    entity_type,entity_id,previous_state,next_state,reason,context
  ) VALUES (
    v_actor.org_id,v_lead_id,v_actor.id,'HUMAN','LEAD_ASSIGNED',
    'glh_leads',v_lead_id,NULL,v_owner_id::text,'MANUAL_PRODUCTION_LEAD_CREATED',
    jsonb_build_object('origin','MANUAL_PRODUCTION','assignee_profile_id',v_owner_id)
  );
  INSERT INTO public.glh_activity_events (
    org_id,lead_id,actor_profile_id,actor_kind,activity_type,
    entity_type,entity_id,context
  ) VALUES (
    v_actor.org_id,v_lead_id,v_actor.id,'HUMAN','LEAD_CREATED',
    'glh_leads',v_lead_id,
    jsonb_build_object('origin','MANUAL_PRODUCTION','source_detail',v_source)
  );

  INSERT INTO public.glh_manual_intake_requests (
    org_id,actor_profile_id,request_key,request_hash,lead_id,contact_id
  ) VALUES (
    v_actor.org_id,v_actor.id,p_request_key,v_hash,v_lead_id,v_contact_id
  );

  RETURN jsonb_build_object(
    'leadId',v_lead_id,'contactId',v_contact_id,
    'ownerProfileId',v_owner_id,'idempotentReplay',false
  );
END;
$_$;


ALTER FUNCTION "public"."glh_create_manual_production_lead"("p_request_key" "uuid", "p_display_name" "text", "p_company_name" "text", "p_country_code" "text", "p_whatsapp" "text", "p_email" "text", "p_requirement_type" "text", "p_owner_profile_id" "uuid", "p_product" "text", "p_material" "text", "p_quantity" "text", "p_notes" "text", "p_source_detail" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."glh_create_manual_test_lead"("p_manual_creation_guard" "text", "p_display_name" "text", "p_company_name" "text" DEFAULT NULL::"text", "p_country_code" "text" DEFAULT NULL::"text", "p_whatsapp" "text" DEFAULT NULL::"text", "p_email" "text" DEFAULT NULL::"text", "p_source_platform" "text" DEFAULT 'UNKNOWN'::"text", "p_requirement_type" "text" DEFAULT NULL::"text", "p_lifecycle_state" "text" DEFAULT 'NEW'::"text", "p_conversation_mode" "text" DEFAULT 'AI_ACTIVE'::"text", "p_priority_grade" "text" DEFAULT NULL::"text", "p_score" integer DEFAULT 0, "p_completeness" integer DEFAULT 0, "p_owner_profile_id" "uuid" DEFAULT NULL::"uuid", "p_product" "text" DEFAULT NULL::"text", "p_material" "text" DEFAULT NULL::"text", "p_quantity" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."glh_create_manual_test_lead"("p_manual_creation_guard" "text", "p_display_name" "text", "p_company_name" "text", "p_country_code" "text", "p_whatsapp" "text", "p_email" "text", "p_source_platform" "text", "p_requirement_type" "text", "p_lifecycle_state" "text", "p_conversation_mode" "text", "p_priority_grade" "text", "p_score" integer, "p_completeness" integer, "p_owner_profile_id" "uuid", "p_product" "text", "p_material" "text", "p_quantity" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."glh_create_task_or_followup"("p_lead_id" "uuid", "p_work_kind" "text", "p_work_type" "text", "p_title" "text", "p_due_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_assignee_profile_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."glh_create_task_or_followup"("p_lead_id" "uuid", "p_work_kind" "text", "p_work_type" "text", "p_title" "text", "p_due_at" timestamp with time zone, "p_assignee_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."glh_current_profile_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
    AND p.is_active = true
  LIMIT 1;
$$;


ALTER FUNCTION "public"."glh_current_profile_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."glh_finish_manual_work"("p_work_kind" "text", "p_work_id" "uuid", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."glh_finish_manual_work"("p_work_kind" "text", "p_work_id" "uuid", "p_expected_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."glh_ingest_whatsapp_inbound"("p_external_event_id" "text", "p_provider_account_id" "text", "p_external_contact_id" "text", "p_external_conversation_id" "text", "p_contact_display_name" "text" DEFAULT NULL::"text", "p_message_type" "text" DEFAULT NULL::"text", "p_message_text" "text" DEFAULT NULL::"text", "p_media_metadata" "jsonb" DEFAULT NULL::"jsonb", "p_provider_timestamp" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_referral" "jsonb" DEFAULT NULL::"jsonb", "p_raw_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_channel public.glh_channel_accounts%ROWTYPE;
  v_event_id UUID;
  v_contact_id UUID;
  v_lead_id UUID;
  v_conversation_id UUID;
  v_message_id UUID;
  v_received_at TIMESTAMPTZ := COALESCE(p_provider_timestamp, NOW());
  v_referral_identifier TEXT;
  v_new_lead BOOLEAN := FALSE;
  v_error_state TEXT;
  v_error_message TEXT;
BEGIN
  IF p_external_event_id IS NULL OR length(btrim(p_external_event_id)) = 0
     OR p_provider_account_id IS NULL OR length(btrim(p_provider_account_id)) = 0
     OR p_external_contact_id IS NULL OR length(btrim(p_external_contact_id)) = 0
     OR p_external_conversation_id IS NULL OR length(btrim(p_external_conversation_id)) = 0
     OR p_message_type IS NULL OR length(btrim(p_message_type)) = 0
     OR p_raw_payload IS NULL OR jsonb_typeof(p_raw_payload) <> 'object'
     OR (p_media_metadata IS NOT NULL AND jsonb_typeof(p_media_metadata) <> 'object')
     OR (p_referral IS NOT NULL AND jsonb_typeof(p_referral) <> 'object') THEN
    RAISE EXCEPTION 'INVALID_WHATSAPP_INBOUND' USING ERRCODE = '22023';
  END IF;

  -- Organization is derived exclusively from an existing verified channel account.
  -- No caller-supplied organization or profile identifier is accepted.
  SELECT *
  INTO v_channel
  FROM public.glh_channel_accounts
  WHERE provider = 'WHATSAPP'
    AND external_account_id = btrim(p_provider_account_id)
    AND status IN ('TEST_READY', 'CONNECTED')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WHATSAPP_CHANNEL_NOT_VERIFIED' USING ERRCODE = '42501';
  END IF;

  -- Persist the verified raw event before attempting logical record derivation.
  INSERT INTO public.glh_webhook_events (
    org_id, channel_account_id, provider, external_event_id,
    idempotency_key, signature_verified, payload, processing_status
  ) VALUES (
    v_channel.org_id, v_channel.id, 'WHATSAPP', btrim(p_external_event_id),
    'WHATSAPP:' || btrim(p_external_event_id), TRUE, p_raw_payload, 'PROCESSING'
  )
  ON CONFLICT (provider, external_event_id) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT id
    INTO v_event_id
    FROM public.glh_webhook_events
    WHERE provider = 'WHATSAPP'
      AND external_event_id = btrim(p_external_event_id);

    RETURN jsonb_build_object(
      'ok', TRUE,
      'status', 'DUPLICATE',
      'duplicate', TRUE,
      'event_id', v_event_id
    );
  END IF;

  BEGIN
    INSERT INTO public.glh_contacts (
      org_id, display_name, provider_external_contact_id, source_platform,
      normalized_whatsapp
    ) VALUES (
      v_channel.org_id,
      NULLIF(btrim(COALESCE(p_contact_display_name, '')), ''),
      btrim(p_external_contact_id),
      'WHATSAPP',
      NULLIF(regexp_replace(p_external_contact_id, '[^0-9+]', '', 'g'), '')
    )
    ON CONFLICT (org_id, source_platform, provider_external_contact_id)
      WHERE provider_external_contact_id IS NOT NULL
    DO UPDATE SET
      display_name = COALESCE(EXCLUDED.display_name, public.glh_contacts.display_name),
      normalized_whatsapp = COALESCE(
        public.glh_contacts.normalized_whatsapp,
        EXCLUDED.normalized_whatsapp
      ),
      updated_at = NOW()
    RETURNING id INTO v_contact_id;

    -- Lock the contact so concurrent first messages cannot create duplicate leads.
    PERFORM 1
    FROM public.glh_contacts
    WHERE id = v_contact_id
      AND org_id = v_channel.org_id
    FOR UPDATE;

    SELECT id
    INTO v_lead_id
    FROM public.glh_leads
    WHERE org_id = v_channel.org_id
      AND contact_id = v_contact_id
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;

    v_referral_identifier := COALESCE(
      NULLIF(p_referral ->> 'ctwa_clid', ''),
      NULLIF(p_referral ->> 'source_id', ''),
      NULLIF(p_referral ->> 'source_url', '')
    );

    IF v_lead_id IS NULL THEN
      v_lead_id := gen_random_uuid();
      v_new_lead := TRUE;

      INSERT INTO public.glh_leads (
        id, org_id, contact_id, lifecycle_state, conversation_mode,
        source_platform, referral_identifier, last_message_at
      ) VALUES (
        v_lead_id, v_channel.org_id, v_contact_id, 'NEW', 'AI_ACTIVE',
        'WHATSAPP', v_referral_identifier, v_received_at
      );

      INSERT INTO public.glh_lead_profiles (
        lead_id, org_id, whatsapp, extracted_facts
      ) VALUES (
        v_lead_id,
        v_channel.org_id,
        btrim(p_external_contact_id),
        jsonb_strip_nulls(jsonb_build_object(
          'source', 'WHATSAPP_INBOUND',
          'contact_display_name', NULLIF(btrim(COALESCE(p_contact_display_name, '')), ''),
          'referral', p_referral
        ))
      );

      INSERT INTO public.glh_activity_events (
        org_id, lead_id, actor_kind, activity_type,
        entity_type, entity_id, context
      ) VALUES (
        v_channel.org_id, v_lead_id, 'SYSTEM', 'LEAD_CREATED',
        'glh_leads', v_lead_id,
        jsonb_build_object('source', 'WHATSAPP_INBOUND', 'event_id', v_event_id)
      );

      INSERT INTO public.glh_audit_events (
        org_id, lead_id, actor_kind, event_type, entity_type, entity_id,
        previous_state, next_state, reason, context
      ) VALUES (
        v_channel.org_id, v_lead_id, 'SYSTEM', 'LEAD_STAGE_CHANGED',
        'glh_leads', v_lead_id, NULL, 'NEW', 'WHATSAPP_INBOUND_CREATED',
        jsonb_build_object('event_id', v_event_id, 'channel_account_id', v_channel.id)
      );
    ELSE
      UPDATE public.glh_leads
      SET last_message_at = GREATEST(last_message_at, v_received_at),
          referral_identifier = COALESCE(referral_identifier, v_referral_identifier),
          version = version + 1,
          updated_at = NOW()
      WHERE id = v_lead_id
        AND org_id = v_channel.org_id;
    END IF;

    INSERT INTO public.glh_conversations (
      org_id, lead_id, contact_id, channel_account_id,
      external_conversation_id, last_message_at
    ) VALUES (
      v_channel.org_id, v_lead_id, v_contact_id, v_channel.id,
      btrim(p_external_conversation_id), v_received_at
    )
    ON CONFLICT ON CONSTRAINT uq_glh_conversations_external
    DO UPDATE SET
      last_message_at = GREATEST(public.glh_conversations.last_message_at, EXCLUDED.last_message_at),
      updated_at = NOW()
    RETURNING id INTO v_conversation_id;

    INSERT INTO public.glh_messages (
      org_id, conversation_id, lead_id, contact_id, provider,
      provider_message_id, direction, actor_type, message_text,
      media_metadata, provider_timestamp, delivery_status
    ) VALUES (
      v_channel.org_id, v_conversation_id, v_lead_id, v_contact_id, 'WHATSAPP',
      btrim(p_external_event_id), 'INBOUND', 'CUSTOMER',
      NULLIF(p_message_text, ''),
      COALESCE(p_media_metadata, jsonb_build_object('message_type', p_message_type)),
      p_provider_timestamp, 'RECEIVED'
    )
    ON CONFLICT ON CONSTRAINT uq_glh_messages_provider_external
    DO NOTHING
    RETURNING id INTO v_message_id;

    IF v_message_id IS NULL THEN
      SELECT id
      INTO v_message_id
      FROM public.glh_messages
      WHERE org_id = v_channel.org_id
        AND provider = 'WHATSAPP'
        AND provider_message_id = btrim(p_external_event_id);
    END IF;

    UPDATE public.glh_webhook_events
    SET processing_status = 'PROCESSED',
        processing_error = NULL,
        processed_at = NOW()
    WHERE id = v_event_id
      AND org_id = v_channel.org_id;

    RETURN jsonb_build_object(
      'ok', TRUE,
      'status', 'PROCESSED',
      'duplicate', FALSE,
      'event_id', v_event_id,
      'contact_id', v_contact_id,
      'lead_id', v_lead_id,
      'conversation_id', v_conversation_id,
      'message_id', v_message_id,
      'lead_created', v_new_lead
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_error_state = RETURNED_SQLSTATE,
      v_error_message = MESSAGE_TEXT;

    UPDATE public.glh_webhook_events
    SET processing_status = 'FAILED',
        processing_error = left(v_error_state || ':' || v_error_message, 500),
        processed_at = NOW()
    WHERE id = v_event_id
      AND org_id = v_channel.org_id;

    RETURN jsonb_build_object(
      'ok', FALSE,
      'status', 'FAILED',
      'event_id', v_event_id,
      'error_code', v_error_state
    );
  END;
END;
$$;


ALTER FUNCTION "public"."glh_ingest_whatsapp_inbound"("p_external_event_id" "text", "p_provider_account_id" "text", "p_external_contact_id" "text", "p_external_conversation_id" "text", "p_contact_display_name" "text", "p_message_type" "text", "p_message_text" "text", "p_media_metadata" "jsonb", "p_provider_timestamp" timestamp with time zone, "p_referral" "jsonb", "p_raw_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."glh_queue_human_message"("p_conversation_id" "uuid", "p_lead_id" "uuid", "p_expected_mode" "text", "p_message_text" "text", "p_idempotency_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_lead public.glh_leads%ROWTYPE;
  v_conversation public.glh_conversations%ROWTYPE;
  v_provider TEXT;
  v_provider_message_id TEXT;
  v_existing public.glh_messages%ROWTYPE;
  v_message_id UUID := gen_random_uuid();
  v_text TEXT := btrim(COALESCE(p_message_text, ''));
  v_idempotency_key TEXT := btrim(COALESCE(p_idempotency_key, ''));
BEGIN
  SELECT *
  INTO v_actor
  FROM public.profiles
  WHERE user_id = auth.uid()
    AND is_active = true;

  IF NOT FOUND OR v_actor.role NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_expected_mode <> 'HUMAN_ACTIVE' THEN
    RAISE EXCEPTION 'INVALID_EXPECTED_MODE' USING ERRCODE = '22023';
  END IF;
  IF length(v_text) < 1 OR length(v_text) > 4000 THEN
    RAISE EXCEPTION 'INVALID_MESSAGE_TEXT' USING ERRCODE = '22023';
  END IF;
  IF length(v_idempotency_key) < 8 OR length(v_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_lead
  FROM public.glh_leads
  WHERE id = p_lead_id
    AND org_id = v_actor.org_id
  FOR UPDATE;

  IF NOT FOUND OR NOT (
    v_actor.role IN ('admin', 'manager')
    OR v_lead.owner_profile_id = v_actor.id
    OR EXISTS (
      SELECT 1
      FROM public.glh_assignments a
      WHERE a.org_id = v_actor.org_id
        AND a.lead_id = v_lead.id
        AND a.assignee_profile_id = v_actor.id
        AND a.status = 'ACTIVE'
    )
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  -- A typed %ROWTYPE record cannot share a multi-target INTO list in PL/pgSQL.
  -- Load the locked conversation as a complete row, then resolve its provider.
  SELECT c.*
  INTO v_conversation
  FROM public.glh_conversations c
  JOIN public.glh_channel_accounts ca
    ON ca.id = c.channel_account_id
   AND ca.org_id = c.org_id
  WHERE c.id = p_conversation_id
    AND c.org_id = v_actor.org_id
    AND c.lead_id = v_lead.id
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT ca.provider
  INTO v_provider
  FROM public.glh_channel_accounts ca
  WHERE ca.id = v_conversation.channel_account_id
    AND ca.org_id = v_actor.org_id;
  IF NOT FOUND OR v_provider IS NULL THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF v_conversation.conversation_mode <> 'HUMAN_ACTIVE'
     OR v_lead.conversation_mode <> 'HUMAN_ACTIVE' THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;

  v_provider_message_id := 'human:' || v_idempotency_key;
  INSERT INTO public.glh_messages (
    id, org_id, conversation_id, lead_id, contact_id, provider,
    provider_message_id, direction, actor_type, actor_profile_id,
    message_text, provider_timestamp, delivery_status
  ) VALUES (
    v_message_id, v_actor.org_id, v_conversation.id, v_lead.id,
    v_conversation.contact_id, v_provider, v_provider_message_id,
    'OUTBOUND', 'HUMAN', v_actor.id,
    v_text, NULL, 'QUEUED'
  )
  ON CONFLICT ON CONSTRAINT uq_glh_messages_provider_external DO NOTHING
  RETURNING * INTO v_existing;

  IF NOT FOUND THEN
    SELECT *
    INTO v_existing
    FROM public.glh_messages
    WHERE org_id = v_actor.org_id
      AND provider = v_provider
      AND provider_message_id = v_provider_message_id;

    IF v_existing.conversation_id <> v_conversation.id
       OR v_existing.lead_id <> v_lead.id
       OR v_existing.actor_type <> 'HUMAN'
       OR v_existing.message_text IS DISTINCT FROM v_text THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '40001';
    END IF;
    RETURN jsonb_build_object(
      'message_id', v_existing.id,
      'conversation_id', v_conversation.id,
      'lead_id', v_lead.id,
      'delivery_status', v_existing.delivery_status,
      'provider_action', 'NONE',
      'idempotent_replay', true
    );
  END IF;

  UPDATE public.glh_conversations
  SET last_message_at = NOW(),
      version = version + 1,
      updated_at = NOW()
  WHERE id = v_conversation.id
    AND org_id = v_actor.org_id;

  INSERT INTO public.glh_audit_events (
    org_id, lead_id, actor_profile_id, actor_kind, event_type,
    entity_type, entity_id, previous_state, next_state, reason, context
  ) VALUES (
    v_actor.org_id, v_lead.id, v_actor.id, 'HUMAN', 'HUMAN_HANDOFF',
    'glh_messages', v_message_id,
    NULL, 'QUEUED', NULL,
    jsonb_build_object(
      'action', 'HUMAN_MESSAGE_QUEUED',
      'conversation_id', v_conversation.id,
      'idempotency_key', v_idempotency_key,
      'provider_action', 'NONE'
    )
  );

  RETURN jsonb_build_object(
    'message_id', v_message_id,
    'conversation_id', v_conversation.id,
    'lead_id', v_lead.id,
    'delivery_status', 'QUEUED',
    'provider_action', 'NONE',
    'idempotent_replay', false
  );
END;
$$;


ALTER FUNCTION "public"."glh_queue_human_message"("p_conversation_id" "uuid", "p_lead_id" "uuid", "p_expected_mode" "text", "p_message_text" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."glh_take_over_conversation"("p_conversation_id" "uuid", "p_lead_id" "uuid", "p_expected_mode" "text", "p_expected_lead_version" integer, "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_lead public.glh_leads%ROWTYPE;
  v_conversation public.glh_conversations%ROWTYPE;
  v_active_primary public.glh_assignments%ROWTYPE;
  v_assignment_changed BOOLEAN := false;
  v_blocked_ai_sends INTEGER := 0;
BEGIN
  SELECT *
  INTO v_actor
  FROM public.profiles
  WHERE user_id = auth.uid()
    AND is_active = true;

  IF NOT FOUND OR v_actor.role NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_expected_mode NOT IN ('AI_ACTIVE', 'HANDOFF_PENDING') THEN
    RAISE EXCEPTION 'INVALID_EXPECTED_MODE' USING ERRCODE = '22023';
  END IF;
  IF p_expected_lead_version IS NULL OR p_expected_lead_version < 1 THEN
    RAISE EXCEPTION 'INVALID_EXPECTED_VERSION' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_lead
  FROM public.glh_leads
  WHERE id = p_lead_id
    AND org_id = v_actor.org_id
  FOR UPDATE;

  IF NOT FOUND OR NOT (
    v_actor.role IN ('admin', 'manager')
    OR v_lead.owner_profile_id = v_actor.id
    OR EXISTS (
      SELECT 1
      FROM public.glh_assignments a
      WHERE a.org_id = v_actor.org_id
        AND a.lead_id = v_lead.id
        AND a.assignee_profile_id = v_actor.id
        AND a.status = 'ACTIVE'
    )
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF v_lead.version <> p_expected_lead_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;

  SELECT *
  INTO v_conversation
  FROM public.glh_conversations
  WHERE id = p_conversation_id
    AND org_id = v_actor.org_id
    AND lead_id = v_lead.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF v_conversation.conversation_mode <> p_expected_mode
     OR v_lead.conversation_mode <> p_expected_mode THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;

  SELECT *
  INTO v_active_primary
  FROM public.glh_assignments
  WHERE org_id = v_actor.org_id
    AND lead_id = v_lead.id
    AND assignment_type = 'PRIMARY'
    AND status = 'ACTIVE'
  FOR UPDATE;

  IF NOT FOUND OR v_active_primary.assignee_profile_id <> v_actor.id THEN
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
      v_actor.org_id, v_lead.id, v_actor.id, 'PRIMARY',
      v_actor.id, 'ACTIVE',
      COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), 'Human takeover')
    );
    v_assignment_changed := true;
  END IF;

  UPDATE public.glh_leads
  SET owner_profile_id = v_actor.id,
      conversation_mode = 'HUMAN_ACTIVE',
      version = version + 1,
      updated_at = NOW()
  WHERE id = v_lead.id
    AND org_id = v_actor.org_id;

  UPDATE public.glh_conversations
  SET assigned_profile_id = v_actor.id,
      conversation_mode = 'HUMAN_ACTIVE',
      version = version + 1,
      updated_at = NOW()
  WHERE id = v_conversation.id
    AND org_id = v_actor.org_id;

  UPDATE public.glh_ai_actions
  SET status = 'BLOCKED',
      delivery_status = 'BLOCKED',
      error_metadata = COALESCE(error_metadata, '{}'::JSONB)
        || jsonb_build_object(
          'reason', 'HUMAN_TAKEOVER',
          'blocked_at', NOW(),
          'actor_profile_id', v_actor.id
        ),
      completed_at = COALESCE(completed_at, NOW())
  WHERE org_id = v_actor.org_id
    AND lead_id = v_lead.id
    AND conversation_id = v_conversation.id
    AND action_type = 'AI_SEND'
    AND status = 'PENDING';
  GET DIAGNOSTICS v_blocked_ai_sends = ROW_COUNT;

  INSERT INTO public.glh_audit_events (
    org_id, lead_id, actor_profile_id, actor_kind, event_type,
    entity_type, entity_id, previous_state, next_state, reason, context
  ) VALUES (
    v_actor.org_id, v_lead.id, v_actor.id, 'HUMAN', 'HUMAN_HANDOFF',
    'glh_conversations', v_conversation.id,
    p_expected_mode, 'HUMAN_ACTIVE',
    NULLIF(btrim(COALESCE(p_reason, '')), ''),
    jsonb_build_object(
      'previous_owner_profile_id', v_lead.owner_profile_id,
      'owner_profile_id', v_actor.id,
      'assignment_changed', v_assignment_changed,
      'blocked_ai_sends', v_blocked_ai_sends,
      'customer_facing_auto_send_allowed', false
    )
  );

  RETURN jsonb_build_object(
    'conversation_id', v_conversation.id,
    'lead_id', v_lead.id,
    'conversation_mode', 'HUMAN_ACTIVE',
    'owner_profile_id', v_actor.id,
    'lead_version', v_lead.version + 1,
    'conversation_version', v_conversation.version + 1,
    'assignment_changed', v_assignment_changed,
    'blocked_ai_sends', v_blocked_ai_sends,
    'customer_facing_auto_send_allowed', false
  );
END;
$$;


ALTER FUNCTION "public"."glh_take_over_conversation"("p_conversation_id" "uuid", "p_lead_id" "uuid", "p_expected_mode" "text", "p_expected_lead_version" integer, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."organizations_protect_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'organizations.id and organizations.created_at are immutable';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."organizations_protect_immutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_action_cancel"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_action_row public.review_actions%ROWTYPE;
  v_reason TEXT;
  v_old_status TEXT;
  v_old_cancelled_at TIMESTAMPTZ;
  v_old_cancel_reason TEXT;
  v_old_completed_at TIMESTAMPTZ;
  v_old_verified_by_profile_id UUID;
  v_old_verified_at TIMESTAMPTZ;
  v_old_version INTEGER;
  v_data JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF v_actor_role IS NULL OR v_actor_role = 'viewer' THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  IF v_review_row.status NOT IN ('draft', 'submitted') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改改善行动');
  END IF;

  SELECT ra.* INTO v_action_row
    FROM public.review_actions ra
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Action not found');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR (
          v_review_row.pmo_id IS NOT NULL
          AND v_review_row.pmo_id = v_actor_profile_id
        )
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_action_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_action_row.status NOT IN ('OPEN', 'IN_PROGRESS', 'PENDING_VERIFICATION') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许取消');
  END IF;

  v_reason := btrim(p_reason);
  IF v_reason IS NULL OR v_reason = '' OR char_length(v_reason) > 1000 THEN
    RETURN public.review_rpc_error('INVALID_REASON', '取消原因必须是非空文本且不超过1000字符');
  END IF;

  v_old_status := v_action_row.status;
  v_old_cancelled_at := v_action_row.cancelled_at;
  v_old_cancel_reason := v_action_row.cancel_reason;
  v_old_completed_at := v_action_row.completed_at;
  v_old_verified_by_profile_id := v_action_row.verified_by_profile_id;
  v_old_verified_at := v_action_row.verified_at;
  v_old_version := v_action_row.version;

  UPDATE public.review_actions ra
    SET status = 'CANCELLED',
        cancelled_at = NOW(),
        cancel_reason = v_reason,
        completed_at = NULL,
        verified_by_profile_id = NULL,
        verified_at = NULL,
        version = ra.version + 1,
        updated_at = NOW()
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    RETURNING * INTO v_action_row;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'ACTION',
    v_action_row.id,
    'ACTION_CANCELLED',
    jsonb_build_object(
      'status', jsonb_build_object('before', v_old_status, 'after', 'CANCELLED'),
      'cancelled_at', jsonb_build_object('before', v_old_cancelled_at, 'after', v_action_row.cancelled_at),
      'cancel_reason', jsonb_build_object('before', v_old_cancel_reason, 'after', v_action_row.cancel_reason),
      'completed_at', jsonb_build_object('before', v_old_completed_at, 'after', v_action_row.completed_at),
      'verified_by_profile_id', jsonb_build_object('before', v_old_verified_by_profile_id, 'after', v_action_row.verified_by_profile_id),
      'verified_at', jsonb_build_object('before', v_old_verified_at, 'after', v_action_row.verified_at)
    ),
    v_old_version,
    v_action_row.version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'ACTION_CANCELLED',
    v_actor_profile_id,
    jsonb_build_object(
      'action_id', v_action_row.id,
      'sequence', v_action_row.sequence,
      'title', v_action_row.title
    ),
    v_action_row.version
  );

  v_data := jsonb_build_object(
    'id', v_action_row.id,
    'review_id', v_action_row.review_id,
    'sequence', v_action_row.sequence,
    'status', v_action_row.status,
    'version', v_action_row.version,
    'updated_at', v_action_row.updated_at,
    'completed_at', v_action_row.completed_at,
    'verified_at', v_action_row.verified_at,
    'cancelled_at', v_action_row.cancelled_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', v_data
  );
END;
$$;


ALTER FUNCTION "public"."review_action_cancel"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_action_create"("p_review_id" "uuid", "p_title" "text", "p_description" "text", "p_action_type" "text", "p_owner_profile_id" "uuid", "p_due_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_owner_row public.profiles%ROWTYPE;
  v_title TEXT;
  v_description TEXT;
  v_sequence INTEGER;
  v_action_row public.review_actions%ROWTYPE;
  v_data JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF v_actor_role IS NULL OR v_actor_role = 'viewer' THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  IF v_review_row.status NOT IN ('draft', 'submitted') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改改善行动');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR (
          v_review_row.pmo_id IS NOT NULL
          AND v_review_row.pmo_id = v_actor_profile_id
        )
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  v_title := btrim(p_title);
  IF v_title IS NULL OR v_title = '' OR char_length(v_title) > 200 THEN
    RETURN public.review_rpc_error('INVALID_INPUT', 'title 必须是非空文本且不超过200字符');
  END IF;

  IF p_description IS NULL THEN
    v_description := NULL;
  ELSE
    v_description := btrim(p_description);
    IF v_description IS NULL OR v_description = '' OR char_length(v_description) > 5000 THEN
      RETURN public.review_rpc_error('INVALID_INPUT', 'description 格式无效');
    END IF;
  END IF;

  IF p_action_type IS NULL OR p_action_type NOT IN ('IMMEDIATE', 'CORRECTIVE', 'PREVENTIVE') THEN
    RETURN public.review_rpc_error('INVALID_INPUT', 'action_type 必须为 IMMEDIATE/CORRECTIVE/PREVENTIVE');
  END IF;

  IF p_owner_profile_id IS NULL THEN
    RETURN public.review_rpc_error('INVALID_OWNER', '负责人不能为空');
  END IF;
  IF p_due_date IS NULL THEN
    RETURN public.review_rpc_error('INVALID_INPUT', '截止日期不能为空');
  END IF;

  SELECT po.* INTO v_owner_row
    FROM public.profiles po
    WHERE po.id = p_owner_profile_id
      AND po.org_id = v_actor_org_id
      AND po.is_active = true;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('INVALID_OWNER', '负责人必须 active、同 org 且非 viewer');
  END IF;
  IF v_owner_row.role IS NULL OR v_owner_row.role NOT IN ('admin', 'manager', 'operator', 'sales') THEN
    RETURN public.review_rpc_error('INVALID_OWNER', '负责人必须 active、同 org 且非 viewer');
  END IF;

  SELECT COALESCE(MAX(ra.sequence), 0) + 1
    INTO v_sequence
    FROM public.review_actions ra
    WHERE ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id;

  INSERT INTO public.review_actions (
    org_id,
    review_id,
    sequence,
    title,
    description,
    action_type,
    owner_profile_id,
    due_date,
    status,
    completion_note,
    verification_note,
    verified_by_profile_id,
    verified_at,
    completed_at,
    cancelled_at,
    cancel_reason,
    created_by_profile_id,
    version,
    created_at,
    updated_at
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_sequence,
    v_title,
    v_description,
    p_action_type,
    v_owner_row.id,
    p_due_date,
    'OPEN',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    v_actor_profile_id,
    1,
    NOW(),
    NOW()
  )
  RETURNING * INTO v_action_row;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'ACTION',
    v_action_row.id,
    'ACTION_CREATED',
    jsonb_build_object(
      'sequence', v_action_row.sequence,
      'title', v_action_row.title,
      'description', v_action_row.description,
      'action_type', v_action_row.action_type,
      'owner_profile_id', v_action_row.owner_profile_id,
      'due_date', v_action_row.due_date,
      'status', v_action_row.status
    ),
    NULL,
    1
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'ACTION_CREATED',
    v_actor_profile_id,
    jsonb_build_object(
      'action_id', v_action_row.id,
      'sequence', v_action_row.sequence,
      'title', v_action_row.title
    ),
    1
  );

  v_data := jsonb_build_object(
    'id', v_action_row.id,
    'review_id', v_action_row.review_id,
    'sequence', v_action_row.sequence,
    'status', v_action_row.status,
    'version', v_action_row.version,
    'updated_at', v_action_row.updated_at,
    'completed_at', v_action_row.completed_at,
    'verified_at', v_action_row.verified_at,
    'cancelled_at', v_action_row.cancelled_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', v_data
  );
END;
$$;


ALTER FUNCTION "public"."review_action_create"("p_review_id" "uuid", "p_title" "text", "p_description" "text", "p_action_type" "text", "p_owner_profile_id" "uuid", "p_due_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_action_return"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_action_row public.review_actions%ROWTYPE;
  v_reason TEXT;
  v_old_status TEXT;
  v_old_verification_note TEXT;
  v_old_completed_at TIMESTAMPTZ;
  v_old_verified_by_profile_id UUID;
  v_old_verified_at TIMESTAMPTZ;
  v_old_version INTEGER;
  v_data JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF v_actor_role IS NULL OR v_actor_role = 'viewer' THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  IF v_review_row.status NOT IN ('draft', 'submitted') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改改善行动');
  END IF;

  SELECT ra.* INTO v_action_row
    FROM public.review_actions ra
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Action not found');
  END IF;

  IF v_actor_profile_id = v_action_row.owner_profile_id THEN
    RETURN public.review_rpc_error('SELF_VERIFICATION_FORBIDDEN', '负责人不能退回自己的行动');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR (
          v_review_row.pmo_id IS NOT NULL
          AND v_review_row.pmo_id = v_actor_profile_id
        )
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_action_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_action_row.status <> 'PENDING_VERIFICATION' THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许退回');
  END IF;

  v_reason := btrim(p_reason);
  IF v_reason IS NULL OR v_reason = '' OR char_length(v_reason) > 5000 THEN
    RETURN public.review_rpc_error('INVALID_REASON', '退回原因必须是非空文本且不超过5000字符');
  END IF;

  v_old_status := v_action_row.status;
  v_old_verification_note := v_action_row.verification_note;
  v_old_completed_at := v_action_row.completed_at;
  v_old_verified_by_profile_id := v_action_row.verified_by_profile_id;
  v_old_verified_at := v_action_row.verified_at;
  v_old_version := v_action_row.version;

  UPDATE public.review_actions ra
    SET status = 'IN_PROGRESS',
        verification_note = v_reason,
        completed_at = NULL,
        verified_by_profile_id = NULL,
        verified_at = NULL,
        version = ra.version + 1,
        updated_at = NOW()
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    RETURNING * INTO v_action_row;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'ACTION',
    v_action_row.id,
    'ACTION_RETURNED',
    jsonb_build_object(
      'status', jsonb_build_object('before', v_old_status, 'after', 'IN_PROGRESS'),
      'verification_note', jsonb_build_object('before', v_old_verification_note, 'after', v_reason),
      'completed_at', jsonb_build_object('before', v_old_completed_at, 'after', v_action_row.completed_at),
      'verified_by_profile_id', jsonb_build_object('before', v_old_verified_by_profile_id, 'after', v_action_row.verified_by_profile_id),
      'verified_at', jsonb_build_object('before', v_old_verified_at, 'after', v_action_row.verified_at)
    ),
    v_old_version,
    v_action_row.version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'ACTION_RETURNED',
    v_actor_profile_id,
    jsonb_build_object(
      'action_id', v_action_row.id,
      'sequence', v_action_row.sequence,
      'title', v_action_row.title
    ),
    v_action_row.version
  );

  v_data := jsonb_build_object(
    'id', v_action_row.id,
    'review_id', v_action_row.review_id,
    'sequence', v_action_row.sequence,
    'status', v_action_row.status,
    'version', v_action_row.version,
    'updated_at', v_action_row.updated_at,
    'completed_at', v_action_row.completed_at,
    'verified_at', v_action_row.verified_at,
    'cancelled_at', v_action_row.cancelled_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', v_data
  );
END;
$$;


ALTER FUNCTION "public"."review_action_return"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_action_start"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_action_row public.review_actions%ROWTYPE;
  v_old_version INTEGER;
  v_data JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF v_actor_role IS NULL OR v_actor_role = 'viewer' THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  IF v_review_row.status NOT IN ('draft', 'submitted') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改改善行动');
  END IF;

  SELECT ra.* INTO v_action_row
    FROM public.review_actions ra
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Action not found');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND v_action_row.owner_profile_id = v_actor_profile_id
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_action_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_action_row.status <> 'OPEN' THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许开始行动');
  END IF;

  v_old_version := v_action_row.version;

  UPDATE public.review_actions ra
    SET status = 'IN_PROGRESS',
        version = ra.version + 1,
        updated_at = NOW()
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    RETURNING * INTO v_action_row;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'ACTION',
    v_action_row.id,
    'ACTION_STARTED',
    jsonb_build_object(
      'status', jsonb_build_object('before', 'OPEN', 'after', 'IN_PROGRESS')
    ),
    v_old_version,
    v_action_row.version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'ACTION_STARTED',
    v_actor_profile_id,
    jsonb_build_object(
      'action_id', v_action_row.id,
      'sequence', v_action_row.sequence,
      'title', v_action_row.title
    ),
    v_action_row.version
  );

  v_data := jsonb_build_object(
    'id', v_action_row.id,
    'review_id', v_action_row.review_id,
    'sequence', v_action_row.sequence,
    'status', v_action_row.status,
    'version', v_action_row.version,
    'updated_at', v_action_row.updated_at,
    'completed_at', v_action_row.completed_at,
    'verified_at', v_action_row.verified_at,
    'cancelled_at', v_action_row.cancelled_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', v_data
  );
END;
$$;


ALTER FUNCTION "public"."review_action_start"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_action_submit_for_verification"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_completion_note" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_action_row public.review_actions%ROWTYPE;
  v_completion_note TEXT;
  v_old_status TEXT;
  v_old_completion_note TEXT;
  v_old_completed_at TIMESTAMPTZ;
  v_old_version INTEGER;
  v_data JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF v_actor_role IS NULL OR v_actor_role = 'viewer' THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  IF v_review_row.status NOT IN ('draft', 'submitted') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改改善行动');
  END IF;

  SELECT ra.* INTO v_action_row
    FROM public.review_actions ra
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Action not found');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND v_action_row.owner_profile_id = v_actor_profile_id
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_action_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_action_row.status NOT IN ('OPEN', 'IN_PROGRESS') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许提交验证');
  END IF;

  v_completion_note := btrim(p_completion_note);
  IF v_completion_note IS NULL OR v_completion_note = '' OR char_length(v_completion_note) > 5000 THEN
    RETURN public.review_rpc_error('INVALID_INPUT', '完成说明必须是非空文本且不超过5000字符');
  END IF;

  v_old_status := v_action_row.status;
  v_old_completion_note := v_action_row.completion_note;
  v_old_completed_at := v_action_row.completed_at;
  v_old_version := v_action_row.version;

  UPDATE public.review_actions ra
    SET status = 'PENDING_VERIFICATION',
        completion_note = v_completion_note,
        completed_at = NOW(),
        version = ra.version + 1,
        updated_at = NOW()
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    RETURNING * INTO v_action_row;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'ACTION',
    v_action_row.id,
    'ACTION_SUBMITTED_FOR_VERIFICATION',
    jsonb_build_object(
      'status', jsonb_build_object('before', v_old_status, 'after', 'PENDING_VERIFICATION'),
      'completion_note', jsonb_build_object('before', v_old_completion_note, 'after', v_completion_note),
      'completed_at', jsonb_build_object('before', v_old_completed_at, 'after', v_action_row.completed_at)
    ),
    v_old_version,
    v_action_row.version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'ACTION_SUBMITTED_FOR_VERIFICATION',
    v_actor_profile_id,
    jsonb_build_object(
      'action_id', v_action_row.id,
      'sequence', v_action_row.sequence,
      'title', v_action_row.title
    ),
    v_action_row.version
  );

  v_data := jsonb_build_object(
    'id', v_action_row.id,
    'review_id', v_action_row.review_id,
    'sequence', v_action_row.sequence,
    'status', v_action_row.status,
    'version', v_action_row.version,
    'updated_at', v_action_row.updated_at,
    'completed_at', v_action_row.completed_at,
    'verified_at', v_action_row.verified_at,
    'cancelled_at', v_action_row.cancelled_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', v_data
  );
END;
$$;


ALTER FUNCTION "public"."review_action_submit_for_verification"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_completion_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_action_update"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_title" "text", "p_description" "text", "p_action_type" "text", "p_owner_profile_id" "uuid", "p_due_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_action_row public.review_actions%ROWTYPE;
  v_owner_row public.profiles%ROWTYPE;
  v_title TEXT;
  v_description TEXT;
  v_old_version INTEGER;
  v_changes JSONB := '{}'::jsonb;
  v_changed_fields JSONB := '[]'::jsonb;
  v_data JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF v_actor_role IS NULL OR v_actor_role = 'viewer' THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  IF v_review_row.status NOT IN ('draft', 'submitted') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改改善行动');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR (
          v_review_row.pmo_id IS NOT NULL
          AND v_review_row.pmo_id = v_actor_profile_id
        )
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  v_title := btrim(p_title);
  IF v_title IS NULL OR v_title = '' OR char_length(v_title) > 200 THEN
    RETURN public.review_rpc_error('INVALID_INPUT', 'title 必须是非空文本且不超过200字符');
  END IF;

  IF p_description IS NULL THEN
    v_description := NULL;
  ELSE
    v_description := btrim(p_description);
    IF v_description IS NULL OR v_description = '' OR char_length(v_description) > 5000 THEN
      RETURN public.review_rpc_error('INVALID_INPUT', 'description 格式无效');
    END IF;
  END IF;

  IF p_action_type IS NULL OR p_action_type NOT IN ('IMMEDIATE', 'CORRECTIVE', 'PREVENTIVE') THEN
    RETURN public.review_rpc_error('INVALID_INPUT', 'action_type 必须为 IMMEDIATE/CORRECTIVE/PREVENTIVE');
  END IF;

  IF p_owner_profile_id IS NULL THEN
    RETURN public.review_rpc_error('INVALID_OWNER', '负责人不能为空');
  END IF;
  IF p_due_date IS NULL THEN
    RETURN public.review_rpc_error('INVALID_INPUT', '截止日期不能为空');
  END IF;

  SELECT po.* INTO v_owner_row
    FROM public.profiles po
    WHERE po.id = p_owner_profile_id
      AND po.org_id = v_actor_org_id
      AND po.is_active = true;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('INVALID_OWNER', '负责人必须 active、同 org 且非 viewer');
  END IF;
  IF v_owner_row.role IS NULL OR v_owner_row.role NOT IN ('admin', 'manager', 'operator', 'sales') THEN
    RETURN public.review_rpc_error('INVALID_OWNER', '负责人必须 active、同 org 且非 viewer');
  END IF;

  SELECT ra.* INTO v_action_row
    FROM public.review_actions ra
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Action not found');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_action_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_action_row.status NOT IN ('OPEN', 'IN_PROGRESS') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改行动定义');
  END IF;

  IF v_title = v_action_row.title
     AND v_description IS NOT DISTINCT FROM v_action_row.description
     AND p_action_type = v_action_row.action_type
     AND v_owner_row.id = v_action_row.owner_profile_id
     AND p_due_date = v_action_row.due_date THEN
    v_data := jsonb_build_object(
      'id', v_action_row.id,
      'review_id', v_action_row.review_id,
      'sequence', v_action_row.sequence,
      'status', v_action_row.status,
      'version', v_action_row.version,
      'updated_at', v_action_row.updated_at,
      'completed_at', v_action_row.completed_at,
      'verified_at', v_action_row.verified_at,
      'cancelled_at', v_action_row.cancelled_at
    );
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', v_data
    );
  END IF;

  IF v_title IS DISTINCT FROM v_action_row.title THEN
    v_changes := v_changes || jsonb_build_object(
      'title', jsonb_build_object('before', v_action_row.title, 'after', v_title)
    );
    v_changed_fields := v_changed_fields || jsonb_build_array('title');
  END IF;
  IF v_description IS DISTINCT FROM v_action_row.description THEN
    v_changes := v_changes || jsonb_build_object(
      'description', jsonb_build_object('before', v_action_row.description, 'after', v_description)
    );
    v_changed_fields := v_changed_fields || jsonb_build_array('description');
  END IF;
  IF p_action_type IS DISTINCT FROM v_action_row.action_type THEN
    v_changes := v_changes || jsonb_build_object(
      'action_type', jsonb_build_object('before', v_action_row.action_type, 'after', p_action_type)
    );
    v_changed_fields := v_changed_fields || jsonb_build_array('action_type');
  END IF;
  IF v_owner_row.id IS DISTINCT FROM v_action_row.owner_profile_id THEN
    v_changes := v_changes || jsonb_build_object(
      'owner_profile_id', jsonb_build_object('before', v_action_row.owner_profile_id, 'after', v_owner_row.id)
    );
    v_changed_fields := v_changed_fields || jsonb_build_array('owner_profile_id');
  END IF;
  IF p_due_date IS DISTINCT FROM v_action_row.due_date THEN
    v_changes := v_changes || jsonb_build_object(
      'due_date', jsonb_build_object('before', v_action_row.due_date, 'after', p_due_date)
    );
    v_changed_fields := v_changed_fields || jsonb_build_array('due_date');
  END IF;

  v_old_version := v_action_row.version;

  UPDATE public.review_actions ra
    SET title = v_title,
        description = v_description,
        action_type = p_action_type,
        owner_profile_id = v_owner_row.id,
        due_date = p_due_date,
        version = ra.version + 1,
        updated_at = NOW()
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    RETURNING * INTO v_action_row;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'ACTION',
    v_action_row.id,
    'ACTION_UPDATED',
    v_changes,
    v_old_version,
    v_action_row.version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'ACTION_UPDATED',
    v_actor_profile_id,
    jsonb_build_object(
      'action_id', v_action_row.id,
      'sequence', v_action_row.sequence,
      'title', v_action_row.title,
      'changed_fields', v_changed_fields
    ),
    v_action_row.version
  );

  v_data := jsonb_build_object(
    'id', v_action_row.id,
    'review_id', v_action_row.review_id,
    'sequence', v_action_row.sequence,
    'status', v_action_row.status,
    'version', v_action_row.version,
    'updated_at', v_action_row.updated_at,
    'completed_at', v_action_row.completed_at,
    'verified_at', v_action_row.verified_at,
    'cancelled_at', v_action_row.cancelled_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', v_data
  );
END;
$$;


ALTER FUNCTION "public"."review_action_update"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_title" "text", "p_description" "text", "p_action_type" "text", "p_owner_profile_id" "uuid", "p_due_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_action_verify"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_verification_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_action_row public.review_actions%ROWTYPE;
  v_verification_note TEXT;
  v_old_status TEXT;
  v_old_verification_note TEXT;
  v_old_verified_by_profile_id UUID;
  v_old_verified_at TIMESTAMPTZ;
  v_old_version INTEGER;
  v_data JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF v_actor_role IS NULL OR v_actor_role = 'viewer' THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  IF v_review_row.status NOT IN ('draft', 'submitted') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改改善行动');
  END IF;

  SELECT ra.* INTO v_action_row
    FROM public.review_actions ra
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Action not found');
  END IF;

  IF v_actor_profile_id = v_action_row.owner_profile_id THEN
    RETURN public.review_rpc_error('SELF_VERIFICATION_FORBIDDEN', '负责人不能验证自己的行动');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR (
          v_review_row.pmo_id IS NOT NULL
          AND v_review_row.pmo_id = v_actor_profile_id
        )
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_action_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_action_row.status <> 'PENDING_VERIFICATION' THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许验证');
  END IF;

  IF p_verification_note IS NULL THEN
    v_verification_note := NULL;
  ELSE
    v_verification_note := btrim(p_verification_note);
    IF v_verification_note = '' THEN
      v_verification_note := NULL;
    ELSIF char_length(v_verification_note) > 5000 THEN
      RETURN public.review_rpc_error('INVALID_INPUT', '验证反馈不能超过5000字符');
    END IF;
  END IF;

  v_old_status := v_action_row.status;
  v_old_verification_note := v_action_row.verification_note;
  v_old_verified_by_profile_id := v_action_row.verified_by_profile_id;
  v_old_verified_at := v_action_row.verified_at;
  v_old_version := v_action_row.version;

  UPDATE public.review_actions ra
    SET status = 'VERIFIED',
        verification_note = v_verification_note,
        verified_by_profile_id = v_actor_profile_id,
        verified_at = NOW(),
        version = ra.version + 1,
        updated_at = NOW()
    WHERE ra.id = p_action_id
      AND ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
    RETURNING * INTO v_action_row;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'ACTION',
    v_action_row.id,
    'ACTION_VERIFIED',
    jsonb_build_object(
      'status', jsonb_build_object('before', v_old_status, 'after', 'VERIFIED'),
      'verification_note', jsonb_build_object('before', v_old_verification_note, 'after', v_verification_note),
      'verified_by_profile_id', jsonb_build_object('before', v_old_verified_by_profile_id, 'after', v_action_row.verified_by_profile_id),
      'verified_at', jsonb_build_object('before', v_old_verified_at, 'after', v_action_row.verified_at)
    ),
    v_old_version,
    v_action_row.version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'ACTION_VERIFIED',
    v_actor_profile_id,
    jsonb_build_object(
      'action_id', v_action_row.id,
      'sequence', v_action_row.sequence,
      'title', v_action_row.title
    ),
    v_action_row.version
  );

  v_data := jsonb_build_object(
    'id', v_action_row.id,
    'review_id', v_action_row.review_id,
    'sequence', v_action_row.sequence,
    'status', v_action_row.status,
    'version', v_action_row.version,
    'updated_at', v_action_row.updated_at,
    'completed_at', v_action_row.completed_at,
    'verified_at', v_action_row.verified_at,
    'cancelled_at', v_action_row.cancelled_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', v_data
  );
END;
$$;


ALTER FUNCTION "public"."review_action_verify"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_verification_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_add_member"("p_review_id" "uuid", "p_expected_version" integer, "p_profile_id" "uuid", "p_member_role" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_member_row public.review_members%ROWTYPE;
  v_member_active BOOLEAN;
  v_new_version INTEGER;
  v_changes JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_review_row.status <> 'draft' THEN
    RETURN public.review_rpc_error('DRAFT_ONLY', '仅草稿可编辑');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR v_review_row.pmo_id = v_actor_profile_id
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无成员管理权限');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF p_profile_id IS NULL THEN
    RETURN public.review_rpc_error('INVALID_MEMBER', '成员档案无效');
  END IF;

  IF p_member_role IS NULL OR p_member_role NOT IN (
    'TECH_PROCESS',
    'DESIGN_PLATE',
    'PRODUCTION',
    'QUALITY',
    'EXPERT_REVIEWER',
    'OTHER'
  ) THEN
    RETURN public.review_rpc_error('INVALID_MEMBER', '成员角色无效');
  END IF;

  SELECT p.is_active INTO v_member_active
    FROM public.profiles p
    WHERE p.id = p_profile_id
      AND p.org_id = v_actor_org_id;
  IF NOT FOUND OR NOT v_member_active THEN
    RETURN public.review_rpc_error('INVALID_MEMBER', '成员必须 active 且同 org');
  END IF;

  BEGIN
    INSERT INTO public.review_members (
      org_id,
      review_id,
      profile_id,
      member_role,
      is_primary,
      created_by
    )
    VALUES (
      v_actor_org_id,
      p_review_id,
      p_profile_id,
      p_member_role,
      false,
      v_actor_profile_id
    )
    RETURNING * INTO v_member_row;
  EXCEPTION WHEN unique_violation THEN
    RETURN public.review_rpc_error('UNIQUE_CONFLICT', '该成员角色已存在');
  END;

  UPDATE public.review_cases rc
    SET version = rc.version + 1
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING version INTO v_new_version;

  v_changes := jsonb_build_object(
    'member_id', v_member_row.id,
    'profile_id', v_member_row.profile_id,
    'member_role', v_member_row.member_role,
    'is_primary', v_member_row.is_primary
  );

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'MEMBER',
    v_member_row.id,
    'MEMBER_ADDED',
    v_changes,
    v_review_row.version,
    v_new_version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'MEMBER_ADDED',
    v_actor_profile_id,
    v_changes,
    v_new_version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'member', to_jsonb(v_member_row),
      'version', v_new_version
    )
  );
END;
$$;


ALTER FUNCTION "public"."review_add_member"("p_review_id" "uuid", "p_expected_version" integer, "p_profile_id" "uuid", "p_member_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_case_admin_detail"("p_case_no" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  v_case_id UUID;
  v_case_status TEXT;
  v_version INTEGER;
  v_source_review_id UUID;
  v_source_status TEXT;
  v_source_version INTEGER;
  v_case_source_version INTEGER;
  v_source_review_no TEXT;
  v_published_at TIMESTAMPTZ;
  v_hidden_at TIMESTAMPTZ;
  v_hidden_reason TEXT;
  v_title TEXT;
  v_summary TEXT;
  v_lesson TEXT;
  v_prevention TEXT;
  v_applicability TEXT;
  v_review_type_snapshot TEXT;
  v_risk_snapshot TEXT;
  v_occurred_at_snapshot TIMESTAMPTZ;
  v_is_stale BOOLEAN;
  v_reasons TEXT[] := '{}'::TEXT[];
  v_source_changed BOOLEAN;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无权执行');
  END IF;
  IF p_case_no IS NULL OR p_case_no !~ '^CASE-[0-9]{4}-[0-9]{6}$' THEN
    RETURN public.review_rpc_error('INVALID_CASE', '案例编号无效');
  END IF;

  SELECT c.id, c.status, c.version, c.source_review_id, c.source_review_version,
         c.published_at, c.hidden_at, c.hidden_reason, c.title, c.summary,
         c.lesson_summary, c.prevention_summary, c.applicability_notes,
         c.review_type_snapshot, c.risk_level_snapshot, c.occurred_at_snapshot,
         rc.status AS source_status, rc.version AS source_version,
         rc.review_no AS source_review_no
    INTO v_case_id, v_case_status, v_version, v_source_review_id, v_case_source_version,
         v_published_at, v_hidden_at, v_hidden_reason, v_title, v_summary,
         v_lesson, v_prevention, v_applicability,
         v_review_type_snapshot, v_risk_snapshot, v_occurred_at_snapshot,
         v_source_status, v_source_version, v_source_review_no
    FROM public.review_knowledge_cases c
    LEFT JOIN public.review_cases rc
      ON rc.id = c.source_review_id
     AND rc.org_id = c.org_id
   WHERE c.org_id = v_org_id
     AND c.case_no = p_case_no;

  IF v_case_id IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '案例不存在');
  END IF;

  v_source_changed := v_source_version IS DISTINCT FROM v_case_source_version;
  IF v_case_status = 'PUBLISHED' THEN
    IF v_source_status <> 'closed' THEN
      v_is_stale := TRUE;
      v_reasons := array_append(v_reasons, 'SOURCE_NOT_CLOSED');
    END IF;
    IF v_source_changed THEN
      v_is_stale := TRUE;
      v_reasons := array_append(v_reasons, 'SOURCE_VERSION_CHANGED');
    END IF;
    v_is_stale := COALESCE(v_is_stale, FALSE);
  ELSE
    v_is_stale := FALSE;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'id', v_case_id,
      'caseNo', p_case_no,
      'status', v_case_status,
      'version', v_version,
      'title', v_title,
      'summary', v_summary,
      'lessonSummary', v_lesson,
      'preventionSummary', v_prevention,
      'applicabilityNotes', v_applicability,
      'reviewTypeSnapshot', v_review_type_snapshot,
      'riskSnapshot', v_risk_snapshot,
      'occurredAtSnapshot', v_occurred_at_snapshot,
      'publishedAt', v_published_at,
      'hiddenAt', v_hidden_at,
      'hiddenReason', v_hidden_reason,
      'sourceReviewId', v_source_review_id,
      'sourceReviewNo', v_source_review_no,
      'sourceCurrentStatus', v_source_status,
      'sourceCurrentVersion', v_source_version,
      'caseSourceReviewVersion', v_case_source_version,
      'sourceChangedSinceSnapshot', v_source_changed,
      'isStale', v_is_stale,
      'staleReasons', v_reasons,
      'currentSourceMetadata', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'metadataType', mi.metadata_type,
          'code', d.code,
          'label', d.label,
          'isPrimary', mi.is_primary
        ) ORDER BY mi.metadata_type, d.code)
        FROM public.review_metadata_items mi
        JOIN public.review_dict_items d
          ON d.id = mi.dict_item_id
         AND d.dict_type = mi.metadata_type
        WHERE mi.review_id = v_source_review_id
          AND mi.org_id = v_org_id
      ), '[]'::jsonb),
      'caseSnapshotMetadata', jsonb_build_object(
        'materials', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot, 'isPrimary', mi.is_primary) ORDER BY mi.is_primary DESC, mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = v_case_id AND mi.metadata_type = 'MATERIAL'), '[]'::jsonb),
        'processes', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = v_case_id AND mi.metadata_type = 'PROCESS'), '[]'::jsonb),
        'problemDomains', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = v_case_id AND mi.metadata_type = 'PROBLEM_DOMAIN'), '[]'::jsonb),
        'problemSymptoms', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = v_case_id AND mi.metadata_type = 'PROBLEM_SYMPTOM'), '[]'::jsonb)
      )
    )
  );
END;
$_$;


ALTER FUNCTION "public"."review_case_admin_detail"("p_case_no" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_case_allocate_number"("p_org_id" "uuid", "p_year" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_value INTEGER;
BEGIN
  INSERT INTO public.review_case_number_counters(org_id, year, last_value)
  VALUES (p_org_id, p_year, 1)
  ON CONFLICT (org_id, year)
  DO UPDATE SET last_value = public.review_case_number_counters.last_value + 1
  WHERE public.review_case_number_counters.last_value < 999999
  RETURNING last_value INTO v_value;

  IF v_value IS NULL THEN
    RETURN public.review_rpc_error('CASE_NUMBER_EXHAUSTED', '编号已用尽');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'caseNo', 'CASE-' || p_year::text || '-' || lpad(v_value::text, 6, '0')
  );
END;
$$;


ALTER FUNCTION "public"."review_case_allocate_number"("p_org_id" "uuid", "p_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_case_audit"("p_case_id" "uuid", "p_limit" integer DEFAULT 30, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  v_total INTEGER;
  v_items JSONB := '[]'::jsonb;
  rec RECORD;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无权执行');
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 100000 THEN
    RETURN public.review_rpc_error('INVALID_CASE', '分页参数无效');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.review_knowledge_cases
    WHERE id = p_case_id AND org_id = v_org_id
  ) THEN
    RETURN public.review_rpc_error('NOT_FOUND', '案例不存在');
  END IF;

  SELECT COUNT(*) INTO v_total
    FROM public.review_case_audit_logs
   WHERE case_id = p_case_id
     AND org_id = v_org_id;

  FOR rec IN
    SELECT a.action, a.version_before, a.version_after, a.created_at, a.changes,
           COALESCE(NULLIF(btrim(p.full_name), ''), '未知用户') AS actor_name
      FROM public.review_case_audit_logs a
      LEFT JOIN public.profiles p
        ON p.id = a.actor_profile_id
       AND p.org_id = a.org_id
     WHERE a.case_id = p_case_id
       AND a.org_id = v_org_id
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT p_limit OFFSET p_offset
  LOOP
    v_items := v_items || jsonb_build_object(
      'action', rec.action,
      'versionBefore', rec.version_before,
      'versionAfter', rec.version_after,
      'actorDisplayName', rec.actor_name,
      'createdAt', rec.created_at,
      'safeChangeSummary', jsonb_build_object(
        'changedFields', rec.changes->'changedFields',
        'fromStatus', rec.changes->'fromStatus',
        'toStatus', rec.changes->'toStatus',
        'sourceReviewVersion', rec.changes->'sourceReviewVersion',
        'publishKind', rec.changes->'publishKind',
        'status', rec.changes->'status'
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'items', v_items,
      'limit', p_limit,
      'offset', p_offset,
      'hasMore', (p_offset + p_limit) < v_total
    )
  );
END;
$$;


ALTER FUNCTION "public"."review_case_audit"("p_case_id" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_case_candidates"("p_limit" integer DEFAULT 30, "p_offset" integer DEFAULT 0, "p_query" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  v_query TEXT;
  v_total INTEGER;
  v_items JSONB := '[]'::jsonb;
  rec RECORD;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无权执行');
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 100000 THEN
    RETURN public.review_rpc_error('INVALID_CASE', '分页参数无效');
  END IF;
  v_query := NULLIF(btrim(p_query), '');
  IF v_query IS NOT NULL AND length(v_query) > 200 THEN
    RETURN public.review_rpc_error('INVALID_CASE', '搜索内容过长');
  END IF;

  SELECT COUNT(*) INTO v_total
    FROM public.review_cases rc
   WHERE rc.org_id = v_org_id
     AND rc.status = 'closed'
     AND (v_query IS NULL OR POSITION(lower(v_query) IN lower(rc.review_no)) > 0);

  FOR rec IN
    SELECT rc.id AS source_review_id, rc.review_no, rc.review_type, rc.risk_level,
           rc.occurred_at, rc.version AS source_version,
           c.id AS existing_case_id, c.case_no AS existing_case_no,
           c.status AS existing_status, c.version AS existing_version,
           c.source_review_version AS case_source_version
      FROM public.review_cases rc
      LEFT JOIN public.review_knowledge_cases c
        ON c.org_id = rc.org_id
       AND c.source_review_id = rc.id
     WHERE rc.org_id = v_org_id
       AND rc.status = 'closed'
       AND (v_query IS NULL OR POSITION(lower(v_query) IN lower(rc.review_no)) > 0)
     ORDER BY rc.occurred_at DESC NULLS LAST, rc.review_no DESC
     LIMIT p_limit OFFSET p_offset
  LOOP
    v_items := v_items || jsonb_build_object(
      'sourceReviewId', rec.source_review_id,
      'reviewNo', rec.review_no,
      'reviewType', rec.review_type,
      'risk', rec.risk_level,
      'occurredAt', rec.occurred_at,
      'sourceVersion', rec.source_version,
      'metadataSummary', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'metadataType', mi.metadata_type,
          'code', d.code,
          'label', CASE WHEN d.code = 'OTHER' THEN '其他' ELSE d.label END,
          'isPrimary', mi.is_primary
        ) ORDER BY mi.metadata_type, d.code)
        FROM public.review_metadata_items mi
        JOIN public.review_dict_items d
          ON d.id = mi.dict_item_id
         AND d.dict_type = mi.metadata_type
        WHERE mi.review_id = rec.source_review_id
          AND mi.org_id = v_org_id
      ), '[]'::jsonb),
      'existingCase', CASE
        WHEN rec.existing_case_id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'id', rec.existing_case_id,
          'caseNo', rec.existing_case_no,
          'status', rec.existing_status,
          'version', rec.existing_version,
          'isSourceChanged', (rec.source_version IS DISTINCT FROM rec.case_source_version)
        )
      END
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'items', v_items,
      'limit', p_limit,
      'offset', p_offset,
      'hasMore', (p_offset + p_limit) < v_total
    )
  );
END;
$$;


ALTER FUNCTION "public"."review_case_candidates"("p_limit" integer, "p_offset" integer, "p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_case_create_from_review"("p_review_id" "uuid", "p_expected_review_version" integer, "p_title" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  v_review_status TEXT;
  v_review_version INTEGER;
  v_case_id UUID := gen_random_uuid();
  v_title TEXT;
  v_case_no TEXT;
  v_alloc JSONB;
  v_year INTEGER;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无权执行');
  END IF;

  SELECT status, version
    INTO v_review_status, v_review_version
    FROM public.review_cases
   WHERE id = p_review_id
     AND org_id = v_org_id
   FOR UPDATE;

  IF v_review_status IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;
  IF v_review_version IS DISTINCT FROM p_expected_review_version THEN
    RETURN public.review_rpc_error('SOURCE_VERSION_CONFLICT', '复盘版本已变化');
  END IF;
  IF v_review_status <> 'closed' THEN
    RETURN public.review_rpc_error('SOURCE_NOT_CLOSED', '复盘未关闭');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.review_knowledge_cases
    WHERE org_id = v_org_id AND source_review_id = p_review_id
  ) THEN
    RETURN public.review_rpc_error('ALREADY_EXISTS', '该复盘已有案例');
  END IF;

  v_title := NULLIF(btrim(p_title), '');
  IF v_title IS NULL OR length(v_title) > 200 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'CASE_CURATION_INCOMPLETE',
      'message', '案例标题不完整',
      'data', jsonb_build_object('missingFields', jsonb_build_array('TITLE'))
    );
  END IF;

  v_year := EXTRACT(YEAR FROM timezone('Asia/Shanghai', NOW()))::int;
  v_alloc := public.review_case_allocate_number(v_org_id, v_year);
  IF NOT COALESCE(v_alloc->>'ok', 'false') = 'true' THEN
    RETURN v_alloc;
  END IF;
  v_case_no := v_alloc->>'caseNo';

  INSERT INTO public.review_knowledge_cases (
    id, org_id, case_no, source_review_id, source_review_version,
    status, title, created_by_profile_id, version
  )
  VALUES (
    v_case_id, v_org_id, v_case_no, p_review_id, v_review_version,
    'DRAFT', v_title, v_actor_profile_id, 1
  );

  INSERT INTO public.review_case_audit_logs (
    org_id, case_id, actor_profile_id, action, changes,
    version_before, version_after
  )
  VALUES (
    v_org_id, v_case_id, v_actor_profile_id, 'CASE_CREATED',
    jsonb_build_object('status', 'DRAFT'), NULL, 1
  );

  RETURN public.review_case_safe_mutation_dto(v_case_id, v_org_id);
END;
$$;


ALTER FUNCTION "public"."review_case_create_from_review"("p_review_id" "uuid", "p_expected_review_version" integer, "p_title" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_case_detail"("p_case_no" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  rec RECORD;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF p_case_no IS NULL OR p_case_no !~ '^CASE-[0-9]{4}-[0-9]{6}$' THEN
    RETURN public.review_rpc_error('INVALID_CASE', '案例编号无效');
  END IF;

  SELECT c.id AS case_id, c.case_no, c.title, c.summary, c.lesson_summary, c.prevention_summary,
         c.applicability_notes, c.review_type_snapshot, c.risk_level_snapshot,
         c.occurred_at_snapshot, c.published_at,
         h.material_other_text, h.process_other_text,
         h.problem_domain_other_text, h.problem_symptom_other_text
    INTO rec
    FROM public.review_knowledge_cases c
    JOIN public.review_cases rc
      ON rc.id = c.source_review_id
     AND rc.org_id = c.org_id
    LEFT JOIN public.review_knowledge_case_metadata h
      ON h.case_id = c.id
     AND h.org_id = c.org_id
   WHERE c.org_id = v_org_id
     AND c.case_no = p_case_no
     AND c.status = 'PUBLISHED'
     AND rc.status = 'closed'
     AND rc.version = c.source_review_version;

  IF rec.case_no IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '案例不存在');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'caseNo', rec.case_no,
      'title', rec.title,
      'summary', rec.summary,
      'lessonSummary', rec.lesson_summary,
      'preventionSummary', rec.prevention_summary,
      'applicabilityNotes', rec.applicability_notes,
      'reviewType', rec.review_type_snapshot,
      'risk', rec.risk_level_snapshot,
      'occurredAt', rec.occurred_at_snapshot,
      'publishedAt', rec.published_at,
      'metadata', jsonb_build_object(
        'materials', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot, 'isPrimary', mi.is_primary) ORDER BY mi.is_primary DESC, mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = rec.case_id AND mi.metadata_type = 'MATERIAL'), '[]'::jsonb),
        'processes', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = rec.case_id AND mi.metadata_type = 'PROCESS'), '[]'::jsonb),
        'problemDomains', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = rec.case_id AND mi.metadata_type = 'PROBLEM_DOMAIN'), '[]'::jsonb),
        'problemSymptoms', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = rec.case_id AND mi.metadata_type = 'PROBLEM_SYMPTOM'), '[]'::jsonb),
        'materialOtherText', rec.material_other_text,
        'processOtherText', rec.process_other_text,
        'problemDomainOtherText', rec.problem_domain_other_text,
        'problemSymptomOtherText', rec.problem_symptom_other_text
      )
    )
  );
END;
$_$;


ALTER FUNCTION "public"."review_case_detail"("p_case_no" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_case_hide"("p_case_id" "uuid", "p_expected_version" integer, "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  v_case_status TEXT;
  v_version INTEGER;
  v_reason TEXT;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无权执行');
  END IF;

  SELECT status, version
    INTO v_case_status, v_version
    FROM public.review_knowledge_cases
   WHERE id = p_case_id
     AND org_id = v_org_id
   FOR UPDATE;

  IF v_case_status IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '案例不存在');
  END IF;
  IF v_version IS DISTINCT FROM p_expected_version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '案例版本已变化');
  END IF;
  IF v_case_status NOT IN ('DRAFT', 'PUBLISHED') THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许下架');
  END IF;

  v_reason := NULLIF(btrim(p_reason), '');
  IF v_reason IS NULL OR length(v_reason) > 1000 THEN
    RETURN public.review_rpc_error('INVALID_CASE', '下架原因无效');
  END IF;

  UPDATE public.review_knowledge_cases
     SET status = 'HIDDEN',
         hidden_by_profile_id = v_actor_profile_id,
         hidden_at = NOW(),
         hidden_reason = v_reason,
         version = version + 1,
         updated_at = NOW()
   WHERE id = p_case_id
     AND org_id = v_org_id;

  INSERT INTO public.review_case_audit_logs (
    org_id, case_id, actor_profile_id, action, changes,
    version_before, version_after
  )
  VALUES (
    v_org_id, p_case_id, v_actor_profile_id, 'CASE_HIDDEN',
    jsonb_build_object('fromStatus', v_case_status, 'toStatus', 'HIDDEN'),
    v_version, v_version + 1
  );

  RETURN public.review_case_safe_mutation_dto(p_case_id, v_org_id);
END;
$$;


ALTER FUNCTION "public"."review_case_hide"("p_case_id" "uuid", "p_expected_version" integer, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_case_library"("p_query" "text" DEFAULT NULL::"text", "p_material_codes" "text"[] DEFAULT NULL::"text"[], "p_process_codes" "text"[] DEFAULT NULL::"text"[], "p_problem_domain_codes" "text"[] DEFAULT NULL::"text"[], "p_problem_symptom_codes" "text"[] DEFAULT NULL::"text"[], "p_review_types" "text"[] DEFAULT NULL::"text"[], "p_risk_levels" "text"[] DEFAULT NULL::"text"[], "p_published_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_published_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_limit" integer DEFAULT 30, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  v_query TEXT;
  v_materials TEXT[] := COALESCE(p_material_codes, ARRAY[]::TEXT[]);
  v_processes TEXT[] := COALESCE(p_process_codes, ARRAY[]::TEXT[]);
  v_domains TEXT[] := COALESCE(p_problem_domain_codes, ARRAY[]::TEXT[]);
  v_symptoms TEXT[] := COALESCE(p_problem_symptom_codes, ARRAY[]::TEXT[]);
  v_types TEXT[] := COALESCE(p_review_types, ARRAY[]::TEXT[]);
  v_risks TEXT[] := COALESCE(p_risk_levels, ARRAY[]::TEXT[]);
  v_total INTEGER;
  v_items JSONB := '[]'::jsonb;
  rec RECORD;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 100000 THEN
    RETURN public.review_rpc_error('INVALID_CASE', '分页参数无效');
  END IF;
  v_query := NULLIF(btrim(p_query), '');
  IF v_query IS NOT NULL AND length(v_query) > 200 THEN
    RETURN public.review_rpc_error('INVALID_CASE', '搜索内容过长');
  END IF;
  IF array_length(v_materials, 1) > 50 OR array_length(v_processes, 1) > 50
     OR array_length(v_domains, 1) > 50 OR array_length(v_symptoms, 1) > 50
     OR array_length(v_types, 1) > 50 OR array_length(v_risks, 1) > 50 THEN
    RETURN public.review_rpc_error('INVALID_CASE', '筛选条件过多');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_materials) t WHERE t IS NULL)
     OR EXISTS (SELECT 1 FROM unnest(v_processes) t WHERE t IS NULL)
     OR EXISTS (SELECT 1 FROM unnest(v_domains) t WHERE t IS NULL)
     OR EXISTS (SELECT 1 FROM unnest(v_symptoms) t WHERE t IS NULL)
     OR EXISTS (SELECT 1 FROM unnest(v_types) t WHERE t IS NULL)
     OR EXISTS (SELECT 1 FROM unnest(v_risks) t WHERE t IS NULL) THEN
    RETURN public.review_rpc_error('INVALID_CASE', '筛选条件不能为空元素');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_types) t WHERE t NOT IN ('A','B','C')) THEN
    RETURN public.review_rpc_error('INVALID_CASE', '复盘类型无效');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_risks) t WHERE t NOT IN ('RED','YELLOW','GREEN')) THEN
    RETURN public.review_rpc_error('INVALID_CASE', '风险等级无效');
  END IF;

  v_materials := ARRAY(SELECT DISTINCT x FROM unnest(v_materials) x ORDER BY x);
  v_processes := ARRAY(SELECT DISTINCT x FROM unnest(v_processes) x ORDER BY x);
  v_domains := ARRAY(SELECT DISTINCT x FROM unnest(v_domains) x ORDER BY x);
  v_symptoms := ARRAY(SELECT DISTINCT x FROM unnest(v_symptoms) x ORDER BY x);
  v_types := ARRAY(SELECT DISTINCT x FROM unnest(v_types) x ORDER BY x);
  v_risks := ARRAY(SELECT DISTINCT x FROM unnest(v_risks) x ORDER BY x);

  SELECT COUNT(*) INTO v_total
    FROM public.review_knowledge_cases c
    JOIN public.review_cases rc
      ON rc.id = c.source_review_id
     AND rc.org_id = c.org_id
    LEFT JOIN public.review_knowledge_case_metadata h
      ON h.case_id = c.id
     AND h.org_id = c.org_id
   WHERE c.org_id = v_org_id
     AND c.status = 'PUBLISHED'
     AND rc.status = 'closed'
     AND rc.version = c.source_review_version
     AND (v_query IS NULL OR POSITION(lower(v_query) IN lower(concat_ws(' ', c.case_no, c.title, COALESCE(c.summary,''), COALESCE(c.lesson_summary,''), COALESCE(c.prevention_summary,''), COALESCE(c.applicability_notes,'')))) > 0)
     AND (array_length(v_materials, 1) IS NULL OR EXISTS (SELECT 1 FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id=c.id AND mi.metadata_type='MATERIAL' AND mi.code = ANY(v_materials)))
     AND (array_length(v_processes, 1) IS NULL OR EXISTS (SELECT 1 FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id=c.id AND mi.metadata_type='PROCESS' AND mi.code = ANY(v_processes)))
     AND (array_length(v_domains, 1) IS NULL OR EXISTS (SELECT 1 FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id=c.id AND mi.metadata_type='PROBLEM_DOMAIN' AND mi.code = ANY(v_domains)))
     AND (array_length(v_symptoms, 1) IS NULL OR EXISTS (SELECT 1 FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id=c.id AND mi.metadata_type='PROBLEM_SYMPTOM' AND mi.code = ANY(v_symptoms)))
     AND (array_length(v_types, 1) IS NULL OR c.review_type_snapshot = ANY(v_types))
     AND (array_length(v_risks, 1) IS NULL OR c.risk_level_snapshot = ANY(v_risks))
     AND (p_published_from IS NULL OR c.published_at >= p_published_from)
     AND (p_published_to IS NULL OR c.published_at <= p_published_to);

  FOR rec IN
    SELECT c.id AS case_id, c.case_no, c.title, c.summary, c.lesson_summary, c.prevention_summary,
           c.applicability_notes, c.review_type_snapshot, c.risk_level_snapshot,
           c.occurred_at_snapshot, c.published_at,
           h.material_other_text, h.process_other_text,
           h.problem_domain_other_text, h.problem_symptom_other_text
      FROM public.review_knowledge_cases c
      JOIN public.review_cases rc
        ON rc.id = c.source_review_id
       AND rc.org_id = c.org_id
      LEFT JOIN public.review_knowledge_case_metadata h
        ON h.case_id = c.id
       AND h.org_id = c.org_id
     WHERE c.org_id = v_org_id
       AND c.status = 'PUBLISHED'
       AND rc.status = 'closed'
       AND rc.version = c.source_review_version
       AND (v_query IS NULL OR POSITION(lower(v_query) IN lower(concat_ws(' ', c.case_no, c.title, COALESCE(c.summary,''), COALESCE(c.lesson_summary,''), COALESCE(c.prevention_summary,''), COALESCE(c.applicability_notes,'')))) > 0)
       AND (array_length(v_materials, 1) IS NULL OR EXISTS (SELECT 1 FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id=c.id AND mi.metadata_type='MATERIAL' AND mi.code = ANY(v_materials)))
       AND (array_length(v_processes, 1) IS NULL OR EXISTS (SELECT 1 FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id=c.id AND mi.metadata_type='PROCESS' AND mi.code = ANY(v_processes)))
       AND (array_length(v_domains, 1) IS NULL OR EXISTS (SELECT 1 FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id=c.id AND mi.metadata_type='PROBLEM_DOMAIN' AND mi.code = ANY(v_domains)))
       AND (array_length(v_symptoms, 1) IS NULL OR EXISTS (SELECT 1 FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id=c.id AND mi.metadata_type='PROBLEM_SYMPTOM' AND mi.code = ANY(v_symptoms)))
       AND (array_length(v_types, 1) IS NULL OR c.review_type_snapshot = ANY(v_types))
       AND (array_length(v_risks, 1) IS NULL OR c.risk_level_snapshot = ANY(v_risks))
       AND (p_published_from IS NULL OR c.published_at >= p_published_from)
       AND (p_published_to IS NULL OR c.published_at <= p_published_to)
     ORDER BY c.published_at DESC, c.case_no DESC
     LIMIT p_limit OFFSET p_offset
  LOOP
    v_items := v_items || jsonb_build_object(
      'caseNo', rec.case_no,
      'title', rec.title,
      'summary', rec.summary,
      'lessonSummary', rec.lesson_summary,
      'preventionSummary', rec.prevention_summary,
      'applicabilityNotes', rec.applicability_notes,
      'reviewType', rec.review_type_snapshot,
      'risk', rec.risk_level_snapshot,
      'occurredAt', rec.occurred_at_snapshot,
      'publishedAt', rec.published_at,
      'metadata', jsonb_build_object(
        'materials', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot, 'isPrimary', mi.is_primary) ORDER BY mi.is_primary DESC, mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = rec.case_id AND mi.metadata_type = 'MATERIAL'), '[]'::jsonb),
        'processes', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = rec.case_id AND mi.metadata_type = 'PROCESS'), '[]'::jsonb),
        'problemDomains', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = rec.case_id AND mi.metadata_type = 'PROBLEM_DOMAIN'), '[]'::jsonb),
        'problemSymptoms', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', mi.code, 'label', mi.label_snapshot) ORDER BY mi.code) FROM public.review_knowledge_case_metadata_items mi WHERE mi.case_id = rec.case_id AND mi.metadata_type = 'PROBLEM_SYMPTOM'), '[]'::jsonb),
        'materialOtherText', rec.material_other_text,
        'processOtherText', rec.process_other_text,
        'problemDomainOtherText', rec.problem_domain_other_text,
        'problemSymptomOtherText', rec.problem_symptom_other_text
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'items', v_items,
      'limit', p_limit,
      'offset', p_offset,
      'hasMore', (p_offset + p_limit) < v_total
    )
  );
END;
$$;


ALTER FUNCTION "public"."review_case_library"("p_query" "text", "p_material_codes" "text"[], "p_process_codes" "text"[], "p_problem_domain_codes" "text"[], "p_problem_symptom_codes" "text"[], "p_review_types" "text"[], "p_risk_levels" "text"[], "p_published_from" timestamp with time zone, "p_published_to" timestamp with time zone, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_case_publish"("p_case_id" "uuid", "p_expected_version" integer, "p_expected_source_review_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  v_case_status TEXT;
  v_version INTEGER;
  v_source_review_id UUID;
  v_source_status TEXT;
  v_source_version INTEGER;
  v_review_type TEXT;
  v_risk TEXT;
  v_occurred_at TIMESTAMPTZ;
  v_prev_published_at TIMESTAMPTZ;
  v_curation_missing TEXT[] := '{}'::TEXT[];
  v_curation_title TEXT;
  v_curation_summary TEXT;
  v_curation_lesson TEXT;
  v_curation_prevention TEXT;
  v_meta JSONB;
  v_audit_action TEXT;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无权执行');
  END IF;

  SELECT status, version, source_review_id, published_at, title,
         summary, lesson_summary, prevention_summary
    INTO v_case_status, v_version, v_source_review_id, v_prev_published_at,
         v_curation_title, v_curation_summary, v_curation_lesson, v_curation_prevention
    FROM public.review_knowledge_cases
   WHERE id = p_case_id
     AND org_id = v_org_id
   FOR UPDATE;

  IF v_case_status IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '案例不存在');
  END IF;
  IF v_version IS DISTINCT FROM p_expected_version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '案例版本已变化');
  END IF;
  IF v_case_status <> 'DRAFT' THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许发布');
  END IF;

  SELECT status, version, review_type, risk_level, occurred_at
    INTO v_source_status, v_source_version, v_review_type, v_risk, v_occurred_at
    FROM public.review_cases
   WHERE id = v_source_review_id
     AND org_id = v_org_id
   FOR UPDATE;

  IF v_source_status IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '源复盘不存在');
  END IF;
  IF v_source_version IS DISTINCT FROM p_expected_source_review_version THEN
    RETURN public.review_rpc_error('SOURCE_VERSION_CONFLICT', '源复盘版本已变化');
  END IF;
  IF v_source_status <> 'closed' THEN
    RETURN public.review_rpc_error('SOURCE_NOT_CLOSED', '源复盘未关闭');
  END IF;

  IF NULLIF(btrim(v_curation_title), '') IS NULL THEN v_curation_missing := array_append(v_curation_missing, 'TITLE'); END IF;
  IF NULLIF(btrim(v_curation_summary), '') IS NULL THEN v_curation_missing := array_append(v_curation_missing, 'SUMMARY'); END IF;
  IF NULLIF(btrim(v_curation_lesson), '') IS NULL THEN v_curation_missing := array_append(v_curation_missing, 'LESSON_SUMMARY'); END IF;
  IF NULLIF(btrim(v_curation_prevention), '') IS NULL THEN v_curation_missing := array_append(v_curation_missing, 'PREVENTION_SUMMARY'); END IF;

  IF array_length(v_curation_missing, 1) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'CASE_CURATION_INCOMPLETE',
      'message', '案例策展内容不完整',
      'data', jsonb_build_object('missingFields', to_jsonb(v_curation_missing))
    );
  END IF;

  v_meta := public.review_case_validate_publish_metadata(v_source_review_id, v_org_id);
  IF NOT COALESCE(v_meta->>'ok', 'false') = 'true' THEN
    RETURN v_meta;
  END IF;

  PERFORM public.review_case_replace_snapshot(p_case_id, v_org_id, v_source_review_id);

  v_audit_action := CASE WHEN v_prev_published_at IS NULL THEN 'CASE_PUBLISHED' ELSE 'CASE_REPUBLISHED' END;

  UPDATE public.review_knowledge_cases
     SET status = 'PUBLISHED',
         source_review_version = v_source_version,
         review_type_snapshot = v_review_type,
         risk_level_snapshot = v_risk,
         occurred_at_snapshot = v_occurred_at,
         published_by_profile_id = v_actor_profile_id,
         published_at = NOW(),
         hidden_by_profile_id = NULL,
         hidden_at = NULL,
         hidden_reason = NULL,
         version = version + 1,
         updated_at = NOW()
   WHERE id = p_case_id
     AND org_id = v_org_id;

  INSERT INTO public.review_case_audit_logs (
    org_id, case_id, actor_profile_id, action, changes,
    version_before, version_after
  )
  VALUES (
    v_org_id, p_case_id, v_actor_profile_id, v_audit_action,
    jsonb_build_object(
      'fromStatus', 'DRAFT',
      'toStatus', 'PUBLISHED',
      'sourceReviewVersion', v_source_version,
      'publishKind', v_audit_action
    ),
    v_version, v_version + 1
  );

  RETURN public.review_case_safe_mutation_dto(p_case_id, v_org_id);
END;
$$;


ALTER FUNCTION "public"."review_case_publish"("p_case_id" "uuid", "p_expected_version" integer, "p_expected_source_review_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_case_reopen_curation"("p_case_id" "uuid", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  v_case_status TEXT;
  v_version INTEGER;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无权执行');
  END IF;

  SELECT status, version
    INTO v_case_status, v_version
    FROM public.review_knowledge_cases
   WHERE id = p_case_id
     AND org_id = v_org_id
   FOR UPDATE;

  IF v_case_status IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '案例不存在');
  END IF;
  IF v_version IS DISTINCT FROM p_expected_version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '案例版本已变化');
  END IF;
  IF v_case_status <> 'HIDDEN' THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许重新策展');
  END IF;

  UPDATE public.review_knowledge_cases
     SET status = 'DRAFT',
         hidden_by_profile_id = NULL,
         hidden_at = NULL,
         hidden_reason = NULL,
         version = version + 1,
         updated_at = NOW()
   WHERE id = p_case_id
     AND org_id = v_org_id;

  INSERT INTO public.review_case_audit_logs (
    org_id, case_id, actor_profile_id, action, changes,
    version_before, version_after
  )
  VALUES (
    v_org_id, p_case_id, v_actor_profile_id, 'CASE_REOPENED',
    jsonb_build_object('fromStatus', 'HIDDEN', 'toStatus', 'DRAFT'),
    v_version, v_version + 1
  );

  RETURN public.review_case_safe_mutation_dto(p_case_id, v_org_id);
END;
$$;


ALTER FUNCTION "public"."review_case_reopen_curation"("p_case_id" "uuid", "p_expected_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_case_replace_snapshot"("p_case_id" "uuid", "p_org_id" "uuid", "p_review_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  DELETE FROM public.review_knowledge_case_metadata_items
   WHERE case_id = p_case_id
     AND org_id = p_org_id;

  DELETE FROM public.review_knowledge_case_metadata
   WHERE case_id = p_case_id
     AND org_id = p_org_id;

  INSERT INTO public.review_knowledge_case_metadata (
    case_id, org_id, material_other_text, process_other_text,
    problem_domain_other_text, problem_symptom_other_text, refreshed_at
  )
  SELECT p_case_id, p_org_id, material_other_text, process_other_text,
         problem_domain_other_text, problem_symptom_other_text, NOW()
    FROM public.review_metadata
   WHERE review_id = p_review_id
     AND org_id = p_org_id;

  INSERT INTO public.review_knowledge_case_metadata_items (
    case_id, org_id, metadata_type, code, label_snapshot, is_primary
  )
  SELECT p_case_id, p_org_id, mi.metadata_type, d.code, d.label, mi.is_primary
    FROM public.review_metadata_items mi
    JOIN public.review_dict_items d
      ON d.id = mi.dict_item_id
     AND d.dict_type = mi.metadata_type
   WHERE mi.review_id = p_review_id
     AND mi.org_id = p_org_id
     AND d.org_id IS NULL
     AND d.is_system = TRUE
     AND d.enabled = TRUE;
END;
$$;


ALTER FUNCTION "public"."review_case_replace_snapshot"("p_case_id" "uuid", "p_org_id" "uuid", "p_review_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_case_safe_mutation_dto"("p_case_id" "uuid", "p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', id,
    'caseNo', case_no,
    'status', status,
    'version', version,
    'sourceReviewVersion', source_review_version
  ) INTO v_result
    FROM public.review_knowledge_cases
   WHERE id = p_case_id
     AND org_id = p_org_id;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."review_case_safe_mutation_dto"("p_case_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_case_update_draft"("p_case_id" "uuid", "p_expected_version" integer, "p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_org_id UUID;
  v_case_status TEXT;
  v_version INTEGER;
  v_title TEXT;
  v_summary TEXT;
  v_lesson TEXT;
  v_prevention TEXT;
  v_applicability TEXT;
  v_changed TEXT[] := '{}'::TEXT[];
  v_key TEXT;
  v_new_title TEXT;
  v_new_summary TEXT;
  v_new_lesson TEXT;
  v_new_prevention TEXT;
  v_new_applicability TEXT;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  v_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_profile_id IS NULL OR v_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;
  IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无权执行');
  END IF;

  SELECT status, version, title, summary, lesson_summary,
         prevention_summary, applicability_notes
    INTO v_case_status, v_version, v_title, v_summary, v_lesson,
         v_prevention, v_applicability
    FROM public.review_knowledge_cases
   WHERE id = p_case_id
     AND org_id = v_org_id
   FOR UPDATE;

  IF v_case_status IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '案例不存在');
  END IF;
  IF v_version IS DISTINCT FROM p_expected_version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '案例版本已变化');
  END IF;
  IF v_case_status <> 'DRAFT' THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改');
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN public.review_rpc_error('INVALID_CASE', '修改内容无效');
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch)
  LOOP
    IF v_key NOT IN ('title', 'summary', 'lessonSummary', 'preventionSummary', 'applicabilityNotes') THEN
      RETURN public.review_rpc_error('INVALID_CASE', '包含不允许的字段');
    END IF;
  END LOOP;

  IF p_patch ? 'title' THEN
    IF jsonb_typeof(p_patch->'title') = 'null' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'CASE_CURATION_INCOMPLETE',
        'message', '案例标题不完整',
        'data', jsonb_build_object('missingFields', jsonb_build_array('TITLE'))
      );
    END IF;
    IF jsonb_typeof(p_patch->'title') <> 'string' THEN
      RETURN public.review_rpc_error('INVALID_CASE', '修改内容格式无效');
    END IF;
    v_new_title := NULLIF(btrim(p_patch->>'title'), '');
    IF v_new_title IS NULL THEN
      RETURN public.review_rpc_error('INVALID_CASE', '案例标题不能为空');
    END IF;
  ELSE
    v_new_title := v_title;
  END IF;
  IF p_patch ? 'summary' THEN
    IF jsonb_typeof(p_patch->'summary') NOT IN ('string', 'null') THEN
      RETURN public.review_rpc_error('INVALID_CASE', '修改内容格式无效');
    END IF;
    v_new_summary := NULLIF(btrim(p_patch->>'summary'), '');
  ELSE
    v_new_summary := v_summary;
  END IF;
  IF p_patch ? 'lessonSummary' THEN
    IF jsonb_typeof(p_patch->'lessonSummary') NOT IN ('string', 'null') THEN
      RETURN public.review_rpc_error('INVALID_CASE', '修改内容格式无效');
    END IF;
    v_new_lesson := NULLIF(btrim(p_patch->>'lessonSummary'), '');
  ELSE
    v_new_lesson := v_lesson;
  END IF;
  IF p_patch ? 'preventionSummary' THEN
    IF jsonb_typeof(p_patch->'preventionSummary') NOT IN ('string', 'null') THEN
      RETURN public.review_rpc_error('INVALID_CASE', '修改内容格式无效');
    END IF;
    v_new_prevention := NULLIF(btrim(p_patch->>'preventionSummary'), '');
  ELSE
    v_new_prevention := v_prevention;
  END IF;
  IF p_patch ? 'applicabilityNotes' THEN
    IF jsonb_typeof(p_patch->'applicabilityNotes') NOT IN ('string', 'null') THEN
      RETURN public.review_rpc_error('INVALID_CASE', '修改内容格式无效');
    END IF;
    v_new_applicability := NULLIF(btrim(p_patch->>'applicabilityNotes'), '');
  ELSE
    v_new_applicability := v_applicability;
  END IF;

  IF v_new_title IS NULL OR length(v_new_title) > 200
     OR length(v_new_summary) > 5000 OR length(v_new_lesson) > 5000
     OR length(v_new_prevention) > 5000 OR length(v_new_applicability) > 2000 THEN
    RETURN public.review_rpc_error('INVALID_CASE', '修改内容不符合长度要求');
  END IF;

  IF v_new_title IS DISTINCT FROM v_title THEN
    v_changed := array_append(v_changed, 'title');
  END IF;
  IF v_new_summary IS DISTINCT FROM v_summary THEN
    v_changed := array_append(v_changed, 'summary');
  END IF;
  IF v_new_lesson IS DISTINCT FROM v_lesson THEN
    v_changed := array_append(v_changed, 'lessonSummary');
  END IF;
  IF v_new_prevention IS DISTINCT FROM v_prevention THEN
    v_changed := array_append(v_changed, 'preventionSummary');
  END IF;
  IF v_new_applicability IS DISTINCT FROM v_applicability THEN
    v_changed := array_append(v_changed, 'applicabilityNotes');
  END IF;

  IF array_length(v_changed, 1) IS NULL THEN
    RETURN public.review_case_safe_mutation_dto(p_case_id, v_org_id);
  END IF;

  UPDATE public.review_knowledge_cases
     SET title = v_new_title,
         summary = v_new_summary,
         lesson_summary = v_new_lesson,
         prevention_summary = v_new_prevention,
         applicability_notes = v_new_applicability,
         version = version + 1,
         updated_at = NOW()
   WHERE id = p_case_id
     AND org_id = v_org_id;

  INSERT INTO public.review_case_audit_logs (
    org_id, case_id, actor_profile_id, action, changes,
    version_before, version_after
  )
  VALUES (
    v_org_id, p_case_id, v_actor_profile_id, 'CASE_UPDATED',
    jsonb_build_object('changedFields', to_jsonb(v_changed)),
    v_version, v_version + 1
  );

  RETURN public.review_case_safe_mutation_dto(p_case_id, v_org_id);
END;
$$;


ALTER FUNCTION "public"."review_case_update_draft"("p_case_id" "uuid", "p_expected_version" integer, "p_patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_case_validate_publish_metadata"("p_review_id" "uuid", "p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_review_type TEXT;
  v_domains TEXT[];
  v_symptoms TEXT[];
  v_materials TEXT[];
  v_processes TEXT[];
  v_primary_count INTEGER;
  v_other_material TEXT;
  v_other_process TEXT;
  v_other_domain TEXT;
  v_other_symptom TEXT;
  v_missing TEXT[] := '{}'::TEXT[];
  v_invalid_dict BOOLEAN;
  v_domain_count INTEGER;
  v_symptom_count INTEGER;
  v_material_count INTEGER;
  v_process_count INTEGER;
BEGIN
  SELECT review_type
    INTO v_review_type
    FROM public.review_cases
   WHERE id = p_review_id
     AND org_id = p_org_id;

  IF v_review_type IS NULL THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.review_metadata_items mi
      JOIN public.review_dict_items d
        ON d.id = mi.dict_item_id
       AND d.dict_type = mi.metadata_type
     WHERE mi.review_id = p_review_id
       AND mi.org_id = p_org_id
       AND (
         d.org_id IS NOT NULL
         OR d.is_system = FALSE
         OR d.enabled = FALSE
       )
  ) INTO v_invalid_dict;

  IF v_invalid_dict THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_DICTIONARY',
      'message', '包含无效分类字典',
      'data', null
    );
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE metadata_type = 'PROBLEM_DOMAIN'),
    COUNT(*) FILTER (WHERE metadata_type = 'PROBLEM_SYMPTOM'),
    COUNT(*) FILTER (WHERE metadata_type = 'MATERIAL'),
    COUNT(*) FILTER (WHERE metadata_type = 'PROCESS')
  INTO v_domain_count, v_symptom_count, v_material_count, v_process_count
  FROM public.review_metadata_items mi
  JOIN public.review_dict_items d
    ON d.id = mi.dict_item_id
   AND d.dict_type = mi.metadata_type
 WHERE mi.review_id = p_review_id
   AND mi.org_id = p_org_id;

  SELECT COALESCE(array_agg(d.code) FILTER (WHERE mi.metadata_type = 'PROBLEM_DOMAIN'), '{}'::TEXT[]),
         COALESCE(array_agg(d.code) FILTER (WHERE mi.metadata_type = 'PROBLEM_SYMPTOM'), '{}'::TEXT[]),
         COALESCE(array_agg(d.code) FILTER (WHERE mi.metadata_type = 'MATERIAL'), '{}'::TEXT[]),
         COALESCE(array_agg(d.code) FILTER (WHERE mi.metadata_type = 'PROCESS'), '{}'::TEXT[])
  INTO v_domains, v_symptoms, v_materials, v_processes
  FROM public.review_metadata_items mi
  JOIN public.review_dict_items d
    ON d.id = mi.dict_item_id
   AND d.dict_type = mi.metadata_type
 WHERE mi.review_id = p_review_id
   AND mi.org_id = p_org_id;

  SELECT COUNT(*) INTO v_primary_count
    FROM public.review_metadata_items
   WHERE review_id = p_review_id
     AND org_id = p_org_id
     AND metadata_type = 'MATERIAL'
     AND is_primary = TRUE;

  SELECT material_other_text, process_other_text,
         problem_domain_other_text, problem_symptom_other_text
    INTO v_other_material, v_other_process, v_other_domain, v_other_symptom
    FROM public.review_metadata
   WHERE review_id = p_review_id
     AND org_id = p_org_id;

  IF v_domain_count < 1 THEN
    v_missing := array_append(v_missing, 'PROBLEM_DOMAIN');
  END IF;
  IF v_symptom_count < 1 THEN
    v_missing := array_append(v_missing, 'PROBLEM_SYMPTOM');
  END IF;
  IF v_material_count > 0 AND v_primary_count <> 1 THEN
    v_missing := array_append(v_missing, 'PRIMARY_MATERIAL');
  END IF;
  IF v_review_type IN ('B', 'C') AND v_primary_count <> 1 THEN
    v_missing := array_append(v_missing, 'PRIMARY_MATERIAL');
  END IF;
  IF v_review_type IN ('B', 'C')
     AND v_domains && ARRAY['PROCESS', 'EQUIPMENT_FIXTURE', 'PLATE_FILM']
     AND v_process_count < 1 THEN
    v_missing := array_append(v_missing, 'PROCESS');
  END IF;
  IF 'OTHER' = ANY(v_materials) AND NULLIF(btrim(v_other_material), '') IS NULL THEN
    v_missing := array_append(v_missing, 'MATERIAL_OTHER_TEXT');
  END IF;
  IF 'OTHER' = ANY(v_processes) AND NULLIF(btrim(v_other_process), '') IS NULL THEN
    v_missing := array_append(v_missing, 'PROCESS_OTHER_TEXT');
  END IF;
  IF 'OTHER' = ANY(v_domains) AND NULLIF(btrim(v_other_domain), '') IS NULL THEN
    v_missing := array_append(v_missing, 'PROBLEM_DOMAIN_OTHER_TEXT');
  END IF;
  IF 'OTHER' = ANY(v_symptoms) AND NULLIF(btrim(v_other_symptom), '') IS NULL THEN
    v_missing := array_append(v_missing, 'PROBLEM_SYMPTOM_OTHER_TEXT');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'CASE_METADATA_INCOMPLETE',
      'message', '分类信息不完整',
      'data', jsonb_build_object('missingDimensions', v_missing)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'OK', 'data', null);
END;
$$;


ALTER FUNCTION "public"."review_case_validate_publish_metadata"("p_review_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_close"("p_review_id" "uuid", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_old_version INTEGER;
  v_new_version INTEGER;
  v_submitted_at TIMESTAMPTZ;
  v_closed_at TIMESTAMPTZ;
  v_open_action_count INTEGER;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_actor_role NOT IN ('admin', 'manager') THEN
    RETURN public.review_rpc_error('FORBIDDEN', '仅管理员或主管可关闭复盘');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_review_row.status = 'closed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', jsonb_build_object(
        'status', v_review_row.status,
        'version', v_review_row.version,
        'submitted_at', v_review_row.submitted_at,
        'closed_at', v_review_row.closed_at
      )
    );
  END IF;

  IF v_review_row.status <> 'submitted' THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许关闭');
  END IF;

  SELECT COUNT(*) INTO v_open_action_count
    FROM public.review_actions ra
    WHERE ra.review_id = p_review_id
      AND ra.org_id = v_actor_org_id
      AND ra.status NOT IN ('VERIFIED', 'CANCELLED');

  IF v_open_action_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'OPEN_ACTIONS_EXIST',
      'message', '存在未完成的改善行动，暂不能关闭复盘',
      'data', jsonb_build_object('openActionCount', v_open_action_count)
    );
  END IF;

  v_old_version := v_review_row.version;

  UPDATE public.review_cases rc
    SET status = 'closed',
        closed_at = NOW(),
        closed_by = v_actor_profile_id,
        version = rc.version + 1,
        updated_at = NOW()
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING version, submitted_at, closed_at
    INTO v_new_version, v_submitted_at, v_closed_at;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'REVIEW',
    p_review_id,
    'REVIEW_CLOSED',
    jsonb_build_object(
      'status',
      jsonb_build_object('before', 'submitted', 'after', 'closed')
    ),
    v_old_version,
    v_new_version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'REVIEW_CLOSED',
    v_actor_profile_id,
    jsonb_build_object('from_status', 'submitted', 'to_status', 'closed'),
    v_new_version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'status', 'closed',
      'version', v_new_version,
      'submitted_at', v_submitted_at,
      'closed_at', v_closed_at
    )
  );
END;
$$;


ALTER FUNCTION "public"."review_close"("p_review_id" "uuid", "p_expected_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_create_audit_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_id UUID;
BEGIN
  SELECT p.id INTO v_actor_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
      AND p.org_id = NEW.org_id
    LIMIT 1;
  IF v_actor_id IS NULL THEN
    v_actor_id := NEW.created_by;
  END IF;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    NEW.org_id,
    NEW.id,
    v_actor_id,
    'REVIEW',
    NEW.id,
    'REVIEW_CREATED',
    jsonb_build_object(
      'review_no', NEW.review_no,
      'review_type', NEW.review_type,
      'title', NEW.title
    ),
    NULL,
    NEW.version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    NEW.org_id,
    NEW.id,
    'REVIEW_CREATED',
    v_actor_id,
    jsonb_build_object(
      'review_no', NEW.review_no,
      'review_type', NEW.review_type,
      'title', NEW.title
    ),
    NEW.version
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."review_create_audit_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_event_actor_directory"("p_review_id" "uuid", "p_purpose" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_purpose TEXT := upper(btrim(p_purpose));
  v_items JSONB := '[]'::jsonb;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  v_actor_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF v_purpose IS NULL OR v_purpose NOT IN ('TIMELINE', 'AUDIT') THEN
    RETURN public.review_rpc_error('INVALID_PURPOSE', 'Invalid directory purpose');
  END IF;

  IF v_purpose = 'AUDIT'
     AND NOT (
       public.auth_has_role('admin')
       OR public.auth_has_role('manager')
     ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.review_cases rc
     WHERE rc.id = p_review_id
       AND rc.org_id = v_actor_org_id
  ) THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  IF v_purpose = 'TIMELINE' THEN
    WITH actors AS (
      SELECT DISTINCT
        p.id AS profile_id,
        p.full_name,
        p.role,
        p.is_active
      FROM public.review_timeline_events te
      JOIN public.profiles p
        ON p.id = te.actor_profile_id
       AND p.org_id = te.org_id
      WHERE te.review_id = p_review_id
        AND te.org_id = v_actor_org_id
        AND te.actor_profile_id IS NOT NULL
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'profile_id', a.profile_id,
          'display_name', COALESCE(NULLIF(btrim(a.full_name), ''), '未命名用户'),
          'role', a.role,
          'is_active', a.is_active
        )
        ORDER BY COALESCE(NULLIF(btrim(a.full_name), ''), '未命名用户'), a.profile_id
      ),
      '[]'::jsonb
    )
    INTO v_items
    FROM actors a;
  ELSE
    WITH actors AS (
      SELECT DISTINCT
        p.id AS profile_id,
        p.full_name,
        p.role,
        p.is_active
      FROM public.review_audit_logs al
      JOIN public.profiles p
        ON p.id = al.actor_profile_id
       AND p.org_id = al.org_id
      WHERE al.review_id = p_review_id
        AND al.org_id = v_actor_org_id
        AND al.actor_profile_id IS NOT NULL
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'profile_id', a.profile_id,
          'display_name', COALESCE(NULLIF(btrim(a.full_name), ''), '未命名用户'),
          'role', a.role,
          'is_active', a.is_active
        )
        ORDER BY COALESCE(NULLIF(btrim(a.full_name), ''), '未命名用户'), a.profile_id
      ),
      '[]'::jsonb
    )
    INTO v_items
    FROM actors a;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object('items', v_items)
  );
END;
$$;


ALTER FUNCTION "public"."review_event_actor_directory"("p_review_id" "uuid", "p_purpose" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_metadata_submit_missing"("p_review_id" "uuid", "p_org_id" "uuid") RETURNS "text"[]
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  WITH meta AS (
    SELECT mi.metadata_type, d.code, mi.is_primary
    FROM public.review_metadata_items mi
    JOIN public.review_dict_items d
      ON d.id = mi.dict_item_id
     AND d.dict_type = mi.metadata_type
    WHERE mi.review_id = p_review_id
      AND mi.org_id = p_org_id
  ),
  review AS (
    SELECT review_type
    FROM public.review_cases
    WHERE id = p_review_id
      AND org_id = p_org_id
  ),
  domains AS (
    SELECT code
    FROM meta
    WHERE metadata_type = 'PROBLEM_DOMAIN'
  )
  SELECT COALESCE(ARRAY(
    SELECT missing
    FROM (
      SELECT 'PROBLEM_DOMAIN'::TEXT AS missing
      WHERE NOT EXISTS (
        SELECT 1 FROM meta WHERE metadata_type = 'PROBLEM_DOMAIN'
      )
      UNION ALL
      SELECT 'PRIMARY_MATERIAL'::TEXT
      WHERE (
        EXISTS (
          SELECT 1 FROM review r WHERE r.review_type IN ('B', 'C')
        )
        OR EXISTS (
          SELECT 1 FROM meta WHERE metadata_type = 'MATERIAL'
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM meta
        WHERE metadata_type = 'MATERIAL' AND is_primary = TRUE
      )
      UNION ALL
      SELECT 'PROCESS'::TEXT
      WHERE EXISTS (
        SELECT 1 FROM review r WHERE r.review_type IN ('B', 'C')
      )
      AND EXISTS (
        SELECT 1 FROM domains
        WHERE code IN ('PROCESS', 'EQUIPMENT_FIXTURE', 'PLATE_FILM')
      )
      AND NOT EXISTS (
        SELECT 1 FROM meta WHERE metadata_type = 'PROCESS'
      )
    ) missing_rows
    ORDER BY missing
  ), '{}'::TEXT[]);
$$;


ALTER FUNCTION "public"."review_metadata_submit_missing"("p_review_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_participant_directory"("p_review_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_items JSONB := '[]'::jsonb;
BEGIN
  SELECT p.id, p.org_id
    INTO v_actor_profile_id, v_actor_org_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id;

  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  WITH referenced AS (
    SELECT owner_id AS profile_id
      FROM public.review_cases rc
      WHERE rc.id = p_review_id
        AND rc.org_id = v_actor_org_id
    UNION
    SELECT pmo_id AS profile_id
      FROM public.review_cases rc
      WHERE rc.id = p_review_id
        AND rc.org_id = v_actor_org_id
        AND pmo_id IS NOT NULL
    UNION
    SELECT created_by AS profile_id
      FROM public.review_cases rc
      WHERE rc.id = p_review_id
        AND rc.org_id = v_actor_org_id
    UNION
    SELECT profile_id
      FROM public.review_members rm
      WHERE rm.review_id = p_review_id
        AND rm.org_id = v_actor_org_id
    UNION
    SELECT owner_profile_id AS profile_id
      FROM public.review_actions ra
      WHERE ra.review_id = p_review_id
        AND ra.org_id = v_actor_org_id
    UNION
    SELECT created_by_profile_id AS profile_id
      FROM public.review_actions ra
      WHERE ra.review_id = p_review_id
        AND ra.org_id = v_actor_org_id
    UNION
    SELECT verified_by_profile_id AS profile_id
      FROM public.review_actions ra
      WHERE ra.review_id = p_review_id
        AND ra.org_id = v_actor_org_id
        AND ra.verified_by_profile_id IS NOT NULL
  ),
  participants AS (
    SELECT DISTINCT
      r.profile_id,
      p.id,
      p.full_name,
      p.role,
      p.department,
      p.is_active
    FROM referenced r
    JOIN public.profiles p
      ON p.id = r.profile_id
     AND p.org_id = v_review_row.org_id
  )
  SELECT COALESCE(
    jsonb_agg(
      item
      ORDER BY sort_display_name, sort_profile_id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM (
    SELECT
      COALESCE(NULLIF(btrim(pt.full_name), ''), '未命名用户') AS sort_display_name,
      pt.id AS sort_profile_id,
      jsonb_build_object(
        'profile_id', pt.id,
        'display_name', COALESCE(NULLIF(btrim(pt.full_name), ''), '未命名用户'),
        'role', pt.role,
        'department', pt.department,
        'is_active', pt.is_active
      ) AS item
    FROM participants pt
  ) q;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object('items', v_items)
  );
END;
$$;


ALTER FUNCTION "public"."review_participant_directory"("p_review_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_profile_directory"("p_purpose" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_items JSONB := '[]'::jsonb;
BEGIN
  SELECT p.id, p.org_id
    INTO v_actor_profile_id, v_actor_org_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF p_purpose IS NULL OR p_purpose NOT IN ('MEMBER', 'ASSIGNMENT', 'ACTION_OWNER') THEN
    RETURN public.review_rpc_error('INVALID_PURPOSE', 'Invalid directory purpose');
  END IF;

  WITH candidate AS (
    SELECT
      p.id AS sort_profile_id,
      p.department AS sort_department,
      COALESCE(NULLIF(btrim(p.full_name), ''), '未命名用户') AS sort_display_name,
      jsonb_build_object(
        'profile_id', p.id,
        'display_name', COALESCE(NULLIF(btrim(p.full_name), ''), '未命名用户'),
        'role', p.role,
        'department', p.department,
        'assignment_eligible', p.role <> 'viewer'
      ) AS item
    FROM public.profiles p
    WHERE p.org_id = v_actor_org_id
      AND p.is_active = true
      AND (
        p_purpose = 'MEMBER'
        OR (p_purpose IN ('ASSIGNMENT', 'ACTION_OWNER') AND p.role <> 'viewer')
      )
  )
  SELECT COALESCE(
    jsonb_agg(
      item
      ORDER BY sort_department NULLS LAST,
               sort_display_name,
               sort_profile_id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM candidate;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object('items', v_items)
  );
END;
$$;


ALTER FUNCTION "public"."review_profile_directory"("p_purpose" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_remove_member"("p_review_id" "uuid", "p_expected_version" integer, "p_member_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_member_row public.review_members%ROWTYPE;
  v_new_version INTEGER;
  v_changes JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_review_row.status <> 'draft' THEN
    RETURN public.review_rpc_error('DRAFT_ONLY', '仅草稿可编辑');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR v_review_row.pmo_id = v_actor_profile_id
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无成员管理权限');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  SELECT m.* INTO v_member_row
    FROM public.review_members m
    WHERE m.id = p_member_id
      AND m.review_id = p_review_id
      AND m.org_id = v_actor_org_id;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '成员不存在');
  END IF;

  DELETE FROM public.review_members m
    WHERE m.id = p_member_id
      AND m.review_id = p_review_id
      AND m.org_id = v_actor_org_id;

  UPDATE public.review_cases rc
    SET version = rc.version + 1
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING version INTO v_new_version;

  v_changes := jsonb_build_object(
    'member_id', v_member_row.id,
    'profile_id', v_member_row.profile_id,
    'member_role', v_member_row.member_role,
    'is_primary', v_member_row.is_primary
  );

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'MEMBER',
    p_member_id,
    'MEMBER_REMOVED',
    v_changes,
    v_review_row.version,
    v_new_version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'MEMBER_REMOVED',
    v_actor_profile_id,
    v_changes,
    v_new_version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'member_id', p_member_id,
      'removed', true,
      'version', v_new_version
    )
  );
END;
$$;


ALTER FUNCTION "public"."review_remove_member"("p_review_id" "uuid", "p_expected_version" integer, "p_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_reopen"("p_review_id" "uuid", "p_expected_version" integer, "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_old_version INTEGER;
  v_new_version INTEGER;
  v_submitted_at TIMESTAMPTZ;
  v_closed_at TIMESTAMPTZ;
  v_reason TEXT := NULL;
  v_from_status TEXT;
  v_changes JSONB;
  v_payload JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  IF p_reason IS NOT NULL THEN
    v_reason := btrim(p_reason);

    IF length(v_reason) > 1000 THEN
      RETURN public.review_rpc_error(
        'INVALID_REASON',
        '退回或重新打开原因过长'
      );
    END IF;
  END IF;

  SELECT rc.*
    INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_actor_role NOT IN ('admin', 'manager') THEN
    RETURN public.review_rpc_error(
      'FORBIDDEN',
      '仅管理员或主管可重新打开复盘'
    );
  END IF;

  IF p_expected_version IS NULL
    OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error(
      'VERSION_CONFLICT',
      '版本已变化'
    );
  END IF;

  IF v_review_row.status = 'draft' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', jsonb_build_object(
        'status', v_review_row.status,
        'version', v_review_row.version,
        'submitted_at', v_review_row.submitted_at,
        'closed_at', v_review_row.closed_at
      )
    );
  END IF;

  IF v_review_row.status = 'closed'
    AND v_actor_role <> 'admin' THEN
    RETURN public.review_rpc_error(
      'FORBIDDEN',
      '仅管理员可重新打开已关闭复盘'
    );
  END IF;

  IF v_review_row.status IN ('submitted', 'closed')
    AND (v_reason IS NULL OR v_reason = '') THEN
    RETURN public.review_rpc_error(
      'INVALID_REASON',
      CASE
        WHEN v_review_row.status = 'submitted'
          THEN '退回修改必须填写原因'
        ELSE '重新打开必须填写原因'
      END
    );
  END IF;

  IF v_review_row.status NOT IN ('submitted', 'closed') THEN
    RETURN public.review_rpc_error(
      'INVALID_TRANSITION',
      '当前状态不允许重新打开'
    );
  END IF;

  v_old_version := v_review_row.version;
  v_from_status := v_review_row.status;

  v_changes := jsonb_build_object(
    'status',
    jsonb_build_object(
      'before', v_from_status,
      'after', 'draft'
    )
  );

  v_payload := jsonb_build_object(
    'from_status', v_from_status,
    'to_status', 'draft'
  );

  IF v_reason IS NOT NULL
    AND v_reason <> '' THEN
    v_changes :=
      v_changes || jsonb_build_object(
        'reason',
        v_reason
      );

    v_payload :=
      v_payload || jsonb_build_object(
        'reason',
        v_reason
      );
  END IF;

  IF v_from_status = 'submitted' THEN

    UPDATE public.review_cases rc
      SET status = 'draft',
          submitted_at = NULL,
          submitted_by_profile_id = NULL,
          version = rc.version + 1,
          updated_at = NOW()
      WHERE rc.id = p_review_id
        AND rc.org_id = v_actor_org_id
      RETURNING
        version,
        submitted_at,
        closed_at
      INTO
        v_new_version,
        v_submitted_at,
        v_closed_at;

  ELSE

    UPDATE public.review_cases rc
      SET status = 'draft',
          submitted_at = NULL,
          submitted_by_profile_id = NULL,
          closed_at = NULL,
          closed_by = NULL,
          version = rc.version + 1,
          updated_at = NOW()
      WHERE rc.id = p_review_id
        AND rc.org_id = v_actor_org_id
      RETURNING
        version,
        submitted_at,
        closed_at
      INTO
        v_new_version,
        v_submitted_at,
        v_closed_at;

  END IF;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'REVIEW',
    p_review_id,
    'REVIEW_REOPENED',
    v_changes,
    v_old_version,
    v_new_version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'REVIEW_REOPENED',
    v_actor_profile_id,
    v_payload,
    v_new_version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'status', 'draft',
      'version', v_new_version,
      'submitted_at', v_submitted_at,
      'closed_at', v_closed_at
    )
  );

END;
$$;


ALTER FUNCTION "public"."review_reopen"("p_review_id" "uuid", "p_expected_version" integer, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_rpc_error"("p_code" "text", "p_message" "text") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT jsonb_build_object(
    'ok', false,
    'code', p_code,
    'message', p_message,
    'data', null::jsonb
  );
$$;


ALTER FUNCTION "public"."review_rpc_error"("p_code" "text", "p_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_set_draft_assignments"("p_review_id" "uuid", "p_expected_version" integer, "p_owner_profile_id" "uuid", "p_pmo_profile_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_old_row public.review_cases%ROWTYPE;
  v_review_row public.review_cases%ROWTYPE;
  v_owner_active BOOLEAN;
  v_owner_role TEXT;
  v_pmo_active BOOLEAN;
  v_pmo_role TEXT;
  v_changed BOOLEAN;
  v_changes JSONB := '{}'::jsonb;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_review_row.status <> 'draft' THEN
    RETURN public.review_rpc_error('DRAFT_ONLY', '仅草稿可编辑');
  END IF;

  IF v_actor_role NOT IN ('admin', 'manager') THEN
    RETURN public.review_rpc_error('FORBIDDEN', '仅管理员或主管可分配负责人');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF p_owner_profile_id IS NULL THEN
    RETURN public.review_rpc_error('INVALID_MEMBER', 'owner 不能为空');
  END IF;

  SELECT p.is_active, p.role
    INTO v_owner_active, v_owner_role
    FROM public.profiles p
    WHERE p.id = p_owner_profile_id
      AND p.org_id = v_actor_org_id;
  IF NOT FOUND OR NOT v_owner_active OR v_owner_role = 'viewer' THEN
    RETURN public.review_rpc_error('INVALID_MEMBER', 'owner 必须 active、同 org 且非 viewer');
  END IF;

  IF p_pmo_profile_id IS NOT NULL THEN
    SELECT p.is_active, p.role
      INTO v_pmo_active, v_pmo_role
      FROM public.profiles p
      WHERE p.id = p_pmo_profile_id
        AND p.org_id = v_actor_org_id;
    IF NOT FOUND OR NOT v_pmo_active OR v_pmo_role = 'viewer' THEN
      RETURN public.review_rpc_error('INVALID_MEMBER', 'pmo 必须 active、同 org 且非 viewer');
    END IF;
  END IF;

  v_changed := (
    v_review_row.owner_id IS DISTINCT FROM p_owner_profile_id
    OR v_review_row.pmo_id IS DISTINCT FROM p_pmo_profile_id
  );

  IF NOT v_changed THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', to_jsonb(v_review_row)
    );
  END IF;

  v_old_row := v_review_row;

  UPDATE public.review_cases rc
    SET owner_id = p_owner_profile_id,
        pmo_id = p_pmo_profile_id,
        version = rc.version + 1
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING * INTO v_review_row;

  IF v_old_row.owner_id IS DISTINCT FROM v_review_row.owner_id THEN
    v_changes := v_changes || jsonb_build_object(
      'owner_id', jsonb_build_object('before', v_old_row.owner_id, 'after', v_review_row.owner_id)
    );
  END IF;
  IF v_old_row.pmo_id IS DISTINCT FROM v_review_row.pmo_id THEN
    v_changes := v_changes || jsonb_build_object(
      'pmo_id', jsonb_build_object('before', v_old_row.pmo_id, 'after', v_review_row.pmo_id)
    );
  END IF;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'ASSIGNMENT',
    p_review_id,
    'ASSIGNMENT_UPDATED',
    v_changes,
    v_old_row.version,
    v_review_row.version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'ASSIGNMENT_UPDATED',
    v_actor_profile_id,
    v_changes,
    v_review_row.version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', to_jsonb(v_review_row)
  );
END;
$$;


ALTER FUNCTION "public"."review_set_draft_assignments"("p_review_id" "uuid", "p_expected_version" integer, "p_owner_profile_id" "uuid", "p_pmo_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_set_primary_member"("p_review_id" "uuid", "p_expected_version" integer, "p_member_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_target public.review_members%ROWTYPE;
  v_prev_primary_id UUID;
  v_prev_primary_profile_id UUID;
  v_new_version INTEGER;
  v_changes JSONB;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_review_row.status <> 'draft' THEN
    RETURN public.review_rpc_error('DRAFT_ONLY', '仅草稿可编辑');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR v_review_row.pmo_id = v_actor_profile_id
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无成员管理权限');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  SELECT m.* INTO v_target
    FROM public.review_members m
    WHERE m.id = p_member_id
      AND m.review_id = p_review_id
      AND m.org_id = v_actor_org_id;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '成员不存在');
  END IF;

  IF v_target.is_primary THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', jsonb_build_object(
        'member', to_jsonb(v_target),
        'version', v_review_row.version
      )
    );
  END IF;

  SELECT m.id, m.profile_id
    INTO v_prev_primary_id, v_prev_primary_profile_id
    FROM public.review_members m
    WHERE m.review_id = p_review_id
      AND m.org_id = v_actor_org_id
      AND m.member_role = v_target.member_role
      AND m.is_primary = true
    LIMIT 1;

  UPDATE public.review_members m
    SET is_primary = false
    WHERE m.review_id = p_review_id
      AND m.org_id = v_actor_org_id
      AND m.member_role = v_target.member_role
      AND m.is_primary = true;

  UPDATE public.review_members m
    SET is_primary = true
    WHERE m.id = p_member_id
      AND m.review_id = p_review_id
      AND m.org_id = v_actor_org_id
    RETURNING * INTO v_target;

  UPDATE public.review_cases rc
    SET version = rc.version + 1
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING version INTO v_new_version;

  v_changes := jsonb_build_object(
    'member_role', v_target.member_role,
    'previous_primary_id', v_prev_primary_id,
    'previous_primary_profile_id', v_prev_primary_profile_id,
    'new_primary_id', v_target.id,
    'new_primary_profile_id', v_target.profile_id
  );

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'MEMBER',
    v_target.id,
    'MEMBER_PRIMARY_SET',
    v_changes,
    v_review_row.version,
    v_new_version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'MEMBER_PRIMARY_SET',
    v_actor_profile_id,
    v_changes,
    v_new_version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'member', to_jsonb(v_target),
      'version', v_new_version
    )
  );
END;
$$;


ALTER FUNCTION "public"."review_set_primary_member"("p_review_id" "uuid", "p_expected_version" integer, "p_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_submit"("p_review_id" "uuid", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_old_version INTEGER;
  v_new_version INTEGER;
  v_submitted_at TIMESTAMPTZ;
  v_closed_at TIMESTAMPTZ;
  v_missing_fields TEXT[] := '{}'::TEXT[];
  v_missing_dimensions TEXT[] := '{}'::TEXT[];
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF NOT COALESCE(
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND v_actor_profile_id IS NOT NULL
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR (
          v_review_row.pmo_id IS NOT NULL
          AND v_review_row.pmo_id = v_actor_profile_id
        )
      )
    ),
    FALSE
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无提交权限');
  END IF;

  IF p_expected_version IS NULL
    OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_review_row.status = 'submitted' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', jsonb_build_object(
        'status', v_review_row.status,
        'version', v_review_row.version,
        'submitted_at', v_review_row.submitted_at,
        'closed_at', v_review_row.closed_at
      )
    );
  END IF;

  IF v_review_row.status <> 'draft' THEN
    RETURN public.review_rpc_error(
      'INVALID_TRANSITION',
      '当前状态不允许提交'
    );
  END IF;

  IF v_review_row.title IS NULL
    OR btrim(v_review_row.title) = '' THEN
    v_missing_fields := array_append(
      v_missing_fields,
      'title'
    );
  END IF;

  IF v_review_row.review_type IS NULL
    OR v_review_row.review_type NOT IN ('A', 'B', 'C') THEN
    v_missing_fields := array_append(
      v_missing_fields,
      'review_type'
    );
  END IF;

  IF v_review_row.description IS NULL
    OR btrim(v_review_row.description) = '' THEN
    v_missing_fields := array_append(
      v_missing_fields,
      'description'
    );
  END IF;

  IF v_review_row.risk_level IS NULL THEN
    v_missing_fields := array_append(
      v_missing_fields,
      'risk_level'
    );
  END IF;

  IF v_review_row.risk_level IN ('RED', 'YELLOW')
    AND (
      v_review_row.risk_reason IS NULL
      OR btrim(v_review_row.risk_reason) = ''
    ) THEN
    v_missing_fields := array_append(
      v_missing_fields,
      'risk_reason'
    );
  END IF;

  IF v_review_row.owner_id IS NULL THEN
    v_missing_fields := array_append(
      v_missing_fields,
      'owner_id'
    );
  END IF;

  PERFORM 1
    FROM public.review_type_details d
    WHERE d.review_id = p_review_id
      AND d.org_id = v_actor_org_id;

  IF NOT FOUND THEN
    v_missing_fields := array_append(
      v_missing_fields,
      'type_details'
    );
  END IF;

  IF v_missing_fields <> '{}'::TEXT[] THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INCOMPLETE_REVIEW',
      'message', '复盘信息不完整',
      'data', jsonb_build_object(
        'missing_fields',
        to_jsonb(v_missing_fields)
      )
    );
  END IF;

  v_missing_dimensions := public.review_metadata_submit_missing(
    p_review_id,
    v_actor_org_id
  );

  IF v_missing_dimensions <> '{}'::TEXT[] THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'METADATA_INCOMPLETE',
      'message', '复盘分类信息不完整，暂不能提交',
      'data', jsonb_build_object(
        'missingDimensions',
        to_jsonb(v_missing_dimensions)
      )
    );
  END IF;

  v_old_version := v_review_row.version;

  UPDATE public.review_cases rc
    SET status = 'submitted',
        submitted_at = NOW(),
        submitted_by_profile_id = v_actor_profile_id,
        version = rc.version + 1,
        updated_at = NOW()
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING
      version,
      submitted_at,
      closed_at
    INTO
      v_new_version,
      v_submitted_at,
      v_closed_at;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'REVIEW',
    p_review_id,
    'REVIEW_SUBMITTED',
    jsonb_build_object(
      'status',
      jsonb_build_object(
        'before', 'draft',
        'after', 'submitted'
      )
    ),
    v_old_version,
    v_new_version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'REVIEW_SUBMITTED',
    v_actor_profile_id,
    jsonb_build_object(
      'from_status', 'draft',
      'to_status', 'submitted'
    ),
    v_new_version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'status', 'submitted',
      'version', v_new_version,
      'submitted_at', v_submitted_at,
      'closed_at', v_closed_at
    )
  );
END;
$$;


ALTER FUNCTION "public"."review_submit"("p_review_id" "uuid", "p_expected_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_type_details_key_allowed"("p_review_type" "text", "p_key" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT CASE p_review_type
    WHEN 'A' THEN p_key IN (
      'additional_notes',
      'pre_production_stage',
      'problem_found_stage',
      'order_loss_reason',
      'customer_trust_impact',
      'customer_notified'
    )
    WHEN 'B' THEN p_key IN (
      'additional_notes',
      'abnormal_phase',
      'abnormal_phenomenon',
      'defect_rate',
      'defect_items',
      'delivery_impact',
      'onsite_records'
    )
    WHEN 'C' THEN p_key IN (
      'additional_notes',
      'pre_production_stage',
      'problem_found_stage',
      'order_loss_reason',
      'customer_trust_impact',
      'customer_notified',
      'abnormal_phase',
      'abnormal_phenomenon',
      'defect_rate',
      'defect_items',
      'delivery_impact',
      'onsite_records',
      'frontend_stage',
      'production_stage',
      'root_cause_summary',
      'responsibility',
      'improvement_advice'
    )
    ELSE false
  END;
$$;


ALTER FUNCTION "public"."review_type_details_key_allowed"("p_review_type" "text", "p_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_update_draft_public"("p_review_id" "uuid", "p_expected_version" integer, "p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_old_row public.review_cases%ROWTYPE;
  v_review_row public.review_cases%ROWTYPE;
  v_title TEXT;
  v_review_type TEXT;
  v_occurred_at TIMESTAMPTZ;
  v_customer_name TEXT;
  v_order_no TEXT;
  v_project_name TEXT;
  v_product_name TEXT;
  v_process_name TEXT;
  v_description TEXT;
  v_impact_summary TEXT;
  v_risk_level TEXT;
  v_risk_reason TEXT;
  v_has_unknown BOOLEAN;
  v_changed BOOLEAN;
  v_changes JSONB := '{}'::jsonb;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_review_row.status <> 'draft' THEN
    RETURN public.review_rpc_error('DRAFT_ONLY', '仅草稿可编辑');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR v_review_row.pmo_id = v_actor_profile_id
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无编辑权限');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN public.review_rpc_error('INVALID_PATCH', 'patch 必须是 JSON 对象');
  END IF;

  SELECT bool_or(
    key NOT IN (
      'title',
      'review_type',
      'occurred_at',
      'customer_name',
      'order_no',
      'project_name',
      'product_name',
      'process_name',
      'description',
      'impact_summary',
      'risk_level',
      'risk_reason'
    )
  )
  INTO v_has_unknown
  FROM jsonb_object_keys(p_patch) AS k(key);
  IF COALESCE(v_has_unknown, false) THEN
    RETURN public.review_rpc_error('INVALID_PATCH', '包含不允许的字段');
  END IF;

  v_title := v_review_row.title;
  v_review_type := v_review_row.review_type;
  v_occurred_at := v_review_row.occurred_at;
  v_customer_name := v_review_row.customer_name;
  v_order_no := v_review_row.order_no;
  v_project_name := v_review_row.project_name;
  v_product_name := v_review_row.product_name;
  v_process_name := v_review_row.process_name;
  v_description := v_review_row.description;
  v_impact_summary := v_review_row.impact_summary;
  v_risk_level := v_review_row.risk_level;
  v_risk_reason := v_review_row.risk_reason;

  IF p_patch ? 'title' THEN
    IF p_patch->'title' = 'null'::jsonb OR jsonb_typeof(p_patch->'title') <> 'string' THEN
      RETURN public.review_rpc_error('INVALID_PATCH', 'title 必须是非空文本');
    END IF;
    v_title := trim(both from p_patch->>'title');
    IF v_title = '' THEN
      RETURN public.review_rpc_error('INVALID_PATCH', 'title 必须是非空文本');
    END IF;
  END IF;

  IF p_patch ? 'review_type' THEN
    IF p_patch->'review_type' = 'null'::jsonb OR jsonb_typeof(p_patch->'review_type') <> 'string' THEN
      RETURN public.review_rpc_error('INVALID_PATCH', 'review_type 必须为 A/B/C');
    END IF;
    IF p_patch->>'review_type' NOT IN ('A', 'B', 'C') THEN
      RETURN public.review_rpc_error('INVALID_PATCH', 'review_type 必须为 A/B/C');
    END IF;
    v_review_type := p_patch->>'review_type';
    IF v_review_type <> v_review_row.review_type THEN
      PERFORM 1
        FROM public.review_type_details d
        WHERE d.review_id = p_review_id
          AND d.org_id = v_actor_org_id;
      IF FOUND THEN
        RETURN public.review_rpc_error('TYPE_MISMATCH', '已存在专项内容，复盘类型已锁定');
      END IF;
    END IF;
  END IF;

  IF p_patch ? 'occurred_at' THEN
    IF p_patch->'occurred_at' = 'null'::jsonb OR p_patch->>'occurred_at' = '' THEN
      v_occurred_at := NULL;
    ELSIF jsonb_typeof(p_patch->'occurred_at') = 'string' THEN
      BEGIN
        v_occurred_at := (p_patch->>'occurred_at')::timestamptz;
      EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
        RETURN public.review_rpc_error('INVALID_PATCH', 'occurred_at 格式无效');
      END;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'occurred_at 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'customer_name' THEN
    IF p_patch->'customer_name' = 'null'::jsonb OR p_patch->>'customer_name' = '' THEN
      v_customer_name := NULL;
    ELSIF jsonb_typeof(p_patch->'customer_name') = 'string' THEN
      v_customer_name := trim(both from p_patch->>'customer_name');
      IF v_customer_name = '' THEN v_customer_name := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'customer_name 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'order_no' THEN
    IF p_patch->'order_no' = 'null'::jsonb OR p_patch->>'order_no' = '' THEN
      v_order_no := NULL;
    ELSIF jsonb_typeof(p_patch->'order_no') = 'string' THEN
      v_order_no := trim(both from p_patch->>'order_no');
      IF v_order_no = '' THEN v_order_no := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'order_no 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'project_name' THEN
    IF p_patch->'project_name' = 'null'::jsonb OR p_patch->>'project_name' = '' THEN
      v_project_name := NULL;
    ELSIF jsonb_typeof(p_patch->'project_name') = 'string' THEN
      v_project_name := trim(both from p_patch->>'project_name');
      IF v_project_name = '' THEN v_project_name := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'project_name 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'product_name' THEN
    IF p_patch->'product_name' = 'null'::jsonb OR p_patch->>'product_name' = '' THEN
      v_product_name := NULL;
    ELSIF jsonb_typeof(p_patch->'product_name') = 'string' THEN
      v_product_name := trim(both from p_patch->>'product_name');
      IF v_product_name = '' THEN v_product_name := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'product_name 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'process_name' THEN
    IF p_patch->'process_name' = 'null'::jsonb OR p_patch->>'process_name' = '' THEN
      v_process_name := NULL;
    ELSIF jsonb_typeof(p_patch->'process_name') = 'string' THEN
      v_process_name := trim(both from p_patch->>'process_name');
      IF v_process_name = '' THEN v_process_name := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'process_name 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'description' THEN
    IF p_patch->'description' = 'null'::jsonb OR p_patch->>'description' = '' THEN
      v_description := NULL;
    ELSIF jsonb_typeof(p_patch->'description') = 'string' THEN
      v_description := trim(both from p_patch->>'description');
      IF v_description = '' THEN v_description := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'description 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'impact_summary' THEN
    IF p_patch->'impact_summary' = 'null'::jsonb OR p_patch->>'impact_summary' = '' THEN
      v_impact_summary := NULL;
    ELSIF jsonb_typeof(p_patch->'impact_summary') = 'string' THEN
      v_impact_summary := trim(both from p_patch->>'impact_summary');
      IF v_impact_summary = '' THEN v_impact_summary := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'impact_summary 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'risk_level' THEN
    IF p_patch->'risk_level' = 'null'::jsonb THEN
      v_risk_level := NULL;
    ELSIF jsonb_typeof(p_patch->'risk_level') = 'string' THEN
      IF p_patch->>'risk_level' NOT IN ('RED', 'YELLOW', 'GREEN') THEN
        RETURN public.review_rpc_error('INVALID_PATCH', 'risk_level 必须为 RED/YELLOW/GREEN');
      END IF;
      v_risk_level := p_patch->>'risk_level';
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'risk_level 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'risk_reason' THEN
    IF p_patch->'risk_reason' = 'null'::jsonb OR p_patch->>'risk_reason' = '' THEN
      v_risk_reason := NULL;
    ELSIF jsonb_typeof(p_patch->'risk_reason') = 'string' THEN
      v_risk_reason := trim(both from p_patch->>'risk_reason');
      IF v_risk_reason = '' THEN v_risk_reason := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'risk_reason 格式无效');
    END IF;
  END IF;

  IF v_risk_level IS NULL THEN
    v_risk_reason := NULL;
  ELSIF v_risk_reason IS NULL OR btrim(v_risk_reason) = '' THEN
    RETURN public.review_rpc_error('INVALID_PATCH', 'risk_level 必须配套 risk_reason');
  END IF;

  v_changed := (
    v_title IS DISTINCT FROM v_review_row.title
    OR v_review_type IS DISTINCT FROM v_review_row.review_type
    OR v_occurred_at IS DISTINCT FROM v_review_row.occurred_at
    OR v_customer_name IS DISTINCT FROM v_review_row.customer_name
    OR v_order_no IS DISTINCT FROM v_review_row.order_no
    OR v_project_name IS DISTINCT FROM v_review_row.project_name
    OR v_product_name IS DISTINCT FROM v_review_row.product_name
    OR v_process_name IS DISTINCT FROM v_review_row.process_name
    OR v_description IS DISTINCT FROM v_review_row.description
    OR v_impact_summary IS DISTINCT FROM v_review_row.impact_summary
    OR v_risk_level IS DISTINCT FROM v_review_row.risk_level
    OR v_risk_reason IS DISTINCT FROM v_review_row.risk_reason
  );

  IF NOT v_changed THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', to_jsonb(v_review_row)
    );
  END IF;

  v_old_row := v_review_row;

  UPDATE public.review_cases rc
    SET title = v_title,
        review_type = v_review_type,
        occurred_at = v_occurred_at,
        customer_name = v_customer_name,
        order_no = v_order_no,
        project_name = v_project_name,
        product_name = v_product_name,
        process_name = v_process_name,
        description = v_description,
        impact_summary = v_impact_summary,
        risk_level = v_risk_level,
        risk_reason = v_risk_reason,
        version = rc.version + 1
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING * INTO v_review_row;

  IF v_old_row.title IS DISTINCT FROM v_review_row.title THEN
    v_changes := v_changes || jsonb_build_object(
      'title', jsonb_build_object('before', v_old_row.title, 'after', v_review_row.title)
    );
  END IF;
  IF v_old_row.review_type IS DISTINCT FROM v_review_row.review_type THEN
    v_changes := v_changes || jsonb_build_object(
      'review_type', jsonb_build_object('before', v_old_row.review_type, 'after', v_review_row.review_type)
    );
  END IF;
  IF v_old_row.occurred_at IS DISTINCT FROM v_review_row.occurred_at THEN
    v_changes := v_changes || jsonb_build_object(
      'occurred_at', jsonb_build_object('before', v_old_row.occurred_at, 'after', v_review_row.occurred_at)
    );
  END IF;
  IF v_old_row.customer_name IS DISTINCT FROM v_review_row.customer_name THEN
    v_changes := v_changes || jsonb_build_object(
      'customer_name', jsonb_build_object('before', v_old_row.customer_name, 'after', v_review_row.customer_name)
    );
  END IF;
  IF v_old_row.order_no IS DISTINCT FROM v_review_row.order_no THEN
    v_changes := v_changes || jsonb_build_object(
      'order_no', jsonb_build_object('before', v_old_row.order_no, 'after', v_review_row.order_no)
    );
  END IF;
  IF v_old_row.project_name IS DISTINCT FROM v_review_row.project_name THEN
    v_changes := v_changes || jsonb_build_object(
      'project_name', jsonb_build_object('before', v_old_row.project_name, 'after', v_review_row.project_name)
    );
  END IF;
  IF v_old_row.product_name IS DISTINCT FROM v_review_row.product_name THEN
    v_changes := v_changes || jsonb_build_object(
      'product_name', jsonb_build_object('before', v_old_row.product_name, 'after', v_review_row.product_name)
    );
  END IF;
  IF v_old_row.process_name IS DISTINCT FROM v_review_row.process_name THEN
    v_changes := v_changes || jsonb_build_object(
      'process_name', jsonb_build_object('before', v_old_row.process_name, 'after', v_review_row.process_name)
    );
  END IF;
  IF v_old_row.description IS DISTINCT FROM v_review_row.description THEN
    v_changes := v_changes || jsonb_build_object(
      'description', jsonb_build_object('before', v_old_row.description, 'after', v_review_row.description)
    );
  END IF;
  IF v_old_row.impact_summary IS DISTINCT FROM v_review_row.impact_summary THEN
    v_changes := v_changes || jsonb_build_object(
      'impact_summary', jsonb_build_object('before', v_old_row.impact_summary, 'after', v_review_row.impact_summary)
    );
  END IF;
  IF v_old_row.risk_level IS DISTINCT FROM v_review_row.risk_level THEN
    v_changes := v_changes || jsonb_build_object(
      'risk_level', jsonb_build_object('before', v_old_row.risk_level, 'after', v_review_row.risk_level)
    );
  END IF;
  IF v_old_row.risk_reason IS DISTINCT FROM v_review_row.risk_reason THEN
    v_changes := v_changes || jsonb_build_object(
      'risk_reason', jsonb_build_object('before', v_old_row.risk_reason, 'after', v_review_row.risk_reason)
    );
  END IF;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'REVIEW',
    p_review_id,
    'REVIEW_UPDATED',
    v_changes,
    v_old_row.version,
    v_review_row.version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'REVIEW_UPDATED',
    v_actor_profile_id,
    jsonb_build_object('changes', v_changes),
    v_review_row.version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', to_jsonb(v_review_row)
  );
END;
$$;


ALTER FUNCTION "public"."review_update_draft_public"("p_review_id" "uuid", "p_expected_version" integer, "p_patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_upsert_metadata"("p_review_id" "uuid", "p_expected_version" integer, "p_metadata" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_old_version INTEGER;
  v_new_version INTEGER;
  v_reason TEXT;
  v_has_unknown BOOLEAN;
  v_has_unknown_other BOOLEAN;
  v_has_invalid_other_value BOOLEAN;
  v_has_invalid_material BOOLEAN;
  v_has_unknown_material_key BOOLEAN;
  v_has_invalid_process BOOLEAN;
  v_has_invalid_domain BOOLEAN;
  v_has_invalid_symptom BOOLEAN;
  v_has_duplicate BOOLEAN;
  v_has_invalid_code BOOLEAN;
  v_material_count INTEGER;
  v_primary_count INTEGER;
  v_material_other_selected BOOLEAN;
  v_process_other_selected BOOLEAN;
  v_domain_other_selected BOOLEAN;
  v_symptom_other_selected BOOLEAN;
  v_new_materials JSONB;
  v_new_processes JSONB;
  v_new_problem_domains JSONB;
  v_new_problem_symptoms JSONB;
  v_old_materials JSONB;
  v_old_processes JSONB;
  v_old_problem_domains JSONB;
  v_old_problem_symptoms JSONB;
  v_new_material_other_text TEXT;
  v_new_process_other_text TEXT;
  v_new_problem_domain_other_text TEXT;
  v_new_problem_symptom_other_text TEXT;
  v_old_material_other_text TEXT;
  v_old_process_other_text TEXT;
  v_old_problem_domain_other_text TEXT;
  v_old_problem_symptom_other_text TEXT;
  v_changed_dimensions TEXT[] := '{}'::TEXT[];
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_review_row.status = 'draft' THEN
    IF NOT COALESCE(
      v_actor_role IN ('admin', 'manager')
      OR (
        v_actor_role <> 'viewer'
        AND v_actor_profile_id IS NOT NULL
        AND (
          v_review_row.owner_id = v_actor_profile_id
          OR (
            v_review_row.pmo_id IS NOT NULL
            AND v_review_row.pmo_id = v_actor_profile_id
          )
        )
      ),
      FALSE
    ) THEN
      RETURN public.review_rpc_error('FORBIDDEN', '无编辑权限');
    END IF;
  ELSIF v_review_row.status IN ('submitted', 'closed') THEN
    IF v_actor_role NOT IN ('admin', 'manager') THEN
      RETURN public.review_rpc_error('FORBIDDEN', '仅管理员或主管可修正复盘分类');
    END IF;
  ELSE
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改复盘分类');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'metadata 必须是 JSON 对象');
  END IF;

  SELECT bool_or(
    key NOT IN ('materials', 'processes', 'problemDomains', 'problemSymptoms', 'other', 'reason')
  )
  INTO v_has_unknown
  FROM jsonb_object_keys(p_metadata) AS k(key);
  IF COALESCE(v_has_unknown, false) THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'metadata 包含不允许的字段');
  END IF;

  IF (p_metadata ? 'reason') AND jsonb_typeof(p_metadata->'reason') NOT IN ('string', 'null') THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'reason 格式无效');
  END IF;

  IF v_review_row.status <> 'draft' THEN
    v_reason := NULLIF(btrim(COALESCE(p_metadata->>'reason', '')), '');
    IF v_reason IS NULL OR v_reason = '' THEN
      RETURN public.review_rpc_error('INVALID_METADATA', '提交后修正必须填写理由');
    END IF;
    IF char_length(v_reason) > 1000 THEN
      RETURN public.review_rpc_error('INVALID_METADATA', '修正理由过长');
    END IF;
  END IF;

  IF (p_metadata ? 'materials') AND jsonb_typeof(p_metadata->'materials') <> 'array' THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'materials 必须是数组');
  END IF;
  IF (p_metadata ? 'processes') AND jsonb_typeof(p_metadata->'processes') <> 'array' THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'processes 必须是数组');
  END IF;
  IF (p_metadata ? 'problemDomains') AND jsonb_typeof(p_metadata->'problemDomains') <> 'array' THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'problemDomains 必须是数组');
  END IF;
  IF (p_metadata ? 'problemSymptoms') AND jsonb_typeof(p_metadata->'problemSymptoms') <> 'array' THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'problemSymptoms 必须是数组');
  END IF;
  IF (p_metadata ? 'other') AND jsonb_typeof(p_metadata->'other') <> 'object' THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'other 必须是 JSON 对象');
  END IF;

  IF p_metadata ? 'other' THEN
    SELECT bool_or(
      key NOT IN (
        'materialOtherText',
        'processOtherText',
        'problemDomainOtherText',
        'problemSymptomOtherText'
      )
    )
    INTO v_has_unknown_other
    FROM jsonb_object_keys(p_metadata->'other') AS k(key);
    IF COALESCE(v_has_unknown_other, false) THEN
      RETURN public.review_rpc_error('INVALID_METADATA', 'other 包含不允许的字段');
    END IF;

    SELECT bool_or(jsonb_typeof(v) NOT IN ('string', 'null'))
    INTO v_has_invalid_other_value
    FROM jsonb_each(p_metadata->'other') AS e(k, v);
    IF COALESCE(v_has_invalid_other_value, false) THEN
      RETURN public.review_rpc_error('INVALID_METADATA', 'other 文本格式无效');
    END IF;
  END IF;

  SELECT bool_or(
    jsonb_typeof(e) <> 'object'
    OR NOT (e ? 'code')
    OR jsonb_typeof(e->'code') <> 'string'
    OR btrim(e->>'code') = ''
    OR (
      e ? 'isPrimary'
      AND jsonb_typeof(e->'isPrimary') <> 'boolean'
    )
  )
  INTO v_has_invalid_material
  FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e;
  IF COALESCE(v_has_invalid_material, false) THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'materials 格式无效');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e
    WHERE EXISTS (
      SELECT 1
      FROM jsonb_object_keys(e) AS k(key)
      WHERE key NOT IN ('code', 'isPrimary')
    )
  )
  INTO v_has_unknown_material_key;
  IF v_has_unknown_material_key THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'materials 包含不允许的字段');
  END IF;

  SELECT bool_or(
    jsonb_typeof(e) <> 'string' OR btrim(e #>> '{}') = ''
  )
  INTO v_has_invalid_process
  FROM jsonb_array_elements(COALESCE(p_metadata->'processes', '[]'::jsonb)) e;
  IF COALESCE(v_has_invalid_process, false) THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'processes 格式无效');
  END IF;

  SELECT bool_or(
    jsonb_typeof(e) <> 'string' OR btrim(e #>> '{}') = ''
  )
  INTO v_has_invalid_domain
  FROM jsonb_array_elements(COALESCE(p_metadata->'problemDomains', '[]'::jsonb)) e;
  IF COALESCE(v_has_invalid_domain, false) THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'problemDomains 格式无效');
  END IF;

  SELECT bool_or(
    jsonb_typeof(e) <> 'string' OR btrim(e #>> '{}') = ''
  )
  INTO v_has_invalid_symptom
  FROM jsonb_array_elements(COALESCE(p_metadata->'problemSymptoms', '[]'::jsonb)) e;
  IF COALESCE(v_has_invalid_symptom, false) THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'problemSymptoms 格式无效');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT 'MATERIAL' AS metadata_type, btrim(e->>'code') AS code
      FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e
      UNION ALL
      SELECT 'PROCESS', btrim(e #>> '{}')
      FROM jsonb_array_elements(COALESCE(p_metadata->'processes', '[]'::jsonb)) e
      UNION ALL
      SELECT 'PROBLEM_DOMAIN', btrim(e #>> '{}')
      FROM jsonb_array_elements(COALESCE(p_metadata->'problemDomains', '[]'::jsonb)) e
      UNION ALL
      SELECT 'PROBLEM_SYMPTOM', btrim(e #>> '{}')
      FROM jsonb_array_elements(COALESCE(p_metadata->'problemSymptoms', '[]'::jsonb)) e
    ) codes
    GROUP BY metadata_type, code
    HAVING count(*) > 1
  )
  INTO v_has_duplicate;
  IF v_has_duplicate THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '同一分类不能重复');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT 'MATERIAL' AS metadata_type, btrim(e->>'code') AS code
      FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e
      UNION ALL
      SELECT 'PROCESS', btrim(e #>> '{}')
      FROM jsonb_array_elements(COALESCE(p_metadata->'processes', '[]'::jsonb)) e
      UNION ALL
      SELECT 'PROBLEM_DOMAIN', btrim(e #>> '{}')
      FROM jsonb_array_elements(COALESCE(p_metadata->'problemDomains', '[]'::jsonb)) e
      UNION ALL
      SELECT 'PROBLEM_SYMPTOM', btrim(e #>> '{}')
      FROM jsonb_array_elements(COALESCE(p_metadata->'problemSymptoms', '[]'::jsonb)) e
    ) codes
    WHERE NOT EXISTS (
      SELECT 1 FROM public.review_dict_items d
      WHERE d.dict_type = codes.metadata_type
        AND d.code = codes.code
        AND d.org_id IS NULL
        AND d.is_system = TRUE
        AND d.enabled = TRUE
    )
  )
  INTO v_has_invalid_code;
  IF v_has_invalid_code THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '包含未知或不可用的分类');
  END IF;

  SELECT count(*)
  INTO v_material_count
  FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e;

  SELECT count(*)
  INTO v_primary_count
  FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e
  WHERE COALESCE((e->>'isPrimary')::boolean, false);

  IF v_material_count > 0 AND v_primary_count <> 1 THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '材质必须且只能有一个主要材质');
  END IF;

  v_new_material_other_text := NULLIF(btrim(COALESCE(p_metadata->'other'->>'materialOtherText', '')), '');
  v_new_process_other_text := NULLIF(btrim(COALESCE(p_metadata->'other'->>'processOtherText', '')), '');
  v_new_problem_domain_other_text := NULLIF(btrim(COALESCE(p_metadata->'other'->>'problemDomainOtherText', '')), '');
  v_new_problem_symptom_other_text := NULLIF(btrim(COALESCE(p_metadata->'other'->>'problemSymptomOtherText', '')), '');

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e
    WHERE btrim(e->>'code') = 'OTHER'
  )
  INTO v_material_other_selected;
  IF NOT v_material_other_selected THEN
    v_new_material_other_text := NULL;
  ELSIF v_new_material_other_text IS NULL THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '选择其他材质时必须填写说明');
  ELSIF char_length(v_new_material_other_text) > 200 THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '其他材质说明过长');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_metadata->'processes', '[]'::jsonb)) e
    WHERE btrim(e #>> '{}') = 'OTHER'
  )
  INTO v_process_other_selected;
  IF NOT v_process_other_selected THEN
    v_new_process_other_text := NULL;
  ELSIF v_new_process_other_text IS NULL THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '选择其他工艺时必须填写说明');
  ELSIF char_length(v_new_process_other_text) > 200 THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '其他工艺说明过长');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_metadata->'problemDomains', '[]'::jsonb)) e
    WHERE btrim(e #>> '{}') = 'OTHER'
  )
  INTO v_domain_other_selected;
  IF NOT v_domain_other_selected THEN
    v_new_problem_domain_other_text := NULL;
  ELSIF v_new_problem_domain_other_text IS NULL THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '选择其他问题领域时必须填写说明');
  ELSIF char_length(v_new_problem_domain_other_text) > 200 THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '其他问题领域说明过长');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_metadata->'problemSymptoms', '[]'::jsonb)) e
    WHERE btrim(e #>> '{}') = 'OTHER'
  )
  INTO v_symptom_other_selected;
  IF NOT v_symptom_other_selected THEN
    v_new_problem_symptom_other_text := NULL;
  ELSIF v_new_problem_symptom_other_text IS NULL THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '选择其他问题表现时必须填写说明');
  ELSIF char_length(v_new_problem_symptom_other_text) > 200 THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '其他问题表现说明过长');
  END IF;

  v_new_materials := COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'code', btrim(e->>'code'),
        'isPrimary', COALESCE((e->>'isPrimary')::boolean, false)
      )
      ORDER BY btrim(e->>'code')
    )
    FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e
  ), '[]'::jsonb);

  v_new_processes := COALESCE((
    SELECT jsonb_agg(btrim(e #>> '{}') ORDER BY btrim(e #>> '{}'))
    FROM jsonb_array_elements(COALESCE(p_metadata->'processes', '[]'::jsonb)) e
  ), '[]'::jsonb);

  v_new_problem_domains := COALESCE((
    SELECT jsonb_agg(btrim(e #>> '{}') ORDER BY btrim(e #>> '{}'))
    FROM jsonb_array_elements(COALESCE(p_metadata->'problemDomains', '[]'::jsonb)) e
  ), '[]'::jsonb);

  v_new_problem_symptoms := COALESCE((
    SELECT jsonb_agg(btrim(e #>> '{}') ORDER BY btrim(e #>> '{}'))
    FROM jsonb_array_elements(COALESCE(p_metadata->'problemSymptoms', '[]'::jsonb)) e
  ), '[]'::jsonb);

  v_old_materials := COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('code', d.code, 'isPrimary', mi.is_primary)
      ORDER BY d.code
    )
    FROM public.review_metadata_items mi
    JOIN public.review_dict_items d
      ON d.id = mi.dict_item_id
     AND d.dict_type = mi.metadata_type
    WHERE mi.review_id = p_review_id
      AND mi.org_id = v_actor_org_id
      AND mi.metadata_type = 'MATERIAL'
  ), '[]'::jsonb);

  v_old_processes := COALESCE((
    SELECT jsonb_agg(d.code ORDER BY d.code)
    FROM public.review_metadata_items mi
    JOIN public.review_dict_items d
      ON d.id = mi.dict_item_id
     AND d.dict_type = mi.metadata_type
    WHERE mi.review_id = p_review_id
      AND mi.org_id = v_actor_org_id
      AND mi.metadata_type = 'PROCESS'
  ), '[]'::jsonb);

  v_old_problem_domains := COALESCE((
    SELECT jsonb_agg(d.code ORDER BY d.code)
    FROM public.review_metadata_items mi
    JOIN public.review_dict_items d
      ON d.id = mi.dict_item_id
     AND d.dict_type = mi.metadata_type
    WHERE mi.review_id = p_review_id
      AND mi.org_id = v_actor_org_id
      AND mi.metadata_type = 'PROBLEM_DOMAIN'
  ), '[]'::jsonb);

  v_old_problem_symptoms := COALESCE((
    SELECT jsonb_agg(d.code ORDER BY d.code)
    FROM public.review_metadata_items mi
    JOIN public.review_dict_items d
      ON d.id = mi.dict_item_id
     AND d.dict_type = mi.metadata_type
    WHERE mi.review_id = p_review_id
      AND mi.org_id = v_actor_org_id
      AND mi.metadata_type = 'PROBLEM_SYMPTOM'
  ), '[]'::jsonb);

  SELECT material_other_text,
         process_other_text,
         problem_domain_other_text,
         problem_symptom_other_text
    INTO v_old_material_other_text,
         v_old_process_other_text,
         v_old_problem_domain_other_text,
         v_old_problem_symptom_other_text
    FROM public.review_metadata m
    WHERE m.review_id = p_review_id
      AND m.org_id = v_actor_org_id;

  IF v_old_materials IS NOT DISTINCT FROM v_new_materials
     AND v_old_processes IS NOT DISTINCT FROM v_new_processes
     AND v_old_problem_domains IS NOT DISTINCT FROM v_new_problem_domains
     AND v_old_problem_symptoms IS NOT DISTINCT FROM v_new_problem_symptoms
     AND v_old_material_other_text IS NOT DISTINCT FROM v_new_material_other_text
     AND v_old_process_other_text IS NOT DISTINCT FROM v_new_process_other_text
     AND v_old_problem_domain_other_text IS NOT DISTINCT FROM v_new_problem_domain_other_text
     AND v_old_problem_symptom_other_text IS NOT DISTINCT FROM v_new_problem_symptom_other_text
  THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', jsonb_build_object(
        'newVersion', v_review_row.version,
        'metadata', jsonb_build_object(
          'materials', v_new_materials,
          'processes', v_new_processes,
          'problemDomains', v_new_problem_domains,
          'problemSymptoms', v_new_problem_symptoms,
          'other', jsonb_build_object(
            'materialOtherText', v_new_material_other_text,
            'processOtherText', v_new_process_other_text,
            'problemDomainOtherText', v_new_problem_domain_other_text,
            'problemSymptomOtherText', v_new_problem_symptom_other_text
          )
        )
      )
    );
  END IF;

  IF v_old_materials IS DISTINCT FROM v_new_materials THEN
    v_changed_dimensions := array_append(v_changed_dimensions, 'MATERIAL');
  END IF;
  IF v_old_processes IS DISTINCT FROM v_new_processes THEN
    v_changed_dimensions := array_append(v_changed_dimensions, 'PROCESS');
  END IF;
  IF v_old_problem_domains IS DISTINCT FROM v_new_problem_domains THEN
    v_changed_dimensions := array_append(v_changed_dimensions, 'PROBLEM_DOMAIN');
  END IF;
  IF v_old_problem_symptoms IS DISTINCT FROM v_new_problem_symptoms THEN
    v_changed_dimensions := array_append(v_changed_dimensions, 'PROBLEM_SYMPTOM');
  END IF;
  IF v_old_material_other_text IS DISTINCT FROM v_new_material_other_text
     OR v_old_process_other_text IS DISTINCT FROM v_new_process_other_text
     OR v_old_problem_domain_other_text IS DISTINCT FROM v_new_problem_domain_other_text
     OR v_old_problem_symptom_other_text IS DISTINCT FROM v_new_problem_symptom_other_text
  THEN
    v_changed_dimensions := array_append(v_changed_dimensions, 'OTHER_TEXT');
  END IF;

  v_old_version := v_review_row.version;

  DELETE FROM public.review_metadata_items
    WHERE review_id = p_review_id
      AND org_id = v_actor_org_id;

  INSERT INTO public.review_metadata_items (
    review_id,
    org_id,
    metadata_type,
    dict_item_id,
    is_primary
  )
  SELECT
    p_review_id,
    v_actor_org_id,
    codes.metadata_type,
    d.id,
    codes.is_primary
  FROM (
    SELECT
      'MATERIAL' AS metadata_type,
      btrim(e->>'code') AS code,
      COALESCE((e->>'isPrimary')::boolean, false) AS is_primary
    FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e
    UNION ALL
    SELECT 'PROCESS', btrim(e #>> '{}'), false
    FROM jsonb_array_elements(COALESCE(p_metadata->'processes', '[]'::jsonb)) e
    UNION ALL
    SELECT 'PROBLEM_DOMAIN', btrim(e #>> '{}'), false
    FROM jsonb_array_elements(COALESCE(p_metadata->'problemDomains', '[]'::jsonb)) e
    UNION ALL
    SELECT 'PROBLEM_SYMPTOM', btrim(e #>> '{}'), false
    FROM jsonb_array_elements(COALESCE(p_metadata->'problemSymptoms', '[]'::jsonb)) e
  ) codes
  JOIN public.review_dict_items d
    ON d.dict_type = codes.metadata_type
   AND d.code = codes.code
   AND d.org_id IS NULL
   AND d.is_system = TRUE
   AND d.enabled = TRUE;

  INSERT INTO public.review_metadata (
    review_id,
    org_id,
    material_other_text,
    process_other_text,
    problem_domain_other_text,
    problem_symptom_other_text
  )
  VALUES (
    p_review_id,
    v_actor_org_id,
    v_new_material_other_text,
    v_new_process_other_text,
    v_new_problem_domain_other_text,
    v_new_problem_symptom_other_text
  )
  ON CONFLICT (review_id) DO UPDATE SET
    material_other_text = EXCLUDED.material_other_text,
    process_other_text = EXCLUDED.process_other_text,
    problem_domain_other_text = EXCLUDED.problem_domain_other_text,
    problem_symptom_other_text = EXCLUDED.problem_symptom_other_text,
    updated_at = NOW();

  UPDATE public.review_cases rc
    SET version = rc.version + 1,
        updated_at = NOW()
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING version INTO v_new_version;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'REVIEW_METADATA',
    p_review_id,
    'REVIEW_METADATA_UPDATED',
    jsonb_build_object(
      'changedDimensions', to_jsonb(v_changed_dimensions),
      'beforeCodes', jsonb_build_object(
        'materials', v_old_materials,
        'processes', v_old_processes,
        'problemDomains', v_old_problem_domains,
        'problemSymptoms', v_old_problem_symptoms
      ),
      'afterCodes', jsonb_build_object(
        'materials', v_new_materials,
        'processes', v_new_processes,
        'problemDomains', v_new_problem_domains,
        'problemSymptoms', v_new_problem_symptoms
      )
    ),
    v_old_version,
    v_new_version
  );

  IF v_review_row.status <> 'draft' THEN
    INSERT INTO public.review_timeline_events (
      org_id,
      review_id,
      event_type,
      actor_profile_id,
      payload,
      version
    )
    VALUES (
      v_actor_org_id,
      p_review_id,
      'REVIEW_METADATA_UPDATED',
      v_actor_profile_id,
      jsonb_build_object('changedDimensions', to_jsonb(v_changed_dimensions)),
      v_new_version
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'newVersion', v_new_version,
      'metadata', jsonb_build_object(
        'materials', v_new_materials,
        'processes', v_new_processes,
        'problemDomains', v_new_problem_domains,
        'problemSymptoms', v_new_problem_symptoms,
        'other', jsonb_build_object(
          'materialOtherText', v_new_material_other_text,
          'processOtherText', v_new_process_other_text,
          'problemDomainOtherText', v_new_problem_domain_other_text,
          'problemSymptomOtherText', v_new_problem_symptom_other_text
        )
      )
    )
  );
END;
$$;


ALTER FUNCTION "public"."review_upsert_metadata"("p_review_id" "uuid", "p_expected_version" integer, "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_upsert_type_details"("p_review_id" "uuid", "p_expected_version" integer, "p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_details_row public.review_type_details%ROWTYPE;
  v_old_details public.review_type_details%ROWTYPE;
  v_details_exists BOOLEAN := false;
  v_has_unknown BOOLEAN;
  v_has_business_value BOOLEAN;
  v_additional_notes JSONB := '{}'::jsonb;
  v_pre_production_stage TEXT;
  v_problem_found_stage TEXT;
  v_order_loss_reason TEXT;
  v_customer_trust_impact TEXT;
  v_customer_notified BOOLEAN;
  v_abnormal_phase TEXT;
  v_abnormal_phenomenon TEXT;
  v_defect_rate NUMERIC(7,4);
  v_defect_items TEXT;
  v_delivery_impact TEXT;
  v_onsite_records TEXT;
  v_frontend_stage TEXT;
  v_production_stage TEXT;
  v_root_cause_summary TEXT;
  v_responsibility TEXT;
  v_improvement_advice TEXT;
  v_changed BOOLEAN;
  v_new_version INTEGER;
  v_changes JSONB := '{}'::jsonb;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_review_row.status <> 'draft' THEN
    RETURN public.review_rpc_error('DRAFT_ONLY', '仅草稿可编辑');
  END IF;

  IF NOT (
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR v_review_row.pmo_id = v_actor_profile_id
      )
    )
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无编辑权限');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN public.review_rpc_error('INVALID_PATCH', 'patch 必须是 JSON 对象');
  END IF;

  SELECT bool_or(
    NOT public.review_type_details_key_allowed(v_review_row.review_type, key)
  )
  INTO v_has_unknown
  FROM jsonb_object_keys(p_patch) AS k(key);
  IF COALESCE(v_has_unknown, false) THEN
    RETURN public.review_rpc_error('INVALID_PATCH', '包含当前类型不允许的字段');
  END IF;

  SELECT d.* INTO v_details_row
    FROM public.review_type_details d
    WHERE d.review_id = p_review_id
      AND d.org_id = v_actor_org_id;
  v_details_exists := FOUND;

  IF v_details_exists THEN
    v_additional_notes := v_details_row.additional_notes;
    v_pre_production_stage := v_details_row.pre_production_stage;
    v_problem_found_stage := v_details_row.problem_found_stage;
    v_order_loss_reason := v_details_row.order_loss_reason;
    v_customer_trust_impact := v_details_row.customer_trust_impact;
    v_customer_notified := v_details_row.customer_notified;
    v_abnormal_phase := v_details_row.abnormal_phase;
    v_abnormal_phenomenon := v_details_row.abnormal_phenomenon;
    v_defect_rate := v_details_row.defect_rate;
    v_defect_items := v_details_row.defect_items;
    v_delivery_impact := v_details_row.delivery_impact;
    v_onsite_records := v_details_row.onsite_records;
    v_frontend_stage := v_details_row.frontend_stage;
    v_production_stage := v_details_row.production_stage;
    v_root_cause_summary := v_details_row.root_cause_summary;
    v_responsibility := v_details_row.responsibility;
    v_improvement_advice := v_details_row.improvement_advice;
  END IF;

  IF p_patch ? 'additional_notes' THEN
    IF p_patch->'additional_notes' = 'null'::jsonb THEN
      v_additional_notes := '{}'::jsonb;
    ELSIF jsonb_typeof(p_patch->'additional_notes') = 'object' THEN
      v_additional_notes := p_patch->'additional_notes';
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'additional_notes 必须是 JSON 对象');
    END IF;
  END IF;

  IF p_patch ? 'pre_production_stage' THEN
    IF p_patch->'pre_production_stage' = 'null'::jsonb OR p_patch->>'pre_production_stage' = '' THEN
      v_pre_production_stage := NULL;
    ELSIF jsonb_typeof(p_patch->'pre_production_stage') = 'string' THEN
      v_pre_production_stage := trim(both from p_patch->>'pre_production_stage');
      IF v_pre_production_stage = '' THEN v_pre_production_stage := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'pre_production_stage 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'problem_found_stage' THEN
    IF p_patch->'problem_found_stage' = 'null'::jsonb OR p_patch->>'problem_found_stage' = '' THEN
      v_problem_found_stage := NULL;
    ELSIF jsonb_typeof(p_patch->'problem_found_stage') = 'string' THEN
      v_problem_found_stage := trim(both from p_patch->>'problem_found_stage');
      IF v_problem_found_stage = '' THEN v_problem_found_stage := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'problem_found_stage 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'order_loss_reason' THEN
    IF p_patch->'order_loss_reason' = 'null'::jsonb OR p_patch->>'order_loss_reason' = '' THEN
      v_order_loss_reason := NULL;
    ELSIF jsonb_typeof(p_patch->'order_loss_reason') = 'string' THEN
      v_order_loss_reason := trim(both from p_patch->>'order_loss_reason');
      IF v_order_loss_reason = '' THEN v_order_loss_reason := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'order_loss_reason 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'customer_trust_impact' THEN
    IF p_patch->'customer_trust_impact' = 'null'::jsonb OR p_patch->>'customer_trust_impact' = '' THEN
      v_customer_trust_impact := NULL;
    ELSIF jsonb_typeof(p_patch->'customer_trust_impact') = 'string' THEN
      v_customer_trust_impact := trim(both from p_patch->>'customer_trust_impact');
      IF v_customer_trust_impact = '' THEN v_customer_trust_impact := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'customer_trust_impact 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'customer_notified' THEN
    IF p_patch->'customer_notified' = 'null'::jsonb THEN
      v_customer_notified := NULL;
    ELSIF jsonb_typeof(p_patch->'customer_notified') = 'boolean' THEN
      v_customer_notified := (p_patch->>'customer_notified')::boolean;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'customer_notified 必须是布尔值');
    END IF;
  END IF;

  IF p_patch ? 'abnormal_phase' THEN
    IF p_patch->'abnormal_phase' = 'null'::jsonb OR p_patch->>'abnormal_phase' = '' THEN
      v_abnormal_phase := NULL;
    ELSIF jsonb_typeof(p_patch->'abnormal_phase') = 'string' THEN
      v_abnormal_phase := trim(both from p_patch->>'abnormal_phase');
      IF v_abnormal_phase = '' THEN v_abnormal_phase := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'abnormal_phase 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'abnormal_phenomenon' THEN
    IF p_patch->'abnormal_phenomenon' = 'null'::jsonb OR p_patch->>'abnormal_phenomenon' = '' THEN
      v_abnormal_phenomenon := NULL;
    ELSIF jsonb_typeof(p_patch->'abnormal_phenomenon') = 'string' THEN
      v_abnormal_phenomenon := trim(both from p_patch->>'abnormal_phenomenon');
      IF v_abnormal_phenomenon = '' THEN v_abnormal_phenomenon := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'abnormal_phenomenon 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'defect_rate' THEN
    IF p_patch->'defect_rate' = 'null'::jsonb THEN
      v_defect_rate := NULL;
    ELSIF jsonb_typeof(p_patch->'defect_rate') IN ('number', 'string') THEN
      BEGIN
        v_defect_rate := (p_patch->>'defect_rate')::numeric(7,4);
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RETURN public.review_rpc_error('INVALID_PATCH', 'defect_rate 格式无效');
      END;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'defect_rate 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'defect_items' THEN
    IF p_patch->'defect_items' = 'null'::jsonb OR p_patch->>'defect_items' = '' THEN
      v_defect_items := NULL;
    ELSIF jsonb_typeof(p_patch->'defect_items') = 'string' THEN
      v_defect_items := trim(both from p_patch->>'defect_items');
      IF v_defect_items = '' THEN v_defect_items := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'defect_items 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'delivery_impact' THEN
    IF p_patch->'delivery_impact' = 'null'::jsonb OR p_patch->>'delivery_impact' = '' THEN
      v_delivery_impact := NULL;
    ELSIF jsonb_typeof(p_patch->'delivery_impact') = 'string' THEN
      v_delivery_impact := trim(both from p_patch->>'delivery_impact');
      IF v_delivery_impact = '' THEN v_delivery_impact := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'delivery_impact 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'onsite_records' THEN
    IF p_patch->'onsite_records' = 'null'::jsonb OR p_patch->>'onsite_records' = '' THEN
      v_onsite_records := NULL;
    ELSIF jsonb_typeof(p_patch->'onsite_records') = 'string' THEN
      v_onsite_records := trim(both from p_patch->>'onsite_records');
      IF v_onsite_records = '' THEN v_onsite_records := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'onsite_records 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'frontend_stage' THEN
    IF p_patch->'frontend_stage' = 'null'::jsonb OR p_patch->>'frontend_stage' = '' THEN
      v_frontend_stage := NULL;
    ELSIF jsonb_typeof(p_patch->'frontend_stage') = 'string' THEN
      v_frontend_stage := trim(both from p_patch->>'frontend_stage');
      IF v_frontend_stage = '' THEN v_frontend_stage := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'frontend_stage 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'production_stage' THEN
    IF p_patch->'production_stage' = 'null'::jsonb OR p_patch->>'production_stage' = '' THEN
      v_production_stage := NULL;
    ELSIF jsonb_typeof(p_patch->'production_stage') = 'string' THEN
      v_production_stage := trim(both from p_patch->>'production_stage');
      IF v_production_stage = '' THEN v_production_stage := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'production_stage 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'root_cause_summary' THEN
    IF p_patch->'root_cause_summary' = 'null'::jsonb OR p_patch->>'root_cause_summary' = '' THEN
      v_root_cause_summary := NULL;
    ELSIF jsonb_typeof(p_patch->'root_cause_summary') = 'string' THEN
      v_root_cause_summary := trim(both from p_patch->>'root_cause_summary');
      IF v_root_cause_summary = '' THEN v_root_cause_summary := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'root_cause_summary 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'responsibility' THEN
    IF p_patch->'responsibility' = 'null'::jsonb OR p_patch->>'responsibility' = '' THEN
      v_responsibility := NULL;
    ELSIF jsonb_typeof(p_patch->'responsibility') = 'string' THEN
      v_responsibility := trim(both from p_patch->>'responsibility');
      IF v_responsibility = '' THEN v_responsibility := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'responsibility 格式无效');
    END IF;
  END IF;

  IF p_patch ? 'improvement_advice' THEN
    IF p_patch->'improvement_advice' = 'null'::jsonb OR p_patch->>'improvement_advice' = '' THEN
      v_improvement_advice := NULL;
    ELSIF jsonb_typeof(p_patch->'improvement_advice') = 'string' THEN
      v_improvement_advice := trim(both from p_patch->>'improvement_advice');
      IF v_improvement_advice = '' THEN v_improvement_advice := NULL; END IF;
    ELSE
      RETURN public.review_rpc_error('INVALID_PATCH', 'improvement_advice 格式无效');
    END IF;
  END IF;

  v_has_business_value := (
    v_pre_production_stage IS NOT NULL
    OR v_problem_found_stage IS NOT NULL
    OR v_order_loss_reason IS NOT NULL
    OR v_customer_trust_impact IS NOT NULL
    OR v_customer_notified IS NOT NULL
    OR v_abnormal_phase IS NOT NULL
    OR v_abnormal_phenomenon IS NOT NULL
    OR v_defect_rate IS NOT NULL
    OR v_defect_items IS NOT NULL
    OR v_delivery_impact IS NOT NULL
    OR v_onsite_records IS NOT NULL
    OR v_frontend_stage IS NOT NULL
    OR v_production_stage IS NOT NULL
    OR v_root_cause_summary IS NOT NULL
    OR v_responsibility IS NOT NULL
    OR v_improvement_advice IS NOT NULL
    OR (
      jsonb_typeof(v_additional_notes) = 'object'
      AND v_additional_notes <> '{}'::jsonb
    )
  );

  v_changed := (
    (NOT v_details_exists AND v_has_business_value)
    OR (
      v_details_exists
      AND (
        v_additional_notes IS DISTINCT FROM v_details_row.additional_notes
        OR v_pre_production_stage IS DISTINCT FROM v_details_row.pre_production_stage
        OR v_problem_found_stage IS DISTINCT FROM v_details_row.problem_found_stage
        OR v_order_loss_reason IS DISTINCT FROM v_details_row.order_loss_reason
        OR v_customer_trust_impact IS DISTINCT FROM v_details_row.customer_trust_impact
        OR v_customer_notified IS DISTINCT FROM v_details_row.customer_notified
        OR v_abnormal_phase IS DISTINCT FROM v_details_row.abnormal_phase
        OR v_abnormal_phenomenon IS DISTINCT FROM v_details_row.abnormal_phenomenon
        OR v_defect_rate IS DISTINCT FROM v_details_row.defect_rate
        OR v_defect_items IS DISTINCT FROM v_details_row.defect_items
        OR v_delivery_impact IS DISTINCT FROM v_details_row.delivery_impact
        OR v_onsite_records IS DISTINCT FROM v_details_row.onsite_records
        OR v_frontend_stage IS DISTINCT FROM v_details_row.frontend_stage
        OR v_production_stage IS DISTINCT FROM v_details_row.production_stage
        OR v_root_cause_summary IS DISTINCT FROM v_details_row.root_cause_summary
        OR v_responsibility IS DISTINCT FROM v_details_row.responsibility
        OR v_improvement_advice IS DISTINCT FROM v_details_row.improvement_advice
      )
    )
  );

  v_new_version := v_review_row.version;

  IF NOT v_changed THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', jsonb_build_object(
        'type_details',
        CASE WHEN v_details_exists THEN to_jsonb(v_details_row) ELSE null::jsonb END,
        'version', v_new_version
      )
    );
  END IF;

  IF NOT v_details_exists THEN
    INSERT INTO public.review_type_details (
      review_id,
      org_id,
      review_type,
      created_by,
      pre_production_stage,
      problem_found_stage,
      order_loss_reason,
      customer_trust_impact,
      customer_notified,
      abnormal_phase,
      abnormal_phenomenon,
      defect_rate,
      defect_items,
      delivery_impact,
      onsite_records,
      frontend_stage,
      production_stage,
      root_cause_summary,
      responsibility,
      improvement_advice,
      additional_notes
    )
    VALUES (
      p_review_id,
      v_actor_org_id,
      v_review_row.review_type,
      v_actor_profile_id,
      v_pre_production_stage,
      v_problem_found_stage,
      v_order_loss_reason,
      v_customer_trust_impact,
      v_customer_notified,
      v_abnormal_phase,
      v_abnormal_phenomenon,
      v_defect_rate,
      v_defect_items,
      v_delivery_impact,
      v_onsite_records,
      v_frontend_stage,
      v_production_stage,
      v_root_cause_summary,
      v_responsibility,
      v_improvement_advice,
      v_additional_notes
    )
    RETURNING * INTO v_details_row;
    v_changes := jsonb_build_object('created', true, 'review_type', v_review_row.review_type);
  ELSE
    v_old_details := v_details_row;
    UPDATE public.review_type_details d
      SET pre_production_stage = v_pre_production_stage,
          problem_found_stage = v_problem_found_stage,
          order_loss_reason = v_order_loss_reason,
          customer_trust_impact = v_customer_trust_impact,
          customer_notified = v_customer_notified,
          abnormal_phase = v_abnormal_phase,
          abnormal_phenomenon = v_abnormal_phenomenon,
          defect_rate = v_defect_rate,
          defect_items = v_defect_items,
          delivery_impact = v_delivery_impact,
          onsite_records = v_onsite_records,
          frontend_stage = v_frontend_stage,
          production_stage = v_production_stage,
          root_cause_summary = v_root_cause_summary,
          responsibility = v_responsibility,
          improvement_advice = v_improvement_advice,
          additional_notes = v_additional_notes
      WHERE d.review_id = p_review_id
        AND d.org_id = v_actor_org_id
      RETURNING * INTO v_details_row;

    IF v_old_details.additional_notes IS DISTINCT FROM v_details_row.additional_notes THEN
      v_changes := v_changes || jsonb_build_object(
        'additional_notes', jsonb_build_object('before', v_old_details.additional_notes, 'after', v_details_row.additional_notes)
      );
    END IF;
    IF v_old_details.pre_production_stage IS DISTINCT FROM v_details_row.pre_production_stage THEN
      v_changes := v_changes || jsonb_build_object(
        'pre_production_stage', jsonb_build_object('before', v_old_details.pre_production_stage, 'after', v_details_row.pre_production_stage)
      );
    END IF;
    IF v_old_details.problem_found_stage IS DISTINCT FROM v_details_row.problem_found_stage THEN
      v_changes := v_changes || jsonb_build_object(
        'problem_found_stage', jsonb_build_object('before', v_old_details.problem_found_stage, 'after', v_details_row.problem_found_stage)
      );
    END IF;
    IF v_old_details.order_loss_reason IS DISTINCT FROM v_details_row.order_loss_reason THEN
      v_changes := v_changes || jsonb_build_object(
        'order_loss_reason', jsonb_build_object('before', v_old_details.order_loss_reason, 'after', v_details_row.order_loss_reason)
      );
    END IF;
    IF v_old_details.customer_trust_impact IS DISTINCT FROM v_details_row.customer_trust_impact THEN
      v_changes := v_changes || jsonb_build_object(
        'customer_trust_impact', jsonb_build_object('before', v_old_details.customer_trust_impact, 'after', v_details_row.customer_trust_impact)
      );
    END IF;
    IF v_old_details.customer_notified IS DISTINCT FROM v_details_row.customer_notified THEN
      v_changes := v_changes || jsonb_build_object(
        'customer_notified', jsonb_build_object('before', v_old_details.customer_notified, 'after', v_details_row.customer_notified)
      );
    END IF;
    IF v_old_details.abnormal_phase IS DISTINCT FROM v_details_row.abnormal_phase THEN
      v_changes := v_changes || jsonb_build_object(
        'abnormal_phase', jsonb_build_object('before', v_old_details.abnormal_phase, 'after', v_details_row.abnormal_phase)
      );
    END IF;
    IF v_old_details.abnormal_phenomenon IS DISTINCT FROM v_details_row.abnormal_phenomenon THEN
      v_changes := v_changes || jsonb_build_object(
        'abnormal_phenomenon', jsonb_build_object('before', v_old_details.abnormal_phenomenon, 'after', v_details_row.abnormal_phenomenon)
      );
    END IF;
    IF v_old_details.defect_rate IS DISTINCT FROM v_details_row.defect_rate THEN
      v_changes := v_changes || jsonb_build_object(
        'defect_rate', jsonb_build_object('before', v_old_details.defect_rate, 'after', v_details_row.defect_rate)
      );
    END IF;
    IF v_old_details.defect_items IS DISTINCT FROM v_details_row.defect_items THEN
      v_changes := v_changes || jsonb_build_object(
        'defect_items', jsonb_build_object('before', v_old_details.defect_items, 'after', v_details_row.defect_items)
      );
    END IF;
    IF v_old_details.delivery_impact IS DISTINCT FROM v_details_row.delivery_impact THEN
      v_changes := v_changes || jsonb_build_object(
        'delivery_impact', jsonb_build_object('before', v_old_details.delivery_impact, 'after', v_details_row.delivery_impact)
      );
    END IF;
    IF v_old_details.onsite_records IS DISTINCT FROM v_details_row.onsite_records THEN
      v_changes := v_changes || jsonb_build_object(
        'onsite_records', jsonb_build_object('before', v_old_details.onsite_records, 'after', v_details_row.onsite_records)
      );
    END IF;
    IF v_old_details.frontend_stage IS DISTINCT FROM v_details_row.frontend_stage THEN
      v_changes := v_changes || jsonb_build_object(
        'frontend_stage', jsonb_build_object('before', v_old_details.frontend_stage, 'after', v_details_row.frontend_stage)
      );
    END IF;
    IF v_old_details.production_stage IS DISTINCT FROM v_details_row.production_stage THEN
      v_changes := v_changes || jsonb_build_object(
        'production_stage', jsonb_build_object('before', v_old_details.production_stage, 'after', v_details_row.production_stage)
      );
    END IF;
    IF v_old_details.root_cause_summary IS DISTINCT FROM v_details_row.root_cause_summary THEN
      v_changes := v_changes || jsonb_build_object(
        'root_cause_summary', jsonb_build_object('before', v_old_details.root_cause_summary, 'after', v_details_row.root_cause_summary)
      );
    END IF;
    IF v_old_details.responsibility IS DISTINCT FROM v_details_row.responsibility THEN
      v_changes := v_changes || jsonb_build_object(
        'responsibility', jsonb_build_object('before', v_old_details.responsibility, 'after', v_details_row.responsibility)
      );
    END IF;
    IF v_old_details.improvement_advice IS DISTINCT FROM v_details_row.improvement_advice THEN
      v_changes := v_changes || jsonb_build_object(
        'improvement_advice', jsonb_build_object('before', v_old_details.improvement_advice, 'after', v_details_row.improvement_advice)
      );
    END IF;
  END IF;

  UPDATE public.review_cases rc
    SET version = rc.version + 1
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING version INTO v_new_version;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'TYPE_DETAILS',
    p_review_id,
    'TYPE_DETAILS_SAVED',
    v_changes,
    v_review_row.version,
    v_new_version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'TYPE_DETAILS_SAVED',
    v_actor_profile_id,
    jsonb_build_object('changes', v_changes),
    v_new_version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'type_details', to_jsonb(v_details_row),
      'version', v_new_version
    )
  );
END;
$$;


ALTER FUNCTION "public"."review_upsert_type_details"("p_review_id" "uuid", "p_expected_version" integer, "p_patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_site_data_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."update_site_data_timestamp"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."account_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "rule_type" "text" NOT NULL,
    "rule_content" "text" NOT NULL,
    "example_good" "text",
    "example_bad" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."account_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "platform" "text" DEFAULT 'weixin'::"text" NOT NULL,
    "owner_id" "uuid",
    "persona" "text",
    "positioning" "text",
    "target_audience" "text",
    "content_style" "text",
    "main_content_types" "text"[] DEFAULT '{}'::"text"[],
    "conversion_goal" "text",
    "dos" "text",
    "donts" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "accounts_platform_check" CHECK (("platform" = ANY (ARRAY['weixin'::"text", 'douyin'::"text", 'other'::"text"]))),
    CONSTRAINT "accounts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "run_type" "text" NOT NULL,
    "input" "jsonb",
    "output" "jsonb",
    "model" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_confirmed_quote_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quote_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "request_id" "uuid" NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "amount_thousandths" bigint NOT NULL,
    "currency" "text" NOT NULL,
    "buyer_name" "text" NOT NULL,
    "project_name" "text" DEFAULT ''::"text" NOT NULL,
    "confirmed_by_profile_id" "uuid" NOT NULL,
    "confirmed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "commercial_confirmed_quote_versions_amount_thousandths_check" CHECK (("amount_thousandths" >= 0)),
    CONSTRAINT "commercial_confirmed_quote_versions_currency_check" CHECK (("currency" = ANY (ARRAY['CNY'::"text", 'USD'::"text", 'EUR'::"text"]))),
    CONSTRAINT "commercial_confirmed_quote_versions_payment_snapshot_check" CHECK (("jsonb_typeof"("payment_snapshot") = 'object'::"text")),
    CONSTRAINT "commercial_confirmed_quote_versions_snapshot_check" CHECK (("jsonb_typeof"("snapshot") = 'object'::"text")),
    CONSTRAINT "commercial_confirmed_quote_versions_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."commercial_confirmed_quote_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_confirmed_quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "owner_profile_id" "uuid" NOT NULL,
    "document_no" "text" NOT NULL,
    "latest_version" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commercial_confirmed_quotes_document_no_check" CHECK ((("length"("btrim"("document_no")) >= 1) AND ("length"("btrim"("document_no")) <= 80)))
);


ALTER TABLE "public"."commercial_confirmed_quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_payment_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "method_key" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "label_zh" "text" NOT NULL,
    "label_en" "text" NOT NULL,
    "beneficiary" "text" NOT NULL,
    "bank_name" "text" DEFAULT ''::"text" NOT NULL,
    "account_no" "text" DEFAULT ''::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "source_cell" "text" NOT NULL,
    "source_numeric" boolean DEFAULT false NOT NULL,
    "qr_png" "bytea",
    "qr_sha256" "text",
    "approved" boolean DEFAULT false NOT NULL,
    "imported_by" "uuid" NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    CONSTRAINT "commercial_payment_methods_approval_check" CHECK ((("approved" AND ("approved_by" IS NOT NULL) AND ("approved_at" IS NOT NULL)) OR ((NOT "approved") AND ("approved_by" IS NULL) AND ("approved_at" IS NULL)))),
    CONSTRAINT "commercial_payment_methods_data_check" CHECK (((("kind" = 'bank'::"text") AND ("length"("account_no") > 0) AND ("qr_png" IS NULL) AND ("qr_sha256" IS NULL)) OR (("kind" = 'qr'::"text") AND ("length"("account_no") = 0) AND ("qr_png" IS NOT NULL) AND ("qr_sha256" ~ '^[a-f0-9]{64}$'::"text")))),
    CONSTRAINT "commercial_payment_methods_kind_check" CHECK (("kind" = ANY (ARRAY['bank'::"text", 'qr'::"text"]))),
    CONSTRAINT "commercial_payment_methods_method_key_check" CHECK (("method_key" ~ '^[a-z0-9_]+$'::"text"))
);


ALTER TABLE "public"."commercial_payment_methods" OWNER TO "postgres";


COMMENT ON TABLE "public"."commercial_payment_methods" IS 'Finance sensitive: do not commit account numbers or QR binaries to public source. Approval is separate from import.';



CREATE TABLE IF NOT EXISTS "public"."commercial_quotation_draft_revisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "draft_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "owner_profile_id" "uuid" NOT NULL,
    "editor_profile_id" "uuid" NOT NULL,
    "revision" bigint NOT NULL,
    "status" "text" NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commercial_quotation_draft_revisions_revision_check" CHECK (("revision" > 0)),
    CONSTRAINT "commercial_quotation_draft_revisions_snapshot_check" CHECK (("jsonb_typeof"("snapshot") = 'object'::"text")),
    CONSTRAINT "commercial_quotation_draft_revisions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'deleted'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."commercial_quotation_draft_revisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_quotation_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "owner_profile_id" "uuid" NOT NULL,
    "draft_json" "jsonb" NOT NULL,
    "document_no" "text" DEFAULT ''::"text" NOT NULL,
    "buyer_name" "text" DEFAULT ''::"text" NOT NULL,
    "project_name" "text" DEFAULT ''::"text" NOT NULL,
    "language" "text" NOT NULL,
    "revision" bigint DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by_profile_id" "uuid" NOT NULL,
    CONSTRAINT "commercial_quotation_drafts_language_check" CHECK (("language" = ANY (ARRAY['zh'::"text", 'en'::"text"]))),
    CONSTRAINT "commercial_quotation_drafts_revision_check" CHECK (("revision" > 0)),
    CONSTRAINT "commercial_quotation_drafts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'deleted'::"text", 'archived'::"text"]))),
    CONSTRAINT "quotation_drafts_snapshot_object" CHECK (("jsonb_typeof"("draft_json") = 'object'::"text"))
);


ALTER TABLE "public"."commercial_quotation_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cpc_ai_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "customer_reference_id" "uuid",
    "project_id" "uuid",
    "proposal_type" "text" NOT NULL,
    "raw_input" "text" NOT NULL,
    "structured_proposal" "jsonb" NOT NULL,
    "proposal_schema_version" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_by_profile_id" "uuid" NOT NULL,
    "accepted_by_profile_id" "uuid",
    "accepted_at" timestamp with time zone,
    "rejected_by_profile_id" "uuid",
    "rejected_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_cpc_ai_draft_raw_input" CHECK (("length"("btrim"("raw_input")) > 0)),
    CONSTRAINT "chk_cpc_ai_draft_terminal_metadata" CHECK (((("status" = 'draft'::"text") AND ("accepted_by_profile_id" IS NULL) AND ("accepted_at" IS NULL) AND ("rejected_by_profile_id" IS NULL) AND ("rejected_at" IS NULL)) OR (("status" = 'accepted'::"text") AND ("accepted_by_profile_id" IS NOT NULL) AND ("accepted_at" IS NOT NULL) AND ("rejected_by_profile_id" IS NULL) AND ("rejected_at" IS NULL)) OR (("status" = 'rejected'::"text") AND ("rejected_by_profile_id" IS NOT NULL) AND ("rejected_at" IS NOT NULL) AND ("accepted_by_profile_id" IS NULL) AND ("accepted_at" IS NULL)) OR (("status" = 'expired'::"text") AND ("accepted_by_profile_id" IS NULL) AND ("accepted_at" IS NULL) AND ("rejected_by_profile_id" IS NULL) AND ("rejected_at" IS NULL)))),
    CONSTRAINT "cpc_ai_drafts_proposal_schema_version_check" CHECK (("proposal_schema_version" >= 1)),
    CONSTRAINT "cpc_ai_drafts_proposal_type_check" CHECK (("proposal_type" = ANY (ARRAY['PROJECT_EVENT'::"text", 'WORK_ITEM'::"text", 'PROJECT_FIELD_UPDATE'::"text", 'CUSTOMER_REFERENCE'::"text", 'REPORT_NARRATIVE'::"text"]))),
    CONSTRAINT "cpc_ai_drafts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'accepted'::"text", 'rejected'::"text", 'expired'::"text"]))),
    CONSTRAINT "cpc_ai_drafts_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."cpc_ai_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cpc_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "audit_seq" bigint NOT NULL,
    "org_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "actor_profile_id" "uuid",
    "reason" "text",
    "before_values" "jsonb",
    "after_values" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "request_id" "uuid",
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_cpc_audit_required_text" CHECK ((("length"("btrim"("entity_type")) > 0) AND ("length"("btrim"("action")) > 0)))
);


ALTER TABLE "public"."cpc_audit_log" OWNER TO "postgres";


ALTER TABLE "public"."cpc_audit_log" ALTER COLUMN "audit_seq" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."cpc_audit_log_audit_seq_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."cpc_customer_potential_assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "customer_reference_id" "uuid" NOT NULL,
    "assessor_profile_id" "uuid" NOT NULL,
    "scores" "jsonb" NOT NULL,
    "assessment_score" integer NOT NULL,
    "evidence_summary" "text" DEFAULT ''::"text" NOT NULL,
    "opportunity_summary" "text" DEFAULT ''::"text" NOT NULL,
    "estimated_annual_opportunity_cny_yuan" bigint,
    "next_action" "text" DEFAULT ''::"text" NOT NULL,
    "next_check_on" "date",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "published_grade" "text",
    "published_score" integer,
    "published_at" timestamp with time zone,
    "reviewer_profile_id" "uuid",
    "review_note" "text",
    "reviewed_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_cpc_rating_published_consistency" CHECK (((("published_grade" IS NULL) AND ("published_score" IS NULL) AND ("published_at" IS NULL)) OR (("published_grade" IS NOT NULL) AND ("published_score" IS NOT NULL) AND ("published_at" IS NOT NULL)))),
    CONSTRAINT "cpc_customer_potential_asses_estimated_annual_opportunity_check" CHECK (("estimated_annual_opportunity_cny_yuan" >= 0)),
    CONSTRAINT "cpc_customer_potential_assessments_assessment_score_check" CHECK ((("assessment_score" >= 0) AND ("assessment_score" <= 100))),
    CONSTRAINT "cpc_customer_potential_assessments_published_grade_check" CHECK (("published_grade" = ANY (ARRAY['SS'::"text", 'S'::"text", 'A'::"text", 'B'::"text", 'C'::"text", 'D'::"text"]))),
    CONSTRAINT "cpc_customer_potential_assessments_published_score_check" CHECK ((("published_score" >= 0) AND ("published_score" <= 100))),
    CONSTRAINT "cpc_customer_potential_assessments_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_review'::"text", 'approved'::"text", 'changes_requested'::"text"]))),
    CONSTRAINT "cpc_customer_potential_assessments_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."cpc_customer_potential_assessments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cpc_customer_references" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "reference_kind" "text" NOT NULL,
    "external_source" "text",
    "external_customer_id" "text",
    "provisional_source_reference" "text",
    "display_name_snapshot" "text" NOT NULL,
    "external_owner_reference" "text",
    "source_synced_at" timestamp with time zone,
    "status" "text" NOT NULL,
    "mapped_canonical_reference_id" "uuid",
    "created_by_profile_id" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provisional_source_label" "text",
    CONSTRAINT "chk_cpc_customer_reference_display_name" CHECK (("length"("btrim"("display_name_snapshot")) > 0)),
    CONSTRAINT "chk_cpc_customer_reference_kind_fields" CHECK (((("reference_kind" = 'canonical'::"text") AND ("external_source" IS NOT NULL) AND ("length"("btrim"("external_source")) > 0) AND ("external_customer_id" IS NOT NULL) AND ("length"("btrim"("external_customer_id")) > 0) AND ("source_synced_at" IS NOT NULL) AND ("provisional_source_reference" IS NULL) AND ("created_by_profile_id" IS NULL) AND ("mapped_canonical_reference_id" IS NULL) AND ("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"]))) OR (("reference_kind" = 'provisional'::"text") AND ("external_source" IS NULL) AND ("external_customer_id" IS NULL) AND ("source_synced_at" IS NULL) AND ("provisional_source_reference" IS NOT NULL) AND ("length"("btrim"("provisional_source_reference")) > 0) AND ("created_by_profile_id" IS NOT NULL) AND ("status" = ANY (ARRAY['pending_review'::"text", 'mapped'::"text", 'inactive'::"text"]))))),
    CONSTRAINT "chk_cpc_customer_reference_mapping_status" CHECK (((("reference_kind" = 'provisional'::"text") AND ("status" = 'mapped'::"text") AND ("mapped_canonical_reference_id" IS NOT NULL)) OR (("reference_kind" = 'provisional'::"text") AND ("status" = 'pending_review'::"text") AND ("mapped_canonical_reference_id" IS NULL)) OR (("reference_kind" = 'provisional'::"text") AND ("status" = 'inactive'::"text")) OR ("reference_kind" = 'canonical'::"text"))),
    CONSTRAINT "chk_cpc_provisional_source_label" CHECK ((("provisional_source_label" IS NULL) OR (("reference_kind" = 'provisional'::"text") AND (("char_length"("btrim"("provisional_source_label")) >= 1) AND ("char_length"("btrim"("provisional_source_label")) <= 300))))),
    CONSTRAINT "cpc_customer_references_reference_kind_check" CHECK (("reference_kind" = ANY (ARRAY['canonical'::"text", 'provisional'::"text"]))),
    CONSTRAINT "cpc_customer_references_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."cpc_customer_references" OWNER TO "postgres";


COMMENT ON COLUMN "public"."cpc_customer_references"."provisional_source_reference" IS 'Org-scoped unique provisional identity. New rows get CPC-PROV-<UUID>; legacy references remain unchanged. Not a marketing/source channel.';



COMMENT ON COLUMN "public"."cpc_customer_references"."provisional_source_label" IS 'Repeatable free-text acquisition channel (e.g. 新媒体/展会/转介绍). Nullable for legacy records; read API falls back to legacy provisional_source_reference.';



CREATE TABLE IF NOT EXISTS "public"."cpc_customer_workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "customer_reference_id" "uuid" NOT NULL,
    "customer_note" "text" DEFAULT ''::"text" NOT NULL,
    "note_version" integer DEFAULT 0 NOT NULL,
    "note_updated_by" "uuid",
    "note_updated_at" timestamp with time zone,
    "opportunity_summary" "text" DEFAULT ''::"text" NOT NULL,
    "estimated_annual_opportunity_cny_yuan" bigint,
    "next_action" "text" DEFAULT ''::"text" NOT NULL,
    "next_check_on" "date",
    "plan_version" integer DEFAULT 0 NOT NULL,
    "plan_updated_by" "uuid",
    "plan_updated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cpc_customer_workspaces_customer_note_check" CHECK (("char_length"("customer_note") <= 3000)),
    CONSTRAINT "cpc_customer_workspaces_estimated_annual_opportunity_cny__check" CHECK ((("estimated_annual_opportunity_cny_yuan" >= 0) AND ("estimated_annual_opportunity_cny_yuan" <= 1000000000))),
    CONSTRAINT "cpc_customer_workspaces_next_action_check" CHECK (("char_length"("next_action") <= 300)),
    CONSTRAINT "cpc_customer_workspaces_note_version_check" CHECK (("note_version" >= 0)),
    CONSTRAINT "cpc_customer_workspaces_opportunity_summary_check" CHECK (("char_length"("opportunity_summary") <= 2000)),
    CONSTRAINT "cpc_customer_workspaces_plan_version_check" CHECK (("plan_version" >= 0))
);


ALTER TABLE "public"."cpc_customer_workspaces" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cpc_external_profile_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "external_source" "text" NOT NULL,
    "external_person_id" "text" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "display_name_snapshot" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "mapped_by_profile_id" "uuid" NOT NULL,
    "mapped_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "chk_cpc_external_profile_mapping_person" CHECK (("length"("btrim"("external_person_id")) > 0)),
    CONSTRAINT "chk_cpc_external_profile_mapping_source" CHECK (("length"("btrim"("external_source")) > 0)),
    CONSTRAINT "cpc_external_profile_mappings_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"]))),
    CONSTRAINT "cpc_external_profile_mappings_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."cpc_external_profile_mappings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cpc_project_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_seq" bigint NOT NULL,
    "org_id" "uuid" NOT NULL,
    "customer_reference_id" "uuid",
    "project_id" "uuid",
    "event_type" "text" NOT NULL,
    "event_category" "text" NOT NULL,
    "occurred_at" timestamp with time zone NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_profile_id" "uuid",
    "source" "text" NOT NULL,
    "source_reference_id" "text",
    "raw_input" "text",
    "payload_schema_version" integer NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "correction_of_event_id" "uuid",
    "request_id" "uuid",
    CONSTRAINT "chk_cpc_project_event_parent" CHECK ((("customer_reference_id" IS NOT NULL) OR ("project_id" IS NOT NULL))),
    CONSTRAINT "chk_cpc_project_event_source_actor" CHECK (((("source" = 'user'::"text") AND ("actor_profile_id" IS NOT NULL)) OR (("source" = 'accepted_ai_draft'::"text") AND ("actor_profile_id" IS NOT NULL) AND ("source_reference_id" IS NOT NULL) AND ("length"("btrim"("source_reference_id")) > 0)) OR (("source" = 'integration'::"text") AND ("source_reference_id" IS NOT NULL) AND ("length"("btrim"("source_reference_id")) > 0)) OR ("source" = 'system'::"text"))),
    CONSTRAINT "cpc_project_events_event_category_check" CHECK (("event_category" = ANY (ARRAY['CONTACT'::"text", 'PROGRESS'::"text", 'WAIT'::"text", 'COMMERCIAL'::"text", 'LIFECYCLE'::"text"]))),
    CONSTRAINT "cpc_project_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['CONTACT_LOGGED'::"text", 'EFFECTIVE_PROGRESS_RECORDED'::"text", 'CUSTOMER_RESPONSE_RECEIVED'::"text", 'WAITING_STARTED'::"text", 'WAITING_RESOLVED'::"text", 'QUOTE_SENT'::"text", 'SAMPLE_SENT'::"text", 'CUSTOMER_CONFIRMED'::"text", 'COMMERCIAL_CONFIRMED'::"text", 'ORDER_CONFIRMED'::"text", 'STAGE_CHANGED'::"text", 'PROJECT_PAUSED'::"text", 'PROJECT_REOPENED'::"text", 'PROJECT_WON'::"text", 'PROJECT_LOST'::"text", 'PROJECT_CANCELLED'::"text"]))),
    CONSTRAINT "cpc_project_events_payload_schema_version_check" CHECK (("payload_schema_version" >= 1)),
    CONSTRAINT "cpc_project_events_source_check" CHECK (("source" = ANY (ARRAY['user'::"text", 'accepted_ai_draft'::"text", 'integration'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."cpc_project_events" OWNER TO "postgres";


ALTER TABLE "public"."cpc_project_events" ALTER COLUMN "event_seq" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."cpc_project_events_event_seq_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."cpc_project_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "collaborator_role" "text" NOT NULL,
    "added_by_profile_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "removed_at" timestamp with time zone,
    "removed_by_profile_id" "uuid",
    CONSTRAINT "chk_cpc_project_member_removal_pair" CHECK (((("removed_at" IS NULL) AND ("removed_by_profile_id" IS NULL)) OR (("removed_at" IS NOT NULL) AND ("removed_by_profile_id" IS NOT NULL)))),
    CONSTRAINT "cpc_project_members_collaborator_role_check" CHECK (("collaborator_role" = ANY (ARRAY['technical'::"text", 'design'::"text", 'quality'::"text", 'management'::"text", 'support'::"text"])))
);


ALTER TABLE "public"."cpc_project_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cpc_projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "customer_reference_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "objective_summary" "text" NOT NULL,
    "project_type" "text" NOT NULL,
    "owner_profile_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "stage" "text" NOT NULL,
    "waiting_on" "text" DEFAULT 'none'::"text" NOT NULL,
    "next_check_at" timestamp with time zone,
    "risk_level" "text",
    "priority" "text" NOT NULL,
    "expected_amount_minor" bigint,
    "currency" "text",
    "expected_close_date" "date",
    "created_by_profile_id" "uuid" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    CONSTRAINT "chk_cpc_project_amount_currency" CHECK (((("expected_amount_minor" IS NULL) AND ("currency" IS NULL)) OR (("expected_amount_minor" IS NOT NULL) AND ("expected_amount_minor" >= 0) AND ("currency" IS NOT NULL) AND ("currency" ~ '^[A-Z]{3}$'::"text")))),
    CONSTRAINT "chk_cpc_project_paused_check" CHECK ((("status" <> 'paused'::"text") OR ("next_check_at" IS NOT NULL))),
    CONSTRAINT "chk_cpc_project_required_text" CHECK ((("length"("btrim"("title")) > 0) AND ("length"("btrim"("objective_summary")) > 0) AND ("length"("btrim"("stage")) > 0))),
    CONSTRAINT "cpc_projects_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "cpc_projects_project_type_check" CHECK (("project_type" = ANY (ARRAY['transfer_film'::"text", 'transfer_processing'::"text", 'equipment'::"text", 'uv'::"text", 'other'::"text"]))),
    CONSTRAINT "cpc_projects_risk_level_check" CHECK ((("risk_level" IS NULL) OR ("risk_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])))),
    CONSTRAINT "cpc_projects_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'won'::"text", 'lost'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "cpc_projects_version_check" CHECK (("version" >= 1)),
    CONSTRAINT "cpc_projects_waiting_on_check" CHECK (("waiting_on" = ANY (ARRAY['none'::"text", 'customer'::"text", 'internal'::"text", 'supplier'::"text", 'quality'::"text", 'finance'::"text", 'logistics'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."cpc_projects" OWNER TO "postgres";


COMMENT ON COLUMN "public"."cpc_projects"."archived_at" IS 'Owner-authorized tombstone for hiding a cancelled project from CPC user-facing reads. A non-NULL timestamp keeps immutable project events, work items and audit histories intact; only a controlled, audited maintenance action may set/restore it.';



CREATE TABLE IF NOT EXISTS "public"."cpc_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "subject_profile_id" "uuid" NOT NULL,
    "period_type" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "revision_no" integer NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "metrics_schema_version" integer DEFAULT 1 NOT NULL,
    "deterministic_metrics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "narrative" "text",
    "unknowns" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "source_event_seq" bigint,
    "source_audit_seq" bigint,
    "supersedes_report_id" "uuid",
    "created_by_profile_id" "uuid" NOT NULL,
    "submitted_by_profile_id" "uuid",
    "submitted_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_cpc_report_period" CHECK (("period_start" <= "period_end")),
    CONSTRAINT "chk_cpc_report_submission" CHECK (((("status" = 'draft'::"text") AND ("submitted_by_profile_id" IS NULL) AND ("submitted_at" IS NULL)) OR (("status" = 'submitted'::"text") AND ("submitted_by_profile_id" IS NOT NULL) AND ("submitted_at" IS NOT NULL)))),
    CONSTRAINT "chk_cpc_report_unknowns_array" CHECK (("jsonb_typeof"("unknowns") = 'array'::"text")),
    CONSTRAINT "cpc_reports_metrics_schema_version_check" CHECK (("metrics_schema_version" >= 1)),
    CONSTRAINT "cpc_reports_period_type_check" CHECK (("period_type" = ANY (ARRAY['daily'::"text", 'weekly'::"text"]))),
    CONSTRAINT "cpc_reports_revision_no_check" CHECK (("revision_no" >= 1)),
    CONSTRAINT "cpc_reports_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'submitted'::"text"]))),
    CONSTRAINT "cpc_reports_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."cpc_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cpc_work_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "customer_reference_id" "uuid",
    "project_id" "uuid",
    "work_item_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "assignee_profile_id" "uuid" NOT NULL,
    "created_by_profile_id" "uuid" NOT NULL,
    "due_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "priority" "text" NOT NULL,
    "blocked_reason" "text",
    "completed_at" timestamp with time zone,
    "completed_by_profile_id" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancelled_by_profile_id" "uuid",
    "cancellation_reason" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_cpc_work_item_blocked" CHECK ((("status" <> 'blocked'::"text") OR (("blocked_reason" IS NOT NULL) AND ("length"("btrim"("blocked_reason")) > 0)))),
    CONSTRAINT "chk_cpc_work_item_cancelled" CHECK (((("status" = 'cancelled'::"text") AND ("cancelled_at" IS NOT NULL) AND ("cancelled_by_profile_id" IS NOT NULL)) OR (("status" <> 'cancelled'::"text") AND ("cancelled_at" IS NULL) AND ("cancelled_by_profile_id" IS NULL) AND ("cancellation_reason" IS NULL)))),
    CONSTRAINT "chk_cpc_work_item_completed" CHECK (((("status" = 'completed'::"text") AND ("completed_at" IS NOT NULL) AND ("completed_by_profile_id" IS NOT NULL) AND ("cancelled_at" IS NULL) AND ("cancelled_by_profile_id" IS NULL)) OR (("status" <> 'completed'::"text") AND ("completed_at" IS NULL) AND ("completed_by_profile_id" IS NULL)))),
    CONSTRAINT "chk_cpc_work_item_title" CHECK (("length"("btrim"("title")) > 0)),
    CONSTRAINT "cpc_work_items_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "cpc_work_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'blocked'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "cpc_work_items_version_check" CHECK (("version" >= 1)),
    CONSTRAINT "cpc_work_items_work_item_type_check" CHECK (("work_item_type" = ANY (ARRAY['NEXT_ACTION'::"text", 'CUSTOMER_COMMITMENT'::"text", 'INTERNAL_COLLABORATION'::"text", 'FOLLOW_UP'::"text", 'MANAGEMENT_DECISION'::"text"])))
);


ALTER TABLE "public"."cpc_work_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_activity_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_seq" bigint NOT NULL,
    "org_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "actor_profile_id" "uuid",
    "actor_kind" "text" NOT NULL,
    "activity_type" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_glh_activity_actor" CHECK ((("actor_kind" <> 'HUMAN'::"text") OR ("actor_profile_id" IS NOT NULL))),
    CONSTRAINT "chk_glh_activity_entity" CHECK (("length"("btrim"("entity_type")) > 0)),
    CONSTRAINT "glh_activity_events_activity_type_check" CHECK (("activity_type" = ANY (ARRAY['LEAD_CREATED'::"text", 'TASK_CREATED'::"text", 'FOLLOWUP_CREATED'::"text"]))),
    CONSTRAINT "glh_activity_events_actor_kind_check" CHECK (("actor_kind" = ANY (ARRAY['HUMAN'::"text", 'AI'::"text", 'SYSTEM'::"text"]))),
    CONSTRAINT "glh_activity_events_context_check" CHECK (("jsonb_typeof"("context") = 'object'::"text"))
);


ALTER TABLE "public"."glh_activity_events" OWNER TO "postgres";


ALTER TABLE "public"."glh_activity_events" ALTER COLUMN "event_seq" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."glh_activity_events_event_seq_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."glh_ad_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "external_campaign_id" "text" NOT NULL,
    "name" "text",
    "source_platform" "text" DEFAULT 'UNKNOWN'::"text" NOT NULL,
    "status" "text" DEFAULT 'UNKNOWN'::"text" NOT NULL,
    "created_by_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_glh_ad_campaigns_external" CHECK (("length"("btrim"("external_campaign_id")) > 0)),
    CONSTRAINT "glh_ad_campaigns_provider_check" CHECK (("provider" = ANY (ARRAY['WHATSAPP'::"text", 'FACEBOOK'::"text", 'INSTAGRAM'::"text"]))),
    CONSTRAINT "glh_ad_campaigns_source_platform_check" CHECK (("source_platform" = ANY (ARRAY['WHATSAPP'::"text", 'FACEBOOK'::"text", 'INSTAGRAM'::"text", 'UNKNOWN'::"text"]))),
    CONSTRAINT "glh_ad_campaigns_status_check" CHECK (("status" = ANY (ARRAY['UNKNOWN'::"text", 'ACTIVE'::"text", 'PAUSED'::"text", 'ARCHIVED'::"text"])))
);


ALTER TABLE "public"."glh_ad_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_ad_creatives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "provider" "text" NOT NULL,
    "external_creative_id" "text",
    "referral_identifier" "text",
    "name" "text",
    "source_platform" "text" DEFAULT 'UNKNOWN'::"text" NOT NULL,
    "created_by_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_glh_ad_creatives_identifier" CHECK ((("external_creative_id" IS NULL) OR ("length"("btrim"("external_creative_id")) > 0))),
    CONSTRAINT "glh_ad_creatives_provider_check" CHECK (("provider" = ANY (ARRAY['WHATSAPP'::"text", 'FACEBOOK'::"text", 'INSTAGRAM'::"text"]))),
    CONSTRAINT "glh_ad_creatives_source_platform_check" CHECK (("source_platform" = ANY (ARRAY['WHATSAPP'::"text", 'FACEBOOK'::"text", 'INSTAGRAM'::"text", 'UNKNOWN'::"text"])))
);


ALTER TABLE "public"."glh_ad_creatives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_ai_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "trigger_message_id" "uuid",
    "action_type" "text" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "prompt_version" "text" NOT NULL,
    "model_name" "text",
    "input_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "output_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "delivery_status" "text",
    "error_metadata" "jsonb",
    "created_by_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "chk_glh_ai_actions_prompt" CHECK (("length"("btrim"("prompt_version")) > 0)),
    CONSTRAINT "chk_glh_ai_actions_send_context" CHECK ((("action_type" <> 'AI_SEND'::"text") OR (("conversation_id" IS NOT NULL) AND ("trigger_message_id" IS NOT NULL)))),
    CONSTRAINT "glh_ai_actions_action_type_check" CHECK (("action_type" = ANY (ARRAY['QUALIFY'::"text", 'EXTRACT_FACTS'::"text", 'MISSING_INFO'::"text", 'SCORE'::"text", 'DRAFT_REPLY'::"text", 'SUMMARY'::"text", 'NEXT_ACTION'::"text", 'HANDOFF'::"text", 'AI_SEND'::"text"]))),
    CONSTRAINT "glh_ai_actions_delivery_status_check" CHECK ((("delivery_status" IS NULL) OR ("delivery_status" = ANY (ARRAY['NOT_APPLICABLE'::"text", 'QUEUED'::"text", 'SENT'::"text", 'FAILED'::"text", 'BLOCKED'::"text"])))),
    CONSTRAINT "glh_ai_actions_error_metadata_check" CHECK ((("error_metadata" IS NULL) OR ("jsonb_typeof"("error_metadata") = 'object'::"text"))),
    CONSTRAINT "glh_ai_actions_input_summary_check" CHECK (("jsonb_typeof"("input_summary") = 'object'::"text")),
    CONSTRAINT "glh_ai_actions_output_payload_check" CHECK (("jsonb_typeof"("output_payload") = 'object'::"text")),
    CONSTRAINT "glh_ai_actions_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'COMPLETED'::"text", 'FAILED'::"text", 'BLOCKED'::"text"])))
);


ALTER TABLE "public"."glh_ai_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "assignee_profile_id" "uuid" NOT NULL,
    "assignment_type" "text" NOT NULL,
    "assigned_by_profile_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "reason" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_glh_assignments_lifecycle" CHECK (((("status" = 'ACTIVE'::"text") AND ("ended_at" IS NULL)) OR (("status" = ANY (ARRAY['ENDED'::"text", 'REVOKED'::"text"])) AND ("ended_at" IS NOT NULL)))),
    CONSTRAINT "glh_assignments_assignment_type_check" CHECK (("assignment_type" = ANY (ARRAY['PRIMARY'::"text", 'COLLABORATOR'::"text"]))),
    CONSTRAINT "glh_assignments_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'ENDED'::"text", 'REVOKED'::"text"])))
);


ALTER TABLE "public"."glh_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_audit_events" (
    "audit_seq" bigint NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "actor_profile_id" "uuid",
    "actor_kind" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "previous_state" "text",
    "next_state" "text",
    "reason" "text",
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_glh_audit_actor" CHECK ((("actor_kind" <> 'HUMAN'::"text") OR ("actor_profile_id" IS NOT NULL))),
    CONSTRAINT "chk_glh_audit_entity" CHECK (("length"("btrim"("entity_type")) > 0)),
    CONSTRAINT "glh_audit_events_actor_kind_check" CHECK (("actor_kind" = ANY (ARRAY['HUMAN'::"text", 'AI'::"text", 'SYSTEM'::"text"]))),
    CONSTRAINT "glh_audit_events_context_check" CHECK (("jsonb_typeof"("context") = 'object'::"text")),
    CONSTRAINT "glh_audit_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['LEAD_ASSIGNED'::"text", 'LEAD_GRADE_CHANGED'::"text", 'LEAD_STAGE_CHANGED'::"text", 'AI_SEND'::"text", 'HUMAN_HANDOFF'::"text", 'CHANNEL_SETTING_CHANGED'::"text", 'ROLE_CHANGED'::"text"])))
);


ALTER TABLE "public"."glh_audit_events" OWNER TO "postgres";


ALTER TABLE "public"."glh_audit_events" ALTER COLUMN "audit_seq" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."glh_audit_events_audit_seq_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."glh_automation_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "run_type" "text" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "input_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "output_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_metadata" "jsonb",
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "created_by_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_glh_automation_runs_type" CHECK (("length"("btrim"("run_type")) > 0)),
    CONSTRAINT "glh_automation_runs_error_metadata_check" CHECK ((("error_metadata" IS NULL) OR ("jsonb_typeof"("error_metadata") = 'object'::"text"))),
    CONSTRAINT "glh_automation_runs_input_summary_check" CHECK (("jsonb_typeof"("input_summary") = 'object'::"text")),
    CONSTRAINT "glh_automation_runs_output_payload_check" CHECK (("jsonb_typeof"("output_payload") = 'object'::"text")),
    CONSTRAINT "glh_automation_runs_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'RUNNING'::"text", 'COMPLETED'::"text", 'FAILED'::"text", 'SKIPPED'::"text"])))
);


ALTER TABLE "public"."glh_automation_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_channel_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "external_account_id" "text" NOT NULL,
    "display_name" "text",
    "status" "text" DEFAULT 'DISCONNECTED'::"text" NOT NULL,
    "configuration_reference" "text",
    "created_by_profile_id" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_glh_channel_accounts_external" CHECK (("length"("btrim"("external_account_id")) > 0)),
    CONSTRAINT "glh_channel_accounts_provider_check" CHECK (("provider" = ANY (ARRAY['WHATSAPP'::"text", 'FACEBOOK'::"text", 'INSTAGRAM'::"text"]))),
    CONSTRAINT "glh_channel_accounts_status_check" CHECK (("status" = ANY (ARRAY['DISCONNECTED'::"text", 'PENDING'::"text", 'TEST_READY'::"text", 'CONNECTED'::"text", 'ERROR'::"text"]))),
    CONSTRAINT "glh_channel_accounts_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."glh_channel_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "display_name" "text",
    "company_name" "text",
    "country_code" "text",
    "provider_external_contact_id" "text",
    "source_platform" "text" DEFAULT 'UNKNOWN'::"text" NOT NULL,
    "normalized_whatsapp" "text",
    "normalized_phone" "text",
    "normalized_email" "text",
    "website" "text",
    "social_identifier" "text",
    "created_by_profile_id" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_glh_contacts_provider_external" CHECK ((("provider_external_contact_id" IS NULL) OR ("length"("btrim"("provider_external_contact_id")) > 0))),
    CONSTRAINT "glh_contacts_source_platform_check" CHECK (("source_platform" = ANY (ARRAY['WHATSAPP'::"text", 'FACEBOOK'::"text", 'INSTAGRAM'::"text", 'UNKNOWN'::"text"]))),
    CONSTRAINT "glh_contacts_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."glh_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "channel_account_id" "uuid" NOT NULL,
    "external_conversation_id" "text" NOT NULL,
    "conversation_mode" "text" DEFAULT 'AI_ACTIVE'::"text" NOT NULL,
    "conversation_status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "assigned_profile_id" "uuid",
    "last_message_at" timestamp with time zone,
    "created_by_profile_id" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_glh_conversations_external" CHECK (("length"("btrim"("external_conversation_id")) > 0)),
    CONSTRAINT "glh_conversations_conversation_mode_check" CHECK (("conversation_mode" = ANY (ARRAY['AI_ACTIVE'::"text", 'HANDOFF_PENDING'::"text", 'HUMAN_ACTIVE'::"text", 'PAUSED'::"text"]))),
    CONSTRAINT "glh_conversations_conversation_status_check" CHECK (("conversation_status" = ANY (ARRAY['ACTIVE'::"text", 'CLOSED'::"text", 'ARCHIVED'::"text"]))),
    CONSTRAINT "glh_conversations_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."glh_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_followups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "assigned_profile_id" "uuid" NOT NULL,
    "followup_type" "text" NOT NULL,
    "next_action" "text" NOT NULL,
    "due_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "last_contact_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_by_profile_id" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_glh_followups_action" CHECK (("length"("btrim"("next_action")) > 0)),
    CONSTRAINT "glh_followups_followup_type_check" CHECK (("followup_type" = ANY (ARRAY['QUALIFICATION'::"text", 'QUOTATION'::"text", 'SAMPLE'::"text", 'NEGOTIATION'::"text", 'DORMANT_REVIVAL'::"text", 'OTHER'::"text"]))),
    CONSTRAINT "glh_followups_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'DONE'::"text", 'CANCELLED'::"text", 'OVERDUE'::"text"]))),
    CONSTRAINT "glh_followups_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."glh_followups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_lead_profiles" (
    "lead_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "customer_company_name" "text",
    "country_code" "text",
    "whatsapp" "text",
    "email" "text",
    "website" "text",
    "social_identifier" "text",
    "product" "text",
    "material" "text",
    "product_media_references" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "dimensions" "text",
    "quantity" "text",
    "artwork_reference" "text",
    "printing_area" "text",
    "requirement_type" "text",
    "current_printing_process" "text",
    "pain_points" "text",
    "test_requirements" "text",
    "sample_availability" "text",
    "purchase_timeline" "text",
    "machine_capacity_requirements" "text",
    "automation_requirements" "text",
    "machine_plus_process_solution_required" boolean,
    "extracted_facts" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ai_summary" "text",
    "created_by_profile_id" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "glh_lead_profiles_extracted_facts_check" CHECK (("jsonb_typeof"("extracted_facts") = 'object'::"text")),
    CONSTRAINT "glh_lead_profiles_product_media_references_check" CHECK (("jsonb_typeof"("product_media_references") = 'array'::"text")),
    CONSTRAINT "glh_lead_profiles_requirement_type_check" CHECK ((("requirement_type" IS NULL) OR ("requirement_type" = ANY (ARRAY['FILM'::"text", 'PROCESSING'::"text", 'MACHINE'::"text", 'PROCESS_CONSULT'::"text", 'UNCLEAR'::"text"])))),
    CONSTRAINT "glh_lead_profiles_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."glh_lead_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_lead_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "score" integer NOT NULL,
    "grade" "text" NOT NULL,
    "score_source" "text" NOT NULL,
    "components" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "prompt_version" "text",
    "created_by_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "glh_lead_scores_components_check" CHECK (("jsonb_typeof"("components") = 'object'::"text")),
    CONSTRAINT "glh_lead_scores_grade_check" CHECK (("grade" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text", 'D'::"text"]))),
    CONSTRAINT "glh_lead_scores_score_check" CHECK ((("score" >= 0) AND ("score" <= 100))),
    CONSTRAINT "glh_lead_scores_score_source_check" CHECK (("score_source" = ANY (ARRAY['AI'::"text", 'HUMAN'::"text", 'SYSTEM'::"text"])))
);


ALTER TABLE "public"."glh_lead_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "owner_profile_id" "uuid",
    "lifecycle_state" "text" DEFAULT 'NEW'::"text" NOT NULL,
    "conversation_mode" "text" DEFAULT 'AI_ACTIVE'::"text" NOT NULL,
    "priority_grade" "text",
    "score" integer DEFAULT 0 NOT NULL,
    "completeness" integer DEFAULT 0 NOT NULL,
    "source_platform" "text" DEFAULT 'UNKNOWN'::"text" NOT NULL,
    "campaign_id" "uuid",
    "creative_id" "uuid",
    "referral_identifier" "text",
    "last_message_at" timestamp with time zone,
    "next_follow_up_at" timestamp with time zone,
    "created_by_profile_id" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "glh_leads_completeness_check" CHECK ((("completeness" >= 0) AND ("completeness" <= 100))),
    CONSTRAINT "glh_leads_conversation_mode_check" CHECK (("conversation_mode" = ANY (ARRAY['AI_ACTIVE'::"text", 'HANDOFF_PENDING'::"text", 'HUMAN_ACTIVE'::"text", 'PAUSED'::"text"]))),
    CONSTRAINT "glh_leads_lifecycle_state_check" CHECK (("lifecycle_state" = ANY (ARRAY['NEW'::"text", 'AI_QUALIFYING'::"text", 'WAITING_CUSTOMER'::"text", 'READY_FOR_HUMAN'::"text", 'HUMAN_FOLLOWING'::"text", 'QUOTATION'::"text", 'SAMPLE'::"text", 'NEGOTIATION'::"text", 'WON'::"text", 'LOST'::"text", 'DORMANT'::"text", 'INVALID'::"text"]))),
    CONSTRAINT "glh_leads_priority_grade_check" CHECK ((("priority_grade" IS NULL) OR ("priority_grade" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text", 'D'::"text"])))),
    CONSTRAINT "glh_leads_score_check" CHECK ((("score" >= 0) AND ("score" <= 100))),
    CONSTRAINT "glh_leads_source_platform_check" CHECK (("source_platform" = ANY (ARRAY['WHATSAPP'::"text", 'FACEBOOK'::"text", 'INSTAGRAM'::"text", 'UNKNOWN'::"text"]))),
    CONSTRAINT "glh_leads_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."glh_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_manual_intake_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "actor_profile_id" "uuid" NOT NULL,
    "request_key" "uuid" NOT NULL,
    "request_hash" "text" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "glh_manual_intake_requests_request_hash_check" CHECK (("length"("request_hash") = 64))
);


ALTER TABLE "public"."glh_manual_intake_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_manual_work_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "work_id" "uuid" NOT NULL,
    "work_kind" "text" NOT NULL,
    "actor_profile_id" "uuid" NOT NULL,
    "previous_status" "text" NOT NULL,
    "next_status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "glh_manual_work_updates_next_status_check" CHECK (("next_status" = 'DONE'::"text")),
    CONSTRAINT "glh_manual_work_updates_work_kind_check" CHECK (("work_kind" = ANY (ARRAY['TASK'::"text", 'FOLLOWUP'::"text"])))
);


ALTER TABLE "public"."glh_manual_work_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_message_id" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "actor_type" "text" NOT NULL,
    "actor_profile_id" "uuid",
    "message_text" "text",
    "media_metadata" "jsonb",
    "provider_timestamp" timestamp with time zone,
    "delivery_status" "text" DEFAULT 'RECEIVED'::"text" NOT NULL,
    "error_metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_glh_messages_content" CHECK ((("message_text" IS NOT NULL) OR ("media_metadata" IS NOT NULL) OR ("actor_type" = 'SYSTEM'::"text"))),
    CONSTRAINT "chk_glh_messages_provider_id" CHECK (("length"("btrim"("provider_message_id")) > 0)),
    CONSTRAINT "glh_messages_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['AI'::"text", 'HUMAN'::"text", 'CUSTOMER'::"text", 'SYSTEM'::"text"]))),
    CONSTRAINT "glh_messages_delivery_status_check" CHECK (("delivery_status" = ANY (ARRAY['RECEIVED'::"text", 'QUEUED'::"text", 'SENT'::"text", 'DELIVERED'::"text", 'READ'::"text", 'FAILED'::"text"]))),
    CONSTRAINT "glh_messages_direction_check" CHECK (("direction" = ANY (ARRAY['INBOUND'::"text", 'OUTBOUND'::"text", 'SYSTEM'::"text"]))),
    CONSTRAINT "glh_messages_error_metadata_check" CHECK ((("error_metadata" IS NULL) OR ("jsonb_typeof"("error_metadata") = 'object'::"text"))),
    CONSTRAINT "glh_messages_media_metadata_check" CHECK ((("media_metadata" IS NULL) OR ("jsonb_typeof"("media_metadata") = 'object'::"text"))),
    CONSTRAINT "glh_messages_provider_check" CHECK (("provider" = ANY (ARRAY['WHATSAPP'::"text", 'FACEBOOK'::"text", 'INSTAGRAM'::"text"])))
);


ALTER TABLE "public"."glh_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_role_bindings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "granted_by_profile_id" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_by_profile_id" "uuid",
    "revoked_at" timestamp with time zone,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_glh_role_bindings_lifecycle" CHECK (((("status" = 'ACTIVE'::"text") AND ("revoked_at" IS NULL) AND ("revoked_by_profile_id" IS NULL)) OR (("status" = 'REVOKED'::"text") AND ("revoked_at" IS NOT NULL) AND ("revoked_by_profile_id" IS NOT NULL)))),
    CONSTRAINT "glh_role_bindings_role_check" CHECK (("role" = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'SALES'::"text"]))),
    CONSTRAINT "glh_role_bindings_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'REVOKED'::"text"])))
);


ALTER TABLE "public"."glh_role_bindings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "assignee_profile_id" "uuid" NOT NULL,
    "task_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "due_at" timestamp with time zone,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "source" "text" DEFAULT 'HUMAN'::"text" NOT NULL,
    "created_by_profile_id" "uuid",
    "completed_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_glh_tasks_title" CHECK (("length"("btrim"("title")) > 0)),
    CONSTRAINT "glh_tasks_source_check" CHECK (("source" = ANY (ARRAY['HUMAN'::"text", 'AI_SUGGESTION'::"text", 'SYSTEM'::"text"]))),
    CONSTRAINT "glh_tasks_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'IN_PROGRESS'::"text", 'DONE'::"text", 'CANCELLED'::"text"]))),
    CONSTRAINT "glh_tasks_task_type_check" CHECK (("task_type" = ANY (ARRAY['QUALIFICATION'::"text", 'FOLLOW_UP'::"text", 'QUOTATION'::"text", 'SAMPLE'::"text", 'NEGOTIATION'::"text", 'HANDOFF'::"text", 'OTHER'::"text"]))),
    CONSTRAINT "glh_tasks_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."glh_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glh_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "channel_account_id" "uuid",
    "provider" "text" NOT NULL,
    "external_event_id" "text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "signature_verified" boolean DEFAULT false NOT NULL,
    "payload" "jsonb" NOT NULL,
    "processing_status" "text" DEFAULT 'RECEIVED'::"text" NOT NULL,
    "processing_error" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    CONSTRAINT "chk_glh_webhook_external" CHECK (("length"("btrim"("external_event_id")) > 0)),
    CONSTRAINT "chk_glh_webhook_idempotency" CHECK (("length"("btrim"("idempotency_key")) > 0)),
    CONSTRAINT "glh_webhook_events_payload_check" CHECK (("jsonb_typeof"("payload") = 'object'::"text")),
    CONSTRAINT "glh_webhook_events_processing_status_check" CHECK (("processing_status" = ANY (ARRAY['RECEIVED'::"text", 'PROCESSING'::"text", 'PROCESSED'::"text", 'FAILED'::"text", 'DUPLICATE'::"text"]))),
    CONSTRAINT "glh_webhook_events_provider_check" CHECK (("provider" = ANY (ARRAY['WHATSAPP'::"text", 'FACEBOOK'::"text", 'INSTAGRAM'::"text"])))
);


ALTER TABLE "public"."glh_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" NOT NULL,
    "applicable_accounts" "uuid"[] DEFAULT '{}'::"uuid"[],
    "applicable_content_types" "text"[] DEFAULT '{}'::"text"[],
    "customer_type" "text",
    "is_external_allowed" boolean DEFAULT true NOT NULL,
    "core_conclusion" "text",
    "plain_explanation" "text",
    "customer_questions" "text",
    "new_media_expression" "text",
    "dont_say" "text",
    "topic_ideas" "text",
    "script_angles" "text",
    "owner" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "knowledge_cards_category_check" CHECK (("category" = ANY (ARRAY['company'::"text", 'process'::"text", 'material'::"text", 'equipment'::"text", 'faq'::"text", 'persona'::"text", 'viral'::"text", 'review'::"text", 'sales'::"text", 'risk'::"text"])))
);


ALTER TABLE "public"."knowledge_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "customer_message" "text",
    "team_reply" "text",
    "ai_suggestion" "text",
    "next_action" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_interactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "source_platform" "text",
    "source_account_id" "uuid",
    "source_post_id" "uuid",
    "customer_name" "text",
    "wechat" "text",
    "phone" "text",
    "company" "text",
    "region" "text",
    "product" "text",
    "material" "text",
    "quantity" "text",
    "requirement_type" "text",
    "product_images" "text"[] DEFAULT '{}'::"text"[],
    "artwork_requirement" "text",
    "test_requirement" "text",
    "is_urgent" boolean DEFAULT false NOT NULL,
    "current_process" "text",
    "pain_points" "text",
    "lead_score" integer DEFAULT 0 NOT NULL,
    "lead_grade" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "assigned_to" "uuid",
    "next_action" "text",
    "next_follow_up_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "leads_lead_grade_check" CHECK (("lead_grade" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text", 'D'::"text"]))),
    CONSTRAINT "leads_requirement_type_check" CHECK (("requirement_type" = ANY (ARRAY['huamo'::"text", 'processing'::"text", 'equipment'::"text", 'process_consult'::"text", 'unclear'::"text"]))),
    CONSTRAINT "leads_source_platform_check" CHECK (("source_platform" = ANY (ARRAY['weixin'::"text", 'douyin'::"text", 'other'::"text"]))),
    CONSTRAINT "leads_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'contacted'::"text", 'qualified'::"text", 'negotiating'::"text", 'converted'::"text", 'lost'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "related_type" "text" NOT NULL,
    "related_id" "uuid",
    "file_url" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."media_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "views" integer DEFAULT 0 NOT NULL,
    "completion_rate" numeric(5,4) DEFAULT 0 NOT NULL,
    "likes" integer DEFAULT 0 NOT NULL,
    "comments" integer DEFAULT 0 NOT NULL,
    "shares" integer DEFAULT 0 NOT NULL,
    "favorites" integer DEFAULT 0 NOT NULL,
    "followers_gained" integer DEFAULT 0 NOT NULL,
    "private_messages" integer DEFAULT 0 NOT NULL,
    "leads_count" integer DEFAULT 0 NOT NULL,
    "qualified_leads_count" integer DEFAULT 0 NOT NULL,
    "metric_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."post_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "script_id" "uuid",
    "platform" "text" DEFAULT 'weixin'::"text" NOT NULL,
    "post_url" "text",
    "publish_date" timestamp with time zone,
    "title" "text",
    "content_type" "text",
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "posts_content_type_check" CHECK (("content_type" = ANY (ARRAY['product'::"text", 'process'::"text", 'case'::"text", 'qa'::"text", 'factory'::"text", 'industry'::"text", 'tutorial'::"text", 'other'::"text"]))),
    CONSTRAINT "posts_platform_check" CHECK (("platform" = ANY (ARRAY['weixin'::"text", 'douyin'::"text", 'other'::"text"]))),
    CONSTRAINT "posts_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'filming'::"text", 'editing'::"text", 'published'::"text", 'reviewed'::"text"])))
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "full_name" "text",
    "email" "text",
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "department" "text",
    "avatar_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'operator'::"text", 'sales'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "review_id" "uuid" NOT NULL,
    "sequence" integer NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "action_type" "text" NOT NULL,
    "owner_profile_id" "uuid" NOT NULL,
    "due_date" "date" NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "completion_note" "text",
    "verification_note" "text",
    "verified_by_profile_id" "uuid",
    "verified_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancel_reason" "text",
    "created_by_profile_id" "uuid" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_review_actions_action_type" CHECK (("action_type" = ANY (ARRAY['IMMEDIATE'::"text", 'CORRECTIVE'::"text", 'PREVENTIVE'::"text"]))),
    CONSTRAINT "chk_review_actions_cancel_reason" CHECK ((("cancel_reason" IS NULL) OR (("char_length"("btrim"("cancel_reason")) > 0) AND ("char_length"("cancel_reason") <= 1000)))),
    CONSTRAINT "chk_review_actions_cancelled_metadata" CHECK (((("status" = 'CANCELLED'::"text") AND ("cancelled_at" IS NOT NULL) AND ("cancel_reason" IS NOT NULL) AND ("char_length"("btrim"("cancel_reason")) > 0) AND ("char_length"("cancel_reason") <= 1000)) OR (("status" <> 'CANCELLED'::"text") AND ("cancelled_at" IS NULL) AND ("cancel_reason" IS NULL)))),
    CONSTRAINT "chk_review_actions_completed_at" CHECK (((("status" = ANY (ARRAY['PENDING_VERIFICATION'::"text", 'VERIFIED'::"text"])) AND ("completed_at" IS NOT NULL)) OR (("status" = ANY (ARRAY['OPEN'::"text", 'IN_PROGRESS'::"text", 'CANCELLED'::"text"])) AND ("completed_at" IS NULL)))),
    CONSTRAINT "chk_review_actions_completion_note" CHECK ((("completion_note" IS NULL) OR (("char_length"("btrim"("completion_note")) > 0) AND ("char_length"("completion_note") <= 5000)))),
    CONSTRAINT "chk_review_actions_description" CHECK ((("description" IS NULL) OR (("char_length"("btrim"("description")) > 0) AND ("char_length"("description") <= 5000)))),
    CONSTRAINT "chk_review_actions_sequence" CHECK (("sequence" >= 1)),
    CONSTRAINT "chk_review_actions_status" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'IN_PROGRESS'::"text", 'PENDING_VERIFICATION'::"text", 'VERIFIED'::"text", 'CANCELLED'::"text"]))),
    CONSTRAINT "chk_review_actions_title" CHECK ((("char_length"("btrim"("title")) > 0) AND ("char_length"("title") <= 200))),
    CONSTRAINT "chk_review_actions_verification_note" CHECK ((("verification_note" IS NULL) OR (("char_length"("btrim"("verification_note")) > 0) AND ("char_length"("verification_note") <= 5000)))),
    CONSTRAINT "chk_review_actions_verified_metadata" CHECK (((("status" = 'VERIFIED'::"text") AND ("verified_by_profile_id" IS NOT NULL) AND ("verified_at" IS NOT NULL)) OR (("status" <> 'VERIFIED'::"text") AND ("verified_by_profile_id" IS NULL) AND ("verified_at" IS NULL)))),
    CONSTRAINT "chk_review_actions_version" CHECK (("version" >= 1))
);


ALTER TABLE "public"."review_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "review_id" "uuid" NOT NULL,
    "actor_profile_id" "uuid",
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "changes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "version_before" integer,
    "version_after" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_review_audit_action_nonblank" CHECK (("length"("btrim"("action")) > 0)),
    CONSTRAINT "chk_review_audit_entity_type" CHECK (("entity_type" = ANY (ARRAY['REVIEW'::"text", 'TYPE_DETAILS'::"text", 'MEMBER'::"text", 'ASSIGNMENT'::"text", 'ACTION'::"text", 'REVIEW_METADATA'::"text"]))),
    CONSTRAINT "chk_review_audit_version_after" CHECK (("version_after" >= 1)),
    CONSTRAINT "chk_review_audit_version_before" CHECK ((("version_before" IS NULL) OR ("version_before" >= 1)))
);


ALTER TABLE "public"."review_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_case_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "case_id" "uuid" NOT NULL,
    "actor_profile_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "changes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "version_before" integer,
    "version_after" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_review_case_audit_logs_action" CHECK (("action" = ANY (ARRAY['CASE_CREATED'::"text", 'CASE_UPDATED'::"text", 'CASE_PUBLISHED'::"text", 'CASE_HIDDEN'::"text", 'CASE_REOPENED'::"text", 'CASE_REPUBLISHED'::"text"]))),
    CONSTRAINT "chk_review_case_audit_logs_changes_object" CHECK (("jsonb_typeof"("changes") = 'object'::"text")),
    CONSTRAINT "chk_review_case_audit_logs_version_after" CHECK (("version_after" >= 1)),
    CONSTRAINT "chk_review_case_audit_logs_version_before" CHECK ((("version_before" IS NULL) OR ("version_before" >= 1))),
    CONSTRAINT "chk_review_case_audit_logs_version_sequence" CHECK (((("action" = 'CASE_CREATED'::"text") AND ("version_before" IS NULL) AND ("version_after" = 1)) OR (("action" <> 'CASE_CREATED'::"text") AND ("version_before" IS NOT NULL) AND ("version_before" >= 1) AND ("version_after" = ("version_before" + 1)))))
);


ALTER TABLE "public"."review_case_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_case_number_counters" (
    "org_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "last_value" integer NOT NULL,
    CONSTRAINT "chk_review_case_number_counters_last_value" CHECK ((("last_value" >= 1) AND ("last_value" <= 999999))),
    CONSTRAINT "chk_review_case_number_counters_year" CHECK ((("year" >= 2000) AND ("year" <= 9999)))
);


ALTER TABLE "public"."review_case_number_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_cases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "review_no" "text" NOT NULL,
    "review_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "risk_level" "text",
    "risk_reason" "text",
    "occurred_at" timestamp with time zone,
    "customer_name" "text",
    "order_no" "text",
    "project_name" "text",
    "product_name" "text",
    "process_name" "text",
    "description" "text",
    "impact_summary" "text",
    "created_by" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "pmo_id" "uuid",
    "closed_at" timestamp with time zone,
    "closed_by" "uuid",
    "close_override_reason" "text",
    "report_generated_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_at" timestamp with time zone,
    "submitted_by_profile_id" "uuid",
    CONSTRAINT "chk_review_cases_archived_status" CHECK (((("status" = 'archived'::"text") AND ("archived_at" IS NOT NULL)) OR (("status" <> 'archived'::"text") AND ("archived_at" IS NULL)))),
    CONSTRAINT "chk_review_cases_closed_pair" CHECK (((("closed_at" IS NULL) AND ("closed_by" IS NULL)) OR (("closed_at" IS NOT NULL) AND ("closed_by" IS NOT NULL)))),
    CONSTRAINT "chk_review_cases_closed_status" CHECK (((("status" = 'closed'::"text") AND ("closed_at" IS NOT NULL) AND ("closed_by" IS NOT NULL)) OR (("status" = ANY (ARRAY['draft'::"text", 'submitted'::"text", 'in_review'::"text", 'action_required'::"text", 'verifying'::"text", 'rejected'::"text", 'cancelled'::"text"])) AND ("closed_at" IS NULL) AND ("closed_by" IS NULL)) OR ("status" = 'archived'::"text"))),
    CONSTRAINT "chk_review_cases_required_text" CHECK ((("length"("btrim"("review_no")) > 0) AND ("length"("btrim"("title")) > 0))),
    CONSTRAINT "chk_review_cases_review_no" CHECK (("review_no" ~ '^REV-[0-9]{4}-[0-9]{6}$'::"text")),
    CONSTRAINT "chk_review_cases_risk_reason" CHECK (((("risk_level" IS NULL) AND ("risk_reason" IS NULL)) OR (("risk_level" IS NOT NULL) AND ("risk_reason" IS NOT NULL) AND ("length"("btrim"("risk_reason")) > 0)))),
    CONSTRAINT "chk_review_cases_submitted_pair" CHECK (((("submitted_at" IS NULL) AND ("submitted_by_profile_id" IS NULL)) OR (("submitted_at" IS NOT NULL) AND ("submitted_by_profile_id" IS NOT NULL)))),
    CONSTRAINT "chk_review_cases_submitted_status" CHECK (((("status" = ANY (ARRAY['submitted'::"text", 'closed'::"text"])) AND ("submitted_at" IS NOT NULL) AND ("submitted_by_profile_id" IS NOT NULL)) OR (("status" = 'draft'::"text") AND ("submitted_at" IS NULL) AND ("submitted_by_profile_id" IS NULL)) OR ("status" <> ALL (ARRAY['draft'::"text", 'submitted'::"text", 'closed'::"text"])))),
    CONSTRAINT "chk_review_cases_version" CHECK (("version" >= 1)),
    CONSTRAINT "review_cases_review_type_check" CHECK (("review_type" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text"]))),
    CONSTRAINT "review_cases_risk_level_check" CHECK (("risk_level" = ANY (ARRAY['RED'::"text", 'YELLOW'::"text", 'GREEN'::"text"]))),
    CONSTRAINT "review_cases_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'submitted'::"text", 'in_review'::"text", 'action_required'::"text", 'verifying'::"text", 'closed'::"text", 'archived'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."review_cases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_dict_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid",
    "dict_type" "text" NOT NULL,
    "code" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_review_dict_code_nonempty" CHECK (("length"("btrim"("code")) > 0)),
    CONSTRAINT "chk_review_dict_label_nonempty" CHECK (("length"("btrim"("label")) > 0)),
    CONSTRAINT "chk_review_dict_org_system" CHECK (((("is_system" = true) AND ("org_id" IS NULL) AND ("created_by" IS NULL)) OR (("is_system" = false) AND ("org_id" IS NOT NULL) AND ("created_by" IS NOT NULL)))),
    CONSTRAINT "chk_review_dict_type_nonempty" CHECK (("length"("btrim"("dict_type")) > 0))
);


ALTER TABLE "public"."review_dict_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_knowledge_case_metadata" (
    "case_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "material_other_text" "text",
    "process_other_text" "text",
    "problem_domain_other_text" "text",
    "problem_symptom_other_text" "text",
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_review_knowledge_case_metadata_domain_other_text" CHECK ((("problem_domain_other_text" IS NULL) OR (("char_length"("btrim"("problem_domain_other_text")) > 0) AND ("char_length"("problem_domain_other_text") <= 200)))),
    CONSTRAINT "chk_review_knowledge_case_metadata_material_other_text" CHECK ((("material_other_text" IS NULL) OR (("char_length"("btrim"("material_other_text")) > 0) AND ("char_length"("material_other_text") <= 200)))),
    CONSTRAINT "chk_review_knowledge_case_metadata_process_other_text" CHECK ((("process_other_text" IS NULL) OR (("char_length"("btrim"("process_other_text")) > 0) AND ("char_length"("process_other_text") <= 200)))),
    CONSTRAINT "chk_review_knowledge_case_metadata_symptom_other_text" CHECK ((("problem_symptom_other_text" IS NULL) OR (("char_length"("btrim"("problem_symptom_other_text")) > 0) AND ("char_length"("problem_symptom_other_text") <= 200))))
);


ALTER TABLE "public"."review_knowledge_case_metadata" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_knowledge_case_metadata_items" (
    "case_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "metadata_type" "text" NOT NULL,
    "code" "text" NOT NULL,
    "label_snapshot" "text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_review_knowledge_case_metadata_items_code" CHECK (("length"("btrim"("code")) > 0)),
    CONSTRAINT "chk_review_knowledge_case_metadata_items_label" CHECK (("length"("btrim"("label_snapshot")) > 0)),
    CONSTRAINT "chk_review_knowledge_case_metadata_items_primary_scope" CHECK ((("metadata_type" = 'MATERIAL'::"text") OR ("is_primary" = false))),
    CONSTRAINT "chk_review_knowledge_case_metadata_items_type" CHECK (("metadata_type" = ANY (ARRAY['MATERIAL'::"text", 'PROCESS'::"text", 'PROBLEM_DOMAIN'::"text", 'PROBLEM_SYMPTOM'::"text"])))
);


ALTER TABLE "public"."review_knowledge_case_metadata_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_knowledge_cases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "case_no" "text" NOT NULL,
    "source_review_id" "uuid" NOT NULL,
    "source_review_version" integer NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text",
    "lesson_summary" "text",
    "prevention_summary" "text",
    "applicability_notes" "text",
    "review_type_snapshot" "text",
    "risk_level_snapshot" "text",
    "occurred_at_snapshot" timestamp with time zone,
    "created_by_profile_id" "uuid" NOT NULL,
    "published_by_profile_id" "uuid",
    "published_at" timestamp with time zone,
    "hidden_by_profile_id" "uuid",
    "hidden_at" timestamp with time zone,
    "hidden_reason" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_review_knowledge_cases_applicability_notes" CHECK ((("applicability_notes" IS NULL) OR (("length"("btrim"("applicability_notes")) > 0) AND ("length"("applicability_notes") <= 2000)))),
    CONSTRAINT "chk_review_knowledge_cases_case_no" CHECK (("case_no" ~ '^CASE-[0-9]{4}-[0-9]{6}$'::"text")),
    CONSTRAINT "chk_review_knowledge_cases_hidden_reason" CHECK ((("hidden_reason" IS NULL) OR (("length"("btrim"("hidden_reason")) > 0) AND ("length"("hidden_reason") <= 1000)))),
    CONSTRAINT "chk_review_knowledge_cases_hidden_triple" CHECK (((("hidden_at" IS NULL) AND ("hidden_by_profile_id" IS NULL) AND ("hidden_reason" IS NULL)) OR (("hidden_at" IS NOT NULL) AND ("hidden_by_profile_id" IS NOT NULL) AND ("hidden_reason" IS NOT NULL)))),
    CONSTRAINT "chk_review_knowledge_cases_historical_snapshot" CHECK ((("published_at" IS NULL) OR ("review_type_snapshot" IS NOT NULL))),
    CONSTRAINT "chk_review_knowledge_cases_lesson_summary" CHECK ((("lesson_summary" IS NULL) OR (("length"("btrim"("lesson_summary")) > 0) AND ("length"("lesson_summary") <= 5000)))),
    CONSTRAINT "chk_review_knowledge_cases_prevention_summary" CHECK ((("prevention_summary" IS NULL) OR (("length"("btrim"("prevention_summary")) > 0) AND ("length"("prevention_summary") <= 5000)))),
    CONSTRAINT "chk_review_knowledge_cases_published_pair" CHECK (((("published_at" IS NULL) AND ("published_by_profile_id" IS NULL)) OR (("published_at" IS NOT NULL) AND ("published_by_profile_id" IS NOT NULL)))),
    CONSTRAINT "chk_review_knowledge_cases_review_type_snapshot" CHECK ((("review_type_snapshot" IS NULL) OR ("review_type_snapshot" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text"])))),
    CONSTRAINT "chk_review_knowledge_cases_risk_snapshot" CHECK ((("risk_level_snapshot" IS NULL) OR ("risk_level_snapshot" = ANY (ARRAY['RED'::"text", 'YELLOW'::"text", 'GREEN'::"text"])))),
    CONSTRAINT "chk_review_knowledge_cases_source_version" CHECK (("source_review_version" >= 1)),
    CONSTRAINT "chk_review_knowledge_cases_status" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'PUBLISHED'::"text", 'HIDDEN'::"text"]))),
    CONSTRAINT "chk_review_knowledge_cases_status_fields" CHECK (((("status" = 'PUBLISHED'::"text") AND ("published_at" IS NOT NULL) AND ("published_by_profile_id" IS NOT NULL) AND ("hidden_at" IS NULL) AND ("hidden_by_profile_id" IS NULL) AND ("hidden_reason" IS NULL) AND ("review_type_snapshot" IS NOT NULL)) OR (("status" = 'HIDDEN'::"text") AND ("hidden_at" IS NOT NULL) AND ("hidden_by_profile_id" IS NOT NULL) AND ("hidden_reason" IS NOT NULL)) OR (("status" = 'DRAFT'::"text") AND ("hidden_at" IS NULL) AND ("hidden_by_profile_id" IS NULL) AND ("hidden_reason" IS NULL)))),
    CONSTRAINT "chk_review_knowledge_cases_summary" CHECK ((("summary" IS NULL) OR (("length"("btrim"("summary")) > 0) AND ("length"("summary") <= 5000)))),
    CONSTRAINT "chk_review_knowledge_cases_title" CHECK ((("length"("btrim"("title")) > 0) AND ("length"("title") <= 200))),
    CONSTRAINT "chk_review_knowledge_cases_version" CHECK (("version" >= 1))
);


ALTER TABLE "public"."review_knowledge_cases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "review_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "member_role" "text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "review_members_member_role_check" CHECK (("member_role" = ANY (ARRAY['TECH_PROCESS'::"text", 'DESIGN_PLATE'::"text", 'PRODUCTION'::"text", 'QUALITY'::"text", 'EXPERT_REVIEWER'::"text", 'OTHER'::"text"])))
);


ALTER TABLE "public"."review_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_metadata" (
    "review_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "material_other_text" "text",
    "process_other_text" "text",
    "problem_domain_other_text" "text",
    "problem_symptom_other_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_review_metadata_domain_other_text" CHECK ((("problem_domain_other_text" IS NULL) OR (("char_length"("btrim"("problem_domain_other_text")) > 0) AND ("char_length"("problem_domain_other_text") <= 200)))),
    CONSTRAINT "chk_review_metadata_material_other_text" CHECK ((("material_other_text" IS NULL) OR (("char_length"("btrim"("material_other_text")) > 0) AND ("char_length"("material_other_text") <= 200)))),
    CONSTRAINT "chk_review_metadata_process_other_text" CHECK ((("process_other_text" IS NULL) OR (("char_length"("btrim"("process_other_text")) > 0) AND ("char_length"("process_other_text") <= 200)))),
    CONSTRAINT "chk_review_metadata_symptom_other_text" CHECK ((("problem_symptom_other_text" IS NULL) OR (("char_length"("btrim"("problem_symptom_other_text")) > 0) AND ("char_length"("problem_symptom_other_text") <= 200))))
);


ALTER TABLE "public"."review_metadata" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_metadata_items" (
    "review_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "metadata_type" "text" NOT NULL,
    "dict_item_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_review_metadata_items_primary_scope" CHECK ((("metadata_type" = 'MATERIAL'::"text") OR ("is_primary" = false))),
    CONSTRAINT "chk_review_metadata_items_type" CHECK (("metadata_type" = ANY (ARRAY['MATERIAL'::"text", 'PROCESS'::"text", 'PROBLEM_DOMAIN'::"text", 'PROBLEM_SYMPTOM'::"text"])))
);


ALTER TABLE "public"."review_metadata_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_timeline_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "review_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_profile_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "version" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_review_timeline_event_type_nonblank" CHECK (("length"("btrim"("event_type")) > 0)),
    CONSTRAINT "chk_review_timeline_version" CHECK (("version" >= 1))
);


ALTER TABLE "public"."review_timeline_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_type_details" (
    "review_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "review_type" "text" NOT NULL,
    "pre_production_stage" "text",
    "problem_found_stage" "text",
    "order_loss_reason" "text",
    "customer_trust_impact" "text",
    "customer_notified" boolean,
    "abnormal_phase" "text",
    "abnormal_phenomenon" "text",
    "defect_rate" numeric(7,4),
    "defect_items" "text",
    "delivery_impact" "text",
    "onsite_records" "text",
    "frontend_stage" "text",
    "production_stage" "text",
    "root_cause_summary" "text",
    "responsibility" "text",
    "improvement_advice" "text",
    "additional_notes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_review_type_details_a_scope" CHECK ((("review_type" <> 'A'::"text") OR (("abnormal_phase" IS NULL) AND ("abnormal_phenomenon" IS NULL) AND ("defect_rate" IS NULL) AND ("defect_items" IS NULL) AND ("delivery_impact" IS NULL) AND ("onsite_records" IS NULL) AND ("frontend_stage" IS NULL) AND ("production_stage" IS NULL) AND ("root_cause_summary" IS NULL) AND ("responsibility" IS NULL) AND ("improvement_advice" IS NULL)))),
    CONSTRAINT "chk_review_type_details_b_scope" CHECK ((("review_type" <> 'B'::"text") OR (("pre_production_stage" IS NULL) AND ("problem_found_stage" IS NULL) AND ("order_loss_reason" IS NULL) AND ("customer_trust_impact" IS NULL) AND ("customer_notified" IS NULL) AND ("frontend_stage" IS NULL) AND ("production_stage" IS NULL) AND ("root_cause_summary" IS NULL) AND ("responsibility" IS NULL) AND ("improvement_advice" IS NULL)))),
    CONSTRAINT "review_type_details_review_type_check" CHECK (("review_type" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text"])))
);


ALTER TABLE "public"."review_type_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "summary" "text",
    "what_worked" "text",
    "what_failed" "text",
    "next_optimization" "text",
    "ai_review" "jsonb",
    "human_review" "text",
    "is_template" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scripts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "topic_id" "uuid",
    "account_id" "uuid",
    "title" "text" NOT NULL,
    "hook" "text",
    "main_script" "text",
    "shot_list" "jsonb" DEFAULT '[]'::"jsonb",
    "subtitle_points" "text",
    "cover_text" "text",
    "comment_reply" "text",
    "private_message_cta" "text",
    "risk_notes" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "ai_meta" "jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scripts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'approved'::"text", 'revised'::"text", 'used'::"text"])))
);


ALTER TABLE "public"."scripts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_data" (
    "key" "text" NOT NULL,
    "data" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."site_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "related_type" "text" NOT NULL,
    "related_id" "uuid",
    "assignee_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "due_date" "date",
    "priority" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tasks_related_type_check" CHECK (("related_type" = ANY (ARRAY['account'::"text", 'topic'::"text", 'script'::"text", 'post'::"text", 'lead'::"text", 'review'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "target_audience" "text",
    "customer_pain" "text",
    "product_or_process" "text",
    "source" "text",
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "conversion_goal" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "topics_content_type_check" CHECK (("content_type" = ANY (ARRAY['product'::"text", 'process'::"text", 'case'::"text", 'qa'::"text", 'factory'::"text", 'industry'::"text", 'tutorial'::"text", 'other'::"text"]))),
    CONSTRAINT "topics_priority_check" CHECK (("priority" = ANY (ARRAY['urgent'::"text", 'high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "topics_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'approved'::"text", 'in_production'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."topics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."viral_teardowns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "platform" "text" DEFAULT 'weixin'::"text" NOT NULL,
    "source_url" "text",
    "source_account" "text",
    "title" "text" NOT NULL,
    "cover_text" "text",
    "video_theme" "text",
    "hook" "text",
    "target_audience" "text",
    "pain_point" "text",
    "structure" "text",
    "trust_elements" "text",
    "conversion_action" "text",
    "learnable_points" "text",
    "not_suitable_points" "text",
    "adapted_topics" "jsonb" DEFAULT '[]'::"jsonb",
    "suitable_account_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "viral_teardowns_platform_check" CHECK (("platform" = ANY (ARRAY['weixin'::"text", 'douyin'::"text", 'other'::"text"]))),
    CONSTRAINT "viral_teardowns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'approved'::"text", 'in_production'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."viral_teardowns" OWNER TO "postgres";


ALTER TABLE ONLY "public"."account_rules"
    ADD CONSTRAINT "account_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_runs"
    ADD CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_confirmed_quote_versions"
    ADD CONSTRAINT "commercial_confirmed_quote_versions_org_id_request_id_key" UNIQUE ("org_id", "request_id");



ALTER TABLE ONLY "public"."commercial_confirmed_quote_versions"
    ADD CONSTRAINT "commercial_confirmed_quote_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_confirmed_quote_versions"
    ADD CONSTRAINT "commercial_confirmed_quote_versions_quote_id_version_key" UNIQUE ("quote_id", "version");



ALTER TABLE ONLY "public"."commercial_confirmed_quotes"
    ADD CONSTRAINT "commercial_confirmed_quotes_id_org_id_key" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."commercial_confirmed_quotes"
    ADD CONSTRAINT "commercial_confirmed_quotes_org_id_document_no_key" UNIQUE ("org_id", "document_no");



ALTER TABLE ONLY "public"."commercial_confirmed_quotes"
    ADD CONSTRAINT "commercial_confirmed_quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_payment_methods"
    ADD CONSTRAINT "commercial_payment_methods_org_key" UNIQUE ("org_id", "method_key");



ALTER TABLE ONLY "public"."commercial_payment_methods"
    ADD CONSTRAINT "commercial_payment_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_quotation_draft_revisions"
    ADD CONSTRAINT "commercial_quotation_draft_revisions_draft_id_revision_key" UNIQUE ("draft_id", "revision");



ALTER TABLE ONLY "public"."commercial_quotation_draft_revisions"
    ADD CONSTRAINT "commercial_quotation_draft_revisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_quotation_drafts"
    ADD CONSTRAINT "commercial_quotation_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cpc_ai_drafts"
    ADD CONSTRAINT "cpc_ai_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cpc_audit_log"
    ADD CONSTRAINT "cpc_audit_log_audit_seq_key" UNIQUE ("audit_seq");



ALTER TABLE ONLY "public"."cpc_audit_log"
    ADD CONSTRAINT "cpc_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cpc_customer_potential_assessments"
    ADD CONSTRAINT "cpc_customer_potential_assessments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cpc_customer_references"
    ADD CONSTRAINT "cpc_customer_references_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cpc_customer_workspaces"
    ADD CONSTRAINT "cpc_customer_workspaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cpc_external_profile_mappings"
    ADD CONSTRAINT "cpc_external_profile_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cpc_project_events"
    ADD CONSTRAINT "cpc_project_events_event_seq_key" UNIQUE ("event_seq");



ALTER TABLE ONLY "public"."cpc_project_events"
    ADD CONSTRAINT "cpc_project_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cpc_project_members"
    ADD CONSTRAINT "cpc_project_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cpc_projects"
    ADD CONSTRAINT "cpc_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cpc_reports"
    ADD CONSTRAINT "cpc_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cpc_work_items"
    ADD CONSTRAINT "cpc_work_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_activity_events"
    ADD CONSTRAINT "glh_activity_events_event_seq_key" UNIQUE ("event_seq");



ALTER TABLE ONLY "public"."glh_activity_events"
    ADD CONSTRAINT "glh_activity_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_ad_campaigns"
    ADD CONSTRAINT "glh_ad_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_ad_creatives"
    ADD CONSTRAINT "glh_ad_creatives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_ai_actions"
    ADD CONSTRAINT "glh_ai_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_assignments"
    ADD CONSTRAINT "glh_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_audit_events"
    ADD CONSTRAINT "glh_audit_events_audit_seq_key" UNIQUE ("audit_seq");



ALTER TABLE ONLY "public"."glh_audit_events"
    ADD CONSTRAINT "glh_audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_automation_runs"
    ADD CONSTRAINT "glh_automation_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_channel_accounts"
    ADD CONSTRAINT "glh_channel_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_contacts"
    ADD CONSTRAINT "glh_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_conversations"
    ADD CONSTRAINT "glh_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_followups"
    ADD CONSTRAINT "glh_followups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_lead_profiles"
    ADD CONSTRAINT "glh_lead_profiles_pkey" PRIMARY KEY ("lead_id");



ALTER TABLE ONLY "public"."glh_lead_scores"
    ADD CONSTRAINT "glh_lead_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_leads"
    ADD CONSTRAINT "glh_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_manual_intake_requests"
    ADD CONSTRAINT "glh_manual_intake_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_manual_work_updates"
    ADD CONSTRAINT "glh_manual_work_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_messages"
    ADD CONSTRAINT "glh_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_role_bindings"
    ADD CONSTRAINT "glh_role_bindings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_tasks"
    ADD CONSTRAINT "glh_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glh_webhook_events"
    ADD CONSTRAINT "glh_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_cards"
    ADD CONSTRAINT "knowledge_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_interactions"
    ADD CONSTRAINT "lead_interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_case_number_counters"
    ADD CONSTRAINT "pk_review_case_number_counters" PRIMARY KEY ("org_id", "year");



ALTER TABLE ONLY "public"."review_knowledge_case_metadata_items"
    ADD CONSTRAINT "pk_review_knowledge_case_metadata_items" PRIMARY KEY ("case_id", "metadata_type", "code");



ALTER TABLE ONLY "public"."review_metadata_items"
    ADD CONSTRAINT "pk_review_metadata_items" PRIMARY KEY ("review_id", "metadata_type", "dict_item_id");



ALTER TABLE ONLY "public"."post_metrics"
    ADD CONSTRAINT "post_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."review_actions"
    ADD CONSTRAINT "review_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_audit_logs"
    ADD CONSTRAINT "review_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_case_audit_logs"
    ADD CONSTRAINT "review_case_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_cases"
    ADD CONSTRAINT "review_cases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_dict_items"
    ADD CONSTRAINT "review_dict_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_knowledge_case_metadata"
    ADD CONSTRAINT "review_knowledge_case_metadata_pkey" PRIMARY KEY ("case_id");



ALTER TABLE ONLY "public"."review_knowledge_cases"
    ADD CONSTRAINT "review_knowledge_cases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_members"
    ADD CONSTRAINT "review_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_metadata"
    ADD CONSTRAINT "review_metadata_pkey" PRIMARY KEY ("review_id");



ALTER TABLE ONLY "public"."review_timeline_events"
    ADD CONSTRAINT "review_timeline_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_type_details"
    ADD CONSTRAINT "review_type_details_pkey" PRIMARY KEY ("review_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scripts"
    ADD CONSTRAINT "scripts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_data"
    ADD CONSTRAINT "site_data_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cpc_ai_drafts"
    ADD CONSTRAINT "uq_cpc_ai_drafts_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."cpc_customer_potential_assessments"
    ADD CONSTRAINT "uq_cpc_customer_potential_assessment_org_customer" UNIQUE ("org_id", "customer_reference_id");



ALTER TABLE ONLY "public"."cpc_customer_references"
    ADD CONSTRAINT "uq_cpc_customer_references_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."cpc_customer_workspaces"
    ADD CONSTRAINT "uq_cpc_customer_workspaces_org_ref" UNIQUE ("org_id", "customer_reference_id");



ALTER TABLE ONLY "public"."cpc_external_profile_mappings"
    ADD CONSTRAINT "uq_cpc_external_profile_mapping_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."cpc_project_events"
    ADD CONSTRAINT "uq_cpc_project_events_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."cpc_project_members"
    ADD CONSTRAINT "uq_cpc_project_members_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."cpc_projects"
    ADD CONSTRAINT "uq_cpc_projects_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."cpc_reports"
    ADD CONSTRAINT "uq_cpc_reports_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."cpc_work_items"
    ADD CONSTRAINT "uq_cpc_work_items_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_activity_events"
    ADD CONSTRAINT "uq_glh_activity_events_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_ad_campaigns"
    ADD CONSTRAINT "uq_glh_ad_campaigns_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_ad_campaigns"
    ADD CONSTRAINT "uq_glh_ad_campaigns_provider_external" UNIQUE ("org_id", "provider", "external_campaign_id");



ALTER TABLE ONLY "public"."glh_ad_creatives"
    ADD CONSTRAINT "uq_glh_ad_creatives_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_ai_actions"
    ADD CONSTRAINT "uq_glh_ai_actions_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_assignments"
    ADD CONSTRAINT "uq_glh_assignments_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_audit_events"
    ADD CONSTRAINT "uq_glh_audit_events_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_automation_runs"
    ADD CONSTRAINT "uq_glh_automation_runs_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_channel_accounts"
    ADD CONSTRAINT "uq_glh_channel_accounts_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_channel_accounts"
    ADD CONSTRAINT "uq_glh_channel_accounts_provider_external" UNIQUE ("org_id", "provider", "external_account_id");



ALTER TABLE ONLY "public"."glh_contacts"
    ADD CONSTRAINT "uq_glh_contacts_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_conversations"
    ADD CONSTRAINT "uq_glh_conversations_external" UNIQUE ("org_id", "channel_account_id", "external_conversation_id");



ALTER TABLE ONLY "public"."glh_conversations"
    ADD CONSTRAINT "uq_glh_conversations_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_followups"
    ADD CONSTRAINT "uq_glh_followups_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_lead_profiles"
    ADD CONSTRAINT "uq_glh_lead_profiles_lead_org" UNIQUE ("lead_id", "org_id");



ALTER TABLE ONLY "public"."glh_lead_scores"
    ADD CONSTRAINT "uq_glh_lead_scores_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_leads"
    ADD CONSTRAINT "uq_glh_leads_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_manual_intake_requests"
    ADD CONSTRAINT "uq_glh_manual_intake_actor_key" UNIQUE ("org_id", "actor_profile_id", "request_key");



ALTER TABLE ONLY "public"."glh_messages"
    ADD CONSTRAINT "uq_glh_messages_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_messages"
    ADD CONSTRAINT "uq_glh_messages_provider_external" UNIQUE ("org_id", "provider", "provider_message_id");



ALTER TABLE ONLY "public"."glh_role_bindings"
    ADD CONSTRAINT "uq_glh_role_bindings_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_tasks"
    ADD CONSTRAINT "uq_glh_tasks_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."glh_webhook_events"
    ADD CONSTRAINT "uq_glh_webhook_events_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."review_actions"
    ADD CONSTRAINT "uq_review_actions_review_sequence" UNIQUE ("review_id", "org_id", "sequence");



ALTER TABLE ONLY "public"."review_cases"
    ADD CONSTRAINT "uq_review_cases_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."review_cases"
    ADD CONSTRAINT "uq_review_cases_id_org_type" UNIQUE ("id", "org_id", "review_type");



ALTER TABLE ONLY "public"."review_cases"
    ADD CONSTRAINT "uq_review_cases_no" UNIQUE ("org_id", "review_no");



ALTER TABLE ONLY "public"."review_dict_items"
    ADD CONSTRAINT "uq_review_dict_items_id_type" UNIQUE ("id", "dict_type");



ALTER TABLE ONLY "public"."review_knowledge_case_metadata"
    ADD CONSTRAINT "uq_review_knowledge_case_metadata_case_org" UNIQUE ("case_id", "org_id");



ALTER TABLE ONLY "public"."review_knowledge_cases"
    ADD CONSTRAINT "uq_review_knowledge_cases_id_org" UNIQUE ("id", "org_id");



ALTER TABLE ONLY "public"."review_knowledge_cases"
    ADD CONSTRAINT "uq_review_knowledge_cases_org_case_no" UNIQUE ("org_id", "case_no");



ALTER TABLE ONLY "public"."review_knowledge_cases"
    ADD CONSTRAINT "uq_review_knowledge_cases_org_source" UNIQUE ("org_id", "source_review_id");



ALTER TABLE ONLY "public"."review_members"
    ADD CONSTRAINT "uq_review_members_role" UNIQUE ("review_id", "profile_id", "member_role");



ALTER TABLE ONLY "public"."viral_teardowns"
    ADD CONSTRAINT "viral_teardowns_pkey" PRIMARY KEY ("id");



CREATE INDEX "commercial_draft_revisions_recent" ON "public"."commercial_quotation_draft_revisions" USING "btree" ("org_id", "draft_id", "revision" DESC);



CREATE INDEX "commercial_payment_methods_org_approved_idx" ON "public"."commercial_payment_methods" USING "btree" ("org_id", "approved", "method_key");



CREATE INDEX "commercial_quotation_drafts_owner_recent" ON "public"."commercial_quotation_drafts" USING "btree" ("org_id", "owner_profile_id", "updated_at" DESC);



CREATE INDEX "confirmed_quote_recent" ON "public"."commercial_confirmed_quote_versions" USING "btree" ("org_id", "confirmed_at" DESC);



CREATE INDEX "idx_accounts_org_id" ON "public"."accounts" USING "btree" ("org_id");



CREATE INDEX "idx_accounts_platform" ON "public"."accounts" USING "btree" ("platform");



CREATE INDEX "idx_accounts_status" ON "public"."accounts" USING "btree" ("status");



CREATE INDEX "idx_ai_runs_org_id" ON "public"."ai_runs" USING "btree" ("org_id");



CREATE INDEX "idx_ai_runs_run_type" ON "public"."ai_runs" USING "btree" ("run_type");



CREATE INDEX "idx_cpc_ai_drafts_org_customer_status" ON "public"."cpc_ai_drafts" USING "btree" ("org_id", "customer_reference_id", "status") WHERE ("customer_reference_id" IS NOT NULL);



CREATE INDEX "idx_cpc_ai_drafts_org_project_status" ON "public"."cpc_ai_drafts" USING "btree" ("org_id", "project_id", "status") WHERE ("project_id" IS NOT NULL);



CREATE INDEX "idx_cpc_ai_drafts_org_status_created" ON "public"."cpc_ai_drafts" USING "btree" ("org_id", "status", "created_at" DESC);



CREATE INDEX "idx_cpc_audit_org_entity" ON "public"."cpc_audit_log" USING "btree" ("org_id", "entity_type", "entity_id", "audit_seq");



CREATE INDEX "idx_cpc_audit_org_seq" ON "public"."cpc_audit_log" USING "btree" ("org_id", "audit_seq");



CREATE INDEX "idx_cpc_customer_reference_external_owner" ON "public"."cpc_customer_references" USING "btree" ("org_id", "external_owner_reference") WHERE ("external_owner_reference" IS NOT NULL);



CREATE INDEX "idx_cpc_customer_reference_org_status" ON "public"."cpc_customer_references" USING "btree" ("org_id", "status");



CREATE INDEX "idx_cpc_project_events_org_customer_seq" ON "public"."cpc_project_events" USING "btree" ("org_id", "customer_reference_id", "event_seq") WHERE ("customer_reference_id" IS NOT NULL);



CREATE INDEX "idx_cpc_project_events_org_project_seq" ON "public"."cpc_project_events" USING "btree" ("org_id", "project_id", "event_seq") WHERE ("project_id" IS NOT NULL);



CREATE INDEX "idx_cpc_project_events_org_seq" ON "public"."cpc_project_events" USING "btree" ("org_id", "event_seq");



CREATE INDEX "idx_cpc_project_members_org_profile" ON "public"."cpc_project_members" USING "btree" ("org_id", "profile_id") WHERE ("removed_at" IS NULL);



CREATE INDEX "idx_cpc_projects_org_customer" ON "public"."cpc_projects" USING "btree" ("org_id", "customer_reference_id");



CREATE INDEX "idx_cpc_projects_org_owner" ON "public"."cpc_projects" USING "btree" ("org_id", "owner_profile_id");



CREATE INDEX "idx_cpc_projects_org_priority" ON "public"."cpc_projects" USING "btree" ("org_id", "priority");



CREATE INDEX "idx_cpc_projects_org_status" ON "public"."cpc_projects" USING "btree" ("org_id", "status");



CREATE INDEX "idx_cpc_projects_org_waiting_check" ON "public"."cpc_projects" USING "btree" ("org_id", "next_check_at") WHERE (("waiting_on" <> 'none'::"text") AND ("next_check_at" IS NOT NULL));



CREATE INDEX "idx_cpc_rating_assessor" ON "public"."cpc_customer_potential_assessments" USING "btree" ("org_id", "assessor_profile_id");



CREATE INDEX "idx_cpc_rating_review_queue" ON "public"."cpc_customer_potential_assessments" USING "btree" ("org_id", "status", "updated_at" DESC);



CREATE INDEX "idx_cpc_reports_org_subject_period" ON "public"."cpc_reports" USING "btree" ("org_id", "subject_profile_id", "period_type", "period_start" DESC, "revision_no" DESC);



CREATE INDEX "idx_cpc_work_items_org_assignee_status_due" ON "public"."cpc_work_items" USING "btree" ("org_id", "assignee_profile_id", "status", "due_at");



CREATE INDEX "idx_cpc_work_items_org_customer" ON "public"."cpc_work_items" USING "btree" ("org_id", "customer_reference_id") WHERE ("customer_reference_id" IS NOT NULL);



CREATE INDEX "idx_cpc_work_items_org_project" ON "public"."cpc_work_items" USING "btree" ("org_id", "project_id") WHERE ("project_id" IS NOT NULL);



CREATE INDEX "idx_glh_activity_events_org_lead_created" ON "public"."glh_activity_events" USING "btree" ("org_id", "lead_id", "created_at" DESC);



CREATE INDEX "idx_glh_ad_campaigns_org_status" ON "public"."glh_ad_campaigns" USING "btree" ("org_id", "status");



CREATE INDEX "idx_glh_ad_creatives_org_campaign" ON "public"."glh_ad_creatives" USING "btree" ("org_id", "campaign_id");



CREATE INDEX "idx_glh_ai_actions_org_lead_created" ON "public"."glh_ai_actions" USING "btree" ("org_id", "lead_id", "created_at" DESC);



CREATE INDEX "idx_glh_assignments_org_assignee_status" ON "public"."glh_assignments" USING "btree" ("org_id", "assignee_profile_id", "status");



CREATE INDEX "idx_glh_audit_events_org_entity_created" ON "public"."glh_audit_events" USING "btree" ("org_id", "entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "idx_glh_audit_events_org_type_created" ON "public"."glh_audit_events" USING "btree" ("org_id", "event_type", "created_at" DESC);



CREATE INDEX "idx_glh_automation_runs_org_status_created" ON "public"."glh_automation_runs" USING "btree" ("org_id", "status", "created_at" DESC);



CREATE INDEX "idx_glh_channel_accounts_org_status" ON "public"."glh_channel_accounts" USING "btree" ("org_id", "status");



CREATE INDEX "idx_glh_contacts_phone" ON "public"."glh_contacts" USING "btree" ("org_id", "normalized_phone") WHERE ("normalized_phone" IS NOT NULL);



CREATE INDEX "idx_glh_conversations_org_last_message" ON "public"."glh_conversations" USING "btree" ("org_id", "last_message_at" DESC);



CREATE INDEX "idx_glh_conversations_org_lead" ON "public"."glh_conversations" USING "btree" ("org_id", "lead_id");



CREATE INDEX "idx_glh_conversations_org_mode" ON "public"."glh_conversations" USING "btree" ("org_id", "conversation_mode");



CREATE INDEX "idx_glh_followups_org_assignee_status_due" ON "public"."glh_followups" USING "btree" ("org_id", "assigned_profile_id", "status", "due_at");



CREATE INDEX "idx_glh_lead_profiles_org_requirement" ON "public"."glh_lead_profiles" USING "btree" ("org_id", "requirement_type");



CREATE INDEX "idx_glh_lead_scores_org_lead_created" ON "public"."glh_lead_scores" USING "btree" ("org_id", "lead_id", "created_at" DESC);



CREATE INDEX "idx_glh_leads_org_created" ON "public"."glh_leads" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_glh_leads_org_followup" ON "public"."glh_leads" USING "btree" ("org_id", "next_follow_up_at") WHERE ("next_follow_up_at" IS NOT NULL);



CREATE INDEX "idx_glh_leads_org_owner" ON "public"."glh_leads" USING "btree" ("org_id", "owner_profile_id");



CREATE INDEX "idx_glh_leads_org_state" ON "public"."glh_leads" USING "btree" ("org_id", "lifecycle_state");



CREATE INDEX "idx_glh_manual_intake_org_created" ON "public"."glh_manual_intake_requests" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_glh_manual_work_history" ON "public"."glh_manual_work_updates" USING "btree" ("org_id", "lead_id", "created_at" DESC);



CREATE INDEX "idx_glh_messages_org_conversation_time" ON "public"."glh_messages" USING "btree" ("org_id", "conversation_id", "provider_timestamp");



CREATE INDEX "idx_glh_messages_org_lead" ON "public"."glh_messages" USING "btree" ("org_id", "lead_id");



CREATE INDEX "idx_glh_role_bindings_org_role_status" ON "public"."glh_role_bindings" USING "btree" ("org_id", "role", "status");



CREATE INDEX "idx_glh_tasks_org_assignee_status_due" ON "public"."glh_tasks" USING "btree" ("org_id", "assignee_profile_id", "status", "due_at");



CREATE INDEX "idx_glh_webhook_org_status" ON "public"."glh_webhook_events" USING "btree" ("org_id", "processing_status", "received_at" DESC);



CREATE INDEX "idx_knowledge_cards_category" ON "public"."knowledge_cards" USING "btree" ("category");



CREATE INDEX "idx_knowledge_cards_org_id" ON "public"."knowledge_cards" USING "btree" ("org_id");



CREATE INDEX "idx_lead_interactions_lead_id" ON "public"."lead_interactions" USING "btree" ("lead_id");



CREATE INDEX "idx_leads_assigned_to" ON "public"."leads" USING "btree" ("assigned_to");



CREATE INDEX "idx_leads_created_at" ON "public"."leads" USING "btree" ("created_at");



CREATE INDEX "idx_leads_lead_grade" ON "public"."leads" USING "btree" ("lead_grade");



CREATE INDEX "idx_leads_org_id" ON "public"."leads" USING "btree" ("org_id");



CREATE INDEX "idx_leads_source_account_id" ON "public"."leads" USING "btree" ("source_account_id");



CREATE INDEX "idx_leads_status" ON "public"."leads" USING "btree" ("status");



CREATE INDEX "idx_media_assets_related" ON "public"."media_assets" USING "btree" ("related_type", "related_id");



CREATE INDEX "idx_post_metrics_metric_date" ON "public"."post_metrics" USING "btree" ("metric_date");



CREATE INDEX "idx_post_metrics_org_id" ON "public"."post_metrics" USING "btree" ("org_id");



CREATE INDEX "idx_post_metrics_post_id" ON "public"."post_metrics" USING "btree" ("post_id");



CREATE INDEX "idx_posts_account_id" ON "public"."posts" USING "btree" ("account_id");



CREATE INDEX "idx_posts_org_id" ON "public"."posts" USING "btree" ("org_id");



CREATE INDEX "idx_posts_platform" ON "public"."posts" USING "btree" ("platform");



CREATE INDEX "idx_posts_publish_date" ON "public"."posts" USING "btree" ("publish_date");



CREATE INDEX "idx_posts_status" ON "public"."posts" USING "btree" ("status");



CREATE INDEX "idx_profiles_org_id" ON "public"."profiles" USING "btree" ("org_id");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_profiles_user_id" ON "public"."profiles" USING "btree" ("user_id");



CREATE INDEX "idx_review_actions_org_owner_status" ON "public"."review_actions" USING "btree" ("org_id", "owner_profile_id", "status");



CREATE INDEX "idx_review_actions_org_review" ON "public"."review_actions" USING "btree" ("org_id", "review_id");



CREATE INDEX "idx_review_actions_org_status_due_date" ON "public"."review_actions" USING "btree" ("org_id", "status", "due_date");



CREATE INDEX "idx_review_audit_logs_org_actor" ON "public"."review_audit_logs" USING "btree" ("org_id", "actor_profile_id");



CREATE INDEX "idx_review_audit_logs_org_entity" ON "public"."review_audit_logs" USING "btree" ("org_id", "entity_type", "created_at" DESC);



CREATE INDEX "idx_review_audit_logs_org_review" ON "public"."review_audit_logs" USING "btree" ("org_id", "review_id", "created_at" DESC);



CREATE INDEX "idx_review_case_audit_logs_org_case_created" ON "public"."review_case_audit_logs" USING "btree" ("org_id", "case_id", "created_at" DESC, "id" DESC);



CREATE INDEX "idx_review_cases_org_created" ON "public"."review_cases" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_review_cases_org_created_by" ON "public"."review_cases" USING "btree" ("org_id", "created_by");



CREATE INDEX "idx_review_cases_org_owner" ON "public"."review_cases" USING "btree" ("org_id", "owner_id");



CREATE INDEX "idx_review_cases_org_risk" ON "public"."review_cases" USING "btree" ("org_id", "risk_level");



CREATE INDEX "idx_review_cases_org_status" ON "public"."review_cases" USING "btree" ("org_id", "status");



CREATE INDEX "idx_review_cases_org_status_submitted_at" ON "public"."review_cases" USING "btree" ("org_id", "status", "submitted_at" DESC) WHERE ("submitted_at" IS NOT NULL);



CREATE INDEX "idx_review_cases_org_type" ON "public"."review_cases" USING "btree" ("org_id", "review_type");



CREATE INDEX "idx_review_dict_items_org_enabled" ON "public"."review_dict_items" USING "btree" ("org_id", "enabled");



CREATE INDEX "idx_review_knowledge_case_metadata_items_org_type_code" ON "public"."review_knowledge_case_metadata_items" USING "btree" ("org_id", "metadata_type", "code");



CREATE INDEX "idx_review_knowledge_cases_org_status" ON "public"."review_knowledge_cases" USING "btree" ("org_id", "status");



CREATE INDEX "idx_review_knowledge_cases_org_status_published" ON "public"."review_knowledge_cases" USING "btree" ("org_id", "status", "published_at" DESC);



CREATE INDEX "idx_review_members_org_profile" ON "public"."review_members" USING "btree" ("org_id", "profile_id");



CREATE INDEX "idx_review_members_review" ON "public"."review_members" USING "btree" ("review_id");



CREATE INDEX "idx_review_members_role" ON "public"."review_members" USING "btree" ("member_role");



CREATE INDEX "idx_review_metadata_items_dict_item" ON "public"."review_metadata_items" USING "btree" ("dict_item_id", "metadata_type");



CREATE INDEX "idx_review_metadata_items_org_review" ON "public"."review_metadata_items" USING "btree" ("org_id", "review_id");



CREATE INDEX "idx_review_metadata_items_org_type_item" ON "public"."review_metadata_items" USING "btree" ("org_id", "metadata_type", "dict_item_id");



CREATE INDEX "idx_review_timeline_events_org_review" ON "public"."review_timeline_events" USING "btree" ("org_id", "review_id", "created_at");



CREATE INDEX "idx_review_timeline_events_org_type" ON "public"."review_timeline_events" USING "btree" ("org_id", "event_type", "created_at" DESC);



CREATE INDEX "idx_review_type_details_org_type" ON "public"."review_type_details" USING "btree" ("org_id", "review_type");



CREATE INDEX "idx_reviews_org_id" ON "public"."reviews" USING "btree" ("org_id");



CREATE INDEX "idx_reviews_post_id" ON "public"."reviews" USING "btree" ("post_id");



CREATE INDEX "idx_scripts_account_id" ON "public"."scripts" USING "btree" ("account_id");



CREATE INDEX "idx_scripts_org_id" ON "public"."scripts" USING "btree" ("org_id");



CREATE INDEX "idx_scripts_status" ON "public"."scripts" USING "btree" ("status");



CREATE INDEX "idx_scripts_topic_id" ON "public"."scripts" USING "btree" ("topic_id");



CREATE INDEX "idx_tasks_assignee" ON "public"."tasks" USING "btree" ("assignee_id");



CREATE INDEX "idx_topics_account_id" ON "public"."topics" USING "btree" ("account_id");



CREATE INDEX "idx_topics_content_type" ON "public"."topics" USING "btree" ("content_type");



CREATE INDEX "idx_topics_created_at" ON "public"."topics" USING "btree" ("created_at");



CREATE INDEX "idx_topics_org_id" ON "public"."topics" USING "btree" ("org_id");



CREATE INDEX "idx_topics_priority" ON "public"."topics" USING "btree" ("priority");



CREATE INDEX "idx_topics_status" ON "public"."topics" USING "btree" ("status");



CREATE INDEX "idx_viral_teardowns_org_id" ON "public"."viral_teardowns" USING "btree" ("org_id");



CREATE INDEX "idx_viral_teardowns_suitable_account_id" ON "public"."viral_teardowns" USING "btree" ("suitable_account_id");



CREATE UNIQUE INDEX "uq_cpc_customer_reference_canonical" ON "public"."cpc_customer_references" USING "btree" ("org_id", "external_source", "external_customer_id") WHERE ("reference_kind" = 'canonical'::"text");



CREATE UNIQUE INDEX "uq_cpc_customer_reference_provisional_source" ON "public"."cpc_customer_references" USING "btree" ("org_id", "provisional_source_reference") WHERE ("reference_kind" = 'provisional'::"text");



CREATE UNIQUE INDEX "uq_cpc_external_profile_mapping_active_profile" ON "public"."cpc_external_profile_mappings" USING "btree" ("org_id", "external_source", "profile_id") WHERE ("status" = 'active'::"text");



CREATE UNIQUE INDEX "uq_cpc_external_profile_mapping_external" ON "public"."cpc_external_profile_mappings" USING "btree" ("org_id", "external_source", "external_person_id");



CREATE UNIQUE INDEX "uq_cpc_project_created_request_replay" ON "public"."cpc_audit_log" USING "btree" ("org_id", "actor_profile_id", "request_id") WHERE (("action" = 'PROJECT_CREATED'::"text") AND ("request_id" IS NOT NULL) AND ("actor_profile_id" IS NOT NULL));



CREATE UNIQUE INDEX "uq_cpc_project_member_active" ON "public"."cpc_project_members" USING "btree" ("project_id", "profile_id") WHERE ("removed_at" IS NULL);



CREATE UNIQUE INDEX "uq_cpc_report_active_draft" ON "public"."cpc_reports" USING "btree" ("org_id", "subject_profile_id", "period_type", "period_start", "period_end") WHERE ("status" = 'draft'::"text");



CREATE UNIQUE INDEX "uq_cpc_report_revision" ON "public"."cpc_reports" USING "btree" ("org_id", "subject_profile_id", "period_type", "period_start", "period_end", "revision_no");



CREATE UNIQUE INDEX "uq_cpc_work_item_open_next_action" ON "public"."cpc_work_items" USING "btree" ("project_id") WHERE (("work_item_type" = 'NEXT_ACTION'::"text") AND ("project_id" IS NOT NULL) AND ("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'blocked'::"text"])));



CREATE UNIQUE INDEX "uq_glh_ad_creatives_provider_external" ON "public"."glh_ad_creatives" USING "btree" ("org_id", "provider", "external_creative_id") WHERE ("external_creative_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_glh_ai_actions_send_idempotency" ON "public"."glh_ai_actions" USING "btree" ("org_id", "conversation_id", COALESCE("trigger_message_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "action_type", "prompt_version") WHERE ("action_type" = 'AI_SEND'::"text");



CREATE UNIQUE INDEX "uq_glh_assignments_active_primary" ON "public"."glh_assignments" USING "btree" ("lead_id") WHERE (("assignment_type" = 'PRIMARY'::"text") AND ("status" = 'ACTIVE'::"text"));



CREATE UNIQUE INDEX "uq_glh_contacts_email" ON "public"."glh_contacts" USING "btree" ("org_id", "normalized_email") WHERE ("normalized_email" IS NOT NULL);



CREATE UNIQUE INDEX "uq_glh_contacts_provider_external" ON "public"."glh_contacts" USING "btree" ("org_id", "source_platform", "provider_external_contact_id") WHERE ("provider_external_contact_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_glh_contacts_whatsapp" ON "public"."glh_contacts" USING "btree" ("org_id", "normalized_whatsapp") WHERE ("normalized_whatsapp" IS NOT NULL);



CREATE UNIQUE INDEX "uq_glh_role_bindings_active" ON "public"."glh_role_bindings" USING "btree" ("org_id", "profile_id", "role") WHERE ("status" = 'ACTIVE'::"text");



CREATE UNIQUE INDEX "uq_glh_webhook_provider_event" ON "public"."glh_webhook_events" USING "btree" ("provider", "external_event_id");



CREATE UNIQUE INDEX "uq_profiles_id_org" ON "public"."profiles" USING "btree" ("id", "org_id");



CREATE UNIQUE INDEX "uq_review_dict_items_org" ON "public"."review_dict_items" USING "btree" ("org_id", "dict_type", "code") WHERE ("org_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_review_dict_items_system" ON "public"."review_dict_items" USING "btree" ("dict_type", "code") WHERE ("org_id" IS NULL);



CREATE UNIQUE INDEX "uq_review_knowledge_case_metadata_items_primary_material" ON "public"."review_knowledge_case_metadata_items" USING "btree" ("case_id") WHERE (("metadata_type" = 'MATERIAL'::"text") AND ("is_primary" = true));



CREATE UNIQUE INDEX "uq_review_members_primary_role" ON "public"."review_members" USING "btree" ("review_id", "member_role") WHERE ("is_primary" = true);



CREATE UNIQUE INDEX "uq_review_metadata_items_primary_material" ON "public"."review_metadata_items" USING "btree" ("review_id") WHERE (("metadata_type" = 'MATERIAL'::"text") AND ("is_primary" = true));



CREATE OR REPLACE TRIGGER "confirmed_quote_header_guard" BEFORE DELETE OR UPDATE ON "public"."commercial_confirmed_quotes" FOR EACH ROW EXECUTE FUNCTION "commercial_private"."guard_confirmed_quote_header"();



CREATE OR REPLACE TRIGGER "confirmed_quote_payment_snapshot" BEFORE INSERT ON "public"."commercial_confirmed_quote_versions" FOR EACH ROW EXECUTE FUNCTION "commercial_private"."freeze_confirmed_payment_method"();



CREATE OR REPLACE TRIGGER "confirmed_quote_version_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."commercial_confirmed_quote_versions" FOR EACH ROW EXECUTE FUNCTION "commercial_private"."guard_confirmed_quote_version"();



CREATE CONSTRAINT TRIGGER "cpc_active_project_invariant_project" AFTER INSERT OR UPDATE ON "public"."cpc_projects" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."cpc_enforce_active_project_invariant"();



CREATE CONSTRAINT TRIGGER "cpc_active_project_invariant_work_items" AFTER INSERT OR DELETE OR UPDATE ON "public"."cpc_work_items" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."cpc_enforce_active_project_invariant"();



CREATE OR REPLACE TRIGGER "record_commercial_draft_revision" AFTER INSERT OR UPDATE ON "public"."commercial_quotation_drafts" FOR EACH ROW EXECUTE FUNCTION "commercial_audit"."record_commercial_draft_revision"();



CREATE OR REPLACE TRIGGER "set_site_data_timestamp" BEFORE UPDATE ON "public"."site_data" FOR EACH ROW EXECUTE FUNCTION "public"."update_site_data_timestamp"();



CREATE OR REPLACE TRIGGER "trg_cpc_audit_log_append_only" BEFORE DELETE OR UPDATE ON "public"."cpc_audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."cpc_reject_append_only_mutation"();



CREATE OR REPLACE TRIGGER "trg_cpc_customer_references_updated_at" BEFORE UPDATE ON "public"."cpc_customer_references" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_cpc_external_profile_mappings_updated_at" BEFORE UPDATE ON "public"."cpc_external_profile_mappings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_cpc_project_events_append_only" BEFORE DELETE OR UPDATE ON "public"."cpc_project_events" FOR EACH ROW EXECUTE FUNCTION "public"."cpc_reject_append_only_mutation"();



CREATE OR REPLACE TRIGGER "trg_cpc_projects_updated_at" BEFORE UPDATE ON "public"."cpc_projects" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_cpc_rating_updated_at" BEFORE UPDATE ON "public"."cpc_customer_potential_assessments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_cpc_reports_submitted_immutable" BEFORE DELETE OR UPDATE ON "public"."cpc_reports" FOR EACH ROW EXECUTE FUNCTION "public"."cpc_guard_submitted_report_immutability"();



CREATE OR REPLACE TRIGGER "trg_cpc_work_items_updated_at" BEFORE UPDATE ON "public"."cpc_work_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_cpc_workspace_updated_at" BEFORE UPDATE ON "public"."cpc_customer_workspaces" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_glh_ad_campaigns_updated_at" BEFORE UPDATE ON "public"."glh_ad_campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_glh_ad_creatives_updated_at" BEFORE UPDATE ON "public"."glh_ad_creatives" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_glh_channel_accounts_updated_at" BEFORE UPDATE ON "public"."glh_channel_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_glh_contacts_updated_at" BEFORE UPDATE ON "public"."glh_contacts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_glh_conversations_updated_at" BEFORE UPDATE ON "public"."glh_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_glh_followups_updated_at" BEFORE UPDATE ON "public"."glh_followups" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_glh_lead_profiles_updated_at" BEFORE UPDATE ON "public"."glh_lead_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_glh_leads_updated_at" BEFORE UPDATE ON "public"."glh_leads" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_glh_tasks_updated_at" BEFORE UPDATE ON "public"."glh_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_organizations_protect_immutable" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."organizations_protect_immutable"();



CREATE OR REPLACE TRIGGER "trg_organizations_set_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_review_cases_create_audit" AFTER INSERT ON "public"."review_cases" FOR EACH ROW EXECUTE FUNCTION "public"."review_create_audit_trigger"();



CREATE OR REPLACE TRIGGER "trg_review_cases_set_updated_at" BEFORE UPDATE ON "public"."review_cases" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_review_dict_items_set_updated_at" BEFORE UPDATE ON "public"."review_dict_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_review_knowledge_cases_set_updated_at" BEFORE UPDATE ON "public"."review_knowledge_cases" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_review_type_details_set_updated_at" BEFORE UPDATE ON "public"."review_type_details" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."account_rules"
    ADD CONSTRAINT "account_rules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."account_rules"
    ADD CONSTRAINT "account_rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."ai_runs"
    ADD CONSTRAINT "ai_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."ai_runs"
    ADD CONSTRAINT "ai_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."commercial_confirmed_quote_versions"
    ADD CONSTRAINT "commercial_confirmed_quote_version_confirmed_by_profile_id_fkey" FOREIGN KEY ("confirmed_by_profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."commercial_confirmed_quote_versions"
    ADD CONSTRAINT "commercial_confirmed_quote_versions_quote_id_org_id_fkey" FOREIGN KEY ("quote_id", "org_id") REFERENCES "public"."commercial_confirmed_quotes"("id", "org_id");



ALTER TABLE ONLY "public"."commercial_confirmed_quotes"
    ADD CONSTRAINT "commercial_confirmed_quotes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."commercial_confirmed_quotes"
    ADD CONSTRAINT "commercial_confirmed_quotes_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."commercial_payment_methods"
    ADD CONSTRAINT "commercial_payment_methods_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."commercial_payment_methods"
    ADD CONSTRAINT "commercial_payment_methods_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."commercial_payment_methods"
    ADD CONSTRAINT "commercial_payment_methods_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."commercial_quotation_draft_revisions"
    ADD CONSTRAINT "commercial_quotation_draft_revisions_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "public"."commercial_quotation_drafts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."commercial_quotation_draft_revisions"
    ADD CONSTRAINT "commercial_quotation_draft_revisions_editor_profile_id_fkey" FOREIGN KEY ("editor_profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."commercial_quotation_draft_revisions"
    ADD CONSTRAINT "commercial_quotation_draft_revisions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."commercial_quotation_draft_revisions"
    ADD CONSTRAINT "commercial_quotation_draft_revisions_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."commercial_quotation_drafts"
    ADD CONSTRAINT "commercial_quotation_drafts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."commercial_quotation_drafts"
    ADD CONSTRAINT "commercial_quotation_drafts_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."commercial_quotation_drafts"
    ADD CONSTRAINT "commercial_quotation_drafts_updated_by_profile_id_fkey" FOREIGN KEY ("updated_by_profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."cpc_ai_drafts"
    ADD CONSTRAINT "cpc_ai_drafts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."cpc_audit_log"
    ADD CONSTRAINT "cpc_audit_log_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."cpc_customer_potential_assessments"
    ADD CONSTRAINT "cpc_customer_potential_assessments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."cpc_customer_references"
    ADD CONSTRAINT "cpc_customer_references_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."cpc_customer_workspaces"
    ADD CONSTRAINT "cpc_customer_workspaces_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."cpc_external_profile_mappings"
    ADD CONSTRAINT "cpc_external_profile_mappings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."cpc_project_events"
    ADD CONSTRAINT "cpc_project_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."cpc_project_members"
    ADD CONSTRAINT "cpc_project_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."cpc_projects"
    ADD CONSTRAINT "cpc_projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."cpc_reports"
    ADD CONSTRAINT "cpc_reports_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."cpc_work_items"
    ADD CONSTRAINT "cpc_work_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."cpc_ai_drafts"
    ADD CONSTRAINT "fk_cpc_ai_draft_accepted_by_org" FOREIGN KEY ("accepted_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_ai_drafts"
    ADD CONSTRAINT "fk_cpc_ai_draft_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_ai_drafts"
    ADD CONSTRAINT "fk_cpc_ai_draft_customer_org" FOREIGN KEY ("customer_reference_id", "org_id") REFERENCES "public"."cpc_customer_references"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_ai_drafts"
    ADD CONSTRAINT "fk_cpc_ai_draft_project_org" FOREIGN KEY ("project_id", "org_id") REFERENCES "public"."cpc_projects"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_ai_drafts"
    ADD CONSTRAINT "fk_cpc_ai_draft_rejected_by_org" FOREIGN KEY ("rejected_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_audit_log"
    ADD CONSTRAINT "fk_cpc_audit_actor_org" FOREIGN KEY ("actor_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_customer_references"
    ADD CONSTRAINT "fk_cpc_customer_reference_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_customer_references"
    ADD CONSTRAINT "fk_cpc_customer_reference_mapped_org" FOREIGN KEY ("mapped_canonical_reference_id", "org_id") REFERENCES "public"."cpc_customer_references"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_external_profile_mappings"
    ADD CONSTRAINT "fk_cpc_external_profile_mapping_actor_org" FOREIGN KEY ("mapped_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_external_profile_mappings"
    ADD CONSTRAINT "fk_cpc_external_profile_mapping_profile_org" FOREIGN KEY ("profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_projects"
    ADD CONSTRAINT "fk_cpc_project_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_projects"
    ADD CONSTRAINT "fk_cpc_project_customer_org" FOREIGN KEY ("customer_reference_id", "org_id") REFERENCES "public"."cpc_customer_references"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_project_events"
    ADD CONSTRAINT "fk_cpc_project_event_actor_org" FOREIGN KEY ("actor_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_project_events"
    ADD CONSTRAINT "fk_cpc_project_event_correction_org" FOREIGN KEY ("correction_of_event_id", "org_id") REFERENCES "public"."cpc_project_events"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_project_events"
    ADD CONSTRAINT "fk_cpc_project_event_customer_org" FOREIGN KEY ("customer_reference_id", "org_id") REFERENCES "public"."cpc_customer_references"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_project_events"
    ADD CONSTRAINT "fk_cpc_project_event_project_org" FOREIGN KEY ("project_id", "org_id") REFERENCES "public"."cpc_projects"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_project_members"
    ADD CONSTRAINT "fk_cpc_project_member_added_by_org" FOREIGN KEY ("added_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_project_members"
    ADD CONSTRAINT "fk_cpc_project_member_profile_org" FOREIGN KEY ("profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_project_members"
    ADD CONSTRAINT "fk_cpc_project_member_project_org" FOREIGN KEY ("project_id", "org_id") REFERENCES "public"."cpc_projects"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_project_members"
    ADD CONSTRAINT "fk_cpc_project_member_removed_by_org" FOREIGN KEY ("removed_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_projects"
    ADD CONSTRAINT "fk_cpc_project_owner_org" FOREIGN KEY ("owner_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_customer_potential_assessments"
    ADD CONSTRAINT "fk_cpc_rating_assessor_org" FOREIGN KEY ("assessor_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_customer_potential_assessments"
    ADD CONSTRAINT "fk_cpc_rating_customer_org" FOREIGN KEY ("customer_reference_id", "org_id") REFERENCES "public"."cpc_customer_references"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_customer_potential_assessments"
    ADD CONSTRAINT "fk_cpc_rating_reviewer_org" FOREIGN KEY ("reviewer_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_reports"
    ADD CONSTRAINT "fk_cpc_report_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_reports"
    ADD CONSTRAINT "fk_cpc_report_subject_org" FOREIGN KEY ("subject_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_reports"
    ADD CONSTRAINT "fk_cpc_report_submitted_by_org" FOREIGN KEY ("submitted_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_reports"
    ADD CONSTRAINT "fk_cpc_report_supersedes_org" FOREIGN KEY ("supersedes_report_id", "org_id") REFERENCES "public"."cpc_reports"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_work_items"
    ADD CONSTRAINT "fk_cpc_work_item_assignee_org" FOREIGN KEY ("assignee_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_work_items"
    ADD CONSTRAINT "fk_cpc_work_item_cancelled_by_org" FOREIGN KEY ("cancelled_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_work_items"
    ADD CONSTRAINT "fk_cpc_work_item_completed_by_org" FOREIGN KEY ("completed_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_work_items"
    ADD CONSTRAINT "fk_cpc_work_item_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_work_items"
    ADD CONSTRAINT "fk_cpc_work_item_customer_org" FOREIGN KEY ("customer_reference_id", "org_id") REFERENCES "public"."cpc_customer_references"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_work_items"
    ADD CONSTRAINT "fk_cpc_work_item_project_org" FOREIGN KEY ("project_id", "org_id") REFERENCES "public"."cpc_projects"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_customer_workspaces"
    ADD CONSTRAINT "fk_cpc_workspaces_note_actor_org" FOREIGN KEY ("note_updated_by", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_customer_workspaces"
    ADD CONSTRAINT "fk_cpc_workspaces_plan_actor_org" FOREIGN KEY ("plan_updated_by", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."cpc_customer_workspaces"
    ADD CONSTRAINT "fk_cpc_workspaces_reference_org" FOREIGN KEY ("customer_reference_id", "org_id") REFERENCES "public"."cpc_customer_references"("id", "org_id");



ALTER TABLE ONLY "public"."glh_activity_events"
    ADD CONSTRAINT "fk_glh_activity_events_actor_org" FOREIGN KEY ("actor_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_activity_events"
    ADD CONSTRAINT "fk_glh_activity_events_lead_org" FOREIGN KEY ("lead_id", "org_id") REFERENCES "public"."glh_leads"("id", "org_id");



ALTER TABLE ONLY "public"."glh_ad_campaigns"
    ADD CONSTRAINT "fk_glh_ad_campaigns_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_ad_creatives"
    ADD CONSTRAINT "fk_glh_ad_creatives_campaign_org" FOREIGN KEY ("campaign_id", "org_id") REFERENCES "public"."glh_ad_campaigns"("id", "org_id");



ALTER TABLE ONLY "public"."glh_ad_creatives"
    ADD CONSTRAINT "fk_glh_ad_creatives_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_ai_actions"
    ADD CONSTRAINT "fk_glh_ai_actions_conversation_org" FOREIGN KEY ("conversation_id", "org_id") REFERENCES "public"."glh_conversations"("id", "org_id");



ALTER TABLE ONLY "public"."glh_ai_actions"
    ADD CONSTRAINT "fk_glh_ai_actions_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_ai_actions"
    ADD CONSTRAINT "fk_glh_ai_actions_lead_org" FOREIGN KEY ("lead_id", "org_id") REFERENCES "public"."glh_leads"("id", "org_id");



ALTER TABLE ONLY "public"."glh_ai_actions"
    ADD CONSTRAINT "fk_glh_ai_actions_message_org" FOREIGN KEY ("trigger_message_id", "org_id") REFERENCES "public"."glh_messages"("id", "org_id");



ALTER TABLE ONLY "public"."glh_assignments"
    ADD CONSTRAINT "fk_glh_assignments_assignee_org" FOREIGN KEY ("assignee_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_assignments"
    ADD CONSTRAINT "fk_glh_assignments_assigner_org" FOREIGN KEY ("assigned_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_assignments"
    ADD CONSTRAINT "fk_glh_assignments_lead_org" FOREIGN KEY ("lead_id", "org_id") REFERENCES "public"."glh_leads"("id", "org_id");



ALTER TABLE ONLY "public"."glh_audit_events"
    ADD CONSTRAINT "fk_glh_audit_events_actor_org" FOREIGN KEY ("actor_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_audit_events"
    ADD CONSTRAINT "fk_glh_audit_events_lead_org" FOREIGN KEY ("lead_id", "org_id") REFERENCES "public"."glh_leads"("id", "org_id");



ALTER TABLE ONLY "public"."glh_automation_runs"
    ADD CONSTRAINT "fk_glh_automation_runs_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_automation_runs"
    ADD CONSTRAINT "fk_glh_automation_runs_lead_org" FOREIGN KEY ("lead_id", "org_id") REFERENCES "public"."glh_leads"("id", "org_id");



ALTER TABLE ONLY "public"."glh_channel_accounts"
    ADD CONSTRAINT "fk_glh_channel_accounts_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_contacts"
    ADD CONSTRAINT "fk_glh_contacts_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_conversations"
    ADD CONSTRAINT "fk_glh_conversations_assignee_org" FOREIGN KEY ("assigned_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_conversations"
    ADD CONSTRAINT "fk_glh_conversations_channel_org" FOREIGN KEY ("channel_account_id", "org_id") REFERENCES "public"."glh_channel_accounts"("id", "org_id");



ALTER TABLE ONLY "public"."glh_conversations"
    ADD CONSTRAINT "fk_glh_conversations_contact_org" FOREIGN KEY ("contact_id", "org_id") REFERENCES "public"."glh_contacts"("id", "org_id");



ALTER TABLE ONLY "public"."glh_conversations"
    ADD CONSTRAINT "fk_glh_conversations_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_conversations"
    ADD CONSTRAINT "fk_glh_conversations_lead_org" FOREIGN KEY ("lead_id", "org_id") REFERENCES "public"."glh_leads"("id", "org_id");



ALTER TABLE ONLY "public"."glh_followups"
    ADD CONSTRAINT "fk_glh_followups_assignee_org" FOREIGN KEY ("assigned_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_followups"
    ADD CONSTRAINT "fk_glh_followups_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_followups"
    ADD CONSTRAINT "fk_glh_followups_lead_org" FOREIGN KEY ("lead_id", "org_id") REFERENCES "public"."glh_leads"("id", "org_id");



ALTER TABLE ONLY "public"."glh_lead_profiles"
    ADD CONSTRAINT "fk_glh_lead_profiles_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_lead_profiles"
    ADD CONSTRAINT "fk_glh_lead_profiles_lead_org" FOREIGN KEY ("lead_id", "org_id") REFERENCES "public"."glh_leads"("id", "org_id");



ALTER TABLE ONLY "public"."glh_lead_scores"
    ADD CONSTRAINT "fk_glh_lead_scores_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_lead_scores"
    ADD CONSTRAINT "fk_glh_lead_scores_lead_org" FOREIGN KEY ("lead_id", "org_id") REFERENCES "public"."glh_leads"("id", "org_id");



ALTER TABLE ONLY "public"."glh_leads"
    ADD CONSTRAINT "fk_glh_leads_campaign_org" FOREIGN KEY ("campaign_id", "org_id") REFERENCES "public"."glh_ad_campaigns"("id", "org_id");



ALTER TABLE ONLY "public"."glh_leads"
    ADD CONSTRAINT "fk_glh_leads_contact_org" FOREIGN KEY ("contact_id", "org_id") REFERENCES "public"."glh_contacts"("id", "org_id");



ALTER TABLE ONLY "public"."glh_leads"
    ADD CONSTRAINT "fk_glh_leads_creative_org" FOREIGN KEY ("creative_id", "org_id") REFERENCES "public"."glh_ad_creatives"("id", "org_id");



ALTER TABLE ONLY "public"."glh_leads"
    ADD CONSTRAINT "fk_glh_leads_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_leads"
    ADD CONSTRAINT "fk_glh_leads_owner_org" FOREIGN KEY ("owner_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_manual_intake_requests"
    ADD CONSTRAINT "fk_glh_manual_intake_actor_org" FOREIGN KEY ("actor_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_manual_intake_requests"
    ADD CONSTRAINT "fk_glh_manual_intake_contact_org" FOREIGN KEY ("contact_id", "org_id") REFERENCES "public"."glh_contacts"("id", "org_id");



ALTER TABLE ONLY "public"."glh_manual_intake_requests"
    ADD CONSTRAINT "fk_glh_manual_intake_lead_org" FOREIGN KEY ("lead_id", "org_id") REFERENCES "public"."glh_leads"("id", "org_id");



ALTER TABLE ONLY "public"."glh_manual_work_updates"
    ADD CONSTRAINT "fk_glh_manual_work_actor_org" FOREIGN KEY ("actor_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_manual_work_updates"
    ADD CONSTRAINT "fk_glh_manual_work_lead_org" FOREIGN KEY ("lead_id", "org_id") REFERENCES "public"."glh_leads"("id", "org_id");



ALTER TABLE ONLY "public"."glh_messages"
    ADD CONSTRAINT "fk_glh_messages_actor_org" FOREIGN KEY ("actor_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_messages"
    ADD CONSTRAINT "fk_glh_messages_contact_org" FOREIGN KEY ("contact_id", "org_id") REFERENCES "public"."glh_contacts"("id", "org_id");



ALTER TABLE ONLY "public"."glh_messages"
    ADD CONSTRAINT "fk_glh_messages_conversation_org" FOREIGN KEY ("conversation_id", "org_id") REFERENCES "public"."glh_conversations"("id", "org_id");



ALTER TABLE ONLY "public"."glh_messages"
    ADD CONSTRAINT "fk_glh_messages_lead_org" FOREIGN KEY ("lead_id", "org_id") REFERENCES "public"."glh_leads"("id", "org_id");



ALTER TABLE ONLY "public"."glh_role_bindings"
    ADD CONSTRAINT "fk_glh_role_bindings_grantor_org" FOREIGN KEY ("granted_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_role_bindings"
    ADD CONSTRAINT "fk_glh_role_bindings_profile_org" FOREIGN KEY ("profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_role_bindings"
    ADD CONSTRAINT "fk_glh_role_bindings_revoker_org" FOREIGN KEY ("revoked_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_tasks"
    ADD CONSTRAINT "fk_glh_tasks_assignee_org" FOREIGN KEY ("assignee_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_tasks"
    ADD CONSTRAINT "fk_glh_tasks_creator_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_tasks"
    ADD CONSTRAINT "fk_glh_tasks_lead_org" FOREIGN KEY ("lead_id", "org_id") REFERENCES "public"."glh_leads"("id", "org_id");



ALTER TABLE ONLY "public"."glh_webhook_events"
    ADD CONSTRAINT "fk_glh_webhook_channel_org" FOREIGN KEY ("channel_account_id", "org_id") REFERENCES "public"."glh_channel_accounts"("id", "org_id");



ALTER TABLE ONLY "public"."review_actions"
    ADD CONSTRAINT "fk_review_actions_case_org" FOREIGN KEY ("review_id", "org_id") REFERENCES "public"."review_cases"("id", "org_id");



ALTER TABLE ONLY "public"."review_actions"
    ADD CONSTRAINT "fk_review_actions_created_by_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."review_actions"
    ADD CONSTRAINT "fk_review_actions_owner_org" FOREIGN KEY ("owner_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."review_actions"
    ADD CONSTRAINT "fk_review_actions_verified_by_org" FOREIGN KEY ("verified_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."review_audit_logs"
    ADD CONSTRAINT "fk_review_audit_actor_org" FOREIGN KEY ("actor_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."review_audit_logs"
    ADD CONSTRAINT "fk_review_audit_case_org" FOREIGN KEY ("review_id", "org_id") REFERENCES "public"."review_cases"("id", "org_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."review_case_audit_logs"
    ADD CONSTRAINT "fk_review_case_audit_logs_actor_org" FOREIGN KEY ("actor_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."review_case_audit_logs"
    ADD CONSTRAINT "fk_review_case_audit_logs_case_org" FOREIGN KEY ("case_id", "org_id") REFERENCES "public"."review_knowledge_cases"("id", "org_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."review_case_number_counters"
    ADD CONSTRAINT "fk_review_case_number_counters_org" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."review_cases"
    ADD CONSTRAINT "fk_review_cases_closed_by_org" FOREIGN KEY ("closed_by", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."review_cases"
    ADD CONSTRAINT "fk_review_cases_created_by_org" FOREIGN KEY ("created_by", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."review_cases"
    ADD CONSTRAINT "fk_review_cases_owner_org" FOREIGN KEY ("owner_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."review_cases"
    ADD CONSTRAINT "fk_review_cases_pmo_org" FOREIGN KEY ("pmo_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."review_cases"
    ADD CONSTRAINT "fk_review_cases_submitted_by_org" FOREIGN KEY ("submitted_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."review_dict_items"
    ADD CONSTRAINT "fk_review_dict_created_by_org" FOREIGN KEY ("created_by", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."review_knowledge_case_metadata"
    ADD CONSTRAINT "fk_review_knowledge_case_metadata_case_org" FOREIGN KEY ("case_id", "org_id") REFERENCES "public"."review_knowledge_cases"("id", "org_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."review_knowledge_case_metadata_items"
    ADD CONSTRAINT "fk_review_knowledge_case_metadata_items_header" FOREIGN KEY ("case_id", "org_id") REFERENCES "public"."review_knowledge_case_metadata"("case_id", "org_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."review_knowledge_cases"
    ADD CONSTRAINT "fk_review_knowledge_cases_created_by_org" FOREIGN KEY ("created_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."review_knowledge_cases"
    ADD CONSTRAINT "fk_review_knowledge_cases_hidden_by_org" FOREIGN KEY ("hidden_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."review_knowledge_cases"
    ADD CONSTRAINT "fk_review_knowledge_cases_org" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."review_knowledge_cases"
    ADD CONSTRAINT "fk_review_knowledge_cases_published_by_org" FOREIGN KEY ("published_by_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."review_knowledge_cases"
    ADD CONSTRAINT "fk_review_knowledge_cases_source_org" FOREIGN KEY ("source_review_id", "org_id") REFERENCES "public"."review_cases"("id", "org_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."review_members"
    ADD CONSTRAINT "fk_review_members_case_org" FOREIGN KEY ("review_id", "org_id") REFERENCES "public"."review_cases"("id", "org_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_members"
    ADD CONSTRAINT "fk_review_members_created_by_org" FOREIGN KEY ("created_by", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."review_members"
    ADD CONSTRAINT "fk_review_members_profile_org" FOREIGN KEY ("profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."review_metadata"
    ADD CONSTRAINT "fk_review_metadata_case_org" FOREIGN KEY ("review_id", "org_id") REFERENCES "public"."review_cases"("id", "org_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."review_metadata_items"
    ADD CONSTRAINT "fk_review_metadata_items_case_org" FOREIGN KEY ("review_id", "org_id") REFERENCES "public"."review_cases"("id", "org_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."review_metadata_items"
    ADD CONSTRAINT "fk_review_metadata_items_dict_item" FOREIGN KEY ("dict_item_id", "metadata_type") REFERENCES "public"."review_dict_items"("id", "dict_type");



ALTER TABLE ONLY "public"."review_timeline_events"
    ADD CONSTRAINT "fk_review_timeline_actor_org" FOREIGN KEY ("actor_profile_id", "org_id") REFERENCES "public"."profiles"("id", "org_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."review_timeline_events"
    ADD CONSTRAINT "fk_review_timeline_case_org" FOREIGN KEY ("review_id", "org_id") REFERENCES "public"."review_cases"("id", "org_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."review_type_details"
    ADD CONSTRAINT "fk_review_type_details_case" FOREIGN KEY ("review_id", "org_id", "review_type") REFERENCES "public"."review_cases"("id", "org_id", "review_type");



ALTER TABLE ONLY "public"."review_type_details"
    ADD CONSTRAINT "fk_review_type_details_created_by_org" FOREIGN KEY ("created_by", "org_id") REFERENCES "public"."profiles"("id", "org_id");



ALTER TABLE ONLY "public"."glh_activity_events"
    ADD CONSTRAINT "glh_activity_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_ad_campaigns"
    ADD CONSTRAINT "glh_ad_campaigns_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_ad_creatives"
    ADD CONSTRAINT "glh_ad_creatives_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_ai_actions"
    ADD CONSTRAINT "glh_ai_actions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_assignments"
    ADD CONSTRAINT "glh_assignments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_audit_events"
    ADD CONSTRAINT "glh_audit_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_automation_runs"
    ADD CONSTRAINT "glh_automation_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_channel_accounts"
    ADD CONSTRAINT "glh_channel_accounts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_contacts"
    ADD CONSTRAINT "glh_contacts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_conversations"
    ADD CONSTRAINT "glh_conversations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_followups"
    ADD CONSTRAINT "glh_followups_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_lead_profiles"
    ADD CONSTRAINT "glh_lead_profiles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_lead_scores"
    ADD CONSTRAINT "glh_lead_scores_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_leads"
    ADD CONSTRAINT "glh_leads_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_manual_intake_requests"
    ADD CONSTRAINT "glh_manual_intake_requests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_manual_work_updates"
    ADD CONSTRAINT "glh_manual_work_updates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_messages"
    ADD CONSTRAINT "glh_messages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_role_bindings"
    ADD CONSTRAINT "glh_role_bindings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_tasks"
    ADD CONSTRAINT "glh_tasks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."glh_webhook_events"
    ADD CONSTRAINT "glh_webhook_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."knowledge_cards"
    ADD CONSTRAINT "knowledge_cards_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."lead_interactions"
    ADD CONSTRAINT "lead_interactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."lead_interactions"
    ADD CONSTRAINT "lead_interactions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_interactions"
    ADD CONSTRAINT "lead_interactions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_source_account_id_fkey" FOREIGN KEY ("source_account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_source_post_id_fkey" FOREIGN KEY ("source_post_id") REFERENCES "public"."posts"("id");



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."post_metrics"
    ADD CONSTRAINT "post_metrics_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."post_metrics"
    ADD CONSTRAINT "post_metrics_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_cases"
    ADD CONSTRAINT "review_cases_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."review_dict_items"
    ADD CONSTRAINT "review_dict_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."review_members"
    ADD CONSTRAINT "review_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scripts"
    ADD CONSTRAINT "scripts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."scripts"
    ADD CONSTRAINT "scripts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."scripts"
    ADD CONSTRAINT "scripts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."scripts"
    ADD CONSTRAINT "scripts_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."viral_teardowns"
    ADD CONSTRAINT "viral_teardowns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."viral_teardowns"
    ADD CONSTRAINT "viral_teardowns_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."viral_teardowns"
    ADD CONSTRAINT "viral_teardowns_suitable_account_id_fkey" FOREIGN KEY ("suitable_account_id") REFERENCES "public"."accounts"("id");



CREATE POLICY "Admins can manage all profiles" ON "public"."profiles" USING ("public"."auth_has_role"('admin'::"text"));



CREATE POLICY "Managers can read org profiles" ON "public"."profiles" FOR SELECT USING (("public"."auth_has_role"('manager'::"text") AND (("org_id")::"text" = "public"."auth_org_id"())));



CREATE POLICY "Read own leads: sales" ON "public"."leads" FOR SELECT USING (("public"."auth_has_role"('sales'::"text") AND ("assigned_to" = "public"."auth_profile_id"())));



CREATE POLICY "Update own assigned leads: sales" ON "public"."leads" FOR UPDATE USING (("public"."auth_has_role"('sales'::"text") AND ("assigned_to" = "public"."auth_profile_id"())));



CREATE POLICY "Update topics: admin/manager/operator" ON "public"."topics" FOR UPDATE USING (("public"."auth_has_role"('admin'::"text") OR "public"."auth_has_role"('manager'::"text") OR ("public"."auth_has_role"('operator'::"text") AND ("created_by" = "public"."auth_profile_id"()))));



CREATE POLICY "Users can read own profile" ON "public"."profiles" FOR SELECT USING (("public"."auth_user_id"() = "user_id"));



ALTER TABLE "public"."account_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anon_insert" ON "public"."site_data" FOR INSERT WITH CHECK (true);



CREATE POLICY "anon_select" ON "public"."site_data" FOR SELECT USING (true);



CREATE POLICY "anon_update" ON "public"."site_data" FOR UPDATE USING (true);



ALTER TABLE "public"."commercial_confirmed_quote_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_confirmed_quotes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "commercial_draft_revisions_read" ON "public"."commercial_quotation_draft_revisions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."org_id" = "commercial_quotation_draft_revisions"."org_id") AND "p"."is_active" AND (("p"."id" = "commercial_quotation_draft_revisions"."owner_profile_id") OR ("p"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"])))))));



ALTER TABLE "public"."commercial_payment_methods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "commercial_payment_methods_admin_insert" ON "public"."commercial_payment_methods" FOR INSERT TO "authenticated" WITH CHECK (((NOT "approved") AND ("approved_by" IS NULL) AND ("approved_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "commercial_payment_methods"."imported_by") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."org_id" = "commercial_payment_methods"."org_id") AND "p"."is_active" AND ("p"."role" = 'admin'::"text"))))));



CREATE POLICY "commercial_payment_methods_admin_update" ON "public"."commercial_payment_methods" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."org_id" = "commercial_payment_methods"."org_id") AND "p"."is_active" AND ("p"."role" = 'admin'::"text"))))) WITH CHECK (((NOT "approved") AND ("approved_by" IS NULL) AND ("approved_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "commercial_payment_methods"."imported_by") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."org_id" = "commercial_payment_methods"."org_id") AND "p"."is_active" AND ("p"."role" = 'admin'::"text"))))));



CREATE POLICY "commercial_payment_methods_read" ON "public"."commercial_payment_methods" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."org_id" = "commercial_payment_methods"."org_id") AND "p"."is_active" AND (("p"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"])) OR ("commercial_payment_methods"."approved" AND ("p"."role" = ANY (ARRAY['sales'::"text", 'operator'::"text"]))))))));



ALTER TABLE "public"."commercial_quotation_draft_revisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_quotation_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cpc_ai_drafts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cpc_ai_drafts_select" ON "public"."cpc_ai_drafts" FOR SELECT USING ("public"."cpc_can_read_ai_draft"("id", "org_id"));



ALTER TABLE "public"."cpc_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cpc_audit_log_select_management" ON "public"."cpc_audit_log" FOR SELECT USING (((("org_id")::"text" = "public"."auth_org_id"()) AND ("public"."auth_has_role"('admin'::"text") OR "public"."auth_has_role"('manager'::"text"))));



ALTER TABLE "public"."cpc_customer_potential_assessments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cpc_customer_references" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cpc_customer_references_select" ON "public"."cpc_customer_references" FOR SELECT USING ("public"."cpc_can_read_customer_reference"("id", "org_id"));



CREATE POLICY "cpc_customer_workspace_select_authorized" ON "public"."cpc_customer_workspaces" FOR SELECT TO "authenticated" USING ("public"."cpc_can_read_customer_reference"("customer_reference_id", "org_id"));



ALTER TABLE "public"."cpc_customer_workspaces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cpc_external_profile_mappings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cpc_external_profile_mappings_select_management" ON "public"."cpc_external_profile_mappings" FOR SELECT USING (((("org_id")::"text" = "public"."auth_org_id"()) AND ("public"."auth_has_role"('admin'::"text") OR "public"."auth_has_role"('manager'::"text"))));



CREATE POLICY "cpc_potential_rating_select_authorized" ON "public"."cpc_customer_potential_assessments" FOR SELECT TO "authenticated" USING ("public"."cpc_can_read_customer_reference"("customer_reference_id", "org_id"));



ALTER TABLE "public"."cpc_project_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cpc_project_events_select" ON "public"."cpc_project_events" FOR SELECT USING (((("org_id")::"text" = "public"."auth_org_id"()) AND ("public"."auth_has_role"('admin'::"text") OR "public"."auth_has_role"('manager'::"text") OR (("project_id" IS NOT NULL) AND "public"."cpc_can_read_project"("project_id", "org_id")) OR (("project_id" IS NULL) AND ("customer_reference_id" IS NOT NULL) AND "public"."cpc_can_read_customer_reference"("customer_reference_id", "org_id")))));



ALTER TABLE "public"."cpc_project_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cpc_project_members_select" ON "public"."cpc_project_members" FOR SELECT USING ("public"."cpc_can_read_project"("project_id", "org_id"));



ALTER TABLE "public"."cpc_projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cpc_projects_select" ON "public"."cpc_projects" FOR SELECT USING ((("archived_at" IS NULL) AND "public"."cpc_can_read_project"("id", "org_id")));



ALTER TABLE "public"."cpc_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cpc_reports_select" ON "public"."cpc_reports" FOR SELECT USING ("public"."cpc_can_read_report"("id", "org_id"));



ALTER TABLE "public"."cpc_work_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cpc_work_items_select" ON "public"."cpc_work_items" FOR SELECT USING ("public"."cpc_can_read_work_item"("id", "org_id"));



ALTER TABLE "public"."glh_activity_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_activity_events_select" ON "public"."glh_activity_events" FOR SELECT TO "authenticated" USING ("public"."glh_can_access_lead"("lead_id"));



ALTER TABLE "public"."glh_ad_campaigns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_ad_campaigns_select" ON "public"."glh_ad_campaigns" FOR SELECT TO "authenticated" USING ("public"."glh_can_manage_org"("org_id"));



ALTER TABLE "public"."glh_ad_creatives" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_ad_creatives_select" ON "public"."glh_ad_creatives" FOR SELECT TO "authenticated" USING ("public"."glh_can_manage_org"("org_id"));



ALTER TABLE "public"."glh_ai_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_ai_actions_select" ON "public"."glh_ai_actions" FOR SELECT TO "authenticated" USING ("public"."glh_can_access_lead"("lead_id"));



ALTER TABLE "public"."glh_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_assignments_select" ON "public"."glh_assignments" FOR SELECT TO "authenticated" USING ("public"."glh_can_access_lead"("lead_id"));



ALTER TABLE "public"."glh_audit_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_audit_events_select" ON "public"."glh_audit_events" FOR SELECT TO "authenticated" USING ("public"."glh_can_manage_org"("org_id"));



ALTER TABLE "public"."glh_automation_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_automation_runs_select" ON "public"."glh_automation_runs" FOR SELECT TO "authenticated" USING (("public"."glh_can_manage_org"("org_id") OR (("lead_id" IS NOT NULL) AND "public"."glh_can_access_lead"("lead_id"))));



ALTER TABLE "public"."glh_channel_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_channel_accounts_select" ON "public"."glh_channel_accounts" FOR SELECT TO "authenticated" USING ("public"."glh_can_manage_org"("org_id"));



ALTER TABLE "public"."glh_contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_contacts_select" ON "public"."glh_contacts" FOR SELECT TO "authenticated" USING ("public"."glh_can_access_contact"("id"));



ALTER TABLE "public"."glh_conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_conversations_select" ON "public"."glh_conversations" FOR SELECT TO "authenticated" USING ("public"."glh_can_access_lead"("lead_id"));



ALTER TABLE "public"."glh_followups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_followups_select" ON "public"."glh_followups" FOR SELECT TO "authenticated" USING (("public"."glh_can_manage_org"("org_id") OR (("assigned_profile_id" = "public"."glh_current_profile_id"()) AND "public"."glh_can_access_lead"("lead_id"))));



ALTER TABLE "public"."glh_lead_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_lead_profiles_select" ON "public"."glh_lead_profiles" FOR SELECT TO "authenticated" USING ("public"."glh_can_access_lead"("lead_id"));



ALTER TABLE "public"."glh_lead_scores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_lead_scores_select" ON "public"."glh_lead_scores" FOR SELECT TO "authenticated" USING ("public"."glh_can_access_lead"("lead_id"));



ALTER TABLE "public"."glh_leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_leads_select" ON "public"."glh_leads" FOR SELECT TO "authenticated" USING ("public"."glh_can_access_lead"("id"));



ALTER TABLE "public"."glh_manual_intake_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."glh_manual_work_updates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_manual_work_updates_read" ON "public"."glh_manual_work_updates" FOR SELECT TO "authenticated" USING ("public"."glh_can_access_lead"("lead_id"));



ALTER TABLE "public"."glh_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_messages_select" ON "public"."glh_messages" FOR SELECT TO "authenticated" USING ("public"."glh_can_access_conversation"("conversation_id"));



ALTER TABLE "public"."glh_role_bindings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_role_bindings_select" ON "public"."glh_role_bindings" FOR SELECT TO "authenticated" USING ("public"."glh_can_manage_org"("org_id"));



ALTER TABLE "public"."glh_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_tasks_select" ON "public"."glh_tasks" FOR SELECT TO "authenticated" USING (("public"."glh_can_manage_org"("org_id") OR (("assignee_profile_id" = "public"."glh_current_profile_id"()) AND "public"."glh_can_access_lead"("lead_id"))));



ALTER TABLE "public"."glh_webhook_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "glh_webhook_events_select" ON "public"."glh_webhook_events" FOR SELECT TO "authenticated" USING ("public"."glh_can_manage_org"("org_id"));



ALTER TABLE "public"."knowledge_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_interactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_isolation" ON "public"."accounts" USING (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_select_own" ON "public"."organizations" FOR SELECT TO "authenticated" USING ((("id")::"text" = "public"."auth_org_id"()));



CREATE POLICY "organizations_update_admin_own" ON "public"."organizations" FOR UPDATE TO "authenticated" USING (("public"."auth_has_role"('admin'::"text") AND (("id")::"text" = "public"."auth_org_id"()))) WITH CHECK (("public"."auth_has_role"('admin'::"text") AND (("id")::"text" = "public"."auth_org_id"())));



ALTER TABLE "public"."post_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quotation_drafts_insert" ON "public"."commercial_quotation_drafts" FOR INSERT TO "authenticated" WITH CHECK ((("status" = 'active'::"text") AND ("revision" = 1) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "p"."is_active" AND ("p"."id" = "commercial_quotation_drafts"."owner_profile_id") AND ("p"."id" = "commercial_quotation_drafts"."updated_by_profile_id") AND ("p"."org_id" = "commercial_quotation_drafts"."org_id") AND ("p"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'operator'::"text", 'sales'::"text"])))))));



CREATE POLICY "quotation_drafts_select" ON "public"."commercial_quotation_drafts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "p"."is_active" AND ("p"."org_id" = "commercial_quotation_drafts"."org_id") AND (("p"."id" = "commercial_quotation_drafts"."owner_profile_id") OR ("p"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"])))))));



CREATE POLICY "quotation_drafts_update" ON "public"."commercial_quotation_drafts" FOR UPDATE TO "authenticated" USING ((("status" = 'active'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "p"."is_active" AND ("p"."org_id" = "commercial_quotation_drafts"."org_id") AND ("p"."id" = "commercial_quotation_drafts"."owner_profile_id") AND ("p"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'operator'::"text", 'sales'::"text"]))))))) WITH CHECK ((("status" = ANY (ARRAY['active'::"text", 'deleted'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "p"."is_active" AND ("p"."org_id" = "commercial_quotation_drafts"."org_id") AND ("p"."id" = "commercial_quotation_drafts"."owner_profile_id") AND ("p"."id" = "commercial_quotation_drafts"."updated_by_profile_id") AND ("p"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'operator'::"text", 'sales'::"text"])))))));



CREATE POLICY "quote_read" ON "public"."commercial_confirmed_quotes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."org_id" = "p"."org_id") AND "p"."is_active" AND (("p"."id" = "commercial_confirmed_quotes"."owner_profile_id") OR ("p"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"])))))));



CREATE POLICY "quote_version_read" ON "public"."commercial_confirmed_quote_versions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."commercial_confirmed_quotes" "q"
     JOIN "public"."profiles" "p" ON (("p"."org_id" = "q"."org_id")))
  WHERE (("q"."id" = "commercial_confirmed_quote_versions"."quote_id") AND ("q"."org_id" = "commercial_confirmed_quote_versions"."org_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "p"."is_active" AND (("p"."id" = "q"."owner_profile_id") OR ("p"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"])))))));



ALTER TABLE "public"."review_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_actions_select_org_active" ON "public"."review_actions" FOR SELECT TO "authenticated" USING (((("org_id")::"text" = "public"."auth_org_id"()) AND ("public"."auth_profile_id"() IS NOT NULL)));



ALTER TABLE "public"."review_audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_audit_logs_select_admin_manager" ON "public"."review_audit_logs" FOR SELECT TO "authenticated" USING (((("org_id")::"text" = "public"."auth_org_id"()) AND ("public"."auth_has_role"('admin'::"text") OR "public"."auth_has_role"('manager'::"text"))));



ALTER TABLE "public"."review_case_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_case_number_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_cases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_cases_insert" ON "public"."review_cases" FOR INSERT TO "authenticated" WITH CHECK (((("org_id")::"text" = "public"."auth_org_id"()) AND ("created_by" = "public"."auth_profile_id"()) AND ("status" = 'draft'::"text") AND ("version" = 1) AND ("closed_at" IS NULL) AND ("closed_by" IS NULL) AND ("close_override_reason" IS NULL) AND ("archived_at" IS NULL) AND ("report_generated_at" IS NULL) AND ("public"."auth_has_role"('admin'::"text") OR "public"."auth_has_role"('manager'::"text") OR "public"."auth_has_role"('operator'::"text") OR "public"."auth_has_role"('sales'::"text"))));



CREATE POLICY "review_cases_select_org" ON "public"."review_cases" FOR SELECT TO "authenticated" USING (((("org_id")::"text" = "public"."auth_org_id"()) AND ("public"."auth_has_role"('admin'::"text") OR "public"."auth_has_role"('manager'::"text") OR "public"."auth_has_role"('operator'::"text") OR "public"."auth_has_role"('sales'::"text") OR "public"."auth_has_role"('viewer'::"text"))));



ALTER TABLE "public"."review_dict_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_dict_items_insert_org_admin" ON "public"."review_dict_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."auth_has_role"('admin'::"text") AND (("org_id")::"text" = "public"."auth_org_id"()) AND ("created_by" = "public"."auth_profile_id"()) AND ("is_system" = false)));



CREATE POLICY "review_dict_items_select" ON "public"."review_dict_items" FOR SELECT TO "authenticated" USING ((("public"."auth_profile_id"() IS NOT NULL) AND (("org_id" IS NULL) OR (("org_id")::"text" = "public"."auth_org_id"()))));



ALTER TABLE "public"."review_knowledge_case_metadata" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_knowledge_case_metadata_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_knowledge_cases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_members_select_org" ON "public"."review_members" FOR SELECT TO "authenticated" USING ((("org_id")::"text" = "public"."auth_org_id"()));



ALTER TABLE "public"."review_metadata" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_metadata_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_metadata_items_select_org" ON "public"."review_metadata_items" FOR SELECT TO "authenticated" USING (((("org_id")::"text" = "public"."auth_org_id"()) AND ("public"."auth_profile_id"() IS NOT NULL) AND ("public"."auth_has_role"('admin'::"text") OR "public"."auth_has_role"('manager'::"text") OR "public"."auth_has_role"('operator'::"text") OR "public"."auth_has_role"('sales'::"text") OR "public"."auth_has_role"('viewer'::"text"))));



CREATE POLICY "review_metadata_select_org" ON "public"."review_metadata" FOR SELECT TO "authenticated" USING (((("org_id")::"text" = "public"."auth_org_id"()) AND ("public"."auth_profile_id"() IS NOT NULL) AND ("public"."auth_has_role"('admin'::"text") OR "public"."auth_has_role"('manager'::"text") OR "public"."auth_has_role"('operator'::"text") OR "public"."auth_has_role"('sales'::"text") OR "public"."auth_has_role"('viewer'::"text"))));



ALTER TABLE "public"."review_timeline_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_timeline_events_select_org" ON "public"."review_timeline_events" FOR SELECT TO "authenticated" USING (((("org_id")::"text" = "public"."auth_org_id"()) AND ("public"."auth_profile_id"() IS NOT NULL)));



ALTER TABLE "public"."review_type_details" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_type_details_select_org" ON "public"."review_type_details" FOR SELECT TO "authenticated" USING ((("org_id")::"text" = "public"."auth_org_id"()));



ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scripts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."viral_teardowns" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "commercial_audit"."record_commercial_draft_revision"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "commercial_private"."freeze_confirmed_payment_method"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "commercial_private"."guard_confirmed_quote_header"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "commercial_private"."guard_confirmed_quote_version"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."auth_has_role"("required_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auth_has_role"("required_role" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."auth_org_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auth_org_id"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."auth_profile_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auth_profile_id"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."auth_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_user_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_commercial_quote"("p_request_id" "uuid", "p_quote_id" "uuid", "p_expected_version" integer, "p_draft_id" "uuid", "p_snapshot" "jsonb", "p_amount_thousandths" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_commercial_quote"("p_request_id" "uuid", "p_quote_id" "uuid", "p_expected_version" integer, "p_draft_id" "uuid", "p_snapshot" "jsonb", "p_amount_thousandths" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_accept_ai_draft"("p_ai_draft_id" "uuid", "p_expected_version" integer, "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_accept_ai_draft"("p_ai_draft_id" "uuid", "p_expected_version" integer, "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_build_daily_report_metrics"("p_org_id" "uuid", "p_subject_profile_id" "uuid", "p_business_date" "date") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cpc_can_assess_customer_rating"("p_customer_reference_id" "uuid", "p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_can_assess_customer_rating"("p_customer_reference_id" "uuid", "p_org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_can_follow_customer"("p_customer_reference_id" "uuid", "p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_can_follow_customer"("p_customer_reference_id" "uuid", "p_org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_can_read_ai_draft"("p_ai_draft_id" "uuid", "p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_can_read_ai_draft"("p_ai_draft_id" "uuid", "p_org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_can_read_customer_reference"("p_customer_reference_id" "uuid", "p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_can_read_customer_reference"("p_customer_reference_id" "uuid", "p_org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_can_read_project"("p_project_id" "uuid", "p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_can_read_project"("p_project_id" "uuid", "p_org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_can_read_report"("p_report_id" "uuid", "p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_can_read_report"("p_report_id" "uuid", "p_org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_can_read_work_item"("p_work_item_id" "uuid", "p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_can_read_work_item"("p_work_item_id" "uuid", "p_org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_can_self_rate_customer"("p_customer_reference_id" "uuid", "p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_can_self_rate_customer"("p_customer_reference_id" "uuid", "p_org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_create_ai_work_item_draft"("p_customer_reference_id" "uuid", "p_project_id" "uuid", "p_work_item_type" "text", "p_title" "text", "p_description" "text", "p_due_at" timestamp with time zone, "p_priority" "text", "p_raw_input" "text", "p_expires_at" timestamp with time zone, "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_create_ai_work_item_draft"("p_customer_reference_id" "uuid", "p_project_id" "uuid", "p_work_item_type" "text", "p_title" "text", "p_description" "text", "p_due_at" timestamp with time zone, "p_priority" "text", "p_raw_input" "text", "p_expires_at" timestamp with time zone, "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_create_project"("p_customer_reference_id" "uuid", "p_title" "text", "p_objective_summary" "text", "p_project_type" "text", "p_stage" "text", "p_priority" "text", "p_owner_profile_id" "uuid", "p_initial_next_action_title" "text", "p_initial_next_action_due_at" timestamp with time zone, "p_waiting_on" "text", "p_next_check_at" timestamp with time zone, "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_create_project"("p_customer_reference_id" "uuid", "p_title" "text", "p_objective_summary" "text", "p_project_type" "text", "p_stage" "text", "p_priority" "text", "p_owner_profile_id" "uuid", "p_initial_next_action_title" "text", "p_initial_next_action_due_at" timestamp with time zone, "p_waiting_on" "text", "p_next_check_at" timestamp with time zone, "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_create_provisional_customer_reference"("p_display_name_snapshot" "text", "p_provisional_source_reference" "text", "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_create_provisional_customer_reference"("p_display_name_snapshot" "text", "p_provisional_source_reference" "text", "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_create_report_correction"("p_report_id" "uuid", "p_expected_version" integer, "p_reason" "text", "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_create_report_correction"("p_report_id" "uuid", "p_expected_version" integer, "p_reason" "text", "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_create_work_item"("p_customer_reference_id" "uuid", "p_project_id" "uuid", "p_work_item_type" "text", "p_title" "text", "p_description" "text", "p_due_at" timestamp with time zone, "p_priority" "text", "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_create_work_item"("p_customer_reference_id" "uuid", "p_project_id" "uuid", "p_work_item_type" "text", "p_title" "text", "p_description" "text", "p_due_at" timestamp with time zone, "p_priority" "text", "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_customer_maintenance_owners"("p_customer_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_customer_maintenance_owners"("p_customer_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_customer_self_rating_access"("p_customer_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_customer_self_rating_access"("p_customer_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_enforce_active_project_invariant"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cpc_event_category"("p_event_type" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cpc_event_payload_is_valid"("p_event_type" "text", "p_payload" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cpc_generate_daily_report_draft"("p_business_date" "date", "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_generate_daily_report_draft"("p_business_date" "date", "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_project_owner_names"("p_project_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_project_owner_names"("p_project_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_project_transition_is_valid"("p_from_status" "text", "p_to_status" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cpc_record_customer_follow_up"("p_customer_reference_id" "uuid", "p_event_type" "text", "p_result_summary" "text", "p_occurred_at" timestamp with time zone, "p_current_follow_up_id" "uuid", "p_next_follow_up_title" "text", "p_next_follow_up_due_at" timestamp with time zone, "p_next_follow_up_priority" "text", "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_record_customer_follow_up"("p_customer_reference_id" "uuid", "p_event_type" "text", "p_result_summary" "text", "p_occurred_at" timestamp with time zone, "p_current_follow_up_id" "uuid", "p_next_follow_up_title" "text", "p_next_follow_up_due_at" timestamp with time zone, "p_next_follow_up_priority" "text", "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_record_progress"("p_project_id" "uuid", "p_expected_version" integer, "p_event_type" "text", "p_raw_input" "text", "p_payload" "jsonb", "p_occurred_at" timestamp with time zone, "p_new_stage" "text", "p_next_action_title" "text", "p_next_action_due_at" timestamp with time zone, "p_waiting_on" "text", "p_next_check_at" timestamp with time zone, "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_record_progress"("p_project_id" "uuid", "p_expected_version" integer, "p_event_type" "text", "p_raw_input" "text", "p_payload" "jsonb", "p_occurred_at" timestamp with time zone, "p_new_stage" "text", "p_next_action_title" "text", "p_next_action_due_at" timestamp with time zone, "p_waiting_on" "text", "p_next_check_at" timestamp with time zone, "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_reject_ai_draft"("p_ai_draft_id" "uuid", "p_expected_version" integer, "p_reason" "text", "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_reject_ai_draft"("p_ai_draft_id" "uuid", "p_expected_version" integer, "p_reason" "text", "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_reject_append_only_mutation"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cpc_reschedule_work_item"("p_work_item_id" "uuid", "p_expected_version" integer, "p_to_due_at" timestamp with time zone, "p_reason" "text", "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_reschedule_work_item"("p_work_item_id" "uuid", "p_expected_version" integer, "p_to_due_at" timestamp with time zone, "p_reason" "text", "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_review_customer_potential_rating"("p_customer_reference_id" "uuid", "p_expected_version" integer, "p_decision" "text", "p_review_note" "text", "p_request_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cpc_rpc_error"("p_code" "text", "p_message" "text", "p_data" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cpc_save_customer_development_plan"("p_customer_reference_id" "uuid", "p_opportunity_summary" "text", "p_estimated_annual_opportunity_cny_yuan" bigint, "p_next_action" "text", "p_next_check_on" "date", "p_expected_version" integer, "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_save_customer_development_plan"("p_customer_reference_id" "uuid", "p_opportunity_summary" "text", "p_estimated_annual_opportunity_cny_yuan" bigint, "p_next_action" "text", "p_next_check_on" "date", "p_expected_version" integer, "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_save_customer_note"("p_customer_reference_id" "uuid", "p_note" "text", "p_expected_version" integer, "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_save_customer_note"("p_customer_reference_id" "uuid", "p_note" "text", "p_expected_version" integer, "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_save_customer_potential_rating"("p_customer_reference_id" "uuid", "p_scores" "jsonb", "p_evidence_summary" "text", "p_opportunity_summary" "text", "p_estimated_annual_opportunity_cny_yuan" bigint, "p_next_action" "text", "p_next_check_on" "date", "p_submit" boolean, "p_expected_version" integer, "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_save_customer_potential_rating"("p_customer_reference_id" "uuid", "p_scores" "jsonb", "p_evidence_summary" "text", "p_opportunity_summary" "text", "p_estimated_annual_opportunity_cny_yuan" bigint, "p_next_action" "text", "p_next_check_on" "date", "p_submit" boolean, "p_expected_version" integer, "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_set_waiting_state"("p_project_id" "uuid", "p_expected_version" integer, "p_waiting_on" "text", "p_next_check_at" timestamp with time zone, "p_reason" "text", "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_set_waiting_state"("p_project_id" "uuid", "p_expected_version" integer, "p_waiting_on" "text", "p_next_check_at" timestamp with time zone, "p_reason" "text", "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_stage_is_valid"("p_project_type" "text", "p_stage" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cpc_submit_report"("p_report_id" "uuid", "p_expected_version" integer, "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_submit_report"("p_report_id" "uuid", "p_expected_version" integer, "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_transition_project"("p_project_id" "uuid", "p_expected_version" integer, "p_to_status" "text", "p_reason" "text", "p_pause_next_check_at" timestamp with time zone, "p_reopen_next_action_title" "text", "p_reopen_next_action_due_at" timestamp with time zone, "p_reopen_waiting_on" "text", "p_reopen_next_check_at" timestamp with time zone, "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_transition_project"("p_project_id" "uuid", "p_expected_version" integer, "p_to_status" "text", "p_reason" "text", "p_pause_next_check_at" timestamp with time zone, "p_reopen_next_action_title" "text", "p_reopen_next_action_due_at" timestamp with time zone, "p_reopen_waiting_on" "text", "p_reopen_next_check_at" timestamp with time zone, "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_transition_work_item"("p_work_item_id" "uuid", "p_expected_version" integer, "p_to_status" "text", "p_reason" "text", "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpc_transition_work_item"("p_work_item_id" "uuid", "p_expected_version" integer, "p_to_status" "text", "p_reason" "text", "p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cpc_work_item_transition_is_valid"("p_from_status" "text", "p_to_status" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."glh_assign_lead"("p_lead_id" "uuid", "p_assignee_profile_id" "uuid", "p_expected_version" integer, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."glh_assign_lead"("p_lead_id" "uuid", "p_assignee_profile_id" "uuid", "p_expected_version" integer, "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."glh_can_access_contact"("p_contact_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."glh_can_access_contact"("p_contact_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."glh_can_access_conversation"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."glh_can_access_conversation"("p_conversation_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."glh_can_access_lead"("p_lead_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."glh_can_access_lead"("p_lead_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."glh_can_manage_org"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."glh_can_manage_org"("p_org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."glh_change_manual_lead_stage"("p_lead_id" "uuid", "p_expected_version" integer, "p_stage" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."glh_change_manual_lead_stage"("p_lead_id" "uuid", "p_expected_version" integer, "p_stage" "text", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."glh_create_manual_production_lead"("p_request_key" "uuid", "p_display_name" "text", "p_company_name" "text", "p_country_code" "text", "p_whatsapp" "text", "p_email" "text", "p_requirement_type" "text", "p_owner_profile_id" "uuid", "p_product" "text", "p_material" "text", "p_quantity" "text", "p_notes" "text", "p_source_detail" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."glh_create_manual_production_lead"("p_request_key" "uuid", "p_display_name" "text", "p_company_name" "text", "p_country_code" "text", "p_whatsapp" "text", "p_email" "text", "p_requirement_type" "text", "p_owner_profile_id" "uuid", "p_product" "text", "p_material" "text", "p_quantity" "text", "p_notes" "text", "p_source_detail" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."glh_create_manual_test_lead"("p_manual_creation_guard" "text", "p_display_name" "text", "p_company_name" "text", "p_country_code" "text", "p_whatsapp" "text", "p_email" "text", "p_source_platform" "text", "p_requirement_type" "text", "p_lifecycle_state" "text", "p_conversation_mode" "text", "p_priority_grade" "text", "p_score" integer, "p_completeness" integer, "p_owner_profile_id" "uuid", "p_product" "text", "p_material" "text", "p_quantity" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."glh_create_manual_test_lead"("p_manual_creation_guard" "text", "p_display_name" "text", "p_company_name" "text", "p_country_code" "text", "p_whatsapp" "text", "p_email" "text", "p_source_platform" "text", "p_requirement_type" "text", "p_lifecycle_state" "text", "p_conversation_mode" "text", "p_priority_grade" "text", "p_score" integer, "p_completeness" integer, "p_owner_profile_id" "uuid", "p_product" "text", "p_material" "text", "p_quantity" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."glh_create_task_or_followup"("p_lead_id" "uuid", "p_work_kind" "text", "p_work_type" "text", "p_title" "text", "p_due_at" timestamp with time zone, "p_assignee_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."glh_create_task_or_followup"("p_lead_id" "uuid", "p_work_kind" "text", "p_work_type" "text", "p_title" "text", "p_due_at" timestamp with time zone, "p_assignee_profile_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."glh_current_profile_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."glh_current_profile_id"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."glh_finish_manual_work"("p_work_kind" "text", "p_work_id" "uuid", "p_expected_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."glh_finish_manual_work"("p_work_kind" "text", "p_work_id" "uuid", "p_expected_version" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."glh_ingest_whatsapp_inbound"("p_external_event_id" "text", "p_provider_account_id" "text", "p_external_contact_id" "text", "p_external_conversation_id" "text", "p_contact_display_name" "text", "p_message_type" "text", "p_message_text" "text", "p_media_metadata" "jsonb", "p_provider_timestamp" timestamp with time zone, "p_referral" "jsonb", "p_raw_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."glh_ingest_whatsapp_inbound"("p_external_event_id" "text", "p_provider_account_id" "text", "p_external_contact_id" "text", "p_external_conversation_id" "text", "p_contact_display_name" "text", "p_message_type" "text", "p_message_text" "text", "p_media_metadata" "jsonb", "p_provider_timestamp" timestamp with time zone, "p_referral" "jsonb", "p_raw_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."glh_queue_human_message"("p_conversation_id" "uuid", "p_lead_id" "uuid", "p_expected_mode" "text", "p_message_text" "text", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."glh_queue_human_message"("p_conversation_id" "uuid", "p_lead_id" "uuid", "p_expected_mode" "text", "p_message_text" "text", "p_idempotency_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."glh_take_over_conversation"("p_conversation_id" "uuid", "p_lead_id" "uuid", "p_expected_mode" "text", "p_expected_lead_version" integer, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."glh_take_over_conversation"("p_conversation_id" "uuid", "p_lead_id" "uuid", "p_expected_mode" "text", "p_expected_lead_version" integer, "p_reason" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."organizations_protect_immutable"() TO "anon";
GRANT ALL ON FUNCTION "public"."organizations_protect_immutable"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_action_cancel"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_action_cancel"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_action_create"("p_review_id" "uuid", "p_title" "text", "p_description" "text", "p_action_type" "text", "p_owner_profile_id" "uuid", "p_due_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_action_create"("p_review_id" "uuid", "p_title" "text", "p_description" "text", "p_action_type" "text", "p_owner_profile_id" "uuid", "p_due_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_action_return"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_action_return"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_action_start"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_action_start"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_action_submit_for_verification"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_completion_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_action_submit_for_verification"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_completion_note" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_action_update"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_title" "text", "p_description" "text", "p_action_type" "text", "p_owner_profile_id" "uuid", "p_due_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_action_update"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_title" "text", "p_description" "text", "p_action_type" "text", "p_owner_profile_id" "uuid", "p_due_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_action_verify"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_verification_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_action_verify"("p_review_id" "uuid", "p_action_id" "uuid", "p_expected_version" integer, "p_verification_note" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_add_member"("p_review_id" "uuid", "p_expected_version" integer, "p_profile_id" "uuid", "p_member_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_add_member"("p_review_id" "uuid", "p_expected_version" integer, "p_profile_id" "uuid", "p_member_role" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_case_admin_detail"("p_case_no" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_case_admin_detail"("p_case_no" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_case_allocate_number"("p_org_id" "uuid", "p_year" integer) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."review_case_audit"("p_case_id" "uuid", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_case_audit"("p_case_id" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_case_candidates"("p_limit" integer, "p_offset" integer, "p_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_case_candidates"("p_limit" integer, "p_offset" integer, "p_query" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_case_create_from_review"("p_review_id" "uuid", "p_expected_review_version" integer, "p_title" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_case_create_from_review"("p_review_id" "uuid", "p_expected_review_version" integer, "p_title" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_case_detail"("p_case_no" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_case_detail"("p_case_no" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_case_hide"("p_case_id" "uuid", "p_expected_version" integer, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_case_hide"("p_case_id" "uuid", "p_expected_version" integer, "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_case_library"("p_query" "text", "p_material_codes" "text"[], "p_process_codes" "text"[], "p_problem_domain_codes" "text"[], "p_problem_symptom_codes" "text"[], "p_review_types" "text"[], "p_risk_levels" "text"[], "p_published_from" timestamp with time zone, "p_published_to" timestamp with time zone, "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_case_library"("p_query" "text", "p_material_codes" "text"[], "p_process_codes" "text"[], "p_problem_domain_codes" "text"[], "p_problem_symptom_codes" "text"[], "p_review_types" "text"[], "p_risk_levels" "text"[], "p_published_from" timestamp with time zone, "p_published_to" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_case_publish"("p_case_id" "uuid", "p_expected_version" integer, "p_expected_source_review_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_case_publish"("p_case_id" "uuid", "p_expected_version" integer, "p_expected_source_review_version" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_case_reopen_curation"("p_case_id" "uuid", "p_expected_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_case_reopen_curation"("p_case_id" "uuid", "p_expected_version" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_case_replace_snapshot"("p_case_id" "uuid", "p_org_id" "uuid", "p_review_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."review_case_safe_mutation_dto"("p_case_id" "uuid", "p_org_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."review_case_update_draft"("p_case_id" "uuid", "p_expected_version" integer, "p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_case_update_draft"("p_case_id" "uuid", "p_expected_version" integer, "p_patch" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_case_validate_publish_metadata"("p_review_id" "uuid", "p_org_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."review_close"("p_review_id" "uuid", "p_expected_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_close"("p_review_id" "uuid", "p_expected_version" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_create_audit_trigger"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."review_event_actor_directory"("p_review_id" "uuid", "p_purpose" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_event_actor_directory"("p_review_id" "uuid", "p_purpose" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_event_actor_directory"("p_review_id" "uuid", "p_purpose" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_metadata_submit_missing"("p_review_id" "uuid", "p_org_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."review_participant_directory"("p_review_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_participant_directory"("p_review_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_profile_directory"("p_purpose" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_profile_directory"("p_purpose" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_remove_member"("p_review_id" "uuid", "p_expected_version" integer, "p_member_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_remove_member"("p_review_id" "uuid", "p_expected_version" integer, "p_member_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_reopen"("p_review_id" "uuid", "p_expected_version" integer, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_reopen"("p_review_id" "uuid", "p_expected_version" integer, "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_rpc_error"("p_code" "text", "p_message" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."review_set_draft_assignments"("p_review_id" "uuid", "p_expected_version" integer, "p_owner_profile_id" "uuid", "p_pmo_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_set_draft_assignments"("p_review_id" "uuid", "p_expected_version" integer, "p_owner_profile_id" "uuid", "p_pmo_profile_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_set_primary_member"("p_review_id" "uuid", "p_expected_version" integer, "p_member_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_set_primary_member"("p_review_id" "uuid", "p_expected_version" integer, "p_member_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_submit"("p_review_id" "uuid", "p_expected_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_submit"("p_review_id" "uuid", "p_expected_version" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_type_details_key_allowed"("p_review_type" "text", "p_key" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."review_update_draft_public"("p_review_id" "uuid", "p_expected_version" integer, "p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_update_draft_public"("p_review_id" "uuid", "p_expected_version" integer, "p_patch" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_upsert_metadata"("p_review_id" "uuid", "p_expected_version" integer, "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_upsert_metadata"("p_review_id" "uuid", "p_expected_version" integer, "p_metadata" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_upsert_type_details"("p_review_id" "uuid", "p_expected_version" integer, "p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_upsert_type_details"("p_review_id" "uuid", "p_expected_version" integer, "p_patch" "jsonb") TO "authenticated";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."account_rules" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."account_rules" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."account_rules" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."accounts" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."accounts" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."accounts" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."ai_runs" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."ai_runs" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."ai_runs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."commercial_confirmed_quote_versions" TO "service_role";
GRANT SELECT ON TABLE "public"."commercial_confirmed_quote_versions" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."commercial_confirmed_quotes" TO "service_role";
GRANT SELECT ON TABLE "public"."commercial_confirmed_quotes" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."commercial_payment_methods" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."commercial_payment_methods" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."commercial_quotation_draft_revisions" TO "service_role";
GRANT SELECT ON TABLE "public"."commercial_quotation_draft_revisions" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."commercial_quotation_drafts" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."commercial_quotation_drafts" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cpc_ai_drafts" TO "service_role";
GRANT SELECT ON TABLE "public"."cpc_ai_drafts" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cpc_audit_log" TO "service_role";
GRANT SELECT ON TABLE "public"."cpc_audit_log" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cpc_customer_potential_assessments" TO "service_role";
GRANT SELECT ON TABLE "public"."cpc_customer_potential_assessments" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cpc_customer_references" TO "service_role";
GRANT SELECT ON TABLE "public"."cpc_customer_references" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cpc_customer_workspaces" TO "service_role";
GRANT SELECT ON TABLE "public"."cpc_customer_workspaces" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cpc_external_profile_mappings" TO "service_role";
GRANT SELECT ON TABLE "public"."cpc_external_profile_mappings" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cpc_project_events" TO "service_role";
GRANT SELECT ON TABLE "public"."cpc_project_events" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cpc_project_members" TO "service_role";
GRANT SELECT ON TABLE "public"."cpc_project_members" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cpc_projects" TO "service_role";
GRANT SELECT ON TABLE "public"."cpc_projects" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cpc_reports" TO "service_role";
GRANT SELECT ON TABLE "public"."cpc_reports" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cpc_work_items" TO "service_role";
GRANT SELECT ON TABLE "public"."cpc_work_items" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_activity_events" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_activity_events" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_ad_campaigns" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_ad_campaigns" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_ad_creatives" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_ad_creatives" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_ai_actions" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_ai_actions" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_assignments" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_assignments" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_audit_events" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_audit_events" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_automation_runs" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_automation_runs" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_channel_accounts" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_channel_accounts" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_contacts" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_contacts" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_conversations" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_conversations" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_followups" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_followups" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_lead_profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_lead_profiles" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_lead_scores" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_lead_scores" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_leads" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_leads" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_manual_intake_requests" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_manual_work_updates" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_manual_work_updates" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_messages" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_messages" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_role_bindings" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_role_bindings" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_tasks" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_tasks" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."glh_webhook_events" TO "service_role";
GRANT SELECT ON TABLE "public"."glh_webhook_events" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."knowledge_cards" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."knowledge_cards" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."knowledge_cards" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lead_interactions" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lead_interactions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lead_interactions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."leads" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."leads" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."leads" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."media_assets" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."media_assets" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."media_assets" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organizations" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organizations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organizations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."post_metrics" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."post_metrics" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."post_metrics" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."posts" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."posts" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."posts" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_actions" TO "service_role";
GRANT SELECT ON TABLE "public"."review_actions" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_audit_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."review_audit_logs" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_case_audit_logs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_case_number_counters" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_cases" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."review_cases" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_dict_items" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_dict_items" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_dict_items" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_knowledge_case_metadata" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_knowledge_case_metadata_items" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_knowledge_cases" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_members" TO "service_role";
GRANT SELECT ON TABLE "public"."review_members" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_metadata" TO "service_role";
GRANT SELECT ON TABLE "public"."review_metadata" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_metadata_items" TO "service_role";
GRANT SELECT ON TABLE "public"."review_metadata_items" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_timeline_events" TO "service_role";
GRANT SELECT ON TABLE "public"."review_timeline_events" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_type_details" TO "service_role";
GRANT SELECT ON TABLE "public"."review_type_details" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reviews" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reviews" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reviews" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."scripts" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."scripts" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."scripts" TO "service_role";



GRANT ALL ON TABLE "public"."site_data" TO "anon";
GRANT ALL ON TABLE "public"."site_data" TO "authenticated";
GRANT ALL ON TABLE "public"."site_data" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tasks" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tasks" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tasks" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."topics" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."topics" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."topics" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."viral_teardowns" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."viral_teardowns" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."viral_teardowns" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";


-- Explicit schema ACLs present in Production but omitted by pg_dump's
-- default privilege handling for non-public application schemas.
GRANT USAGE, CREATE ON SCHEMA "commercial_private" TO "postgres";
GRANT USAGE, CREATE ON SCHEMA "commercial_audit" TO "postgres";
