# WOS V1 RC Test Evidence

CODE_SHA: `b6b9b098ac818d79f182e43507edf1370b92fa34`
BASE_MASTER_SHA: `5ac678a50af6391efbdfb0258f037cbdeb2e18d6`
ENVIRONMENT: disposable localhost Supabase only
CURRENT_REMOTE_QA_WRITES: NONE
PRODUCTION_WRITES: NONE

The final local browser snapshot and screenshot are included in
`rc-evidence/`. They contain synthetic data only.

## Local Browser E2E

| TEST_ID | COMMAND / ACTION | RESULT | HTTP_STATUS | DB_EVIDENCE | CODE_SHA |
| --- | --- | --- | --- | --- | --- |
| WOS-RC-01 | Office login through `/login` with an actual Supabase Auth user | PASS | 200 | Trusted profile resolved as `sales` | `b6b9b09` |
| WOS-RC-02 | Office fills the form, selects four PNG files and submits from the browser | PASS | image verify 200; production POST 200 | `wos_production_orders` reaches `SUBMITTED/v2`; one submission receipt | `b6b9b09` |
| WOS-RC-03 | Operator logs in with a distinct Auth identity and reads Inbox | PASS | 200 | Operator profile ID differs from Office profile ID | `b6b9b09` |
| WOS-RC-04 | Operator accepts, then returns the order with a durable reason | PASS | 200 | `SUBMITTED -> WORKSHOP_REVIEW -> NEEDS_INFORMATION` history | `b6b9b09` |
| WOS-RC-05 | Office reads return reason, saves a correction and resubmits | PASS | 200 | Numeric version advances; immutable revision snapshots and new `QA-R*` labels | `b6b9b09` |
| WOS-RC-06 | Operator reviews the exact latest revision | PASS | 200 | `WORKSHOP_REVIEW -> WAITING_MATERIAL` with review receipt | `b6b9b09` |
| WOS-RC-07 | Four required private-image categories are uploaded and independently attested | PASS | 200 | Four `wos_reference_images` rows and four valid proof rows | `b6b9b09` |
| WOS-RC-08 | Office selects and signs the canonical four-image proof-set | PASS | 200 | `office_proof_set_digest` and `office_post_order_version` persisted | `b6b9b09` |
| WOS-RC-09 | Workshop signs with a different profile | PASS | 200 | Same digest, distinct Workshop profile, `workshop_post_order_version` persisted | `b6b9b09` |
| WOS-RC-10 | Four material resource types are recorded | PASS | 200 each | `FILM`, `FIXTURE`, `INCOMING_MATERIAL`, `SIGNED_SAMPLE`; incoming quantity 100/100 | `b6b9b09` |
| WOS-RC-11 | Final readiness rendering and no-start assertion | PASS | 200 | `READINESS_CHECK/v14`, zero unresolved blockers, `canStart=false`, no start action | `b6b9b09` |

Browser evidence:

- `rc-evidence/local-browser-readiness-final.yml`
- `rc-evidence/local-browser-readiness-final.png`

The YAML records a real signed-in Operator identity, `READINESS_CHECK/v14`,
all four material rows as verified, Office and Workshop signatures, four
QA-R6 image categories, and an explicit prohibition on scheduling/start.

## Tamper And Version Negatives

| TEST_ID | ACTION | RESULT | DB_EVIDENCE |
| --- | --- | --- | --- |
| WOS-RC-N01 | Change Storage object version after signatures | REJECTED | `PT409`; transaction rolled back |
| WOS-RC-N02 | Change private-image SHA-256 proof | REJECTED | `PT409`; stale signoff cannot be reused |
| WOS-RC-N03 | Replace/update Storage object metadata | REJECTED | `PT409`; current proof join fails |
| WOS-RC-N04 | Expire all proof rows | REJECTED | `PT409`; proof window enforced |
| WOS-RC-N05 | Remove `CUSTOMER_APPROVED_SAMPLE` from baseline | REJECTED | `PT409`; exact four-category set required |
| WOS-RC-N06 | Submit a stale numeric order version | REJECTED | `PT409`; CAS conflict |

These cases were rerun in a fresh PostgreSQL 17 container using the exact M2
SQL digest:

```text
WOS_P2_M2_PG17_DOUBLE_SIGN_AND_PROOF_CHANGE_REJECTION=PASS
WOS_P2_M2_PG17_FINAL_MATERIAL_REQUIRES_SIGNOFF_AND_NO_AUTO_START=PASS
WOS_P2_M2_PG17_GATES_REVOKED_AFTER_TEST=PASS
```

## Current RLS Recheck

Current local Supabase Auth tokens were used; no JWT was printed or stored.

| IDENTITY / ACTION | RESULT |
| --- | --- |
| Office reads synthetic same-org order | HTTP 200, 1 row |
| Viewer reads same-org order | HTTP 200, 0 rows |
| Cross-organization Sales reads order | HTTP 200, 0 rows |
| Viewer PATCHes order | HTTP 403 |
| Cross-organization Sales PATCHes order | HTTP 403 |

## Build And Regression

| COMMAND | RESULT | EVIDENCE |
| --- | --- | --- |
| `pnpm typecheck` | PASS | Exit 0 |
| `pnpm exec tsx tests/unit/workshop-order-suite.test.ts` | PASS | Complete WOS aggregate suite |
| `pnpm build` | PASS | Next.js compiled and generated 131 static pages |
| `git diff --check` | PASS | No whitespace errors |
| Build bundle service-role scan | PASS | No `service_role`, service-role key name or JWT in `.next/static` |

## QA Status

REAL_QA_E2E: NOT_RUN
QA_SQL_INSTALL: NOT_AUTHORIZED
QA_GATE_ACTIVATION: NOT_PERFORMED
VERCEL_PREVIEW: NOT_RUN
PRODUCTION_DEPLOYMENT: NOT_AUTHORIZED
