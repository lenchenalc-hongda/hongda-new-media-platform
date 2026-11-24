# PR #279 QA Read-Only Edge Deployment Package

Status: `SOURCE_FIX_PREPARED_NOT_DEPLOYED`

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

The currently deployed version is still the previously authorized v1. The
following source is the new, undeployed candidate and must not be represented
as deployed:

```text
da2838a5ee7b76a4bc9f7d33d67ce87cf2e981baf564c92898e6501b5a9fef58  core.ts
2be70cbe1a9fddc9f29b0b207f33de3a39f8e9a04f090ac6654d70d8636a6056  handler.ts
f05b57809719c8b88d2dd7720c70f309bd95705d8d829b168ce04c7ecd8a2db7  index.ts
4a640c1a0066eaccde7c2ce4a74ae77f4630ad51eed2ddcb782d35cb55d387b4  behavior test
eef2a742563c3603fdc891eb81a3322d3b61b8d017ad95b32719d891e052aa72  request-order test
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

The function already exists as v1. A failed replacement must restore the v1
source, not delete the function. The immutable rollback source is commit
`f964690965ee21a5c6b7c2b5cca8b15a5a83ed37`.

Before replacement, preserve a checkout/archive of that commit and verify:

```text
fe97273931416403f6008156df7831a0a4abf8f151793f0258e9f523fa58bdd7  index.ts
3d3487b6c5cf792bcb58bca5d2a30c4fdcc2f7ef943da5af7c09a74d3471918c  core.ts
f17315be9c9841e020df093b2ae8f835733e21ff6703aa3ec986a4ac62e6a84d  wos-v1-verify-image/core.ts
fa2690fdb01030f478552aff19893520d94615dd6f52a2b13672448eaa62ecdf  shared PNG integrity
```

If the new version does not pass closed-state acceptance:

1. Keep `WOS_V1_EDGE_READONLY_VERIFY_ENABLED` unset or `false`.
2. Stop all new requests.
3. Deploy only `wos-v1-verify-image-readonly` from the verified
   `f964690...` archive with `verify_jwt=true`.
4. Confirm the resulting version serves the recorded v1 source hashes and
   expected v1 bundle `14e962177d74ca4982059134da1a6d3383e3548fb0bd66f38e6df2fd72c3113f`.
5. Verify the function returns the expected closed-state `503`.

The rollback deploy creates a new immutable function version containing the v1
source; it does not restore the numeric version label to 1.

Deleting the function is prohibited:

```text
supabase functions delete wos-v1-verify-image-readonly
```

Do not delete or redeploy `wos-v1-verify-image`. Do not change QA gates,
Storage policies, RLS, Proof rows, orders or Production.

## Required Owner Authorization

The next authorization must bind:

1. final PR #279 HEAD after the order fix commit;
2. the core, handler and index SHA-256 values above;
3. QA project `xulmpqaknlwqqculbsek`;
4. existing function `wos-v1-verify-image-readonly` only, replacing v1;
5. `verify_jwt=true`;
6. Feature Flag `false`;
7. the exact verified QA Preview Origin.

```ini
CURRENT_READONLY_EDGE_DEPLOYED=YES_VERSION_1
ORDER_FIX_DEPLOYED=NO
```

After an authorized replacement, the executor must confirm the new function
version, download and re-hash all deployed source files, and verify all four
existing Edge functions retained their prior version and bundle.
