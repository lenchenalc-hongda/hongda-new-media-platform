export const GLH_AUDIT_EVENT_TYPES = [
  'LEAD_ASSIGNED',
  'LEAD_GRADE_CHANGED',
  'LEAD_STAGE_CHANGED',
  'AI_SEND',
  'HUMAN_HANDOFF',
  'CHANNEL_SETTING_CHANGED',
  'ROLE_CHANGED',
] as const;

export type GlhAuditEventType = (typeof GLH_AUDIT_EVENT_TYPES)[number];

export const GLH_AUDIT_ACTOR_KINDS = ['HUMAN', 'AI', 'SYSTEM'] as const;
export type GlhAuditActorKind = (typeof GLH_AUDIT_ACTOR_KINDS)[number];

export interface GlhAuditEventInput {
  organizationId: string;
  eventType: GlhAuditEventType;
  actorKind: GlhAuditActorKind;
  actorProfileId: string | null;
  entityType: string;
  entityId: string;
  leadId?: string | null;
  previousState?: string | null;
  nextState?: string | null;
  reason?: string | null;
  context?: Record<string, unknown>;
}

export interface GlhAuditEventRecord extends GlhAuditEventInput {
  eventSeq: number;
  createdAt: string;
}

export function createGlhAuditEvent(
  input: GlhAuditEventInput,
  eventSeq: number,
  createdAt = new Date().toISOString(),
): GlhAuditEventRecord {
  if (!GLH_AUDIT_EVENT_TYPES.includes(input.eventType)) {
    throw new Error('Unsupported GLH audit event type');
  }
  if (!GLH_AUDIT_ACTOR_KINDS.includes(input.actorKind)) {
    throw new Error('Unsupported GLH audit actor kind');
  }
  if (input.actorKind === 'HUMAN' && !input.actorProfileId) {
    throw new Error('Human audit events require actorProfileId');
  }
  if (!Number.isSafeInteger(eventSeq) || eventSeq < 1) {
    throw new Error('Audit event sequence must be a positive safe integer');
  }
  if (!input.organizationId || !input.entityType || !input.entityId) {
    throw new Error('Audit event requires organization and entity identifiers');
  }

  return {
    ...input,
    actorProfileId: input.actorProfileId ?? null,
    leadId: input.leadId ?? null,
    previousState: input.previousState ?? null,
    nextState: input.nextState ?? null,
    reason: input.reason?.trim() || null,
    context: input.context ?? {},
    eventSeq,
    createdAt,
  };
}

export function isGlhAuditEventType(value: unknown): value is GlhAuditEventType {
  return typeof value === 'string'
    && (GLH_AUDIT_EVENT_TYPES as readonly string[]).includes(value);
}
