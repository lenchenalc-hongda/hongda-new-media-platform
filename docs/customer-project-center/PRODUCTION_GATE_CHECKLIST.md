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
- [ ] Final RLS, policy, grant, direct-DML, replay, and advisor checks pass.
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
- [ ] Candidate deployment is built and smoke-tested without live-domain
  assignment.
- [ ] Feature flag remains absent or OFF until the explicitly approved step.
- [ ] Release SHA, candidate deployment id, build logs, and redacted smoke
  evidence are recorded.

### Owner Approval Phrase

`APPROVE CPC GATE B PRODUCTION VERCEL ENV/DEPLOYMENT FOR 2ec626b3bc0eaf751248db0f449065bad573196a`

### Execution Owner

Named human Vercel owner. Agent automation must not mutate Production Vercel.

### Rollback and Stop

Stop if the team/project/domain target is ambiguous, Production points to
non-Production Supabase, the candidate SHA differs, the feature flag is enabled
early, a secret would be exposed, or smoke checks fail. Roll back by assigning
the last approved deployment and disabling the flag; do not use destructive
database rollback.

## Gate C: Internal Cohort / Go-Live

### Evidence

- [ ] Gate A and Gate B are complete and approved.
- [ ] Approved internal cohort is recorded by role and identity.
- [ ] Production feature flag is enabled only for the approved scope.
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

## Final Boundary

- `AUTO_PRODUCTION = false`
- `AUTO_MERGE = false`
- A completed checklist is evidence, not authorization.
- Each gate requires its exact owner approval phrase and a named human
  execution owner.
