import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGlhAiDraftCopilotState } from '../../src/lib/global-lead-hub/ai-draft-copilot';
import {
  getGlhInboxCapabilities,
  planGlhHumanTakeover,
} from '../../src/lib/global-lead-hub/inbox-handoff';
import { buildGlhInboxView } from '../../src/lib/global-lead-hub/inbox-read-model';
import { buildGlhHumanMessageIntent } from '../../src/lib/global-lead-hub/human-messaging';
import type { GlhAccessContext } from '../../src/lib/global-lead-hub/access';
import type {
  GlhConversationRow,
  GlhLeadListItem,
  GlhLeadProfileRow,
  GlhMessageRow,
} from '../../src/lib/global-lead-hub/read-model';

const context: GlhAccessContext = {
  actorProfileId: 'sales-a',
  organizationId: 'org-a',
  role: 'SALES',
  authSource: 'supabase',
};
const leadAccess = { organizationId: 'org-a', ownerProfileId: 'sales-a' };

assert.deepEqual(
  getGlhInboxCapabilities(context, leadAccess),
  {
    takeOver: true,
    transfer: false,
    humanMessage: true,
    aiDraftCopilot: true,
    missingAdditiveRpcs: [],
  },
);

const blockedTakeover = planGlhHumanTakeover({
  context,
  lead: leadAccess,
  currentMode: 'HANDOFF_PENDING',
  persistenceAvailable: false,
});
assert.equal(blockedTakeover.allowed, false);
assert.equal(blockedTakeover.reason, 'ADDITIVE_RPC_REQUIRED');
assert.equal(blockedTakeover.customerFacingAutoSendAllowed, false);
assert.equal(blockedTakeover.preserveOriginalMessages, true);

const takeover = planGlhHumanTakeover({
  context,
  lead: leadAccess,
  currentMode: 'HANDOFF_PENDING',
  persistenceAvailable: true,
});
assert.equal(takeover.allowed, true);
assert.equal(takeover.toMode, 'HUMAN_ACTIVE');
assert.equal(takeover.customerFacingAutoSendAllowed, false);
assert.equal(takeover.preserveAiDraftCopilot, true);

assert.equal(planGlhHumanTakeover({
  context,
  lead: { organizationId: 'org-a', ownerProfileId: 'sales-b' },
  currentMode: 'AI_ACTIVE',
  persistenceAvailable: true,
}).reason, 'ACCESS_DENIED');
assert.equal(planGlhHumanTakeover({
  context,
  lead: leadAccess,
  currentMode: 'HUMAN_ACTIVE',
  persistenceAvailable: true,
}).reason, 'INVALID_TRANSITION');

assert.equal(buildGlhHumanMessageIntent({
  conversationId: 'conversation-a',
  leadId: 'lead-a',
  conversationMode: 'HANDOFF_PENDING',
  text: 'Hello',
  idempotencyKey: 'intent-0001',
}), null, 'human outbound is blocked before HUMAN_ACTIVE');
assert.deepEqual(buildGlhHumanMessageIntent({
  conversationId: 'conversation-a',
  leadId: 'lead-a',
  conversationMode: 'HUMAN_ACTIVE',
  text: '  Human reply  ',
  idempotencyKey: 'intent-0001',
}), {
  conversationId: 'conversation-a',
  leadId: 'lead-a',
  expectedMode: 'HUMAN_ACTIVE',
  text: 'Human reply',
  idempotencyKey: 'intent-0001',
  providerAction: 'NONE',
  deliveryStatus: 'QUEUED',
});

const lead: GlhLeadListItem = {
  id: 'lead-a', organizationId: 'org-a', contactId: 'contact-a', contactName: 'Buyer',
  companyName: 'Buyer Ltd', country: 'NG', ownerProfileId: 'sales-a', ownerName: 'Sales A',
  lifecycle: 'READY_FOR_HUMAN', conversationMode: 'HANDOFF_PENDING', grade: 'A', score: 85,
  completeness: 67, source: 'WHATSAPP', requirementType: 'MACHINE', adCreativeReference: null,
  nextFollowupAt: null, nextDueAt: null, dueBucket: 'NONE', version: 3,
  createdAt: '2026-10-11T00:00:00.000Z', updatedAt: '2026-10-11T00:10:00.000Z',
};
const profile: GlhLeadProfileRow = {
  lead_id: 'lead-a', org_id: 'org-a', customer_company_name: 'Buyer Ltd', country_code: 'NG',
  whatsapp: null, email: null, website: null, social_identifier: null, product: 'Bottle',
  material: null, product_media_references: [], dimensions: null, quantity: '10000',
  artwork_reference: null, printing_area: null, requirement_type: 'MACHINE',
  current_printing_process: null, pain_points: null, test_requirements: null,
  sample_availability: null, purchase_timeline: null, machine_capacity_requirements: null,
  automation_requirements: null, machine_plus_process_solution_required: null,
  extracted_facts: {}, ai_summary: 'Qualified machine inquiry',
};
const conversation: GlhConversationRow = {
  id: 'conversation-a', org_id: 'org-a', lead_id: 'lead-a', contact_id: 'contact-a',
  channel_account_id: 'channel-a', external_conversation_id: 'external-a',
  conversation_mode: 'HANDOFF_PENDING', conversation_status: 'ACTIVE',
  assigned_profile_id: 'sales-a', last_message_at: '2026-10-11T00:02:00.000Z',
  created_at: '2026-10-11T00:00:00.000Z', updated_at: '2026-10-11T00:02:00.000Z',
};
const messages: GlhMessageRow[] = [
  {
    id: 'message-2', org_id: 'org-a', conversation_id: 'conversation-a', lead_id: 'lead-a',
    direction: 'INBOUND', actor_type: 'CUSTOMER', actor_profile_id: null, message_text: 'Price?',
    media_metadata: null, provider_timestamp: '2026-10-11T00:02:00.000Z',
    delivery_status: 'RECEIVED', created_at: '2026-10-11T00:02:00.000Z',
  },
  {
    id: 'message-1', org_id: 'org-a', conversation_id: 'conversation-a', lead_id: 'lead-a',
    direction: 'INBOUND', actor_type: 'CUSTOMER', actor_profile_id: null, message_text: 'Hello',
    media_metadata: null, provider_timestamp: '2026-10-11T00:01:00.000Z',
    delivery_status: 'RECEIVED', created_at: '2026-10-11T00:01:00.000Z',
  },
  {
    id: 'cross-org', org_id: 'org-b', conversation_id: 'conversation-a', lead_id: 'lead-a',
    direction: 'INBOUND', actor_type: 'CUSTOMER', actor_profile_id: null, message_text: 'Secret',
    media_metadata: null, provider_timestamp: null, delivery_status: 'RECEIVED',
    created_at: '2026-10-11T00:03:00.000Z',
  },
];

const inbox = buildGlhInboxView({
  organizationId: 'org-a', actorProfileId: 'sales-a', leads: [lead], profiles: [profile],
  conversations: [conversation], messages, tasks: [], followups: [], aiAvailable: false,
});
assert.equal(inbox.originalMessagesAuthoritative, true);
assert.equal(inbox.aiAvailable, false);
assert.equal(inbox.conversations[0].originalMessages.length, 2, 'cross-org message is removed');
assert.deepEqual(inbox.conversations[0].originalMessages.map(row => row.id), ['message-1', 'message-2']);
assert.equal(inbox.conversations[0].lastMessagePreview, 'Price?');
assert.equal(inbox.conversations[0].isMine, true);
assert.deepEqual(inbox.conversations[0].missingFields, ['Product image', 'Material']);
assert.equal(inbox.queues.find(queue => queue.id === 'WAITING_HUMAN')?.count, 1);

const aiDown = buildGlhAiDraftCopilotState({
  conversationMode: 'HUMAN_ACTIVE', aiAvailable: false, summary: 'cached summary',
});
assert.equal(aiDown.available, false);
assert.equal(aiDown.customerFacingAutoSendAllowed, false);
assert.equal(aiDown.mode, 'COPILOT_ONLY');

const humanAdapter = readFileSync('src/lib/global-lead-hub/human-messaging.ts', 'utf8');
const actionsRoute = readFileSync('src/app/api/global-lead-hub/inbox/actions/route.ts', 'utf8');
const inboxServer = readFileSync('src/lib/global-lead-hub/server.ts', 'utf8');
const component = readFileSync('src/components/global-lead-hub/UnifiedInbox.tsx', 'utf8');
assert(!humanAdapter.includes('fetch('), 'human adapter makes no provider call');
assert(humanAdapter.includes("providerAction: 'NONE'"));
assert(actionsRoute.includes('resolveGlhAccessContext'));
assert(actionsRoute.includes('GlhMutationError'));
assert(!actionsRoute.includes('graph.facebook.com'));
assert(!actionsRoute.includes('api.whatsapp.com'));
assert(inboxServer.includes(".eq('org_id', context.organizationId)"));
assert(component.includes("action: 'TAKE_OVER'"));
assert(component.includes('Queue human reply'));
assert(component.includes('AI unavailable'));
assert(!component.includes('localStorage'));

console.log('Global Lead Hub Phase 5 inbox + handoff tests passed');
