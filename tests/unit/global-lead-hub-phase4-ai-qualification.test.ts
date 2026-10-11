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
} from '../../src/lib/global-lead-hub/ai-qualification';

const completeProfile = normalizeGlhQualificationProfile({
  product: '  cosmetic bottle  ',
  imageReferences: ['image-1', ' image-1 ', 'image-2'],
  material: 'PP',
  quantity: '50,000',
  country: 'France',
  requirementType: 'processing_or_printing_service',
  company: 'Example SAS',
  testRequirements: 'adhesion test',
  targetIndustryFit: true,
  purchaseTimeline: 'this quarter',
});

assert.equal(completeProfile.product, 'cosmetic bottle');
assert.deepEqual(completeProfile.imageReferences, ['image-1', 'image-2']);
assert.equal(completeProfile.requirementType, 'PROCESSING_OR_PRINTING_SERVICE');
assert.deepEqual(calculateGlhCompleteness(completeProfile), {
  completeness: 100,
  missingCoreFields: [],
});
assert.deepEqual(calculateGlhScore(completeProfile), { score: 100, grade: 'A' });

for (const [scoreInput, expected] of [
  [{}, { score: 0, grade: 'D' }],
  [{ imageReferences: ['x'], material: 'PET' }, { score: 30, grade: 'C' }],
  [{ imageReferences: ['x'], material: 'PET', quantity: '1000' }, { score: 45, grade: 'C' }],
  [{ imageReferences: ['x'], material: 'PET', quantity: '1000', company: 'Buyer', requirementType: 'OTHER' }, { score: 70, grade: 'B' }],
] as const) {
  assert.deepEqual(calculateGlhScore(normalizeGlhQualificationProfile(scoreInput)), expected);
}

const priceCase = qualifyGlhLead({
  profile: {},
  lifecycleState: 'NEW',
  conversationMode: 'AI_ACTIVE',
  signals: { asksForQuotationOrPriceDecision: true },
});
assert.equal(priceCase.score, 0);
assert.equal(priceCase.grade, 'D');
assert.notEqual(priceCase.nextLifecycleState, 'INVALID', 'D is priority only');
assert.equal(priceCase.nextLifecycleState, 'READY_FOR_HUMAN');
assert.equal(priceCase.nextConversationMode, 'HANDOFF_PENDING');
assert.equal(priceCase.customerFacingAutoSendAllowed, false);
assert(priceCase.handoffTriggers.includes('QUOTATION_OR_PRICE_DECISION'));
assert.deepEqual(priceCase.questions.map(question => question.field), ['product', 'material', 'quantity']);

const ordinaryCase = qualifyGlhLead({
  profile: { product: 'cup', material: 'PP', quantity: '2000' },
  lifecycleState: 'AI_QUALIFYING',
  conversationMode: 'AI_ACTIVE',
});
assert.equal(ordinaryCase.nextLifecycleState, 'WAITING_CUSTOMER');
assert.equal(ordinaryCase.customerFacingAutoSendAllowed, true);
assert(ordinaryCase.questions.length >= 1 && ordinaryCase.questions.length <= 3);

const machineProfile = normalizeGlhQualificationProfile({ requirementType: 'MACHINE' });
const machineQuestions = selectGlhQualificationQuestions(machineProfile, 3);
assert(machineQuestions.length === 3);
assert(detectGlhHandoffTriggers(machineProfile).includes('MACHINE_INQUIRY'));
const machineResult = qualifyGlhLead({
  profile: { requirementType: 'MACHINE' },
  lifecycleState: 'AI_QUALIFYING',
  conversationMode: 'AI_ACTIVE',
});
assert.equal(machineResult.nextConversationMode, 'HANDOFF_PENDING');
assert(!selectGlhQualificationQuestions(normalizeGlhQualificationProfile({
  product: 'cup',
  material: 'PP',
  quantity: '1000',
  imageReferences: ['image'],
  country: 'US',
  requirementType: 'MACHINE',
  fullSolutionRequired: false,
}), 3).some(question => question.field === 'fullSolutionRequired'));

const processingResult = qualifyGlhLead({
  profile: { requirementType: 'PROCESSING_OR_PRINTING_SERVICE', sampleIntent: true },
  lifecycleState: 'WAITING_CUSTOMER',
  conversationMode: 'AI_ACTIVE',
});
assert(processingResult.handoffTriggers.includes('SAMPLE_OR_TEST'));

assert.deepEqual(
  detectGlhHandoffTriggers(normalizeGlhQualificationProfile({}), {
    unresolvedUsefulTurns: 2,
    confidence: 0.4,
    expressesComplaintOrDissatisfaction: true,
  }),
  [
    'COMPLAINT_OR_DISSATISFACTION',
    'AI_UNRESOLVED_AFTER_TWO_USEFUL_TURNS',
    'LOW_CONFIDENCE_OR_HIGH_RISK',
  ],
);

const forbidden = detectGlhForbiddenClaims({
  text: 'The final price is confirmed and we guarantee delivery.',
  declaredClaims: ['FINAL_TECHNICAL_FEASIBILITY'],
});
assert.deepEqual(forbidden, [
  'FINAL_PRICE_OR_DISCOUNT',
  'FINAL_DELIVERY_DATE',
  'FINAL_TECHNICAL_FEASIBILITY',
]);

for (const claim of [
  'FINAL_PRICE_OR_DISCOUNT',
  'FINAL_DELIVERY_DATE',
  'PAYMENT_TERMS',
  'FINAL_TECHNICAL_FEASIBILITY',
  'ADHESION_OR_TEST_GUARANTEE',
  'MACHINE_CAPACITY_GUARANTEE',
  'COMPENSATION',
  'CONTRACT_OR_AGENCY_COMMITMENT',
] as const) {
  const result = qualifyGlhLead({
    profile: {},
    lifecycleState: 'AI_QUALIFYING',
    conversationMode: 'AI_ACTIVE',
    replyProposal: { declaredClaims: [claim] },
  });
  assert.equal(result.customerFacingAutoSendAllowed, false, `${claim} must block auto-send`);
  assert(result.forbiddenClaims.includes(claim));
}

const humanActive = qualifyGlhLead({
  profile: {},
  lifecycleState: 'HUMAN_FOLLOWING',
  conversationMode: 'HUMAN_ACTIVE',
});
assert.equal(humanActive.nextLifecycleState, 'HUMAN_FOLLOWING');
assert.equal(humanActive.nextConversationMode, 'HUMAN_ACTIVE');
assert.equal(humanActive.customerFacingAutoSendAllowed, false);
assert.equal(humanActive.copilotSuggestionsAllowed, true);

const source = readFileSync('src/lib/global-lead-hub/ai-qualification.ts', 'utf8');
assert(!source.includes('fetch('), 'qualification engine must not call a provider');
assert(!source.includes('process.env'), 'qualification engine must not access Production env');
assert(!source.includes('createClient'), 'qualification engine must not access a database');
assert(!source.includes('console.'), 'qualification engine must not log customer data');

console.log('Global Lead Hub Phase 4 AI qualification tests passed');
