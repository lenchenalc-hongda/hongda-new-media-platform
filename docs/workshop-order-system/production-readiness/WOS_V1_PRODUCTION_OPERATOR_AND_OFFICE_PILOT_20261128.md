# WOS V1 Production Operator And Office Pilot

Date: 2026-11-28

Status:
`JAKE_OFFICE_PATH_VERIFIED / INDEPENDENT_OPERATOR_BOUND_AND_VERIFIED`

## Jake Office Path

Jake Wu remains an active Sales profile in the Production organization. No
role, Auth user, email, organization, password, or Profile change is required.

Verified Production identity:

```ini
EMAIL=jake.wu@hongda.cn
PROFILE_ID=ab1be2f9-abaf-4525-81ff-0f4faebe0212
AUTH_USER_ID=9dabd373-ada3-48ca-a970-ee968f7f005e
ROLE=sales
ORGANIZATION_ID=e610c38c-d627-4518-a679-1a67958fb0f8
ACTIVE=true
EMAIL_CONFIRMED=true
```

Allowed Office path:

1. Sign in at `https://www.hongdaprinting.tech/login`.
2. Open `/workshop-orders`.
3. Open `/workshop-orders/production/new`.
4. Select a CPC customer and active project in the same organization.
5. Complete the Production order fields.
6. Upload the four current PNG categories.
7. Submit the order and retain the displayed Order ID and database receipt.
8. When Workshop returns the order, open the returned order in the same page.
9. Change only the permitted correction fields.
10. Validate and register the four new-version images.
11. Resubmit for Workshop review.

Sales boundaries:

- Jake can see orders he created or owns as `sales_owner_profile_id`.
- Jake cannot perform Workshop accept, return, review, M2 material, Baseline,
  signoff, or Manager release actions.
- Workshop actions require an active `operator`, `manager`, or `admin` Profile.
- Jake must not be promoted to Operator for this pilot.

## Operator Minimum Profile

An independent Workshop operator must be a separate confirmed Auth user in the
same Production organization with exactly one active Profile:

```ini
EMAIL=dg.operator@hongda.cn
AUTH_USER_ID=2a8ccb8c-38e2-4130-8a80-3d889d196672
PROFILE_ID=bce5fe27-18a9-43d4-8fed-2251f3ab4174
ROLE=operator
ORGANIZATION_ID=e610c38c-d627-4518-a679-1a67958fb0f8
IS_ACTIVE=true
DIRECT_WOS_TABLE_DML=NONE
```

The Operator receives no new table grants. The existing authenticated RPC
grants enforce active Profile, organization, role, order scope, version CAS,
and receipt checks.

The Auth user was already email-confirmed and had completed a real login before
this verification. No duplicate invitation, password reset, Auth user creation,
or Profile overwrite was performed.

## Binding Verification

Verified:

1. Auth email is confirmed.
2. The user has one Profile, in the correct Production organization.
3. The Profile is active and has role `operator`.
4. Jake Wu remains an active Sales profile.
5. The authenticated Operator can read the organization's Production order.
6. Authenticated EXECUTE is present only for the reviewed Plan A operator RPCs.
7. Production M2 function count remains zero.
8. No direct WOS table DML was granted.

The binding template rejects:

- unconfirmed or mismatched Auth users;
- a different organization;
- duplicate Profiles;
- existing Admin, Manager, or Sales Profiles;
- Jake's Auth user or email.

## Next Decision

The Office and Workshop identities are now independent. The next Owner decision
is a separately bounded Production M2 UAT window, which must include a fresh
backup decision, M2 migration installation in inactive state, one-time RPC
activation, a real three-role business flow, and data-retaining deactivation.

```ini
PRODUCTION_OPERATOR_INVITE=COMPLETED_OR_EXISTING
OWNER_PRODUCTION_M2_UAT_GATE=NOT_AUTHORIZED
```
