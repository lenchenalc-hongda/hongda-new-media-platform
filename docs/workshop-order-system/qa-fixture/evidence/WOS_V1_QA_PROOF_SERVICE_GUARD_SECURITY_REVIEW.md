# QA Proof Service Guard Security Review

Status: `AI_INDEPENDENT_REVIEW_PASS_NO_BLOCKING_FINDINGS`

This is an independent AI source/security review, not human GitHub approval and
not authorization to replace QA functions.

## Findings

No blocking source or security findings remain after the review.

The three functions remain SECURITY DEFINER, owner `postgres`, empty
`search_path`, and service-role-only EXECUTE. Only authentication guard code and
local claim variables changed; all business branches, parameter names, return
shapes and object grants remain unchanged.

The guard does not trust `current_user`, because SECURITY DEFINER resolves it to
`postgres`. It cross-validates:

```text
authenticator session
service_role transaction role
signature-validated PostgREST JSON claims
exact claims role service_role
```

Malformed, missing, empty, forged, ordinary-user and anonymous claims fail with
SQLSTATE 42501. Direct database sessions cannot satisfy the authenticator and
transaction-role checks even if they manually set the claims GUC.

## Tests Reviewed

```ini
OLD_HASHES=PASS
NEW_HASHES=PASS
RECOVERY_HASHES=PASS
SECURITY_DEFINER=true
SEARCH_PATH_EMPTY=true
ACL_SERVICE_ROLE_ONLY=true
DIRECT_POSTGRES_SPOOF=REJECTED
DIRECT_SERVICE_ROLE_WITH_CLAIMS=REJECTED
REAL_POSTGREST_SERVICE_ROLE=PASS
AUTHENTICATED=DENIED
ANON=DENIED
NO_AUTH=DENIED
FAKE_CLAIM=DENIED
WRONG_SIGNATURE=DENIED
SERVICE_APIKEY_WITH_USER_JWT=DENIED
PROOF_WRITES=0
RECEIPT_WRITES=0
```

## Residual Gates

QA replacement has not been installed. Hosted smoke has not run. Gate E Proof
creation and Edge verification remain separately unauthorized.
