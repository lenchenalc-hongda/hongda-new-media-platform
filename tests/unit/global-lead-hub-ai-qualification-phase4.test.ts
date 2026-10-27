import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateGlhCompleteness,
  calculateGlhScore,
  detectGlhForbiddenClaims,
  detectGlhHandoffTriggers,
  normalizeGlhQualificationProfile,
  qualifyGlhLead,
  selectGlhQualificationQuestions,
  type GlhForbiddenClaim,
  type GlhQualificationProfile,
  type GlhQualificationProfileInput,
} from '../../src/lib/global-lead-hub/ai-qualification';
import { GLH_PROVIDER_CALLS_ENABLED } from '../../src/lib/global-lead-hub/channels';
import {
  GLH_FORBIDDEN_AUTONOMOUS_CLAIMS,
  GLH_IMMEDIATE_HANDOFF_TRIGGERS,
  gradeForGlhScore,
} from '../../src/lib/global-lead-hub/domain';

const pass = (caseId: string, description: string) => {
  console.log(`PASS ${caseId} ${description}`);
};

const coreFields = [
  'product',
  'imageReferences',
  'material',
  'quantity',
  'country',
  'requirementType',
] as const satisfies readonly (keyof GlhQualificationProfile)[];

const fullyQualifiedInput: GlhQualificationProfileInput = {
  product: 'cosmetic bottle',
  imageReferences: ['synthetic-product-image'],
  material: 'PP',
  quantity: '50,000 units',
  country: 'France',
  requirementType: 'PROCESSING',
  company: 'Synthetic Buyer SAS',
  testRequirements: 'Synthetic adhesion test',
  targetIndustryFit: true,
  purchaseTimeline: 'This quarter',
};

const emptyProfile = normalizeGlhQualificationProfile({});
assert.deepEqual(
  calculateGlhCompleteness(emptyProfile),
  { completeness: 0, missingCoreFields: coreFields },
  'the acceptance contract has exactly the frozen six core fields',
);
assert.deepEqual(
  calculateGlhCompleteness(normalizeGlhQualificationProfile(fullyQualifiedInput)),
  { completeness: 100, missingCoreFields: [] },
);
pass('CORE_SIX_FIELDS', 'core fields and completeness are bounded to the frozen set');

const emptyQuestions = selectGlhQualificationQuestions(emptyProfile);
assert.deepEqual(
  emptyQuestions.map(question => question.field),
  ['product', 'material', 'quantity'],
  'an empty inquiry asks only three high-value questions',
);
assert(emptyQuestions.length >= 1 && emptyQuestions.length <= 3);
assert.equal(selectGlhQualificationQuestions(emptyProfile, 1).length, 1);
assert.equal(selectGlhQualificationQuestions(emptyProfile, 0).length, 1);
assert.equal(selectGlhQualificationQuestions(emptyProfile, 99).length, 3);

const onlyMaterialMissing = normalizeGlhQualificationProfile({
  ...fullyQualifiedInput,
  material: '   ',
});
assert.deepEqual(
  calculateGlhCompleteness(onlyMaterialMissing).missingCoreFields,
  ['material'],
);
assert.deepEqual(
  selectGlhQualificationQuestions(onlyMaterialMissing, 1).map(question => question.field),
  ['material'],
  'one missing field produces one targeted question',
);
pass('TARGETED_QUESTIONS', 'each pass asks only one to three prioritized missing questions');

const fullScore = calculateGlhScore(
  normalizeGlhQualificationProfile(fullyQualifiedInput),
);
assert.deepEqual(fullScore, { score: 100, grade: 'A' });
assert.deepEqual(calculateGlhScore(emptyProfile), { score: 0, grade: 'D' });
assert.deepEqual(
  calculateGlhScore(normalizeGlhQualificationProfile({
    imageReferences: ['synthetic-product-image'],
    material: 'PET',
    quantity: '1,000 units',
    company: 'Synthetic Buyer',
    requirementType: 'PROCESSING',
  })),
  { score: 70, grade: 'B' },
);
assert.deepEqual(
  calculateGlhScore(normalizeGlhQualificationProfile({
    imageReferences: ['synthetic-product-image'],
    material: 'PET',
  })),
  { score: 30, grade: 'C' },
);
const scoreBoundaries = [
  [0, 'D'],
  [29, 'D'],
  [30, 'C'],
  [59, 'C'],
  [60, 'B'],
  [79, 'B'],
  [80, 'A'],
  [100, 'A'],
] as const;
assert.deepEqual(
  scoreBoundaries.map(([score]) => [score, gradeForGlhScore(score)]),
  scoreBoundaries,
);
pass('SCORE_BANDS', '100-point scoring and A/B/C/D boundaries are exact');

const coreCompleteForMachine: GlhQualificationProfileInput = {
  ...fullyQualifiedInput,
  requirementType: 'MACHINE',
  testRequirements: null,
  targetIndustryFit: false,
  purchaseTimeline: null,
};
const machineFieldNames = new Set([
  'dimensions',
  'targetCapacity',
  'currentProcess',
  'automationLevel',
  'fullSolutionRequired',
]);
const machineAnswers: Record<string, unknown> = {};
const machineQuestionFields: string[] = [];
for (let turn = 0; turn < 2; turn += 1) {
  const machineProfile = normalizeGlhQualificationProfile({
    ...coreCompleteForMachine,
    ...machineAnswers,
  });
  const questions = selectGlhQualificationQuestions(machineProfile, 3);
  for (const question of questions) {
    machineQuestionFields.push(question.field);
    machineAnswers[question.field] = question.field === 'fullSolutionRequired'
      ? false
      : `synthetic-${question.field}`;
  }
}
assert.deepEqual(
  machineQuestionFields.filter(field => machineFieldNames.has(field)),
  [
    'dimensions',
    'targetCapacity',
    'currentProcess',
    'automationLevel',
    'fullSolutionRequired',
  ],
  'machine inquiries expose all five frozen machine-specific questions over bounded turns',
);
assert.deepEqual(
  selectGlhQualificationQuestions(normalizeGlhQualificationProfile({
    ...fullyQualifiedInput,
    requirementType: 'PROCESSING',
  })).filter(question => [
    ...machineFieldNames,
  ].includes(question.field)),
  [],
  'machine-only questions do not leak into processing inquiries',
);
const processingResult = qualifyGlhLead({
  profile: {
    requirementType: 'PROCESSING_OR_PRINTING_SERVICE',
    sampleIntent: true,
  },
  lifecycleState: 'AI_QUALIFYING',
  conversationMode: 'AI_ACTIVE',
});
assert.equal(processingResult.profile.requirementType, 'PROCESSING');
assert(processingResult.handoffTriggers.includes('SAMPLE_OR_TEST'));
const machineResult = qualifyGlhLead({
  profile: { requirementType: 'MACHINE' },
  lifecycleState: 'AI_QUALIFYING',
  conversationMode: 'AI_ACTIVE',
});
assert.equal(machineResult.profile.requirementType, 'MACHINE');
assert(machineResult.handoffTriggers.includes('MACHINE_INQUIRY'));
assert.equal(machineResult.nextConversationMode, 'HANDOFF_PENDING');
pass('MACHINE_INQUIRY', 'machine inquiries ask machine fields and route to a human');

const allSignals = {
  asksForQuotationOrPriceDecision: true,
  asksForSampleOrTest: true,
  isMachineInquiry: true,
  isLargeCommercialOpportunity: true,
  includesFormalRfqSpecOrDrawing: true,
  asksForVideoMeeting: true,
  asksForFinalTechnicalConfirmation: true,
  asksForPaymentDeliveryOrDiscountTerms: true,
  discussesDistributorOrAgency: true,
  expressesComplaintOrDissatisfaction: true,
  unresolvedUsefulTurns: 2,
  confidence: 0.95,
  isHighRisk: true,
  isImportantAccount: true,
} as const;
assert.deepEqual(
  detectGlhHandoffTriggers(
    normalizeGlhQualificationProfile({
      requirementType: 'MACHINE',
      sampleIntent: true,
    }),
    allSignals,
  ),
  GLH_IMMEDIATE_HANDOFF_TRIGGERS,
  'every frozen immediate handoff trigger is represented exactly once',
);
pass('HANDOFF_TRIGGERS', 'all thirteen immediate human-handoff triggers are covered');

const humanTakeover = qualifyGlhLead({
  profile: fullyQualifiedInput,
  lifecycleState: 'HUMAN_FOLLOWING',
  conversationMode: 'HUMAN_ACTIVE',
});
assert.equal(humanTakeover.nextLifecycleState, 'HUMAN_FOLLOWING');
assert.equal(humanTakeover.nextConversationMode, 'HUMAN_ACTIVE');
assert.equal(humanTakeover.customerFacingAutoSendAllowed, false);
assert.equal(humanTakeover.copilotSuggestionsAllowed, true);
assert.deepEqual(humanTakeover.questions, []);
const simulatedCustomerFacingSends: string[] = [];
if (humanTakeover.customerFacingAutoSendAllowed) {
  simulatedCustomerFacingSends.push('synthetic-auto-send');
}
assert.deepEqual(
  simulatedCustomerFacingSends,
  [],
  'a complete profile cannot bypass the human-active auto-send stop',
);
pass('HUMAN_TAKEOVER', 'human takeover permits zero customer-facing AI sends');

assert.deepEqual(
  detectGlhForbiddenClaims({
    declaredClaims: GLH_FORBIDDEN_AUTONOMOUS_CLAIMS,
  }),
  GLH_FORBIDDEN_AUTONOMOUS_CLAIMS,
);
const forbiddenTextByClaim: Readonly<Record<GlhForbiddenClaim, string>> = {
  FINAL_PRICE_OR_DISCOUNT: 'The final price is confirmed.',
  FINAL_DELIVERY_DATE: 'The delivery date is guaranteed.',
  PAYMENT_TERMS: 'Payment terms are confirmed.',
  FINAL_TECHNICAL_FEASIBILITY: 'Definitely can do this without review.',
  ADHESION_OR_TEST_GUARANTEE: 'Adhesion will definitely pass.',
  MACHINE_CAPACITY_GUARANTEE: 'Machine capacity is guaranteed.',
  COMPENSATION: 'Compensation is confirmed.',
  CONTRACT_OR_AGENCY_COMMITMENT: 'The agency contract is approved.',
};
for (const claim of GLH_FORBIDDEN_AUTONOMOUS_CLAIMS) {
  const claimResult = qualifyGlhLead({
    profile: {},
    lifecycleState: 'AI_QUALIFYING',
    conversationMode: 'AI_ACTIVE',
    replyProposal: {
      text: forbiddenTextByClaim[claim],
      declaredClaims: [claim],
    },
  });
  assert(claimResult.forbiddenClaims.includes(claim));
  assert.equal(claimResult.customerFacingAutoSendAllowed, false);
  assert.equal(claimResult.nextConversationMode, 'HANDOFF_PENDING');
}
assert.deepEqual(
  detectGlhForbiddenClaims({
    text: 'A technical specialist can review the requirement with you.',
  }),
  [],
  'a review offer is not treated as a technical guarantee',
);
pass('FORBIDDEN_CLAIMS', 'commercial, technical, and contractual commitments are blocked');

const priceResult = qualifyGlhLead({
  profile: {},
  lifecycleState: 'NEW',
  conversationMode: 'AI_ACTIVE',
  signals: { asksForQuotationOrPriceDecision: true },
});
assert.deepEqual(
  priceResult.questions.map(question => question.field),
  ['product', 'material', 'quantity'],
);
assert.equal(priceResult.customerFacingAutoSendAllowed, false);
assert.equal(priceResult.score, 0);
assert.equal(priceResult.grade, 'D');
assert.notEqual(priceResult.nextLifecycleState, 'INVALID');
assert(
  !/(?:USD|US\$|EUR|GBP|RMB|CNY|\$|€|£|¥)\s*\d/i.test(
    JSON.stringify(priceResult.questions),
  ),
  'question selection does not fabricate a price',
);
pass('PRICE_CONTEXT', 'price requests ask for context without inventing a price');

for (const uncertaintySignal of [
  { confidence: 0.59 },
  { languageConfidence: 0.59 },
  { inputConfidence: 0.59 },
  { languageConfidence: Number.NaN },
  { inputConfidence: 1.01 },
] as const) {
  const uncertain = qualifyGlhLead({
    profile: {
      product: 'bottle',
      material: 'PP',
      quantity: '1000',
      country: 'France',
      requirementType: 'PROCESSING',
      imageReferences: ['synthetic-image'],
    },
    lifecycleState: 'AI_QUALIFYING',
    conversationMode: 'AI_ACTIVE',
    signals: uncertaintySignal,
  });
  assert(uncertain.handoffTriggers.includes('LOW_CONFIDENCE_OR_HIGH_RISK'));
  assert.equal(uncertain.nextConversationMode, 'HANDOFF_PENDING');
  assert.equal(uncertain.customerFacingAutoSendAllowed, false);
}
const confidentLanguages = qualifyGlhLead({
  profile: {},
  lifecycleState: 'AI_QUALIFYING',
  conversationMode: 'AI_ACTIVE',
  signals: { languageConfidence: 0.95, inputConfidence: 0.9 },
});
assert(!confidentLanguages.handoffTriggers.includes('LOW_CONFIDENCE_OR_HIGH_RISK'));
pass('UNCERTAINTY_FAIL_CLOSED', 'uncertain language or input classification blocks auto-send');

interface SyntheticInboundEvent {
  readonly externalEventId: string;
  readonly providerMessageId: string;
  readonly text: string;
  readonly receivedAt: string;
}

interface SyntheticFallback {
  readonly outcome: 'HANDOFF';
  readonly originalInboundEventId: string;
  readonly conversationMode: 'HANDOFF_PENDING';
  readonly humanTaskCreated: true;
  readonly humanManualFlowAvailable: true;
  readonly customerFacingSendAttempts: 0;
}

const inboundEventStore = new Map<string, SyntheticInboundEvent>();
const syntheticInboundEvent: SyntheticInboundEvent = {
  externalEventId: 'synthetic-event-phase4-001',
  providerMessageId: 'synthetic-message-phase4-001',
  text: 'Hi, can you quote this?',
  receivedAt: '2026-10-26T00:00:00.000Z',
};

function persistSyntheticInboundEvent(event: SyntheticInboundEvent): void {
  inboundEventStore.set(event.externalEventId, Object.freeze({ ...event }));
}

function runSyntheticQualification(
  event: SyntheticInboundEvent,
  qualificationStep: () => void,
): SyntheticFallback | { readonly outcome: 'QUALIFIED' } {
  persistSyntheticInboundEvent(event);
  try {
    qualificationStep();
    return { outcome: 'QUALIFIED' };
  } catch {
    return {
      outcome: 'HANDOFF',
      originalInboundEventId: event.externalEventId,
      conversationMode: 'HANDOFF_PENDING',
      humanTaskCreated: true,
      humanManualFlowAvailable: true,
      customerFacingSendAttempts: 0,
    };
  }
}

let simulatedQualificationAttempts = 0;
const outageResult = runSyntheticQualification(syntheticInboundEvent, () => {
  simulatedQualificationAttempts += 1;
  throw new Error('Synthetic AI qualification outage');
});
assert.equal(simulatedQualificationAttempts, 1);
assert.deepEqual(outageResult, {
  outcome: 'HANDOFF',
  originalInboundEventId: syntheticInboundEvent.externalEventId,
  conversationMode: 'HANDOFF_PENDING',
  humanTaskCreated: true,
  humanManualFlowAvailable: true,
  customerFacingSendAttempts: 0,
});
assert.deepEqual(
  inboundEventStore.get(syntheticInboundEvent.externalEventId),
  syntheticInboundEvent,
  'the original inbound event remains unchanged after simulated AI failure',
);
pass('AI_FAILURE_PRESERVES_INBOUND', 'synthetic failure preserves inbound and manual handoff');

const qualificationSource = readFileSync(
  'src/lib/global-lead-hub/ai-qualification.ts',
  'utf8',
);
const acceptanceDoc = readFileSync(
  'docs/global-lead-hub/17_PHASE4_AI_QUALIFICATION_OFFLINE_ACCEPTANCE.md',
  'utf8',
);
assert.equal(GLH_PROVIDER_CALLS_ENABLED, false);
for (const forbiddenSourceFragment of [
  'fetch(',
  'createClient',
  'process.env',
  'console.',
  'prompt_version',
  'whatsapp',
  'Meta Graph',
]) {
  assert(
    !qualificationSource.toLowerCase().includes(forbiddenSourceFragment.toLowerCase()),
    `offline qualification source must not contain ${forbiddenSourceFragment}`,
  );
}
assert(qualificationSource.includes('languageConfidence'));
assert(qualificationSource.includes('inputConfidence'));
assert(
  acceptanceDoc.includes(
    'conversation_id + trigger_message_id + action_type + prompt_version',
  ),
);
assert(acceptanceDoc.includes('deterministic policy version is not a prompt version'));
const firstEvaluation = qualifyGlhLead({
  profile: fullyQualifiedInput,
  lifecycleState: 'AI_QUALIFYING',
  conversationMode: 'AI_ACTIVE',
});
const secondEvaluation = qualifyGlhLead({
  profile: fullyQualifiedInput,
  lifecycleState: 'AI_QUALIFYING',
  conversationMode: 'AI_ACTIVE',
});
assert.deepEqual(firstEvaluation, secondEvaluation);
pass('AUDIT_DESIGN', 'offline evidence is deterministic and does not fake prompt/database state');

console.log('Global Lead Hub Phase 4 AI qualification offline acceptance tests passed');
