# Customer Project Center - Pilot Defect Triage Template

Use this template for every Phase 12 pilot observation. Triage must separate a
repository defect from a business decision, an external integration gate, and
training/usability feedback.

Do not change business policy, customer ownership, financial truth, or
Production state to close a pilot observation.

## 1. Intake fields

| Field | Value |
| --- | --- |
| Triage ID | `PILOT-YYYY-NNN` |
| Pilot run ID | |
| Scenario ID | |
| Reporter / observer | |
| Environment | |
| Repository commit | |
| Date/time (Asia/Shanghai) | |
| Role(s) involved | admin / manager / sales / operator / viewer |
| Synthetic data identifier | |
| Severity | S0 / S1 / S2 / S3 |
| Reproduction steps | |
| Expected result | |
| Actual result | |
| Evidence references | |
| Was Production data involved? | YES / NO |
| Was UNKNOWN converted to a fact? | YES / NO / NOT APPLICABLE |
| Was a duplicate or replayed mutation created? | YES / NO / NOT APPLICABLE |
| Was stale data accepted? | YES / NO / NOT APPLICABLE |

## 2. Classification

Choose exactly one primary class. If more than one class applies, create linked
records and nominate one primary owner.

### A. Repository defect

Use when approved V1 behavior is deterministic and the repository is wrong.

Examples:

- role or same-organization authorization is incorrect;
- a route or component bypasses the approved contract;
- expected-version conflict is not enforced;
- duplicate/replay guard is missing or bypassed;
- UNKNOWN is rendered or stored as zero, false, or a fabricated fact;
- a report, audit, or event becomes mutable when it should be append-only;
- a deterministic calculation disagrees with its contract;
- empty, partial, loading, denied, or mobile-critical UI states fail;
- the page exposes ranking, scoring, or prohibited activity KPI.

Required owner: repository maintainer or Codex fix task.

Closure evidence: focused tests, exact commit, and the approved fix task.

### B. Business-policy decision

Use when the repository is behaving as designed but the policy is missing,
ambiguous, or needs an owner decision.

Examples:

- a new stage, threshold, cadence, exception, or lifecycle transition;
- changing what counts as effective progress;
- changing old-customer segmentation or follow-up policy;
- changing report semantics or correction rules;
- changing role authority or approval policy.

Required owner: named business policy owner.

Closure evidence: explicit decision, decision-log entry, and a separately
authorized implementation task if needed.

### C. Production or integration gate

Use when the issue requires an external authority, Production environment,
credentials, RLS, deployment, or an approved integration contract.

Examples:

- canonical customer master, ownership, payment, order, quotation, or lead
  source is unavailable;
- external adapter contract or identifier mapping is pending;
- WhatsApp or customer WeCom synchronization is not approved;
- Production environment or destructive/data migration is required.

Required owner: integration owner or human Production gate owner.

Closure evidence: approved external contract or explicit Production gate; do
not simulate it with fabricated data.

### D. Training or usability feedback

Use when the product behavior is correct but the user could not understand,
find, or complete the workflow safely.

Examples:

- label, instruction, terminology, or navigation confusion;
- an important action is hard to find;
- mobile ergonomics or target size slows safe completion;
- the same progress is being re-entered because the workflow is unclear.

Required owner: training owner or UX/repository task owner.

Closure evidence: updated training material, usability decision, or an
explicitly scoped repository improvement.

## 3. Severity and routing

| Severity | Route | Stop condition |
| --- | --- | --- |
| S0 | Human incident owner and security/Production owner | Stop and rollback immediately |
| S1 | Repository or integration owner plus human pilot owner | Stop affected scenario and block continuation until resolved |
| S2 | Primary class owner with human decision | Continue only with explicit decision and tracked owner |
| S3 | Training or usability owner | Continue; include in next feedback review |

## 4. Triage decision

| Field | Value |
| --- | --- |
| Primary class | repository / policy / production-integration / training-usability |
| Linked triage IDs | |
| Assigned owner | |
| Decision | FIX_REQUIRED / NEEDS_DECISION / GATE_PENDING / TRAINING_ONLY / DUPLICATE / NOT_A_DEFECT |
| Blocks pilot? | YES / NO |
| Rollback required? | YES / NO |
| Production action required? | YES / NO |
| Customer ownership or financial truth affected? | YES / NO |
| Approved next task or gate | |

## 5. Fix and verification

| Field | Value |
| --- | --- |
| Authorized task ID | |
| Branch or commit | |
| Focused tests | |
| Regression risk | |
| Retest scenario ID | |
| Retest result | PASS / FAIL / NOT RUN |
| Retest evidence | |
| Human acceptance required? | YES / NO |

## 6. Closure record

| Field | Value |
| --- | --- |
| Closed by | |
| Closure date/time | |
| Closure class | RESOLVED / POLICY_DECIDED / GATE_APPROVED / TRAINING_COMPLETE / DUPLICATE / NOT_A_DEFECT |
| Evidence link or reference | |
| Follow-up required | |
| Pilot verdict impact | CONTINUE / STOP / ROLLBACK |

No triage record may mark `PILOT_PASS = YES`. Real pilot acceptance belongs to
the human sign-off process in `PHASE_12_QA_PILOT_READINESS.md`.
