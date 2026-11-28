# WOS V1 RC04 QA Compatibility And Security Audit

Status: `RC04_CODE_AND_OFFLINE_PASS / HOSTED_QA_NOT_AUTHORIZED`

No remote QA SQL installation, Gate activation, Storage upload, Proof creation,
Preview deployment, Edge deployment, PR merge, Ready transition or Production
write was performed.

## RC04 Review Remediation

The independent RC03 review identified five release blockers. RC04 closes them
in the same Draft PR:

| Review item | RC04 result |
| --- | --- |
| P0-1 legacy role GUC | Runtime Proof and Renewal share a guard that validates JWT claims, the PostgreSQL transaction role, and a valid PostgREST or CI session origin. |
| P0-2 live QA Proof Guard | Compatibility preserves the exact live guard and adds only a transaction-bound, active-Gate, current-version mirror branch for INSERT. Existing Proof replacement and mirror UPDATE are denied. |
| P0-3 permissive Policy bypass | The broad Operator branch was removed from `wos_p8_private_select`; Operator access comes only from the strict RC02 predicate. Non-WOS bucket access remains separately scoped. |
| P1-4 P7 recovery | Data-retaining recovery restores the four original P7 public functions, exact definitions and ACLs, and the exact QA Proof guard while retaining V1 runtime tables and audit rows. |
| PG17 parity | QA-shape regression installs the exact live Proof Guard, the M2 proof-set verifier, PostgREST v16 and Storage API v1.96.4. |
| P1-A non-WOS scope | The compatibility branch for all non-`wos-private` buckets was removed. A seeded `commercial-quotation-item-images` bucket proves its existing commercial Policy remains authoritative while Operator and Viewer receive no WOS-derived access. |
| P1-B renewal consistency | RC03 QA renewals are explicitly unsupported and fail atomically. The new Proof projection cannot move past its original ten-minute window while the legacy mirror remains expired; Edge v8 and M2 therefore observe the same validity result. |

## Safety Namespace

RC02 now owns only:

```ini
RC02_SAFETY_SCHEMA=wos_v1_rc02_safety
LEGACY_SAFETY_SCHEMA=wos_qa_safety
```

The live-like PG17 fixture creates the legacy P2 safety schema before RC02 with:

```ini
P2_GATE_OPEN_RECEIPTS=2
P2_GATE_CLOSE_RECEIPTS=6
WATCHDOG_RECEIPTS=2
TRIGGER_BACKUP_ROWS=1
```

RC02 captures a SHA-256 fingerprint covering legacy relations, functions,
triggers, policies, ACLs and table rows. Recovery refuses to proceed if the
fingerprint changed, and never drops or rewrites `wos_qa_safety`.

## Gate Hardening

```ini
CREATE_REQUEST_BINDING=ATOMIC
ONE_ACTIVE_AUTHORIZATION=ENFORCED
ABSOLUTE_TTL_MAX=900_SECONDS
TTL_EXTENSION=DENIED
CLOSED_STATE_REOPEN=DENIED
ORDER_REBIND=DENIED
BOUND_IDENTITY_MUTATION=DENIED
NON_QA_PREFIX_DIRECT_INSERT=DENIED
HISTORICAL_NON_QA_UPDATE_WITHOUT_GATE=DENIED
DIRECT_POSTGREST_ORDER_INSERT=DENIED
RPC_WITHOUT_GATE=DENIED
STORAGE_WITHOUT_GATE=DENIED
STORAGE_UPSERT=DENIED
```

The Gate locks its authorization row for every guarded write so Gate closure
and in-flight transactions have deterministic ordering.

## QA Runtime Compatibility

QA compatibility uses a bridge rather than applying the Production runtime
forward unchanged:

```sql
WOS_V1_RC03_QA_RUNTIME_COMPAT_FORWARD_NOT_AUTHORIZED.sql
WOS_V1_RC03_QA_RUNTIME_ACTIVATION_NOT_AUTHORIZED.sql
WOS_V1_RC03_QA_RUNTIME_COMPAT_RECOVERY_NOT_AUTHORIZED.sql
```

The bridge preserves:

- `wos_qa_verified_image_proofs` and all historical Proof rows.
- `wos_qa_orphan_cleanup_claims`.
- Existing P7/P2 functions and safety receipts.
- Original four WOS Storage Policies.
- Original `image/jpeg,image/png,image/webp` bucket configuration.
- Existing authenticated order INSERT grant outside the active RC03 window.

During the RC03 window it:

- Creates Production-neutral `wos_verified_image_proofs` and
  `wos_orphan_cleanup_claims`.
- Mirrors new Proof rows into the historical QA Proof table so existing v8
  readonly Edge and M2 proof-set checks see the new evidence.
- Replaces legacy write Policies with the reviewed P8/PG17-compatible policies.
- Revokes direct authenticated order INSERT while the Gate is installed.
- Restores all original Policies, Bucket MIME and ACL on data-retaining
  compatibility recovery.

## Operator Private Image Access

RC02 adds a narrow Storage SELECT Policy for active same-organization
Operators. It requires:

- The exact order-bound RC02 authorization.
- Current order version.
- `READY`, non-superseded image.
- Required item in the unique CURRENT Baseline.
- Valid Proof and immutable Storage object identity.
- Canonical private `source.png` path.

Positive states:

```ini
SUBMITTED=PASS
WORKSHOP_REVIEW=PASS
NEEDS_INFORMATION=PASS
WAITING_MATERIAL=PASS
```

Negative states:

```ini
VIEWER=DENIED
CROSS_ORG_MANAGER=DENIED
OLD_VERSION=DENIED
EXPIRED_PROOF=DENIED
```

## Version And Proof Closure

The fourth current-version READY image atomically supersedes any old CURRENT
baseline and creates a new CURRENT baseline with four required items.

The RC02 lifecycle test covers:

```ini
V1_FOUR_IMAGES_AND_PROOFS=PASS
OPERATOR_RETURN=PASS
V2_FOUR_NEW_IMAGES_AND_PROOFS=PASS
OLD_V1_PROOF_REUSE=DENIED
V2_RESUBMIT=PASS
V2_OPERATOR_REVIEW=PASS
CURRENT_BASELINE_UNIQUE=PASS
CAN_START=false
```

## PG17 Evidence

The QA-shape rehearsal seeds exact live-like counts:

```ini
QA_ORDERS=85
QA_REFERENCE_IMAGES=90
QA_PROOFS=35
QA_TRUSTED_RECEIPTS=8
QA_STORAGE_OBJECTS=91
QA_CURRENT_BASELINES=2
QA_BASELINE_ITEMS=8
```

Passing checks include:

```ini
RC03_COMPAT_FORWARD=PASS
PRODUCTION_NEUTRAL_RUNTIME_ON_QA_SHAPE=PASS
RC02_FORWARD=PASS
RC02_EIGHT_RPC_ORDER_GATE=PASS
OPERATOR_PRIVATE_IMAGE_ACCESS=PASS
DIRECT_POSTGREST_DENIAL=PASS
STORAGE_SCOPE_AND_UPSERT_DENIAL=PASS
CONCURRENT_AUTHORIZATION=PASS
CONCURRENT_CREATE_REPLAY=PASS
RC02_RECOVERY=PASS
RC03_COMPAT_RECOVERY=PASS
LEGACY_P2_SCHEMA_FINGERPRINT=PASS
LEGACY_STORAGE_POLICY_FINGERPRINT=PASS
LEGACY_BUCKET_AND_ACL_RESTORE=PASS
HISTORICAL_ROW_HASHES=PASS
RUNTIME_DATA_RETAINED_AND_RPC_DEACTIVATED=PASS
LEGACY_PROOF_GUARD_FINGERPRINT=PASS
PROOF_V1_V2_MIRROR=PASS
EDGE_V8_PROOF_PROJECTION=PASS
M2_PROOF_SET_DIGEST=PASS
POSTGREST_SERVICE_ROLE_GUARD=PASS
POSTGREST_NEGATIVE_ROLE_MATRIX=PASS
STORAGE_API_OPERATOR_FOUR_STATE_BYTES=PASS
STORAGE_API_NEGATIVE_MATRIX=PASS
NON_WOS_STORAGE_SCOPE=PASS
PROOF_RENEWAL_FAIL_CLOSED=PASS
PROOF_VALIDITY_BOUNDARY=PASS
EXPIRED_EDGE_M2_CONSISTENCY=PASS
P7_RECOVERY_INTERFACES=PASS
```

Compatibility recovery intentionally uses data-retention mode: it does not
delete new V1 runtime tables or business/audit rows. Full runtime-table removal
requires a separate retention decision. The original P7 public interfaces and
ACLs are restored in this mode.

## RC03 Renewal Contract

`wos_v1_renew_expired_image_proof` remains available in the production-neutral
runtime, but RC03 QA compatibility deliberately rejects Proof UPDATE attempts
with `RC03_PROOF_RENEWAL_UNSUPPORTED`. This prevents a renewed V1 row from
coexisting with an expired legacy projection.

Hosted M2 validation therefore must begin only after the current-version Proof
set is created and complete both Office and Workshop signatures before the
original ten-minute expiry. Expired Proofs require a newly recorded reviewed
Proof set, not renewal of the prior set.

## Other Regression

```ini
TYPECHECK=PASS
WOS_FULL_SUITE=PASS
NEXT_BUILD=PASS
SECRET_AUDIT=PASS
PG17_FULL_SCHEMA=PASS
PG17_383_SIGNATURE_PARITY=PASS
PG17_RUNTIME_ROLLBACK_TO_P7_EXACT=PASS
PG17_M2_MATERIALS_AND_DUAL_SIGN=PASS
PG17_REVISION_IMAGE_SECURITY=PASS
```

## Remaining External Gates

```ini
OPERATOR_JWT=NOT_VERIFIED
HOSTED_QA_E2E=NOT_AUTHORIZED
REMOTE_QA_SQL_INSTALL=NOT_AUTHORIZED
QA_PREVIEW_DEPLOYMENT=NOT_AUTHORIZED
EDGE_DEPLOYMENT=NOT_AUTHORIZED
INDEPENDENT_SEPARATE_REVIEW=NOT_PERFORMED
PRODUCTION_READY=NO
CAN_START=false
```

The next Owner package must pin the new exact HEAD and SQL hashes, provide a
fresh verified Operator JWT in the existing Keychain service, and authorize the
compat/runtime/activation/RC02 install sequence plus bounded Hosted E2E.
