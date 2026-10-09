export const GLH_SPEC_LOCK_VERSION = 'GLH-SPEC-V1.0';

export const GLH_LIFECYCLE_STATES = [
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
  'INVALID',
] as const;

export type GlhLifecycleState = (typeof GLH_LIFECYCLE_STATES)[number];

export const GLH_CONVERSATION_MODES = [
  'AI_ACTIVE',
  'HANDOFF_PENDING',
  'HUMAN_ACTIVE',
  'PAUSED',
] as const;

export type GlhConversationMode = (typeof GLH_CONVERSATION_MODES)[number];

export const GLH_PRIORITY_GRADES = ['A', 'B', 'C', 'D'] as const;
export type GlhPriorityGrade = (typeof GLH_PRIORITY_GRADES)[number];

export const GLH_HUMAN_ROLES = ['ADMIN', 'MANAGER', 'SALES'] as const;
export type GlhHumanRole = (typeof GLH_HUMAN_ROLES)[number];

export const GLH_AI_ALLOWED_TRANSITIONS: Readonly<
  Record<GlhLifecycleState, readonly GlhLifecycleState[]>
> = {
  NEW: ['AI_QUALIFYING'],
  AI_QUALIFYING: ['WAITING_CUSTOMER', 'READY_FOR_HUMAN'],
  WAITING_CUSTOMER: ['AI_QUALIFYING', 'READY_FOR_HUMAN'],
  READY_FOR_HUMAN: [],
  HUMAN_FOLLOWING: [],
  QUOTATION: [],
  SAMPLE: [],
  NEGOTIATION: [],
  WON: [],
  LOST: [],
  DORMANT: [],
  INVALID: [],
};

export const GLH_HUMAN_CONSEQUENTIAL_STATES = [
  'HUMAN_FOLLOWING',
  'QUOTATION',
  'SAMPLE',
  'NEGOTIATION',
  'WON',
  'LOST',
  'INVALID',
] as const satisfies readonly GlhLifecycleState[];

export const GLH_SCORE_BANDS = [
  { grade: 'A', min: 80, max: 100 },
  { grade: 'B', min: 60, max: 79 },
  { grade: 'C', min: 30, max: 59 },
  { grade: 'D', min: 0, max: 29 },
] as const satisfies readonly {
  grade: GlhPriorityGrade;
  min: number;
  max: number;
}[];

export const GLH_IMMEDIATE_HANDOFF_TRIGGERS = [
  'QUOTATION_OR_PRICE_DECISION',
  'SAMPLE_OR_TEST',
  'MACHINE_INQUIRY',
  'LARGE_COMMERCIAL_OPPORTUNITY',
  'FORMAL_RFQ_SPEC_OR_DRAWING',
  'VIDEO_MEETING',
  'FINAL_TECHNICAL_CONFIRMATION',
  'PAYMENT_DELIVERY_OR_DISCOUNT_TERMS',
  'DISTRIBUTOR_OR_AGENCY_DISCUSSION',
  'COMPLAINT_OR_DISSATISFACTION',
  'AI_UNRESOLVED_AFTER_TWO_USEFUL_TURNS',
  'LOW_CONFIDENCE_OR_HIGH_RISK',
  'ADMIN_CONFIGURED_IMPORTANT_ACCOUNT',
] as const;

export const GLH_FORBIDDEN_AUTONOMOUS_CLAIMS = [
  'FINAL_PRICE_OR_DISCOUNT',
  'FINAL_DELIVERY_DATE',
  'PAYMENT_TERMS',
  'FINAL_TECHNICAL_FEASIBILITY',
  'ADHESION_OR_TEST_GUARANTEE',
  'MACHINE_CAPACITY_GUARANTEE',
  'COMPENSATION',
  'CONTRACT_OR_AGENCY_COMMITMENT',
] as const;

export const GLH_CORE_ENTITY_IDENTIFIERS = {
  lead: 'lead_id',
  contact: 'contact_id',
  leadProfile: 'lead_id',
  conversation: 'conversation_id',
  message: 'message_id',
  channelAccount: 'channel_account_id',
  webhookEvent: 'webhook_event_id',
  leadScore: 'lead_score_id',
  assignment: 'assignment_id',
  task: 'task_id',
  followup: 'followup_id',
  aiAction: 'ai_action_id',
  automationRun: 'automation_run_id',
  adCampaign: 'ad_campaign_id',
  adCreative: 'ad_creative_id',
  roleBinding: 'role_binding_id',
  auditEvent: 'audit_event_id',
} as const;

export const GLH_CORE_TABLES = {
  lead: 'glh_leads',
  contact: 'glh_contacts',
  leadProfile: 'glh_lead_profiles',
  conversation: 'glh_conversations',
  message: 'glh_messages',
  channelAccount: 'glh_channel_accounts',
  webhookEvent: 'glh_webhook_events',
  leadScore: 'glh_lead_scores',
  assignment: 'glh_assignments',
  task: 'glh_tasks',
  followup: 'glh_followups',
  aiAction: 'glh_ai_actions',
  automationRun: 'glh_automation_runs',
  adCampaign: 'glh_ad_campaigns',
  adCreative: 'glh_ad_creatives',
  roleBinding: 'glh_role_bindings',
  auditEvent: 'glh_audit_events',
} as const;

export type GlhCoreEntityName = keyof typeof GLH_CORE_ENTITY_IDENTIFIERS;
export type GlhCoreTableName = (typeof GLH_CORE_TABLES)[GlhCoreEntityName];

export function isGlhLifecycleState(value: unknown): value is GlhLifecycleState {
  return typeof value === 'string'
    && (GLH_LIFECYCLE_STATES as readonly string[]).includes(value);
}

export function isGlhConversationMode(value: unknown): value is GlhConversationMode {
  return typeof value === 'string'
    && (GLH_CONVERSATION_MODES as readonly string[]).includes(value);
}

export function isGlhPriorityGrade(value: unknown): value is GlhPriorityGrade {
  return typeof value === 'string'
    && (GLH_PRIORITY_GRADES as readonly string[]).includes(value);
}

export function canAiAdvanceLifecycle(
  from: GlhLifecycleState,
  to: GlhLifecycleState,
): boolean {
  return GLH_AI_ALLOWED_TRANSITIONS[from].includes(to);
}

export function gradeForGlhScore(score: number): GlhPriorityGrade | null {
  if (!Number.isInteger(score) || score < 0 || score > 100) return null;
  return GLH_SCORE_BANDS.find(band => score >= band.min && score <= band.max)?.grade ?? null;
}
