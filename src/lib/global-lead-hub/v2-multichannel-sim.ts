/**
 * GLH V2-F: deterministic OFFLINE-only multi-channel intake normalization.
 * Synthetic/verified inbound events only. No Meta, WhatsApp, DB, model or
 * customer-facing sender is wired to this module.
 *
 * The caller must derive trusted scope from the server-side channel binding,
 * not request body or user-editable auth metadata.
 */
export const GLH_V2F_CHANNELS = ['WHATSAPP', 'FACEBOOK_MESSENGER', 'INSTAGRAM_DM'] as const;
export type GlhV2FChannel = typeof GLH_V2F_CHANNELS[number];
export type GlhV2FMode = 'AI_ACTIVE' | 'HANDOFF_PENDING' | 'HUMAN_ACTIVE' | 'PAUSED';

export interface GlhV2FTrustedChannel {
  readonly organizationId: string;
  readonly inquiryId: string;
  readonly provider: GlhV2FChannel;
  readonly channelAccountId: string;
  readonly conversationMode: GlhV2FMode;
}

export interface GlhV2FSyntheticInbound {
  readonly organizationId: string;
  readonly inquiryId: string;
  readonly provider: string;
  readonly channelAccountId: string;
  readonly externalEventId: string;
  readonly externalMessageId: string;
  readonly receivedAt: string;
  readonly direction: 'INBOUND';
  readonly bodyText: string | null;
  /** Canonical inbound media IDs, not URLs or arbitrary user paths. */
  readonly mediaIds: readonly string[];
}

export interface GlhV2FNormalizedEvent {
  readonly schema: 'GLH-V2F-SIM-001';
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly organizationId: string;
  readonly inquiryId: string;
  readonly provider: GlhV2FChannel;
  readonly channelAccountId: string;
  readonly externalEventId: string;
  readonly externalMessageId: string;
  readonly direction: 'INBOUND';
  readonly bodyText: string | null;
  readonly mediaIds: readonly string[];
  readonly receivedAt: string;
  readonly preserveOriginalMessage: true;
  readonly humanReviewRequired: true;
  readonly customerFacingAutoSendAllowed: false;
  readonly authority: 'UNVERIFIED_CHANNEL_EVENT';
}

export type GlhV2FIngestResult =
  | { readonly ok: true; readonly action: 'APPENDED' | 'REPLAYED';
      readonly event: GlhV2FNormalizedEvent;
      readonly events: readonly GlhV2FNormalizedEvent[];
      readonly providerCalls: 0;
      readonly customerFacingAutoSendAllowed: false; }
  | { readonly ok: false; readonly code:
      'UNTRUSTED_CHANNEL_SCOPE' | 'INVALID_EVENT' | 'UNTRUSTED_HISTORY' |
      'IDEMPOTENCY_CONFLICT' | 'MESSAGE_ID_CONFLICT';
      readonly events: readonly GlhV2FNormalizedEvent[];
      readonly providerCalls: 0;
      readonly customerFacingAutoSendAllowed: false; };

const IDS = /^[A-Za-z0-9_:.@-]{1,128}$/;
const MODES = new Set<string>(['AI_ACTIVE', 'HANDOFF_PENDING', 'HUMAN_ACTIVE', 'PAUSED']);
const CHANNELS = new Set<string>(GLH_V2F_CHANNELS);
const reject = (
  code: Extract<GlhV2FIngestResult,{ok:false}>['code'],
  events: readonly GlhV2FNormalizedEvent[],
): GlhV2FIngestResult =>
  ({ ok:false, code, events, providerCalls:0, customerFacingAutoSendAllowed:false });

function validId(x: unknown): x is string {
  return typeof x === 'string' && IDS.test(x);
}

function validTime(x: unknown): x is string {
  if (typeof x !== 'string' || x.length > 35
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(x)) return false;
  const stamp = Date.parse(x);
  return Number.isFinite(stamp)
    && (new Date(stamp).toISOString() === x
      || new Date(stamp).toISOString().replace('.000Z','Z') === x);
}

function validScope(x: unknown): x is GlhV2FTrustedChannel {
  if (!x || typeof x !== 'object') return false;
  const v = x as Partial<GlhV2FTrustedChannel>;
  return validId(v.organizationId) && validId(v.inquiryId)
    && validId(v.channelAccountId)
    && typeof v.provider === 'string' && CHANNELS.has(v.provider)
    && typeof v.conversationMode === 'string' && MODES.has(v.conversationMode);
}

function validInbound(x: unknown): x is GlhV2FSyntheticInbound {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const v = x as Partial<GlhV2FSyntheticInbound>;
  return validId(v.organizationId) && validId(v.inquiryId)
    && validId(v.channelAccountId) && validId(v.externalEventId)
    && validId(v.externalMessageId) && v.direction === 'INBOUND'
    && validTime(v.receivedAt)
    && (v.bodyText === null ||
      (typeof v.bodyText === 'string' && v.bodyText.length <= 8000))
    && Array.isArray(v.mediaIds) && v.mediaIds.length <= 12
    && v.mediaIds.every(validId)
    && new Set(v.mediaIds).size === v.mediaIds.length
    && ((typeof v.bodyText === 'string' && v.bodyText.trim().length > 0)
      || v.mediaIds.length > 0);
}

function fingerprintOf(e: GlhV2FSyntheticInbound): string {
  return JSON.stringify([
    e.provider, e.channelAccountId, e.externalEventId,
    e.externalMessageId, e.receivedAt, e.bodyText, e.mediaIds,
  ]);
}

/**
 * Pure normalization and replay check. SQL UNIQUE constraints and webhook
 * signatures are required separately for actual multi-worker concurrency.
 * No authority to send, grade, overwrite, merge or discard a customer message.
 */
export function simulateGlhV2FInbound(input: {
  readonly trusted: GlhV2FTrustedChannel;
  readonly inbound: GlhV2FSyntheticInbound;
  readonly history: readonly GlhV2FNormalizedEvent[];
}): GlhV2FIngestResult {
  const history = Array.isArray(input?.history) ? input.history : [];
  if (!validScope(input?.trusted)) return reject('UNTRUSTED_CHANNEL_SCOPE',history);
  const {trusted,inbound} = input;
  if (!validInbound(inbound) || !CHANNELS.has(inbound.provider))
    return reject('INVALID_EVENT',history);
  if (inbound.organizationId !== trusted.organizationId
    || inbound.inquiryId !== trusted.inquiryId
    || inbound.provider !== trusted.provider
    || inbound.channelAccountId !== trusted.channelAccountId)
    return reject('UNTRUSTED_CHANNEL_SCOPE',history);
  if (history.length > 200 || history.some(x=>
      !x || x.schema !== 'GLH-V2F-SIM-001'
      || x.organizationId !== trusted.organizationId
      || x.inquiryId !== trusted.inquiryId
      || !CHANNELS.has(x.provider)
      || x.customerFacingAutoSendAllowed !== false
      || x.preserveOriginalMessage !== true
      || x.direction !== 'INBOUND'
      || x.idempotencyKey !== JSON.stringify([
        x.provider,x.channelAccountId,x.externalEventId,
      ])
    )) return reject('UNTRUSTED_HISTORY',history);

  const idempotencyKey = JSON.stringify([
    inbound.provider,inbound.channelAccountId,inbound.externalEventId,
  ]);
  const fingerprint = fingerprintOf(inbound);
  const prior = history.find(x=>x.idempotencyKey === idempotencyKey);
  if (prior) {
    if (prior.fingerprint !== fingerprint) return reject('IDEMPOTENCY_CONFLICT',history);
    return {ok:true,action:'REPLAYED',event:prior,events:history,
      providerCalls:0,customerFacingAutoSendAllowed:false};
  }
  if (history.some(x=>x.provider === inbound.provider
      && x.channelAccountId === inbound.channelAccountId
      && x.externalMessageId === inbound.externalMessageId))
    return reject('MESSAGE_ID_CONFLICT',history);
  const event: GlhV2FNormalizedEvent = Object.freeze({
    schema:'GLH-V2F-SIM-001',
    idempotencyKey, fingerprint, organizationId:trusted.organizationId,
    inquiryId:trusted.inquiryId, provider:trusted.provider,
    channelAccountId:trusted.channelAccountId,
    externalEventId:inbound.externalEventId,
    externalMessageId:inbound.externalMessageId,
    direction:'INBOUND',
    bodyText:inbound.bodyText,
    mediaIds:Object.freeze([...inbound.mediaIds]),
    receivedAt:inbound.receivedAt,
    preserveOriginalMessage:true, humanReviewRequired:true,
    customerFacingAutoSendAllowed:false,
    authority:'UNVERIFIED_CHANNEL_EVENT',
  });
  return {ok:true,action:'APPENDED',event,
    events:Object.freeze([...history,event]),
    providerCalls:0,customerFacingAutoSendAllowed:false};
}
