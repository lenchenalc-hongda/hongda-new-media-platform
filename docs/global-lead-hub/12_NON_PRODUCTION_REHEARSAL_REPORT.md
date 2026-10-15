# Global Lead Hub — Non-Production Rehearsal Report

> TASK_ID = GLH-P9-NONPROD-REHEARSAL-003  
> BASE_MASTER_SHA = d04b2cdea3060828f216782ee05c3d4b01f5ea26  
> CANDIDATE_SHA = d04b2cdea3060828f216782ee05c3d4b01f5ea26  
> TARGET = repository-only-synthetic  
> EVALUATED_AT = 2026-10-15T10:50:00Z  
> PRODUCTION_CHANGED = NO  
> PRODUCTION_EXECUTION_AUTHORIZED = NO

## Outcome

The bounded repository-only rehearsal completed with **11 PASS**, **0 FAIL**,
and **5 UNKNOWN**. The eleven checks that can be exercised using synthetic
fixtures or already-reviewed repository evidence passed. The five checks that
require current Production or external-account observation remain `UNKNOWN`.

This is a pass for the non-Production rehearsal only. Production readiness is
`NOT_READY`; no Production execution, provider cutover, customer send, external
publication, or credential access is authorized.

## Boundary attestation

The rehearsal did not run Production SQL; inspect or change Production schema,
RLS, grants, data, env, or secrets; connect a real Meta/WhatsApp asset; send a
real customer message; promote a Vercel deployment; weaken authentication; or
publish externally. Evidence references contain repository paths and synthetic
test identifiers only. No secret values or customer data were collected.

## Evidence matrix

| Evidence ID | Owner | Result | Sanitized evidence / reason |
| --- | --- | --- | --- |
| `META_BUSINESS_PREREQUISITES` | `CHANNEL_OWNER` | `UNKNOWN` | Current business portfolio, WABA, number identity, app review, permission, template, rate and quality state require separate owner-authorized external review |
| `META_WEBHOOK_VERIFICATION` | `GLH_SECURITY_OWNER` | `PASS` | Synthetic correct/wrong/missing token assertions in `tests/unit/global-lead-hub-phase3-whatsapp-inbound.test.ts` |
| `META_WEBHOOK_SIGNATURE` | `GLH_SECURITY_OWNER` | `PASS` | Synthetic valid, tampered, missing and malformed HMAC assertions in `tests/unit/global-lead-hub-phase3-whatsapp-inbound.test.ts` |
| `WEBHOOK_IDEMPOTENCY` | `GLH_ENGINEERING_OWNER` | `PASS` | Replay and uniqueness evidence in `tests/unit/global-lead-hub-phase8-non-production-pilot.test.ts` and its evidence bundle |
| `SUPABASE_SCHEMA_INVENTORY` | `DATABASE_OWNER` | `UNKNOWN` | Exact Production migration/table/constraint/index state was not queried |
| `SUPABASE_RLS_GRANTS` | `DATABASE_OWNER` | `UNKNOWN` | Exact Production RLS, policy and grant state was not queried or changed |
| `SUPABASE_ADVISORS` | `DATABASE_OWNER` | `UNKNOWN` | Current Production Security/Performance Advisor results were not accessed |
| `VERCEL_ENV_NAMES` | `RELEASE_OWNER` | `UNKNOWN` | Production variable presence/scope was not inspected and no value was read |
| `SECRET_REDACTION` | `GLH_SECURITY_OWNER` | `PASS` | Synthetic canary/browser/log checks in Phase 8 evidence plus repository Secret Audit |
| `AI_FORBIDDEN_CLAIMS` | `GLH_PRODUCT_OWNER` | `PASS` | Deterministic prohibited-commitment assertions in Phase 8 pilot evidence |
| `HUMAN_HANDOFF` | `GLH_PRODUCT_OWNER` | `PASS` | Synthetic takeover blocks auto-send and preserves manual work in Phase 8 pilot evidence |
| `AI_PROVIDER_OUTAGE` | `SUPPORT_OWNER` | `PASS` | Synthetic unavailable-provider path preserves inbound and creates human work in Phase 8 pilot evidence |
| `RLS_ACCEPTANCE` | `DATABASE_OWNER` | `PASS` | Repository-only role/organization matrix denies Sales A restricted Sales B and cross-organization records |
| `ROLLOUT_DRY_RUN` | `RELEASE_OWNER` | `PASS` | Candidate/target freeze, outbound-disabled boundary, observation window and stop rules rehearsed from `11_PRODUCTION_REHEARSAL_CHECKLIST.md` |
| `CONTAINMENT_DRY_RUN` | `INCIDENT_COMMANDER` | `PASS` | Simulated auth/RLS, duplicate, leak and provider-storm triggers stop expansion without destructive action |
| `ROLLBACK_DRY_RUN` | `ROLLBACK_OWNER` | `PASS` | Isolated rollback restores the recorded prior target while preserving inbound/audit evidence |

## Deterministic rehearsal details

### Webhook verification, signature, and idempotency

- The synthetic verification token accepts an exact match and rejects wrong or
  missing input.
- `x-hub-signature-256` validation accepts the correct synthetic body/HMAC and
  rejects missing, malformed, wrong, and body-tampered signatures before
  business processing.
- Replaying one provider event leaves one logical webhook event, message, lead
  effect, and at most one AI action.

### AI boundary, handoff, and outage

- Price, discount, payment, delivery, technical feasibility, test/adhesion,
  capacity, compensation, contract, and agency/distributor commitments require
  a human decision.
- Human takeover moves automation out of customer-facing send mode immediately
  while non-binding drafts and manual operation remain available.
- Timeout, authentication failure, rate limit, and malformed provider response
  preserve inbound work and surface a human action instead of fabricating a
  commitment.

### RLS and secret safety

- Synthetic Sales A access is limited to owned/assigned records; restricted
  Sales B and cross-organization records are denied. Manager/Admin scope stays
  within the explicitly bound organization.
- Secret handling uses only synthetic canaries. No Production variable value,
  token, key, customer payload, or service-role material was read or recorded.

### Rollout, containment, and rollback

- Rollout remains isolated with outbound disabled and no Production alias or
  provider cutover.
- Every simulated stop condition freezes expansion, preserves sanitized
  evidence, routes work to humans, and notifies the named incident roles.
- Rollback restores only the isolated target. It does not delete data, run
  destructive SQL, change ownership/finance truth, or weaken authentication.

## Remaining Human Gate

The five `UNKNOWN` items require a separate, exact release-SHA task with named
owners and explicit Human Gate authorization to collect current Meta/WhatsApp,
Supabase Production, and Vercel Production evidence. Collection must remain
read-only unless a later plan separately authorizes a precisely bounded change.
Missing, stale, mismatched, or ambiguous evidence stays `UNKNOWN`; it is never
inferred `PASS`.

Even after all evidence becomes `PASS`, a human owner must separately approve
the exact Production execution plan, target, observation window, stop criteria,
containment owner, and rollback target. Real provider cutover, customer sends,
external publication, Production SQL/RLS/data/env/secrets, auth-boundary changes,
customer ownership, and financial source-of-truth remain prohibited until that
approval is recorded.

## Reproduction

```sh
pnpm exec tsx tests/unit/global-lead-hub-phase9-nonproduction-rehearsal.test.ts
pnpm typecheck
pnpm build
git diff --check
```

The evaluator fails closed when an observation is missing, stale/future-dated,
bound to another candidate or target, owned by the wrong role, reports failure,
contains an unsafe reference, or omits any non-Production boundary flag.
