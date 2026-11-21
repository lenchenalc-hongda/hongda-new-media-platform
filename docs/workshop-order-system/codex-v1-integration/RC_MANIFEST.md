# WOS V1 Release Candidate Manifest

STATUS: LOCAL_RC_READY_FOR_INDEPENDENT_REVIEW
RC_CODE_SHA: `b6b9b098ac818d79f182e43507edf1370b92fa34`
BASE_MASTER_SHA: `5ac678a50af6391efbdfb0258f037cbdeb2e18d6`
LOCAL_BRANCH: `wip/wos-v1-integration-local`
REMOTE_PUSH: NOT_PERFORMED
PR_CREATED: NO
MERGE: NOT_PERFORMED

The documentation commit that contains this manifest is later than
`RC_CODE_SHA`; it does not change application or SQL behavior.

## Commit History

| Commit | Purpose |
| --- | --- |
| `7cb3256` | Integrated the WOS office, workshop, P2, P7 and local QA source |
| `806b2c2` | Recorded initial local integration evidence |
| `b6b9b09` | Completed local real-Supabase E2E support and evidence |

## Relative-To-Master File Set

- Complete generated list: `RC_FILE_DIFF.tsv`
- Machine-readable allowlist candidate: `RC_ALLOWED_PATHS.json`
- Application/SQL/test files before RC delivery docs: 93
- Final allowlist including delivery docs/evidence/scripts: 142
- WOS-owned path candidates: 137
- Shared paths requiring separate review: 5

Shared paths:

- `src/app/workspace-home/page.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/lib/constants/navigation.ts`
- `src/middleware.ts`
- `tsconfig.json`

These paths must not be copied directly into PR #269 because its active task
allows only six WOS-owned files.

## WOS Capability Inventory

| Capability | Status |
| --- | --- |
| Separate production-order and sampling entry points | PRESENT |
| Office draft, completeness, private-image registration and submit | PRESENT |
| Operator inbox, accept, return and material recording | PRESENT |
| Office six-field correction and resubmission | PRESENT |
| Operator correction review | PRESENT |
| Four material resource types and quantity shortfall | PRESENT |
| Four required private-image categories | PRESENT |
| Office/Workshop independent proof-set signatures | PRESENT |
| Exact object identity/version/SHA/expiry proof checks | PRESENT |
| Numeric order-version CAS and idempotent receipts | PRESENT |
| Viewer and cross-organization denial | PRESENT |
| Read-only handoff/readiness presentation | PRESENT |
| Production start | PROHIBITED; `canStart=false` |

## Historical Source Inventory

| Source | Integrated Scope |
| --- | --- |
| master `5ac678a` | WOS foundation, forms, readiness, scheduling, shared auth/navigation |
| Draft PR #263 | Four-account QA read-only/browser evidence source |
| Draft PR #265 | Strict v7 handoff evidence |
| Draft PR #267 | Office revision, Operator actions, P7 private image and readiness UI |
| Draft PR #269 | M2 immutable proof-set SQL and source tests |
| local commit `b6b9b09` | Four-image UI, local Supabase URL pin, M2 HTTP/UI integration, Local E2E evidence |

PR #269 currently owns only six files. Five of those blobs exactly match this
RC head; `tests/unit/workshop-order-suite.test.ts` is intentionally extended by
the RC integration to include additional WOS tests.

## SQL Fingerprints

Git blob and SHA-256 are both recorded because PR #269's review gate uses the
Git blob while QA install review commonly pins the raw file digest.

| SQL | Git Blob | SHA-256 |
| --- | --- | --- |
| `wos_p1_cpc_draft_revision_QA_ONLY_NOT_INSTALLED.sql` | `20b9561a4e2a4c27d0c6a3f3af8f74505aca6823` | `9abe2324df0ae8caa6acd89993e38c80e931d7ddd7d1828d9cffe6f891c8d90a` |
| `wos_p2_operator_actions_QA_ONLY_NOT_INSTALLED.sql` | `cea2d46bf743ffbce8adc7363825193ec0cd3460` | `c443d590e5e58a1b3dfb8b79b102e035fc9de521bd264a8da83253083a771461` |
| `wos_p2_operator_revision_compat_QA_ONLY_NOT_INSTALLED.sql` | `8d0c9d4e973aa94a5352c288b12c1c3152cf1b69` | `0ba36666a28c6f17f55d7d892dfc40c934b1043b33f6f3d4fc9c9c0d79e27e7d` |
| `wos_p2_office_revision_resubmit_QA_ONLY_NOT_INSTALLED.sql` | `7b9e9a8a561f97e283e9d78e25a5380dcb7d2a3c` | `7ca55466a70481f2563ece1d9d742429a14d0946eebbeb49d29829393cfa4042` |
| `WOS_P2_M2_NONPROD_SQL_NOT_INSTALLED.sql` | `f4058b51caccc27805c89a74bfa8d0cd49238b82` | `3f356f7b12d385b1fff370cad7f064649eb4e90ddb193c79d13fa0f35524e298` |
| `wos_p7_atomic_submission.sql` | `33c7b2262429f4ac5a7045e90a2bc3248514b95d` | `91b59a4241b41021287fd8bf53bd8a76eca098cea7cab9ff10ff563a4640683c` |
| `wos_p7_private_storage.sql` | `427816fe0623e3ef36dcde5cd73e8bb82b316d99` | `882e7b0b390fa7760d5b524477ac3d0391e24759a2e7707a47f773af56f9b3c9` |
| `wos_p7_reader_role_hardening.sql` | `add25d4e63b66d89839a14f595c79b78baa287ac` | `57633ca2b631e13080676385f67aed808328a7ca452c8cadfa6f86e0e6c9ddc6` |
| `wos_p7_trusted_binary_proof_20261108.sql` | `396a305b0fc9ff2220703f0e310af102ce703d69` | `caf42b7a3144d899feef1d5fa4da9cfb3db8ab5786e3fa5d585b860598430665` |

## Current Evidence

- TypeScript: PASS
- WOS aggregate unit suite: PASS
- Next.js production build: PASS
- Fresh PostgreSQL 17 M2 install/assertions: PASS
- Fresh PostgreSQL 17 M2 rollback: PASS
- Local Supabase reset from disposable migrations: PASS
- Current local RLS Viewer/cross-org denial: PASS
- QA metadata read-only inspection: PASS
- QA SQL installation: NOT_AUTHORIZED
- Real QA browser E2E: NOT_RUN
- Vercel Preview: NOT_RUN
- Independent Reviewer approval: PENDING

## Outstanding Gates

- Trusted Writer Completion Contract for PR #269 exact head.
- Independent human security review by a distinct authorized reviewer.
- Owner approval of exact M2 SQL blob/digest, QA schema delta, Gate window and
  rollback.
- Separate QA SQL installation authorization.
- Four-account QA browser E2E after installation.
- Vercel Preview deployment authorization.
- Any production deployment or migration authorization.
