import { GLH_PROVIDER_CALLS_ENABLED } from './channels';
import {
  GLH_CONVERSATION_MODES,
  type GlhConversationMode,
} from './domain';
import {
  GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION,
  validateGlhV2InquiryEvidence,
  type GlhV2EvidenceDraft,
  type GlhV2SourceMessage,
  type GlhV2TrustedScope,
} from './v2-inquiry-evidence';

/**
 * Offline-only LLM extraction boundary for GLH V2.
 *
 * Callers may provide an already-produced untrusted model value or an injected
 * inference function. This module never creates a provider client, calls a
 * network API, sends a message, writes business data, calculates a V1 grade, or
 * changes a CPC record.
 */
export const GLH_V2_LLM_EXTRACTION_MODEL_SCHEMA_VERSION =
  'GLH-V2-LLM-EXTRACTION-MODEL-001' as const;
export const GLH_V2_LLM_EXTRACTION_RESULT_SCHEMA_VERSION =
  'GLH-V2-LLM-EXTRACTION-EVAL-001' as const;
export const GLH_V2_LLM_EXTRACTION_CANDIDATE_SCHEMA_VERSION =
  'GLH-V2-LLM-EXTRACTION-CANDIDATE-001' as const;
export const GLH_V2_LLM_EXTRACTION_EVALUATION_SCHEMA_VERSION =
  'GLH-V2-LLM-EXTRACTION-SYNTHETIC-EVALUATION-001' as const;

export const GLH_V2_LLM_EXTRACTION_MAX_MESSAGES = 200;
export const GLH_V2_LLM_EXTRACTION_MAX_MESSAGE_TEXT_CHARS = 20_000;
export const GLH_V2_LLM_EXTRACTION_MAX_TOTAL_TEXT_CHARS = 120_000;
export const GLH_V2_LLM_EXTRACTION_MAX_MODEL_OUTPUT_CHARS = 65_536;
export const GLH_V2_LLM_EXTRACTION_MAX_AMBIGUITIES = 8;
export const GLH_V2_LLM_EXTRACTION_MAX_MISSING_INFORMATION = 3;
export const GLH_V2_LLM_EXTRACTION_DEFAULT_TIMEOUT_MS = 5_000;
export const GLH_V2_LLM_EXTRACTION_LOW_CONFIDENCE_THRESHOLD = 0.6;

export const GLH_V2_EXTRACTION_INTENTS = [
  'FILM',
  'PROCESSING',
  'MACHINE',
  'PROCESS_CONSULT',
  'UNCLEAR',
] as const;

export const GLH_V2_EXTRACTION_LANGUAGES = [
  'EN',
  'ZH',
  'AR',
  'OTHER',
  'UNKNOWN',
] as const;

export const GLH_V2_EXTRACTION_HANDOFF_REASONS = [
  'HUMAN_ACTIVE',
  'PRICE_OR_FORMAL_PRICING',
  'FORMAL_RFQ_OR_SPEC',
  'MACHINE_INQUIRY',
  'SAMPLE_OR_TEST',
  'CUSTOMER_COMPLAINT',
  'RISKY_TECHNICAL_PROMISE',
  'LOW_CONFIDENCE',
  'NO_INBOUND_EVIDENCE',
  'AMBIGUOUS_INTENT',
  'UNTRUSTED_INSTRUCTION_CONTENT',
  'INVALID_INPUT',
  'INVALID_MODEL_OUTPUT',
  'INVALID_EVIDENCE',
  'MODEL_TIMEOUT',
  'MODEL_ERROR',
] as const;

export type GlhV2ExtractionIntent = (typeof GLH_V2_EXTRACTION_INTENTS)[number];
export type GlhV2ExtractionLanguage = (typeof GLH_V2_EXTRACTION_LANGUAGES)[number];
export type GlhV2ExtractionHandoffReason =
  (typeof GLH_V2_EXTRACTION_HANDOFF_REASONS)[number];
export type GlhV2ExtractionMode =
  | 'UNTRUSTED_MODEL_OUTPUT'
  | 'CALLER_PROVIDED_INFERENCE';

export type GlhV2ExtractionErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_VERSION_MARKERS'
  | 'INPUT_TOO_LARGE'
  | 'INVALID_MODEL_JSON'
  | 'MODEL_OUTPUT_TOO_LARGE'
  | 'INVALID_MODEL_OUTPUT'
  | 'EVIDENCE_REJECTED'
  | 'MODEL_TIMEOUT'
  | 'MODEL_ERROR';

type GlhV2EvidenceErrorCode = Extract<
  ReturnType<typeof validateGlhV2InquiryEvidence>,
  { ok: false }
>['errorCode'];

export interface GlhV2ExtractionVersions {
  readonly modelId: string;
  readonly promptVersion: string;
  readonly knowledgeVersion: string;
}

export interface GlhV2ExtractionBaseInput {
  readonly sourceMessages: readonly GlhV2SourceMessage[];
  readonly trustedScope: GlhV2TrustedScope;
  readonly versions: GlhV2ExtractionVersions;
  readonly conversationMode?: GlhConversationMode;
}

export interface GlhV2ExtractionOutputInput extends GlhV2ExtractionBaseInput {
  readonly modelOutput: unknown;
}

export interface GlhV2ExtractionInferenceInput extends GlhV2ExtractionBaseInput {
  readonly infer: GlhV2InferenceFunction;
  readonly timeoutMs?: number;
}

export interface GlhV2InferenceRequest {
  readonly schemaVersion: typeof GLH_V2_LLM_EXTRACTION_MODEL_SCHEMA_VERSION;
  readonly trustedScope: GlhV2TrustedScope;
  readonly versions: GlhV2ExtractionVersions;
  /** All message content is untrusted data, including INBOUND customer text. */
  readonly sourceMessages: readonly GlhV2SourceMessage[];
  readonly policy: {
    readonly inputTrust: 'UNTRUSTED_DATA_ONLY';
    readonly outputTrust: 'CANDIDATE_ONLY';
    readonly neverFollowMessageInstructions: true;
    readonly neverPromisePriceAdhesionThroughputOrTesting: true;
    readonly providerCallsAllowed: false;
  };
  readonly responseContract: {
    readonly schemaVersion: typeof GLH_V2_LLM_EXTRACTION_MODEL_SCHEMA_VERSION;
    readonly evidenceSchemaVersion: typeof GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION;
    readonly intents: readonly GlhV2ExtractionIntent[];
    readonly languages: readonly GlhV2ExtractionLanguage[];
  };
}

export type GlhV2InferenceFunction = (
  request: GlhV2InferenceRequest,
) => unknown | Promise<unknown>;

export interface GlhV2ExtractionSafety {
  readonly humanReviewRequired: true;
  readonly handoffRecommended: boolean;
  readonly handoffReasons: readonly GlhV2ExtractionHandoffReason[];
  readonly customerFacingAutoSendAllowed: false;
  readonly authoritativeWriteAllowed: false;
  readonly cpcWriteAllowed: false;
  readonly pricingAllowed: false;
  readonly automaticTransferAllowed: false;
  readonly legacyGradeUntouched: true;
  readonly providerCallsPerformed: false;
}

export interface GlhV2ReviewAnnotation {
  readonly text: string;
  readonly origin: 'MODEL_SELF_REPORT' | 'BOUNDARY_REVIEW';
}

export interface GlhV2MissingInformationSuggestion {
  readonly question: string;
  readonly origin: 'MODEL_CANDIDATE';
  readonly needsVerification: true;
}

export interface GlhV2ExtractionCandidate {
  readonly schemaVersion: typeof GLH_V2_LLM_EXTRACTION_CANDIDATE_SCHEMA_VERSION;
  readonly evidence: GlhV2EvidenceDraft;
  readonly intent: GlhV2ExtractionIntent;
  readonly language: GlhV2ExtractionLanguage;
  readonly classificationConfidence: {
    readonly intent: number | null;
    readonly language: number | null;
  };
  readonly ambiguities: readonly GlhV2ReviewAnnotation[];
  readonly missingInformationSuggestions: readonly GlhV2MissingInformationSuggestion[];
  readonly reviewOnly: true;
}

interface GlhV2ExtractionSuccessBase {
  readonly ok: true;
  readonly schemaVersion: typeof GLH_V2_LLM_EXTRACTION_RESULT_SCHEMA_VERSION;
  readonly mode: GlhV2ExtractionMode;
  readonly trustedScope: GlhV2TrustedScope;
  readonly versions: GlhV2ExtractionVersions;
  readonly rawModelOutput: string;
  readonly safety: GlhV2ExtractionSafety;
}

export interface GlhV2ExtractionSuccess extends GlhV2ExtractionSuccessBase {
  readonly candidate: GlhV2ExtractionCandidate;
}

export interface GlhV2ExtractionFailure {
  readonly ok: false;
  readonly schemaVersion: typeof GLH_V2_LLM_EXTRACTION_RESULT_SCHEMA_VERSION;
  readonly mode: GlhV2ExtractionMode;
  readonly trustedScope: GlhV2TrustedScope | null;
  readonly versions: GlhV2ExtractionVersions | null;
  readonly errorCode: GlhV2ExtractionErrorCode;
  readonly evidenceErrorCode: GlhV2EvidenceErrorCode | null;
  readonly rawModelOutput: string | null;
  readonly fallback: {
    readonly preserveInboundMessages: true;
    readonly inboundMessages: readonly GlhV2SourceMessage[];
    readonly recommendedAction: 'HUMAN_REVIEW';
  };
  readonly safety: GlhV2ExtractionSafety;
}

export type GlhV2ExtractionResult =
  | GlhV2ExtractionSuccess
  | GlhV2ExtractionFailure;

export interface GlhV2SyntheticEvaluationObservation {
  readonly caseId: string;
  readonly passed: boolean;
  readonly expectedIntent?: GlhV2ExtractionIntent;
  readonly expectedLanguage?: GlhV2ExtractionLanguage;
  readonly result: GlhV2ExtractionResult;
}

export interface GlhV2SyntheticEvaluationSummary {
  readonly schemaVersion: typeof GLH_V2_LLM_EXTRACTION_EVALUATION_SCHEMA_VERSION;
  readonly fixtureCount: number;
  readonly fixturePassedCount: number;
  readonly fixtureFailedCount: number;
  readonly failedCaseIds: readonly string[];
  readonly candidateCount: number;
  readonly errorFallbackCount: number;
  readonly candidateHandoffCount: number;
  readonly intentComparableCount: number;
  readonly intentMatchCount: number;
  readonly languageComparableCount: number;
  readonly languageMatchCount: number;
  readonly handoffReasonCounts: Readonly<Record<GlhV2ExtractionHandoffReason, number>>;
  readonly syntheticOnly: true;
  readonly realModelAccuracy: 'NOT_MEASURED';
  readonly realLlmProviderCalls: 0;
}

interface ParsedModelOutput {
  readonly raw: string;
  readonly value: Record<string, unknown>;
}

interface RequestPrecheck {
  readonly scope: GlhV2TrustedScope;
  readonly versions: GlhV2ExtractionVersions;
  readonly sourceMessages: readonly GlhV2SourceMessage[];
}

const INTENT_SET: ReadonlySet<string> = new Set(GLH_V2_EXTRACTION_INTENTS);
const LANGUAGE_SET: ReadonlySet<string> = new Set(GLH_V2_EXTRACTION_LANGUAGES);
const VERSION_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_REVIEW_TEXT_LIMIT = 300;
const SAFE_SCOPE_ID_LIMIT = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= limit ? trimmed : null;
}

function copyTrustedScope(value: unknown): GlhV2TrustedScope | null {
  if (!isRecord(value)) return null;
  const organizationId = boundedText(value.organizationId, SAFE_SCOPE_ID_LIMIT);
  const inquiryId = boundedText(value.inquiryId, SAFE_SCOPE_ID_LIMIT);
  return organizationId && inquiryId ? { organizationId, inquiryId } : null;
}

function copyVersions(value: unknown): GlhV2ExtractionVersions | null {
  if (!isRecord(value)) return null;
  const modelId = boundedText(value.modelId, 128);
  const promptVersion = boundedText(value.promptVersion, 128);
  const knowledgeVersion = boundedText(value.knowledgeVersion, 128);
  if (!modelId || !promptVersion || !knowledgeVersion
    || !VERSION_PATTERN.test(modelId)
    || !VERSION_PATTERN.test(promptVersion)
    || !VERSION_PATTERN.test(knowledgeVersion)) {
    return null;
  }
  return { modelId, promptVersion, knowledgeVersion };
}

function normalizeConversationMode(value: unknown): GlhConversationMode | null {
  if (value === undefined) return 'AI_ACTIVE';
  return typeof value === 'string'
    && (GLH_CONVERSATION_MODES as readonly string[]).includes(value)
    ? value as GlhConversationMode
    : null;
}

function copyMessages(
  messages: readonly GlhV2SourceMessage[],
): readonly GlhV2SourceMessage[] {
  return messages.map(message => ({
    id: message.id,
    organizationId: message.organizationId,
    inquiryId: message.inquiryId,
    direction: message.direction,
    kind: message.kind,
    text: message.text,
    ...(message.mediaReferences === undefined
      ? {}
      : { mediaReferences: [...message.mediaReferences] }),
  }));
}

function preserveInboundMessages(
  messages: readonly GlhV2SourceMessage[],
  scope: GlhV2TrustedScope | null,
): readonly GlhV2SourceMessage[] {
  if (!Array.isArray(messages)) return [];
  try {
    return copyMessages(messages).filter(message =>
      message.direction === 'INBOUND'
      && (!scope
        || (message.organizationId === scope.organizationId
          && message.inquiryId === scope.inquiryId)),
    );
  } catch {
    return [];
  }
}

function orderedReasons(
  reasons: ReadonlySet<GlhV2ExtractionHandoffReason>,
): readonly GlhV2ExtractionHandoffReason[] {
  return GLH_V2_EXTRACTION_HANDOFF_REASONS.filter(reason => reasons.has(reason));
}

function makeSafety(
  handoffReasons: readonly GlhV2ExtractionHandoffReason[],
): GlhV2ExtractionSafety {
  return {
    humanReviewRequired: true,
    handoffRecommended: handoffReasons.length > 0,
    handoffReasons,
    customerFacingAutoSendAllowed: false,
    authoritativeWriteAllowed: false,
    cpcWriteAllowed: false,
    pricingAllowed: false,
    automaticTransferAllowed: false,
    legacyGradeUntouched: true,
    providerCallsPerformed: false,
  };
}

function failureReasonForError(
  errorCode: GlhV2ExtractionErrorCode,
): GlhV2ExtractionHandoffReason {
  if (errorCode === 'MODEL_TIMEOUT') return 'MODEL_TIMEOUT';
  if (errorCode === 'MODEL_ERROR') return 'MODEL_ERROR';
  if (errorCode === 'EVIDENCE_REJECTED') return 'INVALID_EVIDENCE';
  if (errorCode === 'INPUT_TOO_LARGE' || errorCode === 'INVALID_INPUT'
    || errorCode === 'INVALID_VERSION_MARKERS') {
    return 'INVALID_INPUT';
  }
  return 'INVALID_MODEL_OUTPUT';
}

function makeFailure(input: {
  readonly errorCode: GlhV2ExtractionErrorCode;
  readonly mode: GlhV2ExtractionMode;
  readonly scope: GlhV2TrustedScope | null;
  readonly versions: GlhV2ExtractionVersions | null;
  readonly sourceMessages: readonly GlhV2SourceMessage[];
  readonly rawModelOutput?: string | null;
  readonly evidenceErrorCode?: GlhV2EvidenceErrorCode | null;
  readonly extraReasons?: readonly GlhV2ExtractionHandoffReason[];
}): GlhV2ExtractionFailure {
  const reasons = new Set<GlhV2ExtractionHandoffReason>([
    failureReasonForError(input.errorCode),
    ...(input.extraReasons ?? []),
  ]);
  return {
    ok: false,
    schemaVersion: GLH_V2_LLM_EXTRACTION_RESULT_SCHEMA_VERSION,
    mode: input.mode,
    trustedScope: input.scope,
    versions: input.versions,
    errorCode: input.errorCode,
    evidenceErrorCode: input.evidenceErrorCode ?? null,
    rawModelOutput: input.rawModelOutput ?? null,
    fallback: {
      preserveInboundMessages: true,
      inboundMessages: preserveInboundMessages(input.sourceMessages, input.scope),
      recommendedAction: 'HUMAN_REVIEW',
    },
    safety: makeSafety(orderedReasons(reasons)),
  };
}

function precheckRequest(input: GlhV2ExtractionBaseInput): {
  readonly precheck: RequestPrecheck | null;
  readonly failure: GlhV2ExtractionFailure | null;
  readonly mode: GlhV2ExtractionMode;
} {
  const mode: GlhV2ExtractionMode = 'CALLER_PROVIDED_INFERENCE';
  if (!input || !Array.isArray(input.sourceMessages)) {
    return {
      precheck: null,
      mode,
      failure: makeFailure({
        errorCode: 'INVALID_INPUT',
        mode,
        scope: null,
        versions: null,
        sourceMessages: [],
      }),
    };
  }

  const scope = copyTrustedScope(input.trustedScope);
  const versions = copyVersions(input.versions);
  if (!versions) {
    return {
      precheck: null,
      mode,
      failure: makeFailure({
        errorCode: 'INVALID_VERSION_MARKERS',
        mode,
        scope,
        versions: null,
        sourceMessages: input.sourceMessages,
      }),
    };
  }
  if (!scope) {
    return {
      precheck: null,
      mode,
      failure: makeFailure({
        errorCode: 'INVALID_INPUT',
        evidenceErrorCode: 'INVALID_TRUSTED_SCOPE',
        mode,
        scope: null,
        versions,
        sourceMessages: input.sourceMessages,
      }),
    };
  }
  if (input.sourceMessages.length > GLH_V2_LLM_EXTRACTION_MAX_MESSAGES) {
    return {
      precheck: null,
      mode,
      failure: makeFailure({
        errorCode: 'INPUT_TOO_LARGE',
        mode,
        scope,
        versions,
        sourceMessages: [],
      }),
    };
  }

  let totalTextCharacters = 0;
  for (const message of input.sourceMessages) {
    if (!message || typeof message !== 'object') continue;
    if (typeof message.text === 'string') {
      if (message.text.length > GLH_V2_LLM_EXTRACTION_MAX_MESSAGE_TEXT_CHARS) {
        return {
          precheck: null,
          mode,
          failure: makeFailure({
            errorCode: 'INPUT_TOO_LARGE',
            mode,
            scope,
            versions,
            sourceMessages: [],
          }),
        };
      }
      totalTextCharacters += message.text.length;
    }
  }

  if (totalTextCharacters > GLH_V2_LLM_EXTRACTION_MAX_TOTAL_TEXT_CHARS) {
    return {
      precheck: null,
      mode,
      failure: makeFailure({
        errorCode: 'INPUT_TOO_LARGE',
        mode,
        scope,
        versions,
        sourceMessages: [],
      }),
    };
  }

  const sourceValidation = validateGlhV2InquiryEvidence({
    schemaVersion: GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION,
    inquiryId: scope.inquiryId,
    claims: [],
  }, input.sourceMessages, scope);
  if (!sourceValidation.ok) {
    return {
      precheck: null,
      mode,
      failure: makeFailure({
        errorCode: 'INVALID_INPUT',
        evidenceErrorCode: sourceValidation.errorCode,
        mode,
        scope,
        versions,
        sourceMessages: input.sourceMessages,
      }),
    };
  }

  return {
    precheck: {
      scope,
      versions,
      sourceMessages: input.sourceMessages,
    },
    failure: null,
    mode,
  };
}

function parseModelOutput(modelOutput: unknown): {
  readonly parsed: ParsedModelOutput | null;
  readonly raw: string | null;
  readonly errorCode: Extract<
    GlhV2ExtractionErrorCode,
    'INVALID_MODEL_JSON' | 'MODEL_OUTPUT_TOO_LARGE' | 'INVALID_MODEL_OUTPUT'
  > | null;
} {
  let raw: string;
  let value: unknown;

  if (typeof modelOutput === 'string') {
    raw = modelOutput;
    if (raw.length > GLH_V2_LLM_EXTRACTION_MAX_MODEL_OUTPUT_CHARS) {
      return { parsed: null, raw: null, errorCode: 'MODEL_OUTPUT_TOO_LARGE' };
    }
    try {
      value = JSON.parse(raw);
    } catch {
      return { parsed: null, raw, errorCode: 'INVALID_MODEL_JSON' };
    }
  } else {
    try {
      const serialized = JSON.stringify(modelOutput);
      if (serialized === undefined) {
        return { parsed: null, raw: null, errorCode: 'INVALID_MODEL_OUTPUT' };
      }
      raw = serialized;
      if (raw.length > GLH_V2_LLM_EXTRACTION_MAX_MODEL_OUTPUT_CHARS) {
        return { parsed: null, raw: null, errorCode: 'MODEL_OUTPUT_TOO_LARGE' };
      }
      value = JSON.parse(raw);
    } catch {
      return { parsed: null, raw: null, errorCode: 'INVALID_MODEL_OUTPUT' };
    }
  }

  if (!isRecord(value)) {
    return { parsed: null, raw, errorCode: 'INVALID_MODEL_OUTPUT' };
  }
  return { parsed: { raw, value }, raw, errorCode: null };
}

function normalizeIntent(value: unknown): GlhV2ExtractionIntent | null {
  if (value === undefined || value === null || value === '') return 'UNCLEAR';
  return typeof value === 'string' && INTENT_SET.has(value)
    ? value as GlhV2ExtractionIntent
    : null;
}

function normalizeLanguage(value: unknown): GlhV2ExtractionLanguage | null {
  if (value === undefined || value === null || value === '') return 'UNKNOWN';
  return typeof value === 'string' && LANGUAGE_SET.has(value)
    ? value as GlhV2ExtractionLanguage
    : null;
}

function normalizeConfidence(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)
    || value < 0 || value > 1) {
    return undefined;
  }
  return value;
}

function normalizeReviewTexts(
  value: unknown,
  limit: number,
): readonly string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > limit) return null;
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = boundedText(item, SAFE_REVIEW_TEXT_LIMIT);
    if (!text) return null;
    if (!seen.has(text)) {
      seen.add(text);
      normalized.push(text);
    }
  }
  return normalized;
}

function messageCorpus(messages: readonly GlhV2SourceMessage[]): string {
  return messages
    .filter(message => message.direction === 'INBOUND' && typeof message.text === 'string')
    .map(message => message.text ?? '')
    .join('\n')
    .toLowerCase();
}

function detectTrustedHandoffReasons(input: {
  readonly sourceMessages: readonly GlhV2SourceMessage[];
  readonly evidence: GlhV2EvidenceDraft;
  readonly intent: GlhV2ExtractionIntent;
  readonly intentConfidence: number | null;
  readonly languageConfidence: number | null;
  readonly conversationMode: GlhConversationMode;
}): ReadonlySet<GlhV2ExtractionHandoffReason> {
  const reasons = new Set<GlhV2ExtractionHandoffReason>();
  const inbound = input.sourceMessages.filter(message => message.direction === 'INBOUND');
  const corpus = [
    messageCorpus(input.sourceMessages),
    ...input.evidence.claims.map(claim => claim.value.toLowerCase()),
  ].join('\n');
  const claimFields = new Set(input.evidence.claims.map(claim => claim.field));

  if (input.conversationMode === 'HUMAN_ACTIVE') reasons.add('HUMAN_ACTIVE');
  if (inbound.length === 0) reasons.add('NO_INBOUND_EVIDENCE');

  if (/\b(?:price|pricing|quotation|quote|cost)\b|价格|报价|多少钱|سعر|عرض\s*سعر/i.test(corpus)) {
    reasons.add('PRICE_OR_FORMAL_PRICING');
  }
  if (/\brfq\b|request\s+for\s+quotation|formal\s+(?:quote|quotation|specification|drawing)|specification|drawing|طلب\s+عرض|مواصفات|规格书|图纸/i.test(corpus)) {
    reasons.add('FORMAL_RFQ_OR_SPEC');
  }
  if (input.intent === 'MACHINE'
    || /\bmachine\b|\bequipment\b|设备|机器|آلة|معدات/i.test(corpus)) {
    reasons.add('MACHINE_INQUIRY');
  }
  if (claimFields.has('sampleIntent') || claimFields.has('testRequirements')
    || /\bsample\b|\btest(?:ing)?\b|打样|测试|عينة|اختبار/i.test(corpus)) {
    reasons.add('SAMPLE_OR_TEST');
  }
  if (/\bcomplaint\b|\bunhappy\b|\bunsatisfied\b|\bdefect(?:ive)?\b|\bbad\s+quality\b|投诉|质量问题|缺陷|شكوى|عيب|جودة\s+سيئة/i.test(corpus)) {
    reasons.add('CUSTOMER_COMPLAINT');
  }
  if (/\bguarantee(?:d)?\b|\badhesion\b|\bthroughput\b|\bdishwasher\b|\bcapacity\s+promise\b|附着力|洗碗机|产能保障|ضمان|التصاق|قدرة\s+إنتاجية/i.test(corpus)) {
    reasons.add('RISKY_TECHNICAL_PROMISE');
  }

  const confidenceValues = [
    input.intentConfidence,
    input.languageConfidence,
    ...input.evidence.claims.map(claim => claim.confidence),
  ];
  if (confidenceValues.some(value =>
    value === null || value < GLH_V2_LLM_EXTRACTION_LOW_CONFIDENCE_THRESHOLD,
  )) {
    reasons.add('LOW_CONFIDENCE');
  }

  if (input.intent === 'UNCLEAR') reasons.add('AMBIGUOUS_INTENT');
  const claimedIntent = input.evidence.claims.find(claim =>
    claim.field === 'requirementType'
    && INTENT_SET.has(claim.value.toUpperCase()),
  );
  if (claimedIntent && input.intent !== 'UNCLEAR'
    && claimedIntent.value.toUpperCase() !== input.intent) {
    reasons.add('AMBIGUOUS_INTENT');
  }

  if (/\b(?:ignore|disregard|forget)\b.{0,40}\b(?:instruction|prompt|rule)s?\b|\bsystem\s+prompt\b|\byou\s+are\s+now\b|忽略.{0,20}(?:指令|规则|提示词)|تجاهل.{0,30}(?:تعليمات|قواعد)/i.test(corpus)) {
    reasons.add('UNTRUSTED_INSTRUCTION_CONTENT');
  }

  return reasons;
}

function boundaryAmbiguities(input: {
  readonly intent: GlhV2ExtractionIntent;
  readonly language: GlhV2ExtractionLanguage;
  readonly handoffReasons: readonly GlhV2ExtractionHandoffReason[];
  readonly evidence: GlhV2EvidenceDraft;
}): readonly string[] {
  const notes: string[] = [];
  if (input.intent === 'UNCLEAR') notes.push('Intent remains unclear.');
  if (input.language === 'UNKNOWN') notes.push('Language could not be identified.');
  if (input.handoffReasons.includes('LOW_CONFIDENCE')) {
    notes.push('At least one model confidence is missing or below the review threshold.');
  }
  if (input.handoffReasons.includes('AMBIGUOUS_INTENT')) {
    notes.push('Intent and requirementType evidence do not agree or remain unclear.');
  }
  if (input.handoffReasons.includes('UNTRUSTED_INSTRUCTION_CONTENT')) {
    notes.push('Instruction-like customer text was retained as data only.');
  }
  if (input.evidence.claims.some(claim =>
    claim.value.toUpperCase() === 'UNKNOWN',
  )) {
    notes.push('The model returned UNKNOWN as a candidate value; no fact was accepted.');
  }
  return notes;
}

function evaluateParsedOutput(input: {
  readonly parsed: ParsedModelOutput;
  readonly mode: GlhV2ExtractionMode;
  readonly sourceMessages: readonly GlhV2SourceMessage[];
  readonly trustedScope: GlhV2TrustedScope;
  readonly versions: GlhV2ExtractionVersions;
  readonly conversationMode: GlhConversationMode;
}): GlhV2ExtractionResult {
  const proposal = input.parsed.value;
  if (proposal.schemaVersion !== GLH_V2_LLM_EXTRACTION_MODEL_SCHEMA_VERSION) {
    return makeFailure({
      errorCode: 'INVALID_MODEL_OUTPUT',
      mode: input.mode,
      scope: input.trustedScope,
      versions: input.versions,
      sourceMessages: input.sourceMessages,
      rawModelOutput: input.parsed.raw,
    });
  }

  const intent = normalizeIntent(proposal.intent);
  const language = normalizeLanguage(proposal.language);
  const intentConfidence = normalizeConfidence(proposal.intentConfidence);
  const languageConfidence = normalizeConfidence(proposal.languageConfidence);
  const ambiguities = normalizeReviewTexts(
    proposal.ambiguities,
    GLH_V2_LLM_EXTRACTION_MAX_AMBIGUITIES,
  );
  const missingInformation = normalizeReviewTexts(
    proposal.missingInformationSuggestions,
    GLH_V2_LLM_EXTRACTION_MAX_MISSING_INFORMATION,
  );

  if (!intent || !language || intentConfidence === undefined
    || languageConfidence === undefined || !ambiguities || !missingInformation) {
    return makeFailure({
      errorCode: 'INVALID_MODEL_OUTPUT',
      mode: input.mode,
      scope: input.trustedScope,
      versions: input.versions,
      sourceMessages: input.sourceMessages,
      rawModelOutput: input.parsed.raw,
    });
  }

  const evidenceResult = validateGlhV2InquiryEvidence({
    schemaVersion: GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION,
    inquiryId: proposal.inquiryId,
    claims: proposal.claims,
  }, input.sourceMessages, input.trustedScope);

  if (!evidenceResult.ok) {
    return makeFailure({
      errorCode: 'EVIDENCE_REJECTED',
      evidenceErrorCode: evidenceResult.errorCode,
      mode: input.mode,
      scope: input.trustedScope,
      versions: input.versions,
      sourceMessages: input.sourceMessages,
      rawModelOutput: input.parsed.raw,
    });
  }

  const reasonSet = detectTrustedHandoffReasons({
    sourceMessages: input.sourceMessages,
    evidence: evidenceResult.data,
    intent,
    intentConfidence,
    languageConfidence,
    conversationMode: input.conversationMode,
  });
  const handoffReasons = orderedReasons(reasonSet);
  const boundaryNotes = boundaryAmbiguities({
    intent,
    language,
    handoffReasons,
    evidence: evidenceResult.data,
  });

  return {
    ok: true,
    schemaVersion: GLH_V2_LLM_EXTRACTION_RESULT_SCHEMA_VERSION,
    mode: input.mode,
    trustedScope: input.trustedScope,
    versions: input.versions,
    rawModelOutput: input.parsed.raw,
    candidate: {
      schemaVersion: GLH_V2_LLM_EXTRACTION_CANDIDATE_SCHEMA_VERSION,
      evidence: evidenceResult.data,
      intent,
      language,
      classificationConfidence: {
        intent: intentConfidence,
        language: languageConfidence,
      },
      ambiguities: [
        ...ambiguities.map(text => ({
          text,
          origin: 'MODEL_SELF_REPORT' as const,
        })),
        ...boundaryNotes.map(text => ({
          text,
          origin: 'BOUNDARY_REVIEW' as const,
        })),
      ],
      missingInformationSuggestions: missingInformation.map(question => ({
        question,
        origin: 'MODEL_CANDIDATE',
        needsVerification: true,
      })),
      reviewOnly: true,
    },
    safety: makeSafety(handoffReasons),
  };
}

/**
 * Synchronously evaluate a caller-supplied untrusted model value. The value may
 * be an object or a JSON text response. This function does not perform I/O.
 */
export function evaluateGlhV2ModelOutput(
  input: GlhV2ExtractionOutputInput,
): GlhV2ExtractionResult {
  const checked = precheckRequest(input);
  const mode: GlhV2ExtractionMode = 'UNTRUSTED_MODEL_OUTPUT';
  if (!checked.precheck || checked.failure) {
    return checked.failure
      ? { ...checked.failure, mode }
      : makeFailure({
        errorCode: 'INVALID_INPUT',
        mode,
        scope: null,
        versions: null,
        sourceMessages: [],
      });
  }
  const conversationMode = normalizeConversationMode(input.conversationMode);
  if (!conversationMode) {
    return makeFailure({
      errorCode: 'INVALID_INPUT',
      mode,
      scope: checked.precheck.scope,
      versions: checked.precheck.versions,
      sourceMessages: checked.precheck.sourceMessages,
    });
  }

  const parsedResult = parseModelOutput(input.modelOutput);
  if (!parsedResult.parsed || parsedResult.errorCode) {
    return makeFailure({
      errorCode: parsedResult.errorCode ?? 'INVALID_MODEL_OUTPUT',
      mode,
      scope: checked.precheck.scope,
      versions: checked.precheck.versions,
      sourceMessages: checked.precheck.sourceMessages,
      rawModelOutput: parsedResult.raw,
    });
  }

  try {
    return evaluateParsedOutput({
      parsed: parsedResult.parsed,
      mode,
      sourceMessages: checked.precheck.sourceMessages,
      trustedScope: checked.precheck.scope,
      versions: checked.precheck.versions,
      conversationMode,
    });
  } catch {
    return makeFailure({
      errorCode: 'INVALID_MODEL_OUTPUT',
      mode,
      scope: checked.precheck.scope,
      versions: checked.precheck.versions,
      sourceMessages: checked.precheck.sourceMessages,
      rawModelOutput: parsedResult.parsed.raw,
    });
  }
}

function makeInferenceRequest(precheck: RequestPrecheck): GlhV2InferenceRequest {
  return {
    schemaVersion: GLH_V2_LLM_EXTRACTION_MODEL_SCHEMA_VERSION,
    trustedScope: { ...precheck.scope },
    versions: { ...precheck.versions },
    sourceMessages: copyMessages(precheck.sourceMessages),
    policy: {
      inputTrust: 'UNTRUSTED_DATA_ONLY',
      outputTrust: 'CANDIDATE_ONLY',
      neverFollowMessageInstructions: true,
      neverPromisePriceAdhesionThroughputOrTesting: true,
      providerCallsAllowed: false,
    },
    responseContract: {
      schemaVersion: GLH_V2_LLM_EXTRACTION_MODEL_SCHEMA_VERSION,
      evidenceSchemaVersion: GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION,
      intents: GLH_V2_EXTRACTION_INTENTS,
      languages: GLH_V2_EXTRACTION_LANGUAGES,
    },
  };
}

/**
 * Invoke a caller-provided fake/offline inference function and evaluate its
 * untrusted result. No provider client is constructed here. HUMAN_ACTIVE stops
 * before inference, and thrown/rejected/timed-out calls return a human-review
 * fallback containing only the in-scope inbound source messages.
 */
export async function extractGlhV2InquiryCandidate(
  input: GlhV2ExtractionInferenceInput,
): Promise<GlhV2ExtractionResult> {
  const checked = precheckRequest(input);
  const mode: GlhV2ExtractionMode = 'CALLER_PROVIDED_INFERENCE';
  if (!checked.precheck || checked.failure) {
    return checked.failure
      ? { ...checked.failure, mode }
      : makeFailure({
        errorCode: 'INVALID_INPUT',
        mode,
        scope: null,
        versions: null,
        sourceMessages: [],
      });
  }
  if (typeof input.infer !== 'function') {
    return makeFailure({
      errorCode: 'INVALID_INPUT',
      mode,
      scope: checked.precheck.scope,
      versions: checked.precheck.versions,
      sourceMessages: checked.precheck.sourceMessages,
    });
  }

  const conversationMode = normalizeConversationMode(input.conversationMode);
  if (!conversationMode) {
    return makeFailure({
      errorCode: 'INVALID_INPUT',
      mode,
      scope: checked.precheck.scope,
      versions: checked.precheck.versions,
      sourceMessages: checked.precheck.sourceMessages,
    });
  }
  if (conversationMode === 'HUMAN_ACTIVE') {
    return makeFailure({
      errorCode: 'INVALID_INPUT',
      mode,
      scope: checked.precheck.scope,
      versions: checked.precheck.versions,
      sourceMessages: checked.precheck.sourceMessages,
      extraReasons: ['HUMAN_ACTIVE'],
    });
  }

  const requestedTimeout = input.timeoutMs
    ?? GLH_V2_LLM_EXTRACTION_DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(requestedTimeout)
    || requestedTimeout < 1
    || requestedTimeout > 30_000) {
    return makeFailure({
      errorCode: 'INVALID_INPUT',
      mode,
      scope: checked.precheck.scope,
      versions: checked.precheck.versions,
      sourceMessages: checked.precheck.sourceMessages,
    });
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<{ readonly kind: 'timeout' }>(resolve => {
    timer = setTimeout(() => resolve({ kind: 'timeout' }), requestedTimeout);
  });
  const inference = Promise.resolve()
    .then(() => input.infer(makeInferenceRequest(checked.precheck!)))
    .then(
      value => ({ kind: 'value' as const, value }),
      () => ({ kind: 'error' as const }),
    );

  let outcome:
    | { readonly kind: 'value'; readonly value: unknown }
    | { readonly kind: 'error' }
    | { readonly kind: 'timeout' };
  try {
    outcome = await Promise.race([inference, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (outcome.kind === 'timeout') {
    return makeFailure({
      errorCode: 'MODEL_TIMEOUT',
      mode,
      scope: checked.precheck.scope,
      versions: checked.precheck.versions,
      sourceMessages: checked.precheck.sourceMessages,
    });
  }
  if (outcome.kind === 'error') {
    return makeFailure({
      errorCode: 'MODEL_ERROR',
      mode,
      scope: checked.precheck.scope,
      versions: checked.precheck.versions,
      sourceMessages: checked.precheck.sourceMessages,
    });
  }

  const parsedResult = parseModelOutput(outcome.value);
  if (!parsedResult.parsed || parsedResult.errorCode) {
    return makeFailure({
      errorCode: parsedResult.errorCode ?? 'INVALID_MODEL_OUTPUT',
      mode,
      scope: checked.precheck.scope,
      versions: checked.precheck.versions,
      sourceMessages: checked.precheck.sourceMessages,
      rawModelOutput: parsedResult.raw,
    });
  }

  try {
    return evaluateParsedOutput({
      parsed: parsedResult.parsed,
      mode,
      sourceMessages: checked.precheck.sourceMessages,
      trustedScope: checked.precheck.scope,
      versions: checked.precheck.versions,
      conversationMode,
    });
  } catch {
    return makeFailure({
      errorCode: 'INVALID_MODEL_OUTPUT',
      mode,
      scope: checked.precheck.scope,
      versions: checked.precheck.versions,
      sourceMessages: checked.precheck.sourceMessages,
      rawModelOutput: parsedResult.parsed.raw,
    });
  }
}

/**
 * Count deterministic synthetic fixture outcomes. These are stub observations,
 * not evidence of real-model language or extraction accuracy.
 */
export function summarizeGlhV2SyntheticEvaluation(
  observations: readonly GlhV2SyntheticEvaluationObservation[],
): GlhV2SyntheticEvaluationSummary {
  let fixturePassedCount = 0;
  let candidateCount = 0;
  let errorFallbackCount = 0;
  let candidateHandoffCount = 0;
  let intentComparableCount = 0;
  let intentMatchCount = 0;
  let languageComparableCount = 0;
  let languageMatchCount = 0;
  const failedCaseIds: string[] = [];
  const handoffReasonCounts = Object.fromEntries(
    GLH_V2_EXTRACTION_HANDOFF_REASONS.map(reason => [reason, 0]),
  ) as Record<GlhV2ExtractionHandoffReason, number>;

  for (const observation of observations) {
    if (observation.passed) {
      fixturePassedCount += 1;
    } else {
      failedCaseIds.push(observation.caseId);
    }

    for (const reason of observation.result.safety.handoffReasons) {
      handoffReasonCounts[reason] += 1;
    }

    if (!observation.result.ok) {
      errorFallbackCount += 1;
      continue;
    }

    candidateCount += 1;
    if (observation.result.safety.handoffRecommended) candidateHandoffCount += 1;
    if (observation.expectedIntent !== undefined) {
      intentComparableCount += 1;
      if (observation.result.candidate.intent === observation.expectedIntent) {
        intentMatchCount += 1;
      }
    }
    if (observation.expectedLanguage !== undefined) {
      languageComparableCount += 1;
      if (observation.result.candidate.language === observation.expectedLanguage) {
        languageMatchCount += 1;
      }
    }
  }

  return {
    schemaVersion: GLH_V2_LLM_EXTRACTION_EVALUATION_SCHEMA_VERSION,
    fixtureCount: observations.length,
    fixturePassedCount,
    fixtureFailedCount: observations.length - fixturePassedCount,
    failedCaseIds,
    candidateCount,
    errorFallbackCount,
    candidateHandoffCount,
    intentComparableCount,
    intentMatchCount,
    languageComparableCount,
    languageMatchCount,
    handoffReasonCounts,
    syntheticOnly: true,
    realModelAccuracy: 'NOT_MEASURED',
    realLlmProviderCalls: 0,
  };
}

export const GLH_V2_LLM_PROVIDER_CALLS_ENABLED = GLH_PROVIDER_CALLS_ENABLED;
