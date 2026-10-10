-- Global Lead Hub Phase 3 WhatsApp Inbound
-- Additive, forward-only storage boundary for verified WhatsApp webhooks.
-- This migration is repository code only: it does not execute Production SQL,
-- configure Meta, change environment values, or send outbound messages.

BEGIN;

CREATE OR REPLACE FUNCTION public.glh_ingest_whatsapp_inbound(
  p_external_event_id TEXT,
  p_provider_account_id TEXT,
  p_external_contact_id TEXT,
  p_external_conversation_id TEXT,
  p_contact_display_name TEXT DEFAULT NULL,
  p_message_type TEXT DEFAULT NULL,
  p_message_text TEXT DEFAULT NULL,
  p_media_metadata JSONB DEFAULT NULL,
  p_provider_timestamp TIMESTAMPTZ DEFAULT NULL,
  p_referral JSONB DEFAULT NULL,
  p_raw_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
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

REVOKE ALL ON FUNCTION public.glh_ingest_whatsapp_inbound(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ, JSONB, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.glh_ingest_whatsapp_inbound(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ, JSONB, JSONB
) TO service_role;

COMMIT;
