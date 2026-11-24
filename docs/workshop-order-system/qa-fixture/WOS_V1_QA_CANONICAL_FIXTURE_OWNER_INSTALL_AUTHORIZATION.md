# Proposed QA Fixture Writer Installation Authorization

Status: `HISTORICAL_GATE_A_INSTALLED_OLD_GUARD`

The original Gate A installation completed with the reviewed old function
definitions. Gate B then failed closed because hosted PostgREST did not expose
the legacy per-claim GUC expected by that version. Do not rerun this initial
installer against QA. Use
`WOS_V1_QA_CANONICAL_FIXTURE_GUARD_REPLACEMENT_AUTHORIZATION.md` for the
function-only replacement.

Proposed authorization ID:

`WOS-V1-QA-CANONICAL-FIXTURE-WRITER-INSTALL`

## Exact Target

```ini
QA_SUPABASE_PROJECT=xulmpqaknlwqqculbsek
QA_ORGANIZATION=0ff53d93-2b9e-48b9-8113-a4768c39cdd2
FORWARD_SQL=docs/workshop-order-system/qa-fixture/WOS_V1_QA_CANONICAL_FIXTURE_WRITER_NOT_AUTHORIZED.sql
INSTALL_ROLLBACK_SQL=docs/workshop-order-system/qa-fixture/WOS_V1_QA_CANONICAL_FIXTURE_WRITER_INSTALL_ROLLBACK_NOT_AUTHORIZED.sql
```

The Owner authorization must bind:

1. final Draft PR HEAD;
2. Forward SQL SHA-256 and Git blob;
3. install rollback SHA-256 and Git blob;
4. the two function signatures and private manifest table;
5. service_role-only EXECUTE ACL;
6. PostgreSQL 17 test evidence;
7. pre/post schema and ACL fingerprints.

## Installation Rules

```ini
SINGLE_TRANSACTION=true
CREATE_TWO_FUNCTIONS_AND_ONE_MANIFEST_TABLE=true
ONE_ACTIVE_FIXTURE_INDEX=true
CREATE_PROOF=false
CREATE_ORDER=false
OPEN_GATE=false
MODIFY_RLS=false
MODIFY_STORAGE_POLICY=false
MODIFY_EXISTING_FUNCTION=false
MODIFY_PRODUCTION=false
```

After installation, verify:

```ini
PUBLIC_EXECUTE=false
ANON_EXECUTE=false
AUTHENTICATED_EXECUTE=false
SERVICE_ROLE_EXECUTE=true
GRANT_OPTION=false
SECURITY_INVOKER=true
SEARCH_PATH_EMPTY=true
FIXTURE_MANIFEST_TABLE_CLIENT_ACCESS=false
```

## Follow-On Gates

```text
Gate B: PREPARE one QA-R1 order.
Gate C: open one exact-order M2 Office Gate, upload four source.png,
        close immediately, and preserve Storage snapshots.
Gate D: FINALIZE 4 images + CURRENT baseline + 4 items, then verify ACL/rows.
Gate E: separately authorize trusted Proof creation and read-only Edge
        positive/natural-expiry verification.
```

Each gate requires its own evidence and must stop on the first failure.
