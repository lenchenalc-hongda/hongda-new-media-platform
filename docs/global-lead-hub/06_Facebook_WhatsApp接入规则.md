# 06 Facebook / WhatsApp 接入规则

> SPEC_LOCK_VERSION = GLH-SPEC-V1.0
> FROZEN = YES

## Official integration only

Use official Meta Business / Graph / WhatsApp Business Platform capabilities.

Never build:

- WhatsApp Web DOM automation;
- browser click bots;
- credential scraping;
- unofficial session-token automation.

## Inbound flow

```text
Meta webhook
→ persist glh_webhook_events with idempotency key
→ normalize provider payload
→ resolve/create contact + conversation
→ persist original glh_message
→ resolve/create lead
→ run AI qualification/handoff logic
```

## Outbound

All sends go through a controlled server-side adapter such as `sendWhatsAppMessage()`.

Do not call provider send APIs directly from arbitrary UI components.

Implementation must verify then-current Meta rules for:

- free-form customer-service messaging windows;
- approved template messages;
- business account/phone permissions;
- webhook verification and signatures.

Do not invent IDs/scopes in spec.

## Ad attribution

When provider payload includes referral/ad metadata, capture:

- campaign;
- adset;
- ad;
- creative/referral identifier;
- source platform.

If attribution is absent, store UNKNOWN rather than inventing.

## Idempotency

Inbound uniqueness at minimum:

`provider + external_event_id`.

AI outbound idempotency should include:

`conversation_id + trigger_message_id + action_type + prompt_version`.

Webhook replay must not create duplicate message, duplicate lead, or duplicate AI auto-reply.

## Secrets

Tokens, app secrets, webhook secrets and service-role values stay server-side and are never logged or returned to browser payloads.

## Failure rules

- media download failure must not delete/drop the message;
- AI outage → preserve inbound + create human task/handoff;
- provider send failure → persist status/error and surface retry/manual action;
- duplicate webhook → safe no-op.
