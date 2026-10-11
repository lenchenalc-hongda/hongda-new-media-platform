import type { GlhConversationMode } from './domain';

export interface GlhAiDraftCopilotState {
  available: boolean;
  customerFacingAutoSendAllowed: false;
  mode: 'COPILOT_ONLY';
  summary: string | null;
  nextAction: string | null;
}

export function buildGlhAiDraftCopilotState(input: {
  conversationMode: GlhConversationMode;
  aiAvailable: boolean;
  summary?: string | null;
  nextAction?: string | null;
}): GlhAiDraftCopilotState {
  return {
    available: input.aiAvailable,
    customerFacingAutoSendAllowed: false,
    mode: 'COPILOT_ONLY',
    summary: input.summary?.trim() || null,
    nextAction: input.nextAction?.trim() || null,
  };
}
