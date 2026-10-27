-- Phase A / Issue #153: editable, login-scoped drafts.
-- No account numbers or payment QR payloads are persisted here.
-- Keep immutable quotation archive in a separate future table.
create table if not exists public.commercial_quotation_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  owner_profile_id uuid not null references public.profiles(id),
  draft_json jsonb not null,
  document_no text not null default '',
  buyer_name text not null default '',
  project_name text not null default '',
  language text not null check (language in ('zh','en')),
  revision bigint not null default 1 check (revision > 0),
  status text not null default 'active' check (status in ('active','deleted','archived')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_by_profile_id uuid not null references public.profiles(id),
  constraint quotation_drafts_snapshot_object check (jsonb_typeof(draft_json) = 'object')
);
create index if not exists commercial_quotation_drafts_owner_recent
on public.commercial_quotation_drafts (org_id,owner_profile_id,updated_at desc);
alter table public.commercial_quotation_drafts enable row level security;
revoke all on public.commercial_quotation_drafts from anon,authenticated;
grant select,insert,update on public.commercial_quotation_drafts to authenticated;
-- Every authenticated operation requires the user's real active profile.
create policy quotation_drafts_select on public.commercial_quotation_drafts
for select to authenticated using (
  exists (select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.is_active
  and p.org_id=commercial_quotation_drafts.org_id
  and (p.id=commercial_quotation_drafts.owner_profile_id or p.role in ('admin','manager')))
);
create policy quotation_drafts_insert on public.commercial_quotation_drafts
for insert to authenticated with check (
  status='active' and revision=1 and
  exists (select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
    and p.id=commercial_quotation_drafts.owner_profile_id
    and p.id=commercial_quotation_drafts.updated_by_profile_id
    and p.org_id=commercial_quotation_drafts.org_id
    and p.role in ('admin','manager','operator','sales'))
);
create policy quotation_drafts_update on public.commercial_quotation_drafts
for update to authenticated using (
  status='active' and
  exists (select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
    and p.org_id=commercial_quotation_drafts.org_id
    and p.id=commercial_quotation_drafts.owner_profile_id
    and p.role in ('admin','manager','operator','sales'))
) with check (
  status in ('active','deleted') and
  exists (select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
    and p.org_id=commercial_quotation_drafts.org_id
    and p.id=commercial_quotation_drafts.owner_profile_id
    and p.id=commercial_quotation_drafts.updated_by_profile_id
    and p.role in ('admin','manager','operator','sales'))
);
-- RLS prevents cross-organization reads/updates and other users' mutations.
-- API separately enforces optimistic revision compare-and-swap.
