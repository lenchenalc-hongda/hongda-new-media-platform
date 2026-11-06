import { createHash } from 'node:crypto';
import {
  GLH_PROVIDER_CALLS_ENABLED,
  isGlhChannelProvider,
  type GlhChannelProvider,
} from './channels';
import {
  GLH_CONVERSATION_MODES,
  isGlhConversationMode,
  type GlhConversationMode,
} from './domain';

/**
 * GLH V2-F offline multichannel intake.
 *
 * This module is a pure synthetic data-boundary slice. It does not route
 * webhooks, read credentials, call a provider, persist data, or send messages.
 */
export const GLH_V2F_MULTICHANNEL_EVENT_SCHEMA_VERSION =
  'GLH-V2F-MULTICHANNEL-EVENT-001';
export const GLH_V2F_MAX_BODY_CHARS = 100_000;
export const GLH_V2F_MAX_MEDIA_IDS_PER_EVENT = 32;

export const GLH_V2F_CHANNEL_SURFACES = {
  WHATSAPP: 'WHATSAPP',
  FACEBOOK: 'FACEBOOK_MESSENGER',
  INSTAGRAM: 'INSTAGRAM_DM',
} as const;

export type GlhV2FChannelSurface =
  (typeof GLH_V2F_CHANNEL_SURFACES)[GlhChannelProvider];

export interface GlhV2FTrustedChannelBinding {
  readonly organizationId: string;
  readonly inquiryId: string;
  readonly channelAccount: {
    readonly id: string;
    readonly organizationId: string;
    readonly provider: GlhChannelProvider;
    readonly externalAccountId: string;
  };
}

export interface GlhV2FClientScopeClaim {
  readonly organizationId?: string;
  readonly inquiryId?: string;
  readonly channelAccountId?: string;
}

/**
 * Synthetic provider event. Scope-like fields are claims only and are checked
 * against the trusted binding; they never determine the stored scope.
 */
export interface GlhV2FProviderInboundEventInput {
  readonly schemaVersion: typeof GLH_V2F_MULTICHANNEL_EVENT_SCHEMA_VERSION;
  readonly provider: string;
  readonly externalAccountId: string;
  readonly externalEventId: string;
  readonly externalMessageId: string;
  readonly externalConversationId: string;
  readonly externalContactId: string;
  readonly direction: string;
  readonly sourceTimestamp: string;
  readonly body: string;
  readonly mediaIds?: readonly string[];
  readonly clientScope?: GlhV2FClientScopeClaim;
  readonly replayFingerprint?: string;
  readonly idempotencyKey?: string;
}

export interface GlhV2FCanonicalInboundEvent {
  readonly schemaVersion: typeof GLH_V2F_MULTICHANNEL_EVENT_SCHEMA_VERSION;
  readonly eventId: string;
  readonly messageId: string;
  readonly organizationId: string;
  readonly inquiryId: string;
  readonly channelAccountId: string;
  readonly provider: GlhChannelProvider;
  readonly surface: GlhV2FChannelSurface;
  readonly externalAccountId: string;
  readonly externalEventId: string;
  readonly externalMessageId: string;
  readonly externalConversationId: string;
  readonly externalContactId: string;
  readonly direction: 'INBOUND';
  readonly sourceTimestamp: string;
  readonly body: string;
  readonly mediaIds: readonly string[];
  readonly fingerprint: string;
  readonly idempotencyKey: string;
  readonly previousFingerprint: string | null;
}

export type GlhV2FStoredMultichannelEvent = GlhV2FCanonicalInboundEvent;

export const GLH_V2F_INTAKE_ERROR_CODES = [
  'INVALID_TRUSTED_BINDING',
  'INVALID_EVENT',
  'INVALID_IDENTIFIER',
  'UNTRUSTED_SCOPE_MISMATCH',
  'PROVIDER_ACCOUNT_MISMATCH',
  'WRONG_DIRECTION',
  'INVALID_TIMESTAMP',
  'INVALID_BODY',
  'DUPLICATE_MEDIA_INPUT',
  'HISTORY_SCOPE_MISMATCH',
  'HISTORY_TAMPERED',
  'STALE_HISTORY',
  'REPLAY_FINGERPRINT_CONFLICT',
  'IDEMPOTENCY_MISMATCH',
  'DUPLICATE_EVENT',
  'DUPLICATE_MESSAGE',
  'DUPLICATE_MEDIA',
] as const;

export type GlhV2FIntakeErrorCode =
  (typeof GLH_V2F_INTAKE_ERROR_CODES)[number];

export type GlhV2FIntakeResult =
  | {
      readonly ok: true;
      readonly status: 'ACCEPTED';
      readonly event: GlhV2FCanonicalInboundEvent;
      readonly originalEventPreserved: true;
      readonly providerCallsPerformed: 0;
      readonly customerFacingAutoSendAllowed: false;
    }
  | {
      readonly ok: false;
      readonly status: 'REJECTED';
      readonly errorCode: GlhV2FIntakeErrorCode;
      readonly originalEventPreserved: true;
      readonly providerCallsPerformed: 0;
      readonly customerFacingAutoSendAllowed: false;
    };

export interface GlhV2FIngestRequest {
  readonly trustedBinding: GlhV2FTrustedChannelBinding;
  readonly event: GlhV2FProviderInboundEventInput | unknown;
  /**
   * Trusted server snapshot of the current history head. It is required even
   * for an empty history so a truncated/stale history cannot silently pass.
   */
  readonly expectedHistoryHeadFingerprint: string | null;
  readonly history?: readonly GlhV2FStoredMultichannelEvent[] | readonly unknown[];
}

export interface GlhV2FDraftOnlyAiSuggestion {
  readonly text: string;
  readonly state: 'DRAFT_ONLY';
  readonly humanReviewRequired: true;
  readonly businessFact: false;
}

export interface GlhV2FHandoffSafetyPlan {
  readonly conversationMode: GlhConversationMode;
  readonly handoffInterrupted: boolean;
  readonly aiSuggestion: GlhV2FDraftOnlyAiSuggestion | null;
  readonly customerFacingAutoSendAllowed: false;
  readonly providerSendAllowed: false;
  readonly providerCallsPerformed: 0;
  readonly preserveOriginalEvent: true;
  readonly humanReviewRequired: true;
  readonly handoffRequired: boolean;
}

interface CanonicalFields {
  readonly organizationId: string;
  readonly inquiryId: string;
  readonly channelAccountId: string;
  readonly provider: GlhChannelProvider;
  readonly externalAccountId: string;
  readonly externalEventId: string;
  readonly externalMessageId: string;
  readonly externalConversationId: string;
  readonly externalContactId: string;
  readonly sourceTimestamp: string;
  readonly body: string;
  readonly mediaIds: readonly string[];
}

type CanonicalBuildResult =
  | { readonly ok: true; readonly value: CanonicalFields }
  | { readonly ok: false; readonly errorCode: GlhV2FIntakeErrorCode };

type HistoryValidationResult =
  | {
      readonly ok: true;
      readonly headFingerprint: string | null;
      readonly eventsById: ReadonlyMap<string, GlhV2FCanonicalInboundEvent>;
      readonly messagesById: ReadonlySet<string>;
      readonly mediaById: ReadonlySet<string>;
    }
  | { readonly ok: false; readonly errorCode: GlhV2FIntakeErrorCode };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function readOpaqueId(value: unknown): string | null {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > 512
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }
  return value;
}

function readOptionalId(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  return readOpaqueId(value);
}

function isNormalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[9] === undefined ? 0 : Number(match[9]);
  const offsetMinute = match[10] === undefined ? 0 : Number(match[10]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return month >= 1
    && month <= 12
    && day >= 1
    && day <= daysInMonth[month - 1]
    && hour <= 23
    && minute <= 59
    && second <= 59
    && offsetHour <= 14
    && offsetMinute <= 59
    && (offsetHour < 14 || offsetMinute === 0);
}

function hashCanonical(parts: readonly unknown[]): string {
  return createHash('sha256')
    .update(JSON.stringify(parts), 'utf8')
    .digest('hex');
}

function canonicalEventId(
  provider: GlhChannelProvider,
  externalAccountId: string,
  externalEventId: string,
): string {
  return `v2f-event:${hashCanonical([
    'EVENT',
    provider,
    externalAccountId,
    externalEventId,
  ])}`;
}

function canonicalMessageId(
  provider: GlhChannelProvider,
  externalAccountId: string,
  externalMessageId: string,
): string {
  return `v2f-message:${hashCanonical([
    'MESSAGE',
    provider,
    externalAccountId,
    externalMessageId,
  ])}`;
}

function canonicalMediaId(
  provider: GlhChannelProvider,
  externalAccountId: string,
  externalMediaId: string,
): string {
  return `v2f-media:${hashCanonical([
    'MEDIA',
    provider,
    externalAccountId,
    externalMediaId,
  ])}`;
}

function eventFingerprint(
  fields: CanonicalFields,
  eventId: string,
  messageId: string,
): string {
  return hashCanonical([
    GLH_V2F_MULTICHANNEL_EVENT_SCHEMA_VERSION,
    eventId,
    messageId,
    fields.organizationId,
    fields.inquiryId,
    fields.channelAccountId,
    fields.provider,
    fields.externalAccountId,
    fields.externalEventId,
    fields.externalMessageId,
    fields.externalConversationId,
    fields.externalContactId,
    'INBOUND',
    fields.sourceTimestamp,
    fields.body,
    fields.mediaIds,
  ]);
}

function idempotencyKey(
  fields: CanonicalFields,
  eventId: string,
): string {
  return `v2f-idem:${hashCanonical([
    'INBOUND_EVENT',
    fields.organizationId,
    fields.inquiryId,
    fields.channelAccountId,
    fields.provider,
    fields.externalAccountId,
    eventId,
  ])}`;
}

function canonicalizeFields(input: Record<string, unknown>): CanonicalBuildResult {
  const organizationId = readOpaqueId(input.organizationId);
  const inquiryId = readOpaqueId(input.inquiryId);
  const channelAccountId = readOpaqueId(input.channelAccountId);
  const externalAccountId = readOpaqueId(input.externalAccountId);
  const externalEventId = readOpaqueId(input.externalEventId);
  const externalMessageId = readOpaqueId(input.externalMessageId);
  const externalConversationId = readOpaqueId(input.externalConversationId);
  const externalContactId = readOpaqueId(input.externalContactId);
  if (!organizationId
    || !inquiryId
    || !channelAccountId
    || !externalAccountId
    || !externalEventId
    || !externalMessageId
    || !externalConversationId
    || !externalContactId) {
    return { ok: false, errorCode: 'INVALID_IDENTIFIER' };
  }
  if (!isGlhChannelProvider(input.provider)) {
    return { ok: false, errorCode: 'INVALID_EVENT' };
  }
  if (input.direction !== 'INBOUND') {
    return { ok: false, errorCode: 'WRONG_DIRECTION' };
  }
  if (!isNormalIsoTimestamp(input.sourceTimestamp)) {
    return { ok: false, errorCode: 'INVALID_TIMESTAMP' };
  }
  if (typeof input.body !== 'string'
    || input.body.length > GLH_V2F_MAX_BODY_CHARS) {
    return { ok: false, errorCode: 'INVALID_BODY' };
  }

  const rawMediaIds = input.mediaIds ?? [];
  if (!Array.isArray(rawMediaIds)
    || rawMediaIds.length > GLH_V2F_MAX_MEDIA_IDS_PER_EVENT) {
    return { ok: false, errorCode: 'INVALID_EVENT' };
  }
  const mediaIds: string[] = [];
  const seenMediaIds = new Set<string>();
  for (const rawMediaId of rawMediaIds) {
    const mediaId = readOpaqueId(rawMediaId);
    if (!mediaId) return { ok: false, errorCode: 'INVALID_IDENTIFIER' };
    const canonicalId = canonicalMediaId(
      input.provider,
      externalAccountId,
      mediaId,
    );
    if (seenMediaIds.has(canonicalId)) {
      return { ok: false, errorCode: 'DUPLICATE_MEDIA_INPUT' };
    }
    seenMediaIds.add(canonicalId);
    mediaIds.push(mediaId);
  }

  return {
    ok: true,
    value: {
      organizationId,
      inquiryId,
      channelAccountId,
      provider: input.provider,
      externalAccountId,
      externalEventId,
      externalMessageId,
      externalConversationId,
      externalContactId,
      sourceTimestamp: input.sourceTimestamp,
      body: input.body,
      mediaIds,
    },
  };
}

function validateTrustedBinding(
  binding: GlhV2FTrustedChannelBinding,
): boolean {
  return Boolean(
    readOpaqueId(binding.organizationId)
    && readOpaqueId(binding.inquiryId)
    && binding.channelAccount
    && readOpaqueId(binding.channelAccount.id)
    && readOpaqueId(binding.channelAccount.organizationId)
    && isGlhChannelProvider(binding.channelAccount.provider)
    && readOpaqueId(binding.channelAccount.externalAccountId)
    && binding.channelAccount.organizationId === binding.organizationId,
  );
}

function validateClientScope(
  input: Record<string, unknown>,
  binding: GlhV2FTrustedChannelBinding,
): GlhV2FIntakeErrorCode | null {
  const topLevelScopeClaims: ReadonlyArray<{
    readonly field: 'organizationId' | 'inquiryId' | 'channelAccountId';
    readonly expected: string;
  }> = [
    { field: 'organizationId', expected: binding.organizationId },
    { field: 'inquiryId', expected: binding.inquiryId },
    { field: 'channelAccountId', expected: binding.channelAccount.id },
  ];
  for (const claim of topLevelScopeClaims) {
    if (input[claim.field] !== undefined
      && input[claim.field] !== claim.expected) {
      return 'UNTRUSTED_SCOPE_MISMATCH';
    }
  }

  const clientScope = input.clientScope;
  if (clientScope === undefined) return null;
  if (!isObject(clientScope)) return 'UNTRUSTED_SCOPE_MISMATCH';

  const organizationId = readOptionalId(clientScope.organizationId);
  const inquiryId = readOptionalId(clientScope.inquiryId);
  const channelAccountId = readOptionalId(clientScope.channelAccountId);
  if (organizationId === null
    || inquiryId === null
    || channelAccountId === null
    || (organizationId !== undefined
      && organizationId !== binding.organizationId)
    || (inquiryId !== undefined && inquiryId !== binding.inquiryId)
    || (channelAccountId !== undefined
      && channelAccountId !== binding.channelAccount.id)) {
    return 'UNTRUSTED_SCOPE_MISMATCH';
  }
  return null;
}

function rejected(errorCode: GlhV2FIntakeErrorCode): GlhV2FIntakeResult {
  return {
    ok: false,
    status: 'REJECTED',
    errorCode,
    originalEventPreserved: true,
    providerCallsPerformed: 0,
    customerFacingAutoSendAllowed: false,
  };
}

function validateHistory(
  history: readonly unknown[],
  binding: GlhV2FTrustedChannelBinding,
  expectedHeadFingerprint: string | null,
): HistoryValidationResult {
  let previousFingerprint: string | null = null;
  const eventsById = new Map<string, GlhV2FCanonicalInboundEvent>();
  const messagesById = new Set<string>();
  const mediaById = new Set<string>();

  for (const storedValue of history) {
    if (!isObject(storedValue)) {
      return { ok: false, errorCode: 'HISTORY_TAMPERED' };
    }
    if (storedValue.organizationId !== binding.organizationId
      || storedValue.inquiryId !== binding.inquiryId) {
      return { ok: false, errorCode: 'HISTORY_SCOPE_MISMATCH' };
    }

    const fields = canonicalizeFields(storedValue);
    if (!fields.ok) {
      return { ok: false, errorCode: 'HISTORY_TAMPERED' };
    }
    const eventId = canonicalEventId(
      fields.value.provider,
      fields.value.externalAccountId,
      fields.value.externalEventId,
    );
    const messageId = canonicalMessageId(
      fields.value.provider,
      fields.value.externalAccountId,
      fields.value.externalMessageId,
    );
    const fingerprint = eventFingerprint(fields.value, eventId, messageId);
    const expectedIdempotencyKey = idempotencyKey(fields.value, eventId);

    if (storedValue.schemaVersion !== GLH_V2F_MULTICHANNEL_EVENT_SCHEMA_VERSION
      || storedValue.eventId !== eventId
      || storedValue.messageId !== messageId
      || storedValue.surface !== GLH_V2F_CHANNEL_SURFACES[fields.value.provider]
      || storedValue.fingerprint !== fingerprint
      || storedValue.idempotencyKey !== expectedIdempotencyKey
      || storedValue.previousFingerprint !== previousFingerprint
      || eventsById.has(eventId)
      || messagesById.has(messageId)
      || fields.value.mediaIds.some(mediaIdValue => mediaById.has(
        canonicalMediaId(
          fields.value.provider,
          fields.value.externalAccountId,
          mediaIdValue,
        ),
      ))) {
      return { ok: false, errorCode: 'HISTORY_TAMPERED' };
    }

    const stored: GlhV2FCanonicalInboundEvent = {
      schemaVersion: GLH_V2F_MULTICHANNEL_EVENT_SCHEMA_VERSION,
      eventId,
      messageId,
      ...fields.value,
      surface: GLH_V2F_CHANNEL_SURFACES[fields.value.provider],
      direction: 'INBOUND' as const,
      fingerprint,
      idempotencyKey: expectedIdempotencyKey,
      previousFingerprint,
    };
    eventsById.set(eventId, stored);
    messagesById.add(messageId);
    for (const mediaIdValue of fields.value.mediaIds) {
      mediaById.add(canonicalMediaId(
        fields.value.provider,
        fields.value.externalAccountId,
        mediaIdValue,
      ));
    }
    previousFingerprint = fingerprint;
  }

  if (previousFingerprint !== expectedHeadFingerprint) {
    return { ok: false, errorCode: 'STALE_HISTORY' };
  }
  return {
    ok: true,
    headFingerprint: previousFingerprint,
    eventsById,
    messagesById,
    mediaById,
  };
}

export function normalizeGlhV2FMultichannelInbound(
  request: GlhV2FIngestRequest,
): GlhV2FIntakeResult {
  if (!validateTrustedBinding(request.trustedBinding)) {
    return rejected('INVALID_TRUSTED_BINDING');
  }
  if (!isObject(request.event)
    || request.event.schemaVersion
      !== GLH_V2F_MULTICHANNEL_EVENT_SCHEMA_VERSION) {
    return rejected('INVALID_EVENT');
  }

  const history = validateHistory(
    request.history ?? [],
    request.trustedBinding,
    request.expectedHistoryHeadFingerprint,
  );
  if (!history.ok) return rejected(history.errorCode);

  const scopeError = validateClientScope(
    request.event,
    request.trustedBinding,
  );
  if (scopeError) return rejected(scopeError);
  if (request.event.provider !== request.trustedBinding.channelAccount.provider
    || request.event.externalAccountId
      !== request.trustedBinding.channelAccount.externalAccountId) {
    return rejected('PROVIDER_ACCOUNT_MISMATCH');
  }

  const fields = canonicalizeFields({
    ...request.event,
    organizationId: request.trustedBinding.organizationId,
    inquiryId: request.trustedBinding.inquiryId,
    channelAccountId: request.trustedBinding.channelAccount.id,
  });
  if (!fields.ok) return rejected(fields.errorCode);

  const eventId = canonicalEventId(
    fields.value.provider,
    fields.value.externalAccountId,
    fields.value.externalEventId,
  );
  const messageId = canonicalMessageId(
    fields.value.provider,
    fields.value.externalAccountId,
    fields.value.externalMessageId,
  );
  const fingerprint = eventFingerprint(fields.value, eventId, messageId);
  const expectedIdempotencyKey = idempotencyKey(fields.value, eventId);

  const claimedFingerprint = request.event.replayFingerprint;
  if (claimedFingerprint !== undefined
    && claimedFingerprint !== fingerprint) {
    return rejected('REPLAY_FINGERPRINT_CONFLICT');
  }
  const claimedIdempotencyKey = request.event.idempotencyKey;
  if (claimedIdempotencyKey !== undefined
    && claimedIdempotencyKey !== expectedIdempotencyKey) {
    return rejected('IDEMPOTENCY_MISMATCH');
  }

  const storedEvent = history.eventsById.get(eventId);
  if (storedEvent) {
    return rejected(
      storedEvent.fingerprint === fingerprint
        ? 'DUPLICATE_EVENT'
        : 'REPLAY_FINGERPRINT_CONFLICT',
    );
  }
  if (history.messagesById.has(messageId)) {
    return rejected('DUPLICATE_MESSAGE');
  }
  if (fields.value.mediaIds.some(mediaIdValue => history.mediaById.has(
    canonicalMediaId(
      fields.value.provider,
      fields.value.externalAccountId,
      mediaIdValue,
    ),
  ))) {
    return rejected('DUPLICATE_MEDIA');
  }

  return {
    ok: true,
    status: 'ACCEPTED',
    event: {
      schemaVersion: GLH_V2F_MULTICHANNEL_EVENT_SCHEMA_VERSION,
      eventId,
      messageId,
      ...fields.value,
      surface: GLH_V2F_CHANNEL_SURFACES[fields.value.provider],
      direction: 'INBOUND',
      fingerprint,
      idempotencyKey: expectedIdempotencyKey,
      previousFingerprint: history.headFingerprint,
    },
    originalEventPreserved: true,
    providerCallsPerformed: 0,
    customerFacingAutoSendAllowed: false,
  };
}

export const GLH_V2F_CONVERSATION_MODES = GLH_CONVERSATION_MODES;

/**
 * Returns a fail-closed plan for an already-normalized inbound event. AI text
 * is always a reviewable draft. No V2-F mode permits a customer-facing send.
 */
export function planGlhV2FHandoffSafety(input: {
  readonly conversationMode: GlhConversationMode;
  readonly handoffInterrupted?: boolean;
  readonly aiSuggestionText?: string | null;
}): GlhV2FHandoffSafetyPlan {
  if (!isGlhConversationMode(input.conversationMode)) {
    throw new TypeError('Unsupported GLH conversation mode');
  }
  const handoffInterrupted = input.handoffInterrupted === true;
  const text = input.aiSuggestionText?.trim();
  return {
    conversationMode: input.conversationMode,
    handoffInterrupted,
    aiSuggestion: text
      ? {
          text,
          state: 'DRAFT_ONLY',
          humanReviewRequired: true,
          businessFact: false,
        }
      : null,
    customerFacingAutoSendAllowed: false,
    providerSendAllowed: false,
    providerCallsPerformed: 0,
    preserveOriginalEvent: true,
    humanReviewRequired: true,
    handoffRequired: input.conversationMode !== 'AI_ACTIVE'
      || handoffInterrupted,
  };
}

export const GLH_V2F_PROVIDER_CALLS_ENABLED = GLH_PROVIDER_CALLS_ENABLED;
