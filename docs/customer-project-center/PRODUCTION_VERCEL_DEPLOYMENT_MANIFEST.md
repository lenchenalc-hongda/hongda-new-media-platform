# Customer Project Center Production Vercel Deployment Manifest

## Status

- Task: `CPC-P12-PRODUCTION-READINESS-PACK-001`
- Documented as of `2026-10-08`
- `VERCEL_PRODUCTION_CHANGED = NO`
- This document is a future Gate B plan, not deployment authorization.

## Exact Recorded Facts

| Item | Recorded value |
| --- | --- |
| Vercel project | `hongda-new-media-platform` |
| Vercel project id | `prj_y1JAqsnwxlIAJANknRQ0JHWsn8tG` |
| Vercel team scope | `team_OZQkJ9a5x0fAirpMzt3vn3Xp` |
| Production domain | `www.hongdaprinting.tech` |
| Current Production deployment | `dpl_9UcXbdGKKftA1UprkwiGpn2U1wgE` |
| Current Production deployment Git SHA | `2ec626b3bc0eaf751248db0f449065bad573196a` |
| Current Production branch | `master` |
| Current Production deployment state | `READY` |
| Production Supabase | `hongda-new-media / amqpvxrurenevniilhtl` |
| Non-Production Supabase | `hongda-review-dev / xulmpqaknlwqqculbsek` |

The current Vercel MCP may return `403` for team-scoped deployment enumeration.
Do not work around that with secrets or unapproved tokens.

## Environment Variable Names

Production environment variable names observed for this project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Only names are documented. Values must not be read into logs, tickets, docs,
screenshots, shell history, or this repository.

Additional build-mode fact:

- `NEXT_PUBLIC_FEATURE_CUSTOMER_PROJECT_CENTER` is currently Preview-only.
- No Production entry is present.

## Production Database Binding

Before Gate B:

1. Confirm `NEXT_PUBLIC_SUPABASE_URL` in the Production scope resolves to the
   `amqpvxrurenevniilhtl` project URL.
2. Confirm the value does not contain `xulmpqaknlwqqculbsek`.
3. Confirm Preview variables remain scoped to `hongda-review-dev` and do not
   leak into Production.
4. Confirm `SUPABASE_SERVICE_ROLE_KEY` is server-only and never exposed through
   `NEXT_PUBLIC_*`.
5. Confirm the application does not read a Production service-role key in a
   client bundle.

The accepted check is based on scope and project identity, not by printing the
secret values.

## Staged Build Strategy Without Live Domain

Gate B must prepare a candidate deployment without assigning
`www.hongdaprinting.tech` first.

1. Build the reviewed release SHA using the repository CI/build process.
2. Deploy the candidate to a non-live Vercel deployment URL.
3. Keep the Production feature flag absent or OFF during build and initial
   smoke checks.
4. Verify the deployment uses the Production Supabase ref, not
   `hongda-review-dev`.
5. Verify server-only environment variables are not bundled into client assets.
6. Verify authentication, route access, authorization gates, and disabled
   feature behavior.
7. Record the candidate deployment id, immutable URL, release SHA, project id,
   team id, and build logs with secret values redacted.
8. Do not alias the live domain until Gate A and Gate B owner approvals exist.

## Gate B Prerequisites

Gate B cannot start until:

- Gate A Production SQL/RLS is complete and evidenced.
- The exact release SHA is recorded and matches the reviewed candidate.
- The Production database baseline and post-migration assertions pass.
- Backup/PITR evidence is recorded.
- Rollback owner and maintenance owner are named.
- The current Production deployment remains available as the rollback target.
- The Production feature flag remains absent or OFF.

## Promotion Procedure

Only after explicit Gate B approval:

1. Reconfirm the candidate deployment id and release SHA.
2. Reconfirm Production Supabase identity.
3. Reconfirm the previous Production deployment id
   `dpl_9UcXbdGKKftA1UprkwiGpn2U1wgE`.
4. Enable `NEXT_PUBLIC_FEATURE_CUSTOMER_PROJECT_CENTER` only if the gate scope
   explicitly includes enabling it.
5. Assign the candidate deployment to `www.hongdaprinting.tech`.
6. Run a bounded internal smoke check before cohort access.
7. Record domain alias, deployment id, release SHA, feature flag state, and
   timestamp.
8. Keep Production data and Production SQL changes within the approved Gate A
   scope.

## Rollback and Containment

If the candidate is unhealthy:

1. Point `www.hongdaprinting.tech` back to
   `dpl_9UcXbdGKKftA1UprkwiGpn2U1wgE` or the last explicitly approved healthy
   production deployment.
2. Disable `NEXT_PUBLIC_FEATURE_CUSTOMER_PROJECT_CENTER`.
3. Preserve deployment and application logs without secret values.
4. Do not reverse the database with destructive SQL.
5. Repair repository SQL and redeploy through a new reviewed candidate.

## Gate B Boundary

Gate B requires separate explicit owner approval. A repository PASS, SQL
manifest PASS, clean-room PASS, or Preview PASS does not authorize:

- Production environment mutation;
- Production feature-flag enablement;
- live-domain assignment;
- Production deployment promotion;
- Production SQL or RLS execution.

`PRODUCTION_VERCEL_DEPLOYMENT_MANIFEST = PASS` means the Vercel plan is complete.
It does not mean Vercel Production was changed.
