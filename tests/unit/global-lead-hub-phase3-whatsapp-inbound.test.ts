import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  parseGlhWhatsAppInbound,
  verifyGlhWhatsAppSignature,
  verifyGlhWhatsAppToken,
} from '../../src/lib/global-lead-hub/whatsapp-inbound';

const source = (path: string) => readFileSync(path, 'utf8');

const payload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'waba-1',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: {
          display_phone_number: '15551234567',
          phone_number_id: 'phone-number-1',
        },
        contacts: [{ wa_id: '2341000000001', profile: { name: 'Ada Buyer' } }],
        messages: [{
          id: 'wamid.inbound-1',
          from: '2341000000001',
          timestamp: '1791655200',
          type: 'text',
          text: { body: 'Please quote 20 rolls.' },
          referral: { source_id: 'ad-123', ctwa_clid: 'click-123' },
        }],
      },
    }],
  }],
};

const raw = Buffer.from(JSON.stringify(payload));
const secret = 'synthetic-app-secret';
const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
assert.equal(verifyGlhWhatsAppSignature(raw, signature, secret), true);
assert.equal(verifyGlhWhatsAppSignature(raw, signature.replace(/.$/, '0'), secret), false);
assert.equal(verifyGlhWhatsAppSignature(raw, null, secret), false);
assert.equal(verifyGlhWhatsAppSignature(raw, 'sha256=bad', secret), false);
assert.equal(verifyGlhWhatsAppToken('verify-me', 'verify-me'), true);
assert.equal(verifyGlhWhatsAppToken('wrong', 'verify-me'), false);
assert.equal(verifyGlhWhatsAppToken('verify-me', undefined), false);

const parsed = parseGlhWhatsAppInbound(payload);
assert.equal(parsed.kind, 'accepted');
if (parsed.kind === 'accepted') {
  assert.equal(parsed.messages.length, 1);
  assert.deepEqual(parsed.messages[0], {
    provider: 'WHATSAPP',
    externalEventId: 'wamid.inbound-1',
    providerAccountId: 'phone-number-1',
    externalContactId: '2341000000001',
    externalConversationId: '2341000000001',
    contactDisplayName: 'Ada Buyer',
    messageType: 'text',
    messageText: 'Please quote 20 rolls.',
    mediaMetadata: {
      message_type: 'text',
      referral: { source_id: 'ad-123', ctwa_clid: 'click-123' },
    },
    providerTimestamp: '2026-10-10T18:00:00.000Z',
    referral: { source_id: 'ad-123', ctwa_clid: 'click-123' },
  });
}

const statusOnly = parseGlhWhatsAppInbound({
  object: 'whatsapp_business_account',
  entry: [{
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { phone_number_id: 'phone-number-1' },
        statuses: [{ id: 'wamid.outbound-1', status: 'read' }],
      },
    }],
  }],
});
assert.deepEqual(statusOnly, { kind: 'ignored', reason: 'NO_INBOUND_MESSAGES' });
assert.equal(parseGlhWhatsAppInbound({ object: 'other', entry: [] }).kind, 'ignored');
assert.equal(parseGlhWhatsAppInbound({ object: 'whatsapp_business_account' }).kind, 'invalid');
assert.equal(parseGlhWhatsAppInbound({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: { messaging_product: 'whatsapp' } }] }],
}).kind, 'invalid');

const route = source('src/app/api/global-lead-hub/webhooks/whatsapp/route.ts');
assert(route.includes("request.headers.get('x-hub-signature-256')"));
assert(route.includes('request.arrayBuffer()'));
assert(route.includes('WHATSAPP_WEBHOOK_VERIFY_TOKEN'));
assert(route.includes('WHATSAPP_APP_SECRET'));
assert(route.includes("admin.rpc('glh_ingest_whatsapp_inbound'"));
assert(route.includes("result.ok !== true"), 'failed persistence cannot claim success');
assert(!route.includes('console.'), 'webhook route does not log payloads or secrets');
assert(!route.includes('fetch('), 'inbound route makes no provider or outbound call');
assert(!route.includes('api.whatsapp.com'), 'inbound route contains no WhatsApp outbound endpoint');

const parser = source('src/lib/global-lead-hub/whatsapp-inbound.ts');
assert(parser.includes("createHmac('sha256'"));
assert(parser.includes('timingSafeEqual'));
assert(!parser.includes('console.'));

const migration = source(
  'supabase/migrations/20261010182400_global_lead_hub_phase3_whatsapp_inbound.sql',
);
const executableSql = migration
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');
assert(migration.includes('CREATE OR REPLACE FUNCTION public.glh_ingest_whatsapp_inbound'));
assert(migration.includes('SECURITY DEFINER'));
assert(migration.includes('SET search_path = pg_catalog, public'));
assert(!migration.includes('p_org_id'), 'organization cannot be supplied by the request');
assert(migration.includes("provider = 'WHATSAPP'"));
assert(migration.includes("status IN ('TEST_READY', 'CONNECTED')"));
assert(
  migration.indexOf('INSERT INTO public.glh_webhook_events')
    < migration.indexOf('INSERT INTO public.glh_contacts'),
  'verified raw event is persisted before logical records',
);
assert(migration.includes('ON CONFLICT (provider, external_event_id) DO NOTHING'));
assert(migration.includes("'status', 'DUPLICATE'"));
assert(migration.includes('INSERT INTO public.glh_messages'));
assert(migration.includes("'INBOUND', 'CUSTOMER'"));
assert(migration.includes("processing_status = 'FAILED'"));
assert(migration.includes("processing_status = 'PROCESSED'"));
assert(migration.includes('FROM PUBLIC, anon, authenticated'));
assert(migration.includes('TO service_role'));
assert(!/\b(DROP|TRUNCATE|DELETE)\b/i.test(executableSql), 'migration is forward-only');
assert(!/GRANT\s+(SELECT|INSERT|UPDATE|DELETE)[\s\S]*\b(anon|authenticated)\b/i.test(executableSql));

console.log('Global Lead Hub Phase 3 WhatsApp inbound tests passed');
