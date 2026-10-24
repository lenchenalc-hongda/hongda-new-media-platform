# GLH Phase 3 WhatsApp offline simulation acceptance

Status: pre-integration acceptance evidence for
`GLH-P3-WHATSAPP-SIMULATION-001`.

This slice is offline and deterministic. It uses only synthetic WhatsApp payloads,
test-only HMAC and verification-challenge inputs, and an in-memory replay store.
It does not connect to Meta, Supabase, a database, a provider, Production, or any
external service. The implementation under test is not changed by this slice.

## Scope and safety boundary

- Provider calls are hard-disabled by
  `GLH_PROVIDER_CALLS_ENABLED = false`.
- Both real webhook handlers must return HTTP `503` before reading and processing
  GET query parameters or POST body data.
- No real or Production credential is required or supplied.
- No database write is attempted; replay and failure behavior are modeled in memory.
- No outbound message, automatic reply, template, or provider request is produced.
- Missing ad attribution remains missing. No campaign, ad, ad set, creative, platform,
  or referral value is inferred.
- This document and its test are the only changed paths. Shared route, channel
  constant, migration, package, environment, and configuration files are out of scope.

The in-memory model mirrors the relevant persistence order of
`public.glh_ingest_whatsapp_inbound`: the verified raw webhook event is recorded first,
and downstream derivation may subsequently fail. A failed downstream step returns
failure and leaves the raw inbound event recorded with `FAILED` status. The model does
not replace database, transaction, RLS, or concurrency testing.

## Synthetic test matrix

| Case | Synthetic input | Deterministic assertion |
| --- | --- | --- |
| Text inbound | `wamid.synthetic.text` from synthetic contact `15551110001` | Accepts one `WHATSAPP` message, preserves event/account/contact IDs and text, and uses the contact as conversation ID |
| Media inbound | `wamid.synthetic.media` with an image object | Preserves supplied media ID, MIME type, SHA-256, filename, and caption; does not invent message text |
| Partial referral | Referral containing only `source_id` and `ctwa_clid` | Preserves those exact facts and leaves campaign, ad set, ad, creative, and platform fields absent |
| Status-only webhook | Outbound `read` status and no `messages` array | Returns `ignored / NO_INBOUND_MESSAGES` without creating a customer message |
| Malformed shape | Non-array `entry`, non-array `messages`, or message without an ID | Returns `invalid` with a deterministic reason and no partial acceptance |
| HMAC | Test-only key over byte-exact JSON | Accepts valid SHA-256 HMAC; rejects a changed signature, changed raw body, missing signature, malformed signature, and missing key |
| Verify token | Test-only challenge token | Accepts an exact match; rejects a wrong, missing supplied, or missing expected token |
| Declared body limit | Declared `1,000,001` bytes with a small body | Returns `413` in the post-gate size model |
| Actual body limit | Actual `1,000,001` bytes without a declared length | Returns `413` in the post-gate size model; exactly `1,000,000` bytes is allowed |
| Duplicate replay | Same external event ID twice | Uses idempotency key `WHATSAPP:<external_event_id>`; second result is `DUPLICATE`, with one event and one message |
| Conflicting external ID reuse | Same external event ID with different account, contact, and text | First raw event wins; no second message or silent overwrite occurs |
| Downstream failure | New event followed by a simulated downstream failure | Returns failure, retains the raw event as `FAILED`, and preserves its synthetic payload |
| Disabled GET/POST | Valid challenge, tampered signature, and oversized POST | Both real handlers return `503 Channel activation not authorized` before processing |
| Provider hard stop | Disabled WhatsApp adapter command | Returns `PROVIDER_CALLS_DISABLED`; an intercepted `fetch` remains unused |

## Acceptance evidence

The test asserts the parser's exact event identity, contact display name, timestamp,
message type, media metadata, and referral shape. It also verifies the production route
source keeps the hard gate before query/body processing and keeps persistence after the
gate. Runtime invocation of the real `GET` and `POST` exports proves both paths return
`503`; an injected `fetch` counter proves the route and disabled outbound adapter make
zero network calls.

No real implementation defect was found within this bounded simulation. If later
integration testing finds a defect, it requires a separate bounded fix task; this slice
does not modify the route, parser, channel constant, migration, or environment.

## Exact test commands

Run from the repository root:

```bash
pnpm exec tsx tests/unit/global-lead-hub-whatsapp-simulation.test.ts
pnpm exec tsx tests/unit/global-lead-hub-phase3-whatsapp-inbound.test.ts
pnpm typecheck
pnpm build
bash scripts/audit-bundle-secrets.sh
```

The build must preserve the hard-disabled provider gate. A local smoke of the built
application is:

```bash
pnpm next start -p 3000
```

In a second terminal, run:

```bash
BASE_URL=http://localhost:3000 pnpm exec tsx tests/e2e/routes.spec.ts
BASE_URL=http://localhost:3000 pnpm exec tsx tests/e2e/scripts.spec.ts
BASE_URL=http://localhost:3000 pnpm exec tsx tests/e2e/knowledge.spec.ts
BASE_URL=http://localhost:3000 pnpm exec tsx tests/e2e/topics.spec.ts
```

Expected result: the simulation test logs
`Global Lead Hub WhatsApp offline simulation tests passed`, the existing Phase 3 test
passes, typecheck and build succeed, the bundle secret audit reports no leaks, and all
local smoke routes pass. This acceptance does not authorize auto merge, deployment,
Production SQL/RLS/env changes, or a real Meta/WhatsApp cutover.
