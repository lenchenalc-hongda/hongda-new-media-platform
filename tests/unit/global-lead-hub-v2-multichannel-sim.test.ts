import assert from 'node:assert/strict';
import {
  GLH_V2F_CONVERSATION_MODES,
  GLH_V2F_MULTICHANNEL_EVENT_SCHEMA_VERSION,
  GLH_V2F_PROVIDER_CALLS_ENABLED,
  normalizeGlhV2FMultichannelInbound,
  planGlhV2FHandoffSafety,
  type GlhV2FChannelSurface,
  type GlhV2FProviderInboundEventInput,
  type GlhV2FStoredMultichannelEvent,
  type GlhV2FTrustedChannelBinding,
} from '../../src/lib/global-lead-hub/v2-multichannel-sim';
import type { GlhChannelProvider } from '../../src/lib/global-lead-hub/channels';

const organizationId = 'synthetic-org-glh-v2f';
const foreignOrganizationId = 'synthetic-org-foreign';
const inquiryId = 'synthetic-inquiry-glh-v2f';
const foreignInquiryId = 'synthetic-inquiry-foreign';

function binding(
  provider: GlhChannelProvider,
  accountSuffix = 'primary',
): GlhV2FTrustedChannelBinding {
  return {
    organizationId,
    inquiryId,
    channelAccount: {
      id: `synthetic-channel-${provider.toLowerCase()}-${accountSuffix}`,
      organizationId,
      provider,
      externalAccountId: `synthetic-external-${provider.toLowerCase()}-${accountSuffix}`,
    },
  };
}

function providerEvent(
  trusted: GlhV2FTrustedChannelBinding,
  input: Partial<GlhV2FProviderInboundEventInput> & {
    externalEventId: string;
    externalMessageId: string;
  },
): GlhV2FProviderInboundEventInput {
  return {
    schemaVersion: GLH_V2F_MULTICHANNEL_EVENT_SCHEMA_VERSION,
    provider: trusted.channelAccount.provider,
    externalAccountId: trusted.channelAccount.externalAccountId,
    externalConversationId: 'synthetic-conversation',
    externalContactId: 'synthetic-contact',
    direction: 'INBOUND',
    sourceTimestamp: '2026-11-06T10:15:30Z',
    body: 'Hello',
    mediaIds: [],
    ...input,
  };
}

function acceptedEvent(
  result: ReturnType<typeof normalizeGlhV2FMultichannelInbound>,
): GlhV2FStoredMultichannelEvent {
  if (!result.ok) {
    throw Error(`expected accepted event, got ${result.errorCode}`);
  }
  return result.event;
}

function ingest(
  trusted: GlhV2FTrustedChannelBinding,
  event: GlhV2FProviderInboundEventInput | unknown,
  history: readonly GlhV2FStoredMultichannelEvent[] | readonly unknown[] = [],
) {
  const head = history.at(-1);
  const expectedHistoryHeadFingerprint = head
    && typeof head === 'object'
    && 'fingerprint' in head
    && typeof head.fingerprint === 'string'
    ? head.fingerprint
    : null;
  return normalizeGlhV2FMultichannelInbound({
    trustedBinding: trusted,
    event,
    history,
    expectedHistoryHeadFingerprint,
  });
}

const whatsappBinding = binding('WHATSAPP');
const messengerBinding = binding('FACEBOOK');
const instagramBinding = binding('INSTAGRAM');

// Valid normal ISO 8601 source timestamps, multilingual bodies, and canonical
// media identifiers survive all three provider normalizers without rewriting.
const providerScopes = [
  {
    binding: whatsappBinding,
    surface: 'WHATSAPP' as GlhV2FChannelSurface,
    timestamp: '2026-11-06T10:15:30Z',
    body: '我需要塑料杯热转印花膜，材质是 ABS。',
  },
  {
    binding: messengerBinding,
    surface: 'FACEBOOK_MESSENGER' as GlhV2FChannelSurface,
    timestamp: '2026-11-06T18:15:30.123+08:00',
    body: 'نحتاج فيلم نقل حراري للعبوات البلاستيكية',
  },
  {
    binding: instagramBinding,
    surface: 'INSTAGRAM_DM' as GlhV2FChannelSurface,
    timestamp: '2026-11-06T05:15:30-05:00',
    body: 'We need heat transfer film with the attached specification.',
  },
] as const;

const mixedHistory: GlhV2FStoredMultichannelEvent[] = [];
for (const [index, scope] of providerScopes.entries()) {
  const result = ingest(
    scope.binding,
    providerEvent(scope.binding, {
      // Deliberately collide the provider-facing IDs across channels.
      externalEventId: 'collision-event-id',
      externalMessageId: 'collision-message-id',
      externalConversationId: `conversation-${index}`,
      sourceTimestamp: scope.timestamp,
      body: scope.body,
      mediaIds: ['collision-media-id'],
    }),
    mixedHistory,
  );
  const event = acceptedEvent(result);
  assert.equal(event.surface, scope.surface);
  assert.equal(event.organizationId, organizationId);
  assert.equal(event.inquiryId, inquiryId);
  assert.equal(event.direction, 'INBOUND');
  assert.equal(event.sourceTimestamp, scope.timestamp);
  assert.equal(event.body, scope.body);
  assert.deepEqual(event.mediaIds, ['collision-media-id']);
  assert.equal(result.originalEventPreserved, true);
  mixedHistory.push(event);
}
assert.equal(mixedHistory.length, 3);
assert.equal(
  new Set(mixedHistory.map(event => event.eventId)).size,
  3,
  'provider-facing event ID collisions remain namespaced by provider/account',
);
assert.equal(
  new Set(mixedHistory.map(event => event.messageId)).size,
  3,
  'provider-facing message ID collisions remain namespaced by provider/account',
);

// Scope always comes from the trusted binding. Foreign client claims and a
// provider/account mismatch fail before normalization.
const foreignOrganization = ingest(
  whatsappBinding,
  providerEvent(whatsappBinding, {
    externalEventId: 'foreign-org-event',
    externalMessageId: 'foreign-org-message',
    clientScope: { organizationId: foreignOrganizationId },
  }),
);
assert.equal(foreignOrganization.ok, false);
if (foreignOrganization.ok) throw Error('expected foreign org rejection');
assert.equal(foreignOrganization.errorCode, 'UNTRUSTED_SCOPE_MISMATCH');

const topLevelForeignOrganization = ingest(
  whatsappBinding,
  {
    ...providerEvent(whatsappBinding, {
      externalEventId: 'top-level-foreign-org-event',
      externalMessageId: 'top-level-foreign-org-message',
    }),
    organizationId: foreignOrganizationId,
  },
);
assert.equal(topLevelForeignOrganization.ok, false);
if (topLevelForeignOrganization.ok) {
  throw Error('expected top-level foreign org rejection');
}
assert.equal(
  topLevelForeignOrganization.errorCode,
  'UNTRUSTED_SCOPE_MISMATCH',
);

const foreignInquiry = ingest(
  whatsappBinding,
  providerEvent(whatsappBinding, {
    externalEventId: 'foreign-inquiry-event',
    externalMessageId: 'foreign-inquiry-message',
    clientScope: { inquiryId: foreignInquiryId },
  }),
);
assert.equal(foreignInquiry.ok, false);
if (foreignInquiry.ok) throw Error('expected foreign inquiry rejection');
assert.equal(foreignInquiry.errorCode, 'UNTRUSTED_SCOPE_MISMATCH');

const foreignChannel = ingest(
  whatsappBinding,
  providerEvent(whatsappBinding, {
    externalEventId: 'foreign-channel-event',
    externalMessageId: 'foreign-channel-message',
    clientScope: { channelAccountId: 'synthetic-foreign-channel' },
  }),
);
assert.equal(foreignChannel.ok, false);
if (foreignChannel.ok) throw Error('expected foreign channel rejection');
assert.equal(foreignChannel.errorCode, 'UNTRUSTED_SCOPE_MISMATCH');

const wrongProvider = ingest(
  whatsappBinding,
  providerEvent(whatsappBinding, {
    provider: 'FACEBOOK',
    externalEventId: 'wrong-provider-event',
    externalMessageId: 'wrong-provider-message',
  }),
);
assert.equal(wrongProvider.ok, false);
if (wrongProvider.ok) throw Error('expected provider mismatch rejection');
assert.equal(wrongProvider.errorCode, 'PROVIDER_ACCOUNT_MISMATCH');

const wrongAccount = ingest(
  whatsappBinding,
  providerEvent(whatsappBinding, {
    externalAccountId: 'synthetic-foreign-account',
    externalEventId: 'wrong-account-event',
    externalMessageId: 'wrong-account-message',
  }),
);
assert.equal(wrongAccount.ok, false);
if (wrongAccount.ok) throw Error('expected account mismatch rejection');
assert.equal(wrongAccount.errorCode, 'PROVIDER_ACCOUNT_MISMATCH');

const invalidTrustedAccount = ingest(
  {
    ...whatsappBinding,
    channelAccount: {
      ...whatsappBinding.channelAccount,
      organizationId: foreignOrganizationId,
    },
  },
  providerEvent(whatsappBinding, {
    externalEventId: 'bad-binding-event',
    externalMessageId: 'bad-binding-message',
  }),
);
assert.equal(invalidTrustedAccount.ok, false);
if (invalidTrustedAccount.ok) throw Error('expected bad binding rejection');
assert.equal(invalidTrustedAccount.errorCode, 'INVALID_TRUSTED_BINDING');

// Outbound events and malformed timestamps are rejected.
const wrongDirection = ingest(
  whatsappBinding,
  providerEvent(whatsappBinding, {
    externalEventId: 'outbound-event',
    externalMessageId: 'outbound-message',
    direction: 'OUTBOUND',
  }),
);
assert.equal(wrongDirection.ok, false);
if (wrongDirection.ok) throw Error('expected direction rejection');
assert.equal(wrongDirection.errorCode, 'WRONG_DIRECTION');

for (const [index, sourceTimestamp] of [
  '2026-02-30T10:15:30Z',
  '2026-11-06T10:15:30',
  '2026-11-06T24:00:00Z',
  'not-a-timestamp',
].entries()) {
  const malformedTimestamp = ingest(
    whatsappBinding,
    providerEvent(whatsappBinding, {
      externalEventId: `bad-timestamp-event-${index}`,
      externalMessageId: `bad-timestamp-message-${index}`,
      sourceTimestamp,
    }),
  );
  assert.equal(malformedTimestamp.ok, false);
  if (malformedTimestamp.ok) throw Error('expected timestamp rejection');
  assert.equal(malformedTimestamp.errorCode, 'INVALID_TIMESTAMP');
}

// Replay fingerprints and idempotency values are recomputed, never trusted.
const fingerprintAttempt = ingest(
  whatsappBinding,
  providerEvent(whatsappBinding, {
    externalEventId: 'claimed-fingerprint-event',
    externalMessageId: 'claimed-fingerprint-message',
    replayFingerprint: '0000000000000000000000000000000000000000000000000000000000000000',
  }),
);
assert.equal(fingerprintAttempt.ok, false);
if (fingerprintAttempt.ok) throw Error('expected fingerprint rejection');
assert.equal(fingerprintAttempt.errorCode, 'REPLAY_FINGERPRINT_CONFLICT');

const idempotencyAttempt = ingest(
  whatsappBinding,
  providerEvent(whatsappBinding, {
    externalEventId: 'claimed-idempotency-event',
    externalMessageId: 'claimed-idempotency-message',
    idempotencyKey: 'v2f-idem:client-controlled',
  }),
);
assert.equal(idempotencyAttempt.ok, false);
if (idempotencyAttempt.ok) throw Error('expected idempotency rejection');
assert.equal(idempotencyAttempt.errorCode, 'IDEMPOTENCY_MISMATCH');

// Build a two-event trusted history for duplicate and replay checks.
const first = acceptedEvent(ingest(
  whatsappBinding,
  providerEvent(whatsappBinding, {
    externalEventId: 'replay-event',
    externalMessageId: 'replay-message',
    body: 'Original multilingual body 原始内容',
    mediaIds: ['replay-media'],
  }),
));
const second = acceptedEvent(ingest(
  whatsappBinding,
  providerEvent(whatsappBinding, {
    externalEventId: 'later-event',
    externalMessageId: 'later-message',
    sourceTimestamp: '2026-11-06T10:16:30Z',
    body: 'Later body',
  }),
  [first],
));
const trustedHistory = [first, second];

const duplicateEvent = ingest(
  whatsappBinding,
  providerEvent(whatsappBinding, {
    externalEventId: first.externalEventId,
    externalMessageId: first.externalMessageId,
    body: first.body,
    mediaIds: first.mediaIds,
  }),
  trustedHistory,
);
assert.equal(duplicateEvent.ok, false);
if (duplicateEvent.ok) throw Error('expected duplicate event rejection');
assert.equal(duplicateEvent.errorCode, 'DUPLICATE_EVENT');

const changedBodyReplay = ingest(
  whatsappBinding,
  providerEvent(whatsappBinding, {
    externalEventId: first.externalEventId,
    externalMessageId: first.externalMessageId,
    body: 'Changed body with same provider event ID',
    mediaIds: first.mediaIds,
  }),
  trustedHistory,
);
assert.equal(changedBodyReplay.ok, false);
if (changedBodyReplay.ok) throw Error('expected changed-body replay rejection');
assert.equal(changedBodyReplay.errorCode, 'REPLAY_FINGERPRINT_CONFLICT');

const duplicateMessage = ingest(
  whatsappBinding,
  providerEvent(whatsappBinding, {
    externalEventId: 'new-event-with-old-message',
    externalMessageId: first.externalMessageId,
  }),
  trustedHistory,
);
assert.equal(duplicateMessage.ok, false);
if (duplicateMessage.ok) throw Error('expected duplicate message rejection');
assert.equal(duplicateMessage.errorCode, 'DUPLICATE_MESSAGE');

const duplicateMedia = ingest(
  whatsappBinding,
  providerEvent(whatsappBinding, {
    externalEventId: 'new-event-with-old-media',
    externalMessageId: 'new-message-with-old-media',
    mediaIds: ['replay-media'],
  }),
  trustedHistory,
);
assert.equal(duplicateMedia.ok, false);
if (duplicateMedia.ok) throw Error('expected duplicate media rejection');
assert.equal(duplicateMedia.errorCode, 'DUPLICATE_MEDIA');

const duplicateMediaWithinEvent = ingest(
  whatsappBinding,
  providerEvent(whatsappBinding, {
    externalEventId: 'duplicate-in-event-media',
    externalMessageId: 'duplicate-in-event-media-message',
    mediaIds: ['same-media', 'same-media'],
  }),
);
assert.equal(duplicateMediaWithinEvent.ok, false);
if (duplicateMediaWithinEvent.ok) throw Error('expected duplicate in-event media rejection');
assert.equal(duplicateMediaWithinEvent.errorCode, 'DUPLICATE_MEDIA_INPUT');

// Every stored fingerprint is recomputed from canonical event fields before
// replay. Scope, IDs, provider, body, timestamp, media, fingerprint, and
// idempotency tampering all fail closed.
const foreignHistory = structuredClone(trustedHistory);
foreignHistory[0] = {
  ...foreignHistory[0],
  organizationId: foreignOrganizationId,
};
const foreignHistoryResult = normalizeGlhV2FMultichannelInbound({
  trustedBinding: whatsappBinding,
  event: providerEvent(whatsappBinding, {
    externalEventId: 'foreign-history-new-event',
    externalMessageId: 'foreign-history-new-message',
  }),
  history: foreignHistory,
  expectedHistoryHeadFingerprint: foreignHistory[1].fingerprint,
});
assert.equal(foreignHistoryResult.ok, false);
if (foreignHistoryResult.ok) throw Error('expected foreign history rejection');
assert.equal(foreignHistoryResult.errorCode, 'HISTORY_SCOPE_MISMATCH');

const tamperCases: ReadonlyArray<{
  readonly label: string;
  readonly mutate: (history: GlhV2FStoredMultichannelEvent[]) => void;
}> = [
  {
    label: 'message identity',
    mutate: history => {
      history[0] = { ...history[0], externalMessageId: 'tampered-message' };
    },
  },
  {
    label: 'media identity',
    mutate: history => {
      history[0] = { ...history[0], mediaIds: ['tampered-media'] };
    },
  },
  {
    label: 'provider',
    mutate: history => {
      history[0] = { ...history[0], provider: 'FACEBOOK' };
    },
  },
  {
    label: 'surface',
    mutate: history => {
      history[0] = { ...history[0], surface: 'FACEBOOK_MESSENGER' };
    },
  },
  {
    label: 'stored fingerprint',
    mutate: history => {
      history[0] = { ...history[0], fingerprint: 'f'.repeat(64) };
    },
  },
  {
    label: 'body',
    mutate: history => {
      history[0] = { ...history[0], body: 'Tampered stored body' };
    },
  },
  {
    label: 'source timestamp',
    mutate: history => {
      history[0] = {
        ...history[0],
        sourceTimestamp: '2026-11-06T11:16:30Z',
      };
    },
  },
  {
    label: 'idempotency',
    mutate: history => {
      history[0] = { ...history[0], idempotencyKey: 'v2f-idem:tampered' };
    },
  },
  {
    label: 'history chain',
    mutate: history => {
      history[1] = { ...history[1], previousFingerprint: 'e'.repeat(64) };
    },
  },
];

for (const tamperCase of tamperCases) {
  const tamperedHistory = structuredClone(trustedHistory);
  tamperCase.mutate(tamperedHistory);
  const result = normalizeGlhV2FMultichannelInbound({
    trustedBinding: whatsappBinding,
    event: providerEvent(whatsappBinding, {
      externalEventId: `tamper-check-${tamperCase.label}`,
      externalMessageId: `tamper-check-message-${tamperCase.label}`,
    }),
    history: tamperedHistory,
    expectedHistoryHeadFingerprint: tamperedHistory[1].fingerprint,
  });
  assert.equal(result.ok, false, `${tamperCase.label} tampering must reject`);
  if (result.ok) throw Error(`expected ${tamperCase.label} rejection`);
  assert.equal(
    result.errorCode,
    'HISTORY_TAMPERED',
    `${tamperCase.label} must be reported as tampered history`,
  );
}

// The trusted server head prevents stale/truncated history from being replayed.
const staleAgainstNewHead = normalizeGlhV2FMultichannelInbound({
  trustedBinding: whatsappBinding,
  event: providerEvent(whatsappBinding, {
    externalEventId: 'stale-history-event',
    externalMessageId: 'stale-history-message',
  }),
  history: [first],
  expectedHistoryHeadFingerprint: second.fingerprint,
});
assert.equal(staleAgainstNewHead.ok, false);
if (staleAgainstNewHead.ok) throw Error('expected stale history rejection');
assert.equal(staleAgainstNewHead.errorCode, 'STALE_HISTORY');

const staleAgainstEmptyHistory = normalizeGlhV2FMultichannelInbound({
  trustedBinding: whatsappBinding,
  event: providerEvent(whatsappBinding, {
    externalEventId: 'stale-empty-history-event',
    externalMessageId: 'stale-empty-history-message',
  }),
  history: [],
  expectedHistoryHeadFingerprint: first.fingerprint,
});
assert.equal(staleAgainstEmptyHistory.ok, false);
if (staleAgainstEmptyHistory.ok) throw Error('expected stale empty-history rejection');
assert.equal(staleAgainstEmptyHistory.errorCode, 'STALE_HISTORY');

// AI text remains a draft and no mode permits a customer-facing provider send.
for (const conversationMode of GLH_V2F_CONVERSATION_MODES) {
  for (const handoffInterrupted of [false, true]) {
    const plan = planGlhV2FHandoffSafety({
      conversationMode,
      handoffInterrupted,
      aiSuggestionText: `Draft for ${conversationMode}`,
    });
    assert.equal(plan.conversationMode, conversationMode);
    assert.equal(plan.handoffInterrupted, handoffInterrupted);
    assert.equal(plan.aiSuggestion?.state, 'DRAFT_ONLY');
    assert.equal(plan.aiSuggestion?.humanReviewRequired, true);
    assert.equal(plan.aiSuggestion?.businessFact, false);
    assert.equal(plan.customerFacingAutoSendAllowed, false);
    assert.equal(plan.providerSendAllowed, false);
    assert.equal(plan.providerCallsPerformed, 0);
    assert.equal(plan.preserveOriginalEvent, true);
    assert.equal(plan.humanReviewRequired, true);
  }
}

assert.equal(GLH_V2F_PROVIDER_CALLS_ENABLED, false);
console.log('global-lead-hub-v2-multichannel-sim.test.ts: PASS');
