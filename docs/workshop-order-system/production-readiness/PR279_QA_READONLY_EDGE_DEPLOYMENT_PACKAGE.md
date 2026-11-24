# PR #279 QA Read-Only Edge Deployment Package

Status: `PREPARED_NOT_AUTHORIZED`

This package prepares one isolated QA deployment. It does not authorize or
record a deployment.

## Exact Target

```ini
QA_SUPABASE_PROJECT_REF=xulmpqaknlwqqculbsek
EDGE_FUNCTION=wos-v1-verify-image-readonly
VERIFY_JWT=true
WOS_SUPABASE_ALLOWED_REFS=xulmpqaknlwqqculbsek
WOS_V1_EDGE_READONLY_VERIFY_ENABLED=false
WOS_V1_EDGE_WRITES_ENABLED=false
WOS_V1_EDGE_ALLOWED_ORIGINS=https://hongda-wos-p00202-qa-preview-git-32498d-lens-projects-3fc386bd.vercel.app
```

The Origin above is the previously verified non-production QA Preview Origin.
Before deployment, the executor must still confirm that it is the current
HTTPS QA Preview and that the Production project is not involved.

`WOS_SUPABASE_ALLOWED_REFS` and `WOS_V1_EDGE_ALLOWED_ORIGINS` are project-level
Edge secrets shared with existing functions. They must already match the
values above. Any mismatch stops the deployment; this package does not permit
changing a shared setting that could alter existing P7 Edge behavior.

The deployment must not replace or redeploy:

```text
wos-v1-verify-image
```

## Source Identity

The authorization must bind the final PR #279 Git HEAD in addition to these
byte fingerprints:

```text
3d3487b6c5cf792bcb58bca5d2a30c4fdcc2f7ef943da5af7c09a74d3471918c  core.ts
fe97273931416403f6008156df7831a0a4abf8f151793f0258e9f523fa58bdd7  index.ts
4a640c1a0066eaccde7c2ce4a74ae77f4630ad51eed2ddcb782d35cb55d387b4  behavior test
```

## Deployment Commands

Commands are shown for review only and require a new exact-HEAD Owner
authorization:

```bash
supabase functions deploy wos-v1-verify-image-readonly \
  --project-ref xulmpqaknlwqqculbsek
```

`verify_jwt=true` is the required default. The command must not use
`--no-verify-jwt`, and no other function may be included in the deployment.

## Stage 1: Closed-State Acceptance

The Feature Flag remains false throughout this stage.

Required checks:

```ini
QA_PROJECT_ID_MATCH=YES
EDGE_STATUS=ACTIVE
VERIFY_JWT=TRUE
ALLOWED_ORIGIN_OPTIONS=204
ALLOWED_ORIGIN_CORS_HEADER=YES
WRONG_ORIGIN=403
WRONG_SUPABASE_REF=503
VALID_ORIGIN_AND_JWT_WITH_FLAG_OFF=503
FLAG_OFF_CODE=WOS_V1_READONLY_VERIFY_DISABLED
PRIVATE_BYTES_READ=NO
DATABASE_WRITE=NO
```

No private image bytes are downloaded and no business data is changed in this
stage. A successful closed-state test is not a Hosted PNG/SHA-256 acceptance.

## Stage 2: Separate Authorization

Enabling `WOS_V1_EDGE_READONLY_VERIFY_ENABLED=true` is not included here. It
requires a new authorization because it permits a real caller-JWT Storage
download and a real byte hash comparison.

All 31 existing Proof records are currently expired. Therefore the current QA
dataset cannot provide a positive Hosted Proof acceptance. If a positive run is
required, it needs a separately approved minimal synthetic order and Proof
update plan. Historical expiry must not be edited merely to manufacture PASS.

## Rollback

The function is new, so rollback is deletion of this function only, under
explicit authorization:

```bash
supabase functions delete wos-v1-verify-image-readonly \
  --project-ref xulmpqaknlwqqculbsek
```

Do not delete or redeploy `wos-v1-verify-image`. Do not change QA gates,
Storage policies, RLS, Proof rows, orders or Production.

## Required Owner Authorization

The next authorization must bind:

1. final PR #279 HEAD;
2. the two source SHA-256 values above;
3. QA project `xulmpqaknlwqqculbsek`;
4. function `wos-v1-verify-image-readonly` only;
5. `verify_jwt=true`;
6. Feature Flag `false`;
7. the exact verified QA Preview Origin.

`PR279_EDGE_DEPLOYED=NO` remains the current state.
