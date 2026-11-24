# QA Proof Service Guard Replacement Authorization

Status: `NOT_AUTHORIZED`

Authorization ID:

`WOS-V1-QA-PROOF-SERVICE-GUARD-REPLACEMENT`

## Exact Target

```ini
QA_PROJECT=xulmpqaknlwqqculbsek
PR=280

REPLACEMENT_SQL=docs/workshop-order-system/qa-fixture/WOS_V1_QA_PROOF_SERVICE_GUARD_REPLACEMENT_NOT_AUTHORIZED.sql
REPLACEMENT_SHA256=7027e053c6c2fa80b00ece6abe6753907ffac4e50e25f48467add17d3bec9c82
REPLACEMENT_GIT_BLOB=837b96a526fa8dceb44120b972bf53a9f78718da

RECOVERY_SQL=docs/workshop-order-system/qa-fixture/WOS_V1_QA_PROOF_SERVICE_GUARD_RECOVERY_NOT_AUTHORIZED.sql
RECOVERY_SHA256=67913ea3bb21289304fbbbe00c594553c192ef49a1beb1bc9825d81b3eed9f16
RECOVERY_GIT_BLOB=0c2011addeffb0cec9964352b2f0e50be91226e1
```

The final Owner authorization must bind the then-current exact PR HEAD and
successful exact-head CI. This source document does not authorize installation.

## Function Scope

```text
public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)
public.wos_v1_renew_expired_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)
public.wos_p7_service_storage_snapshot(text)
```

## Definition Fingerprints

```text
OLD_RECORD=2c1c1d46469159bc71a1ce17ab40a86eed854816cc2b6a69496f43148faab1e2
OLD_RENEW=49c4d314a5880f62401bcd288a459df941e2ddaf0d0d09bc341642a3dc7e6322
OLD_SNAPSHOT=6dbba8c36a81286f48e021fef84a40730f01e83d6c17d3e76210c099c3722721

NEW_RECORD=1433bdd5244077b1a34a2e7e58b37e5b665c7b5b59a1605544bb5e6854d87772
NEW_RENEW=72023ae1e84ba8f7e2b7a909675f87fdff573f7ab0e648cb11a0921c8c8b70f2
NEW_SNAPSHOT=a7715cb94dd7550803f742ed55c27f4c6e12c34e1eb4f2f69a45dd587ce7aaaa
```

## Guard

All three remain `SECURITY DEFINER`, owner `postgres`, empty `search_path`, and
service-role-only EXECUTE. `CURRENT_USER` is deliberately not used because it
would identify `postgres` inside a SECURITY DEFINER function.

The new guard requires all of:

```text
session_user = authenticator
current_setting('role') = service_role
request.jwt.claims is non-empty JSON object
request.jwt.claims.role = service_role
```

The claims GUC is parsed as JSONB and every parse or type failure is converted
to fail-closed `42501 / SERVICE_ROLE_REQUIRED`. No business validation, return
shape or function signature changes.

## Replacement Rules

```ini
SINGLE_TRANSACTION=true
REPLACE_THREE_FUNCTIONS_ONLY=true
MODIFY_TABLE=false
MODIFY_RLS=false
MODIFY_STORAGE_POLICY=false
MODIFY_TRIGGER=false
MODIFY_OTHER_RPC=false
OPEN_GATE=false
CREATE_PROOF=false
RENEW_PROOF=false
MODIFY_PRODUCTION=false
```

Preflight verifies the exact old hashes, owner, SECURITY DEFINER, ACL,
search_path, all write Gates OFF, the finalized target fixture, and zero target
Proof/Trusted Receipt rows. Postflight verifies the exact new hashes and the
same object/privilege properties.

## Hosted Smoke

After separate installation approval:

```text
tests/live/wos-proof-service-guard-smoke.mjs
```

Required explicit switch and authorization ID:

```ini
WOS_PROOF_GUARD_SMOKE=YES
WOS_PROOF_GUARD_SMOKE_AUTHORIZATION=WOS-V1-QA-PROOF-SERVICE-GUARD-REPLACEMENT
WOS_QA_SUPABASE_URL=https://xulmpqaknlwqqculbsek.supabase.co
```

Credential values must come from the existing secure credential store:

```text
WOS_QA_SERVICE_ROLE_KEY
WOS_QA_AUTHENTICATED_JWT
WOS_QA_ANON_KEY
```

Expected:

```ini
RECORD_PROOF_NULLS=HTTP400/22023/INVALID_PROOF_INPUT
RENEW_PROOF_NULLS=HTTP400/22023/INVALID_RENEWAL_INPUT
STORAGE_SNAPSHOT_NULL=HTTP400/22023/INVALID_STORAGE_PATH
AUTHENTICATED=DENIED
ANON=DENIED
NO_AUTHORIZATION=DENIED
SERVICE_APIKEY_WITH_USER_JWT=DENIED
FORGED_SERVICE_SIGNATURE=DENIED
TARGET_PROOFS=0
TARGET_TRUSTED_PROOF_RECEIPTS=0
```

No Proof, Receipt, baseline, image, order, Storage object or Gate may change.

## Exclusions

This gate does not authorize valid Proof creation, Proof renewal, M2 Gate
activation, Edge deployment or switching, FINALIZE, PR merge or Production.
