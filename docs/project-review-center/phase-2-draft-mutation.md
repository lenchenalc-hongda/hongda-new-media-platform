# Phase 2B - Draft Mutation Migration 2 Design

> Status: static design + SQL file ready for review. Not executed.

## Scope

Migration 2 adds:

- `review_audit_logs`
- `review_timeline_events`
- Six controlled mutation RPCs
- Review creation audit/timeline trigger
- Direct child DML policy removal and privilege hardening

It does not change Migration 1 files, does not backfill existing rows, and
does not create data.

## Final permission model

- `admin` / `manager`: can edit any draft in their org, manage members, and
  assign owner/PMO.
- `owner` (non-viewer): can edit public fields, type details, and members for
  reviews they own.
- `pmo` (non-viewer): same draft editing and member management permission as
  owner for reviews where they are PMO.
- `created_by` is provenance/audit only and is **not** an authorization
  condition for later edits.
- Ordinary `review_members` do not automatically receive edit permission.
- `viewer` is read-only even if they appear as created_by/owner/pmo/member.

## Assignment rules

`review_set_draft_assignments` is admin/manager only. Owner must be active,
same org, and non-viewer. PMO may be null; when non-null it must also be
active, same org, and non-viewer. The client never supplies actor or org.

## A/B/C field matrix

- COMMON: `additional_notes`; `review_id`, `org_id`, `review_type`,
  `created_by`, timestamps are system/derived.
- A_ONLY: `pre_production_stage`, `problem_found_stage`, `order_loss_reason`,
  `customer_trust_impact`, `customer_notified`.
- B_ONLY: `abnormal_phase`, `abnormal_phenomenon`, `defect_rate`,
  `defect_items`, `delivery_impact`, `onsite_records`.
- C_ONLY: `frontend_stage`, `production_stage`, `root_cause_summary`,
  `responsibility`, `improvement_advice`.
- A = COMMON + A_ONLY; B = COMMON + B_ONLY; C = COMMON + A_ONLY + B_ONLY +
  C_ONLY.

Existing `chk_review_type_details_a_scope` / `b_scope` are compatible with
this matrix. The RPC derives org and review_type from `review_cases`.

## RPC contract

Every public RPC returns:

```json
{
  "ok": true,
  "code": "OK",
  "message": "success",
  "data": {}
}
```

Business error codes: `NOT_FOUND`, `FORBIDDEN`, `DRAFT_ONLY`,
`VERSION_CONFLICT`, `INVALID_PATCH`, `INVALID_MEMBER`, `TYPE_MISMATCH`,
`UNIQUE_CONFLICT`.

Unexpected database errors are not converted into business errors and will
roll back the whole mutation.

## Mutation order

1. Resolve active profile from `auth.uid()`.
2. Load review by actor org with `FOR UPDATE`.
3. Check `NOT_FOUND`, `DRAFT_ONLY`, permission, and `expected_version`.
4. Validate input.
5. Detect no-op.
6. Mutate, increment version, write audit and timeline, return.

True no-ops still validate auth, org, status, permission, and
`expected_version`, but do not bump version or write audit/timeline.

## RPCs

- `review_update_draft_public(uuid, integer, jsonb)`
- `review_upsert_type_details(uuid, integer, jsonb)`
- `review_add_member(uuid, integer, uuid, text)`
- `review_remove_member(uuid, integer, uuid)`
- `review_set_primary_member(uuid, integer, uuid)`
- `review_set_draft_assignments(uuid, integer, uuid, uuid default null)`

`review_update_draft_public` and `review_upsert_type_details` reject unknown
keys with `INVALID_PATCH`. `review_type` is locked after a
`review_type_details` row exists.

## Empty details first-save semantics

When `review_type_details` does not exist yet:

- `p_patch = {}` is a no-op: no details row is created, version is not bumped,
  no audit/timeline is written, and `review_type` is not locked.
- A patch whose fields all normalize to null/empty is also a no-op.
- The RPC returns `type_details: null` with the current version.
- `additional_notes: null` normalizes to `{}`.
- `additional_notes` must be a JSON object; non-object values return
  `INVALID_PATCH`.

This prevents an empty first save from accidentally locking the review type.

## Audit vs timeline

- `review_audit_logs` is management-facing and selectable only by active
  admin/manager in the same org.
- `review_timeline_events` is business-facing and selectable by active
  profiles in the same org.
- No authenticated direct DML is allowed on either table.

## Direct DML removal

The following policies are dropped:

- `review_type_details_insert_draft`
- `review_type_details_delete_draft`
- `review_members_insert_draft`
- `review_members_delete_draft`

`review_cases` keeps authenticated SELECT + INSERT for the Phase 1 create
API. All other direct child DML is revoked.

## Pre-audit legacy

`REV-2026-000001` is not backfilled. It remains a pre-audit QA legacy review.
The creation trigger only applies to future inserts.

## Migration 2 Compatibility Hardening

Dev live RPC verification exposed `42883` because
`review_upsert_type_details` used `jsonb_object_length(jsonb)`, which is not
available in the target database.

The executed Migration 2 is immutable and is not modified. A new migration
`20260818_review_center_phase2_jsonb_compat_hardening.sql` replaces only
`review_upsert_type_details` with the same security, locking, versioning,
audit, timeline, and result contract, but uses direct JSONB empty-object
semantics:

```sql
jsonb_typeof(v_additional_notes) = 'object'
AND v_additional_notes <> '{}'::jsonb
```

The empty-details first-save no-op behavior, existing-details clear behavior,
`additional_notes` object validation, A/B/C matrix, and review type lock are
preserved. The full RPC live suite must be rerun after this migration is
executed on Development.

## Profile directory gap

Current profiles RLS allows users to read their own profile, managers to read
org profiles, and admins to manage all profiles. Ordinary operator/sales/viewer
accounts cannot read a full org profile directory. This is a deliberate gap;
Migration 2 does not loosen profiles RLS. A separate minimal directory access
design is required before member pickers for non-admin/manager roles.

## API validation contract

Next.js API routes must validate UUID parameters and `expected_version` with
Zod before calling RPCs. `expected_version` must be a positive integer and
must never be omitted. RPCs still perform the authoritative non-null
`expected_version` check and reject invalid UUID/type literals at the database
or API boundary.

## Live test cleanup order

After Migration 2, each created review also creates audit and timeline rows.
Live test cleanup must delete in this order:

1. `review_audit_logs`
2. `review_timeline_events`
3. `review_members`
4. `review_type_details`
5. `review_dict_items`
6. `review_cases`

Missing Migration 2 tables are tolerated only when the error is a missing
relation (`42P01`); other cleanup errors still fail the test.
