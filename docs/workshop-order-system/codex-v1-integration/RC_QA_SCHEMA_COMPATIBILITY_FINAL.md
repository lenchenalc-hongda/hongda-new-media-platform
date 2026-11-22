# WOS V1 QA Schema Compatibility Final

QA_PROJECT: `xulmpqaknlwqqculbsek`
ACCESS_MODE: Read-only Management API metadata query
QA_DDL_EXECUTED: NO
QA_DML_EXECUTED: NO
FINAL_RESULT: PARTIAL

The compatibility review is complete for the catalog metadata available through
the read-only Management API. Full PASS still requires the separately
authorized additive M2 installation and post-install verification.

Raw sanitized metadata is under:

```text
rc-evidence/qa-metadata/
```

## Table And Field Compatibility

| Area | Result | Evidence / Required Action |
| --- | --- | --- |
| `wos_production_orders` and numeric `version` / `version_label` | MATCH | Both fields exist in QA; current QA has 84 orders |
| `wos_reference_images` | MATCH | Required columns, entity/org fields and image status exist |
| `wos_visual_baselines` | MIGRATION_REQUIRED | Base table exists; four M2 signature/version columns are absent |
| `wos_visual_baseline_items` | MATCH | Baseline/image association table exists |
| `wos_resource_readiness` | MATCH | Four-resource records and quantity fields exist |
| `wos_qa_verified_image_proofs` | MATCH | Object ID/version/update/SHA/expiry columns exist |
| `wos_qa_p2_execution_gate` | MATCH | Exists and is OFF |
| `wos_qa_p2_office_execution_gate` | MATCH | Exists and is OFF |
| `wos_qa_p2_m2_gate` | MIGRATION_REQUIRED | Does not exist |
| `wos_qa_p2_m2_receipts` | MIGRATION_REQUIRED | Does not exist |
| `wos_qa_p2_m2_action` | MIGRATION_REQUIRED | Function does not exist |
| `wos_qa_p2_m2_checked_proof_set` | MIGRATION_REQUIRED | Function does not exist |
| `wos_qa_p2_m2_spec_digest` | MIGRATION_REQUIRED | Function does not exist |

## Constraint Compatibility

| Constraint Area | Result | Evidence |
| --- | --- | --- |
| Required image categories | MATCH | CHECK includes PRODUCT, FILM_PATTERN, CUSTOMER_APPROVED_SAMPLE, SIGNED_SAMPLE and other supported categories |
| Proof SHA format | MATCH | CHECK is `^[a-f0-9]{64}$` |
| Proof expiry bound | MATCH | `expires_at > verified_at` and at most 30 minutes |
| Reference image uniqueness | MATCH | Unique `(storage_bucket, storage_path)` |
| Current baseline uniqueness | MATCH | QA already has a partial unique index on `(entity_type, entity_id)` where CURRENT |
| M2 baseline-digest columns | MIGRATION_REQUIRED | Four columns absent |
| M2 Gate/Receipt constraints | MIGRATION_REQUIRED | Tables absent |

QA currently has zero visual baselines, so adding columns and the additional
organization-scoped CURRENT index has no existing-row conflict.

## RLS And Grants

| Area | Result | Evidence / Action |
| --- | --- | --- |
| Order same-org SELECT | MATCH | Policy resolves active profile by `auth.uid()` and compares `org_id` |
| Reference image same-org SELECT | MATCH | Policy compares active profile organization |
| Viewer read restriction | MATCH | RESTRICTIVE reader-role policy exists |
| Office draft INSERT | MATCH | DRAFT-only same-org creation policy exists |
| Direct reference image INSERT grant | MATCH | Authenticated has SELECT only; an existing INSERT policy is inert without grant |
| Proof table browser access | MATCH | RLS enabled; authenticated table write revoked |
| M2 Gate/Receipt browser access | MIGRATION_REQUIRED | New tables must deny table access and EXECUTE must be separately granted |

Do not grant INSERT on `wos_reference_images`. Image registration must remain
through the trusted RPC.

## Storage Compatibility

| Area | Result | Evidence |
| --- | --- | --- |
| `wos-private` bucket | MATCH | Exists, private, 20 MB limit |
| Allowed MIME types | MATCH | JPEG, PNG, WebP |
| Private object INSERT policy | MATCH | Authenticated path/order/role constrained |
| Private object SELECT policy | MATCH | Organization/order/role constrained |
| Reader-role hardening | MATCH | Additional restrictive storage reader policy exists |

## Function And Guard Compatibility

| Area | Result | Evidence / Action |
| --- | --- | --- |
| Existing P7 submit/readiness functions | MATCH | Present with authenticated EXECUTE |
| Existing P2 Operator/Office/review functions | MATCH | Present with authenticated EXECUTE |
| Proof write guard | MATCH | Requires live object identity plus order `DRAFT` |
| Legacy single-order Gate guard | REVIEW_REQUIRED | Tied to fixed historical QA order while legacy Gates are ON |
| M2 Action EXECUTE | MIGRATION_REQUIRED | Must be revoked at install, then granted only by a separate approved transaction |

QA E2E must keep both legacy Gates OFF. The new M2 Gate is independent and
order-specific.

## Rollback Candidate

Install candidate:

```text
docs/workshop-order-system/nonproduction-only/WOS_P2_M2_NONPROD_SQL_NOT_INSTALLED.sql
```

Rollback candidate:

```text
docs/workshop-order-system/codex-v1-integration/rc-sql/qa_m2_install_rollback.sql
```

Both were exercised in separate fresh PostgreSQL 17 databases.

## Final Classification

```text
WOS_BASE_SCHEMA = MATCH
M2_SCHEMA_DELTA = MIGRATION_REQUIRED
RLS_AUTH_MODEL = MATCH
STORAGE_MODEL = MATCH
LEGACY_FIXED_ORDER_GUARD = REVIEW_REQUIRED
M2_INSTALL_EXECUTION = BLOCKED
QA_SCHEMA_COMPATIBILITY_FINAL = PARTIAL
```

The remaining BLOCKED state is authorization and post-install verification, not
an unexplained metadata gap.
