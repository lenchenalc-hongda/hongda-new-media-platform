import type { GlhConversationMode } from './domain';
import {
  canAssignGlhLead,
  canTakeOverGlhConversation,
  canViewGlhLead,
  type GlhAccessContext,
  type GlhLeadAccessRecord,
} from './access';

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

export const GLH_PHASE5_PERSISTENCE_RPCS = [
  'glh_take_over_conversation',
  'glh_queue_human_message',
] as const;

export type GlhInboxAction = 'TAKE_OVER' | 'TRANSFER' | 'QUEUE_HUMAN_MESSAGE';

export interface GlhInboxCapabilities {
  takeOver: boolean;
  transfer: boolean;
  humanMessage: boolean;
  aiDraftCopilot: true;
  missingAdditiveRpcs: readonly string[];
}

export interface GlhHandoffPlan {
  allowed: boolean;
  reason:
    | 'ALLOWED'
    | 'ACCESS_DENIED'
    | 'INVALID_TRANSITION'
    | 'ADDITIVE_RPC_REQUIRED';
  fromMode: GlhConversationMode;
  toMode: GlhConversationMode;
  customerFacingAutoSendAllowed: false;
  preserveOriginalMessages: true;
  preserveAiDraftCopilot: true;
}

export function getGlhInboxCapabilities(
  context: GlhAccessContext,
  lead: GlhLeadAccessRecord,
): GlhInboxCapabilities {
  return {
    takeOver: canTakeOverGlhConversation(context, lead),
    transfer: canAssignGlhLead(context, lead.organizationId),
    humanMessage: canViewGlhLead(context, lead),
    aiDraftCopilot: true,
    missingAdditiveRpcs: [],
  };
}

export function planGlhHumanTakeover(input: {
  context: GlhAccessContext;
  lead: GlhLeadAccessRecord;
  currentMode: GlhConversationMode;
  persistenceAvailable?: boolean;
}): GlhHandoffPlan {
  const allowedMode = input.currentMode === 'AI_ACTIVE'
    || input.currentMode === 'HANDOFF_PENDING';
  const canTakeOver = canTakeOverGlhConversation(input.context, input.lead);
  const reason = !canTakeOver
    ? 'ACCESS_DENIED'
    : !allowedMode
      ? 'INVALID_TRANSITION'
      : input.persistenceAvailable === false
        ? 'ADDITIVE_RPC_REQUIRED'
        : 'ALLOWED';
  return {
    allowed: reason === 'ALLOWED',
    reason,
    fromMode: input.currentMode,
    toMode: reason === 'ALLOWED' ? 'HUMAN_ACTIVE' : input.currentMode,
    customerFacingAutoSendAllowed: false,
    preserveOriginalMessages: true,
    preserveAiDraftCopilot: true,
  };
}

export function canQueueGlhHumanMessage(input: {
  context: GlhAccessContext;
  lead: GlhLeadAccessRecord;
  conversationMode: GlhConversationMode;
  persistenceAvailable?: boolean;
}): boolean {
  return canViewGlhLead(input.context, input.lead)
    && input.conversationMode === 'HUMAN_ACTIVE'
    && input.persistenceAvailable !== false;
}
