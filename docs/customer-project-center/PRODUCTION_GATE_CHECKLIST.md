# Customer Project Center Production Gate Checklist

## Gate A: Production SQL / RLS

### Evidence

- [ ] Candidate master SHA is exactly
  `2ec626b3bc0eaf751248db0f449065bad573196a`.
- [ ] All nine paths, Git blob SHAs, order, and SHA-256 values match
  `PRODUCTION_SQL_EXECUTION_MANIFEST.md`.
- [ ] Static destructive scan passes.
- [ ] Target is `hongda-new-media / amqpvxrurenevniilhtl`.
- [ ] Production has zero CPC migration records and zero `cpc_%` public objects
  before file 1.
- [ ] Legacy dependencies and `profiles(id, org_id)` uniqueness pass.
- [ ] Backup/PITR recovery evidence is recorded.
- [ ] Maintenance, execution, and rollback owners are named.
- [ ] Production feature flag is absent or OFF.
- [ ] Every per-file post-apply assertion passes.
- [ ] Production Gate A is read-only: final RLS, policy, grant, direct-DML,
  migration-history, index-validity, and advisor checks pass.
- [ ] Clean-room rehearsal PASS evidence covers candidate-file writes,
  `cpc_create_project` replay/idempotency, stale-version/concurrency behavior,
  and all synthetic scenarios.
- [ ] No write, RPC replay, or concurrency test was run against Production; any
  Production behavioral write requires a separately approved scope.
- [ ] No customer ownership, finance, order, quotation, or other external
  source-of-truth data changed.

### Owner Approval Phrase

`APPROVE CPC GATE A PRODUCTION SQL/RLS FOR 2ec626b3bc0eaf751248db0f449065bad573196a`

### Execution Owner

Named human database owner or designated DBA. Agent automation may prepare
evidence but must not execute Production SQL.

### Rollback and Stop

Stop on any failed preflight, assertion, migration error, unexpected object,
hash mismatch, destructive statement, RLS bypass, excessive grant, missing
backup evidence, or security finding attributable to CPC. Contain forward-only:
stop writes, disable the feature flag, preserve evidence, repair in repository,
and use provider recovery only under owner direction.

## Gate B: Production Vercel Env / Deployment

### Evidence

- [ ] Gate A is complete and approved.
- [ ] Project is `hongda-new-media-platform` /
  `prj_y1JAqsnwxlIAJANknRQ0JHWsn8tG`.
- [ ] Team is `team_OZQkJ9a5x0fAirpMzt3vn3Xp`.
- [ ] Domain remains `www.hongdaprinting.tech`.
- [ ] Current rollback deployment is
  `dpl_9UcXbdGKKftA1UprkwiGpn2U1wgE`.
- [ ] Production env variable names are reviewed without printing values.
- [ ] Production Supabase resolves to `amqpvxrurenevniilhtl`, never
  `xulmpqaknlwqqculbsek`.
- [ ] Gate B owner authorization is recorded before a Production-scope staged
  build is created.
- [ ] Staged build uses the Production environment without live-domain
  assignment, for example `vercel --prod --skip-domain`; no such command is run
  by this repository task or an automated agent.
- [ ] Preview deployment evidence is not treated as equivalent because
  promotion may rebuild with different variables.
- [ ] Candidate deployment is smoke-tested without live-domain assignment.
- [ ] The global public feature flag remains absent or OFF through Gate B.
- [ ] Release SHA, candidate deployment id, build logs, and redacted smoke
  evidence are recorded.
- [ ] Live-domain promotion has separate owner authorization after staged-build
  evidence is recorded.

### Owner Approval Phrases

`APPROVE CPC GATE B STAGED PRODUCTION BUILD WITHOUT LIVE DOMAIN FOR 2ec626b3bc0eaf751248db0f449065bad573196a`

`APPROVE CPC GATE B LIVE-DOMAIN PROMOTION FOR 2ec626b3bc0eaf751248db0f449065bad573196a AFTER STAGED-BUILD EVIDENCE`

### Execution Owner

Named human Vercel owner. Agent automation must not mutate Production Vercel.

### Rollback and Stop

Stop if the team/project/domain target is ambiguous, Production points to
non-Production Supabase, the candidate SHA differs, the feature flag is enabled
early, a Preview deployment is offered as staged Production evidence, a staged
build lacks prior owner authorization, a secret would be exposed, or smoke
checks fail. Roll back by assigning the last approved deployment and disabling
the flag; do not use destructive database rollback.

## Gate C: Internal Cohort / Go-Live

### Evidence

- [ ] Gate A and Gate B are complete and approved.
- [ ] Approved internal cohort is recorded by role and identity.
- [ ] An independently verified server-side cohort access gate enforces
  deny-by-default access at the request boundary, independent of the client
  bundle and the global public feature flag.
- [ ] Cohort-gate evidence includes the enforced route/RPC/RLS boundary,
  allowed identity/role list, denied authenticated non-member result,
  cross-organization denial, and proof that the flag alone does not authorize
  access.
- [ ] Separate Gate C owner authorization is recorded before route activation.
- [ ] `NEXT_PUBLIC_FEATURE_CUSTOMER_PROJECT_CENTER` remains OFF until the
  server-side gate is verified because the flag is globally visible and is not
  a cohort restriction.
- [ ] If no independently verified server-side cohort gate exists,
  `COHORT_GATE_LIMITATION = NONE` is recorded and broad activation remains
  CLOSED.
- [ ] Auth, route, RLS denial, cross-org denial, stale-version, replay, and
  report immutability checks pass with synthetic or approved internal data.
- [ ] Create, progress, waiting, follow-up, reschedule, AI review, and report
  flows pass.
- [ ] Empty, denied, loading, partial, and mobile states are recorded.
- [ ] Team views contain no employee ranking or activity-score inference.
- [ ] Production logs contain no secret values or real external data leakage.
- [ ] Support owner, incident commander, and rollback owner are named.
- [ ] Stop/rollback drill is recorded.

### Owner Approval Phrase

`APPROVE CPC GATE C INTERNAL COHORT GO-LIVE FOR 2ec626b3bc0eaf751248db0f449065bad573196a`

### Execution Owner

Named human product owner for cohort admission, with the Vercel owner for
feature-flag or deployment changes.

### Rollback and Stop

Stop cohort access on authorization failure, data visibility outside scope,
duplicate formal work, stale-write acceptance, missing audit, report mutation,
secret exposure, unexplained advisor risk, or critical workflow failure.
Disable the feature flag or roll back the deployment, preserve evidence, and
return to PM review.

Enabling the global public feature flag without an independently verified
server-side cohort gate is not cohort activation. If that gate is absent, keep
broad activation CLOSED.


## Repository Verification Evidence

- `BASE_HEAD_SHA = b4c231ce0312d33fd85b96799496902f4d9a93d1`
- `git diff --check` = PASS
- `pnpm exec tsx tests/unit/customer-project-center-production-readiness.test.ts`
  = PASS (`118 passed, 0 failed`)
- `DATABASE_EXECUTED = NO`
- `RLS_EXECUTED = NO`
- `VERCEL_PRODUCTION_CHANGED = NO`
- `PRODUCTION_CHANGED = NO`

This is repository verification evidence only. It does not authorize any
Production action.

## Final Boundary

- `AUTO_PRODUCTION = false`
- `AUTO_MERGE = false`
- A completed checklist is evidence, not authorization.
- Each gate requires its exact owner approval phrase and a named human
  execution owner.
