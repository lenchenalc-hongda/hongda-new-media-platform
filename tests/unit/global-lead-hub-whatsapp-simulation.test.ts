import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import {
  GLH_PROVIDER_CALLS_ENABLED,
  createDisabledGlhChannelAdapter,
} from '../../src/lib/global-lead-hub/channels';
import {
  GLH_WHATSAPP_MAX_WEBHOOK_BYTES,
  type GlhWhatsAppInboundMessage,
  parseGlhWhatsAppInbound,
  verifyGlhWhatsAppSignature,
  verifyGlhWhatsAppToken,
} from '../../src/lib/global-lead-hub/whatsapp-inbound';

type JsonObject = Record<string, unknown>;

const source = (path: string) => readFileSync(path, 'utf8');
const clone = <T>(value: T): T => structuredClone(value);

function inboundPayload(input: {
  accountId?: string;
  message: JsonObject;
  contactName?: string;
}): JsonObject {
  const contactId = input.message.from;
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'synthetic-waba',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '15550000000',
            phone_number_id: input.accountId ?? 'synthetic-phone-account',
          },
          contacts: [{
            wa_id: contactId,
            profile: { name: input.contactName ?? 'Synthetic Contact' },
          }],
          messages: [input.message],
        },
      }],
    }],
  };
}

const textFixture = inboundPayload({
  message: {
    id: 'wamid.synthetic.text',
    from: '15551110001',
    timestamp: '1791655200',
    type: 'text',
    text: { body: 'Synthetic text: please quote 20 units.' },
  },
  contactName: 'Synthetic Text Contact',
});

const mediaFixture = inboundPayload({
  message: {
    id: 'wamid.synthetic.media',
    from: '15551110002',
    timestamp: '1791655201',
    type: 'image',
    image: {
      id: 'synthetic-media-asset',
      mime_type: 'image/jpeg',
      sha256: 'synthetic-media-sha256',
      filename: 'synthetic-sample.jpg',
      caption: 'Synthetic media caption.',
    },
  },
  contactName: 'Synthetic Media Contact',
});

const referralFixture = inboundPayload({
  message: {
    id: 'wamid.synthetic.referral',
    from: '15551110003',
    timestamp: '1791655202',
    type: 'text',
    text: { body: 'Synthetic referral message.' },
    referral: {
      source_id: 'synthetic-source-id',
      ctwa_clid: 'synthetic-click-id',
    },
  },
  contactName: 'Synthetic Referral Contact',
});

function acceptedMessages(payload: unknown): GlhWhatsAppInboundMessage[] {
  const parsed = parseGlhWhatsAppInbound(payload);
  assert.equal(parsed.kind, 'accepted');
  if (parsed.kind !== 'accepted') throw new Error('expected accepted fixture');
  return parsed.messages;
}

// Text parsing is deterministic and keeps contact/event identity separate.
const parsedText = acceptedMessages(textFixture);
assert.equal(parsedText.length, 1);
assert.deepEqual(parsedText[0], {
  provider: 'WHATSAPP',
  externalEventId: 'wamid.synthetic.text',
  providerAccountId: 'synthetic-phone-account',
  externalContactId: '15551110001',
  externalConversationId: '15551110001',
  contactDisplayName: 'Synthetic Text Contact',
  messageType: 'text',
  messageText: 'Synthetic text: please quote 20 units.',
  mediaMetadata: { message_type: 'text' },
  providerTimestamp: '2026-10-10T18:00:00.000Z',
  referral: null,
});

// Media parsing records supplied provider metadata and does not invent a text body.
const parsedMedia = acceptedMessages(mediaFixture);
assert.equal(parsedMedia.length, 1);
assert.equal(parsedMedia[0].messageText, null);
assert.deepEqual(parsedMedia[0].mediaMetadata, {
  message_type: 'image',
  id: 'synthetic-media-asset',
  mime_type: 'image/jpeg',
  sha256: 'synthetic-media-sha256',
  filename: 'synthetic-sample.jpg',
  caption: 'Synthetic media caption.',
});
assert.equal(parsedMedia[0].referral, null);

// A partial referral is preserved exactly as received. Missing campaign/ad IDs stay missing.
const parsedReferral = acceptedMessages(referralFixture);
assert.equal(parsedReferral.length, 1);
assert.deepEqual(parsedReferral[0].referral, {
  source_id: 'synthetic-source-id',
  ctwa_clid: 'synthetic-click-id',
});
assert.deepEqual(parsedReferral[0].mediaMetadata?.referral, parsedReferral[0].referral);
for (const missingField of [
  'campaignExternalId',
  'adsetExternalId',
  'adExternalId',
  'creativeExternalId',
  'sourcePlatform',
]) {
  assert.equal(
    Object.prototype.hasOwnProperty.call(parsedReferral[0], missingField),
    false,
    `parser must not invent referral field ${missingField}`,
  );
}
assert.equal(
  Object.prototype.hasOwnProperty.call(parsedReferral[0].referral, 'campaign_id'),
  false,
  'missing campaign attribution remains absent',
);

// Outbound status notifications are acknowledged as ignored, never parsed as customer messages.
const statusOnlyFixture = {
  object: 'whatsapp_business_account',
  entry: [{
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { phone_number_id: 'synthetic-phone-account' },
        statuses: [{ id: 'wamid.synthetic.outbound', status: 'read' }],
      },
    }],
  }],
};
assert.deepEqual(parseGlhWhatsAppInbound(statusOnlyFixture), {
  kind: 'ignored',
  reason: 'NO_INBOUND_MESSAGES',
});

// Malformed structures fail closed instead of being partially accepted.
assert.deepEqual(
  parseGlhWhatsAppInbound({
    object: 'whatsapp_business_account',
    entry: { changes: [] },
  }),
  { kind: 'invalid', reason: 'entry must be an array' },
);
assert.deepEqual(
  parseGlhWhatsAppInbound({
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: 'synthetic-phone-account' },
          messages: {},
        },
      }],
    }],
  }),
  { kind: 'invalid', reason: 'messages must be an array' },
);
assert.deepEqual(
  parseGlhWhatsAppInbound({
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: 'synthetic-phone-account' },
          messages: [{ from: '15551110004', type: 'text', text: { body: 'No event ID.' } }],
        },
      }],
    }],
  }),
  { kind: 'invalid', reason: 'message identifiers and type are required' },
);
assert.deepEqual(
  parseGlhWhatsAppInbound({ object: 'page', entry: [] }),
  { kind: 'ignored', reason: 'UNSUPPORTED_EVENT' },
);

// Signature verification uses the byte-exact request body and a SHA-256 HMAC.
const hmacFixtureRaw = Buffer.from(JSON.stringify(textFixture));
const hmacFixtureKey = 'synthetic-hmac-key-material';
const hmacFixtureSignature = `sha256=${createHmac('sha256', hmacFixtureKey)
  .update(hmacFixtureRaw)
  .digest('hex')}`;
assert.equal(
  verifyGlhWhatsAppSignature(hmacFixtureRaw, hmacFixtureSignature, hmacFixtureKey),
  true,
);
assert.equal(
  verifyGlhWhatsAppSignature(
    hmacFixtureRaw,
    hmacFixtureSignature.replace(/.$/, char => char === '0' ? '1' : '0'),
    hmacFixtureKey,
  ),
  false,
  'tampered signature is rejected',
);
assert.equal(
  verifyGlhWhatsAppSignature(
    Buffer.from(JSON.stringify({ ...textFixture, syntheticTamper: true })),
    hmacFixtureSignature,
    hmacFixtureKey,
  ),
  false,
  'tampered raw body is rejected',
);
assert.equal(verifyGlhWhatsAppSignature(hmacFixtureRaw, null, hmacFixtureKey), false);
assert.equal(verifyGlhWhatsAppSignature(hmacFixtureRaw, 'sha256=not-hex', hmacFixtureKey), false);
assert.equal(verifyGlhWhatsAppSignature(hmacFixtureRaw, hmacFixtureSignature, undefined), false);

// Verification challenge tokens require an exact configured match.
const verifyToken = 'synthetic-verification-token';
assert.equal(verifyGlhWhatsAppToken(verifyToken, verifyToken), true);
assert.equal(verifyGlhWhatsAppToken('synthetic-wrong-token', verifyToken), false);
assert.equal(verifyGlhWhatsAppToken(null, verifyToken), false);
assert.equal(verifyGlhWhatsAppToken(verifyToken, undefined), false);

// The route checks both declared and actual body sizes against the same 1,000,000-byte cap.
type BodyLimitResult = { status: 200 } | { status: 413; reason: string };
function enforceBodyLimit(
  declaredByteLength: number | null,
  rawBody: Uint8Array,
): BodyLimitResult {
  if (declaredByteLength !== null
    && Number.isFinite(declaredByteLength)
    && declaredByteLength > GLH_WHATSAPP_MAX_WEBHOOK_BYTES) {
    return { status: 413, reason: 'DECLARED_BODY_TOO_LARGE' };
  }
  if (rawBody.byteLength > GLH_WHATSAPP_MAX_WEBHOOK_BYTES) {
    return { status: 413, reason: 'ACTUAL_BODY_TOO_LARGE' };
  }
  return { status: 200 };
}
assert.deepEqual(
  enforceBodyLimit(
    GLH_WHATSAPP_MAX_WEBHOOK_BYTES,
    new Uint8Array(GLH_WHATSAPP_MAX_WEBHOOK_BYTES),
  ),
  { status: 200 },
);
assert.deepEqual(
  enforceBodyLimit(
    GLH_WHATSAPP_MAX_WEBHOOK_BYTES + 1,
    new Uint8Array(1),
  ),
  { status: 413, reason: 'DECLARED_BODY_TOO_LARGE' },
);
assert.deepEqual(
  enforceBodyLimit(
    null,
    new Uint8Array(GLH_WHATSAPP_MAX_WEBHOOK_BYTES + 1),
  ),
  { status: 413, reason: 'ACTUAL_BODY_TOO_LARGE' },
);

interface SimulatedWebhookEvent {
  eventId: string;
  idempotencyKey: string;
  providerAccountId: string;
  externalContactId: string;
  rawPayload: JsonObject;
  processingStatus: 'PROCESSING' | 'PROCESSED' | 'FAILED';
  processingError: string | null;
}

interface SimulatedInboundMessage {
  eventId: string;
  providerAccountId: string;
  externalContactId: string;
  messageText: string | null;
}

interface InMemoryStore {
  webhookEvents: Map<string, SimulatedWebhookEvent>;
  messages: SimulatedInboundMessage[];
}

type SimulatedIngestResult =
  | {
      ok: true;
      status: 'PROCESSED' | 'DUPLICATE';
      duplicate: boolean;
      eventId: string;
    }
  | {
      ok: false;
      status: 'FAILED';
      eventId: string;
      errorCode: 'SIMULATED_DOWNSTREAM_FAILURE';
    };

function idempotencyKey(externalEventId: string): string {
  return `WHATSAPP:${externalEventId.trim()}`;
}

// This models only the relevant RPC ordering: raw event first, downstream second.
// It is intentionally in-memory and makes no provider or database calls.
function simulateIngest(
  message: GlhWhatsAppInboundMessage,
  rawPayload: JsonObject,
  store: InMemoryStore,
  options: { failDownstream?: boolean } = {},
): SimulatedIngestResult {
  const key = idempotencyKey(message.externalEventId);
  const existing = store.webhookEvents.get(key);
  if (existing) {
    return {
      ok: true,
      status: 'DUPLICATE',
      duplicate: true,
      eventId: existing.eventId,
    };
  }

  const event: SimulatedWebhookEvent = {
    eventId: message.externalEventId,
    idempotencyKey: key,
    providerAccountId: message.providerAccountId,
    externalContactId: message.externalContactId,
    rawPayload: clone(rawPayload),
    processingStatus: 'PROCESSING',
    processingError: null,
  };
  store.webhookEvents.set(key, event);

  if (options.failDownstream) {
    event.processingStatus = 'FAILED';
    event.processingError = 'SIMULATED_DOWNSTREAM_FAILURE';
    return {
      ok: false,
      status: 'FAILED',
      eventId: event.eventId,
      errorCode: 'SIMULATED_DOWNSTREAM_FAILURE',
    };
  }

  store.messages.push({
    eventId: event.eventId,
    providerAccountId: event.providerAccountId,
    externalContactId: event.externalContactId,
    messageText: message.messageText,
  });
  event.processingStatus = 'PROCESSED';
  return {
    ok: true,
    status: 'PROCESSED',
    duplicate: false,
    eventId: event.eventId,
  };
}

const store: InMemoryStore = {
  webhookEvents: new Map(),
  messages: [],
};
const firstIngest = simulateIngest(parsedText[0], textFixture, store);
assert.deepEqual(firstIngest, {
  ok: true,
  status: 'PROCESSED',
  duplicate: false,
  eventId: 'wamid.synthetic.text',
});
assert.equal(store.webhookEvents.get('WHATSAPP:wamid.synthetic.text')?.idempotencyKey,
  'WHATSAPP:wamid.synthetic.text');
assert.equal(store.messages.length, 1);

const replay = simulateIngest(parsedText[0], textFixture, store);
assert.deepEqual(replay, {
  ok: true,
  status: 'DUPLICATE',
  duplicate: true,
  eventId: 'wamid.synthetic.text',
});
assert.equal(store.webhookEvents.size, 1);
assert.equal(store.messages.length, 1, 'duplicate replay cannot create another message');

// A provider reusing an external event ID with conflicting payload/account data is idempotent.
// The first raw event wins and is not silently overwritten.
const conflictingMessage: GlhWhatsAppInboundMessage = {
  ...parsedText[0],
  providerAccountId: 'synthetic-conflicting-account',
  externalContactId: '15559990000',
  externalConversationId: '15559990000',
  messageText: 'Synthetic conflicting content.',
};
const conflictingReplay = simulateIngest(
  conflictingMessage,
  { object: 'whatsapp_business_account', syntheticConflict: true },
  store,
);
assert.deepEqual(conflictingReplay, {
  ok: true,
  status: 'DUPLICATE',
  duplicate: true,
  eventId: 'wamid.synthetic.text',
});
assert.equal(store.webhookEvents.size, 1);
assert.equal(store.messages.length, 1);
assert.equal(
  store.webhookEvents.get('WHATSAPP:wamid.synthetic.text')?.providerAccountId,
  'synthetic-phone-account',
);
assert.equal(
  store.messages[0].messageText,
  'Synthetic text: please quote 20 units.',
);

// A downstream failure returns failure, while the verified raw inbound event remains recorded.
const failureStore: InMemoryStore = {
  webhookEvents: new Map(),
  messages: [],
};
const failure = simulateIngest(parsedText[0], textFixture, failureStore, {
  failDownstream: true,
});
assert.deepEqual(failure, {
  ok: false,
  status: 'FAILED',
  eventId: 'wamid.synthetic.text',
  errorCode: 'SIMULATED_DOWNSTREAM_FAILURE',
});
assert.equal(failureStore.webhookEvents.size, 1);
assert.equal(failureStore.webhookEvents.get('WHATSAPP:wamid.synthetic.text')?.processingStatus, 'FAILED');
assert.deepEqual(
  failureStore.webhookEvents.get('WHATSAPP:wamid.synthetic.text')?.rawPayload,
  textFixture,
);

// Exercise the real route. The hard-disabled channel gate must win before parsing,
// signature/token checks, body reads, or persistence, regardless of supplied input.
const webhookRoute = await import('../../src/app/api/global-lead-hub/webhooks/whatsapp/route');
const originalFetch = globalThis.fetch;
let providerOrDatabaseNetworkCalls = 0;
globalThis.fetch = (async () => {
  providerOrDatabaseNetworkCalls += 1;
  throw new Error('Network access is forbidden in the offline simulation');
}) as typeof fetch;

try {
  assert.equal(GLH_PROVIDER_CALLS_ENABLED, false, 'provider calls are hard disabled');

  const getResponse = await webhookRoute.GET(new NextRequest(
    'http://localhost/api/global-lead-hub/webhooks/whatsapp'
      + '?hub.mode=subscribe&hub.verify_token=synthetic-verification-token&hub.challenge=synthetic',
  ));
  assert.equal(getResponse.status, 503);
  assert.deepEqual(await getResponse.json(), {
    ok: false,
    error: 'Channel activation not authorized',
  });

  const postResponse = await webhookRoute.POST(new NextRequest(
    'http://localhost/api/global-lead-hub/webhooks/whatsapp',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=tampered',
      },
      body: JSON.stringify(textFixture),
    },
  ));
  assert.equal(postResponse.status, 503);
  assert.deepEqual(await postResponse.json(), {
    ok: false,
    error: 'Channel activation not authorized',
  });

  const oversizedPostResponse = await webhookRoute.POST(new NextRequest(
    'http://localhost/api/global-lead-hub/webhooks/whatsapp',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=tampered',
      },
      body: new Uint8Array(GLH_WHATSAPP_MAX_WEBHOOK_BYTES + 1),
    },
  ));
  assert.equal(oversizedPostResponse.status, 503, 'disabled gate runs before body limit logic');

  const disabledAdapter = createDisabledGlhChannelAdapter('WHATSAPP');
  const adapterResult = await disabledAdapter.sendApprovedMessage({
    organizationId: 'synthetic-org',
    channelAccountId: 'synthetic-channel-account',
    conversationId: 'synthetic-conversation',
    idempotencyKey: 'synthetic-outbound-key',
    body: 'Synthetic outbound message that must never be sent.',
  });
  assert.deepEqual(adapterResult, {
    ok: false,
    provider: 'WHATSAPP',
    status: 'PROVIDER_CALLS_DISABLED',
    errorCode: 'PROVIDER_CUTOVER_NOT_AUTHORIZED',
  });
  assert.equal(providerOrDatabaseNetworkCalls, 0, 'no network call may occur');
} finally {
  globalThis.fetch = originalFetch;
}

// Keep the source-level acceptance checks close to the runtime gate they protect.
const routeSource = source('src/app/api/global-lead-hub/webhooks/whatsapp/route.ts');
const channelSource = source('src/lib/global-lead-hub/channels.ts');
const migrationSource = source(
  'supabase/migrations/20261010182400_global_lead_hub_phase3_whatsapp_inbound.sql',
);
assert(channelSource.includes('export const GLH_PROVIDER_CALLS_ENABLED = false;'));
assert(routeSource.includes("import { GLH_PROVIDER_CALLS_ENABLED } from '@/lib/global-lead-hub/channels';"));
assert(routeSource.includes("request.headers.get('content-length')"));
assert(routeSource.includes('request.arrayBuffer()'));
assert(routeSource.includes("request.headers.get('x-hub-signature-256')"));
assert(routeSource.includes("admin.rpc('glh_ingest_whatsapp_inbound'"));
assert(!routeSource.includes('console.'), 'route must not log payloads or secrets');
assert(!routeSource.includes('fetch('), 'inbound route must not call a provider');
assert(!routeSource.includes('api.whatsapp.com'), 'inbound route must not contain an outbound endpoint');
assert(migrationSource.includes("'WHATSAPP:' || btrim(p_external_event_id)"));
assert(migrationSource.includes('ON CONFLICT (provider, external_event_id) DO NOTHING'));
assert(
  migrationSource.indexOf('INSERT INTO public.glh_webhook_events')
    < migrationSource.indexOf('EXCEPTION WHEN OTHERS'),
  'raw webhook event is recorded before downstream failure handling',
);
assert(migrationSource.includes("'status', 'FAILED'"));
assert(migrationSource.includes("processing_status = 'FAILED'"));
for (const method of ['GET', 'POST'] as const) {
  const start = routeSource.indexOf(`export async function ${method}(`);
  const nextMethod = method === 'GET'
    ? routeSource.indexOf('export async function POST(', start)
    : routeSource.length;
  const handler = routeSource.slice(start, nextMethod);
  const gate = handler.indexOf('if (!GLH_PROVIDER_CALLS_ENABLED)');
  assert(gate >= 0, `${method} gate exists`);
  const firstProcessingStep = method === 'GET'
    ? handler.indexOf('request.nextUrl.searchParams.get')
    : Math.min(
        ...['request.headers.get', 'request.arrayBuffer()', 'admin.rpc(']
          .map(marker => {
            const index = handler.indexOf(marker);
            return index < 0 ? Number.POSITIVE_INFINITY : index;
          }),
      );
  assert(gate < firstProcessingStep, `${method} gate runs before processing`);
}

console.log('Global Lead Hub WhatsApp offline simulation tests passed');
