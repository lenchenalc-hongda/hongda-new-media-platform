# Global Lead Hub - Phase 9 Production Readiness Runbook

> TASK_ID = GLH-P9-PRODUCTION-READINESS-001
> SPEC_LOCK_VERSION = GLH-SPEC-V1.0
> BASE_MASTER_SHA = 2ce22b565a5926b048205b87ac1ddca34fe0d43b
> AGENT_CONTROL_BOOTSTRAP_HEAD = 3eeeda7c0ca4f97fead645a5ed7063fbca6bcb18
> EXPECTED_HEAD = 464357ad33e4b863d22f0e44f0307bf76ee9094b
> TRACK = REPOSITORY_ONLY
> PRODUCTION_CHANGED = NO
> PRODUCTION_EXECUTION_AUTHORIZED = NO
> OWNER_APPROVAL_REQUIRED = YES
> EVALUATION_TIMESTAMP_REQUIRED = YES
> MAX_EVIDENCE_AGE_DAYS = 7
> CANDIDATE_RELEASE_SHA_MUST_MATCH_EXPECTED_RELEASE_SHA = YES
> AUTO_PRODUCTION = false
> AUTO_MERGE = false

## 1. Purpose and hard boundary

This runbook defines the exact repository evidence required before Global Lead
Hub Production activation may be considered by a human owner. It is an
instruction and review artifact, not an execution authorization.

This repository task must not:

- execute Production SQL, migration, RLS, permission, environment, secret, or
  data changes;
- connect or cut over a real Meta, Facebook, or WhatsApp Production channel;
- weaken authentication, authorization, RLS, organization isolation, webhook
  verification, or secret handling;
- publish externally, merge to `main` or `master`, or enable
  `AUTO_PRODUCTION`;
- place secret values, customer data, access tokens, app secrets, verify
  tokens, service-role values, cookies, or credential material in evidence.

Production activation is blocked until a separate human execution task records
the exact owner approval phrase in Section 9. A passing repository report still
returns `productionExecutionAuthorized: false`.

## 2. Fail-closed state model

The readiness helper is the source of truth for the repository gate.

| Input state | Readiness result |
| --- | --- |
| Missing or malformed evaluation timestamp | overall `NOT_READY` |
| Missing, malformed, future-dated, stale, or unverifiable evidence | `UNKNOWN`; overall `NOT_READY` |
| Missing or mismatched evidence owner role | `UNKNOWN`; overall `NOT_READY` |
| Evidence reports `FAIL` | `FAIL`; overall `NOT_READY` |
| Revision values do not match the recorded task values | `MISMATCH`; overall `NOT_READY` |
| Candidate release SHA does not match supplied expected release SHA | `MISMATCH`; overall `NOT_READY` |
| All required evidence passes, owner approval absent | `OWNER_APPROVAL_REQUIRED` |
| All required evidence passes, owner approval malformed | `NOT_READY` |
| All required evidence passes, exact owner approval recorded | `READY_FOR_SEPARATE_PRODUCTION_EXECUTION` |

`READY_FOR_SEPARATE_PRODUCTION_EXECUTION` means the repository gate has
evidence. It does not execute, approve, or authorize Production. Missing
evidence must never be converted to `PASS`, zero, false, or an inferred fact.

## 3. Required evidence records

The readiness evaluation input must contain an explicit `evaluatedAt`
ISO-8601 UTC timestamp. Every evidence item must contain:

- `status`: `PASS`, `FAIL`, or `UNKNOWN`;
- `owner`: the accountable owner role, exactly matching the requirement owner;
- `evidenceRef`: a non-secret repository, PR, or sanitized artifact reference;
- `observedAt`: an ISO-8601 UTC timestamp no more than seven days before
  `evaluatedAt` and never later than `evaluatedAt`.

Evidence references must identify artifacts, not embed secret values or real
customer data. A `PASS` claim without a valid reference, required owner, and
fresh timestamp is `UNKNOWN`. Missing, malformed, future-dated, or stale
evidence is `UNKNOWN`. An explicit `FAIL` remains a failure only when the
evidence record is otherwise valid. No evidence item may be inferred from
another item.

The required evidence IDs are:

| Gate | Evidence ID | Required artifact |
| --- | --- | --- |
| Pilot baseline | `PHASE8_PILOT_PASS` | Phase 8 repository/synthetic pilot report with no failed checks |
| Pilot baseline | `ACCEPTANCE_CASES_A_G_PASS` | Recorded A-G acceptance results |
| Pilot baseline | `NON_PRODUCTION_BOUNDARY_PASS` | Proof that pilot work used non-Production data/channels |
| Channel and security | `CHANNEL_CONFIGURATION_REVIEW` | Meta/WhatsApp account, phone, permission, and template review |
| Channel and security | `META_WEBHOOK_SECURITY_REVIEW` | Verification-token and HMAC signature test evidence |
| Channel and security | `PRODUCTION_TARGET_REVIEW` | Exact target identity recorded without secret values |
| Channel and security | `SECRET_HANDLING_REVIEW` | Server-only secret and redaction review |
| Channel and security | `RLS_AUTHORIZATION_REVIEW` | RLS, role, organization, and cross-organization denial evidence |
| Channel and security | `AI_FAILURE_CONTAINMENT_REVIEW` | AI/provider outage fallback and human-work continuity evidence |
| Rollout and recovery | `ROLLOUT_PLAN_REVIEW` | Reviewed staged activation and observation plan |
| Rollout and recovery | `ROLLBACK_TARGET_RECORD` | Previous deployment/channel state and restoration owner |
| Rollout and recovery | `STOP_CRITERIA_REVIEW` | Exact stop thresholds and incident triggers |
| Rollout and recovery | `ROLLBACK_DRILL_PASS` | Non-Production rollback/containment drill result |
| Rollout and recovery | `POSTFLIGHT_PLAN_REVIEW` | Exact post-activation verification checklist |
| Rollout and recovery | `INCIDENT_OWNERS_RECORD` | Named incident commander, support owner, and rollback owner |

## 4. Preflight

1. Resolve `GLH-P9-PRODUCTION-READINESS-001` from Agent Control issue 72 and
   verify project, branch, base, head, and allowed paths.
2. Confirm `BASE_MASTER_SHA`, `AGENT_CONTROL_BOOTSTRAP_HEAD`, and
   `EXPECTED_HEAD` exactly match the task record. The bootstrap head and Agent
   Control task head are not release candidates.
3. Freeze and supply the later `expectedReleaseSha`; confirm both it and
   `candidateReleaseSha` are full 40-character Git SHAs and exactly match.
4. Supply the explicit `evaluatedAt` ISO-8601 UTC timestamp used for the
   deterministic freshness decision.
5. Confirm every evidence item has its required owner and an `observedAt` no
   more than seven days before `evaluatedAt` and not later than `evaluatedAt`.
6. Confirm the Phase 8 evidence bundle is present, accepted, and has no failed
   checks.
7. Confirm Acceptance Cases A-G passed in the non-Production pilot.
8. Confirm `GLH_PROVIDER_CALLS_ENABLED` is still false and no real provider
   cutover has been performed.
9. Confirm no Production SQL, RLS, environment, secret, data, ownership,
   finance, or publishing change occurred in this task.
10. Confirm a previous deployment/channel state is available as the rollback
   target and a human rollback owner is named.
11. Run:

```sh
pnpm exec tsx tests/unit/global-lead-hub-phase9-production-readiness.test.ts
pnpm typecheck
git diff --check
```

Any failed, missing, ambiguous, stale, or conflicting item is `UNKNOWN` or
`FAIL` and therefore `NOT_READY`.

## 5. Channel, environment, and security review

The owning human must review and record the following without printing values:

- official Meta Business / Graph / WhatsApp Business Platform use only;
- business account, phone number, webhook, and permission identifiers;
- inbound webhook verification-token and `x-hub-signature-256` HMAC coverage;
- free-form messaging-window and approved-template constraints;
- server-only token, app-secret, webhook-secret, and service-role handling;
- no authentication, role, RLS, or organization-isolation weakening;
- no secrets in browser payloads, logs, audit events, screenshots, or PRs;
- provider failure, media failure, duplicate webhook, and AI outage behavior;
- the exact Production target and the separate non-Production target;
- the previous deployment/channel rollback target.

Use `09_PRODUCTION_GATE_CHECKLIST.md` for the exact checklist and evidence IDs.

## 6. Future human rollout sequence

This sequence is documentation only for a later task. No step may be executed
by this repository-only task.

1. Record the exact owner approval phrase from Section 9 and the named human
   execution owner.
2. Freeze the release candidate SHA and current rollback target.
3. Verify the Production target and secret-name inventory without exposing
   secret values.
4. Create a staged deployment that does not activate a real provider cutover.
5. Observe inbound-only behavior with outbound provider calls disabled.
6. Verify webhook verification, signature rejection, idempotency, RLS,
   organization isolation, human takeover, and human work during AI outage.
7. Require a new explicit owner decision before any real outbound provider
   cutover, template send, broad enablement, or external publishing.
8. Complete the postflight table before declaring rollout observation closed.

The existing `GLH_PROVIDER_CALLS_ENABLED = false` boundary must not be changed
inside this task.

## 7. Postflight

Record `PASS`, `FAIL`, or `UNKNOWN` with sanitized evidence for each item:

| Postflight item | Required result |
| --- | --- |
| Release candidate | Deployed/observed SHA equals the approved candidate |
| Webhook verification | Valid challenge accepted; invalid token rejected |
| Webhook signature | Valid HMAC accepted; invalid/missing HMAC rejected |
| Replay/idempotency | Duplicate external event creates no duplicate logical message or auto-reply |
| RLS and roles | Cross-organization access denied; Sales sees owned/assigned work only |
| Human takeover | Automatic customer-facing AI stops; human work remains available |
| AI/provider outage | Inbound persists; handoff/task is created; no silent loss |
| Secret exposure | No secret or credential appears in browser, logs, or evidence |
| Data boundary | No customer ownership, finance, order, or external truth mutation |
| Rollback target | Previous deployment/channel state remains available |
| Incident ownership | Incident commander, support owner, and rollback owner reachable |

Any `FAIL` or `UNKNOWN` keeps the result `NOT_READY` and stops expansion.

## 8. Stop and rollback

Stop immediately and contain on any authentication/RLS bypass,
cross-organization exposure, webhook signature failure, duplicate logical
message/auto-reply, data loss or overwrite, secret exposure, provider failure
storm, unexplained Production mutation, or missing rollback evidence.

Containment order:

1. Stop expansion and provider/channel traffic using the owner-controlled
   mechanism.
2. Preserve sanitized logs, timestamps, affected identifiers, and the
   deployment/channel state as evidence.
3. Restore the recorded previous deployment/channel state.
4. Do not run destructive database rollback, delete Production data, overwrite
   ownership truth, or change financial source-of-truth data.
5. Notify the named incident commander and rollback owner.
6. Return to repository remediation and Agent Control PM review.
7. Resume only with new non-Production evidence and a fresh owner approval.

## 9. Owner approval

The separately frozen release candidate must be supplied as
`expectedReleaseSha`. The `candidateReleaseSha` must exactly match it before
readiness can advance. Neither the Agent Control bootstrap head nor the Agent
Control task head is the release candidate.

After all other gates pass, the exact phrase template is:

```text
APPROVE GLH PHASE 9 PRODUCTION ACTIVATION FOR <40_CHAR_RELEASE_SHA> AFTER ALL READINESS EVIDENCE AND ROLLBACK DRILL
```

The approval record must include the exact phrase, approver identity, and an
ISO-8601 UTC approval timestamp. The phrase must use the bound candidate SHA,
not an example or an Agent Control commit. A checked checklist, passing test,
or helper result is not owner approval.

## 10. Completion contract

A later human execution task must record:

- `TASK_ID` and release candidate SHA;
- `AGENT_CONTROL_BOOTSTRAP_HEAD`, `EXPECTED_HEAD`, `expectedReleaseSha`,
  `candidateReleaseSha`, and `evaluatedAt`;
- readiness result and all gate states;
- every evidence ID with `PASS`, `FAIL`, or `UNKNOWN`;
- exact owner approval phrase and approver;
- rollout owner, incident commander, support owner, and rollback owner;
- rollback target and rollback drill result;
- postflight result;
- `PRODUCTION_EXECUTION_AUTHORIZED`, `PRODUCTION_CHANGED`,
  `PROVIDER_CUTOVER_EXECUTED`, `AUTO_PRODUCTION`, and `AUTO_MERGE`.

Until the separate human task completes, the only valid repository outcome is
`NOT_READY` or `OWNER_APPROVAL_REQUIRED`.
