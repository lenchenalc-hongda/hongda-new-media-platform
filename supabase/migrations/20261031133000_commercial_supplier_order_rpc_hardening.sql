-- Harden the supplier order transactional writer on isolated review DB first.
-- This migration is additive because the original versions migration was already
-- applied to hongda-review-dev and must retain an auditable history.
create or replace function public.save_supplier_order_version(
 p_request_id uuid,
 p_order_id uuid,
 p_expected_version integer,
 p_snapshot jsonb,
 p_total_thousandths bigint
) returns table(order_id uuid,version integer,order_no text,saved_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
 v_profile public.profiles%rowtype;
 v_order public.commercial_supplier_orders%rowtype;
 v_version public.commercial_supplier_order_versions%rowtype;
 v_line jsonb;
 v_name text;
 v_no text;
 v_qty text;
 v_price text;
 v_total numeric := 0;
 v_amount bigint;
begin
 select * into v_profile from public.profiles p
  where p.user_id = auth.uid() and p.is_active
    and p.role in ('admin','manager','operator','sales') limit 1;
 if not found then raise exception 'NOT_AUTHORIZED'; end if;
 if p_request_id is null or p_expected_version is null or p_expected_version < 0
    or p_total_thousandths is null or p_total_thousandths < 0
    or p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object'
    or pg_column_size(p_snapshot) > 100000 then
   raise exception 'INVALID_INPUT';
 end if;
 v_name := trim(coalesce(p_snapshot #>> '{order,supplier}',''));
 if v_name = '' or char_length(v_name) > 300
    or jsonb_typeof(p_snapshot->'lines') <> 'array'
    or jsonb_array_length(p_snapshot->'lines') not between 1 and 100
    or coalesce(p_snapshot #>> '{order,deliveryDate}','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 then raise exception 'INVALID_ORDER'; end if;

 -- Recalculate all monetary values in trusted database code. Browser-side
 -- amount is advisory only and never authoritative to the RPC.
 for v_line in select value from jsonb_array_elements(p_snapshot->'lines') loop
   if jsonb_typeof(v_line) <> 'object'
      or jsonb_typeof(v_line->'name') <> 'string'
      or trim(coalesce(v_line->>'name','')) = ''
      or jsonb_typeof(v_line->'unit') <> 'string'
      or trim(coalesce(v_line->>'unit','')) = ''
      or jsonb_typeof(v_line->'quantity') <> 'string'
      or jsonb_typeof(v_line->'price') <> 'string'
   then raise exception 'INVALID_LINE'; end if;
   v_qty := v_line->>'quantity';
   v_price := v_line->>'price';
   if v_qty !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$'
      or v_price !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$'
      or v_qty::numeric <= 0
   then raise exception 'INVALID_LINE'; end if;
   v_total := v_total + round(v_qty::numeric * v_price::numeric,3) * 1000;
   if v_total > 9007199254740991 then raise exception 'AMOUNT_OVERFLOW'; end if;
 end loop;
 v_amount := v_total::bigint;
 if p_total_thousandths <> v_amount then raise exception 'AMOUNT_MISMATCH'; end if;

 -- Serialize retries of the same UUID before checking the immutable version.
 -- Distinct requests to one order are serialized by FOR UPDATE below.
 perform pg_advisory_xact_lock(6195, hashtext(p_request_id::text));
 select * into v_version from public.commercial_supplier_order_versions
   where id = p_request_id;
 if found then
   select * into v_order from public.commercial_supplier_orders
     where id = v_version.order_id;
   if not found or v_order.org_id <> v_profile.org_id
      or v_order.owner_profile_id <> v_profile.id then
     raise exception 'NOT_AUTHORIZED';
   end if;
   if v_version.snapshot <> p_snapshot
      or v_version.total_thousandths <> p_total_thousandths
      or v_version.version <> p_expected_version + 1
      or (p_order_id is null and v_version.version <> 1)
      or (p_order_id is not null and p_order_id <> v_order.id) then
     raise exception 'REQUEST_MISMATCH';
   end if;
   return query select v_version.order_id,v_version.version,v_order.order_no,v_version.saved_at;
   return;
 end if;

 if p_order_id is null then
   if p_expected_version <> 0 then raise exception 'VERSION_CONFLICT'; end if;
   v_no := 'HD-BP-'||to_char(now() at time zone 'Asia/Shanghai','YYMM')
           ||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
   insert into public.commercial_supplier_orders(org_id,owner_profile_id,order_no)
     values (v_profile.org_id,v_profile.id,v_no)
     returning * into v_order;
 else
   select * into v_order from public.commercial_supplier_orders
     where id = p_order_id for update;
   if not found then raise exception 'ORDER_NOT_FOUND'; end if;
   if v_order.org_id <> v_profile.org_id
      or v_order.owner_profile_id <> v_profile.id then
     raise exception 'NOT_AUTHORIZED';
   end if;
   if v_order.latest_version <> p_expected_version then
     raise exception 'VERSION_CONFLICT';
   end if;
 end if;

 insert into public.commercial_supplier_order_versions
   (id,org_id,order_id,version,snapshot,supplier_name,total_thousandths,saved_by_profile_id)
 values
   (p_request_id,v_profile.org_id,v_order.id,p_expected_version+1,
    p_snapshot,v_name,v_amount,v_profile.id)
 returning * into v_version;
 update public.commercial_supplier_orders
   set latest_version=v_version.version where id=v_order.id;
 return query select v_order.id,v_version.version,v_order.order_no,v_version.saved_at;
end $$;

revoke all on function public.save_supplier_order_version(uuid,uuid,integer,jsonb,bigint) from public,anon;
grant execute on function public.save_supplier_order_version(uuid,uuid,integer,jsonb,bigint) to authenticated;

-- Save every version as an immutable business record, including for privileged clients.
create or replace function public.reject_supplier_order_version_mutation()
returns trigger language plpgsql set search_path = ''
as $$
begin
 raise exception 'SUPPLIER_ORDER_VERSION_IMMUTABLE';
end $$;
drop trigger if exists supplier_order_version_immutable on public.commercial_supplier_order_versions;
create trigger supplier_order_version_immutable
 before update or delete on public.commercial_supplier_order_versions
 for each row execute function public.reject_supplier_order_version_mutation();
revoke all on function public.reject_supplier_order_version_mutation() from public,anon,authenticated;
