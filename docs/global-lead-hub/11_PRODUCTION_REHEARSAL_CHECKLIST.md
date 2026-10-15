# Global Lead Hub — Production Rehearsal Checklist

> TASK_ID = GLH-P9-EVIDENCE-PREP-002  
> REHEARSAL_TARGET = ISOLATED_NON_PRODUCTION  
> REAL_CUSTOMER_SEND = NO  
> PRODUCTION_CHANGED = NO  
> MISSING_OR_AMBIGUOUS = UNKNOWN  
> UNKNOWN_OR_FAIL = NOT_READY

This checklist is a dry-run script and evidence template. It is not permission
to access or mutate Production. Use synthetic contacts and isolated channel,
Supabase and Vercel targets only.

## 1. Preflight

- [ ] Record candidate commit SHA, isolated target aliases, UTC start time and
  responsible `RELEASE_OWNER`.
- [ ] Confirm `GLH_PROVIDER_CALLS_ENABLED=false` (or the equivalent outbound
  kill switch) without exposing its value source.
- [ ] Confirm no real phone number, customer, Production database, Production
  deployment alias or Production credential is in scope.
- [ ] Name `CHANNEL_OWNER`, `DATABASE_OWNER`, `GLH_SECURITY_OWNER`,
  `GLH_PRODUCT_OWNER`, `SUPPORT_OWNER`, `INCIDENT_COMMANDER` and
  `ROLLBACK_OWNER`.
- [ ] Record the prior isolated deployment/channel state that will be restored.
- [ ] Mark any missing prerequisite `UNKNOWN` and stop the rehearsal.

## 2. Meta/WhatsApp and webhook rehearsal

- [ ] Complete the Meta prerequisite worksheet using sanitized account/asset
  aliases and then-current official requirements.
- [ ] Valid verification challenge succeeds; wrong and absent verify token fail.
- [ ] Valid `x-hub-signature-256` succeeds; missing, malformed, wrong-key and
  body-tampered signatures fail before business processing.
- [ ] Duplicate delivery of the same external event creates one webhook event,
  one logical message, one lead effect and at most one permitted AI action.
- [ ] Media-fetch failure preserves the original inbound event/message and
  surfaces a retry/manual action.
- [ ] Outbound remains disabled; no template or free-form message reaches a
  real recipient.

## 3. AI safety and human operation

- [ ] Price/discount, payment terms, delivery date, final technical
  feasibility, adhesion/test guarantee, machine capacity, compensation,
  contract and distributor/agency prompts never receive autonomous commitments.
- [ ] Each prohibited request produces a safe handoff or human-confirmation
  requirement.
- [ ] Human takeover immediately prevents further automatic customer-facing AI
  sends while summaries and drafts remain non-binding.
- [ ] Simulated AI timeout, 401, rate limit and malformed response preserve
  inbound data, create visible human work and leave manual operation usable.

## 4. Supabase/RLS evidence rehearsal

- [ ] Populate the schema inventory template with synthetic/isolated metadata.
- [ ] Record `glh_` table, constraint, index and migration evidence fields.
- [ ] Record RLS enabled state, policy names and API grants separately.
- [ ] Verify `anon` cannot access GLH business data.
- [ ] Verify Sales A cannot read or mutate restricted Sales B records.
- [ ] Verify Manager/Admin scope follows explicit organization policy.
- [ ] Verify service-role capability never reaches browser code.
- [ ] Prepare Security/Performance Advisor evidence fields; do not query
  Production in this rehearsal.

## 5. Vercel and secret evidence rehearsal

- [ ] Inventory required variable names, Preview/Production scope, owner and
  server/client classification; do not read or print values.
- [ ] Reject any secret classified `NEXT_PUBLIC_*` or otherwise bundled for the
  browser.
- [ ] Scan build/client/log/evidence output for secret-like material using only
  synthetic canaries.
- [ ] Confirm CI/build/preview can be evaluated without Production credentials
  or provider cutover.

## 6. Rollout dry run

- [ ] Freeze candidate SHA and isolated deployment target.
- [ ] Deploy/observe only the isolated target with outbound disabled.
- [ ] Run webhook, idempotency, RLS, forbidden-claim, handoff and outage checks.
- [ ] Record observation window, thresholds and sanitized artifact references.
- [ ] Do not promote, alias to Production, enable provider calls, send to a real
  recipient, alter Production env, or apply Production SQL.

## 7. Stop and containment dry run

Trigger each simulated condition: auth/RLS bypass, cross-organization access,
invalid signature accepted, duplicate logical message/auto-reply, secret-like
output, inbound loss, uncontrolled send, provider failure storm, missing owner,
and unexplained mutation.

- [ ] Stop expansion and outbound processing.
- [ ] Preserve sanitized timestamps, request IDs, release SHA and target state.
- [ ] Switch work to human/manual mode and keep inbound preservation active.
- [ ] Notify the named incident commander, support owner and rollback owner.
- [ ] Do not delete data, rewrite ownership/finance truth, weaken auth, rotate or
  reveal Production secrets, or perform destructive database rollback.

## 8. Rollback dry run

- [ ] Restore the recorded prior isolated deployment/channel state.
- [ ] Verify the candidate is no longer receiving isolated traffic.
- [ ] Verify preserved inbound/audit records remain intact.
- [ ] Re-run denial, signature and idempotency smoke checks.
- [ ] Record elapsed time, deviations, recovery objective result and follow-ups.
- [ ] Keep any failed or unverified recovery step as `FAIL` or `UNKNOWN`.

## 9. Evidence review

For every ID in `10_NON_PRODUCTION_EVIDENCE_PLAN.md`, record `PASS`, `FAIL` or
`UNKNOWN`, owner role, sanitized reference, UTC observation time, candidate SHA
and isolated target alias. Run:

```sh
pnpm exec tsx tests/unit/global-lead-hub-phase9-evidence-prep.test.ts
pnpm typecheck
pnpm build
git diff --check
```

Any failed command, missing owner/reference, secret-like reference, mismatched
task/head, Production action, real customer send or external publication makes
the result `NOT_READY`.

## 10. Final Human Gate

- [ ] All required evidence is `PASS`; there is no inferred pass.
- [ ] Candidate SHA, exact Production targets, owners, observation window,
  containment and rollback plan are frozen.
- [ ] A human owner records the exact phrase from the evidence plan.
- [ ] Separate authorization exists for any real outbound cutover or external
  publication.

Without those items, the only valid result is `NOT_READY` or
`READY_FOR_HUMAN_GATE`. This repository task always reports
`PRODUCTION_EXECUTION_AUTHORIZED = NO` and `PRODUCTION_CHANGED = NO`.

