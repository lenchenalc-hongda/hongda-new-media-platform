# WOS M4-02 Office-Only QA Install Runbook

Status:

`OFFICE_ONLY_INFEASIBLE_FAIL_CLOSED / HISTORICAL_AUDIT_ONLY / INSTALL_NOT_AUTHORIZED`

Target only:

- Supabase QA `xulmpqaknlwqqculbsek`
- Repository `lenchenalc-hongda/hongda-new-media-platform`
- PR #275 exact source HEAD

This runbook does not authorize installation.

Do not execute these phases. Independent review established that the current
hosted Storage `info()` path serializes `updated_at` through a JavaScript Date,
so it cannot reproduce the required six-digit microsecond commitment. The
runbook is retained only to document the safe staged design, rollback order and
the exact point at which the architecture fails.

## Security Invariant

The installer must not:

- create or alter any Storage policy;
- grant `postgres` membership in `supabase_storage_admin`;
- grant SELECT on `storage.objects` to the M4 owner;
- use `service_role` as the business caller;
- change existing P7 Storage RLS;
- grant direct Proof/Receipt SELECT to authenticated;
- open P2, M2 or Legacy Gates;
- execute business writes or deploy Production.

Existing P7 Storage RLS remains the only Storage authorization layer.

## Preinstall Readback

Before installation, require:

1. PR #275 is still Draft and the exact source HEAD matches the Owner
   authorization.
2. Raw Forward/Rollback SHA-256 values match the authorization.
3. QA project identity is exactly `xulmpqaknlwqqculbsek`.
4. PostgreSQL 17.6.
5. No `wos_m4_proof_verifier_owner`.
6. Neither public M4 function exists.
7. No `wos_m4_%` Storage policy exists.
8. P2 Operator/Office and M2 Gate rows are OFF, with no whitelist or TTL.
9. Authenticated has no SELECT on Proof or Receipt tables.
10. Authenticated has no EXECUTE on the M2 action.
11. Existing P7 policies are present:
    - `wos_p7_private_object_select`
    - `wos_p7_storage_reader_roles`
12. The target synthetic QA order is still
    `READINESS_CHECK / v11 / QA-R6`.
13. No conflicting database operation or QA Writer is active.

Stop on any mismatch.

## Phase 1: Database Objects

Artifact:

`WOS_M4_02_READONLY_PROOF_VERIFIER_QA_ONLY_NOT_INSTALLED.sql`

Execution must be one controlled transaction as the reviewed QA installer.

Required result:

- dedicated NOLOGIN owner exists with no excess attributes or memberships;
- snapshot RPC and private caller bridge exist;
- snapshot RPC is owned by the dedicated role, is SECURITY DEFINER and has
  `search_path=''`;
- seven owner-only public read policies exist;
- owner has SELECT on the seven public read tables and no Storage privilege;
- authenticated EXECUTE remains closed;
- no M4 Storage function or policy exists;
- Gate and business data counts are unchanged.

Do not proceed if Phase 1 is partial or cannot prove the closed ACL state.

## Phase 2: Activation

Artifact:

`WOS_M4_02_READONLY_PROOF_VERIFIER_ACTIVATION_NOT_INSTALLED.sql`

Execution must be one controlled transaction only after Phase 1 readback and a
separate Owner approval for the exact function definition and activation file.

Required result:

- authenticated has EXECUTE on the snapshot only;
- anon/PUBLIC and authenticated bridge EXECUTE remain closed;
- direct Proof/Receipt table SELECT remains closed;
- M2 action EXECUTE remains closed;
- no Storage policy was added or changed;
- temporary owner SET membership is absent after commit;
- `canStart=false` is present in the DTO contract.

Activation makes the RPC directly callable through PostgREST regardless of the
Next.js read flag. That is why Phase 2 requires a separate approval.

## Hosted Read-Only Smoke

After activation, first perform direct authenticated RPC readback with a real
same-organization Admin/Manager JWT:

- valid order/version returns the safe DTO;
- Operator, Sales, Viewer, cross-organization and anonymous are denied;
- response includes no path, Storage object ID, signed URL, raw Proof or Receipt.

Then, only under a separate Preview authorization, test the Next.js route and
hosted Storage service using the same caller JWT:

- `info()` returns the expected ID/version/microsecond timestamp;
- raw `download()` bytes reproduce the signed SHA-256;
- second `info()` is unchanged;
- second database snapshot is unchanged;
- any missing/expired/changed evidence fails closed.

Historical expired Proofs may not be presented as a successful live
verification.

## Rollback Order

1. Run `WOS_M4_02_READONLY_PROOF_VERIFIER_DEACTIVATE_NOT_INSTALLED.sql`.
2. Confirm authenticated snapshot EXECUTE is false.
3. Confirm the RPC and bridge remain, but all access is closed.
4. Run
   `WOS_M4_02_READONLY_PROOF_VERIFIER_QA_ONLY_ROLLBACK_NOT_INSTALLED.sql`.
5. Confirm M4 functions, owner policies, grants and role are absent.
6. Confirm existing P7 Storage policies and Storage objects are unchanged.
7. Confirm business row counts/content hashes, table/schema ACLs, Gate states
   and M2 execute state equal the preinstall baseline.

Never drop business tables or delete Proof, Receipt, image, baseline, order or
Storage data during rollback.

## Failure Handling

- Phase 1 failure: transaction rollback; do not retry blindly.
- Phase 2 failure: transaction rollback; confirm authenticated RPC access stays
  closed.
- Storage live read failure: leave the route flag OFF and database Gate state
  unchanged; record the exact SDK/API error.
- Proof expiry or object drift: return `UNVERIFIED`, never a cached success.
- Any ACL widening or Storage-policy change: rollback the M4 objects and stop.
