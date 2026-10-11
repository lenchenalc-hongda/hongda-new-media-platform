import type { GlhConversationMode } from './domain';

export interface GlhHumanMessageIntent {
  conversationId: string;
  leadId: string;
  expectedMode: 'HUMAN_ACTIVE';
  text: string;
  idempotencyKey: string;
  providerAction: 'NONE';
  deliveryStatus: 'QUEUED';
}

export function buildGlhHumanMessageIntent(input: {
  conversationId: string;
  leadId: string;
  conversationMode: GlhConversationMode;
  text: string;
  idempotencyKey: string;
}): GlhHumanMessageIntent | null {
  const text = input.text.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  if (
    input.conversationMode !== 'HUMAN_ACTIVE'
    || !input.conversationId
    || !input.leadId
    || !idempotencyKey
    || text.length === 0
    || text.length > 4000
  ) return null;
  return {
    conversationId: input.conversationId,
    leadId: input.leadId,
    expectedMode: 'HUMAN_ACTIVE',
    text,
    idempotencyKey,
    providerAction: 'NONE',
    deliveryStatus: 'QUEUED',
  };
}
