# Global Lead Hub - Phase 9 Production Gate Checklist

> TASK_ID = GLH-P9-PRODUCTION-READINESS-001
> MISSING_EVIDENCE = UNKNOWN
> UNKNOWN_OR_FAIL = NOT_READY
> PRODUCTION_CHANGED = NO
> PRODUCTION_EXECUTION_AUTHORIZED = NO
> OWNER_APPROVAL_REQUIRED = YES
> EVALUATION_TIMESTAMP_REQUIRED = YES
> MAX_EVIDENCE_AGE_DAYS = 7
> CANDIDATE_RELEASE_SHA_MUST_MATCH_EXPECTED_RELEASE_SHA = YES
> AUTO_PRODUCTION = false
> AUTO_MERGE = false

This checklist is repository evidence, not Production authorization. Do not
enter secret values, access tokens, app secrets, verify tokens, service-role
values, cookies, or real customer data.

Every evidence item must record its exact required owner role and an
`observedAt` timestamp no more than seven days before the report's explicit
`evaluatedAt` UTC timestamp and never later than `evaluatedAt`. Missing,
malformed, future-dated, stale, or owner-mismatched evidence is `UNKNOWN`.

## Gate A - Pilot Baseline

- [ ] `PHASE8_PILOT_PASS`: Phase 8 non-Production pilot evidence bundle is
  accepted, not expired, and has zero failed checks.
- [ ] `ACCEPTANCE_CASES_A_G_PASS`: Acceptance Cases A-G passed with exact
  evidence references.
- [ ] `NON_PRODUCTION_BOUNDARY_PASS`: pilot data, accounts, users, and channels
  were non-Production; no real Meta/WhatsApp cutover occurred.

Evidence owner: GLH product owner plus Phase 8 pilot owner.

## Gate B - Channel, Environment, and Security

- [ ] `CHANNEL_CONFIGURATION_REVIEW`: Meta Business / Graph / WhatsApp account,
  phone, permissions, messaging-window, and template constraints are reviewed.
- [ ] `META_WEBHOOK_SECURITY_REVIEW`: verification token and
  `x-hub-signature-256` HMAC acceptance/rejection tests are recorded.
- [ ] `PRODUCTION_TARGET_REVIEW`: exact Production target is recorded by
  identity without secret values; non-Production target is distinct.
- [ ] `SECRET_HANDLING_REVIEW`: server-only secret handling and redaction are
  reviewed; no secret appears in browser, logs, screenshots, or evidence.
- [ ] `RLS_AUTHORIZATION_REVIEW`: RLS, role checks, organization scope,
  Sales owned/assigned-only access, and cross-organization denial pass.
- [ ] `AI_FAILURE_CONTAINMENT_REVIEW`: AI/provider outage preserves inbound
  messages, creates human work, and does not block manual operation.

Evidence owner: GLH security owner, database owner, and channel owner.

## Gate C - Rollout, Recovery, and Postflight

- [ ] `ROLLOUT_PLAN_REVIEW`: staged rollout, observation window, no-cutover
  boundary, and separate outbound cutover approval are documented.
- [ ] `ROLLBACK_TARGET_RECORD`: previous deployment/channel state, restoration
  method, and human rollback owner are recorded.
- [ ] `STOP_CRITERIA_REVIEW`: auth/RLS, cross-organization, idempotency, data,
  secret, provider, and unexplained-mutation stop conditions are exact.
- [ ] `ROLLBACK_DRILL_PASS`: non-Production containment/rollback drill passed
  with evidence.
- [ ] `POSTFLIGHT_PLAN_REVIEW`: all postflight checks in the runbook have
  owners, evidence references, and pass/fail thresholds.
- [ ] `INCIDENT_OWNERS_RECORD`: incident commander, support owner, and rollback
  owner are named and reachable.

Evidence owner: release owner, database owner, and incident commander.

## Gate D - Owner Approval

- [ ] `expectedReleaseSha` is a separately frozen 40-character SHA and
  `candidateReleaseSha` exactly matches it; neither Agent Control bootstrap
  nor task head is used as the release candidate.
- [ ] Exact phrase recorded:
  `APPROVE GLH PHASE 9 PRODUCTION ACTIVATION FOR <40_CHAR_RELEASE_SHA> AFTER ALL READINESS EVIDENCE AND ROLLBACK DRILL`
- [ ] Approver identity and ISO-8601 approval timestamp are recorded.
- [ ] Gate A, Gate B, and Gate C are all `PASS`; any `FAIL` or `UNKNOWN` blocks
  this gate.
- [ ] A separate owner decision is recorded before a real outbound
  Meta/WhatsApp cutover or broad activation.

Evidence owner: accountable Hongda business owner. A checked box is not
authorization.

## Stop Conditions

Stop and contain on:

- authentication, role, RLS, or organization-isolation failure;
- cross-organization or unauthorized data visibility;
- missing/invalid webhook verification or signature;
- duplicate logical message, duplicate auto-reply, or replay failure;
- Production data deletion, overwrite, ownership-truth change, or financial
  source-of-truth change;
- secret or credential exposure;
- provider failure storm, uncontrolled outbound send, or external publishing;
- missing rollback evidence or an unreachable rollback owner;
- any unexplained or unauthorized Production mutation.

Rollback is containment-first: stop expansion/traffic, preserve sanitized
evidence, restore the recorded deployment/channel state, and do not use
destructive database rollback.

## Final Boundary

- [ ] `PRODUCTION_SQL_EXECUTED = NO`
- [ ] `PRODUCTION_RLS_CHANGED = NO`
- [ ] `PRODUCTION_ENV_OR_SECRET_CHANGED = NO`
- [ ] `PRODUCTION_DATA_CHANGED = NO`
- [ ] `REAL_PROVIDER_CUTOVER_EXECUTED = NO`
- [ ] `EXTERNAL_PUBLISHING_EXECUTED = NO`
- [ ] `AUTH_WEAKENED = NO`
- [ ] `AUTO_PRODUCTION = false`
- [ ] `AUTO_MERGE = false`

Missing evidence remains `UNKNOWN`; `UNKNOWN` or `FAIL` remains `NOT_READY`.
`OWNER_APPROVAL_REQUIRED` remains mandatory before any separate Production
execution.
