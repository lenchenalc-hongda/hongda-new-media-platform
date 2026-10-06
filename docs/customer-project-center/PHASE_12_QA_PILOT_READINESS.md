# Customer Project Center - Phase 12 QA and Pilot Readiness

Status: repository-side QA and pilot-readiness layer complete

`PILOT_REPOSITORY_READY = YES`

`PILOT_PASS = NO`

Production changes: none

This document proves that the repository can be exercised by the five approved
role classes and prepares a controlled, non-production pilot for two to three
project owners. It does not claim that a real pilot, Production rollout, or
business go-live has passed.

## 1. Scope and evidence boundary

The Phase 12 automated layer verifies:

- route and resource authorization for admin, manager, sales, operator, and
  viewer;
- hidden navigation is not an authorization boundary;
- expected-version conflict behavior;
- duplicate, replay, and concurrent mutation guards;
- UNKNOWN semantics for missing external customer, ownership, payment, order,
  quotation, lead, and conversation facts;
- empty, partial, loading, denied, and error states;
- the mobile-critical employee flow;
- no raw activity ranking or message/click/count KPI.

Repository tests and documents are evidence for `PILOT_REPOSITORY_READY` only.
Real pilot evidence requires a named approved non-production environment, real
human observers, and human sign-off below.

## 2. Five-role acceptance matrix

| Role | CPC portal | Team Board | CPC Settings | Formal CPC data scope | V1 result |
| --- | --- | --- | --- | --- | --- |
| admin | allow | allow | allow | same-organization CPC resources | PASS |
| manager | allow | allow | deny | same-organization management read/review | PASS |
| sales / project owner | allow | deny | deny | owner, collaborator, assignee, creator, or subject relations only | PASS |
| operator | deny | deny | deny | no CPC portal or formal CPC data in V1 | PASS |
| viewer | deny | deny | deny | no CPC portal or formal CPC data in V1 | PASS |

Authorization rules:

- same-organization checks fail closed;
- unrelated sales and cross-organization resources are denied;
- operator and viewer receive no formal CPC resource access in V1;
- hidden or disabled navigation never grants access;
- Review Center remains its own authority;
- Knowledge remains advisory only;
- customer ownership and financial truth remain external and read-only.

## 3. Durable E2E acceptance matrix

| Scenario ID | Acceptance path | Automated repository evidence | Pilot evidence |
| --- | --- | --- | --- |
| P12-ROLE-01 | Five-role route matrix: admin Settings, manager Team Board, sales CPC only, operator/viewer denied | `customer-project-center-phase12-qa.test.ts` | Observer confirms each role landing/denial |
| P12-AUTH-01 | Hidden navigation is not authorization | Phase 12 role and middleware contract checks | Attempt a direct URL where safe |
| P12-AUTH-02 | Cross-org and unrelated-resource denial | Phase 12 domain checks and same-org route assertions | Record 404/403 without exposing resource names |
| P12-FLOW-01 | Workbench priority queue from confirmed work | Workbench read-model and surface checks | Owner identifies today priority without a separate list |
| P12-FLOW-02 | Customer relationship follow-up without creating a Project | Phase 5F and Phase 10 tests plus Phase 12 matrix | Record follow-up and next check |
| P12-FLOW-03 | Concrete opportunity becomes a Project | Project creation and next-step invariant checks | Create one synthetic Project |
| P12-FLOW-04 | Meaningful progress plus NEXT_ACTION or waiting/check | Progress/waiting RPC and UI contract checks | Record progress and confirm one next state |
| P12-FLOW-05 | Task complete, reschedule, or cancel history | Phase 5B and Phase 6B contract tests | Exercise one safe task transition |
| P12-FLOW-06 | AI draft accept/reject with stale guard | Phase 6C and Phase 12 version checks | Accept or reject a synthetic draft |
| P12-REPORT-01 | Derived daily and weekly reports | Phase 7A/7B/7C and Phase 8 tests | Compare a report to the confirmed synthetic facts |
| P12-REVIEW-01 | Manager/admin report review | Report-review authorization tests | Manager reviews a submitted synthetic report |
| P12-TEAM-01 | Team Board exception and support view | Phase 9 tests and Phase 12 no-ranking checks | Manager opens Team Board without employee ranking |
| P12-OLD-01 | Old-customer 30/60/90 suggestions | Phase 10 tests and cadence constant checks | Confirm suggestions are non-KPI and duplicate-suppressed |
| P12-INTEGRATION-01 | Phase 11 UNKNOWN/read-only integration behavior | Phase 11 tests and Phase 12 registry/adapter checks | Admin sees pending or unknown, never fabricated zero |
| P12-CONC-01 | Stale expected-version conflict | Phase 12 conflict mapping and RPC checks | Two sessions attempt one synthetic edit |
| P12-REPLAY-01 | Duplicate reference/follow-up/report attempts | Phase 12 duplicate-code and uniqueness checks | Replay one request and confirm no duplicate work |
| P12-CONC-02 | Concurrent next-action, report, or follow-up attempts | Row-lock and version-guard contract checks | Use two observers only if the pilot environment supports it |
| P12-UNKNOWN-01 | Missing external facts remain UNKNOWN | Registry, adapter, report, and old-customer checks | Confirm no value is shown as zero or false |
| P12-UI-01 | Empty, partial, loading, and denied states | Phase 12 UI state contract checks | Capture desktop and mobile states |
| P12-MOBILE-01 | Mobile-critical capture, task, waiting, customer, and Project flow | Responsive layout contract checks | One owner completes the flow on a phone |
| P12-RANK-01 | No message/click/count activity ranking | Phase 12 prohibited-surface scan | Confirm Team Board has no employee ranking |

## 4. Pilot entry criteria

All of the following must be true before the human pilot starts:

1. The exact repository commit has passed TypeScript, all Phase 5-12 focused
   tests, build, and secret audit.
2. A named non-production environment is approved for the pilot.
3. The pilot uses two or three named project owners and no Production users.
4. Admin, manager, and the pilot owners are seeded for the same non-production
   organization.
5. `NEXT_PUBLIC_FEATURE_CUSTOMER_PROJECT_CENTER` is enabled only in the approved
   non-production environment.
6. A rollback owner and observer are named.
7. No Production credentials, customer records, ownership records, receipt
   records, quotations, orders, or conversation exports are used.
8. The pilot starts with `PILOT_PASS = NO`; a human sign-off may change it only
   after reviewing evidence.

## 5. Seeded non-production data rules

- Use synthetic records only and prefix display names with `PILOT-NONPROD`.
- Use a dedicated synthetic organization and synthetic profiles.
- Never copy Production customer, employee, ownership, payment, order,
  quotation, or conversation records.
- Do not infer customer identity, ownership, key-customer status, or financial
  facts from free text.
- Missing external facts stay `UNKNOWN`; they must not become `0`, `false`, or a
  plausible fabricated value.
- AI output remains a draft until a human explicitly accepts it.
- Keep Review Center and Knowledge read-only and advisory.
- Record the seed script, data set identifier, environment, and cleanup method
  in the evidence log.
- Prefer environment reset or deletion of the synthetic organization. Do not
  repair the pilot by editing Production data.

## 6. Pilot scenario script

Run the following with two or three project owners. Use one observer per
session and record evidence immediately.

1. Sign in as each role and confirm the five-role matrix.
2. Open Workbench and have the owner identify the highest-priority confirmed
   work without building a separate list.
3. Open a synthetic customer, record a relationship follow-up, and set the next
   check without creating a Project.
4. Create a concrete synthetic Project from the customer context.
5. Record meaningful progress and leave either a NEXT_ACTION or an explicit
   waiting/check state.
6. Complete, reschedule, and cancel one synthetic task each, including the
   required reason where applicable.
7. Review an AI draft, reuse one valid draft, reject one invalid draft, and
   attempt a stale acceptance in a second session.
8. Generate a daily report, inspect UNKNOWN values, and submit it.
9. Generate or inspect a weekly report and verify that missing daily coverage
   remains UNKNOWN.
10. Sign in as manager, review the synthetic report, and use Team Board to find
    exceptions or support needs.
11. Confirm old-customer suggestions remain recommendation-only and are
    suppressed by an active Project or open follow-up.
12. Open CPC Settings as admin and confirm external integrations are pending,
    unknown, or read-only rather than fabricated.
13. Repeat the mobile-critical capture and task flow on a phone.
14. Replay one mutation and run one stale-edit attempt. Confirm no duplicate or
    partial business fact is created.
15. Review every S0/S1 item and decide stop, rollback, or continue.

## 7. Evidence template

| Field | Required value |
| --- | --- |
| Pilot run ID | |
| Approved environment | |
| Repository commit | |
| Feature flag state | |
| Pilot owner(s) | |
| Observer(s) | |
| Role matrix result | |
| Scenario IDs completed | |
| Mobile device/browser | |
| Expected-version evidence | |
| Replay/duplicate evidence | |
| UNKNOWN evidence | |
| Report evidence | |
| Team Board evidence | |
| Defects and triage IDs | |
| Rollback/stop event | |
| Data cleanup result | |
| Optional screenshots or log references | |
| Pilot verdict | CONTINUE / STOP / ROLLBACK |

## 8. Blocker and severity rules

| Severity | Definition | Required action |
| --- | --- | --- |
| S0 | Cross-organization exposure, role escalation, Production data exposure, destructive data change, ownership/financial truth corruption, or external publication | Stop immediately, preserve evidence, rollback if applicable, and notify the human owner |
| S1 | Wrong-role access, stale write accepted, duplicate formal mutation, UNKNOWN shown as zero/false, report immutability breach, or data loss | Stop the affected scenario and block pilot continuation until triaged |
| S2 | Core workflow cannot complete, incorrect deterministic report value, or mobile-critical flow blocked with a safe workaround | Continue only with an explicit human decision and a tracked owner |
| S3 | Usability, wording, layout, or training feedback without safety or data impact | Continue and route as training or usability feedback |

## 9. Rollback and stop conditions

Stop the pilot and return to repository-only QA if any S0 or S1 condition occurs.

Rollback or disable the feature when:

- a cross-organization or unrelated-resource exposure is observed;
- an operator or viewer receives formal CPC access;
- a stale mutation succeeds without conflict;
- a replayed mutation creates duplicate formal work;
- UNKNOWN is converted to zero, false, or fabricated business fact;
- customer ownership or financial truth is changed or contradicted;
- Production data or credentials are used;
- reports or audit history can be mutated in place;
- a destructive migration or RLS change is proposed without a separate human
  gate;
- the pilot cannot be explained, observed, or cleaned up safely.

The stop decision belongs to the named human pilot owner. Codex or an automated
agent must not mark the real pilot as passed.

## 10. Feedback questions

1. Could the owner understand today's priority work without a separate plan?
2. Was meaningful progress captured once, without duplicate report entry?
3. Did NEXT_ACTION or waiting/check remain clear after a progress update?
4. Was the customer-to-Project promotion fast and understandable?
5. Were task completion, reschedule, and cancellation history trustworthy?
6. Was the AI draft boundary clear, and was explicit acceptance required?
7. Did the daily and weekly reports match the confirmed synthetic facts?
8. Were UNKNOWN values understandable rather than mistaken for zero?
9. Could the mobile-critical flow be completed without a wide desktop layout?
10. Did Team Board help find exceptions or support needs without ranking people?
11. Which wording, layout, or training change would remove the most friction?
12. Which blocker, if any, should stop the next pilot session?

## 11. Human sign-off

| Sign-off field | Name / result | Date |
| --- | --- | --- |
| Pilot owner approval | | |
| Business policy owner | | |
| Non-production environment owner | | |
| Security/authorization observer | | |
| Training/usability observer | | |
| Rollback owner | | |
| `PILOT_REPOSITORY_READY` reviewed | YES / NO | |
| `PILOT_PASS` approved | YES / NO | |
| Human notes | | |

The repository may set `PILOT_REPOSITORY_READY = YES`. Only a human-approved
pilot run may set `PILOT_PASS = YES`.

## 12. Known limitations and pending gates

The following remain external or human gates:

- canonical customer master;
- external customer ownership;
- receipt/payment authority;
- unified order authority;
- structured quotation authority;
- live lead authority;
- WhatsApp and customer WeCom conversation integration;
- Production deployment, environment, credentials, Redis/RLS, or data change;
- real customer communication or external publishing;
- real pilot acceptance and go-live.

No route, fixture, or pilot instruction in this document implies that real
Production data is available.
