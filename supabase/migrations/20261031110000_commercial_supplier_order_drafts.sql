-- Isolated supplier production order drafts; deployment to production needs explicit owner approval.
create table if not exists public.commercial_supplier_order_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  owner_profile_id uuid not null references public.profiles(id),
  updated_by_profile_id uuid not null references public.profiles(id),
  draft_json jsonb not null check (jsonb_typeof(draft_json)='object' and pg_column_size(draft_json) < 100000),
  supplier_name text not null default '',
  revision bigint not null default 1 check (revision>0),
  status text not null default 'active' check (status in ('active','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists commercial_supplier_order_drafts_recent
on public.commercial_supplier_order_drafts(org_id,owner_profile_id,updated_at desc);
alter table public.commercial_supplier_order_drafts enable row level security;
revoke all on public.commercial_supplier_order_drafts from anon,authenticated;
grant select,insert,update on public.commercial_supplier_order_drafts to authenticated;
create policy supplier_drafts_select on public.commercial_supplier_order_drafts for select to authenticated using (
 exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.is_active
 and p.org_id=commercial_supplier_order_drafts.org_id
 and (p.id=commercial_supplier_order_drafts.owner_profile_id or p.role in ('admin','manager')))
);
create policy supplier_drafts_insert on public.commercial_supplier_order_drafts for insert to authenticated with check (
 revision=1 and status='active' and
 exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.is_active
 and p.role in ('admin','manager','operator','sales') and p.org_id=commercial_supplier_order_drafts.org_id
 and p.id=commercial_supplier_order_drafts.owner_profile_id and p.id=commercial_supplier_order_drafts.updated_by_profile_id)
);
create policy supplier_drafts_update on public.commercial_supplier_order_drafts for update to authenticated using (
 status='active' and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.is_active
 and p.org_id=commercial_supplier_order_drafts.org_id and p.id=commercial_supplier_order_drafts.owner_profile_id)
) with check (
 status in ('active','deleted') and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.is_active
 and p.org_id=commercial_supplier_order_drafts.org_id and p.id=commercial_supplier_order_drafts.owner_profile_id
 and p.id=commercial_supplier_order_drafts.updated_by_profile_id)
);
