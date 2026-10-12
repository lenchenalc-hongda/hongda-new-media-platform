import {
  canManageGlhOrganization,
  canViewAllGlhLeads,
  canViewGlhLead,
  type GlhAccessContext,
  type GlhLeadAccessRecord,
} from './access';
import {
  detectGlhForbiddenClaims,
  qualifyGlhLead,
  type GlhQualificationInput,
} from './ai-qualification';
import { buildGlhAiDraftCopilotState } from './ai-draft-copilot';
import {
  GLH_PROVIDER_CALLS_ENABLED,
  type GlhOutboundMessageResult,
} from './channels';
import { buildGlhHumanMessageIntent } from './human-messaging';
import {
  getGlhInboxCapabilities,
  planGlhHumanTakeover,
} from './inbox-handoff';
import {
  parseGlhWhatsAppInbound,
  type GlhWhatsAppInboundMessage,
} from './whatsapp-inbound';

export const GLH_PHASE8_EVIDENCE_IDS = [
  'RLS_SALES_ISOLATION',
  'MANAGER_ADMIN_ORGANIZATION_SCOPE',
  'WEBHOOK_REPLAY_IDEMPOTENCY',
  'HUMAN_TAKEOVER_STOPS_AUTOSEND',
  'AI_PROVIDER_OUTAGE_FALLBACK',
  'DESKTOP_1366X768_USABILITY',
  'ACCEPTANCE_CASES_A_TO_G',
  'NO_BROWSER_OR_LOG_SECRET_EXPOSURE',
  'HUMAN_WORK_REMAINS_AVAILABLE_WITHOUT_AI',
] as const;

export type GlhPhase8EvidenceId = (typeof GLH_PHASE8_EVIDENCE_IDS)[number];
export type GlhPhase8EvidenceStatus = 'PASS' | 'FAIL';
export type GlhPhase8EvidenceValue =
  | string
  | number
  | boolean
  | null
  | readonly string[];

export const GLH_PHASE8_NON_PRODUCTION_PILOT_SCOPE = Object.freeze({
  phase: 'Phase 8 - Non-Production Pilot',
  environment: 'NON_PRODUCTION',
  data: 'SYNTHETIC_OR_EXPLICITLY_APPROVED_TEST_CONTACTS',
  productionAccess: false,
  realProviderCutover: false,
  requiredEvidence: GLH_PHASE8_EVIDENCE_IDS,
});

export interface GlhPhase8EvidenceCheck {
  id: GlhPhase8EvidenceId;
  status: GlhPhase8EvidenceStatus;
  summary: string;
  facts: Readonly<Record<string, GlhPhase8EvidenceValue>>;
  failures: readonly string[];
}

export interface GlhPhase8PilotEvidence {
  harness: 'GLH_PHASE8_NON_PRODUCTION_PILOT';
  mode: 'REPOSITORY_ONLY_SYNTHETIC';
  environment: 'NON_PRODUCTION';
  productionAccess: false;
  realProviderCalls: false;
  overallStatus: GlhPhase8EvidenceStatus;
  passed: number;
  failed: number;
  checks: readonly GlhPhase8EvidenceCheck[];
}

export interface GlhPhase8IsolationFixture {
  salesAContext: GlhAccessContext;
  ownLead: GlhLeadAccessRecord;
  salesBRestrictedLead: GlhLeadAccessRecord;
  managerContext: GlhAccessContext;
  adminContext: GlhAccessContext;
  foreignManagerContext: GlhAccessContext;
  foreignAdminContext: GlhAccessContext;
  foreignLead: GlhLeadAccessRecord;
  rlsPolicyUsesTrustedProfileMembership: boolean;
  rlsPolicyRequiresSameOrganization: boolean;
  salesCanAccessOwnedOrAssignedOnly: boolean;
}

export interface GlhPhase8WebhookReplayFixture {
  firstPayload: unknown;
  replayPayload: unknown;
  contract: {
    externalEventUnique: boolean;
    duplicateReturnsBeforeLogicalWrites: boolean;
    messageProviderEventUnique: boolean;
    autoReplyKeyIncludesTrigger: boolean;
  };
}

export interface GlhPhase8TakeoverFixture {
  context: GlhAccessContext;
  lead: GlhLeadAccessRecord;
  currentMode: 'AI_ACTIVE' | 'HANDOFF_PENDING';
  persistenceAvailable: boolean;
  pendingAiSendStatusBefore: string;
  pendingAiSendStatusAfter: string;
  customerFacingSendAttemptsAfterTakeover: number;
  originalMessageCountBefore: number;
  originalMessageCountAfter: number;
  pendingAiBlockedBeforeAudit: boolean;
  humanMessage: {
    conversationId: string;
    leadId: string;
    text: string;
    idempotencyKey: string;
  };
}

export interface GlhPhase8OutageFixture {
  conversationModeAfter: 'HANDOFF_PENDING';
  aiAvailable: false;
  providerResult: GlhOutboundMessageResult;
  providerFailureRecorded: boolean;
  inboundMessageCountBefore: number;
  inboundMessageCountAfter: number;
  humanHandoffCreated: boolean;
}

export interface GlhPhase8AcceptanceFixture {
  price: {
    persisted: boolean;
    autoReplyText: string;
    qualification: GlhQualificationInput;
  };
  machine: {
    persisted: boolean;
    humanHandoffCreated: boolean;
    responseDueMinutes: number;
    qualification: GlhQualificationInput;
  };
  processing: {
    persisted: boolean;
    sampleNeedCaptured: boolean;
    qualification: GlhQualificationInput;
  };
}

export interface GlhPhase8DesktopRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GlhPhase8DesktopFixture {
  viewportWidth: number;
  viewportHeight: number;
  documentScrollWidth: number;
  documentScrollHeight: number;
  minimumConversationHeight: number;
  requiredRegions: readonly GlhPhase8DesktopRegion[];
  overlapCount: number;
  sourceContract: {
    threeColumnLayout: boolean;
    minimumConversationHeight: boolean;
    horizontalContainment: boolean;
    requiredControls: boolean;
  };
}

export interface GlhPhase8SecretSurface {
  kind: 'BROWSER' | 'LOG';
  name: string;
  content: string;
}

export interface GlhPhase8SecretExposureFixture {
  canaries: readonly string[];
  surfaces: readonly GlhPhase8SecretSurface[];
  serverOnlySecretsInBrowser: boolean;
  rawPayloadsInLogs: boolean;
}

export interface GlhPhase8HumanWorkFixture {
  context: GlhAccessContext;
  lead: GlhLeadAccessRecord;
  conversationMode: 'HUMAN_ACTIVE';
  aiAvailable: false;
  originalMessageCount: number;
  taskWorkAvailable: boolean;
  followupWorkAvailable: boolean;
  humanMessage: {
    conversationId: string;
    leadId: string;
    text: string;
    idempotencyKey: string;
  };
}

export interface GlhPhase8TransferFixture {
  historyRowsBefore: number;
  historyRowsAfter: number;
  previousAssignmentStatusAfterTransfer: string;
  newAssignmentStatusAfterTransfer: string;
  previousActorPreserved: boolean;
  auditEventRecorded: boolean;
  originalMessages: readonly { id: string; text: string }[];
  messagesAfterTransfer: readonly { id: string; text: string }[];
}

export interface GlhPhase8PilotFixture {
  isolation: GlhPhase8IsolationFixture;
  webhookReplay: GlhPhase8WebhookReplayFixture;
  takeover: GlhPhase8TakeoverFixture;
  outage: GlhPhase8OutageFixture;
  acceptance: GlhPhase8AcceptanceFixture;
  desktop: GlhPhase8DesktopFixture;
  secretExposure: GlhPhase8SecretExposureFixture;
  humanWork: GlhPhase8HumanWorkFixture;
  transfer: GlhPhase8TransferFixture;
}

interface GlhSyntheticInboundLedger {
  webhookEventKeys: Set<string>;
  messageKeys: Set<string>;
  leadKeys: Set<string>;
  autoReplyKeys: Set<string>;
}

interface GlhPhase8InternalEvidence {
  status: GlhPhase8EvidenceStatus;
  facts: Readonly<Record<string, GlhPhase8EvidenceValue>>;
  failures: readonly string[];
}

function makeCheck(
  id: GlhPhase8EvidenceId,
  summary: string,
  facts: Record<string, GlhPhase8EvidenceValue>,
  failures: readonly string[],
): GlhPhase8EvidenceCheck {
  return {
    id,
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    summary,
    facts,
    failures,
  };
}

function evaluateIsolation(
  fixture: GlhPhase8IsolationFixture,
): GlhPhase8EvidenceCheck {
  const ownLeadVisible = canViewGlhLead(fixture.salesAContext, fixture.ownLead);
  const salesBRestrictedLeadVisible = canViewGlhLead(
    fixture.salesAContext,
    fixture.salesBRestrictedLead,
  );
  const foreignLeadVisible = canViewGlhLead(fixture.salesAContext, fixture.foreignLead);
  const salesCanViewAll = canViewAllGlhLeads(fixture.salesAContext);
  const failures: string[] = [];

  if (!ownLeadVisible) failures.push('Sales A cannot view an owned lead.');
  if (salesBRestrictedLeadVisible) {
    failures.push('Sales A can view a restricted Sales B lead in the same organization.');
  }
  if (foreignLeadVisible) failures.push('Sales A can view a cross-organization lead.');
  if (salesCanViewAll) failures.push('Sales A is incorrectly treated as an organization-wide viewer.');
  if (!fixture.rlsPolicyUsesTrustedProfileMembership) {
    failures.push('RLS policy does not use trusted profile membership.');
  }
  if (!fixture.rlsPolicyRequiresSameOrganization) {
    failures.push('RLS policy does not require the same organization.');
  }
  if (!fixture.salesCanAccessOwnedOrAssignedOnly) {
    failures.push('Sales access is not restricted to owned or assigned leads.');
  }

  return makeCheck(
    'RLS_SALES_ISOLATION',
    'Synthetic Sales A fixtures are denied a restricted Sales B lead while owned access remains available.',
    {
      salesAOwnLeadVisible: ownLeadVisible,
      salesARestrictedSalesBLeadVisible: salesBRestrictedLeadVisible,
      salesAForeignLeadVisible: foreignLeadVisible,
      salesAOrganizationWideViewer: salesCanViewAll,
      trustedMembershipPolicy: fixture.rlsPolicyUsesTrustedProfileMembership,
      sameOrganizationRequired: fixture.rlsPolicyRequiresSameOrganization,
      ownedOrAssignedOnly: fixture.salesCanAccessOwnedOrAssignedOnly,
    },
    failures,
  );
}

function evaluateManagerAdminScope(
  fixture: GlhPhase8IsolationFixture,
): GlhPhase8EvidenceCheck {
  const managerCanViewAll = canViewAllGlhLeads(fixture.managerContext);
  const adminCanViewAll = canViewAllGlhLeads(fixture.adminContext);
  const managerCanViewLead = canViewGlhLead(fixture.managerContext, fixture.ownLead);
  const adminCanViewLead = canViewGlhLead(fixture.adminContext, fixture.ownLead);
  const foreignManagerCanViewLead = canViewGlhLead(
    fixture.foreignManagerContext,
    fixture.ownLead,
  );
  const foreignAdminCanViewLead = canViewGlhLead(
    fixture.foreignAdminContext,
    fixture.ownLead,
  );
  const managerCanManageOwnOrganization = canManageGlhOrganization(
    fixture.managerContext,
    fixture.managerContext.organizationId,
  );
  const adminCanManageOwnOrganization = canManageGlhOrganization(
    fixture.adminContext,
    fixture.adminContext.organizationId,
  );
  const managerCanManageForeignOrganization = canManageGlhOrganization(
    fixture.managerContext,
    fixture.foreignManagerContext.organizationId,
  );
  const adminCanManageForeignOrganization = canManageGlhOrganization(
    fixture.adminContext,
    fixture.foreignAdminContext.organizationId,
  );
  const salesCanManageOwnOrganization = canManageGlhOrganization(
    fixture.salesAContext,
    fixture.salesAContext.organizationId,
  );
  const failures: string[] = [];

  if (!managerCanViewAll || !adminCanViewAll) {
    failures.push('Manager or Admin is not recognized as an organization-scoped viewer.');
  }
  if (!managerCanViewLead || !adminCanViewLead) {
    failures.push('Manager or Admin cannot view a lead in the same organization.');
  }
  if (foreignManagerCanViewLead || foreignAdminCanViewLead) {
    failures.push('Manager or Admin can view a lead outside their organization.');
  }
  if (!managerCanManageOwnOrganization || !adminCanManageOwnOrganization) {
    failures.push('Manager or Admin cannot manage their own organization.');
  }
  if (managerCanManageForeignOrganization || adminCanManageForeignOrganization) {
    failures.push('Manager or Admin can manage another organization.');
  }
  if (salesCanManageOwnOrganization) {
    failures.push('Sales is incorrectly allowed to manage organization settings.');
  }

  return makeCheck(
    'MANAGER_ADMIN_ORGANIZATION_SCOPE',
    'Synthetic Manager and Admin access stays inside the explicitly bound organization.',
    {
      managerOrganizationWideViewer: managerCanViewAll,
      adminOrganizationWideViewer: adminCanViewAll,
      managerSameOrganizationLeadVisible: managerCanViewLead,
      adminSameOrganizationLeadVisible: adminCanViewLead,
      foreignManagerLeadVisible: foreignManagerCanViewLead,
      foreignAdminLeadVisible: foreignAdminCanViewLead,
      managerCanManageOwnOrganization,
      adminCanManageOwnOrganization,
      managerCanManageForeignOrganization,
      adminCanManageForeignOrganization,
      salesCanManageOrganization: salesCanManageOwnOrganization,
    },
    failures,
  );
}

function createInboundLedger(): GlhSyntheticInboundLedger {
  return {
    webhookEventKeys: new Set<string>(),
    messageKeys: new Set<string>(),
    leadKeys: new Set<string>(),
    autoReplyKeys: new Set<string>(),
  };
}

function applySyntheticInbound(
  messages: readonly GlhWhatsAppInboundMessage[],
  ledger: GlhSyntheticInboundLedger,
): number {
  let acceptedEventCount = 0;
  for (const message of messages) {
    const eventKey = `${message.provider}:${message.externalEventId}`;
    if (ledger.webhookEventKeys.has(eventKey)) continue;

    ledger.webhookEventKeys.add(eventKey);
    ledger.messageKeys.add(eventKey);
    ledger.leadKeys.add(
      `${message.provider}:${message.providerAccountId}:${message.externalContactId}`,
    );
    ledger.autoReplyKeys.add(
      `${message.externalConversationId}:${message.externalEventId}:AI_SEND:v1`,
    );
    acceptedEventCount++;
  }
  return acceptedEventCount;
}

function evaluateWebhookReplay(
  fixture: GlhPhase8WebhookReplayFixture,
): GlhPhase8EvidenceCheck {
  const firstParsed = parseGlhWhatsAppInbound(fixture.firstPayload);
  const replayParsed = parseGlhWhatsAppInbound(fixture.replayPayload);
  if (firstParsed.kind !== 'accepted' || replayParsed.kind !== 'accepted') {
    return makeCheck(
      'WEBHOOK_REPLAY_IDEMPOTENCY',
      'Synthetic webhook replay requires two accepted provider payloads.',
      {
        firstParseKind: firstParsed.kind,
        replayParseKind: replayParsed.kind,
        externalEventUnique: fixture.contract.externalEventUnique,
      },
      ['Synthetic webhook replay does not contain two valid inbound payloads.'],
    );
  }

  const firstEventIds = firstParsed.messages.map(message => message.externalEventId);
  const replayEventIds = replayParsed.messages.map(message => message.externalEventId);
  const sameEventIds = firstEventIds.length === replayEventIds.length
    && firstEventIds.every((eventId, index) => eventId === replayEventIds[index]);
  const ledger = createInboundLedger();
  const firstAcceptedCount = applySyntheticInbound(firstParsed.messages, ledger);
  const replayAcceptedCount = applySyntheticInbound(replayParsed.messages, ledger);
  const failures: string[] = [];

  if (!sameEventIds) failures.push('Replay fixture does not repeat the same provider event ids.');
  if (firstAcceptedCount !== firstEventIds.length) {
    failures.push('First synthetic delivery did not persist every webhook event.');
  }
  if (replayAcceptedCount !== 0) failures.push('Synthetic replay created a second logical event.');
  if (ledger.messageKeys.size !== 1) failures.push('Replay created a duplicate logical message.');
  if (ledger.leadKeys.size !== 1) failures.push('Replay created a duplicate logical lead.');
  if (ledger.autoReplyKeys.size !== 1) failures.push('Replay created a duplicate AI auto-reply.');
  if (!fixture.contract.externalEventUnique) {
    failures.push('Repository contract lacks provider plus external event uniqueness.');
  }
  if (!fixture.contract.duplicateReturnsBeforeLogicalWrites) {
    failures.push('Repository contract does not return duplicate events before logical writes.');
  }
  if (!fixture.contract.messageProviderEventUnique) {
    failures.push('Repository contract lacks message provider-event uniqueness.');
  }
  if (!fixture.contract.autoReplyKeyIncludesTrigger) {
    failures.push('Repository contract lacks AI reply trigger-based idempotency.');
  }

  return makeCheck(
    'WEBHOOK_REPLAY_IDEMPOTENCY',
    'Replaying one synthetic webhook leaves one event, message, lead, and AI auto-reply.',
    {
      firstAcceptedEventCount: firstAcceptedCount,
      replayAcceptedEventCount: replayAcceptedCount,
      webhookEventCount: ledger.webhookEventKeys.size,
      logicalMessageCount: ledger.messageKeys.size,
      logicalLeadCount: ledger.leadKeys.size,
      aiAutoReplyCount: ledger.autoReplyKeys.size,
      externalEventUnique: fixture.contract.externalEventUnique,
      duplicateReturnsBeforeLogicalWrites:
        fixture.contract.duplicateReturnsBeforeLogicalWrites,
      messageProviderEventUnique: fixture.contract.messageProviderEventUnique,
      autoReplyKeyIncludesTrigger: fixture.contract.autoReplyKeyIncludesTrigger,
    },
    failures,
  );
}

function evaluateTakeover(
  fixture: GlhPhase8TakeoverFixture,
): GlhPhase8EvidenceCheck {
  const plan = planGlhHumanTakeover({
    context: fixture.context,
    lead: fixture.lead,
    currentMode: fixture.currentMode,
    persistenceAvailable: fixture.persistenceAvailable,
  });
  const copilot = buildGlhAiDraftCopilotState({
    conversationMode: plan.toMode,
    aiAvailable: true,
  });
  const humanIntent = buildGlhHumanMessageIntent({
    ...fixture.humanMessage,
    conversationMode: 'HUMAN_ACTIVE',
  });
  const failures: string[] = [];

  if (!plan.allowed || plan.toMode !== 'HUMAN_ACTIVE') {
    failures.push('Synthetic takeover did not transition to HUMAN_ACTIVE.');
  }
  if (plan.customerFacingAutoSendAllowed !== false) {
    failures.push('Takeover plan allows customer-facing automatic sends.');
  }
  if (!plan.preserveAiDraftCopilot || copilot.mode !== 'COPILOT_ONLY') {
    failures.push('Takeover does not preserve the AI draft copilot.');
  }
  if (fixture.pendingAiSendStatusBefore !== 'PENDING') {
    failures.push('Fixture does not start with a pending customer-facing AI send.');
  }
  if (fixture.pendingAiSendStatusAfter !== 'BLOCKED') {
    failures.push('Takeover did not block the pending customer-facing AI send.');
  }
  if (fixture.customerFacingSendAttemptsAfterTakeover !== 0) {
    failures.push('A customer-facing automatic send occurred after takeover.');
  }
  if (
    fixture.originalMessageCountBefore !== fixture.originalMessageCountAfter
    || fixture.originalMessageCountAfter < 1
  ) {
    failures.push('Takeover did not preserve original conversation messages.');
  }
  if (!fixture.pendingAiBlockedBeforeAudit) {
    failures.push('Pending AI sends are not blocked before takeover audit completion.');
  }
  if (!humanIntent || humanIntent.providerAction !== 'NONE') {
    failures.push('Human work did not continue through a provider-independent queued intent.');
  }

  return makeCheck(
    'HUMAN_TAKEOVER_STOPS_AUTOSEND',
    'Takeover selects HUMAN_ACTIVE, blocks pending AI sends, and preserves human-only drafting.',
    {
      planAllowed: plan.allowed,
      modeAfterTakeover: plan.toMode,
      customerFacingAutoSendAllowed: plan.customerFacingAutoSendAllowed,
      aiDraftCopilotPreserved: plan.preserveAiDraftCopilot,
      pendingAiSendStatusBefore: fixture.pendingAiSendStatusBefore,
      pendingAiSendStatusAfter: fixture.pendingAiSendStatusAfter,
      customerFacingSendAttemptsAfterTakeover:
        fixture.customerFacingSendAttemptsAfterTakeover,
      originalMessagesPreserved:
        fixture.originalMessageCountBefore === fixture.originalMessageCountAfter,
      humanMessageQueued: humanIntent !== null,
    },
    failures,
  );
}

function evaluateOutage(
  fixture: GlhPhase8OutageFixture,
): GlhPhase8EvidenceCheck {
  const copilot = buildGlhAiDraftCopilotState({
    conversationMode: fixture.conversationModeAfter,
    aiAvailable: fixture.aiAvailable,
  });
  const providerDisabled = fixture.providerResult.ok === false
    && fixture.providerResult.status === 'PROVIDER_CALLS_DISABLED';
  const failures: string[] = [];

  if (fixture.aiAvailable !== false || copilot.available !== false) {
    failures.push('Synthetic AI outage did not remain unavailable.');
  }
  if (copilot.customerFacingAutoSendAllowed !== false) {
    failures.push('AI outage allows customer-facing automatic sends.');
  }
  if (!providerDisabled || GLH_PROVIDER_CALLS_ENABLED) {
    failures.push('Provider adapter does not fail closed while cutover is disabled.');
  }
  if (!fixture.providerFailureRecorded) {
    failures.push('Provider failure was not recorded for retry or manual action.');
  }
  if (
    fixture.inboundMessageCountBefore !== fixture.inboundMessageCountAfter
    || fixture.inboundMessageCountAfter < 1
  ) {
    failures.push('AI outage did not preserve the inbound message.');
  }
  if (!fixture.humanHandoffCreated) {
    failures.push('AI outage did not create a human task or handoff.');
  }

  return makeCheck(
    'AI_PROVIDER_OUTAGE_FALLBACK',
    'An AI/provider outage preserves inbound work, disables auto-send, and creates human follow-up.',
    {
      aiAvailable: fixture.aiAvailable,
      conversationModeAfter: fixture.conversationModeAfter,
      copilotOnly: copilot.mode === 'COPILOT_ONLY',
      customerFacingAutoSendAllowed: copilot.customerFacingAutoSendAllowed,
      providerCallsEnabled: GLH_PROVIDER_CALLS_ENABLED,
      providerResultStatus: fixture.providerResult.status,
      providerFailureRecorded: fixture.providerFailureRecorded,
      inboundMessagesPreserved:
        fixture.inboundMessageCountBefore === fixture.inboundMessageCountAfter,
      humanHandoffCreated: fixture.humanHandoffCreated,
    },
    failures,
  );
}

function evaluateDesktopUsability(
  fixture: GlhPhase8DesktopFixture,
): GlhPhase8EvidenceCheck {
  const requiredRegionNames = [
    'queues',
    'conversation',
    'customer-card',
    'takeover',
    'compose',
  ];
  const regionNames = fixture.requiredRegions.map(region => region.name);
  const missingRegions = requiredRegionNames.filter(name => !regionNames.includes(name));
  const offscreenRegions = fixture.requiredRegions
    .filter(region =>
      region.x < 0
      || region.y < 0
      || region.width <= 0
      || region.height <= 0
      || region.x + region.width > fixture.viewportWidth
      || region.y + region.height > fixture.viewportHeight)
    .map(region => region.name);
  const failures: string[] = [];

  if (fixture.viewportWidth !== 1366 || fixture.viewportHeight !== 768) {
    failures.push('Synthetic desktop fixture does not use the required 1366x768 viewport.');
  }
  if (fixture.documentScrollWidth > fixture.viewportWidth) {
    failures.push('Synthetic desktop layout causes horizontal overflow.');
  }
  if (missingRegions.length > 0) {
    failures.push(`Required desktop regions are missing: ${missingRegions.join(', ')}.`);
  }
  if (offscreenRegions.length > 0) {
    failures.push(`Required desktop regions are offscreen: ${offscreenRegions.join(', ')}.`);
  }
  if (fixture.overlapCount !== 0) {
    failures.push('Required desktop regions overlap in the synthetic layout.');
  }
  if (
    fixture.minimumConversationHeight < 1
    || fixture.minimumConversationHeight > fixture.viewportHeight
  ) {
    failures.push('Conversation area does not fit within the 1366x768 viewport.');
  }
  if (!fixture.sourceContract.threeColumnLayout) {
    failures.push('Repository layout does not define the desktop three-column grid.');
  }
  if (!fixture.sourceContract.minimumConversationHeight) {
    failures.push('Repository layout does not define the minimum conversation height.');
  }
  if (!fixture.sourceContract.horizontalContainment) {
    failures.push('Repository layout does not contain horizontal overflow at the page surface.');
  }
  if (!fixture.sourceContract.requiredControls) {
    failures.push('Repository layout is missing a required desktop workflow control.');
  }

  return makeCheck(
    'DESKTOP_1366X768_USABILITY',
    'Synthetic 1366x768 measurements keep all required GLH regions visible without horizontal overflow.',
    {
      viewport: `${fixture.viewportWidth}x${fixture.viewportHeight}`,
      documentWidth: fixture.documentScrollWidth,
      documentHeight: fixture.documentScrollHeight,
      minimumConversationHeight: fixture.minimumConversationHeight,
      requiredRegions: requiredRegionNames,
      missingRegions,
      offscreenRegions,
      overlapCount: fixture.overlapCount,
      horizontalOverflow: fixture.documentScrollWidth > fixture.viewportWidth,
      threeColumnLayout: fixture.sourceContract.threeColumnLayout,
      minimumConversationHeightContract:
        fixture.sourceContract.minimumConversationHeight,
      horizontalContainment: fixture.sourceContract.horizontalContainment,
      requiredControls: fixture.sourceContract.requiredControls,
    },
    failures,
  );
}

function hasInventedPrice(text: string): boolean {
  return /(?:USD|US\$|\$|EUR|€|GBP|£|RMB|CNY|¥)\s*\d/i.test(text)
    || /\b\d+(?:\.\d+)?\s*(?:USD|US\$|EUR|€|GBP|£|RMB|CNY|¥)\b/i.test(text)
    || /\b(?:price|quote|quotation)\b[^.\n]{0,30}\b\d+(?:\.\d+)?\b/i.test(text)
    || /\b\d+(?:\.\d+)?\b[^.\n]{0,30}\b(?:price|quote|quotation)\b/i.test(text);
}

function evaluateAcceptanceCases(
  fixture: GlhPhase8AcceptanceFixture,
  evidence: {
    takeover: GlhPhase8EvidenceCheck;
    webhookReplay: GlhPhase8EvidenceCheck;
    salesIsolation: GlhPhase8EvidenceCheck;
    managerAdminScope: GlhPhase8EvidenceCheck;
    transfer: GlhPhase8InternalEvidence;
  },
): GlhPhase8EvidenceCheck {
  const price = qualifyGlhLead(fixture.price.qualification);
  const machine = qualifyGlhLead(fixture.machine.qualification);
  const processing = qualifyGlhLead(fixture.processing.qualification);
  const priceQuestionFields = price.questions.map(question => question.field);
  const machineQuestionFields = machine.questions.map(question => question.field);
  const processingQuestionFields = processing.questions.map(question => question.field);
  const priceForbiddenClaims = detectGlhForbiddenClaims({
    text: fixture.price.autoReplyText,
  });
  const machineFields = new Set([
    'dimensions',
    'targetCapacity',
    'currentProcess',
    'automationLevel',
    'fullSolutionRequired',
  ]);

  const caseA = fixture.price.persisted
    && price.handoffTriggers.includes('QUOTATION_OR_PRICE_DECISION')
    && !price.customerFacingAutoSendAllowed
    && priceForbiddenClaims.length === 0
    && !hasInventedPrice(fixture.price.autoReplyText)
    && priceQuestionFields.includes('product')
    && priceQuestionFields.includes('material')
    && priceQuestionFields.includes('quantity');
  const caseB = fixture.machine.persisted
    && machine.profile.requirementType === 'MACHINE'
    && machine.handoffTriggers.includes('MACHINE_INQUIRY')
    && machine.nextConversationMode === 'HANDOFF_PENDING'
    && machineQuestionFields.some(field => machineFields.has(field))
    && fixture.machine.humanHandoffCreated
    && fixture.machine.responseDueMinutes <= 5;
  const caseC = fixture.processing.persisted
    && processing.profile.requirementType === 'PROCESSING'
    && processingQuestionFields.includes('testRequirements')
    && fixture.processing.sampleNeedCaptured;
  const caseD = evidence.takeover.status === 'PASS';
  const caseE = evidence.webhookReplay.status === 'PASS';
  const caseF = evidence.salesIsolation.status === 'PASS'
    && evidence.managerAdminScope.status === 'PASS';
  const caseG = evidence.transfer.status === 'PASS';
  const caseStatuses = {
    A: caseA ? 'PASS' : 'FAIL',
    B: caseB ? 'PASS' : 'FAIL',
    C: caseC ? 'PASS' : 'FAIL',
    D: caseD ? 'PASS' : 'FAIL',
    E: caseE ? 'PASS' : 'FAIL',
    F: caseF ? 'PASS' : 'FAIL',
    G: caseG ? 'PASS' : 'FAIL',
  } as const;
  const failures = Object.entries(caseStatuses)
    .filter(([, status]) => status === 'FAIL')
    .map(([caseId]) => `Acceptance case ${caseId} failed.`);

  return makeCheck(
    'ACCEPTANCE_CASES_A_TO_G',
    'Synthetic acceptance cases A-G pass against repository qualification, access, replay, and handoff contracts.',
    {
      caseA: caseStatuses.A,
      caseB: caseStatuses.B,
      caseC: caseStatuses.C,
      caseD: caseStatuses.D,
      caseE: caseStatuses.E,
      caseF: caseStatuses.F,
      caseG: caseStatuses.G,
      priceQuestionFields: [...priceQuestionFields],
      machineQuestionFields: [...machineQuestionFields],
      processingQuestionFields: [...processingQuestionFields],
      priceForbiddenClaims: [...priceForbiddenClaims],
      machineHandoffCreated: fixture.machine.humanHandoffCreated,
      machineResponseDueMinutes: fixture.machine.responseDueMinutes,
      processingSampleNeedCaptured: fixture.processing.sampleNeedCaptured,
    },
    failures,
  );
}

function evaluateSecretExposure(
  fixture: GlhPhase8SecretExposureFixture,
): GlhPhase8EvidenceCheck {
  const hits: string[] = [];
  for (const surface of fixture.surfaces) {
    for (const canary of fixture.canaries) {
      if (canary && surface.content.includes(canary)) {
        hits.push(`${surface.kind}:${surface.name}:${canary}`);
      }
    }
  }
  const failures: string[] = [];

  if (fixture.canaries.length === 0) failures.push('No synthetic secret canaries were supplied.');
  if (!fixture.surfaces.some(surface => surface.kind === 'BROWSER')) {
    failures.push('No synthetic browser surface was scanned.');
  }
  if (!fixture.surfaces.some(surface => surface.kind === 'LOG')) {
    failures.push('No synthetic log surface was scanned.');
  }
  if (hits.length > 0) failures.push('A synthetic secret canary appeared in browser or log output.');
  if (fixture.serverOnlySecretsInBrowser) {
    failures.push('A server-only secret is present in browser code or output.');
  }
  if (fixture.rawPayloadsInLogs) {
    failures.push('Raw provider payloads or secrets are present in logs.');
  }

  return makeCheck(
    'NO_BROWSER_OR_LOG_SECRET_EXPOSURE',
    'Synthetic browser and log surfaces contain none of the supplied secret canaries.',
    {
      canaryCount: fixture.canaries.length,
      scannedSurfaceCount: fixture.surfaces.length,
      secretHitCount: hits.length,
      serverOnlySecretsInBrowser: fixture.serverOnlySecretsInBrowser,
      rawPayloadsInLogs: fixture.rawPayloadsInLogs,
    },
    failures,
  );
}

function evaluateHumanWorkWithoutAi(
  fixture: GlhPhase8HumanWorkFixture,
): GlhPhase8EvidenceCheck {
  const capabilities = getGlhInboxCapabilities(fixture.context, fixture.lead);
  const humanIntent = buildGlhHumanMessageIntent({
    ...fixture.humanMessage,
    conversationMode: fixture.conversationMode,
  });
  const failures: string[] = [];

  if (fixture.aiAvailable !== false) failures.push('Human-work fixture does not simulate AI downtime.');
  if (fixture.originalMessageCount < 1) {
    failures.push('Original conversation messages are unavailable during AI downtime.');
  }
  if (!capabilities.humanMessage || !humanIntent || humanIntent.providerAction !== 'NONE') {
    failures.push('Human message work is unavailable without AI.');
  }
  if (!fixture.taskWorkAvailable) failures.push('Task work is unavailable without AI.');
  if (!fixture.followupWorkAvailable) failures.push('Follow-up work is unavailable without AI.');

  return makeCheck(
    'HUMAN_WORK_REMAINS_AVAILABLE_WITHOUT_AI',
    'Original messages, human replies, tasks, and follow-ups remain available while AI is down.',
    {
      aiAvailable: fixture.aiAvailable,
      originalMessageCount: fixture.originalMessageCount,
      humanMessageAvailable: capabilities.humanMessage,
      humanIntentQueued: humanIntent !== null,
      providerAction: humanIntent?.providerAction ?? 'BLOCKED',
      taskWorkAvailable: fixture.taskWorkAvailable,
      followupWorkAvailable: fixture.followupWorkAvailable,
    },
    failures,
  );
}

function evaluateTransfer(
  fixture: GlhPhase8TransferFixture,
): GlhPhase8InternalEvidence {
  const messagesPreserved = fixture.originalMessages.length
    === fixture.messagesAfterTransfer.length
    && fixture.originalMessages.every((message, index) => {
      const after = fixture.messagesAfterTransfer[index];
      return after?.id === message.id && after.text === message.text;
    });
  const historyPreserved = fixture.historyRowsBefore + 1 === fixture.historyRowsAfter
    && fixture.previousAssignmentStatusAfterTransfer === 'ENDED'
    && fixture.newAssignmentStatusAfterTransfer === 'ACTIVE';
  const failures: string[] = [];

  if (!messagesPreserved) failures.push('Transfer changed or removed original messages.');
  if (!historyPreserved) failures.push('Transfer did not preserve append-only assignment history.');
  if (!fixture.previousActorPreserved) failures.push('Transfer did not preserve the prior actor.');
  if (!fixture.auditEventRecorded) failures.push('Transfer did not record an audit event.');

  return {
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
    facts: {
      messagesPreserved,
      historyRowsBefore: fixture.historyRowsBefore,
      historyRowsAfter: fixture.historyRowsAfter,
      previousAssignmentStatusAfterTransfer:
        fixture.previousAssignmentStatusAfterTransfer,
      newAssignmentStatusAfterTransfer: fixture.newAssignmentStatusAfterTransfer,
      previousActorPreserved: fixture.previousActorPreserved,
      auditEventRecorded: fixture.auditEventRecorded,
    },
  };
}

export function runGlhPhase8NonProductionPilotVerification(
  fixture: GlhPhase8PilotFixture,
): GlhPhase8PilotEvidence {
  const salesIsolation = evaluateIsolation(fixture.isolation);
  const managerAdminScope = evaluateManagerAdminScope(fixture.isolation);
  const webhookReplay = evaluateWebhookReplay(fixture.webhookReplay);
  const takeover = evaluateTakeover(fixture.takeover);
  const outage = evaluateOutage(fixture.outage);
  const desktop = evaluateDesktopUsability(fixture.desktop);
  const secretExposure = evaluateSecretExposure(fixture.secretExposure);
  const humanWork = evaluateHumanWorkWithoutAi(fixture.humanWork);
  const transfer = evaluateTransfer(fixture.transfer);
  const acceptanceCases = evaluateAcceptanceCases(fixture.acceptance, {
    takeover,
    webhookReplay,
    salesIsolation,
    managerAdminScope,
    transfer,
  });
  const checks = [
    salesIsolation,
    managerAdminScope,
    webhookReplay,
    takeover,
    outage,
    desktop,
    acceptanceCases,
    secretExposure,
    humanWork,
  ];
  const failed = checks.filter(check => check.status === 'FAIL').length;

  return Object.freeze({
    harness: 'GLH_PHASE8_NON_PRODUCTION_PILOT' as const,
    mode: 'REPOSITORY_ONLY_SYNTHETIC' as const,
    environment: 'NON_PRODUCTION' as const,
    productionAccess: false as const,
    realProviderCalls: false as const,
    overallStatus: failed === 0 ? 'PASS' as const : 'FAIL' as const,
    passed: checks.length - failed,
    failed,
    checks,
  });
}
