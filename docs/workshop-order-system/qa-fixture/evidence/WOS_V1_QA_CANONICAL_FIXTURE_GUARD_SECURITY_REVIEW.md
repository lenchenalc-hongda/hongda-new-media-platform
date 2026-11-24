# V1 Canonical Fixture Writer Guard Security Review

Status: `AI_SOURCE_AND_SECURITY_REVIEW_PASS_NO_BLOCKING_FINDINGS`

This is an independent AI technical re-review of the source diff. It is not a
human GitHub approval, a trusted completion contract, or authorization to
replace remote functions.

## Scope

Reviewed:

- fresh-install function guard changes;
- function-only replacement SQL;
- function-only recovery SQL;
- PG17 replacement/recovery and privilege tests;
- local PostgREST role-context integration;
- default-deny Hosted smoke script;
- documentation and evidence fingerprints.

## Findings

No blocking source or security findings remain after the review.

The replacement and recovery SQL:

- require one exact old/new `pg_get_functiondef` SHA-256 pair;
- require owner `postgres`, SECURITY INVOKER and empty `search_path`;
- require exact owner/`service_role` function ACL with no grant option;
- require the private manifest table, RLS, valid unique active index and zero
  manifest rows;
- require every QA write Gate OFF;
- acquire the same global Fixture advisory lock used by runtime operations;
- execute in one transaction;
- create or replace only the two reviewed function signatures;
- reapply only function EXECUTE ACL;
- do not create, alter or drop tables, indexes, RLS, Storage policies, business
  rows, Proofs, Receipts or Gates.

Both replacement and recovery derive their function bodies from the reviewed
fresh-install and prior source respectively. A mechanical cross-check confirmed
that the replacement bodies exactly match the fresh-install bodies and the
recovery bodies exactly match the prior HEAD.

## Effective Role Test

The PG17/PostgREST integration proved:

```ini
REAL_SERVICE_ROLE_PASSES_GUARD=PASS
AUTHENTICATED_DENIED=PASS
ANON_DENIED=PASS
NO_AUTHORIZATION_DENIED=PASS
FAKE_LOCAL_CLAIM_DENIED=PASS
FAKE_JWT_CLAIM_DENIED=PASS
WRONG_SIGNATURE_DENIED=PASS
SERVICE_APIKEY_WITH_USER_JWT_DENIED=PASS
WRITES=0
```

The hosted smoke script adds a real `/auth/v1/user` check before testing denial,
so an expired or invalid ordinary-user JWT cannot be mistaken for a successful
authorization test.

## Residual Gates

```ini
QA_FUNCTION_REPLACEMENT_INSTALLED=NO
HOSTED_QA_SMOKE_EXECUTED=NO
VALID_PREPARE_RETRIED=NO
GATE_C_STARTED=NO
PRODUCTION_CHANGED=NO
```

Remote replacement remains blocked on a new exact-HEAD Owner authorization.
