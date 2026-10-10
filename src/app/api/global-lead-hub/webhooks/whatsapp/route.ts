import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import {
  GLH_WHATSAPP_MAX_WEBHOOK_BYTES,
  parseGlhWhatsAppInbound,
  verifyGlhWhatsAppSignature,
  verifyGlhWhatsAppToken,
} from '@/lib/global-lead-hub/whatsapp-inbound';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');

  if (
    mode !== 'subscribe'
    || !challenge
    || !verifyGlhWhatsAppToken(token, process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)
  ) {
    return response({ ok: false, error: 'Verification failed' }, 403);
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > GLH_WHATSAPP_MAX_WEBHOOK_BYTES) {
    return response({ ok: false, error: 'Payload too large' }, 413);
  }

  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (rawBody.byteLength > GLH_WHATSAPP_MAX_WEBHOOK_BYTES) {
    return response({ ok: false, error: 'Payload too large' }, 413);
  }
  if (!verifyGlhWhatsAppSignature(
    rawBody,
    request.headers.get('x-hub-signature-256'),
    process.env.WHATSAPP_APP_SECRET,
  )) {
    return response({ ok: false, error: 'Invalid signature' }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(rawBody).toString('utf8'));
  } catch {
    return response({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const parsed = parseGlhWhatsAppInbound(payload);
  if (parsed.kind === 'invalid') {
    return response({ ok: false, error: 'Invalid WhatsApp payload' }, 400);
  }
  if (parsed.kind === 'ignored') {
    return response({ ok: true, ignored: true, reason: parsed.reason });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return response({ ok: false, error: 'Inbound persistence unavailable' }, 503);
  }

  for (const message of parsed.messages) {
    const { data, error } = await admin.rpc('glh_ingest_whatsapp_inbound', {
      p_external_event_id: message.externalEventId,
      p_provider_account_id: message.providerAccountId,
      p_external_contact_id: message.externalContactId,
      p_external_conversation_id: message.externalConversationId,
      p_contact_display_name: message.contactDisplayName,
      p_message_type: message.messageType,
      p_message_text: message.messageText,
      p_media_metadata: message.mediaMetadata,
      p_provider_timestamp: message.providerTimestamp,
      p_referral: message.referral,
      p_raw_payload: payload,
    });
    const result = data && typeof data === 'object' && !Array.isArray(data)
      ? data as Record<string, unknown>
      : null;
    if (error || !result || result.ok !== true) {
      return response({ ok: false, error: 'Inbound persistence failed' }, 500);
    }
  }

  return response({ ok: true, accepted: parsed.messages.length });
}
