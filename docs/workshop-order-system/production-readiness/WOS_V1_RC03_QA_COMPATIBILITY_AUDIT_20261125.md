# WOS V1 RC03 QA Compatibility And Security Audit

Status: `CODE_AND_OFFLINE_PASS / HOSTED_QA_NOT_AUTHORIZED`

No remote QA SQL installation, Gate activation, Storage upload, Proof creation,
Preview deployment, Edge deployment, PR merge, Ready transition or Production
write was performed.

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
```

Compatibility recovery intentionally uses data-retention mode: it does not
delete new V1 runtime tables or business/audit rows. Full runtime-table removal
requires a separate retention decision.

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
