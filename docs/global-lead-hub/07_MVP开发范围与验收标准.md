# 07 MVP 开发范围与验收标准

> SPEC_LOCK_VERSION = GLH-SPEC-V1.0
> FROZEN = YES

## Delivery phases

### Phase 0 - Spec Lock

- materialize these 8 docs;
- inspect existing repo boundaries;
- create implementation checklist;
- no business DB mutation.

### Phase 1 - Foundation

- GLH route shell;
- Supabase schema migration(s);
- RLS + grants;
- role/access foundation;
- channel/account abstractions;
- audit foundations.

### Phase 2 - Core Human UI

- Today shell;
- Lead list/detail;
- manual lead creation for test/dev;
- assignment;
- tasks/follow-ups;
- no provider dependency required yet.

### Phase 3 - WhatsApp Inbound

- webhook verification/ingest;
- event idempotency;
- contact/conversation/message persistence;
- test account only;
- no Production channel cutover.

### Phase 4 - AI Qualification

- extraction;
- completeness;
- scoring;
- qualification question selection;
- safety boundary tests;
- handoff trigger logic.

### Phase 5 - Inbox + Handoff

- unified inbox;
- `AI_ACTIVE → HANDOFF_PENDING → HUMAN_ACTIVE`;
- human messaging adapter;
- AI draft copilot;
- assignment/transfer history.

### Phase 6 - Follow-up + Dashboard

- today/overdue/dormant tasks;
- manager dashboard;
- simple conversion views.

### Phase 7 - Ad Attribution

- Meta referral/ad mapping when available;
- creative/source quality views.

### Phase 8 - Non-Production Pilot

- isolated test channel/users;
- synthetic/test contacts where possible;
- verify RLS, idempotency, handoff, outage behavior, UX.

### Phase 9 - Production Readiness Gate

- exact runbook;
- channel/env/security checklist;
- rollback/containment;
- explicit owner approval required before any Production activation.

## Required acceptance cases

A. "Hi price?":

- persisted;
- AI does not invent a price;
- asks for key missing product/material/quantity context.

B. Machine query:

- classified as machine;
- asks machine-specific fields;
- routed to human promptly.

C. Processing/printing-service customer:

- identified separately from film-only/machine;
- sample/test needs collected.

D. Human takeover:

- automatic customer-facing AI stops immediately;
- AI drafts can continue.

E. Webhook replay:

- same external event processed twice → exactly one logical message and no duplicate auto-reply.

F. RLS:

- Sales A cannot read restricted Sales B lead merely because both are authenticated;
- Manager/Admin access follows explicit organization/team rules.

G. Transfer:

- changing owner preserves original messages, assignment history, prior actor and audit trail.

## MVP completion gate

MVP is not complete until:

- no formal GLH source of truth uses localStorage/mock;
- RLS is verified;
- webhook idempotency is tested;
- AI forbidden-claim tests pass;
- handoff stops auto-send;
- original messages remain available;
- priority leads surface clearly;
- secrets do not appear in browser/log artifacts;
- salesperson can work if AI is down;
- non-Production pilot is complete;
- no Production change was silently made.

## Safety

No autonomous:

- Production SQL/RLS/env/secrets;
- destructive migration;
- Production data delete/overwrite;
- customer ownership source-of-truth mutation outside GLH assignment semantics;
- financial source-of-truth changes;
- external publishing beyond explicitly configured test messaging;
- Production WhatsApp/Facebook cutover.

Production remains a human gate.
