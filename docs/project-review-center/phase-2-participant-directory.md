# Phase 2F.1 - Participant Historical Read Foundation

> Status: migration file ready for static review. Not executed.

## Candidate Directory vs Participant Directory

`review_profile_directory` is an active-only candidate directory for member,
owner, and PMO selectors. `review_participant_directory` is a read-only
historical label source for people already referenced by one review.

## Why inactive participants are allowed

Owner, PMO, creator, and member profiles may become inactive after being
linked to a review. The Detail and Editor pages still need a safe display
label. Participant directory returns inactive referenced profiles only, never
an arbitrary inactive profile directory.

## Scope

- Actor must be an active profile derived from `auth.uid()`.
- Target review must belong to the actor's org; otherwise `NOT_FOUND`.
- Referenced profiles come only from `review_cases.owner_id`,
  `review_cases.pmo_id`, `review_cases.created_by`, and
  `review_members.profile_id`.
- Profile lookup is joined on the review's org as a defense in depth.
- No draft-only restriction; completed/archived reviews remain readable.

## Minimum disclosure

Each item returns:

- `profile_id`
- `display_name`
- `role`
- `department`
- `is_active`

Email is never returned and is never used as a display fallback. Relationship
flags are not returned; owner/pmo/member relationships remain in the Detail
response as the source of truth.

## Future Detail API hydration

The Detail API can call this RPC to hydrate display labels for referenced
profiles while preserving the original `owner_id`, `pmo_id`, `created_by`, and
member relationships.
