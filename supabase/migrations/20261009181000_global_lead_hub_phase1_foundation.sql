-- Global Lead Hub Phase 1 Foundation
-- Additive, forward-only schema for organization-scoped provider records,
-- lead qualification, conversations, tasks, AI actions, audit, and roles.
-- No Production execution is performed by this repository change.
-- No DROP, TRUNCATE, DELETE, or existing legacy table mutation is included.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Channel and attribution records
-- ---------------------------------------------------------------------------

CREATE TABLE public.glh_channel_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  provider TEXT NOT NULL
    CHECK (provider IN ('WHATSAPP', 'FACEBOOK', 'INSTAGRAM')),
  external_account_id TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'DISCONNECTED'
    CHECK (status IN ('DISCONNECTED', 'PENDING', 'TEST_READY', 'CONNECTED', 'ERROR')),
  configuration_reference TEXT,
  created_by_profile_id UUID,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_glh_channel_accounts_id_org UNIQUE (id, org_id),
  CONSTRAINT uq_glh_channel_accounts_provider_external
    UNIQUE (org_id, provider, external_account_id),
  CONSTRAINT chk_glh_channel_accounts_external
    CHECK (length(btrim(external_account_id)) > 0),
  CONSTRAINT fk_glh_channel_accounts_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE INDEX idx_glh_channel_accounts_org_status
  ON public.glh_channel_accounts(org_id, status);

CREATE TABLE public.glh_ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  provider TEXT NOT NULL
    CHECK (provider IN ('WHATSAPP', 'FACEBOOK', 'INSTAGRAM')),
  external_campaign_id TEXT NOT NULL,
  name TEXT,
  source_platform TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (source_platform IN ('WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'UNKNOWN')),
  status TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (status IN ('UNKNOWN', 'ACTIVE', 'PAUSED', 'ARCHIVED')),
  created_by_profile_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_glh_ad_campaigns_id_org UNIQUE (id, org_id),
  CONSTRAINT uq_glh_ad_campaigns_provider_external
    UNIQUE (org_id, provider, external_campaign_id),
  CONSTRAINT chk_glh_ad_campaigns_external
    CHECK (length(btrim(external_campaign_id)) > 0),
  CONSTRAINT fk_glh_ad_campaigns_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE INDEX idx_glh_ad_campaigns_org_status
  ON public.glh_ad_campaigns(org_id, status);

CREATE TABLE public.glh_ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  campaign_id UUID,
  provider TEXT NOT NULL
    CHECK (provider IN ('WHATSAPP', 'FACEBOOK', 'INSTAGRAM')),
  external_creative_id TEXT,
  referral_identifier TEXT,
  name TEXT,
  source_platform TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (source_platform IN ('WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'UNKNOWN')),
  created_by_profile_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_glh_ad_creatives_id_org UNIQUE (id, org_id),
  CONSTRAINT chk_glh_ad_creatives_identifier
    CHECK (
      external_creative_id IS NULL
      OR length(btrim(external_creative_id)) > 0
    ),
  CONSTRAINT fk_glh_ad_creatives_campaign_org
    FOREIGN KEY (campaign_id, org_id)
    REFERENCES public.glh_ad_campaigns(id, org_id),
  CONSTRAINT fk_glh_ad_creatives_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE UNIQUE INDEX uq_glh_ad_creatives_provider_external
  ON public.glh_ad_creatives(org_id, provider, external_creative_id)
  WHERE external_creative_id IS NOT NULL;

CREATE INDEX idx_glh_ad_creatives_org_campaign
  ON public.glh_ad_creatives(org_id, campaign_id);

-- ---------------------------------------------------------------------------
-- 2. Contacts and leads
-- ---------------------------------------------------------------------------

CREATE TABLE public.glh_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  display_name TEXT,
  company_name TEXT,
  country_code TEXT,
  provider_external_contact_id TEXT,
  source_platform TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (source_platform IN ('WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'UNKNOWN')),
  normalized_whatsapp TEXT,
  normalized_phone TEXT,
  normalized_email TEXT,
  website TEXT,
  social_identifier TEXT,
  created_by_profile_id UUID,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_glh_contacts_id_org UNIQUE (id, org_id),
  CONSTRAINT chk_glh_contacts_provider_external
    CHECK (
      provider_external_contact_id IS NULL
      OR length(btrim(provider_external_contact_id)) > 0
    ),
  CONSTRAINT fk_glh_contacts_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE UNIQUE INDEX uq_glh_contacts_provider_external
  ON public.glh_contacts(org_id, source_platform, provider_external_contact_id)
  WHERE provider_external_contact_id IS NOT NULL;

CREATE UNIQUE INDEX uq_glh_contacts_whatsapp
  ON public.glh_contacts(org_id, normalized_whatsapp)
  WHERE normalized_whatsapp IS NOT NULL;

CREATE UNIQUE INDEX uq_glh_contacts_email
  ON public.glh_contacts(org_id, normalized_email)
  WHERE normalized_email IS NOT NULL;

CREATE INDEX idx_glh_contacts_phone
  ON public.glh_contacts(org_id, normalized_phone)
  WHERE normalized_phone IS NOT NULL;

CREATE TABLE public.glh_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  contact_id UUID NOT NULL,
  owner_profile_id UUID,
  lifecycle_state TEXT NOT NULL DEFAULT 'NEW'
    CHECK (lifecycle_state IN (
      'NEW',
      'AI_QUALIFYING',
      'WAITING_CUSTOMER',
      'READY_FOR_HUMAN',
      'HUMAN_FOLLOWING',
      'QUOTATION',
      'SAMPLE',
      'NEGOTIATION',
      'WON',
      'LOST',
      'DORMANT',
      'INVALID'
    )),
  conversation_mode TEXT NOT NULL DEFAULT 'AI_ACTIVE'
    CHECK (conversation_mode IN (
      'AI_ACTIVE',
      'HANDOFF_PENDING',
      'HUMAN_ACTIVE',
      'PAUSED'
    )),
  priority_grade TEXT
    CHECK (priority_grade IS NULL OR priority_grade IN ('A', 'B', 'C', 'D')),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  completeness INTEGER NOT NULL DEFAULT 0
    CHECK (completeness >= 0 AND completeness <= 100),
  source_platform TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (source_platform IN ('WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'UNKNOWN')),
  campaign_id UUID,
  creative_id UUID,
  referral_identifier TEXT,
  last_message_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  created_by_profile_id UUID,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_glh_leads_id_org UNIQUE (id, org_id),
  CONSTRAINT fk_glh_leads_contact_org
    FOREIGN KEY (contact_id, org_id)
    REFERENCES public.glh_contacts(id, org_id),
  CONSTRAINT fk_glh_leads_owner_org
    FOREIGN KEY (owner_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),
  CONSTRAINT fk_glh_leads_campaign_org
    FOREIGN KEY (campaign_id, org_id)
    REFERENCES public.glh_ad_campaigns(id, org_id),
  CONSTRAINT fk_glh_leads_creative_org
    FOREIGN KEY (creative_id, org_id)
    REFERENCES public.glh_ad_creatives(id, org_id),
  CONSTRAINT fk_glh_leads_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE INDEX idx_glh_leads_org_state
  ON public.glh_leads(org_id, lifecycle_state);

CREATE INDEX idx_glh_leads_org_owner
  ON public.glh_leads(org_id, owner_profile_id);

CREATE INDEX idx_glh_leads_org_followup
  ON public.glh_leads(org_id, next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL;

CREATE INDEX idx_glh_leads_org_created
  ON public.glh_leads(org_id, created_at DESC);

CREATE TABLE public.glh_lead_profiles (
  lead_id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_company_name TEXT,
  country_code TEXT,
  whatsapp TEXT,
  email TEXT,
  website TEXT,
  social_identifier TEXT,
  product TEXT,
  material TEXT,
  product_media_references JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(product_media_references) = 'array'),
  dimensions TEXT,
  quantity TEXT,
  artwork_reference TEXT,
  printing_area TEXT,
  requirement_type TEXT
    CHECK (
      requirement_type IS NULL
      OR requirement_type IN (
        'FILM',
        'PROCESSING',
        'MACHINE',
        'PROCESS_CONSULT',
        'UNCLEAR'
      )
    ),
  current_printing_process TEXT,
  pain_points TEXT,
  test_requirements TEXT,
  sample_availability TEXT,
  purchase_timeline TEXT,
  machine_capacity_requirements TEXT,
  automation_requirements TEXT,
  machine_plus_process_solution_required BOOLEAN,
  extracted_facts JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(extracted_facts) = 'object'),
  ai_summary TEXT,
  created_by_profile_id UUID,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_glh_lead_profiles_lead_org UNIQUE (lead_id, org_id),
  CONSTRAINT fk_glh_lead_profiles_lead_org
    FOREIGN KEY (lead_id, org_id)
    REFERENCES public.glh_leads(id, org_id),
  CONSTRAINT fk_glh_lead_profiles_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE INDEX idx_glh_lead_profiles_org_requirement
  ON public.glh_lead_profiles(org_id, requirement_type);

-- ---------------------------------------------------------------------------
-- 3. Conversations and original messages
-- ---------------------------------------------------------------------------

CREATE TABLE public.glh_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  lead_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  channel_account_id UUID NOT NULL,
  external_conversation_id TEXT NOT NULL,
  conversation_mode TEXT NOT NULL DEFAULT 'AI_ACTIVE'
    CHECK (conversation_mode IN (
      'AI_ACTIVE',
      'HANDOFF_PENDING',
      'HUMAN_ACTIVE',
      'PAUSED'
    )),
  conversation_status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (conversation_status IN ('ACTIVE', 'CLOSED', 'ARCHIVED')),
  assigned_profile_id UUID,
  last_message_at TIMESTAMPTZ,
  created_by_profile_id UUID,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_glh_conversations_id_org UNIQUE (id, org_id),
  CONSTRAINT uq_glh_conversations_external
    UNIQUE (org_id, channel_account_id, external_conversation_id),
  CONSTRAINT chk_glh_conversations_external
    CHECK (length(btrim(external_conversation_id)) > 0),
  CONSTRAINT fk_glh_conversations_lead_org
    FOREIGN KEY (lead_id, org_id)
    REFERENCES public.glh_leads(id, org_id),
  CONSTRAINT fk_glh_conversations_contact_org
    FOREIGN KEY (contact_id, org_id)
    REFERENCES public.glh_contacts(id, org_id),
  CONSTRAINT fk_glh_conversations_channel_org
    FOREIGN KEY (channel_account_id, org_id)
    REFERENCES public.glh_channel_accounts(id, org_id),
  CONSTRAINT fk_glh_conversations_assignee_org
    FOREIGN KEY (assigned_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),
  CONSTRAINT fk_glh_conversations_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE INDEX idx_glh_conversations_org_lead
  ON public.glh_conversations(org_id, lead_id);

CREATE INDEX idx_glh_conversations_org_mode
  ON public.glh_conversations(org_id, conversation_mode);

CREATE INDEX idx_glh_conversations_org_last_message
  ON public.glh_conversations(org_id, last_message_at DESC);

CREATE TABLE public.glh_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  conversation_id UUID NOT NULL,
  lead_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  provider TEXT NOT NULL
    CHECK (provider IN ('WHATSAPP', 'FACEBOOK', 'INSTAGRAM')),
  provider_message_id TEXT NOT NULL,
  direction TEXT NOT NULL
    CHECK (direction IN ('INBOUND', 'OUTBOUND', 'SYSTEM')),
  actor_type TEXT NOT NULL
    CHECK (actor_type IN ('AI', 'HUMAN', 'CUSTOMER', 'SYSTEM')),
  actor_profile_id UUID,
  message_text TEXT,
  media_metadata JSONB
    CHECK (media_metadata IS NULL OR jsonb_typeof(media_metadata) = 'object'),
  provider_timestamp TIMESTAMPTZ,
  delivery_status TEXT NOT NULL DEFAULT 'RECEIVED'
    CHECK (delivery_status IN (
      'RECEIVED',
      'QUEUED',
      'SENT',
      'DELIVERED',
      'READ',
      'FAILED'
    )),
  error_metadata JSONB
    CHECK (error_metadata IS NULL OR jsonb_typeof(error_metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_glh_messages_id_org UNIQUE (id, org_id),
  CONSTRAINT uq_glh_messages_provider_external
    UNIQUE (org_id, provider, provider_message_id),
  CONSTRAINT chk_glh_messages_provider_id
    CHECK (length(btrim(provider_message_id)) > 0),
  CONSTRAINT chk_glh_messages_content
    CHECK (
      message_text IS NOT NULL
      OR media_metadata IS NOT NULL
      OR actor_type = 'SYSTEM'
    ),
  CONSTRAINT fk_glh_messages_conversation_org
    FOREIGN KEY (conversation_id, org_id)
    REFERENCES public.glh_conversations(id, org_id),
  CONSTRAINT fk_glh_messages_lead_org
    FOREIGN KEY (lead_id, org_id)
    REFERENCES public.glh_leads(id, org_id),
  CONSTRAINT fk_glh_messages_contact_org
    FOREIGN KEY (contact_id, org_id)
    REFERENCES public.glh_contacts(id, org_id),
  CONSTRAINT fk_glh_messages_actor_org
    FOREIGN KEY (actor_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE INDEX idx_glh_messages_org_conversation_time
  ON public.glh_messages(org_id, conversation_id, provider_timestamp);

CREATE INDEX idx_glh_messages_org_lead
  ON public.glh_messages(org_id, lead_id);

-- ---------------------------------------------------------------------------
-- 4. Webhook idempotency
-- ---------------------------------------------------------------------------

CREATE TABLE public.glh_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  channel_account_id UUID,
  provider TEXT NOT NULL
    CHECK (provider IN ('WHATSAPP', 'FACEBOOK', 'INSTAGRAM')),
  external_event_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  processing_status TEXT NOT NULL DEFAULT 'RECEIVED'
    CHECK (processing_status IN (
      'RECEIVED',
      'PROCESSING',
      'PROCESSED',
      'FAILED',
      'DUPLICATE'
    )),
  processing_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT uq_glh_webhook_events_id_org UNIQUE (id, org_id),
  CONSTRAINT chk_glh_webhook_external
    CHECK (length(btrim(external_event_id)) > 0),
  CONSTRAINT chk_glh_webhook_idempotency
    CHECK (length(btrim(idempotency_key)) > 0),
  CONSTRAINT fk_glh_webhook_channel_org
    FOREIGN KEY (channel_account_id, org_id)
    REFERENCES public.glh_channel_accounts(id, org_id)
);

CREATE UNIQUE INDEX uq_glh_webhook_provider_event
  ON public.glh_webhook_events(provider, external_event_id);

CREATE INDEX idx_glh_webhook_org_status
  ON public.glh_webhook_events(org_id, processing_status, received_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Scoring, assignments, work, and AI actions
-- ---------------------------------------------------------------------------

CREATE TABLE public.glh_lead_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  lead_id UUID NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  grade TEXT NOT NULL CHECK (grade IN ('A', 'B', 'C', 'D')),
  score_source TEXT NOT NULL
    CHECK (score_source IN ('AI', 'HUMAN', 'SYSTEM')),
  components JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(components) = 'object'),
  prompt_version TEXT,
  created_by_profile_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_glh_lead_scores_id_org UNIQUE (id, org_id),
  CONSTRAINT fk_glh_lead_scores_lead_org
    FOREIGN KEY (lead_id, org_id)
    REFERENCES public.glh_leads(id, org_id),
  CONSTRAINT fk_glh_lead_scores_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE INDEX idx_glh_lead_scores_org_lead_created
  ON public.glh_lead_scores(org_id, lead_id, created_at DESC);

CREATE TABLE public.glh_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  lead_id UUID NOT NULL,
  assignee_profile_id UUID NOT NULL,
  assignment_type TEXT NOT NULL
    CHECK (assignment_type IN ('PRIMARY', 'COLLABORATOR')),
  assigned_by_profile_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ENDED', 'REVOKED')),
  reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_glh_assignments_id_org UNIQUE (id, org_id),
  CONSTRAINT chk_glh_assignments_lifecycle
    CHECK (
      (status = 'ACTIVE' AND ended_at IS NULL)
      OR (status IN ('ENDED', 'REVOKED') AND ended_at IS NOT NULL)
    ),
  CONSTRAINT fk_glh_assignments_lead_org
    FOREIGN KEY (lead_id, org_id)
    REFERENCES public.glh_leads(id, org_id),
  CONSTRAINT fk_glh_assignments_assignee_org
    FOREIGN KEY (assignee_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),
  CONSTRAINT fk_glh_assignments_assigner_org
    FOREIGN KEY (assigned_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE UNIQUE INDEX uq_glh_assignments_active_primary
  ON public.glh_assignments(lead_id)
  WHERE assignment_type = 'PRIMARY' AND status = 'ACTIVE';

CREATE INDEX idx_glh_assignments_org_assignee_status
  ON public.glh_assignments(org_id, assignee_profile_id, status);

CREATE TABLE public.glh_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  lead_id UUID NOT NULL,
  assignee_profile_id UUID NOT NULL,
  task_type TEXT NOT NULL
    CHECK (task_type IN (
      'QUALIFICATION',
      'FOLLOW_UP',
      'QUOTATION',
      'SAMPLE',
      'NEGOTIATION',
      'HANDOFF',
      'OTHER'
    )),
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
  source TEXT NOT NULL DEFAULT 'HUMAN'
    CHECK (source IN ('HUMAN', 'AI_SUGGESTION', 'SYSTEM')),
  created_by_profile_id UUID,
  completed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_glh_tasks_id_org UNIQUE (id, org_id),
  CONSTRAINT chk_glh_tasks_title CHECK (length(btrim(title)) > 0),
  CONSTRAINT fk_glh_tasks_lead_org
    FOREIGN KEY (lead_id, org_id)
    REFERENCES public.glh_leads(id, org_id),
  CONSTRAINT fk_glh_tasks_assignee_org
    FOREIGN KEY (assignee_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),
  CONSTRAINT fk_glh_tasks_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE INDEX idx_glh_tasks_org_assignee_status_due
  ON public.glh_tasks(org_id, assignee_profile_id, status, due_at);

CREATE TABLE public.glh_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  lead_id UUID NOT NULL,
  assigned_profile_id UUID NOT NULL,
  followup_type TEXT NOT NULL
    CHECK (followup_type IN (
      'QUALIFICATION',
      'QUOTATION',
      'SAMPLE',
      'NEGOTIATION',
      'DORMANT_REVIVAL',
      'OTHER'
    )),
  next_action TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'DONE', 'CANCELLED', 'OVERDUE')),
  last_contact_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by_profile_id UUID,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_glh_followups_id_org UNIQUE (id, org_id),
  CONSTRAINT chk_glh_followups_action CHECK (length(btrim(next_action)) > 0),
  CONSTRAINT fk_glh_followups_lead_org
    FOREIGN KEY (lead_id, org_id)
    REFERENCES public.glh_leads(id, org_id),
  CONSTRAINT fk_glh_followups_assignee_org
    FOREIGN KEY (assigned_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),
  CONSTRAINT fk_glh_followups_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE INDEX idx_glh_followups_org_assignee_status_due
  ON public.glh_followups(org_id, assigned_profile_id, status, due_at);

CREATE TABLE public.glh_ai_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  lead_id UUID NOT NULL,
  conversation_id UUID,
  trigger_message_id UUID,
  action_type TEXT NOT NULL
    CHECK (action_type IN (
      'QUALIFY',
      'EXTRACT_FACTS',
      'MISSING_INFO',
      'SCORE',
      'DRAFT_REPLY',
      'SUMMARY',
      'NEXT_ACTION',
      'HANDOFF',
      'AI_SEND'
    )),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'BLOCKED')),
  prompt_version TEXT NOT NULL,
  model_name TEXT,
  input_summary JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(input_summary) = 'object'),
  output_payload JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(output_payload) = 'object'),
  delivery_status TEXT
    CHECK (
      delivery_status IS NULL
      OR delivery_status IN ('NOT_APPLICABLE', 'QUEUED', 'SENT', 'FAILED', 'BLOCKED')
    ),
  error_metadata JSONB
    CHECK (error_metadata IS NULL OR jsonb_typeof(error_metadata) = 'object'),
  created_by_profile_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT uq_glh_ai_actions_id_org UNIQUE (id, org_id),
  CONSTRAINT chk_glh_ai_actions_prompt
    CHECK (length(btrim(prompt_version)) > 0),
  CONSTRAINT chk_glh_ai_actions_send_context
    CHECK (
      action_type <> 'AI_SEND'
      OR (conversation_id IS NOT NULL AND trigger_message_id IS NOT NULL)
    ),
  CONSTRAINT fk_glh_ai_actions_lead_org
    FOREIGN KEY (lead_id, org_id)
    REFERENCES public.glh_leads(id, org_id),
  CONSTRAINT fk_glh_ai_actions_conversation_org
    FOREIGN KEY (conversation_id, org_id)
    REFERENCES public.glh_conversations(id, org_id),
  CONSTRAINT fk_glh_ai_actions_message_org
    FOREIGN KEY (trigger_message_id, org_id)
    REFERENCES public.glh_messages(id, org_id),
  CONSTRAINT fk_glh_ai_actions_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE UNIQUE INDEX uq_glh_ai_actions_send_idempotency
  ON public.glh_ai_actions(
    org_id,
    conversation_id,
    COALESCE(trigger_message_id, '00000000-0000-0000-0000-000000000000'::UUID),
    action_type,
    prompt_version
  )
  WHERE action_type = 'AI_SEND';

CREATE INDEX idx_glh_ai_actions_org_lead_created
  ON public.glh_ai_actions(org_id, lead_id, created_at DESC);

CREATE TABLE public.glh_automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  lead_id UUID,
  run_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED')),
  input_summary JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(input_summary) = 'object'),
  output_payload JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(output_payload) = 'object'),
  error_metadata JSONB
    CHECK (error_metadata IS NULL OR jsonb_typeof(error_metadata) = 'object'),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_by_profile_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_glh_automation_runs_id_org UNIQUE (id, org_id),
  CONSTRAINT chk_glh_automation_runs_type
    CHECK (length(btrim(run_type)) > 0),
  CONSTRAINT fk_glh_automation_runs_lead_org
    FOREIGN KEY (lead_id, org_id)
    REFERENCES public.glh_leads(id, org_id),
  CONSTRAINT fk_glh_automation_runs_creator_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE INDEX idx_glh_automation_runs_org_status_created
  ON public.glh_automation_runs(org_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 6. Organization-bound GLH role bindings and append-oriented audit
-- ---------------------------------------------------------------------------

CREATE TABLE public.glh_role_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  profile_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'SALES')),
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'REVOKED')),
  granted_by_profile_id UUID NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by_profile_id UUID,
  revoked_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_glh_role_bindings_id_org UNIQUE (id, org_id),
  CONSTRAINT chk_glh_role_bindings_lifecycle
    CHECK (
      (status = 'ACTIVE' AND revoked_at IS NULL AND revoked_by_profile_id IS NULL)
      OR (status = 'REVOKED' AND revoked_at IS NOT NULL AND revoked_by_profile_id IS NOT NULL)
    ),
  CONSTRAINT fk_glh_role_bindings_profile_org
    FOREIGN KEY (profile_id, org_id)
    REFERENCES public.profiles(id, org_id),
  CONSTRAINT fk_glh_role_bindings_grantor_org
    FOREIGN KEY (granted_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id),
  CONSTRAINT fk_glh_role_bindings_revoker_org
    FOREIGN KEY (revoked_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE UNIQUE INDEX uq_glh_role_bindings_active
  ON public.glh_role_bindings(org_id, profile_id, role)
  WHERE status = 'ACTIVE';

CREATE INDEX idx_glh_role_bindings_org_role_status
  ON public.glh_role_bindings(org_id, role, status);

CREATE TABLE public.glh_audit_events (
  audit_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  lead_id UUID,
  actor_profile_id UUID,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('HUMAN', 'AI', 'SYSTEM')),
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'LEAD_ASSIGNED',
      'LEAD_GRADE_CHANGED',
      'LEAD_STAGE_CHANGED',
      'AI_SEND',
      'HUMAN_HANDOFF',
      'CHANNEL_SETTING_CHANGED',
      'ROLE_CHANGED'
    )),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  previous_state TEXT,
  next_state TEXT,
  reason TEXT,
  context JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(context) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_glh_audit_events_id_org UNIQUE (id, org_id),
  CONSTRAINT chk_glh_audit_entity CHECK (length(btrim(entity_type)) > 0),
  CONSTRAINT chk_glh_audit_actor
    CHECK (actor_kind <> 'HUMAN' OR actor_profile_id IS NOT NULL),
  CONSTRAINT fk_glh_audit_events_lead_org
    FOREIGN KEY (lead_id, org_id)
    REFERENCES public.glh_leads(id, org_id),
  CONSTRAINT fk_glh_audit_events_actor_org
    FOREIGN KEY (actor_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
);

CREATE INDEX idx_glh_audit_events_org_entity_created
  ON public.glh_audit_events(org_id, entity_type, entity_id, created_at DESC);

CREATE INDEX idx_glh_audit_events_org_type_created
  ON public.glh_audit_events(org_id, event_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- 7. Controlled identity and access helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.glh_current_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
    AND p.is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.glh_can_manage_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
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

CREATE OR REPLACE FUNCTION public.glh_can_access_lead(p_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
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

CREATE OR REPLACE FUNCTION public.glh_can_access_contact(p_contact_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
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

CREATE OR REPLACE FUNCTION public.glh_can_access_conversation(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.glh_conversations c
    WHERE c.id = p_conversation_id
      AND public.glh_can_access_lead(c.lead_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- 8. RLS, explicit grants, and read policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.glh_channel_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glh_ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glh_ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glh_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glh_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glh_lead_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glh_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glh_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glh_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glh_lead_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glh_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glh_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glh_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glh_ai_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glh_automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glh_role_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glh_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.glh_channel_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.glh_ad_campaigns FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.glh_ad_creatives FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.glh_contacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.glh_leads FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.glh_lead_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.glh_conversations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.glh_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.glh_webhook_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.glh_lead_scores FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.glh_assignments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.glh_tasks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.glh_followups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.glh_ai_actions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.glh_automation_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.glh_role_bindings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.glh_audit_events FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.glh_channel_accounts TO authenticated;
GRANT SELECT ON TABLE public.glh_ad_campaigns TO authenticated;
GRANT SELECT ON TABLE public.glh_ad_creatives TO authenticated;
GRANT SELECT ON TABLE public.glh_contacts TO authenticated;
GRANT SELECT ON TABLE public.glh_leads TO authenticated;
GRANT SELECT ON TABLE public.glh_lead_profiles TO authenticated;
GRANT SELECT ON TABLE public.glh_conversations TO authenticated;
GRANT SELECT ON TABLE public.glh_messages TO authenticated;
GRANT SELECT ON TABLE public.glh_webhook_events TO authenticated;
GRANT SELECT ON TABLE public.glh_lead_scores TO authenticated;
GRANT SELECT ON TABLE public.glh_assignments TO authenticated;
GRANT SELECT ON TABLE public.glh_tasks TO authenticated;
GRANT SELECT ON TABLE public.glh_followups TO authenticated;
GRANT SELECT ON TABLE public.glh_ai_actions TO authenticated;
GRANT SELECT ON TABLE public.glh_automation_runs TO authenticated;
GRANT SELECT ON TABLE public.glh_role_bindings TO authenticated;
GRANT SELECT ON TABLE public.glh_audit_events TO authenticated;

REVOKE ALL ON FUNCTION public.glh_current_profile_id()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.glh_can_manage_org(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.glh_can_access_lead(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.glh_can_access_contact(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.glh_can_access_conversation(UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.glh_current_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.glh_can_manage_org(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.glh_can_access_lead(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.glh_can_access_contact(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.glh_can_access_conversation(UUID) TO authenticated;

CREATE POLICY "glh_channel_accounts_select" ON public.glh_channel_accounts
  FOR SELECT TO authenticated
  USING (public.glh_can_manage_org(org_id));

CREATE POLICY "glh_ad_campaigns_select" ON public.glh_ad_campaigns
  FOR SELECT TO authenticated
  USING (public.glh_can_manage_org(org_id));

CREATE POLICY "glh_ad_creatives_select" ON public.glh_ad_creatives
  FOR SELECT TO authenticated
  USING (public.glh_can_manage_org(org_id));

CREATE POLICY "glh_contacts_select" ON public.glh_contacts
  FOR SELECT TO authenticated
  USING (public.glh_can_access_contact(id));

CREATE POLICY "glh_leads_select" ON public.glh_leads
  FOR SELECT TO authenticated
  USING (public.glh_can_access_lead(id));

CREATE POLICY "glh_lead_profiles_select" ON public.glh_lead_profiles
  FOR SELECT TO authenticated
  USING (public.glh_can_access_lead(lead_id));

CREATE POLICY "glh_conversations_select" ON public.glh_conversations
  FOR SELECT TO authenticated
  USING (public.glh_can_access_lead(lead_id));

CREATE POLICY "glh_messages_select" ON public.glh_messages
  FOR SELECT TO authenticated
  USING (public.glh_can_access_conversation(conversation_id));

CREATE POLICY "glh_webhook_events_select" ON public.glh_webhook_events
  FOR SELECT TO authenticated
  USING (public.glh_can_manage_org(org_id));

CREATE POLICY "glh_lead_scores_select" ON public.glh_lead_scores
  FOR SELECT TO authenticated
  USING (public.glh_can_access_lead(lead_id));

CREATE POLICY "glh_assignments_select" ON public.glh_assignments
  FOR SELECT TO authenticated
  USING (public.glh_can_access_lead(lead_id));

CREATE POLICY "glh_tasks_select" ON public.glh_tasks
  FOR SELECT TO authenticated
  USING (
    public.glh_can_manage_org(org_id)
    OR (
      assignee_profile_id = public.glh_current_profile_id()
      AND public.glh_can_access_lead(lead_id)
    )
  );

CREATE POLICY "glh_followups_select" ON public.glh_followups
  FOR SELECT TO authenticated
  USING (
    public.glh_can_manage_org(org_id)
    OR (
      assigned_profile_id = public.glh_current_profile_id()
      AND public.glh_can_access_lead(lead_id)
    )
  );

CREATE POLICY "glh_ai_actions_select" ON public.glh_ai_actions
  FOR SELECT TO authenticated
  USING (public.glh_can_access_lead(lead_id));

CREATE POLICY "glh_automation_runs_select" ON public.glh_automation_runs
  FOR SELECT TO authenticated
  USING (
    public.glh_can_manage_org(org_id)
    OR (lead_id IS NOT NULL AND public.glh_can_access_lead(lead_id))
  );

CREATE POLICY "glh_role_bindings_select" ON public.glh_role_bindings
  FOR SELECT TO authenticated
  USING (public.glh_can_manage_org(org_id));

CREATE POLICY "glh_audit_events_select" ON public.glh_audit_events
  FOR SELECT TO authenticated
  USING (public.glh_can_manage_org(org_id));

-- No INSERT, UPDATE, or DELETE policy is created in Phase 1. Future business
-- mutations must use narrowly reviewed server-side RPCs and append audit rows.

-- ---------------------------------------------------------------------------
-- 9. Updated-at triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_glh_channel_accounts_updated_at
  BEFORE UPDATE ON public.glh_channel_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_glh_ad_campaigns_updated_at
  BEFORE UPDATE ON public.glh_ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_glh_ad_creatives_updated_at
  BEFORE UPDATE ON public.glh_ad_creatives
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_glh_contacts_updated_at
  BEFORE UPDATE ON public.glh_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_glh_leads_updated_at
  BEFORE UPDATE ON public.glh_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_glh_lead_profiles_updated_at
  BEFORE UPDATE ON public.glh_lead_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_glh_conversations_updated_at
  BEFORE UPDATE ON public.glh_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_glh_tasks_updated_at
  BEFORE UPDATE ON public.glh_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_glh_followups_updated_at
  BEFORE UPDATE ON public.glh_followups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
