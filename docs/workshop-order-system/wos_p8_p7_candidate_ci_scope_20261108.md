# WOS P8: disposable P7 candidate rehearsal (nonproduction only)

This document records what Draft PR #224 can and cannot prove.

- Baseline: Draft #222, HEAD `06b0019029973a324623800f4efe8039b68640c9`. Exact ten-table foundation SQL is replayed in a new PostgreSQL 17 service container.
- Candidate delta: three P7 transactional tables, one service-only image-proof metadata table, and one service-only cleanup-lease table. These are **fixtures**, not deployment migrations.
- Role acceptance: synthetic admin/operator allowed, same-org viewer and foreign-org denied; public client cannot insert or update privileged proof or lease state.
- Contract negatives: wrong SHA-256 and a lease exceeding ten minutes must be rejected; cleanup performs no deletion.
- Recovery: drop the five fixture tables and three restrictive gates, assert the ten-table/13-policy Foundation remains.
- Explicit gaps: this is not a true Production-schema clone; does not exercise Supabase Auth, Storage binary APIs, object ownership, Edge image verifier, executable submission RPCs, or real 24-hour cleanup; and does not establish a production rollback plan.
- This branch includes #222 as a superset and targets master **only to exercise the existing `pull_request` CI trigger**. It must not be merged without separate owner authorization; avoid double-merging #222 and #224.
- The CI tests must finish at an exact SHA and logs must be inspected before marking any new P8 gate PASS.

Production database, Storage, credentials, WOS flags, and protected workflows are not modified by this change.
