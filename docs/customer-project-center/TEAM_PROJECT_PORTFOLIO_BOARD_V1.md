# Team Project Portfolio Board V1

Task: `CPC-P17-TEAM-PROJECT-PORTFOLIO-001`

## Purpose

Section 4 of `/customer-projects/team` is a manager/admin, read-only
cross-reference between people and projects. It answers both:

- Which projects does this person own?
- Who owns this project, and which linked work is currently assigned?

It does not rank employees, score performance, estimate progress, infer an SLA,
extend overdue work, or treat task quantity as achievement.

## Snapshot contract

`buildTeamBoardSnapshot()` adds `projectPortfolio` to the existing
`readTeamBoardSnapshot()` response. No server read, query, route, API, SQL,
migration, RLS policy, auth rule, environment value, or secret changes are
required.

The projection uses only rows already fetched by `readTeamBoardSnapshot()`:

- `cpc_projects`: identity, customer reference, owner, lifecycle, stage,
  priority, risk, waiting/check, and update time.
- `cpc_work_items`: exact `project_id`, type, title, status, assignee, due time,
  priority, and blocker fields.
- `profiles`: identity, department, role, and active state.
- `cpc_customer_references`: customer display label.

All rows are same-organization because the existing read applies the resolved
profile organization and RLS. The projection also filters by the snapshot
organization and fails closed on cross-organization identifiers.

## Project contract

`projectPortfolio.projects` contains exactly one row per real project. Work
items are linked only when `cpc_work_items.project_id` equals the project id.
A customer-reference-only work item is not a project work item.

Each row exposes:

- real project id/title and customer label;
- owner resolved only through `cpc_projects.owner_profile_id`;
- explicit owner state: `active`, `inactive`, or `missing_profile`;
- stage, lifecycle, priority, risk, waiting-on, next-check time, and update time;
- open linked work count;
- linked open blocked and overdue counts;
- linked current work, including each task's actual assignee and assignee state;
- one `NEXT_ACTION` selection, or an explicit `missing` state.

Multiple work items never create duplicate project rows. Tasks assigned to
another person are collaboration facts; they do not replace the project owner.

`NEXT_ACTION` is selected from linked open work by earliest due time, then
priority, then id. A missing due time is explicit and remains `no_due`; an
unparseable due value is marked unknown. Blocked status is shown separately and
does not move the due time.

Inactive profiles and owner ids without an available same-organization profile
remain visible under the `未知或不可用负责人` person group. They are never
reassigned to an administrator or another active employee.

## Person and filter contract

`projectPortfolio.people` contains active same-organization team profiles,
including members with zero projects. The reverse owner mapping is based only
on the project owner id.

`selectTeamProjectPortfolioView()` provides deterministic views used by the
client:

- default tab: By person;
- alternate tab: By project;
- employee filter: all, an active team member, or the unavailable-owner group;
- lifecycle filter: all, active (default), paused, won, lost, or cancelled;
- optional risk filter: all, low, medium, high, or unmarked;
- text search over owner, project, and customer names.

The By person view shows compact department/role context and current project and
work counts. The By project view renders real project links to
`/customer-projects/projects/{id}`. Empty filter results explain how to recover;
a member with no matching project stays represented except when an explicit
search or employee filter excludes that member.

## Existing behavior preserved

- Server-side manager/admin role gating remains unchanged.
- Section order and IDs remain unchanged.
- Management decision and customer commitment exception semantics remain
  unchanged.
- Project exception section remains unchanged except that its existing
  `NEXT_ACTION` lookup now uses the same deterministic ordering when more than
  one open next action exists.
- The prior seven per-person support counters remain available in a collapsed
  secondary area.
- External finance, order, quote, payment, SLA, stale, progress, and performance
  facts remain unknown unless already represented by an approved CPC fact.

## Acceptance

The existing CI-wired Phase 9 test must cover:

- exact active/paused project names and deterministic grouping;
- reverse owner-to-project and project-to-owner mapping;
- cross-organization isolation for projects and work;
- linked task assigned to a collaborator while the owner stays unchanged;
- multiple work items counted on one project row;
- an active team member with zero projects;
- inactive and profile-missing owner visibility without admin attribution;
- explicit no-due work and deterministic `NEXT_ACTION` selection;
- paused lifecycle filter availability;
- unchanged manager/admin read-only access and existing exception projections.

Required verification:

```sh
pnpm exec tsx tests/unit/customer-project-center-phase9-team-board.test.ts
pnpm typecheck
pnpm build
bash scripts/audit-bundle-secrets.sh
pnpm next start -p 3000
```

The smoke check consumes the already-built application at the repository's
existing route set. This task does not claim CI success when a required command
was not executed.
