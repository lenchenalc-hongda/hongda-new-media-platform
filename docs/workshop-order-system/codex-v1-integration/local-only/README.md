# Local-only WOS Supabase E2E

This directory contains disposable local test support only. Never apply these
files to cloud QA or Production.

## Required runtime

- Supabase CLI local stack with PostgreSQL, Auth, PostgREST, Storage and Edge
  Runtime.
- `WOS_ALLOW_LOCAL_SUPABASE=true` passed to the Edge Function runtime.
- Only loopback Supabase URLs in `NEXT_PUBLIC_SUPABASE_URL`.

The Edge runtime receives `http://kong:8000` internally. Its local exception
accepts that exact value only when `WOS_ALLOW_LOCAL_SUPABASE=true`.

## Schema order

1. Minimal `organizations`, `profiles` and CPC tables for the synthetic users.
2. WOS foundation tables.
3. `wos_p7_private_storage.sql`.
4. `wos_p7_atomic_submission.sql`.
5. P7 reader-role policies.
6. P2 operator, Office revision and compatibility functions.
7. `WOS_P2_M2_NONPROD_SQL_NOT_INSTALLED.sql`, applied only to the disposable
   local database.
8. `local_wos_p2_m2_execute.sql` and `local_wos_revision_images.sql`.

## Short-lived gates

After the synthetic order exists, enable the local gates for no more than 15
minutes:

```sql
UPDATE public.wos_qa_p2_execution_gate
SET enabled=true, enabled_until=clock_timestamp()+interval '15 minutes',
    approval_reference='LOCAL_WOS_E2E_<timestamp>', updated_at=clock_timestamp()
WHERE gate_name='OPERATOR_WRITES';

UPDATE public.wos_qa_p2_office_execution_gate
SET enabled=true, enabled_until=clock_timestamp()+interval '15 minutes',
    approval_reference='LOCAL_WOS_E2E_<timestamp>', updated_at=clock_timestamp()
WHERE gate_name='OFFICE_WRITES';

UPDATE public.wos_qa_p2_m2_gate
SET enabled=true, enabled_until=clock_timestamp()+interval '15 minutes',
    approval_reference='LOCAL_WOS_E2E_<timestamp>',
    allowed_order_id='<local synthetic order uuid>',
    allowed_organization_id='<local synthetic organization uuid>',
    updated_at=clock_timestamp()
WHERE gate_name IN ('M2_OPERATOR_WRITES','M2_OFFICE_WRITES');
```

Do not commit keys, JWTs, passwords or real customer data.
