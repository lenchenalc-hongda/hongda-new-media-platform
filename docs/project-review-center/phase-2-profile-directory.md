# Phase 2E.1 - Profile Directory Database Foundation

> Status: migration file ready for static review. Not executed.

## Why not relax profiles RLS

Current profiles RLS intentionally limits most roles to reading only their own
profile. Relaxing it globally would expose organization profile data beyond
Review Center needs and would be difficult to scope by purpose. The directory
is implemented as a controlled SECURITY DEFINER RPC instead.

## Why not service role

Service role bypasses RLS and would put broad profile access inside business
API code. The Review Center convention is authenticated Supabase clients plus
database-enforced authorization, so service role is not used.

## Purpose rules

- `MEMBER`: returns all active same-org profiles, including `viewer`.
- `ASSIGNMENT`: returns active same-org profiles with `role != 'viewer'`.

`viewer` can be a review member, but becoming a member does not grant mutation
permission. `viewer` cannot be owner or PMO.

## Tenant scope

The function derives actor org from `auth.uid()` -> active profile. Client
cannot pass org, actor, role, or department filters. Only active same-org
profiles are returned.

## Minimum disclosure

Each item returns:

- `profile_id`
- `display_name`
- `role`
- `department`
- `assignment_eligible`

`display_name` is derived from trimmed `full_name`; when missing it uses the
fixed safe fallback `未命名用户`. Email is never returned and is never used as
an email or display fallback.

## Future API

The planned route is:

```text
GET /api/review-center/profile-directory?purpose=MEMBER|ASSIGNMENT
```

Purpose will be enum-validated. Detail hydration is not implemented yet.
