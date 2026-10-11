-- Global Lead Hub Phase 5 handoff persistence
-- Additive, forward-only controlled mutations for human takeover and queued
-- human messages. This repository migration is not Production execution.
-- No provider call, DROP, TRUNCATE, DELETE, or direct authenticated DML grant
-- is included.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Atomic human takeover
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.glh_take_over_conversation(
  p_conversation_id UUID,
  p_lead_id UUID,
  p_expected_mode TEXT,
  p_expected_lead_version INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
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

-- ---------------------------------------------------------------------------
-- 2. Idempotent provider-independent human message queue intent
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.glh_queue_human_message(
  p_conversation_id UUID,
  p_lead_id UUID,
  p_expected_mode TEXT,
  p_message_text TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
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

  SELECT c, ca.provider
  INTO v_conversation, v_provider
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

-- ---------------------------------------------------------------------------
-- 3. Exact execute grants; browser roles retain no direct write grant
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.glh_take_over_conversation(
  UUID, UUID, TEXT, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.glh_queue_human_message(
  UUID, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.glh_take_over_conversation(
  UUID, UUID, TEXT, INTEGER, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.glh_queue_human_message(
  UUID, UUID, TEXT, TEXT, TEXT
) TO authenticated;

COMMIT;
