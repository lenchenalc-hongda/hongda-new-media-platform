import {
  GLH_FORBIDDEN_AUTONOMOUS_CLAIMS,
  GLH_IMMEDIATE_HANDOFF_TRIGGERS,
  gradeForGlhScore,
  type GlhConversationMode,
  type GlhLifecycleState,
  type GlhPriorityGrade,
} from './domain';

export type GlhRequirementType =
  | 'FILM'
  | 'PROCESSING'
  | 'MACHINE'
  | 'PROCESS_CONSULT'
  | 'UNCLEAR';

export interface GlhQualificationProfileInput {
  product?: unknown;
  imageReferences?: unknown;
  material?: unknown;
  quantity?: unknown;
  country?: unknown;
  requirementType?: unknown;
  company?: unknown;
  website?: unknown;
  businessIdentity?: unknown;
  dimensions?: unknown;
  artwork?: unknown;
  printingArea?: unknown;
  currentProcess?: unknown;
  painPoints?: unknown;
  testRequirements?: unknown;
  sampleIntent?: unknown;
  purchaseTimeline?: unknown;
  repeatOrLongTermOrder?: unknown;
  targetIndustryFit?: unknown;
  targetCapacity?: unknown;
  automationLevel?: unknown;
  fullSolutionRequired?: unknown;
}

export interface GlhQualificationProfile {
  product: string | null;
  imageReferences: readonly string[];
  material: string | null;
  quantity: string | null;
  country: string | null;
  requirementType: GlhRequirementType | null;
  company: string | null;
  website: string | null;
  businessIdentity: string | null;
  dimensions: string | null;
  artwork: string | null;
  printingArea: string | null;
  currentProcess: string | null;
  painPoints: string | null;
  testRequirements: string | null;
  sampleIntent: boolean;
  purchaseTimeline: string | null;
  repeatOrLongTermOrder: boolean;
  targetIndustryFit: boolean;
  targetCapacity: string | null;
  automationLevel: string | null;
  fullSolutionRequired: boolean | null;
}

export type GlhHandoffTrigger = (typeof GLH_IMMEDIATE_HANDOFF_TRIGGERS)[number];
export type GlhForbiddenClaim = (typeof GLH_FORBIDDEN_AUTONOMOUS_CLAIMS)[number];

export interface GlhQualificationSignals {
  asksForQuotationOrPriceDecision?: boolean;
  asksForSampleOrTest?: boolean;
  isMachineInquiry?: boolean;
  isLargeCommercialOpportunity?: boolean;
  includesFormalRfqSpecOrDrawing?: boolean;
  asksForVideoMeeting?: boolean;
  asksForFinalTechnicalConfirmation?: boolean;
  asksForPaymentDeliveryOrDiscountTerms?: boolean;
  discussesDistributorOrAgency?: boolean;
  expressesComplaintOrDissatisfaction?: boolean;
  unresolvedUsefulTurns?: number;
  confidence?: number;
  languageConfidence?: number;
  inputConfidence?: number;
  isHighRisk?: boolean;
  isImportantAccount?: boolean;
}

export interface GlhAutonomousReplyProposal {
  text?: string | null;
  declaredClaims?: readonly GlhForbiddenClaim[];
}

export interface GlhQualificationInput {
  profile: GlhQualificationProfileInput;
  lifecycleState: GlhLifecycleState;
  conversationMode: GlhConversationMode;
  signals?: GlhQualificationSignals;
  replyProposal?: GlhAutonomousReplyProposal;
}

export interface GlhQualificationQuestion {
  field: keyof GlhQualificationProfile;
  prompt: string;
  priority: number;
}

export interface GlhQualificationResult {
  profile: GlhQualificationProfile;
  completeness: number;
  missingCoreFields: readonly (keyof GlhQualificationProfile)[];
  score: number;
  grade: GlhPriorityGrade;
  questions: readonly GlhQualificationQuestion[];
  handoffTriggers: readonly GlhHandoffTrigger[];
  forbiddenClaims: readonly GlhForbiddenClaim[];
  nextLifecycleState: GlhLifecycleState;
  nextConversationMode: GlhConversationMode;
  customerFacingAutoSendAllowed: boolean;
  copilotSuggestionsAllowed: boolean;
}

const REQUIREMENT_TYPES = new Set<GlhRequirementType>([
  'FILM',
  'PROCESSING',
  'MACHINE',
  'PROCESS_CONSULT',
  'UNCLEAR',
]);

const REQUIREMENT_TYPE_ALIASES: Readonly<Record<string, GlhRequirementType>> = {
  FILM_OR_MATERIAL: 'FILM',
  PROCESSING_OR_PRINTING_SERVICE: 'PROCESSING',
  OTHER: 'UNCLEAR',
};

const CORE_FIELDS = [
  'product',
  'imageReferences',
  'material',
  'quantity',
  'country',
  'requirementType',
] as const satisfies readonly (keyof GlhQualificationProfile)[];

const QUESTION_CATALOG: readonly GlhQualificationQuestion[] = [
  { field: 'product', prompt: 'What product do you need to print, process, or manufacture?', priority: 100 },
  { field: 'material', prompt: 'What material is the product made from?', priority: 95 },
  { field: 'quantity', prompt: 'What quantity do you need?', priority: 90 },
  { field: 'imageReferences', prompt: 'Could you share a clear product image or drawing?', priority: 85 },
  { field: 'requirementType', prompt: 'Do you need film/material, printing service, or a machine solution?', priority: 80 },
  { field: 'country', prompt: 'Which country will the order or project be delivered to?', priority: 75 },
  { field: 'dimensions', prompt: 'What are the product dimensions?', priority: 70 },
  { field: 'targetCapacity', prompt: 'What production capacity do you need?', priority: 69 },
  { field: 'currentProcess', prompt: 'What machine or process are you using today?', priority: 68 },
  { field: 'automationLevel', prompt: 'What automation level do you need?', priority: 67 },
  { field: 'fullSolutionRequired', prompt: 'Do you need a complete machine, film, and process solution?', priority: 66 },
  { field: 'testRequirements', prompt: 'Do you have test requirements or a sample for evaluation?', priority: 50 },
  { field: 'purchaseTimeline', prompt: 'What is your target purchasing timeline?', priority: 40 },
];

const FORBIDDEN_TEXT_PATTERNS: Readonly<Record<GlhForbiddenClaim, readonly RegExp[]>> = {
  FINAL_PRICE_OR_DISCOUNT: [
    /\b(final|confirmed|guaranteed)\s+(price|discount)\b/i,
    /\b(price|discount)\s+(is|will be)\s+(final|confirmed)\b/i,
  ],
  FINAL_DELIVERY_DATE: [
    /\b(delivery|ship(?:ment)?)\s+(date\s+)?(is\s+)?(final|confirmed|guaranteed)\b/i,
    /\bguarantee(?:d)?\s+(delivery|shipment)\b/i,
  ],
  PAYMENT_TERMS: [/\b(payment terms?|net\s*\d+)\s+(are|is)\s+(approved|confirmed|final)\b/i],
  FINAL_TECHNICAL_FEASIBILITY: [
    /\b(definitely|guaranteed)\s+(can|feasible|compatible|work(?:s)?)\b/i,
    /\btechnical(?:ly)?\s+(approved|confirmed|guaranteed)\b/i,
  ],
  ADHESION_OR_TEST_GUARANTEE: [
    /\b(adhesion|test)\s+(will|is)\s+(definitely\s+)?(pass|guaranteed)\b/i,
    /\bguarantee(?:d)?\s+(adhesion|test result)\b/i,
  ],
  MACHINE_CAPACITY_GUARANTEE: [
    /\b(machine\s+)?(?:output|capacity)\s+(is\s+)?(confirmed|guaranteed)\b/i,
    /\bguarantee(?:d)?\s+(machine\s+)?(?:output|capacity)\b/i,
  ],
  COMPENSATION: [/\b(compensation|refund|reimbursement)\s+(is\s+)?(approved|confirmed|guaranteed)\b/i],
  CONTRACT_OR_AGENCY_COMMITMENT: [
    /\b(contract|agency|distributorship)\s+(is\s+)?(approved|confirmed|guaranteed)\b/i,
    /\bappoint(?:ed|ment)?\s+(you\s+)?as\s+(our\s+)?(agent|distributor)\b/i,
  ],
};

function normalizedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizedBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizedNullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function normalizedImages(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizedString).filter((item): item is string => item !== null))];
}

function normalizedRequirementType(value: unknown): GlhRequirementType | null {
  const normalized = normalizedString(value)?.toUpperCase();
  if (!normalized) return null;
  const canonical = REQUIREMENT_TYPE_ALIASES[normalized] ?? normalized;
  return REQUIREMENT_TYPES.has(canonical as GlhRequirementType)
    ? canonical as GlhRequirementType
    : null;
}

function isUncertainClassificationConfidence(value: number | undefined): boolean {
  if (value === undefined) return false;
  return !Number.isFinite(value) || value < 0 || value > 1 || value < 0.6;
}

export function normalizeGlhQualificationProfile(
  input: GlhQualificationProfileInput,
): GlhQualificationProfile {
  return {
    product: normalizedString(input.product),
    imageReferences: normalizedImages(input.imageReferences),
    material: normalizedString(input.material),
    quantity: normalizedString(input.quantity),
    country: normalizedString(input.country),
    requirementType: normalizedRequirementType(input.requirementType),
    company: normalizedString(input.company),
    website: normalizedString(input.website),
    businessIdentity: normalizedString(input.businessIdentity),
    dimensions: normalizedString(input.dimensions),
    artwork: normalizedString(input.artwork),
    printingArea: normalizedString(input.printingArea),
    currentProcess: normalizedString(input.currentProcess),
    painPoints: normalizedString(input.painPoints),
    testRequirements: normalizedString(input.testRequirements),
    sampleIntent: normalizedBoolean(input.sampleIntent),
    purchaseTimeline: normalizedString(input.purchaseTimeline),
    repeatOrLongTermOrder: normalizedBoolean(input.repeatOrLongTermOrder),
    targetIndustryFit: normalizedBoolean(input.targetIndustryFit),
    targetCapacity: normalizedString(input.targetCapacity),
    automationLevel: normalizedString(input.automationLevel),
    fullSolutionRequired: normalizedNullableBoolean(input.fullSolutionRequired),
  };
}

function isPresent(profile: GlhQualificationProfile, field: keyof GlhQualificationProfile): boolean {
  const value = profile[field];
  if (field === 'fullSolutionRequired') return value !== null;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== false && value !== '';
}

export function calculateGlhCompleteness(profile: GlhQualificationProfile): {
  completeness: number;
  missingCoreFields: readonly (keyof GlhQualificationProfile)[];
} {
  const missingCoreFields = CORE_FIELDS.filter(field => !isPresent(profile, field));
  const presentCount = CORE_FIELDS.length - missingCoreFields.length;
  return {
    completeness: Math.round((presentCount / CORE_FIELDS.length) * 100),
    missingCoreFields,
  };
}

export function calculateGlhScore(profile: GlhQualificationProfile): {
  score: number;
  grade: GlhPriorityGrade;
} {
  const credibleIdentity = Boolean(profile.company || profile.website || profile.businessIdentity);
  const clearRequirement = profile.requirementType !== null
    && profile.requirementType !== 'UNCLEAR';
  const sampleOrTest = Boolean(profile.sampleIntent || profile.testRequirements);
  const repeatOrTimeline = Boolean(profile.repeatOrLongTermOrder || profile.purchaseTimeline);
  const score =
    (profile.imageReferences.length > 0 ? 15 : 0)
    + (profile.material ? 15 : 0)
    + (profile.quantity ? 15 : 0)
    + (credibleIdentity ? 10 : 0)
    + (clearRequirement ? 15 : 0)
    + (sampleOrTest ? 10 : 0)
    + (profile.targetIndustryFit ? 10 : 0)
    + (repeatOrTimeline ? 10 : 0);
  return { score, grade: gradeForGlhScore(score) ?? 'D' };
}

export function selectGlhQualificationQuestions(
  profile: GlhQualificationProfile,
  limit = 3,
): readonly GlhQualificationQuestion[] {
  const safeLimit = Math.max(1, Math.min(3, Math.trunc(limit) || 1));
  const machineFields = new Set<keyof GlhQualificationProfile>([
    'dimensions',
    'targetCapacity',
    'currentProcess',
    'automationLevel',
    'fullSolutionRequired',
  ]);
  return QUESTION_CATALOG
    .filter(question => {
      if (machineFields.has(question.field) && profile.requirementType !== 'MACHINE') return false;
      return !isPresent(profile, question.field);
    })
    .sort((left, right) => right.priority - left.priority)
    .slice(0, safeLimit);
}

export function detectGlhHandoffTriggers(
  profile: GlhQualificationProfile,
  signals: GlhQualificationSignals = {},
): readonly GlhHandoffTrigger[] {
  const triggers: GlhHandoffTrigger[] = [];
  const add = (condition: boolean | undefined, trigger: GlhHandoffTrigger) => {
    if (condition && !triggers.includes(trigger)) triggers.push(trigger);
  };
  add(signals.asksForQuotationOrPriceDecision, 'QUOTATION_OR_PRICE_DECISION');
  add(signals.asksForSampleOrTest || profile.sampleIntent, 'SAMPLE_OR_TEST');
  add(signals.isMachineInquiry || profile.requirementType === 'MACHINE', 'MACHINE_INQUIRY');
  add(signals.isLargeCommercialOpportunity, 'LARGE_COMMERCIAL_OPPORTUNITY');
  add(signals.includesFormalRfqSpecOrDrawing, 'FORMAL_RFQ_SPEC_OR_DRAWING');
  add(signals.asksForVideoMeeting, 'VIDEO_MEETING');
  add(signals.asksForFinalTechnicalConfirmation, 'FINAL_TECHNICAL_CONFIRMATION');
  add(signals.asksForPaymentDeliveryOrDiscountTerms, 'PAYMENT_DELIVERY_OR_DISCOUNT_TERMS');
  add(signals.discussesDistributorOrAgency, 'DISTRIBUTOR_OR_AGENCY_DISCUSSION');
  add(signals.expressesComplaintOrDissatisfaction, 'COMPLAINT_OR_DISSATISFACTION');
  add((signals.unresolvedUsefulTurns ?? 0) >= 2, 'AI_UNRESOLVED_AFTER_TWO_USEFUL_TURNS');
  add(
    signals.isHighRisk
      || isUncertainClassificationConfidence(signals.confidence)
      || isUncertainClassificationConfidence(signals.languageConfidence)
      || isUncertainClassificationConfidence(signals.inputConfidence),
    'LOW_CONFIDENCE_OR_HIGH_RISK',
  );
  add(signals.isImportantAccount, 'ADMIN_CONFIGURED_IMPORTANT_ACCOUNT');
  return triggers;
}

export function detectGlhForbiddenClaims(
  proposal: GlhAutonomousReplyProposal = {},
): readonly GlhForbiddenClaim[] {
  const detected = new Set<GlhForbiddenClaim>();
  for (const claim of proposal.declaredClaims ?? []) {
    if ((GLH_FORBIDDEN_AUTONOMOUS_CLAIMS as readonly string[]).includes(claim)) detected.add(claim);
  }
  const text = proposal.text?.trim() ?? '';
  if (text) {
    for (const claim of GLH_FORBIDDEN_AUTONOMOUS_CLAIMS) {
      if (FORBIDDEN_TEXT_PATTERNS[claim].some(pattern => pattern.test(text))) detected.add(claim);
    }
  }
  return GLH_FORBIDDEN_AUTONOMOUS_CLAIMS.filter(claim => detected.has(claim));
}

function nextEarlyLifecycle(
  current: GlhLifecycleState,
  handoff: boolean,
  hasQuestions: boolean,
): GlhLifecycleState {
  if (handoff && ['NEW', 'AI_QUALIFYING', 'WAITING_CUSTOMER'].includes(current)) {
    return 'READY_FOR_HUMAN';
  }
  if (current === 'NEW') return 'AI_QUALIFYING';
  if (current === 'AI_QUALIFYING' && hasQuestions) return 'WAITING_CUSTOMER';
  return current;
}

export function qualifyGlhLead(input: GlhQualificationInput): GlhQualificationResult {
  const profile = normalizeGlhQualificationProfile(input.profile);
  const { completeness, missingCoreFields } = calculateGlhCompleteness(profile);
  const { score, grade } = calculateGlhScore(profile);
  const questions = selectGlhQualificationQuestions(profile);
  const handoffTriggers = detectGlhHandoffTriggers(profile, input.signals);
  const forbiddenClaims = detectGlhForbiddenClaims(input.replyProposal);
  const isHumanActive = input.conversationMode === 'HUMAN_ACTIVE';
  const handoffRequired = handoffTriggers.length > 0 || forbiddenClaims.length > 0;
  const nextConversationMode = isHumanActive
    ? 'HUMAN_ACTIVE'
    : handoffRequired
      ? 'HANDOFF_PENDING'
      : input.conversationMode;
  const nextLifecycleState = nextEarlyLifecycle(
    input.lifecycleState,
    handoffRequired,
    questions.length > 0,
  );
  return {
    profile,
    completeness,
    missingCoreFields,
    score,
    grade,
    questions,
    handoffTriggers,
    forbiddenClaims,
    nextLifecycleState,
    nextConversationMode,
    customerFacingAutoSendAllowed:
      input.conversationMode === 'AI_ACTIVE'
      && !handoffRequired
      && questions.length > 0,
    copilotSuggestionsAllowed: true,
  };
}
