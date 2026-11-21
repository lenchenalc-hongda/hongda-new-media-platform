# WOS V1 Test Results

## Local Real Supabase E2E

Executed against a disposable local Supabase stack only. No cloud QA or
Production endpoint was written.

| TEST_ID | RESULT | EVIDENCE |
| --- | --- | --- |
| L01 | PASS | Office browser login created a durable DRAFT and submitted it through the same-origin HTTP API |
| L02 | PASS | Four PNG categories were uploaded to private Storage, independently verified by the Edge Function, and registered as READY |
| L03 | PASS | Operator used an independent Auth identity to accept the submitted order |
| L04 | PASS | Operator returned the order with a durable 10+ character reason |
| L05 | PASS | Office read the reason, saved a correction and resubmitted through the versioned RPC |
| L06 | PASS | Operator reviewed the exact latest revision and moved the order to WAITING_MATERIAL |
| L07 | PASS | Office selected a four-image baseline and signed its server-generated proof-set digest |
| L08 | PASS | Workshop used a different profile and signed the same proof-set digest |
| L09 | PASS | FILM, FIXTURE, INCOMING_MATERIAL and SIGNED_SAMPLE were recorded in the browser; incoming quantity was 100/100 |
| L10 | PASS | Final status reached READINESS_CHECK with zero unresolved blockers |
| L11 | PASS | UI continued to show canStart=false and no production-start action |
| L12 | PASS | Storage object-version change rejected inside a rolled-back PostgreSQL transaction |
| L13 | PASS | SHA-256 proof change rejected after double sign |
| L14 | PASS | Image object replacement/update rejected |
| L15 | PASS | Expired image proof rejected |
| L16 | PASS | Missing CUSTOMER_APPROVED_SAMPLE rejected |
| L17 | PASS | Stale numeric order version rejected |
| L18 | PASS | Viewer write RPC returned HTTP 403 and Viewer order query returned 0 rows |
| L19 | PASS | Cross-organization Sales write RPC returned HTTP 403 and order query returned 0 rows |
| L20 | PASS | `supabase db reset` reapplied all 12 disposable local migrations; four Auth users and profile roles were recreated and authenticated |

The tamper tests ran in transactions that were rolled back after the expected
rejection. The final synthetic order remained READINESS_CHECK/version 14 before
permission-denial checks continued.

## Integrated Run

Integration commit: `7cb3256`

| TEST_ID | TEST_COMMAND | RESULT | EVIDENCE |
| --- | --- | --- | --- |
| T01 | WOS production form unit | PASS | Required fields and form submission contract |
| T02 | WOS production form unit | PASS | Draft validation/normalization; no durable local storage claim |
| T03 | WOS API/P7 contract tests | PASS | Submit endpoint fails closed until authorized atomic RPC |
| T04 | WOS inbox/API tests | PASS | Same-org RLS projection and closed Preview behavior |
| T05 | P2 actions contract | PASS | ACCEPT legal-state/CAS/idempotency contract |
| T06 | P2 office returns | PASS | Durable return reason required; no silent return |
| T07 | Office revision contract | PASS | Six-field revision and resubmit contract |
| T08 | P2/PG17 transaction | PASS | Version CAS and old image baseline invalidation |
| T09 | P2 QA readiness unit | PASS | Four material types remain explicitly represented |
| T10 | P2 readiness/PG17 | PASS | Incoming quantity shortfall and unknown arrival handling |
| T11 | M2 PG17 | PASS | Exact four-category private proof-set selection |
| T12 | M2 PG17 | PASS | Missing/incomplete proof set rejected |
| T13 | M2 PG17 | PASS | Office proof-set signature persisted |
| T14 | M2 PG17 | PASS | Workshop independently signs same digest |
| T15 | M2 source guard/PG17 | PASS | Same actor cannot satisfy both signatures |
| T16 | M2 PG17 | PASS | Proof replacement invalidates Office signature |
| T17 | M2 PG17 | PASS | Storage object version is part of canonical proof |
| T18 | M2 PG17/source guards | PASS | Expired proof rejected |
| T19 | P2/M2 PG17 | PASS | Request replay returns REPLAYED without duplicate write |
| T20 | P2/M2 PG17 | PASS | Numeric order version conflict rejected |
| T21 | P2/M2 PG17 | PASS | Viewer write denied |
| T22 | P2/M2 PG17 | PASS | Cross-organization write denied |
| T23 | P2 PG17 | PASS | Transaction exception leaves state/history consistent |
| T24 | P2/M2 PG17 | PASS | `canStart=false`, order remains WAITING_MATERIAL |
| T25 | WOS inbox/readiness tests | PASS | Real status history and audit fields are rendered read-only |

## Executed Gates

| COMMAND | RESULT | EVIDENCE |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | PASS | 413 packages reused from local store |
| `pnpm exec tsc --noEmit` | PASS | Exit 0 |
| `pnpm exec tsx tests/unit/workshop-order-suite.test.ts` | PASS | Aggregate suite, including P2/M2 negative contracts |
| `pnpm build` | PASS | Next.js production build, 129 static/dynamic routes |
| P2 synthetic PG17 transaction | PASS | `WOS_P2_PG17_SYNTHETIC_TRANSACTION_AUDIT=PASS` |
| P2 Office/Operator revision PG17 | PASS | `WOS_P2_PG17_OFFICE_OPERATOR_REVISION_CHAIN=PASS` |
| P2 concurrency PG17 | PASS | `WOS_P2_PG17_TWO_SESSION_CAS_AND_IDEMPOTENT_REPLAY=PASS` |
| M2 double-sign PG17 | PASS | `WOS_P2_M2_PG17_DOUBLE_SIGN_AND_PROOF_CHANGE_REJECTION=PASS` |
| M2 no-auto-start PG17 | PASS | `WOS_P2_M2_PG17_FINAL_MATERIAL_REQUIRES_SIGNOFF_AND_NO_AUTO_START=PASS` |
| Local browser mock-auth smoke | PASS | WOS landing, navigation, production form validation, inbox empty state, readiness gate |
| Local API fail-closed smoke | PASS | inbox/P2/production POST return 503 with expected codes |

PostgreSQL execution used only an ephemeral local `postgres:17-alpine` container.
No Supabase QA or Production endpoint was contacted.

## Not Yet Proven

- Full browser write flow against local Supabase/PostgREST + Auth.
- Real four-account QA browser test.
- Supabase QA installation of the P2/M2 SQL candidates.
- Vercel QA preview acceptance.
- Production migration or deployment.

## Required Gates

- [x] TypeScript compilation
- [x] WOS aggregate unit suite
- [x] Next.js production build
- [x] SQL/PostgreSQL isolated verification
- [x] Local browser render and fail-closed smoke
- [ ] Full browser write flow against local Supabase stack

Static source assertions and in-memory tests are not SQL E2E pass evidence.
