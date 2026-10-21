-- GLH Stage 1 - authenticated manual Production intake without Meta/WhatsApp cutover.
-- Additive, forward-only. Applying on Production requires separate exact-SHA owner approval.
-- Never relax the existing test/dev-only glh_create_manual_test_lead guard.
BEGIN;

-- Private idempotency ledger: no direct browser roles can read or mutate it.
CREATE TABLE public.glh_manual_intake_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  actor_profile_id uuid NOT NULL,
  request_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  lead_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_glh_manual_intake_actor_key UNIQUE (org_id, actor_profile_id, request_key),
  CONSTRAINT fk_glh_manual_intake_actor_org
    FOREIGN KEY (actor_profile_id,org_id) REFERENCES public.profiles(id,org_id),
  CONSTRAINT fk_glh_manual_intake_lead_org
    FOREIGN KEY (lead_id,org_id) REFERENCES public.glh_leads(id,org_id),
  CONSTRAINT fk_glh_manual_intake_contact_org
    FOREIGN KEY (contact_id,org_id) REFERENCES public.glh_contacts(id,org_id)
);
CREATE INDEX idx_glh_manual_intake_org_created
  ON public.glh_manual_intake_requests (org_id,created_at DESC);
ALTER TABLE public.glh_manual_intake_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.glh_manual_intake_requests FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.glh_create_manual_production_lead(
  p_request_key uuid,
  p_display_name text,
  p_company_name text DEFAULT NULL,
  p_country_code text DEFAULT NULL,
  p_whatsapp text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_requirement_type text DEFAULT NULL,
  p_owner_profile_id uuid DEFAULT NULL,
  p_product text DEFAULT NULL,
  p_material text DEFAULT NULL,
  p_quantity text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_source_detail text DEFAULT 'OTHER'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog,public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.glh_create_manual_production_lead(
  uuid,text,text,text,text,text,text,uuid,text,text,text,text,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.glh_create_manual_production_lead(
  uuid,text,text,text,text,text,text,uuid,text,text,text,text,text
) TO authenticated;

COMMIT;
