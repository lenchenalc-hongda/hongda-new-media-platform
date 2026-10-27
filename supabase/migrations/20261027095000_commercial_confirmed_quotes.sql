-- Confirmed quotation data archives. No PDF originals.
-- Independent from editable drafts; each successful confirmation inserts an immutable version.
create table public.commercial_confirmed_quotes (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references public.organizations(id),
 owner_profile_id uuid not null references public.profiles(id),
 document_no text not null check (length(btrim(document_no)) between 1 and 80),
 latest_version int not null default 0,
 created_at timestamptz not null default now(),
 unique(org_id, document_no),
 unique(id,org_id)
);
create table public.commercial_confirmed_quote_versions (
 id uuid primary key default gen_random_uuid(),
 quote_id uuid not null,
 org_id uuid not null,
 version int not null check(version>=1),
 request_id uuid not null,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 amount_thousandths bigint not null check(amount_thousandths>=0),
 currency text not null check(currency in('CNY','USD','EUR')),
 buyer_name text not null,
 project_name text not null default '',
 confirmed_by_profile_id uuid not null references public.profiles(id),
 confirmed_at timestamptz not null default now(),
 unique(quote_id, version),
 unique(org_id,request_id),
 foreign key(quote_id,org_id) references public.commercial_confirmed_quotes(id,org_id)
);
create index confirmed_quote_recent on public.commercial_confirmed_quote_versions(org_id,confirmed_at desc);
alter table public.commercial_confirmed_quotes enable row level security;
alter table public.commercial_confirmed_quote_versions enable row level security;
revoke all on public.commercial_confirmed_quotes from public,anon,authenticated;
revoke all on public.commercial_confirmed_quote_versions from public,anon,authenticated;
grant select on public.commercial_confirmed_quotes to authenticated;
grant select on public.commercial_confirmed_quote_versions to authenticated;
create policy quote_read on public.commercial_confirmed_quotes for select to authenticated using (
 exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.org_id=org_id
 and p.is_active and (p.id=owner_profile_id or p.role in('admin','manager')))
);
create policy quote_version_read on public.commercial_confirmed_quote_versions for select to authenticated using (
 exists(select 1 from public.commercial_confirmed_quotes q join public.profiles p on p.org_id=q.org_id
 where q.id=quote_id and q.org_id=commercial_confirmed_quote_versions.org_id and
 p.user_id=(select auth.uid()) and p.is_active
 and (p.id=q.owner_profile_id or p.role in('admin','manager')))
);
create schema if not exists commercial_private;
revoke all on schema commercial_private from public,anon;
-- A narrow authenticated RPC atomically allocates versions and prevents lost updates.
create or replace function public.confirm_commercial_quote(
 p_request_id uuid, p_quote_id uuid, p_expected_version int, p_draft_id uuid,
 p_snapshot jsonb, p_amount_thousandths bigint
) returns table(quote_id uuid, version int, version_id uuid, confirmed_at timestamptz)
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_profile public.profiles%rowtype; v_quote public.commercial_confirmed_quotes%rowtype;
 v_no text; v_existing public.commercial_confirmed_quote_versions%rowtype; v_record public.commercial_confirmed_quote_versions%rowtype;
begin
 select * into v_profile from public.profiles where user_id=auth.uid() and is_active
 and role in('admin','manager','operator','sales') limit 1;
 if v_profile.id is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
 if p_request_id is null or p_snapshot is null or jsonb_typeof(p_snapshot)<>'object'
 or p_amount_thousandths is null or p_amount_thousandths<0
 or p_amount_thousandths>9007199254740991 then raise exception 'INVALID_CONFIRMATION'; end if;
 if p_snapshot->>'kind'<>'quotation' or p_snapshot->>'language' not in('zh','en')
 or p_snapshot->>'currency' not in('CNY','USD','EUR') then raise exception 'INVALID_QUOTATION'; end if;
 v_no=btrim(coalesce(p_snapshot->>'documentNo',''));
 if length(v_no) not between 1 and 80 or length(btrim(coalesce(p_snapshot->>'buyerName','')))=0
 then raise exception 'MISSING_FIELDS'; end if;
 -- Avoid double-write on timeout/retry using an organization-scoped idempotency key.
 select * into v_existing from public.commercial_confirmed_quote_versions
 where org_id=v_profile.org_id and request_id=p_request_id;
 if found then
  if not exists(select 1 from public.commercial_confirmed_quotes prior
    where prior.id=v_existing.quote_id and prior.org_id=v_profile.org_id
      and prior.owner_profile_id=v_profile.id)
  then raise exception 'REQUEST_FORBIDDEN' using errcode='42501'; end if;
  if p_quote_id is distinct from v_existing.quote_id and p_quote_id is not null
  then raise exception 'REQUEST_CONFLICT'; end if;
  if p_snapshot is distinct from v_existing.snapshot or
     p_amount_thousandths is distinct from v_existing.amount_thousandths
  then raise exception 'REQUEST_PAYLOAD_CONFLICT'; end if;
  return query select v_existing.quote_id,v_existing.version,v_existing.id,v_existing.confirmed_at; return;
 end if;
 if p_draft_id is not null and not exists(
 select 1 from public.commercial_quotation_drafts d
 where d.id=p_draft_id and d.org_id=v_profile.org_id
 and d.owner_profile_id=v_profile.id and d.status='active')
 then raise exception 'DRAFT_UNAVAILABLE' using errcode='42501'; end if;
 -- Lock per organization/number for parallel initial creates and sequential versions.
 perform pg_advisory_xact_lock(hashtextextended(v_profile.org_id::text||':'||v_no,0));
 if p_quote_id is null then
  if coalesce(p_expected_version,0)<>0 then raise exception 'VERSION_CONFLICT'; end if;
  insert into public.commercial_confirmed_quotes(org_id,owner_profile_id,document_no)
   values(v_profile.org_id,v_profile.id,v_no)
   on conflict(org_id,document_no) do nothing;
  select * into v_quote from public.commercial_confirmed_quotes
   where org_id=v_profile.org_id and document_no=v_no for update;
  if v_quote.latest_version<>0 then raise exception 'VERSION_CONFLICT'; end if;
 else
  select * into v_quote from public.commercial_confirmed_quotes
  where id=p_quote_id and org_id=v_profile.org_id for update;
  if not found or v_quote.owner_profile_id<>v_profile.id then raise exception 'QUOTE_FORBIDDEN' using errcode='42501'; end if;
  if v_quote.document_no<>v_no then raise exception 'NUMBER_MISMATCH'; end if;
  if v_quote.latest_version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
 end if;
 insert into public.commercial_confirmed_quote_versions
 (quote_id,org_id,version,request_id,snapshot,amount_thousandths,currency,buyer_name,project_name,confirmed_by_profile_id)
 values(v_quote.id,v_profile.org_id,v_quote.latest_version+1,p_request_id,p_snapshot,p_amount_thousandths,
  p_snapshot->>'currency',p_snapshot->>'buyerName',coalesce(p_snapshot->>'projectName',''),v_profile.id)
 returning * into v_record;
 update public.commercial_confirmed_quotes set latest_version=v_record.version where id=v_quote.id;
 if p_draft_id is not null then
  update public.commercial_quotation_drafts set status='archived',revision=revision+1,updated_at=now(),updated_by_profile_id=v_profile.id
  where id=p_draft_id and org_id=v_profile.org_id and owner_profile_id=v_profile.id and status='active';
 end if;
 return query select v_record.quote_id,v_record.version,v_record.id,v_record.confirmed_at;
end $$;
revoke all on function public.confirm_commercial_quote(uuid,uuid,int,uuid,jsonb,bigint) from public,anon;
grant execute on function public.confirm_commercial_quote(uuid,uuid,int,uuid,jsonb,bigint) to authenticated;
