# WOS V1 RC05: Post-Recovery Reactivation (QA-only, NOT AUTHORIZED)

This path exists because the Hosted QA data-retaining RC02/RC03 Recovery leaves
six V1 Runtime tables with orders, immutable Proofs and receipts. The ordinary
RC03 Compatibility Forward must continue to reject this state. **Do not edit
or re-run that fresh-install Forward.**

## Exact state required before using the new scripts

- QA project `xulmpqaknlwqqculbsek`; QA organization
  `0ff53d93-2b9e-48b9-8113-a4768c39cdd2`.
- Six retained Runtime tables exist and have RLS enabled; `authenticated`
  cannot INSERT into them. Existing rows must not be deleted or overwritten.
- The original four P7 functions and exact legacy Trusted Proof Guard exist.
  V1 functions may exist but are not executable by `authenticated` after
  Recovery; M2 RPC still has its original service-only ACL.
- Three original public Foundation INSERT policies plus four WOS Storage
  policies and non-PNG MIME configuration are restored.
- `wos_v1_rc02_safety` and `wos_v1_rc03_compat` are absent and all write
  gates are OFF. Previous CLOSED grants must never be revived.
- The three existing gate tables must contain exactly the expected rows:
  `M2_OFFICE_WRITES`, `M2_OPERATOR_WRITES`, `OFFICE_WRITES` and
  `OPERATOR_WRITES`, all disabled. A missing table or row is not interpreted
  as OFF.
- `public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)` must have the
  exact audited definition SHA-256, owner `postgres`, `SECURITY DEFINER`, empty
  `search_path`, and ACL
  `{postgres=X/postgres,service_role=X/postgres}`. Service-role EXECUTE is
  required; authenticated and anon EXECUTE are forbidden.
- Before any **new authorization**, pin all current QA counts, retained
  Runtime table fingerprints, SQL SHA-256, original P7 interface definitions,
  the four Auth identities and the permitted new Request/PNG fixtures.

## Approved-code order for a future independently scoped Owner gate

1. `docs/workshop-order-system/qa-fixture/WOS_V1_RC05_POST_RECOVERY_COMPAT_FORWARD_NOT_AUTHORIZED.sql` requires
   `wos_v1.rc05_post_recovery_compat_authorized=yes` and
   `wos_v1.rc03_expected_counts` exact current JSON.
   It backs up original permissions, policies and historical row fingerprints,
   removes precisely three old Foundation INSERT policies and four WOS Storage
   policies, restores the QA-only private insert/select compatibility policies
   and the trusted proof mirror. It does **not CREATE/DROP any retained Runtime
   data table**, and recreates only the reviewed triggers/functions.
2. `docs/workshop-order-system/qa-fixture/WOS_V1_RC05_POST_RECOVERY_RUNTIME_REACTIVATE_NOT_AUTHORIZED.sql` requires
   `wos_v1.rc05_post_recovery_runtime_authorized=yes`,
   `wos_v1.rc05_qa_project=xulmpqaknlwqqculbsek` and the exact
   `wos_v1.rc05_expected_runtime_counts` JSON.
   It verifies retained V1 function definitions and actual P7 originals,
   renames four P7 functions as exact rollback backups and installs only their
   four Runtime replacements. It does not re-create Runtime tables and does not
   GRANT M2 or any V1 business RPC to `authenticated`.
3. Install the unchanged approved RC02 Gate Forward; activate the unchanged
   approved RC03 Activation only after exact Owner gate/closers are armed.
   The M2 ACL V2 GRANT/REVOKE is **separate** and remains NOT_AUTHORIZED here.
4. Data-retaining final Recovery order is RC02 Recovery first and then
   `docs/workshop-order-system/qa-fixture/WOS_V1_RC05_POST_RECOVERY_COMPAT_RECOVERY_NOT_AUTHORIZED.sql`. This Reactivation-specific Recovery supports
   both zero P7 backup functions + four retained Runtime business tables and
   four backups + four retained Runtime tables; partial/unknown state aborts.
   It restores exact P7/Storage/Foundation permissions and keeps all six
   Runtime tables and all existing/new order/Proof/Receipt rows.

The local PG17 runner now executes both Reactivation rollback branches after
its original successful fresh-install/full-runtime/Recovery scenario. It
recreates the retained Hosted QA M2 gate/RPC shape only in the disposable
database, then explicitly asserts the original fresh Compat rejects retained
Runtime, all six retained Runtime table row fingerprints are unchanged before
each PASS marker, original P2 safety fingerprint and three legacy Policy
definitions unchanged, and the exact service-role-only M2 ACL remains
unchanged. Run `bash tests/sql/run-wos-v1-rc02-gate-pg17.sh` on the already
approved Docker PG17 Mac executor and require BOTH:
- `WOS_V1_RC05_POST_RECOVERY_PRE_RUNTIME_ROLLBACK=PASS`
- `WOS_V1_RC05_POST_RECOVERY_REACTIVATION_RECOVERY=PASS`

**Current status:** source patch only. Independent PG17/PostgREST/Storage
execution and exact-HEAD CI, new source review, and an explicit QA-only Owner
install/ACL/E2E authorization are still required. Never execute these SQL files
on Production or on Hosted QA based merely on their presence in the Draft PR.
