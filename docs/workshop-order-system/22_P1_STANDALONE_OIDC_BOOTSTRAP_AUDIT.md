# WOS P1 | Standalone private GitHub OIDC attestation bootstrap — security review only

**Code-only draft PR #259; not a live trusted signer or shared-path permission.** The separate repo `lenchenalc-hongda/hongda-wos-p1-handoff-attestation` does NOT currently exist or was inaccessible when checked. The linked GitHub connector does not support creating a repo, branch protection or manual Actions dispatch. This file is not a Completion Contract.

The standalone bootstrap distribution is an uninstalled, self-contained 7-file package with:
- A new private-repo `.github/workflows/wos-p1-oidc-readonly.yml` to request GitHub-issued OIDC solely after an environment-approved manual `workflow_dispatch`. All other repository permissions are read-only.
- `scripts/verify-oidc.mjs` verifies JWT signature using GitHub's real issuer Discovery/JWKS; checks issuer/audience, immutable *new attestor repo* ID (not the business repository ID), owner ID, private visibility, protected main (GitHub runner `GITHUB_REF_PROTECTED` and separately verified branch rules; `ref_protected` is not a guaranteed JWT claim), workflow_ref and runtime SHA, job event, run ID/attempt, environment, reviewer-pinned subject, short TTL, and optional JTI fallback via JWT SHA256 fingerprint. No full JWT in logs.
- A fail-closed, discovery-only first run: verified repo ID and subject may be printed for an independent admin to pin; no actual authorization until pinned. A valid real OIDC cannot by itself authorise a Supabase CAS or count as an independent Reviewer PASS.
- 36/36 locally executed synthetic tests (RS256 signatures, fake keys, wrong Claims, missing JTI, pinned issuer URLs), not real GitHub-issued JWTs.
- A separate `ci.yml` running Node unit tests without issuing tokens.
- README with private-repo/independent-reviewer/Environment/branch-protection setup, private-key prohibition, and signer custody requirements.

**Bootstrap ZIP SHA-256:** `1918f203dfe99fe64a101d8f13bbd44907cea5267a364b05fb045f53c60233ab`.
The actual standalone file bytes are local distribution artifacts, not automatically copied into the business repository or a new GitHub repository.

Important issuer separation: Business target repo immutable ID `1286793274` vs NEW private issuer repo ID, which must be obtained from a real newly created repo and independently pinned. The target PR #259 HEAD does NOT equal the protected new workflow SHA. The actual `sub` may use GitHub immutable-subject syntax and cannot be guessed.

No private key was generated for a production signer. Attestor and Reviewer private keys MUST be separately managed by distinct principals and their independently enrolled public keys verified out-of-band. No signature, token, Owner approval or review PASS has been invented.

New Supabase project `tytxadzlgeutkzkgaxgv` private `wos_p1_handoff` remains zero authority/receipt/outbox, zero executors, RLS enabled; synthetic lab only. Its two connector requests did not overlap (not real in-project simultaneous lock test). Attempt to establish credentialless dblink sessions failed with `42501 permission denied for dblink_connect_u`; the entire transaction rolled back and no dblink extension was installed. **Do not grant this unsafe function or use password workarounds** for a cosmetic concurrency PASS.

Owner must create the private standalone repo and identify a genuinely separate Reviewer; after it exists, populate reviewed files through GitHub connector, protect main/workflows, and use only an independent security signer. Until then this review package remains non-executable. Issue #160 BLOCKED, PR #202 lock remains held, PRs #202/#258/#259 Draft unmerged. No old Secret DELETE, GitHub App installation, WOS Gate, Production or V3 mutation.
