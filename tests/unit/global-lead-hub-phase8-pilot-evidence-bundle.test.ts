import assert from 'node:assert/strict';
import {
  computeGlhPhase8PilotEvidenceDigest,
  validateGlhPhase8PilotEvidenceBundle,
  validateGlhPhase8PilotEvidenceBundleJson,
  type GlhPhase8PilotEvidenceBundle,
  type GlhPhase8PilotEvidenceCheckId,
  type GlhPhase8PilotEvidenceReport,
} from '../../src/lib/global-lead-hub/phase8-pilot-evidence-bundle';

const EVALUATED_AT = '2026-10-12T00:00:00.000Z';
const OBSERVED_AT = '2026-10-11T23:30:00.000Z';
const SOURCE_DIGEST = 'a'.repeat(64);

function source(id: string, kind: string) {
  return {
    id,
    kind,
    capturedAt: OBSERVED_AT,
    digest: SOURCE_DIGEST,
  };
}

function acceptanceCase(
  id: string,
  sourceRef: string,
  firstExpected: string,
  secondExpected: number,
) {
  return {
    id,
    status: 'PASS',
    sourceRefs: [sourceRef],
    assertions: [
      { name: 'outcome', expected: 'PASS', actual: 'PASS' },
      { name: `${id}-value`, expected: firstExpected, actual: firstExpected },
      { name: `${id}-count`, expected: secondExpected, actual: secondExpected },
    ],
  };
}

const bundle: GlhPhase8PilotEvidenceBundle = {
  schemaVersion: 'glh-phase8-pilot-evidence/v1',
  taskId: 'GLH-P8-PILOT-EVIDENCE-BUNDLE-002',
  environment: 'NON_PRODUCTION',
  mode: 'REPOSITORY_ONLY_SYNTHETIC',
  productionAccess: false,
  realProviderCalls: false,
  generatedAt: '2026-10-11T23:00:00.000Z',
  expiresAt: '2026-10-13T00:00:00.000Z',
  sources: [
    source('source-rls', 'ACCESS_CONTRACT'),
    source('source-manager-admin', 'ACCESS_CONTRACT'),
    source('source-webhook', 'WEBHOOK_REPLAY'),
    source('source-takeover', 'TAKEOVER'),
    source('source-outage', 'OUTAGE'),
    source('source-ux', 'UX_SCREENSHOT'),
    source('source-acceptance', 'ACCEPTANCE'),
    source('source-secret', 'SECRET_SCAN'),
    source('source-human-work', 'HUMAN_WORK'),
  ],
  identities: {
    users: [
      {
        id: 'user-sales-a',
        classification: 'SYNTHETIC',
        organizationId: 'org-phase8-a',
        role: 'SALES',
      },
      {
        id: 'user-sales-b',
        classification: 'SYNTHETIC',
        organizationId: 'org-phase8-a',
        role: 'SALES',
      },
      {
        id: 'user-manager-a',
        classification: 'SYNTHETIC',
        organizationId: 'org-phase8-a',
        role: 'MANAGER',
      },
      {
        id: 'user-admin-a',
        classification: 'SYNTHETIC',
        organizationId: 'org-phase8-a',
        role: 'ADMIN',
      },
    ],
    contacts: [
      {
        id: 'contact-synthetic-a',
        classification: 'SYNTHETIC',
        organizationId: 'org-phase8-a',
        externalId: 'synthetic-contact-a',
      },
    ],
  },
  checks: [
    {
      id: 'RLS_SALES_ISOLATION',
      status: 'PASS',
      observedAt: OBSERVED_AT,
      sourceRefs: ['source-rls'],
      facts: {
        salesAUserId: 'user-sales-a',
        salesAOwnLead: {
          organizationId: 'org-phase8-a',
          ownerProfileId: 'user-sales-a',
          collaboratorProfileIds: [],
        },
        salesBRestrictedLead: {
          organizationId: 'org-phase8-a',
          ownerProfileId: 'user-sales-b',
          collaboratorProfileIds: [],
        },
        foreignLead: {
          organizationId: 'org-phase8-b',
          ownerProfileId: 'user-sales-b',
          collaboratorProfileIds: [],
        },
        ownedLeadVisible: true,
        salesBRestrictedLeadVisible: false,
        foreignLeadVisible: false,
        rlsPolicyUsesTrustedProfileMembership: true,
        rlsPolicyRequiresSameOrganization: true,
        salesCanAccessOwnedOrAssignedOnly: true,
      },
    },
    {
      id: 'MANAGER_ADMIN_ORGANIZATION_SCOPE',
      status: 'PASS',
      observedAt: OBSERVED_AT,
      sourceRefs: ['source-manager-admin'],
      facts: {
        managerUserId: 'user-manager-a',
        adminUserId: 'user-admin-a',
        salesUserId: 'user-sales-a',
        sameOrganizationLead: {
          organizationId: 'org-phase8-a',
          ownerProfileId: 'user-sales-a',
          collaboratorProfileIds: [],
        },
        foreignOrganizationLead: {
          organizationId: 'org-phase8-b',
          ownerProfileId: 'user-sales-b',
          collaboratorProfileIds: [],
        },
        managerCanViewAllLeads: true,
        adminCanViewAllLeads: true,
        managerCanViewSameOrganizationLead: true,
        adminCanViewSameOrganizationLead: true,
        managerCanViewForeignLead: false,
        adminCanViewForeignLead: false,
        managerCanManageOwnOrganization: true,
        adminCanManageOwnOrganization: true,
        managerCanManageForeignOrganization: false,
        adminCanManageForeignOrganization: false,
        salesCanManageOrganization: false,
      },
    },
    {
      id: 'WEBHOOK_REPLAY_IDEMPOTENCY',
      status: 'PASS',
      observedAt: OBSERVED_AT,
      sourceRefs: ['source-webhook'],
      facts: {
        externalEventId: 'synthetic-webhook-event-001',
        firstDeliveryAcceptedLogicalMessages: 1,
        replayDeliveryAcceptedLogicalMessages: 0,
        logicalMessagesAfterReplay: 1,
        autoRepliesAfterReplay: 1,
        duplicateLogicalMessages: 0,
        duplicateAutoReplies: 0,
      },
    },
    {
      id: 'HUMAN_TAKEOVER_STOPS_AUTOSEND',
      status: 'PASS',
      observedAt: OBSERVED_AT,
      sourceRefs: ['source-takeover'],
      facts: {
        modeAfterTakeover: 'HUMAN_ACTIVE',
        pendingAiAutoSendStatusAfter: 'BLOCKED',
        customerFacingAutoSendAttemptsAfterTakeover: 0,
        autoSendAllowedAfterTakeover: false,
        draftAssistanceAvailable: true,
        draftAssistanceMode: 'COPILOT_ONLY',
        originalMessagesPreserved: true,
      },
    },
    {
      id: 'AI_PROVIDER_OUTAGE_FALLBACK',
      status: 'PASS',
      observedAt: OBSERVED_AT,
      sourceRefs: ['source-outage'],
      facts: {
        aiAvailable: false,
        providerCallSucceeded: false,
        providerFailureRecorded: true,
        inboundMessagesBefore: 1,
        inboundMessagesAfter: 1,
        inboundEvidencePreserved: true,
        humanHandoffCreated: true,
        humanWorkAvailable: true,
      },
    },
    {
      id: 'DESKTOP_1366X768_USABILITY',
      status: 'PASS',
      observedAt: OBSERVED_AT,
      sourceRefs: ['source-ux'],
      facts: {
        viewportWidth: 1366,
        viewportHeight: 768,
        documentScrollWidth: 1366,
        documentScrollHeight: 900,
        regions: [
          { name: 'queues', x: 0, y: 0, width: 300, height: 620 },
          { name: 'conversation', x: 300, y: 0, width: 726, height: 620 },
          { name: 'customer-card', x: 1026, y: 0, width: 340, height: 620 },
          { name: 'takeover', x: 0, y: 640, width: 300, height: 60 },
          { name: 'compose', x: 300, y: 640, width: 1066, height: 60 },
        ],
        overlapCount: 0,
        requiredControlsVisible: true,
        screenshotSourceRef: 'source-ux',
      },
    },
    {
      id: 'ACCEPTANCE_CASES_A_TO_G',
      status: 'PASS',
      observedAt: OBSERVED_AT,
      sourceRefs: ['source-acceptance'],
      facts: {
        cases: [
          acceptanceCase('A', 'source-acceptance', 'price-safe', 1),
          acceptanceCase('B', 'source-acceptance', 'machine-handoff', 1),
          acceptanceCase('C', 'source-acceptance', 'processing-captured', 1),
          acceptanceCase('D', 'source-acceptance', 'takeover', 1),
          acceptanceCase('E', 'source-acceptance', 'replay', 1),
          acceptanceCase('F', 'source-acceptance', 'scope', 1),
          acceptanceCase('G', 'source-acceptance', 'transfer', 1),
        ],
      },
    },
    {
      id: 'NO_BROWSER_OR_LOG_SECRET_EXPOSURE',
      status: 'PASS',
      observedAt: OBSERVED_AT,
      sourceRefs: ['source-secret'],
      facts: {
        browserSecretCanaryHits: 0,
        logSecretCanaryHits: 0,
        serverOnlySecretsInBrowser: false,
        rawPayloadsInLogs: false,
        detectedSecretCount: 0,
        scannedSurfaceCount: 2,
      },
    },
    {
      id: 'HUMAN_WORK_REMAINS_AVAILABLE_WITHOUT_AI',
      status: 'PASS',
      observedAt: OBSERVED_AT,
      sourceRefs: ['source-human-work'],
      facts: {
        aiAvailable: false,
        originalMessagesPreserved: true,
        humanMessageWorkAvailable: true,
        taskWorkAvailable: true,
        followupWorkAvailable: true,
      },
    },
  ],
  integrity: {
    algorithm: 'sha256',
    digest: '0'.repeat(64),
  },
};

bundle.integrity.digest = computeGlhPhase8PilotEvidenceDigest(bundle);

function validate(value: unknown): GlhPhase8PilotEvidenceReport {
  return validateGlhPhase8PilotEvidenceBundle(value, {
    evaluatedAt: EVALUATED_AT,
  });
}

function resign(value: GlhPhase8PilotEvidenceBundle): GlhPhase8PilotEvidenceBundle {
  const clone = structuredClone(value);
  clone.integrity.digest = computeGlhPhase8PilotEvidenceDigest(clone);
  return clone;
}

function mutableFacts(
  value: GlhPhase8PilotEvidenceBundle,
  id: GlhPhase8PilotEvidenceCheckId,
): Record<string, unknown> {
  const check = value.checks.find(candidate => candidate.id === id);
  assert.ok(check, `${id} fixture must exist`);
  return check.facts as unknown as Record<string, unknown>;
}

function assertIssue(
  report: GlhPhase8PilotEvidenceReport,
  code: string,
  checkId?: GlhPhase8PilotEvidenceCheckId,
): void {
  assert.equal(report.overallStatus, 'FAIL');
  assert(
    report.errors.some(error => error.code === code && (
      checkId === undefined || error.checkId === checkId
    )),
    `Expected ${code}${checkId ? ` for ${checkId}` : ''}, received `
      + JSON.stringify(report.errors),
  );
}

const report = validate(bundle);
assert.equal(report.overallStatus, 'PASS');
assert.equal(report.accepted, true);
assert.equal(report.passed, 9);
assert.equal(report.failed, 0);
assert.deepEqual(report.errors, []);
assert.deepEqual(
  report.checks.map(check => check.id),
  [
    'RLS_SALES_ISOLATION',
    'MANAGER_ADMIN_ORGANIZATION_SCOPE',
    'WEBHOOK_REPLAY_IDEMPOTENCY',
    'HUMAN_TAKEOVER_STOPS_AUTOSEND',
    'AI_PROVIDER_OUTAGE_FALLBACK',
    'DESKTOP_1366X768_USABILITY',
    'ACCEPTANCE_CASES_A_TO_G',
    'NO_BROWSER_OR_LOG_SECRET_EXPOSURE',
    'HUMAN_WORK_REMAINS_AVAILABLE_WITHOUT_AI',
  ],
);
assert.equal(JSON.stringify(report), JSON.stringify(validate(bundle)));

const jsonReport = validateGlhPhase8PilotEvidenceBundleJson(
  JSON.stringify(bundle),
  { evaluatedAt: EVALUATED_AT },
);
assert.equal(jsonReport.overallStatus, 'PASS');

const production = structuredClone(bundle);
(production as unknown as Record<string, unknown>).environment = 'PRODUCTION';
assertIssue(validate(resign(production)), 'PRODUCTION_ENVIRONMENT');

const tampered = structuredClone(bundle);
mutableFacts(tampered, 'WEBHOOK_REPLAY_IDEMPOTENCY').duplicateAutoReplies = 1;
assertIssue(validate(tampered), 'TAMPER_DETECTED');

const missing = structuredClone(bundle);
missing.checks = missing.checks.filter(check => check.id !== 'DESKTOP_1366X768_USABILITY');
assertIssue(
  validate(resign(missing)),
  'MISSING_CHECK',
  'DESKTOP_1366X768_USABILITY',
);

const nonSynthetic = structuredClone(bundle);
nonSynthetic.identities.users[0].classification = 'REAL' as 'SYNTHETIC';
assertIssue(validate(resign(nonSynthetic)), 'NON_SYNTHETIC_IDENTITY');

const secretLike = structuredClone(bundle);
mutableFacts(secretLike, 'NO_BROWSER_OR_LOG_SECRET_EXPOSURE').debugValue =
  'sk-live-abcdefghijklmnopqrstuvwxyz123456';
assertIssue(validate(resign(secretLike)), 'SECRET_LIKE_VALUE');

const rlsLeak = structuredClone(bundle);
const restrictedLead = mutableFacts(rlsLeak, 'RLS_SALES_ISOLATION')
  .salesBRestrictedLead as Record<string, unknown>;
restrictedLead.ownerProfileId = 'user-sales-a';
const rlsReport = validate(resign(rlsLeak));
assertIssue(rlsReport, 'INCONSISTENT_FACT', 'RLS_SALES_ISOLATION');
assert.equal(
  rlsReport.checks.find(check => check.id === 'RLS_SALES_ISOLATION')?.status,
  'FAIL',
);

const replayDuplicate = structuredClone(bundle);
mutableFacts(replayDuplicate, 'WEBHOOK_REPLAY_IDEMPOTENCY').duplicateAutoReplies = 1;
const replayReport = validate(resign(replayDuplicate));
assertIssue(
  replayReport,
  'INCONSISTENT_FACT',
  'WEBHOOK_REPLAY_IDEMPOTENCY',
);

const takeoverAutoSend = structuredClone(bundle);
mutableFacts(
  takeoverAutoSend,
  'HUMAN_TAKEOVER_STOPS_AUTOSEND',
).customerFacingAutoSendAttemptsAfterTakeover = 1;
const takeoverReport = validate(resign(takeoverAutoSend));
assertIssue(
  takeoverReport,
  'INCONSISTENT_FACT',
  'HUMAN_TAKEOVER_STOPS_AUTOSEND',
);

const outageLoss = structuredClone(bundle);
mutableFacts(outageLoss, 'AI_PROVIDER_OUTAGE_FALLBACK').inboundMessagesAfter = 0;
const outageReport = validate(resign(outageLoss));
assertIssue(outageReport, 'INCONSISTENT_FACT', 'AI_PROVIDER_OUTAGE_FALLBACK');

const stale = structuredClone(bundle);
stale.generatedAt = '2026-10-01T00:00:00.000Z';
stale.expiresAt = '2026-10-02T00:00:00.000Z';
stale.sources = stale.sources.map(item => ({
  ...item,
  capturedAt: '2026-10-01T12:00:00.000Z',
}));
stale.checks = stale.checks.map(item => ({
  ...item,
  observedAt: '2026-10-01T12:00:00.000Z',
}));
assertIssue(validate(resign(stale)), 'EVIDENCE_EXPIRED');

console.log('Global Lead Hub Phase 8 pilot evidence bundle tests passed');
