-- Supplier external production orders. Review DB only until approved production rollout.
-- Immutable snapshot revisions, with the active latest revision tracked separately.
create table if not exists public.commercial_supplier_orders (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references public.organizations(id),
 owner_profile_id uuid not null references public.profiles(id),
 order_no text not null,
 latest_version integer not null default 0 check (latest_version >= 0),
 created_at timestamptz not null default now(),
 unique(org_id,order_no),
 unique(id,org_id)
);
create index if not exists commercial_supplier_orders_owner_idx
 on public.commercial_supplier_orders(org_id,owner_profile_id,created_at desc);

create table if not exists public.commercial_supplier_order_versions (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references public.organizations(id),
 order_id uuid not null,
 version integer not null check(version>0),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and pg_column_size(snapshot)<100000),
 supplier_name text not null,
 total_thousandths bigint not null check(total_thousandths>=0),
 saved_by_profile_id uuid not null references public.profiles(id),
 saved_at timestamptz not null default now(),
 foreign key(order_id,org_id) references public.commercial_supplier_orders(id,org_id),
 unique(order_id,version)
);
create index if not exists commercial_supplier_order_versions_recent
 on public.commercial_supplier_order_versions(org_id,order_id,version desc);

alter table public.commercial_supplier_orders enable row level security;
alter table public.commercial_supplier_order_versions enable row level security;
revoke all on public.commercial_supplier_orders from public, anon, authenticated;
revoke all on public.commercial_supplier_order_versions from public, anon, authenticated;
grant select on public.commercial_supplier_orders to authenticated;
grant select on public.commercial_supplier_order_versions to authenticated;
create policy supplier_orders_read on public.commercial_supplier_orders
 for select to authenticated using (
  exists(select 1 from public.profiles p where p.user_id=(select auth.uid())
   and p.is_active and p.org_id=commercial_supplier_orders.org_id
   and (p.id=commercial_supplier_orders.owner_profile_id or p.role in ('admin','manager')))
 );
create policy supplier_order_versions_read on public.commercial_supplier_order_versions
 for select to authenticated using (
  exists(select 1 from public.commercial_supplier_orders o
   where o.id=commercial_supplier_order_versions.order_id and o.org_id=commercial_supplier_order_versions.org_id)
 );

-- All writes are transactional in a privileged security-definer RPC. No direct client inserts.
create or replace function public.save_supplier_order_version(
 p_request_id uuid,
 p_order_id uuid,
 p_expected_version integer,
 p_snapshot jsonb,
 p_total_thousandths bigint
) returns table(order_id uuid,version integer,order_no text,saved_at timestamptz)
language plpgsql security definer set search_path=public
as $$
declare
 v_profile public.profiles%rowtype;
 v_order public.commercial_supplier_orders%rowtype;
 v_version public.commercial_supplier_order_versions%rowtype;
 v_name text;
 v_no text;
begin
 select * into v_profile from public.profiles p
 where p.user_id=auth.uid() and p.is_active and p.role in ('admin','manager','operator','sales')
 limit 1;
 if not found then raise exception 'NOT_AUTHORIZED'; end if;
 if p_expected_version<0 or p_expected_version is null or p_total_thousandths is null or p_total_thousandths<0
    or jsonb_typeof(p_snapshot)<>'object' or pg_column_size(p_snapshot)>100000 then raise exception 'INVALID_INPUT'; end if;
 v_name=left(trim(coalesce(p_snapshot #>> '{order,supplier}','')),300);
 if v_name='' or jsonb_typeof(p_snapshot->'lines')<>'array' or jsonb_array_length(p_snapshot->'lines')=0 then raise exception 'INVALID_ORDER'; end if;
 -- A replay of the same idempotency request must return the exact previously written version.
 select * into v_version from public.commercial_supplier_order_versions
 where id=p_request_id;
 if found then
   select * into v_order from public.commercial_supplier_orders where id=v_version.order_id;
   if v_order.org_id<>v_profile.org_id or v_order.owner_profile_id<>v_profile.id then raise exception 'NOT_AUTHORIZED'; end if;
   return query select v_version.order_id,v_version.version,v_order.order_no,v_version.saved_at;
   return;
 end if;
 if p_order_id is null then
   if p_expected_version<>0 then raise exception 'VERSION_CONFLICT'; end if;
   v_no='HD-BP-'||to_char(now() at time zone 'Asia/Shanghai','YYMM')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
   insert into public.commercial_supplier_orders(org_id,owner_profile_id,order_no)
   values(v_profile.org_id,v_profile.id,v_no) returning * into v_order;
 else
   select * into v_order from public.commercial_supplier_orders
   where id=p_order_id for update;
   if not found then raise exception 'ORDER_NOT_FOUND'; end if;
   if v_order.org_id<>v_profile.org_id or v_order.owner_profile_id<>v_profile.id then raise exception 'NOT_AUTHORIZED'; end if;
   if v_order.latest_version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
 end if;
 insert into public.commercial_supplier_order_versions(id,org_id,order_id,version,snapshot,supplier_name,total_thousandths,saved_by_profile_id)
 values(p_request_id,v_profile.org_id,v_order.id,p_expected_version+1,p_snapshot,v_name,p_total_thousandths,v_profile.id)
 returning * into v_version;
 update public.commercial_supplier_orders set latest_version=v_version.version where id=v_order.id;
 return query select v_order.id,v_version.version,v_order.order_no,v_version.saved_at;
end $$;
revoke all on function public.save_supplier_order_version(uuid,uuid,integer,jsonb,bigint) from public,anon;
grant execute on function public.save_supplier_order_version(uuid,uuid,integer,jsonb,bigint) to authenticated;
