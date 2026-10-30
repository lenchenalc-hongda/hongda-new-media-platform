# GLH Phase 4 AI qualification offline acceptance

Status: pre-integration acceptance evidence for
`GLH-P4-AI-QUALIFICATION-OFFLINE-001`.

This slice is deterministic and offline. It exercises the existing qualification
engine with synthetic customer inputs and an in-memory inbound-event store. It does
not call an AI provider, infer an answer from an actual customer conversation, write
to Supabase, send a customer message, or connect to Meta/WhatsApp.

## Frozen contract

The acceptance criteria come from the frozen GLH V1.0 rules:

- `04_AI承接与转人工规则.md` for the first inbound loop, core fields, scoring,
  handoff triggers, forbidden claims, and takeover behavior;
- `08_IMPLEMENTATION_CHECKLIST.md` for the Phase 4 implementation and exit gates.

The six core fields are:

1. product;
2. product image/reference;
3. material;
4. quantity;
5. country;
6. requirement type.

The engine asks at most three prioritized missing questions in one qualification
pass. Machine inquiries additionally use product dimensions, target production
capacity, current machine/process, desired automation level, and whether a full
machine plus film/process solution is required. Those machine fields are not asked
for non-machine inquiries.

The advisory score remains exactly 100 points:

- clear product image: 15;
- material: 15;
- quantity: 15;
- company/site/credible business identity: 10;
- clear film/processing/machine requirement: 15;
- test requirement or sample intent: 10;
- target industry fit: 10;
- repeat/long-term order or buying timeline: 10.

Grade bands are A = 80-100, B = 60-79, C = 30-59, and D = 0-29. Grade D is
advisory and does not delete, reject, or invalidate a lead.

## Scope and safety boundary

- `GLH_PROVIDER_CALLS_ENABLED` remains `false`.
- The acceptance test makes no `fetch` call and imports no provider or database
  client through the qualification engine.
- No Meta/WhatsApp endpoint, outbound message, template, or provider action is used.
- No Production SQL, RLS, environment variable, secret, migration, or deployment
  action is performed.
- No customer, financial, or ownership source of truth is changed.
- The original inbound event is modeled only in memory. This proves ordering and
  failure semantics, not database transaction, RLS, or concurrency behavior.
- Human takeover returns `customerFacingAutoSendAllowed=false`, including for a fully
  qualified lead. Copilot suggestions remain available to the human.

The only implementation refinement in this slice adds optional
`languageConfidence` and `inputConfidence` signals. A supplied value below `0.6`, a
non-finite value, or a value outside `0..1` triggers
`LOW_CONFIDENCE_OR_HIGH_RISK` and therefore `HANDOFF_PENDING`. This is a fail-closed
consumer of classifier confidence, not fabricated language detection. A future
classifier must supply these signals; the offline engine does not guess a language
from text.

## Acceptance matrix

| Case | Synthetic input | Deterministic assertion |
| --- | --- | --- |
| Core fields | Empty and fully populated profiles | Missing fields are exactly product, image reference, material, quantity, country, and requirement type; completeness is 0 or 100 |
| Targeted questions | Empty profile and one-field-missing profile with limits 0, 1, 3, and 99 | Every pass asks one to three questions; the one missing field gets a targeted question |
| Score and grade | Component combinations and every band boundary | Score is capped by the frozen 100-point model; A/B/C/D boundaries are exact |
| Price context | `Hi, can you quote this?` | A quotation decision triggers human handoff, asks for product/material/quantity context, sends no automatic reply, and fabricates no price |
| Machine inquiry | Synthetic machine requirement | Requirement type is `MACHINE`; all five machine questions are exposed over bounded turns; `MACHINE_INQUIRY` routes to a human |
| Processing inquiry | `PROCESSING_OR_PRINTING_SERVICE` alias | It normalizes to `PROCESSING`; machine-only questions are absent; sample/test intent can trigger handoff |
| Handoff triggers | Every frozen signal in one fixture | All 13 immediate-handoff triggers are returned once, in the frozen order |
| Human takeover | Fully qualified lead already in `HUMAN_ACTIVE` | No customer-facing auto-send is permitted and the human lifecycle/mode is preserved |
| Safety claims | Each declared claim and representative matching text | All eight forbidden commercial, technical, test, compensation, and agency claims block auto-send and require handoff |
| Language uncertainty | Low or invalid language confidence | Low-confidence language classification fails closed to human handoff |
| Input uncertainty | Low or invalid input confidence | Low-confidence input classification fails closed to human handoff |
| AI failure | Persist synthetic inbound, then throw before qualification completes | The immutable original event remains stored; the result is `HANDOFF_PENDING`, a human task/manual flow is available, and auto-send attempts remain zero |
| Audit determinism | Same synthetic input evaluated twice | Results are deeply equal and the offline engine contains no provider, persistence, prompt-version, or logging side effect |

The test prints one `PASS` line per acceptance area. These are offline evidence,
not evidence of a real AI model, an authenticated request, or a Production database
transaction.

## Inbound preservation decision

The persistence order remains:

```text
original provider event
-> original inbound message
-> qualification attempt
-> score/questions/handoff proposal
```

Qualification and AI action outcomes are derived data. They never replace or delete
the original event or message. In the offline test, the event is stored before the
qualification callback. A thrown qualification error returns a human-handoff fallback
while the original event remains byte-for-byte equal to its synthetic input.

Production implementation still relies on the ingest transaction and relationship
constraints. This slice does not claim that an in-memory map proves those guarantees.

## Audit and prompt-version decision

The offline deterministic evaluator does not create a `glh_ai_actions` row or claim
that a model was invoked. A deterministic policy version is not a prompt version and
must not be persisted as fabricated model provenance.

For a future provider-backed invocation, persistence must record:

- the actual non-empty `prompt_version` used;
- `action_type`, `status`, `model_name`, and bounded input/output summaries;
- the triggering inbound message and conversation identifiers;
- `FAILED` or `BLOCKED` status with sanitized error metadata when applicable;
- the resulting score, grade, missing fields, questions, handoff triggers, and final
  auto-send decision as auditable derived facts.

The AI-send idempotency contract remains:

```text
conversation_id + trigger_message_id + action_type + prompt_version
```

No human takeover, safety block, failure fallback, or low-confidence classification
may create a `SENT` outcome. The current audit type foundation has no new event type
in this bounded slice, and this document does not imply that a database audit row was
created by the offline test.

## Out of scope

This acceptance slice does not implement or certify:

- true language detection, business-intent inference, or field extraction from raw
  or ambiguous customer text;
- provider calls or a prompt execution path;
- Supabase writes, RLS, transaction ordering, or idempotency under concurrency;
- authenticated salesperson actions or the full Inbox workflow;
- WhatsApp/Meta verification, delivery, automatic replies, or Production cutover;
- changes to customer ownership, financial truth, migrations, environment variables,
  secrets, or frozen specifications.

The human manual lead, message, task, follow-up, and reply workflow remains the
fallback when AI is unavailable.

## Exact test commands

Run from the repository root:

```bash
pnpm exec tsx tests/unit/global-lead-hub-ai-qualification-phase4.test.ts
pnpm exec tsx tests/unit/global-lead-hub-phase4-ai-qualification.test.ts
pnpm exec tsx tests/unit/global-lead-hub-phase8-non-production-pilot.test.ts
pnpm typecheck
pnpm build
bash scripts/audit-bundle-secrets.sh
```

The required local smoke after build is:

```bash
pnpm next start -p 3000
```

In a second terminal:

```bash
BASE_URL=http://localhost:3000 pnpm exec tsx tests/e2e/routes.spec.ts
BASE_URL=http://localhost:3000 pnpm exec tsx tests/e2e/scripts.spec.ts
BASE_URL=http://localhost:3000 pnpm exec tsx tests/e2e/knowledge.spec.ts
BASE_URL=http://localhost:3000 pnpm exec tsx tests/e2e/topics.spec.ts
```

Expected result: every acceptance test prints `PASS` and its final
`Global Lead Hub Phase 4 AI qualification offline acceptance tests passed` line;
existing Phase 4 and Phase 8 evidence remains green; typecheck and build succeed; the
bundle secret audit reports no leaks; and the built application smoke routes pass.

This evidence does not authorize merge, deployment, Production SQL/RLS/env/secrets,
real AI provider activation, automatic customer messaging, or a Meta/WhatsApp
cutover. PM review remains required.
