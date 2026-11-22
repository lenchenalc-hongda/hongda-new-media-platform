# WOS V1 Source Inventory

Base master: `5ac678a50af6391efbdfb0258f037cbdeb2e18d6`

| Capability | Source | Status |
| --- | --- | --- |
| Foundation domain, schemas, readiness, scheduling | master | EXISTS_IN_MASTER |
| Office production and sampling forms | master | EXISTS_IN_MASTER |
| Office six-field revision and resubmission contract | PR #267 | EXISTS_IN_PR267 |
| Operator inbox and handoff read-only UI | PR #267 | EXISTS_IN_PR267 |
| Four-material readiness and quantity shortfall UI | PR #267 | EXISTS_IN_PR267 |
| P2 operator action, return, and office revision APIs | PR #267 | EXISTS_IN_PR267 |
| Private image verification and P7 non-production submit gate | PR #267 | EXISTS_IN_PR267 |
| QA read-only four-account handoff route | PR #267 | EXISTS_IN_PR267 |
| Current visual baseline and independent double-sign presentation | PR #267 | EXISTS_IN_PR267 |
| Strict v7 handoff evidence and future-version rejection | PR #267 / #265 | EXISTS_IN_PR267 |
| M2 immutable private-image proof-set transaction design | PR #269 | EXISTS_IN_PR269 |
| Four required image categories and final material recheck | PR #269 | EXISTS_IN_PR269 |
| End-to-end local Office -> Workshop -> materials -> signoff flow | integration | NEEDS_INTEGRATION |
| WOS navigation, landing page and manual readiness route | integration | EXISTS_IN_LOCAL_BRANCH |
| Local browser smoke with mock auth | integration | PASS |
| Full local browser write E2E | integration | BLOCKED_BY_LOCAL_SUPABASE_STACK |
| QA database installation and real QA writes | Issue #266 gate | BLOCKED_BY_AUTHORIZATION |

Shared paths intentionally touched for local integration:

- `src/middleware.ts`
- `tsconfig.json`
- `tests/unit/workshop-order-suite.test.ts`

No `.github/workflows/**`, Supabase migration, Production environment, or remote branch was changed.
