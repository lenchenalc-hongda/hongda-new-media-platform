# WOS V1 Production Operator And Office Pilot

Date: 2026-11-28

Status:
`JAKE_OFFICE_PATH_VERIFIED / OPERATOR_INVITE_BLOCKED_UNTIL_OWNER_INPUT`

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
ROLE=operator
ORGANIZATION_ID=e610c38c-d627-4518-a679-1a67958fb0f8
IS_ACTIVE=true
DIRECT_WOS_TABLE_DML=NONE
```

The Operator receives no new table grants. The existing authenticated RPC
grants enforce active Profile, organization, role, order scope, version CAS,
and receipt checks.

## Invitation And Binding

No operator account is created by this package because no real employee email
has been approved yet.

After the Owner supplies a real mailbox and authorizes the role assignment:

1. Send a standard Supabase Auth invitation to that mailbox.
2. The employee confirms the email and completes the existing login flow.
3. Read the resulting `auth.users.id` and confirm `email_confirmed_at`.
4. Set the five exact session values required by
   `sql/WOS_V1_PRODUCTION_OPERATOR_PROFILE_BIND_NOT_AUTHORIZED.sql`.
5. Apply that SQL once in a transaction.
6. Verify one active Operator Profile in the correct organization.
7. Sign in separately and verify `/workshop-orders/inbox`.
8. Verify Jake remains Sales and is not a Workshop actor.

The binding template rejects:

- unconfirmed or mismatched Auth users;
- a different organization;
- duplicate Profiles;
- existing Admin, Manager, or Sales Profiles;
- Jake's Auth user or email.

## Required Owner Input

Provide one real employee mailbox and explicitly authorize:

```ini
PRODUCTION_OPERATOR_INVITE=YES
EMAIL=<real employee mailbox>
ORGANIZATION_ID=e610c38c-d627-4518-a679-1a67958fb0f8
ROLE=operator
JAKE_ROLE_CHANGE=NO
```

Until then, Jake can start the Office portion of the pilot while operator
invitation and binding remain intentionally blocked.
