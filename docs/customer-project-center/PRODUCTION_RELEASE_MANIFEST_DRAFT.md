# Customer Project Center — Production Release Manifest Draft

Status: planning artifact only. No Production execution is authorized by this file.

Source candidate: `2ec626b3bc0eaf751248db0f449065bad573196a`

## Frozen SQL inventory

1. `supabase/migrations/20261001143000_customer_project_center_phase5a_core_foundation.sql`
   - blob `9a564550836e6a3d57978fe5177321b8ab39b791`
2. `supabase/migrations/20261002024500_customer_project_center_phase5b_mutation_rpcs.sql`
   - blob `e3bf4075532a6d27084b6642cad03ea4fc420404`
3. `supabase/migrations/20261002033500_customer_project_center_phase5d_progress_waiting_event.sql`
   - blob `f7e5f97a6d28bc4f0241d649862c9977f87cf37d`
4. `supabase/migrations/20261002050000_customer_project_center_phase5f_customer_followup.sql`
   - blob `ca48610311bb06d8adc3dc7252398565cb9d5e17`
5. `supabase/migrations/20261002065000_customer_project_center_phase6b_reschedule_rpc.sql`
   - blob `af33ebdf7f8847846243b68e79cd0cbe3135ee48`
6. `supabase/migrations/20261002073000_customer_project_center_phase6c_ai_drafts.sql`
   - blob `31f525111c01f12bf250eaa9a7134975fd7d987a`
7. `supabase/migrations/20261002090000_customer_project_center_phase7a_reports.sql`
   - blob `96ce47615ed013934f70e9b439064e0aecf762c2`
8. `supabase/migrations/20261006140000_customer_project_center_pilot_env_hardening.sql`
   - blob `740b4149717a34b62aef96d3ecfdae1b05d8990c`
9. `supabase/migrations/20261007020000_customer_project_center_project_create_replay_guard.sql`
   - blob `0ab44fb7bf63d4e23d36fcebdb2506d910e4fd4d`

The withdrawn PR #57 migration is excluded.

## Preconditions before any later execution request

- Re-verify the exact target environment and current schema/history.
- Complete a clean-room rehearsal of these nine files in order on an isolated
  non-Production database with compatible legacy dependencies.
- Compare the rehearsal result against the reviewed repository contract.
- Reconcile the existing non-Production migration-history drift only after exact
  live-schema comparison; never infer applied history from object names.
- Verify recovery readiness and a tested restore path.
- Resolve Vercel team/project scope and record only configuration names/targets,
  never secret values.
- Freeze the release operator, rollback owner, stop conditions and evidence
  locations.

## Stop conditions

Stop and return to review on any unexpected schema drift, migration failure,
destructive statement, anonymous CPC access, direct authenticated CPC table
write, authorization regression, lock/timeout risk, or customer/financial
source-of-truth conflict.

## Separate approval gates

Any future rollout must keep these as separate explicit approvals:

1. Production database changes.
2. Production application deployment/configuration.
3. Business-data or broad-user go-live expansion.

This draft does not grant any of those approvals.
