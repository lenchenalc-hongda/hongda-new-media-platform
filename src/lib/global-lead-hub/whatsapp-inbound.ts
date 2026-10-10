import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const GLH_WHATSAPP_MAX_WEBHOOK_BYTES = 1_000_000;

type JsonObject = Record<string, unknown>;

export interface GlhWhatsAppInboundMessage {
  provider: 'WHATSAPP';
  externalEventId: string;
  providerAccountId: string;
  externalContactId: string;
  externalConversationId: string;
  contactDisplayName: string | null;
  messageType: string;
  messageText: string | null;
  mediaMetadata: JsonObject | null;
  providerTimestamp: string | null;
  referral: JsonObject | null;
}

export type GlhWhatsAppParseResult =
  | { kind: 'accepted'; messages: GlhWhatsAppInboundMessage[] }
  | { kind: 'ignored'; reason: 'NO_INBOUND_MESSAGES' | 'UNSUPPORTED_EVENT' }
  | { kind: 'invalid'; reason: string };

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function copyObject(value: unknown): JsonObject | null {
  return isObject(value) ? { ...value } : null;
}

function parseProviderTimestamp(value: unknown): string | null {
  const raw = nonEmptyString(value);
  if (!raw || !/^\d{1,16}$/.test(raw)) return null;
  const seconds = Number(raw);
  if (!Number.isSafeInteger(seconds) || seconds < 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function messageText(message: JsonObject): string | null {
  const text = copyObject(message.text);
  if (text) return stringValue(text.body);

  const button = copyObject(message.button);
  if (button) return stringValue(button.text);

  const interactive = copyObject(message.interactive);
  const buttonReply = interactive ? copyObject(interactive.button_reply) : null;
  if (buttonReply) return stringValue(buttonReply.title);
  const listReply = interactive ? copyObject(interactive.list_reply) : null;
  return listReply ? stringValue(listReply.title) : null;
}

function mediaMetadata(message: JsonObject, type: string, referral: JsonObject | null) {
  const media = copyObject(message[type]);
  const metadata: JsonObject = { message_type: type };
  for (const key of ['id', 'mime_type', 'sha256', 'filename', 'caption']) {
    const value = media ? stringValue(media[key]) : null;
    if (value !== null) metadata[key] = value;
  }
  if (referral) metadata.referral = referral;

  return metadata;
}

export function verifyGlhWhatsAppSignature(
  rawBody: Uint8Array,
  signature: string | null,
  appSecret: string | undefined,
): boolean {
  if (!appSecret || !signature) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const match = /^sha256=([0-9a-f]{64})$/i.exec(signature.trim());
  const received = match ? Buffer.from(match[1], 'hex') : Buffer.alloc(expected.length);
  const equal = timingSafeEqual(expected, received);
  return Boolean(match) && equal;
}

export function verifyGlhWhatsAppToken(
  suppliedToken: string | null,
  expectedToken: string | undefined,
): boolean {
  if (!suppliedToken || !expectedToken) return false;
  const supplied = createHash('sha256').update(suppliedToken).digest();
  const expected = createHash('sha256').update(expectedToken).digest();
  return timingSafeEqual(supplied, expected);
}

export function parseGlhWhatsAppInbound(payload: unknown): GlhWhatsAppParseResult {
  if (!isObject(payload) || payload.object !== 'whatsapp_business_account') {
    return { kind: 'ignored', reason: 'UNSUPPORTED_EVENT' };
  }
  if (!Array.isArray(payload.entry)) {
    return { kind: 'invalid', reason: 'entry must be an array' };
  }

  const parsed: GlhWhatsAppInboundMessage[] = [];
  for (const entry of payload.entry) {
    if (!isObject(entry) || !Array.isArray(entry.changes)) {
      return { kind: 'invalid', reason: 'entry changes must be an array' };
    }
    for (const change of entry.changes) {
      if (!isObject(change) || change.field !== 'messages') continue;
      if (!isObject(change.value)) {
        return { kind: 'invalid', reason: 'message change value must be an object' };
      }
      const value = change.value;
      if (value.messaging_product !== 'whatsapp' || !isObject(value.metadata)) {
        return { kind: 'invalid', reason: 'invalid WhatsApp message metadata' };
      }
      const providerAccountId = nonEmptyString(value.metadata.phone_number_id);
      if (!providerAccountId) {
        return { kind: 'invalid', reason: 'phone_number_id is required' };
      }
      if (value.messages === undefined) continue;
      if (!Array.isArray(value.messages)) {
        return { kind: 'invalid', reason: 'messages must be an array' };
      }

      const contactNames = new Map<string, string>();
      if (Array.isArray(value.contacts)) {
        for (const contact of value.contacts) {
          if (!isObject(contact)) continue;
          const waId = nonEmptyString(contact.wa_id);
          const profile = copyObject(contact.profile);
          const name = profile ? nonEmptyString(profile.name) : null;
          if (waId && name) contactNames.set(waId, name);
        }
      }

      for (const message of value.messages) {
        if (!isObject(message)) {
          return { kind: 'invalid', reason: 'message must be an object' };
        }
        const externalEventId = nonEmptyString(message.id);
        const externalContactId = nonEmptyString(message.from);
        const type = nonEmptyString(message.type);
        if (!externalEventId || !externalContactId || !type) {
          return { kind: 'invalid', reason: 'message identifiers and type are required' };
        }
        const referral = copyObject(message.referral);
        parsed.push({
          provider: 'WHATSAPP',
          externalEventId,
          providerAccountId,
          externalContactId,
          externalConversationId: externalContactId,
          contactDisplayName: contactNames.get(externalContactId) ?? null,
          messageType: type,
          messageText: messageText(message),
          mediaMetadata: mediaMetadata(message, type, referral),
          providerTimestamp: parseProviderTimestamp(message.timestamp),
          referral,
        });
      }
    }
  }

  return parsed.length > 0
    ? { kind: 'accepted', messages: parsed }
    : { kind: 'ignored', reason: 'NO_INBOUND_MESSAGES' };
}
