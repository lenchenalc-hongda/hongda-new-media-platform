# GLH V2-F | Offline Multichannel Intake and Handoff Acceptance

STATUS = DRAFT_ONLY / NONPRODUCTION
PROJECT = global-lead-hub
TASK = GLH-V2F-TRUSTED-MULTICHANNEL-OFFLINE-001
BASE_MASTER_SHA = 7d4b373e26a8785e4b5f4aa9d197357681341125
SOURCE_HEAD = 87bcd7cae1b1673af5b6411e0570213712edc91b
IMPLEMENTATION = src/lib/global-lead-hub/v2-multichannel-sim.ts
TEST = tests/unit/global-lead-hub-v2-multichannel-sim.test.ts
SUITE_REGISTRATION = tests/unit/global-lead-hub-v2-llm-extraction-eval.test.ts
PROVIDER_CALLS_ENABLED = false
AUTO_MERGE = false
AUTO_PRODUCTION = false

## 1. Scope

This slice defines a pure, synthetic inbound normalization boundary for:

- WhatsApp (`WHATSAPP`);
- Facebook Messenger (`FACEBOOK` provider, `FACEBOOK_MESSENGER` surface);
- Instagram DM (`INSTAGRAM` provider, `INSTAGRAM_DM` surface).

It accepts already-defined synthetic events. It does not receive real webhooks, verify
Meta signatures, route HTTP requests, call Meta or another provider, write a database, run
SQL/RLS/migrations, use secrets, enqueue a real send, or change Production.

The output is an immutable normalized event ready for a later, separately approved
persistence slice. The current Chinese GLH provider gate remains authoritative:
`GLH_PROVIDER_CALLS_ENABLED = false`.

## 2. Trusted scope

The caller supplies a `GlhV2FTrustedChannelBinding` produced by the authenticated server
path. The normalized event derives `organizationId`, `inquiryId`, `channelAccountId`,
provider, and external account from that binding.

Untrusted client scope is never copied into output:

- a matching optional client claim does not replace the trusted binding;
- any foreign organization, inquiry, or channel-account claim fails closed;
- a provider or external-account mismatch against the binding fails closed;
- an account binding whose organization differs from the trusted organization fails
  closed;
- a binding for one provider cannot accept another provider's event.

The caller must also pass the server's current history-head fingerprint, including `null`
for an empty history. A different history head is treated as stale and rejected.

## 3. Canonical event and replay contract

The module validates ordinary ISO 8601 timestamps with a date, time, and explicit `Z` or
numeric UTC offset. Calendar-invalid dates, missing offsets, invalid clock values, and
non-ISO text are rejected. The accepted source timestamp remains the exact source string.

The accepted event preserves:

- the complete multilingual body without translation or rewriting;
- the exact source timestamp;
- provider-facing event, message, conversation, contact, and account IDs;
- canonical media identifiers in source order.

Event, message, and media identities use namespaced canonical hashes containing the
provider and external account. The same provider-facing ID on WhatsApp, Messenger, and
Instagram therefore does not create a false cross-provider identity collision.

The event fingerprint is recomputed from all canonical security-relevant fields:

```text
schema
canonical event/message identity
trusted organization/inquiry/channel account scope
provider and external account
external event/message/conversation/contact identities
direction
exact source timestamp
exact multilingual body
ordered canonical media identifiers
```

The idempotency key is also derived from trusted scope and canonical event identity. A
client-supplied replay fingerprint or idempotency key is checked only; it never becomes
stored state.

Before checking a replay, every stored event fingerprint is recomputed from its canonical
fields. The module also verifies each stored event ID, message ID, surface, provider,
idempotency key, scope, and `previousFingerprint` chain. A changed body, timestamp, media,
provider, surface, message identity, fingerprint, idempotency key, or chain link rejects
the whole history as tampered.

## 4. Rejection and idempotency matrix

| Case | Result |
| --- | --- |
| Valid inbound event | `ACCEPTED`; event has the trusted scope and canonical fingerprint |
| Foreign organization/inquiry/channel claim | `UNTRUSTED_SCOPE_MISMATCH` |
| Wrong provider or external account | `PROVIDER_ACCOUNT_MISMATCH` |
| Outbound or unknown direction | `WRONG_DIRECTION` |
| Malformed calendar date, time, or timezone | `INVALID_TIMESTAMP` |
| Exact same event replay | `DUPLICATE_EVENT` |
| Same event identity with changed body, timestamp, media, or other canonical field | `REPLAY_FINGERPRINT_CONFLICT` |
| Different event reusing a message identity | `DUPLICATE_MESSAGE` |
| Different event reusing a media identity | `DUPLICATE_MEDIA` |
| Media identity repeated inside one event | `DUPLICATE_MEDIA_INPUT` |
| Client replay fingerprint differs from recomputation | `REPLAY_FINGERPRINT_CONFLICT` |
| Client idempotency key differs from recomputation | `IDEMPOTENCY_MISMATCH` |
| Foreign-organization/inquiry history | `HISTORY_SCOPE_MISMATCH` |
| Any stored canonical-field/fingerprint/chain tampering | `HISTORY_TAMPERED` |
| History does not end at the trusted server head | `STALE_HISTORY` |

Every rejection returns `originalEventPreserved=true`, `providerCallsPerformed=0`, and
`customerFacingAutoSendAllowed=false`.

## 5. AI draft and handoff safety

`planGlhV2FHandoffSafety` handles every existing GLH conversation mode:

- `AI_ACTIVE`;
- `HANDOFF_PENDING`;
- `HUMAN_ACTIVE`;
- `PAUSED`.

Any supplied AI text is labeled `DRAFT_ONLY`, requires human review, and is not a business
fact. No V2-F mode permits customer-facing auto-send or a provider send. The result remains
send-blocked when `handoffInterrupted=true`; an interrupted handoff never falls back to
automatic sending. Original event preservation is fixed to `true`.

This is deliberately stricter than the legacy V1 `AI_ACTIVE` conditions. It does not
change CPC customer ownership, GLH V1 scores/grades, finance source-of-truth records, or
customer-facing behavior.

## 6. Deterministic acceptance coverage

`tests/unit/global-lead-hub-v2-multichannel-sim.test.ts` executes with Node assertions and
is imported by the existing GLH V2 focused suite. It covers:

- valid normal ISO 8601 timestamps with UTC and numeric offsets;
- Chinese, Arabic, and English body preservation;
- WhatsApp, Facebook Messenger, and Instagram DM surfaces;
- identical provider-facing event/message/media IDs across providers without false
  cross-provider collisions;
- foreign organization, inquiry, channel-account, provider, and account attempts;
- wrong direction and malformed timestamps;
- changed-body replay under the same event identity;
- client-supplied fingerprint and idempotency conflicts;
- duplicate event, message, media, and in-event media identities;
- stored message, media, provider, surface, body, timestamp, fingerprint, idempotency, and
  chain tampering;
- stale and truncated history against the trusted server head;
- AI draft-only behavior in all four conversation modes, with interrupted and
  non-interrupted handoff states;
- fixed zero provider calls and fixed no-auto-send outputs.

The focused test is registered at the top of
`tests/unit/global-lead-hub-v2-llm-extraction-eval.test.ts`, so the existing GLH V2 suite
runs it rather than merely referencing it.

## 7. Verification

Local verification commands:

```bash
node --import tsx tests/unit/global-lead-hub-v2-multichannel-sim.test.ts
node --import tsx tests/unit/global-lead-hub-v2-llm-extraction-eval.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build
./scripts/audit-bundle-secrets.sh
```

The `tsx` loader form is used directly because this Codex sandbox denies the IPC socket
that the `tsx` CLI normally opens. This is an execution-environment limitation, not a
skipped TypeScript test.

Local execution record:

```text
GLH V2-F focused synthetic tests: PASS
GLH V2 focused suite registration: PASS (32 extraction fixtures plus V2-C and V2-F suites)
GLH Phase 1/3/4/5 and WhatsApp simulation regressions: PASS
TypeScript typecheck: PASS
Next.js production build: PASS
Static-bundle secret audit: PASS
Local HTTP smoke: BLOCKED_BY_SANDBOX_LISTEN_EPERM
```

The smoke attempt used `next start -H 127.0.0.1 -p 3127`; the sandbox rejected the socket
bind with `EPERM`. This is not an HTTP PASS. The task wrapper or an independent check
environment with local-listen permission must execute the smoke check.

## 8. Not tested / explicit non-claims

This task has not tested or proven:

- real Meta/WhatsApp webhook delivery, signature verification, challenge handling, or API
  permissions;
- real provider media download, malware scanning, retention, or Storage behavior;
- database inserts, unique constraints, transactions, concurrency, RLS, grants, or
  cross-tenant isolation;
- persistence and recovery across processes/instances;
- actual AI generation, model language/entity accuracy, or semantic correctness;
- any customer-facing send, delivery receipt, rate limit, or real external cutover;
- CPC customer-source-of-truth integration or Production migration/rollback.

The synthetic tests prove only this deterministic TypeScript contract. Real provider and
DEV database/RLS E2E must be a separate approved task with isolated credentials and
non-Production data.

## 9. Release boundary

This task keeps all edits unstaged. Codex does not stage, commit, push, switch branches,
edit Git metadata, call GitHub write APIs, merge, deploy, or perform external publishing.
The wrapper publishes the bounded Draft PR state for independent PM review.
