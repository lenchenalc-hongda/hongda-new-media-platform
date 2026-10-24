-- Commercial payment methods: separate approval-gated catalog.
-- This migration contains NO customer, company or personal account values.
-- Production execution is an explicit manual gate.
create table if not exists public.commercial_payment_methods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  method_key text not null check (method_key ~ '^[a-z0-9_]+$'),
  kind text not null check (kind in ('bank','qr')),
  label_zh text not null,
  label_en text not null,
  beneficiary text not null,
  bank_name text not null default '',
  account_no text not null default '',
  notes text not null default '',
  source_cell text not null,
  source_numeric boolean not null default false,
  qr_png bytea,
  qr_sha256 text,
  approved boolean not null default false,
  imported_by uuid not null references public.profiles(id) on delete restrict,
  imported_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  constraint commercial_payment_methods_org_key unique (org_id,method_key),
  constraint commercial_payment_methods_data_check check (
    (kind='bank' and length(account_no)>0 and qr_png is null and qr_sha256 is null)
    or
    (kind='qr' and length(account_no)=0 and qr_png is not null and qr_sha256 ~ '^[a-f0-9]{64}$')
  ),
  constraint commercial_payment_methods_approval_check check (
    (approved and approved_by is not null and approved_at is not null)
    or (not approved and approved_by is null and approved_at is null)
  )
);
create index if not exists commercial_payment_methods_org_approved_idx
on public.commercial_payment_methods(org_id, approved, method_key);
alter table public.commercial_payment_methods enable row level security;
revoke all on public.commercial_payment_methods from anon, authenticated;
grant select, insert, update on public.commercial_payment_methods to authenticated;
-- Only logged-in, active and same-organization profiles.
-- Admin/manager can inspect pending; sales/operator only see approved records.
create policy commercial_payment_methods_read on public.commercial_payment_methods
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid())
      and p.org_id = commercial_payment_methods.org_id
      and p.is_active
      and (
        p.role in ('admin','manager')
        or (commercial_payment_methods.approved and p.role in ('sales','operator'))
      )
  ));
-- Only admins may import/replace pending data. End-users cannot edit an account.
create policy commercial_payment_methods_admin_insert on public.commercial_payment_methods
  for insert to authenticated
  with check (
    not approved and approved_by is null and approved_at is null
    and exists (
      select 1 from public.profiles p
      where p.id = imported_by
        and p.user_id = (select auth.uid())
        and p.org_id = commercial_payment_methods.org_id
        and p.is_active and p.role = 'admin'
    )
  );
create policy commercial_payment_methods_admin_update on public.commercial_payment_methods
  for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid())
      and p.org_id = commercial_payment_methods.org_id
      and p.is_active and p.role = 'admin'
  ))
  with check (
    -- An import MUST reset the row to a pending state. A separate audited
    -- finance approval workflow will be required before production release.
    not approved and approved_by is null and approved_at is null
    and exists (
      select 1 from public.profiles p
      where p.id = imported_by
        and p.user_id = (select auth.uid())
        and p.org_id = commercial_payment_methods.org_id
        and p.is_active and p.role = 'admin'
    )
  );
-- No delete policy: imported payment source versions are not destroyed by clients.
comment on table public.commercial_payment_methods is
  'Finance sensitive: do not commit account numbers or QR binaries to public source. Approval is separate from import.';
