import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDisabledGlhChannelAdapter } from '../../src/lib/global-lead-hub/channels';
import {
  GLH_PHASE8_EVIDENCE_IDS,
  GLH_PHASE8_NON_PRODUCTION_PILOT_SCOPE,
  runGlhPhase8NonProductionPilotVerification,
  type GlhPhase8PilotFixture,
} from '../../src/lib/global-lead-hub/phase8-non-production-pilot';

const phase1Migration = readFileSync(
  'supabase/migrations/20261009181000_global_lead_hub_phase1_foundation.sql',
  'utf8',
);
const phase2Migration = readFileSync(
  'supabase/migrations/20261010074500_global_lead_hub_phase2_core_human_ui.sql',
  'utf8',
);
const phase3Migration = readFileSync(
  'supabase/migrations/20261010182400_global_lead_hub_phase3_whatsapp_inbound.sql',
  'utf8',
);
const phase5Migration = readFileSync(
  'supabase/migrations/20261011181500_global_lead_hub_phase5_handoff_persistence.sql',
  'utf8',
);
const inboxComponent = readFileSync(
  'src/components/global-lead-hub/UnifiedInbox.tsx',
  'utf8',
);
const webhookRoute = readFileSync(
  'src/app/api/global-lead-hub/webhooks/whatsapp/route.ts',
  'utf8',
);
const whatsappInbound = readFileSync(
  'src/lib/global-lead-hub/whatsapp-inbound.ts',
  'utf8',
);

const webhookPayload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'phase8-waba',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: {
          display_phone_number: '15550000001',
          phone_number_id: 'phase8-test-phone',
        },
        contacts: [{
          wa_id: '15550000002',
          profile: { name: 'Phase 8 Synthetic Buyer' },
        }],
        messages: [{
          id: 'wamid.phase8-replay-001',
          from: '15550000002',
          timestamp: '1791655200',
          type: 'text',
          text: { body: 'Please confirm the product and quantity.' },
        }],
      },
    }],
  }],
};

const providerResult = await createDisabledGlhChannelAdapter('WHATSAPP')
  .sendApprovedMessage({
    organizationId: 'phase8-org-a',
    channelAccountId: 'phase8-channel',
    conversationId: 'phase8-conversation',
    idempotencyKey: 'phase8-provider-attempt',
    body: 'Synthetic provider outage probe',
  });

const fixture: GlhPhase8PilotFixture = {
  isolation: {
    salesAContext: {
      actorProfileId: 'phase8-sales-a',
      organizationId: 'phase8-org-a',
      role: 'SALES',
      authSource: 'supabase',
    },
    ownLead: {
      organizationId: 'phase8-org-a',
      ownerProfileId: 'phase8-sales-a',
      collaboratorProfileIds: [],
    },
    salesBRestrictedLead: {
      organizationId: 'phase8-org-a',
      ownerProfileId: 'phase8-sales-b',
      collaboratorProfileIds: [],
    },
    managerContext: {
      actorProfileId: 'phase8-manager-a',
      organizationId: 'phase8-org-a',
      role: 'MANAGER',
      authSource: 'supabase',
    },
    adminContext: {
      actorProfileId: 'phase8-admin-a',
      organizationId: 'phase8-org-a',
      role: 'ADMIN',
      authSource: 'supabase',
    },
    foreignManagerContext: {
      actorProfileId: 'phase8-manager-b',
      organizationId: 'phase8-org-b',
      role: 'MANAGER',
      authSource: 'supabase',
    },
    foreignAdminContext: {
      actorProfileId: 'phase8-admin-b',
      organizationId: 'phase8-org-b',
      role: 'ADMIN',
      authSource: 'supabase',
    },
    foreignLead: {
      organizationId: 'phase8-org-b',
      ownerProfileId: 'phase8-sales-b',
      collaboratorProfileIds: [],
    },
    rlsPolicyUsesTrustedProfileMembership:
      phase1Migration.includes('FROM public.profiles p')
      && phase1Migration.includes('p.user_id = auth.uid()')
      && phase1Migration.includes('public.glh_can_access_lead(id)'),
    rlsPolicyRequiresSameOrganization:
      phase1Migration.includes('AND p.org_id = l.org_id')
      && phase1Migration.includes('AND p.org_id = p_org_id'),
    salesCanAccessOwnedOrAssignedOnly:
      phase1Migration.includes('OR l.owner_profile_id = p.id')
      && phase1Migration.includes("a.status = 'ACTIVE'"),
  },
  webhookReplay: {
    firstPayload: webhookPayload,
    replayPayload: webhookPayload,
    contract: {
      externalEventUnique:
        phase1Migration.includes('CREATE UNIQUE INDEX uq_glh_webhook_provider_event'),
      duplicateReturnsBeforeLogicalWrites:
        phase3Migration.indexOf('IF v_event_id IS NULL THEN')
          < phase3Migration.indexOf('INSERT INTO public.glh_contacts'),
      messageProviderEventUnique:
        phase1Migration.includes('CONSTRAINT uq_glh_messages_provider_external')
        && phase3Migration.includes(
          'ON CONFLICT ON CONSTRAINT uq_glh_messages_provider_external',
        ),
      autoReplyKeyIncludesTrigger:
        phase1Migration.includes('CREATE UNIQUE INDEX uq_glh_ai_actions_send_idempotency')
        && phase1Migration.includes('trigger_message_id')
        && phase1Migration.includes('action_type')
        && phase1Migration.includes('prompt_version'),
    },
  },
  takeover: {
    context: {
      actorProfileId: 'phase8-sales-a',
      organizationId: 'phase8-org-a',
      role: 'SALES',
      authSource: 'supabase',
    },
    lead: {
      organizationId: 'phase8-org-a',
      ownerProfileId: 'phase8-sales-a',
      collaboratorProfileIds: [],
    },
    currentMode: 'HANDOFF_PENDING',
    persistenceAvailable: true,
    pendingAiSendStatusBefore: 'PENDING',
    pendingAiSendStatusAfter: 'BLOCKED',
    customerFacingSendAttemptsAfterTakeover: 0,
    originalMessageCountBefore: 2,
    originalMessageCountAfter: 2,
    pendingAiBlockedBeforeAudit:
      phase5Migration.indexOf('UPDATE public.glh_ai_actions')
        < phase5Migration.indexOf('INSERT INTO public.glh_audit_events'),
    humanMessage: {
      conversationId: 'phase8-conversation',
      leadId: 'phase8-lead',
      text: 'Synthetic human reply',
      idempotencyKey: 'phase8-human-intent-0001',
    },
  },
  outage: {
    conversationModeAfter: 'HANDOFF_PENDING',
    aiAvailable: false,
    providerResult,
    providerFailureRecorded: true,
    inboundMessageCountBefore: 1,
    inboundMessageCountAfter: 1,
    humanHandoffCreated: true,
  },
  acceptance: {
    price: {
      persisted: true,
      autoReplyText:
        'To help with the request, please share the product, material, and quantity.',
      qualification: {
        profile: {},
        lifecycleState: 'NEW',
        conversationMode: 'AI_ACTIVE',
        signals: { asksForQuotationOrPriceDecision: true },
      },
    },
    machine: {
      persisted: true,
      humanHandoffCreated: true,
      responseDueMinutes: 3,
      qualification: {
        profile: {
          product: 'Synthetic machine target',
          material: 'Synthetic substrate',
          quantity: '1 line',
          requirementType: 'MACHINE',
        },
        lifecycleState: 'AI_QUALIFYING',
        conversationMode: 'AI_ACTIVE',
        signals: { isMachineInquiry: true },
      },
    },
    processing: {
      persisted: true,
      sampleNeedCaptured: true,
      qualification: {
        profile: {
          product: 'Synthetic printed part',
          material: 'PET',
          quantity: '500',
          imageReferences: ['synthetic-image-reference'],
          country: 'NG',
          requirementType: 'PROCESSING',
        },
        lifecycleState: 'AI_QUALIFYING',
        conversationMode: 'AI_ACTIVE',
      },
    },
  },
  desktop: {
    viewportWidth: 1366,
    viewportHeight: 768,
    documentScrollWidth: 1366,
    documentScrollHeight: 900,
    minimumConversationHeight: 620,
    requiredRegions: [
      { name: 'queues', x: 0, y: 0, width: 300, height: 620 },
      { name: 'conversation', x: 300, y: 0, width: 726, height: 620 },
      { name: 'customer-card', x: 1026, y: 0, width: 340, height: 620 },
      { name: 'takeover', x: 0, y: 640, width: 300, height: 60 },
      { name: 'compose', x: 300, y: 640, width: 1066, height: 60 },
    ],
    overlapCount: 0,
    sourceContract: {
      threeColumnLayout:
        inboxComponent.includes('xl:grid-cols-[300px_minmax(420px,1fr)_340px]'),
      minimumConversationHeight: inboxComponent.includes('min-h-[620px]'),
      horizontalContainment: inboxComponent.includes('overflow-hidden'),
      requiredControls:
        inboxComponent.includes('Original conversation')
        && inboxComponent.includes('Take Over')
        && inboxComponent.includes('Queue human reply')
        && inboxComponent.includes('AI copilot'),
    },
  },
  secretExposure: {
    canaries: [
      'phase8-synthetic-app-secret',
      'phase8-synthetic-verify-token',
      'phase8-synthetic-service-role',
    ],
    surfaces: [
      {
        kind: 'BROWSER',
        name: 'webhook browser response',
        content: JSON.stringify({ ok: true, accepted: 1 }),
      },
      {
        kind: 'LOG',
        name: 'webhook server log',
        content: 'WhatsApp webhook processed without payload or credentials.',
      },
    ],
    serverOnlySecretsInBrowser:
      inboxComponent.includes('SERVICE_ROLE')
      || inboxComponent.includes('process.env')
      || inboxComponent.includes('createAdminSupabaseClient'),
    rawPayloadsInLogs:
      webhookRoute.includes('console.')
      || whatsappInbound.includes('console.'),
  },
  humanWork: {
    context: {
      actorProfileId: 'phase8-sales-a',
      organizationId: 'phase8-org-a',
      role: 'SALES',
      authSource: 'supabase',
    },
    lead: {
      organizationId: 'phase8-org-a',
      ownerProfileId: 'phase8-sales-a',
      collaboratorProfileIds: [],
    },
    conversationMode: 'HUMAN_ACTIVE',
    aiAvailable: false,
    originalMessageCount: 2,
    taskWorkAvailable: true,
    followupWorkAvailable: true,
    humanMessage: {
      conversationId: 'phase8-conversation',
      leadId: 'phase8-lead',
      text: 'Synthetic human follow-up',
      idempotencyKey: 'phase8-human-work-0001',
    },
  },
  transfer: {
    historyRowsBefore: 1,
    historyRowsAfter: 2,
    previousAssignmentStatusAfterTransfer: 'ENDED',
    newAssignmentStatusAfterTransfer: 'ACTIVE',
    previousActorPreserved: true,
    auditEventRecorded:
      phase2Migration.includes("UPDATE public.glh_assignments")
      && phase2Migration.includes("INSERT INTO public.glh_audit_events")
      && phase2Migration.includes("'previous_owner_profile_id'"),
    originalMessages: [
      { id: 'phase8-message-1', text: 'Original customer message' },
      { id: 'phase8-message-2', text: 'Original human reply' },
    ],
    messagesAfterTransfer: [
      { id: 'phase8-message-1', text: 'Original customer message' },
      { id: 'phase8-message-2', text: 'Original human reply' },
    ],
  },
};

assert.deepEqual(
  GLH_PHASE8_NON_PRODUCTION_PILOT_SCOPE.requiredEvidence,
  GLH_PHASE8_EVIDENCE_IDS,
);

const report = runGlhPhase8NonProductionPilotVerification(fixture);

console.log(
  `GLH Phase 8 non-production pilot evidence: ${report.overallStatus} `
  + `(${report.passed} passed, ${report.failed} failed)`,
);
for (const check of report.checks) {
  console.log(`${check.status.padEnd(4)} ${check.id} ${JSON.stringify(check.facts)}`);
  for (const failure of check.failures) {
    console.log(`     FAILURE ${failure}`);
  }
}

assert.equal(report.harness, 'GLH_PHASE8_NON_PRODUCTION_PILOT');
assert.equal(report.mode, 'REPOSITORY_ONLY_SYNTHETIC');
assert.equal(report.environment, 'NON_PRODUCTION');
assert.equal(report.productionAccess, false);
assert.equal(report.realProviderCalls, false);
assert.equal(report.overallStatus, 'PASS');
assert.equal(report.passed, GLH_PHASE8_EVIDENCE_IDS.length);
assert.equal(report.failed, 0);
assert.deepEqual(
  report.checks.map(check => check.id),
  [...GLH_PHASE8_EVIDENCE_IDS],
);
for (const check of report.checks) {
  assert.equal(check.status, 'PASS', `${check.id} must pass`);
  assert(check.summary.length > 0, `${check.id} must include an auditable summary`);
  assert(Object.keys(check.facts).length > 0, `${check.id} must include evidence facts`);
  assert.deepEqual(check.failures, [], `${check.id} must not report failures`);
}

const isolationTamper = structuredClone(fixture);
isolationTamper.isolation.salesCanAccessOwnedOrAssignedOnly = false;
const isolationFailure = runGlhPhase8NonProductionPilotVerification(isolationTamper);
assert.equal(isolationFailure.overallStatus, 'FAIL');
assert.equal(
  isolationFailure.checks.find(check => check.id === 'RLS_SALES_ISOLATION')?.status,
  'FAIL',
);

const replayTamper = structuredClone(fixture);
replayTamper.webhookReplay.contract.duplicateReturnsBeforeLogicalWrites = false;
const replayFailure = runGlhPhase8NonProductionPilotVerification(replayTamper);
assert.equal(replayFailure.overallStatus, 'FAIL');
assert.equal(
  replayFailure.checks.find(check => check.id === 'WEBHOOK_REPLAY_IDEMPOTENCY')?.status,
  'FAIL',
);

const desktopTamper = structuredClone(fixture);
desktopTamper.desktop.documentScrollWidth = 1400;
const desktopFailure = runGlhPhase8NonProductionPilotVerification(desktopTamper);
assert.equal(desktopFailure.overallStatus, 'FAIL');
assert.equal(
  desktopFailure.checks.find(check => check.id === 'DESKTOP_1366X768_USABILITY')?.status,
  'FAIL',
);

const secretTamper = structuredClone(fixture);
secretTamper.secretExposure.surfaces[0].content =
  `unexpected ${secretTamper.secretExposure.canaries[0]}`;
const secretFailure = runGlhPhase8NonProductionPilotVerification(secretTamper);
assert.equal(secretFailure.overallStatus, 'FAIL');
assert.equal(
  secretFailure.checks.find(
    check => check.id === 'NO_BROWSER_OR_LOG_SECRET_EXPOSURE',
  )?.status,
  'FAIL',
);

const acceptanceTamper = structuredClone(fixture);
acceptanceTamper.acceptance.price.autoReplyText = 'The final price is USD 120.';
const acceptanceFailure = runGlhPhase8NonProductionPilotVerification(acceptanceTamper);
assert.equal(acceptanceFailure.overallStatus, 'FAIL');
assert.equal(
  acceptanceFailure.checks.find(
    check => check.id === 'ACCEPTANCE_CASES_A_TO_G',
  )?.status,
  'FAIL',
);

console.log('Global Lead Hub Phase 8 non-production pilot tests passed');
