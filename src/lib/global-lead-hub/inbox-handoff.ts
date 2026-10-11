import type { GlhConversationMode } from './domain';

/**
 * Phase 5 bounded task anchor.
 *
 * This module must remain provider-independent. Real Meta/WhatsApp calls,
 * Production configuration, and Production data mutations are outside this task.
 */
export const GLH_PHASE5_CONVERSATION_FLOW = [
  'AI_ACTIVE',
  'HANDOFF_PENDING',
  'HUMAN_ACTIVE',
] as const satisfies readonly GlhConversationMode[];
