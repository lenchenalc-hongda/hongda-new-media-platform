# WOS P1 QA independent cloud secret cleanup

- Fixed repository: lenchenalc-hongda/hongda-new-media-platform
- Fixed QA Environment: wos-p1-qa-preflight
- Sole deletable secret: WOS_QA_READONLY_DSN
- Public expiry variable (QA Env): WOS_P1_QA_SECRET_EXPIRES_AT
- Source initially DISABLED, requiring repository variable WOS_P1_CLOUD_REAPER_ENABLED=true.
- No ability to connect to Supabase or dispatch any WOS workflow.

## Owner-only GitHub setup
1. Create dedicated GitHub App (not Agent Control App), install ONLY this repository. Metadata: read; Environments: write; no other permissions and no webhook.
2. Create new GitHub Environment wos-p1-qa-cloud-reaper, restricted to protected master. Do not require manual reviewers for cron.
3. Save App Client ID as environment variable WOS_P1_CLEANUP_APP_CLIENT_ID; App private PEM as environment secret WOS_P1_CLEANUP_APP_PRIVATE_KEY (never send PEM into chat).
4. After the PR is independently audited and merged, enable repository (NOT environment) variable WOS_P1_CLOUD_REAPER_ENABLED=true.
5. Live fixture proof: Mac janitor temporarily STOPPED (restore even on failure); no real WOS QA credential exists. Set old UTC expiry variable in QA Environment, create benign string in EXACT Environment Secret name WOS_QA_READONLY_DSN. Trigger the reviewed cloud workflow on protected master once; require Github-hosted run CLOUD_REAPER_SECRET_REMOVED=PASS and independent Secret GET HTTP 404.
6. Confirm Supabase Sentinel remains active and dedicated role is NOLOGIN, PASSWORD NULL, zero sessions, P1/P2 gates OFF. Do not dispatch real P1 while any of these gates are unknown.

## Technical caveats
- GitHub schedule every 5 min may be delayed, dropped, or disabled. Do not claim a hard physical Secret deletion SLA.
- Supabase QA independent Cron Sentinel is the key DB-credential fail-closed safety layer.
- A missing, expired, malformed or too-distant expiry causes delete (only the exact QA Secret); an active <=35 minute lease preserves it.
- No App key, DSN or DB password is included in this repository, logs or tests.
- Do not enable the cloud reaper without verified independently-issued App token and live benign-fixture test.
