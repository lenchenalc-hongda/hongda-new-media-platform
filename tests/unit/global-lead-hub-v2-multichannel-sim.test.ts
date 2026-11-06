import assert from 'node:assert/strict';
import {
  GLH_V2F_CHANNELS,
  simulateGlhV2FInbound,
  type GlhV2FTrustedChannel,
  type GlhV2FSyntheticInbound,
  type GlhV2FNormalizedEvent,
} from '../../src/lib/global-lead-hub/v2-multichannel-sim';

const org = 'org-synthetic';
const inquiry = 'inquiry-synthetic';
const trusted = (provider: GlhV2FTrustedChannel['provider'], mode:
  GlhV2FTrustedChannel['conversationMode'] = 'AI_ACTIVE'): GlhV2FTrustedChannel => ({
  organizationId:org,inquiryId:inquiry,provider,
  channelAccountId:provider.toLowerCase()+'-account',conversationMode:mode,
});
const inbound = (
  channel: GlhV2FTrustedChannel,
  eventId: string,
  text: string | null = 'Need heat transfer film for PP cups, MOQ?',
  mediaIds: string[] = [],
): GlhV2FSyntheticInbound => ({
  organizationId:org,inquiryId:inquiry,provider:channel.provider,
  channelAccountId:channel.channelAccountId,
  externalEventId:eventId, externalMessageId:'message-'+eventId,
  receivedAt:'2026-11-06T02:00:00Z',
  direction:'INBOUND',bodyText:text,mediaIds,
});

let history: readonly GlhV2FNormalizedEvent[] = [];
for (const provider of GLH_V2F_CHANNELS) {
  const scope = trusted(provider);
  const r = simulateGlhV2FInbound({
    trusted:scope,
    inbound:inbound(scope,'inbound-1',
      provider==='INSTAGRAM_DM'?'我想看看杯子的热转印效果':provider==='FACEBOOK_MESSENGER'?'كم سعر طباعة الأكواب؟':'Can you print on ABS?'),
    history,
  });
  assert.equal(r.ok,true,provider+' must be normalized');
  if(!r.ok) throw Error('missing synthetic event');
  assert.equal(r.action,'APPENDED');
  assert.equal(r.event.provider,provider);
  assert.equal(r.event.preserveOriginalMessage,true);
  assert.equal(r.event.customerFacingAutoSendAllowed,false);
  assert.equal(r.event.humanReviewRequired,true);
  assert.equal(r.event.authority,'UNVERIFIED_CHANNEL_EVENT');
  assert.equal(r.providerCalls,0);
  history=r.events;
}
assert.equal(history.length,3,'same external event ID on different providers must not collide');

const wa=trusted('WHATSAPP');
const text=inbound(wa,'wam-2');
const first=simulateGlhV2FInbound({trusted:wa,inbound:text,history});
assert.equal(first.ok,true);
if(!first.ok) throw Error('should append WhatsApp message');
const replay=simulateGlhV2FInbound({trusted:wa,inbound:text,history:first.events});
assert.equal(replay.ok,true);
if(!replay.ok) throw Error('should safely replay');
assert.equal(replay.action,'REPLAYED');
assert.strictEqual(replay.events,first.events,'replay must not append a second event');
assert.equal(replay.events.length,4);

const conflict=simulateGlhV2FInbound({
  trusted:wa,inbound:{...text,bodyText:'Please guarantee production next week'},
  history:first.events,
});
assert.deepEqual(conflict.ok,false);
if(conflict.ok) throw Error('same key different payload must fail');
assert.equal(conflict.code,'IDEMPOTENCY_CONFLICT');

const differentEventSameMessage=simulateGlhV2FInbound({
  trusted:wa,
  inbound:{...text,externalEventId:'another-event'},
  history:first.events,
});
assert.equal(differentEventSameMessage.ok,false);
if(differentEventSameMessage.ok) throw Error('message ID must be unique');
assert.equal(differentEventSameMessage.code,'MESSAGE_ID_CONFLICT');

const media=inbound(wa,'media-1',null,['canonical-image-id']);
const mediaResult=simulateGlhV2FInbound({trusted:wa,inbound:media,history:[]});
assert.equal(mediaResult.ok,true);
if(!mediaResult.ok) throw Error('valid media-only event');
assert.deepEqual(mediaResult.event.mediaIds,['canonical-image-id']);
assert.equal(mediaResult.event.bodyText,null);
assert.equal(mediaResult.event.customerFacingAutoSendAllowed,false);
const changedSource=inbound(wa,'media-1',null,['forged-image-id']);
const mediaCollision=simulateGlhV2FInbound({
  trusted:wa,inbound:changedSource,history:mediaResult.events,
});
assert.equal(mediaCollision.ok,false);

for(const mode of ['AI_ACTIVE','HANDOFF_PENDING','HUMAN_ACTIVE','PAUSED'] as const){
  const scope=trusted('WHATSAPP',mode);
  const r=simulateGlhV2FInbound({trusted:scope,inbound:inbound(scope,'mode-'+mode),history:[]});
  assert.equal(r.ok,true);
  if(r.ok){
    assert.equal(r.customerFacingAutoSendAllowed,false,
      'no second AI responder is ever enabled, especially after human takeover');
  }
}

const rejectCode=(ev: GlhV2FSyntheticInbound, scope=wa) => {
  const r=simulateGlhV2FInbound({trusted:scope,inbound:ev,history:[]});
  assert.equal(r.ok,false);
  if(r.ok) throw Error('expected refusal');
  return r.code;
};
assert.equal(rejectCode({...text,organizationId:'another-org'}),'UNTRUSTED_CHANNEL_SCOPE');
assert.equal(rejectCode({...text,inquiryId:'other-lead'}),'UNTRUSTED_CHANNEL_SCOPE');
assert.equal(rejectCode({...text,channelAccountId:'other-account'}),'UNTRUSTED_CHANNEL_SCOPE');
assert.equal(rejectCode({...text,provider:'INSTAGRAM_DM'}),'UNTRUSTED_CHANNEL_SCOPE');
assert.equal(rejectCode({...text,provider:'UNSUPPORTED_CHANNEL'}),'INVALID_EVENT');
assert.equal(rejectCode({...text,direction:'OUTBOUND' as 'INBOUND'}),'INVALID_EVENT');
assert.equal(rejectCode({...text,receivedAt:'2026-02-30T00:00:00Z'}),'INVALID_EVENT');
assert.equal(rejectCode({...text,bodyText:''}),'INVALID_EVENT');
assert.equal(rejectCode({...text,bodyText:'X'.repeat(8001)}),'INVALID_EVENT');
assert.equal(rejectCode({...text,mediaIds:['https://example.com/forged-url']}),'INVALID_EVENT');
assert.equal(rejectCode({...text,mediaIds:['duplicate','duplicate']}),'INVALID_EVENT');
assert.equal(rejectCode({...text,externalEventId:'bad whitespace'}),'INVALID_EVENT');

const corrupted=simulateGlhV2FInbound({
  trusted:wa,inbound:text,
  history:[{...first.event,organizationId:'other-org'}],
});
assert.equal(corrupted.ok,false);
if(corrupted.ok) throw Error('history provenance must be checked');
assert.equal(corrupted.code,'UNTRUSTED_HISTORY');

assert.equal(history.length,3,'original input history cannot be mutated');
assert.equal(first.events.length,4,'idempotency conflict must not mutate successful history');
console.log('GLH_V2F_MULTICHANNEL_OFFLINE_PASS: 3 providers, replay, provenance, media, human takeover, no sending');
